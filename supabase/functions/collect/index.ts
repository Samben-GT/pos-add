// Used by the shop's POS app. Auth: headers x-store and x-key (sha256 of the key is in public.stores).
//   GET  ?action=list[&all=1]  products ready for the shop app, with short-lived photo links
//                              (all=1 also returns products not catalogued yet)
//   GET  ?action=count         how many are waiting, by status
//   POST {action:'ack', ids}   the shop app has saved these: delete their rows and photos
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-store, x-key, content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const store = (req.headers.get('x-store') || '').toLowerCase();
  const key = req.headers.get('x-key') || '';
  if (!store || key.length < 16) return json({ error: 'missing store or key' }, 401);
  const [st] = await sql`select collector_key_hash from public.stores where code = ${store}`;
  if (!st || st.collector_key_hash !== await sha256(key)) return json({ error: 'wrong store or key' }, 403);

  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const action = body.action || url.searchParams.get('action') || 'list';

  if (action === 'count') {
    const rows = await sql`select status, count(*)::int as n from public.submissions where store = ${store} group by status`;
    return json(Object.fromEntries(rows.map(r => [r.status, r.n])));
  }

  if (action === 'list') {
    const all = url.searchParams.get('all') === '1';
    const statuses = all ? ['new', 'catalogued', 'failed'] : ['catalogued', 'failed'];
    const rows = await sql`select id, created_at, qty, price, cost, source, photo_count, status,
        coalesce(name, typed_name) as name, tamil_name, brand, size, category, item_type, barcode, ai_note
      from public.submissions where store = ${store} and status = any(${statuses})
      order by created_at limit 60`;
    const paths = rows.flatMap(r => Array.from({ length: r.photo_count }, (_, i) => `${store}/${r.id}/${i + 1}.jpg`));
    const links: Record<string, string> = {};
    if (paths.length) {
      const { data } = await sb.storage.from('photos').createSignedUrls(paths, 3600);
      for (const d of data || []) if (d.signedUrl && d.path) links[d.path] = d.signedUrl;
    }
    const items = rows.map(r => ({
      ...r, qty: Number(r.qty), price: Number(r.price), cost: r.cost == null ? null : Number(r.cost),
      photos: Array.from({ length: r.photo_count }, (_, i) => links[`${store}/${r.id}/${i + 1}.jpg`]).filter(Boolean),
    }));
    const [{ n }] = await sql`select count(*)::int as n from public.submissions where store = ${store} and status = any(${statuses})`;
    return json({ items, more: n > items.length });
  }

  if (action === 'ack') {
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 200) : [];
    if (!ids.length) return json({ deleted: 0 });
    const rows = await sql`select id, photo_count from public.submissions where store = ${store} and id = any(${ids}::uuid[])`;
    const paths = rows.flatMap(r => Array.from({ length: 4 }, (_, i) => `${store}/${r.id}/${i + 1}.jpg`));
    if (paths.length) {
      const { error } = await sb.storage.from('photos').remove(paths);
      if (error) return json({ error: 'could not delete photos: ' + error.message }, 500);
    }
    const del = await sql`delete from public.submissions where store = ${store} and id = any(${rows.map(r => r.id)}::uuid[])`;
    return json({ deleted: del.count });
  }

  return json({ error: 'unknown action' }, 400);
});
