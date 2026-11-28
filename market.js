// Customer page: which shops sell which items, by area, and today's wholesale fruit and vegetable rates.
// Read-only; uses the public functions customer_stores, customer_search and market_rates_today.
(() => {
  'use strict';
  const C = window.POS_CONFIG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TA = {
    'Shops near you': 'அருகிலுள்ள கடைகள்', 'Find items': 'பொருள் தேடு', 'Shops': 'கடைகள்', 'Market rates': 'சந்தை விலை',
    'Search: tomato, தக்காளி, Lays...': 'தேடு: தக்காளி, tomato, Lays...', 'All areas': 'எல்லா பகுதிகளும்', 'Sort by distance from me': 'என்னிடமிருந்து தூரப்படி வரிசைப்படுத்து',
    'Wholesale mandi prices per kg in Tamil Nadu from the Government of India (data.gov.in, Agmarknet). Shop prices are usually higher.': 'இந்திய அரசின் (data.gov.in, Agmarknet) தமிழ்நாடு மொத்த சந்தை விலை, ஒரு கிலோவுக்கு. கடை விலை பொதுவாக அதிகமாக இருக்கும்.',
    'In stock': 'இருப்பு உள்ளது', 'Out of stock': 'இருப்பு இல்லை', 'items': 'பொருட்கள்', 'No items found': 'பொருட்கள் இல்லை', 'No rates yet today': 'இன்று இன்னும் விலை இல்லை',
    'Item': 'பொருள்', 'Chennai': 'சென்னை', 'Tamil Nadu': 'தமிழ்நாடு', 'Range': 'வரம்பு', 'km away': 'கி.மீ. தூரம்', 'Directions': 'வழி',
  };
  let lang = localStorage.getItem('lang') || 'en';
  const t = s => (lang === 'ta' && TA[s]) || s;
  function translate() {
    document.querySelectorAll('[data-t]').forEach(el => { if (!el.dataset.en) el.dataset.en = el.textContent.trim(); el.textContent = t(el.dataset.en); });
    document.querySelectorAll('[data-t-ph]').forEach(el => { if (!el.dataset.enPh) el.dataset.enPh = el.placeholder; el.placeholder = t(el.dataset.enPh); });
    $('#lang-btn').textContent = lang === 'ta' ? 'English' : 'தமிழ்';
  }
  async function rpc(fn, body = {}) {
    const r = await fetch(`${C.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: C.anon, Authorization: 'Bearer ' + C.anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  const rs = n => '₹' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-IN');
  let stores = [], me = null;
  const dist = s => (me && s.lat != null ? haversine(me, s) : null);
  function haversine(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(d));
  }

  async function loadStores() {
    try { stores = await rpc('customer_stores'); } catch (e) { stores = []; }
    const areas = [...new Set(stores.flatMap(s => [s.area, s.city]).filter(Boolean))].sort();
    $('#area').innerHTML = `<option value="">${esc(t('All areas'))}</option>` + areas.map(a => `<option>${esc(a)}</option>`).join('');
    $('#sub').textContent = `${stores.length} ${lang === 'ta' ? 'கடைகள்' : stores.length === 1 ? 'shop' : 'shops'}`;
    drawStores();
  }
  function drawStores() {
    const list = stores.slice().sort((a, b) => (dist(a) ?? 1e9) - (dist(b) ?? 1e9) || a.name.localeCompare(b.name));
    $('#stores').innerHTML = list.map(s => {
      const d = dist(s);
      return `<div class="card"><h3>${esc(s.name)}</h3><div class="muted">${esc([s.area, s.city].filter(Boolean).join(', '))}${d != null ? ` · ${d.toFixed(1)} ${esc(t('km away'))}` : ''}</div>
        <div class="stats-line"><span class="pill">${s.items} ${esc(t('items'))}</span></div>
        <div class="btns"><button class="btn small primary" data-store="${esc(s.code)}">${esc(t('Find items'))}</button>${s.lat != null ? `<a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" rel="noopener">${esc(t('Directions'))}</a>` : ''}</div></div>`;
    }).join('');
    $('#stores').querySelectorAll('[data-store]').forEach(b => { b.onclick = () => { onlyStore = b.dataset.store; show('search'); search(); }; });
  }

  let onlyStore = '', timer = 0;
  async function search() {
    const q = $('#q').value.trim(), area = $('#area').value;
    let rows = [];
    try { rows = await rpc('customer_search', { p_q: q, p_area: area || null }); } catch (e) { rows = []; }
    if (onlyStore) rows = rows.filter(r => r.store === onlyStore);
    const st = onlyStore && stores.find(s => s.code === onlyStore);
    $('#results').innerHTML = (st ? `<div class="pill" style="margin-top:10px;display:inline-block">${esc(st.name)} <button class="link" id="clear-store">×</button></div>` : '')
      + (rows.length ? rows.map(r => `<div class="row"><div class="info"><div class="t">${esc(r.name)}${r.size && !r.name.includes(r.size) ? ' · ' + esc(r.size) : ''}</div>
          <div class="s">${esc(r.store_name)} · ${esc([r.area, r.city].filter(Boolean).join(', '))}</div>
          ${r.tamil_name ? `<div class="s">${esc(r.tamil_name.split(',')[0])}</div>` : ''}</div>
          <div style="text-align:right"><b style="font-size:18px">${r.price > 0 ? rs(r.price) : ''}</b><br><span class="st ${r.in_stock ? 'done' : 'err'}">${esc(t(r.in_stock ? 'In stock' : 'Out of stock'))}</span></div></div>`).join('')
      : `<div class="empty">${esc(t('No items found'))}</div>`);
    if ($('#clear-store')) $('#clear-store').onclick = () => { onlyStore = ''; search(); };
  }

  async function loadRates() {
    let rows = [];
    try { rows = await rpc('market_rates_today', {}); } catch (e) { rows = []; }
    if (!rows.length) { $('#rates').innerHTML = `<div class="empty">${esc(t('No rates yet today'))}</div>`; return; }
    const date = rows.reduce((d, r) => (r.arrival_date > d ? r.arrival_date : d), '');
    $('#rates').innerHTML = `<div class="muted">${esc(new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      <div class="card" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr style="background:#17201C;color:#fff"><th style="text-align:left;padding:8px">${esc(t('Item'))}</th><th style="padding:8px">${esc(t('Chennai'))}</th><th style="padding:8px">${esc(t('Tamil Nadu'))}</th><th style="padding:8px">${esc(t('Range'))}</th></tr>
      ${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f6f7f4' : '#fff'}"><td style="padding:8px">${esc(r.commodity)}</td>
        <td style="padding:8px;text-align:center">${r.chennai_kg != null ? rs(r.chennai_kg) : '-'}</td>
        <td style="padding:8px;text-align:center"><b>${rs(r.modal_kg ?? r.tn_kg)}</b></td>
        <td style="padding:8px;text-align:center" class="muted">${rs(r.min_kg)} - ${rs(r.max_kg)}</td></tr>`).join('')}
      </table></div>`;
  }

  function show(v) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    for (const x of ['search', 'stores', 'rates']) $('#v-' + x).hidden = x !== v;
    if (v === 'rates') loadRates();
  }
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); };
  $('#q').oninput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };
  $('#area').onchange = search;
  $('#near').onclick = () => navigator.geolocation.getCurrentPosition(p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; drawStores(); }, () => {}, { timeout: 10000 });
  $('#lang-btn').onclick = () => { lang = lang === 'ta' ? 'en' : 'ta'; localStorage.setItem('lang', lang); translate(); loadStores(); search(); if (!$('#v-rates').hidden) loadRates(); };
  translate();
  loadStores().then(search);
})();
