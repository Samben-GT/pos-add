// Overnight cataloguing: looks at the photos of each new product and fills in name, brand, size,
// category, type and the barcode number when one is readable. Called by pg_cron every few minutes at night.
// Needs the secret ANTHROPIC_API_KEY. Auth: header x-cron-key must match private.settings 'cron_key'.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MODEL = Deno.env.get('CATALOGUE_MODEL') || 'claude-haiku-5-5';
const BATCH = 8;          // products per call; cron calls again every few minutes
const CATEGORIES = ['Biscuits', 'Chips & Snacks', 'Chocolates', 'Ice cream', 'Beverages', 'Dairy', 'Groceries', 'Personal care', 'Household', 'Other'];

const PROMPT = `These photos show one product from a small general store in Tamil Nadu, India (front, back or sides of the same item).
Reply with JSON only, no other text:
{"name": "...", "brand": "...", "size": "...", "category": "...", "type": "...", "barcode": "...", "note": "..."}
- name: short shop-style product name with brand and variant, e.g. "Aashirvaad Atta 1kg", "Lays Magic Masala 52g". If nothing is printed (loose item), describe it plainly, e.g. "Loose toor dal".
- brand: maker brand as printed, or "" if none.
- size: net weight or volume as printed, e.g. "52 g", "1 kg", "500 ml", or "".
- category: one of ${CATEGORIES.join(', ')}.
- type: "Packaged" (factory packed), "Loose" (sold loose or repacked by the shop) or "Perishable" (fresh: fruit, vegetables, milk, bread, eggs, meat).
- barcode: the digits under the barcode if you can read every digit clearly (8, 12 or 13 digits), else "".
- note: anything the shop owner should check, e.g. "MRP Rs 20 printed", "photo blurry", or "".
Do not guess a barcode. Use English for all fields.`;

function toB64(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const clean = (v: unknown, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

async function catalogueOne(row: { id: string; store: string; photo_count: number }) {
  const images = [];
  for (let i = 1; i <= row.photo_count; i++) {
    const { data, error } = await sb.storage.from('photos').download(`${row.store}/${row.id}/${i}.jpg`);
    if (error || !data) continue;
    images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toB64(new Uint8Array(await data.arrayBuffer())) } });
  }
  if (!images.length) throw new Error('no photos found');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: [...images, { type: 'text', text: PROMPT }] }] }),
  });
  if (!r.ok) throw new Error(`vision API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const out = await r.json();
  const text = (out.content || []).map((c: { text?: string }) => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in reply: ' + text.slice(0, 200));
  const j = JSON.parse(m[0]);
  const barcode = /^\d{8}$|^\d{12,13}$/.test(clean(j.barcode)) ? clean(j.barcode) : null;
  const category = CATEGORIES.includes(j.category) ? j.category : 'Other';
  const type = ['Packaged', 'Loose', 'Perishable'].includes(j.type) ? j.type : null;
  await sql`update public.submissions set
      status = 'catalogued', name = ${clean(j.name) || null}, brand = ${clean(j.brand) || null}, size = ${clean(j.size, 40) || null},
      category = ${category}, item_type = ${type}, barcode = ${barcode}, ai_note = ${clean(j.note, 300) || null},
      catalogued_at = now()
    where id = ${row.id}`;
}

Deno.serve(async req => {
  const key = req.headers.get('x-cron-key') || '';
  const [s] = await sql`select value from private.settings where key = 'cron_key'`;
  if (!s || !key || key !== s.value) return new Response('forbidden', { status: 403 });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return Response.json({ skipped: 'ANTHROPIC_API_KEY is not set' });

  // claim a batch so two overlapping runs do not take the same products
  const rows = await sql`update public.submissions set attempts = attempts + 1
     where id in (select id from public.submissions where status = 'new' and attempts < 3
                  order by created_at limit ${BATCH} for update skip locked)
     returning id, store, photo_count`;
  const done: string[] = [], failed: { id: string; error: string }[] = [];
  for (const row of rows) {
    try { await catalogueOne(row); done.push(row.id); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id: row.id, error: msg });
      // after 3 tries the product goes to the shop app without a name ("Item n")
      await sql`update public.submissions set ai_note = ${msg.slice(0, 300)},
          status = case when attempts >= 3 then 'failed' else status end where id = ${row.id}`;
    }
  }
  return Response.json({ done: done.length, failed });
});
