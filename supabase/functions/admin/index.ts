// Admin for Sam: stores (create, location, PIN, phase, setup code), products waiting in the cloud
// (view, edit, delete, add on behalf of a store) and "name them now".
// Login: password checked against private.settings 'admin_pass' (bcrypt); returns a signed token for 30 days.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PROJECT = Deno.env.get('SUPABASE_URL')!;
const LINK = 'https://samben-gt.github.io/pos-add/';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-admin', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const enc = new TextEncoder();
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function secret() { const [r] = await sql`select value from private.settings where key = 'admin_secret'`; return r.value as string; }
async function sign(payload: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(await secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload))));
}
async function makeToken() { const p = b64u(enc.encode(JSON.stringify({ exp: Date.now() + 30 * 864e5 }))); return p + '.' + await sign(p); }
async function okToken(t: string) {
  const [p, s] = (t || '').split('.');
  if (!p || !s || s !== await sign(p)) return false;
  try { return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).exp > Date.now(); } catch { return false; }
}
const randKey = () => 'k' + b64u(crypto.getRandomValues(new Uint8Array(24))).replace(/[-_]/g, 'x');
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'store';
const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
const txt = (v: unknown, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);

async function storeRows() {
  const rows = await sql`select s.code, s.name, s.phase, s.pin_hash is not null as has_pin, s.area, s.city, s.lat, s.lng, s.contact, s.created_at,
      k.collector_key,
      (select count(*)::int from public.submissions x where x.store = s.code and x.status in ('uploading', 'new')) as waiting,
      (select count(*)::int from public.submissions x where x.store = s.code and x.status in ('catalogued', 'failed')) as ready,
      (select count(*)::int from public.catalog c where c.store = s.code) as catalog,
      (select count(*)::int from public.store_devices d where d.store = s.code) as phones
    from public.stores s left join private.store_keys k on k.store = s.code order by s.created_at`;
  return rows.map(r => ({ ...r, setup_code: r.collector_key ? `${r.code}.${r.collector_key}` : null, link: `${LINK}?s=${r.code}`, collector_key: undefined }));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const a = body.action;

  if (a === 'login') {
    const [r] = await sql`select value from private.settings where key = 'admin_pass'`;
    const [ok] = await sql`select extensions.crypt(${String(body.password || '')}, ${r.value}) = ${r.value} as ok`;
    if (!ok.ok) { await new Promise(res => setTimeout(res, 800)); return json({ error: 'Wrong password' }, 403); }
    return json({ token: await makeToken() });
  }
  if (!(await okToken(req.headers.get('x-admin') || ''))) return json({ error: 'Please log in again' }, 401);

  try {
    switch (a) {
      case 'stores': return json({ stores: await storeRows() });

      case 'create_store': {
        const name = txt(body.name, 80);
        if (!name) return json({ error: 'Enter the store name' }, 400);
        let code = slug(body.code || name), n = 1;
        while ((await sql`select 1 from public.stores where code = ${code}`).length) code = slug(body.code || name).slice(0, 20) + '-' + (++n);
        const key = randKey();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(key))), b => b.toString(16).padStart(2, '0')).join('');
        const pin = txt(body.pin, 8);
        await sql`insert into public.stores (code, name, collector_key_hash, area, city, lat, lng, contact, pin_hash)
          values (${code}, ${name}, ${hash}, ${txt(body.area, 80)}, ${txt(body.city, 60)}, ${num(body.lat)}, ${num(body.lng)}, ${txt(body.contact)},
                  ${pin ? sql`extensions.crypt(${pin}, extensions.gen_salt('bf', 8))` : null})`;
        await sql`insert into private.store_keys (store, collector_key) values (${code}, ${key})`;
        return json({ stores: await storeRows(), code });
      }

      case 'update_store': {
        const c = String(body.code || '');
        const f = body.fields || {};
        if ('name' in f && txt(f.name, 80)) await sql`update public.stores set name = ${txt(f.name, 80)} where code = ${c}`;
        for (const k of ['area', 'city', 'contact'] as const) if (k in f) await sql`update public.stores set ${sql(k)} = ${txt(f[k], k === 'contact' ? 200 : 80)} where code = ${c}`;
        if ('lat' in f || 'lng' in f) await sql`update public.stores set lat = ${num(f.lat)}, lng = ${num(f.lng)} where code = ${c}`;
        if ('phase' in f && ['onboarding', 'live'].includes(f.phase)) await sql`update public.stores set phase = ${f.phase} where code = ${c}`;
        if ('pin' in f) {
          const pin = txt(f.pin, 8);
          await sql`update public.stores set pin_hash = ${pin ? sql`extensions.crypt(${pin}, extensions.gen_salt('bf', 8))` : null} where code = ${c}`;
          await sql`delete from public.store_devices where store = ${c}`;   // phones must enter the new PIN
        }
        return json({ stores: await storeRows() });
      }

      case 'new_key': {
        const c = String(body.code || ''), key = randKey();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(key))), b => b.toString(16).padStart(2, '0')).join('');
        await sql`update public.stores set collector_key_hash = ${hash} where code = ${c}`;
        await sql`insert into private.store_keys (store, collector_key) values (${c}, ${key}) on conflict (store) do update set collector_key = excluded.collector_key`;
        return json({ stores: await storeRows() });
      }

      case 'items': {
        const rows = await sql`select id, created_at, status, qty, price, cost, source, photo_count, coalesce(typed_name, name) as name, typed_name,
            tamil_name, brand, size, category, item_type, barcode, ai_note, added_by
          from public.submissions where store = ${String(body.store || '')} order by created_at desc limit 300`;
        const paths = rows.flatMap(r => Array.from({ length: r.photo_count }, (_, i) => `${body.store}/${r.id}/${i + 1}.jpg`));
        const links: Record<string, string> = {};
        for (let i = 0; i < paths.length; i += 100) {
          const { data } = await sb.storage.from('photos').createSignedUrls(paths.slice(i, i + 100), 3600);
          for (const d of data || []) if (d.signedUrl && d.path) links[d.path] = d.signedUrl;
        }
        return json({ items: rows.map(r => ({ ...r, qty: Number(r.qty), price: Number(r.price), cost: r.cost == null ? null : Number(r.cost),
          photos: Array.from({ length: r.photo_count }, (_, i) => links[`${body.store}/${r.id}/${i + 1}.jpg`]).filter(Boolean) })) });
      }

      case 'update_item': {
        const f = body.fields || {}, id = String(body.id || '');
        if ('name' in f) await sql`update public.submissions set typed_name = ${txt(f.name, 120)}, name = coalesce(${txt(f.name, 120)}, name) where id = ${id}`;
        for (const k of ['tamil_name', 'source', 'brand', 'size'] as const) if (k in f) await sql`update public.submissions set ${sql(k)} = ${txt(f[k], k === 'source' ? 1000 : 120)} where id = ${id}`;
        for (const k of ['qty', 'price', 'cost'] as const) if (k in f && (f[k] === '' || f[k] == null ? k === 'cost' : Number(f[k]) >= 0)) await sql`update public.submissions set ${sql(k)} = ${num(f[k])} where id = ${id}`;
        return json({ ok: true });
      }

      case 'delete_item': {
        const [r] = await sql`select id, store from public.submissions where id = ${String(body.id || '')}`;
        if (r) {
          await sb.storage.from('photos').remove([1, 2, 3, 4].map(i => `${r.store}/${r.id}/${i}.jpg`));
          await sql`delete from public.submissions where id = ${r.id}`;
        }
        return json({ ok: true });
      }

      // adding on behalf of a store works in either phase; photos go straight to storage with one-time upload links
      case 'add_item': {
        const photos = Math.max(1, Math.min(4, Number(body.photos) || 1));
        if (!(Number(body.price) > 0) || !(Number(body.qty) > 0)) return json({ error: 'Quantity and selling price are needed' }, 400);
        const [r] = await sql`insert into public.submissions (store, device_hash, local_id, qty, price, cost, source, photo_count, typed_name, added_by)
          values (${String(body.store)}, 'admin', ${'admin-' + crypto.randomUUID()}, ${Number(body.qty)}, ${Number(body.price)}, ${num(body.cost) || null},
                  ${txt(body.source, 1000)}, ${photos}, ${txt(body.name, 120)}, 'admin') returning id`;
        const uploads = [];
        for (let i = 1; i <= photos; i++) {
          const { data, error } = await sb.storage.from('photos').createSignedUploadUrl(`${body.store}/${r.id}/${i}.jpg`);
          if (error) throw error;
          uploads.push(data.signedUrl);
        }
        return json({ id: r.id, uploads });
      }
      case 'finish_item': {
        await sql`update public.submissions set status = 'new' where id = ${String(body.id || '')} and status = 'uploading'`;
        return json({ ok: true });
      }

      case 'catalogue_now': {
        const [k] = await sql`select value from private.settings where key = 'cron_key'`;
        const r = await fetch(`${PROJECT}/functions/v1/catalogue`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-key': k.value }, body: '{}' });
        return json(await r.json().catch(() => ({ error: 'naming failed' })));
      }

      case 'change_password': {
        const p = String(body.password || '');
        if (p.length < 8) return json({ error: 'Use at least 8 characters' }, 400);
        await sql`update private.settings set value = extensions.crypt(${p}, extensions.gen_salt('bf', 10)) where key = 'admin_pass'`;
        return json({ ok: true });
      }
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
