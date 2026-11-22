// Headless check of the shop link app with a fake Supabase.
import { chromium } from '/home/claude/pos/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(root, p); if (!existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); }).listen(8790);
const fake = { rows: [], files: new Set(), online: true };
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out'); };
const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exitCode = 1; } else console.log('  ok  ' + m); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.route('https://zbunkuxkliftbyzkscil.supabase.co/**', async route => {
  if (!fake.online) return route.abort('internetdisconnected');
  const u = new URL(route.request().url()); const body = route.request().postDataJSON ? (() => { try { return route.request().postDataJSON(); } catch { return null; } })() : null;
  if (u.pathname.endsWith('/rpc/store_name')) return route.fulfill({ json: 'Murugan Stores' });
  if (u.pathname.endsWith('/rpc/submit_product')) { let r = fake.rows.find(x => x.local_id === body.p_local_id); if (!r) { r = { id: 'id' + fake.rows.length, local_id: body.p_local_id, status: 'uploading', ...body }; fake.rows.push(r); } return route.fulfill({ json: r.id }); }
  if (u.pathname.includes('/storage/v1/object/photos/')) { fake.files.add(u.pathname.split('/photos/')[1]); return route.fulfill({ json: { Key: 'x' } }); }
  if (u.pathname.endsWith('/rpc/finish_product')) { const r = fake.rows.find(x => x.id === body.p_id); r.status = 'new'; return route.fulfill({ json: true }); }
  if (u.pathname.endsWith('/rpc/my_products')) return route.fulfill({ json: fake.rows.map(r => ({ id: r.id, local_id: r.local_id, status: r.status, name: r.name || null, brand: r.brand || null, size: null, created_at: new Date().toISOString() })) });
  route.fulfill({ status: 404, body: 'no' });
});
// photo files to pick
const { execSync } = await import('node:child_process');
execSync(`python3 -c "from PIL import Image; [Image.new('RGB',(2000,1500),c).save('/tmp/p%d.jpg'%i) for i,c in enumerate(['red','green','blue','orange','purple'])]"`);
await page.goto('http://localhost:8790/?s=shop1');
await page.waitForFunction(() => document.querySelector('#store-name').textContent === 'Murugan Stores');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 5000 });
ok(true, 'store name shown from the link');
await page.click('#save');
ok((await page.textContent('#err')).includes('photo'), 'photo is required');
await page.setInputFiles('#gal', ['/tmp/p0.jpg', '/tmp/p1.jpg', '/tmp/p2.jpg', '/tmp/p3.jpg', '/tmp/p4.jpg']);
await page.waitForFunction(() => document.querySelectorAll('#photos .slot img').length === 4);
ok(true, 'only 4 photos kept from 5 picked');
await page.click('#photos [data-del="3"]');
ok(await page.$$eval('#photos .slot img', x => x.length) === 3, 'photo removed');
await page.click('#save');
ok((await page.textContent('#err')).includes('quantity'), 'quantity is required');
await page.type('#qty', '2a4');
ok(await page.inputValue('#qty') === '24', 'numbers only in quantity');
await page.click('#save');
ok((await page.textContent('#err')).includes('selling price'), 'selling price is required');
await page.type('#price', '35'); await page.type('#cost', '30');
ok((await page.textContent('#margin')).includes('5'), 'margin shown');
await page.fill('#source', 'Ganesh Agencies\n98400 11111');
await page.screenshot({ path: root + 'test/01-form.png' });
await page.click('#save');
await until(() => page.evaluate(() => window.__posAdd.allItems().then(a => a.length === 1 && a[0].state === 'sent')));
ok(fake.files.size === 3 && [...fake.files].every(f => /^shop1\/id0\/[1-3]\.jpg$/.test(f)), 'photos uploaded to shop1/<id>/1..3.jpg');
ok(fake.rows[0].p_qty === 24 && fake.rows[0].p_price === 35 && fake.rows[0].p_cost === 30 && fake.rows[0].status === 'new', 'product uploaded and finished');
ok(await page.inputValue('#source') === 'Ganesh Agencies\n98400 11111' && await page.inputValue('#qty') === '', 'form cleared, source kept');
// offline product
fake.online = false;
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
await page.setInputFiles('#cam', ['/tmp/p4.jpg']);
await page.waitForFunction(() => document.querySelectorAll('#photos .slot img').length === 1);
await page.type('#qty', '5'); await page.type('#price', '120');
await page.click('#save');
await page.waitForTimeout(800);
let items = await page.evaluate(() => window.__posAdd.allItems());
ok(items.filter(i => i.state === 'waiting').length === 1, 'offline product waits on the phone');
fake.online = true;
await page.evaluate(() => window.__posAdd.sync());
items = await page.evaluate(() => window.__posAdd.allItems());
ok(items.every(i => i.state === 'sent') && fake.rows.length === 2, 'uploaded when back online');
fake.rows[0].status = 'catalogued'; fake.rows[0].name = 'Aashirvaad Atta 1kg';
fake.rows.splice(1, 1); // second one collected by the shop app
await page.evaluate(() => window.__posAdd.allItems().then(a => a));
await page.click('.tabs [data-view="list"]');
await page.evaluate(async () => { const a = await window.__posAdd.allItems(); for (const i of a) i.sentAt = 0; });
await page.evaluate(() => new Promise(r => { const q = indexedDB.open('pos-add'); q.onsuccess = () => { const tx = q.result.transaction('items', 'readwrite'); const st = tx.objectStore('items'); st.getAll().onsuccess = e => { for (const i of e.target.result) { i.sentAt = 0; st.put(i); } }; tx.oncomplete = r; }; }));
await page.evaluate(() => window.__posAdd.refreshStatus());
await page.waitForTimeout(300);
const txt = await page.textContent('#list');
ok(txt.includes('Aashirvaad Atta 1kg') && txt.includes('Catalogued') && txt.includes('In the shop app'), 'My products shows catalogued name and collected status');
await page.screenshot({ path: root + 'test/02-list.png' });
await page.click('#list .row');
await page.waitForSelector('.sheet');
await page.screenshot({ path: root + 'test/03-detail.png' });
await page.click('[data-close]');
await page.click('#lang-btn');
ok((await page.textContent('.tabs')).includes('என் பொருட்கள்'), 'Tamil switch');
await page.click('.tabs [data-view="add"]');
await page.screenshot({ path: root + 'test/04-tamil.png' });
ok(errors.length === 0, 'no page errors ' + errors.join('|'));
await b.close(); srv.close();
