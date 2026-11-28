// Headless check of the admin and customer pages with a fake backend.
import { chromium } from '/home/claude/pos/node_modules/playwright-core/index.mjs';
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import { join, extname } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let p = new URL(q.url, 'http://x').pathname; if (p.endsWith('/')) p += 'index.html'; const f = join(root, p); if (!existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': T[extname(f)] }); s.end(readFileSync(f)); }).listen(8793);
const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exitCode = 1; } else console.log('  ok  ' + m); };
const S = { stores: [{ code: 'pethanachi', name: 'SRI PETHANACHI AMMAN STORE', phase: 'onboarding', has_pin: false, area: 'Chromepet', city: 'Chennai', lat: 12.95, lng: 80.14, waiting: 1, ready: 2, catalog: 0, phones: 2, setup_code: 'pethanachi.kXYZ', link: 'https://samben-gt.github.io/pos-add/?s=pethanachi' }], calls: [] };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await b.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => d.accept(d.type() === 'prompt' ? '5678' : undefined));
await page.route('https://zbunkuxkliftbyzkscil.supabase.co/**', async route => {
  const u = new URL(route.request().url()); const body = JSON.parse(route.request().postData() || '{}');
  if (u.pathname.endsWith('/functions/v1/admin')) {
    S.calls.push(body.action);
    if (body.action === 'login') return body.password === 'pw' ? route.fulfill({ json: { token: 't' } }) : route.fulfill({ status: 403, json: { error: 'Wrong password' } });
    if (body.action === 'stores') return route.fulfill({ json: { stores: S.stores } });
    if (body.action === 'create_store') { S.stores.push({ ...S.stores[0], code: 'murugan', name: body.name, area: body.area, city: body.city, lat: body.lat, lng: body.lng, waiting: 0, ready: 0, phones: 0, has_pin: !!body.pin, setup_code: 'murugan.kABC', link: '...?s=murugan' }); return route.fulfill({ json: { stores: S.stores, code: 'murugan' } }); }
    if (body.action === 'update_store') { const s = S.stores.find(x => x.code === body.code); if (body.fields.phase) s.phase = body.fields.phase; if ('pin' in body.fields) s.has_pin = !!body.fields.pin; S.lastFields = body.fields; return route.fulfill({ json: { stores: S.stores } }); }
    if (body.action === 'items') return route.fulfill({ json: { items: [{ id: 'i1', created_at: new Date().toISOString(), status: 'catalogued', qty: 2, price: 5, cost: 4, source: '', photo_count: 0, name: "Lay's Chile Limon 20g", tamil_name: 'லேஸ்', brand: "Lay's", size: '20 g', category: 'Chips & Snacks', barcode: '8901491981521', ai_note: 'MRP Rs. 5/- printed', photos: [] }] } });
    if (body.action === 'update_item') { S.updated = body; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { ok: true } });
  }
  if (u.pathname.endsWith('/rpc/customer_stores')) return route.fulfill({ json: [{ code: 'pethanachi', name: 'SRI PETHANACHI AMMAN STORE', area: 'Chromepet', city: 'Chennai', lat: 12.95, lng: 80.14, items: 2 }] });
  if (u.pathname.endsWith('/rpc/customer_search')) return route.fulfill({ json: [{ store: 'pethanachi', store_name: 'SRI PETHANACHI AMMAN STORE', area: 'Chromepet', city: 'Chennai', name: 'Tomato', tamil_name: 'தக்காளி, thakkali', size: null, price: 40, in_stock: true }].filter(r => !body.p_q || /tom|தக்/i.test(body.p_q)) });
  if (u.pathname.endsWith('/rpc/market_rates_today')) return route.fulfill({ json: [{ commodity: 'Tomato', arrival_date: '2026-11-28', markets: 12, min_kg: 18, max_kg: 32, modal_kg: 24.5, chennai_kg: 26 }, { commodity: 'Onion', arrival_date: '2026-11-28', markets: 10, min_kg: 30, max_kg: 45, modal_kg: 38, chennai_kg: null }] });
  route.fulfill({ status: 404, json: {} });
});
await page.goto('http://localhost:8793/admin.html');
await page.fill('#pw', 'nope'); await page.click('#login'); await page.waitForTimeout(200);
ok((await page.textContent('#err')).includes('Wrong'), 'wrong admin password refused');
await page.fill('#pw', 'pw'); await page.click('#login');
await page.waitForSelector('[data-open]');
ok((await page.textContent('#main')).includes('SRI PETHANACHI AMMAN STORE'), 'store list');
await page.screenshot({ path: root + 'test/10-admin-stores.png' });
await page.click('#new');
await page.fill('#f-name', 'Sri Murugan Stores'); await page.fill('#f-area', 'Pallavaram'); await page.fill('#f-city', 'Chennai');
await page.fill('#f-loc', 'https://www.google.com/maps/place/x/@12.9675,80.1491,17z'); await page.fill('#f-pin', '1234');
await page.click('#f-save'); await page.waitForTimeout(300);
const m = S.stores.find(s => s.code === 'murugan');
ok(m && m.lat === 12.9675 && m.lng === 80.1491 && m.area === 'Pallavaram' && m.has_pin, 'new store with location from a Maps link and PIN');
ok((await page.textContent('#main')).includes('murugan.kABC'), 'setup code shown');
await page.click('#back'); await page.waitForSelector('[data-open="pethanachi"]');
await page.click('[data-open="pethanachi"]'); await page.waitForSelector('.item');
await page.screenshot({ path: root + 'test/11-admin-store.png', fullPage: true });
await page.fill('.item [data-f="name"]', "Lay's Chile Limon 20g pack"); await page.click('.item [data-save]'); await page.waitForTimeout(200);
ok(S.updated && S.updated.fields.name === "Lay's Chile Limon 20g pack", 'product name edited');
await page.click('#phase'); await page.waitForTimeout(300);
ok(S.stores[0].phase === 'live' && (await page.textContent('#main')).includes('Reopen shop link'), 'go live closes the shop link');
await page.click('#pin'); await page.waitForTimeout(300);
ok(S.lastFields.pin === '5678', 'PIN set');
await page.click('[data-tab="add"]'); await page.waitForSelector('#a-save');
await page.click('#a-save'); ok((await page.textContent('#a-err')).includes('photo'), 'add on behalf: photo required');
await page.goto('http://localhost:8793/market.html');
await page.waitForSelector('#results .row');
ok((await page.textContent('#results')).includes('Tomato'), 'customer search lists items');
await page.screenshot({ path: root + 'test/12-market-search.png' });
await page.click('[data-view="rates"]'); await page.waitForSelector('#rates table');
ok((await page.textContent('#rates')).includes('₹24.5') && (await page.textContent('#rates')).includes('₹26'), 'market rates table');
await page.screenshot({ path: root + 'test/13-market-rates.png' });
await page.click('[data-view="stores"]'); await page.waitForSelector('#stores .card');
ok((await page.textContent('#stores')).includes('Directions'), 'shops with directions');
ok(errors.length === 0, 'no page errors ' + errors.join('|'));
await b.close(); srv.close();
