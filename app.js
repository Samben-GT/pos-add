// Shop link app: shop staff photograph products and enter quantity and prices.
// Products are kept on the phone (IndexedDB) until they are uploaded to Supabase, so nothing is lost offline.
// Overnight the products are catalogued (name, brand, size, barcode) and the shop's POS app collects them.
(() => {
  'use strict';
  const C = window.POS_CONFIG;
  const MAX_PHOTOS = 4;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Tamil ----------
  const TA = {
    'Add products': 'பொருட்கள் சேர்', 'Add product': 'பொருள் சேர்', 'My products': 'என் பொருட்கள்',
    'Photos': 'படங்கள்', '(1 to 4: front, back, sides)': '(1 முதல் 4: முன், பின், பக்கங்கள்)', 'Pick from gallery': 'கேலரியிலிருந்து தேர்வு',
    'Quantity in stock': 'ஸ்டாக்கில் உள்ள அளவு', 'Selling price (₹)': 'விற்பனை விலை (₹)', 'Buying price (₹)': 'வாங்கிய விலை (₹)',
    'Source': 'எங்கிருந்து வாங்கியது', 'Where it was bought from: shop or supplier name, phone, notes': 'எங்கிருந்து வாங்கியது: கடை அல்லது சப்ளையர் பெயர், போன், குறிப்புகள்',
    'Save and add next': 'சேமி, அடுத்தது சேர்',
    'Saved products upload by themselves, even if the internet comes back later. Names and barcodes are filled in overnight.': 'சேமித்த பொருட்கள் தானாகவே பதிவேற்றப்படும், இணையம் பிறகு வந்தாலும் சரி. பெயர்களும் பார்கோடுகளும் இரவில் நிரப்பப்படும்.',
    'Open the link from your shop owner': 'கடை உரிமையாளர் அனுப்பிய இணைப்பைத் திறக்கவும்',
    'This app needs the shop link to know which shop the products belong to.': 'பொருட்கள் எந்தக் கடைக்குச் சொந்தம் என்பதை அறிய இந்த ஆப்புக்கு கடை இணைப்பு தேவை.',
    'Front': 'முன்பக்கம்', 'Add': 'சேர்', 'Main': 'முதன்மை',
    'Take at least 1 photo': 'குறைந்தது 1 படம் எடுக்கவும்', 'Enter the quantity': 'அளவை உள்ளிடவும்', 'Enter the selling price': 'விற்பனை விலையை உள்ளிடவும்',
    'Saved. Add the next product.': 'சேமிக்கப்பட்டது. அடுத்த பொருளைச் சேர்க்கவும்.',
    'Margin ₹{m} ({p}%)': 'லாபம் ₹{m} ({p}%)', 'Buying price is more than selling price': 'வாங்கிய விலை விற்பனை விலையை விட அதிகம்',
    'Waiting to upload': 'பதிவேற்றக் காத்திருக்கிறது', 'Uploaded': 'பதிவேற்றப்பட்டது', 'Catalogued': 'பட்டியலிடப்பட்டது', 'In the shop app': 'கடை ஆப்பில் உள்ளது', 'Upload problem': 'பதிவேற்றப் பிரச்சினை',
    '{n} waiting to upload': '{n} பதிவேற்றக் காத்திருக்கின்றன', 'All uploaded': 'அனைத்தும் பதிவேற்றப்பட்டன', 'Offline': 'இணையம் இல்லை', 'Uploading...': 'பதிவேற்றுகிறது...',
    'Total {n}': 'மொத்தம் {n}', 'Today {n}': 'இன்று {n}', 'No products yet': 'இன்னும் பொருட்கள் இல்லை',
    'Product': 'பொருள்', 'Qty': 'அளவு', 'Sell': 'விற்பனை', 'Buy': 'வாங்கியது', 'Added': 'சேர்த்தது', 'Status': 'நிலை', 'Close': 'மூடு',
    'Delete': 'நீக்கு', 'Delete this product? It has not been uploaded yet.': 'இந்தப் பொருளை நீக்கவா? இது இன்னும் பதிவேற்றப்படவில்லை.',
    'Could not read that picture': 'அந்தப் படத்தைப் படிக்க முடியவில்லை', 'Only 4 photos per product': 'ஒரு பொருளுக்கு 4 படங்கள் மட்டும்',
    'This shop link is not valid': 'இந்தக் கடை இணைப்பு செல்லாது', 'Upload now': 'இப்போது பதிவேற்று',
    'Take photo {n} of 4': 'படம் {n} / 4 எடு', 'Done with photos': 'படங்கள் போதும்',
  };
  let lang = localStorage.getItem('lang') || 'en';
  const t = (s, v) => { let r = (lang === 'ta' && TA[s]) || s; if (v) for (const k in v) r = r.split('{' + k + '}').join(v[k]); return r; };
  function translatePage() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(el => { if (!el.dataset.en) el.dataset.en = el.textContent.trim(); el.textContent = t(el.dataset.en); });
    document.querySelectorAll('[data-t-ph]').forEach(el => { if (!el.dataset.enPh) el.dataset.enPh = el.placeholder; el.placeholder = t(el.dataset.enPh); });
    $('#lang-btn').textContent = lang === 'ta' ? 'English' : 'தமிழ்';
  }

  // ---------- identity ----------
  const params = new URLSearchParams(location.search);
  if (params.get('s')) localStorage.setItem('store', params.get('s').toLowerCase().trim());
  const STORE = localStorage.getItem('store') || '';
  let deviceKey = localStorage.getItem('deviceKey');
  if (!deviceKey) {
    const b = crypto.getRandomValues(new Uint8Array(24));
    deviceKey = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('deviceKey', deviceKey);
  }

  // ---------- local database ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('pos-add', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'localId' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const x = d.transaction('items', mode);
      const st = x.objectStore('items');
      let out;
      Promise.resolve(fn(st)).then(v => { out = v; });
      x.oncomplete = () => res(out);
      x.onerror = () => rej(x.error);
    });
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const allItems = () => tx('readonly', st => req(st.getAll()));
  const putItem = it => tx('readwrite', st => req(st.put(it)));
  const delItem = id => tx('readwrite', st => req(st.delete(id)));

  // ---------- photos ----------
  let photos = []; // { blob, url, thumb }
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }
  function draw(img, max, q) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // 1280 px is enough to read the label overnight; the thumbnail is kept on the phone for My products
  async function preparePhoto(file) {
    const { img, url } = await loadImage(file);
    const big = draw(img, 1280, 0.8);
    const blob = await new Promise(r => big.toBlob(r, 'image/jpeg', 0.8));
    const thumb = draw(img, 160, 0.7).toDataURL('image/jpeg', 0.7);
    URL.revokeObjectURL(url);
    if (!blob) throw new Error('bad image');
    return { blob, url: URL.createObjectURL(blob), thumb };
  }
  const camIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  function drawPhotos() {
    let h = '';
    for (let i = 0; i < MAX_PHOTOS; i++) {
      if (photos[i]) h += `<div class="slot"><img src="${photos[i].url}" alt=""><button type="button" class="x" data-del="${i}" aria-label="remove">×</button>${i === 0 ? `<span class="tag">${esc(t('Main'))}</span>` : ''}</div>`;
      else if (i === photos.length) h += `<button type="button" class="slot add" id="shot">${camIcon}<span>${esc(i === 0 ? t('Front') : t('Add'))}</span></button>`;
      else h += '<div class="slot empty"></div>';
    }
    $('#photos').innerHTML = h;
    $('#gal-btn').hidden = photos.length >= MAX_PHOTOS;
  }
  async function addFiles(files, fromCam = false) {
    for (const f of files) {
      if (photos.length >= MAX_PHOTOS) { toast(t('Only 4 photos per product')); break; }
      try { photos.push(await preparePhoto(f)); } catch (e) { toast(t('Could not read that picture')); }
    }
    drawPhotos();
    $('#err').textContent = '';
    if (fromCam) offerMore();
  }
  // after each camera photo, offer the next one straight away (a tap is needed: browsers only open the camera on a tap)
  function offerMore() {
    const bar = $('#more-bar');
    if (photos.length >= MAX_PHOTOS || !photos.length) { bar.hidden = true; return; }
    $('#more-shot').textContent = '📷 ' + t('Take photo {n} of 4', { n: photos.length + 1 });
    bar.hidden = false;
  }
  const hideMore = () => { $('#more-bar').hidden = true; };

  // ---------- form ----------
  function cleanNumber(v) {
    let s = String(v).replace(/,/g, '.').replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    return s;
  }
  const num = id => { const v = $('#' + id).value.trim(); return v === '' ? null : Number(v); };
  function showMargin() {
    const p = num('price'), c = num('cost'), m = $('#margin');
    m.className = 'margin';
    if (p > 0 && c > 0) {
      if (c > p) { m.textContent = t('Buying price is more than selling price'); m.classList.add('neg'); }
      else m.textContent = t('Margin ₹{m} ({p}%)', { m: +(p - c).toFixed(2), p: Math.round(((p - c) / p) * 100) });
    } else m.textContent = '';
  }
  function fail(msg, id) {
    $('#err').textContent = msg;
    document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    if (id) { $('#' + id).classList.add('bad'); $('#' + id).focus(); }
  }
  async function save() {
    if (!photos.length) return fail(t('Take at least 1 photo'));
    const qty = num('qty'), price = num('price'), cost = num('cost');
    if (qty == null || !(qty > 0)) return fail(t('Enter the quantity'), 'qty');
    if (price == null || !(price > 0)) return fail(t('Enter the selling price'), 'price');
    const item = {
      localId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      createdAt: Date.now(), store: STORE,
      qty, price, cost: cost > 0 ? cost : null, source: $('#source').value.trim(),
      photos: photos.map(p => p.blob), thumb: photos[0].thumb, nPhotos: photos.length,
      state: 'waiting',
    };
    await putItem(item);
    photos.forEach(p => URL.revokeObjectURL(p.url));
    photos = [];
    hideMore();
    $('#qty').value = ''; $('#price').value = ''; $('#cost').value = '';
    // the source is usually the same for the next product, so it is kept
    fail('');
    showMargin();
    drawPhotos();
    toast(t('Saved. Add the next product.'), 'ok');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshCounts();
    sync();
  }

  // ---------- upload ----------
  const H = () => ({ apikey: C.anon, Authorization: 'Bearer ' + C.anon });
  async function rpc(fn, body) {
    const r = await fetch(`${C.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) { const e = new Error(text || r.statusText); e.status = r.status; throw e; }
    return text ? JSON.parse(text) : null;
  }
  async function uploadPhoto(path, blob) {
    const r = await fetch(`${C.url}/storage/v1/object/photos/${path}`, { method: 'POST', headers: { ...H(), 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob });
    if (r.ok) return;
    const text = await r.text();
    if (r.status === 409 || /exists|Duplicate/i.test(text)) return; // already uploaded on an earlier try
    const e = new Error(text || r.statusText); e.status = r.status; throw e;
  }
  let syncing = false, lastSyncError = '';
  async function sync() {
    if (syncing || !STORE) return;
    syncing = true;
    try {
      const items = (await allItems()).filter(i => i.state === 'waiting').sort((a, b) => a.createdAt - b.createdAt);
      for (const it of items) {
        if (!navigator.onLine) break;
        setSyncLine(t('Uploading...'));
        try {
          const id = await rpc('submit_product', { p_store: it.store, p_device_key: deviceKey, p_local_id: it.localId, p_qty: it.qty, p_price: it.price, p_cost: it.cost, p_source: it.source, p_photos: it.nPhotos });
          for (let i = 0; i < it.photos.length; i++) await uploadPhoto(`${it.store}/${id}/${i + 1}.jpg`, it.photos[i]);
          await rpc('finish_product', { p_id: id, p_device_key: deviceKey });
          it.remoteId = id; it.state = 'sent'; it.sentAt = Date.now(); it.error = '';
          delete it.photos; // the thumbnail stays for My products
          await putItem(it);
          lastSyncError = '';
        } catch (e) {
          lastSyncError = String(e.message || e);
          // a refused product (bad data) is marked so it does not block the rest; network errors are retried later
          if (e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) { it.error = lastSyncError.slice(0, 200); await putItem(it); continue; }
          break;
        }
      }
    } finally {
      syncing = false;
      refreshCounts();
    }
  }
  setInterval(() => { if (navigator.onLine) sync(); }, 30000);
  window.addEventListener('online', () => { sync(); refreshStatus(); });
  window.addEventListener('offline', refreshCounts);

  // ---------- status from the cloud ----------
  async function refreshStatus() {
    if (!navigator.onLine || !STORE) return;
    let remote;
    try { remote = await rpc('my_products', { p_device_key: deviceKey }); } catch (e) { return; }
    const byLocal = new Map(remote.map(r => [r.local_id, r]));
    const items = await allItems();
    for (const it of items) {
      if (it.state !== 'sent' && it.state !== 'collected') continue;
      const r = byLocal.get(it.localId);
      const was = JSON.stringify([it.state, it.remote]);
      if (r) { it.remote = { status: r.status, name: r.name, brand: r.brand, size: r.size }; it.state = 'sent'; }
      else if (it.state === 'sent' && Date.now() - (it.sentAt || 0) > 60000) it.state = 'collected'; // the shop app took it
      if (JSON.stringify([it.state, it.remote]) !== was) await putItem(it);
    }
    if (!$('#view-list').hidden) renderList();
  }

  // ---------- my products ----------
  function statusOf(it) {
    if (it.state === 'waiting') return it.error ? ['err', t('Upload problem')] : ['waiting', t('Waiting to upload')];
    if (it.state === 'collected') return ['done', t('In the shop app')];
    if (it.remote && it.remote.status === 'catalogued') return ['done', t('Catalogued')];
    return ['sent', t('Uploaded')];
  }
  const titleOf = it => (it.remote && it.remote.name) || t('Product') + ' · ' + new Date(it.createdAt).toLocaleString(lang === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  async function renderList() {
    const items = (await allItems()).sort((a, b) => b.createdAt - a.createdAt);
    const today = new Date().toDateString();
    const nToday = items.filter(i => new Date(i.createdAt).toDateString() === today).length;
    const waiting = items.filter(i => i.state === 'waiting').length;
    $('#list-head').innerHTML = `<span class="pill">${esc(t('Total {n}', { n: items.length }))}</span><span class="pill">${esc(t('Today {n}', { n: nToday }))}</span>`
      + (waiting ? `<span class="pill">${esc(t('{n} waiting to upload', { n: waiting }))}</span>` : '');
    if (!items.length) { $('#list').innerHTML = `<div class="empty">${esc(t('No products yet'))}</div>`; return; }
    $('#list').innerHTML = items.map(it => {
      const [cls, label] = statusOf(it);
      return `<div class="row" data-open="${esc(it.localId)}">${it.thumb ? `<img src="${it.thumb}" alt="">` : '<div class="ph"></div>'}
        <div class="info"><div class="t">${esc(titleOf(it))}</div>
        <div class="s">${esc(t('Qty'))} ${esc(it.qty)} · ${esc(t('Sell'))} ₹${esc(it.price)}${it.cost ? ` · ${esc(t('Buy'))} ₹${esc(it.cost)}` : ''}</div>
        <span class="st ${cls}">${esc(label)}</span></div></div>`;
    }).join('');
  }
  async function openItem(id) {
    const it = (await allItems()).find(i => i.localId === id);
    if (!it) return;
    const [, label] = statusOf(it);
    const r = it.remote || {};
    const pics = it.photos ? it.photos.map(b => URL.createObjectURL(b)) : (it.thumb ? [it.thumb] : []);
    const sh = $('#sheet');
    sh.innerHTML = `<div class="sheet"><h3>${esc(titleOf(it))}</h3>
      <div class="big">${pics.map(u => `<img src="${u}" alt="">`).join('')}</div>
      <div class="kv">
        ${r.brand ? `<b>Brand</b><span>${esc(r.brand)}</span>` : ''}${r.size ? `<b>Size</b><span>${esc(r.size)}</span>` : ''}
        <b>${esc(t('Qty'))}</b><span>${esc(it.qty)}</span>
        <b>${esc(t('Sell'))}</b><span>₹${esc(it.price)}</span>
        ${it.cost ? `<b>${esc(t('Buy'))}</b><span>₹${esc(it.cost)}</span>` : ''}
        ${it.source ? `<b>${esc(t('Source'))}</b><span style="white-space:pre-wrap">${esc(it.source)}</span>` : ''}
        <b>${esc(t('Added'))}</b><span>${esc(new Date(it.createdAt).toLocaleString('en-IN'))}</span>
        <b>${esc(t('Status'))}</b><span>${esc(label)}${it.error ? ' (' + esc(it.error) + ')' : ''}</span>
      </div>
      ${it.state === 'waiting' ? `<button class="btn ghost" data-retry>${esc(t('Upload now'))}</button><button class="btn ghost" data-delete="${esc(it.localId)}" style="color:var(--bad)">${esc(t('Delete'))}</button>` : ''}
      <button class="btn primary" data-close>${esc(t('Close'))}</button></div>`;
    sh.hidden = false;
    sh.onclick = async e => {
      if (e.target === sh || e.target.closest('[data-close]')) { sh.hidden = true; pics.forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)); }
      else if (e.target.closest('[data-retry]')) { it.error = ''; await putItem(it); sh.hidden = true; sync(); }
      else if (e.target.closest('[data-delete]')) { if (confirm(t('Delete this product? It has not been uploaded yet.'))) { await delItem(it.localId); sh.hidden = true; renderList(); refreshCounts(); } }
    };
  }

  // ---------- header line ----------
  function setSyncLine(s) { $('#sync-line').textContent = s; }
  async function refreshCounts() {
    const items = await allItems();
    const waiting = items.filter(i => i.state === 'waiting').length;
    $('#list-count').textContent = items.length || '';
    if (!navigator.onLine) setSyncLine(t('Offline') + (waiting ? ' · ' + t('{n} waiting to upload', { n: waiting }) : ''));
    else if (!syncing) setSyncLine(waiting ? t('{n} waiting to upload', { n: waiting }) : (items.length ? t('All uploaded') : ''));
    if (!$('#view-list').hidden) renderList();
  }

  let toastTimer = 0;
  function toast(msg, cls = '') {
    const el = $('#toast');
    el.textContent = msg; el.className = 'toast ' + cls; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- wiring ----------
  function showView(v) {
    hideMore();
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('#view-add').hidden = v !== 'add';
    $('#view-list').hidden = v !== 'list';
    if (v === 'list') { renderList(); refreshStatus(); }
  }
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });
  $('#photos').addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d) { const i = +d.dataset.del; URL.revokeObjectURL(photos[i].url); photos.splice(i, 1); drawPhotos(); if (!photos.length) hideMore(); return; }
    if (e.target.closest('#shot')) $('#cam').click();
  });
  $('#gal-btn').addEventListener('click', () => $('#gal').click());
  $('#cam').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f, true); else offerMore(); });
  $('#more-shot').addEventListener('click', () => { hideMore(); $('#cam').click(); });
  $('#more-done').addEventListener('click', () => { hideMore(); $('#qty').focus(); });
  $('#gal').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  for (const id of ['qty', 'price', 'cost', 'source']) $('#' + id).addEventListener('focus', hideMore);
  for (const id of ['qty', 'price', 'cost']) {
    $('#' + id).addEventListener('input', e => { const c = cleanNumber(e.target.value); if (c !== e.target.value) e.target.value = c; e.target.classList.remove('bad'); $('#err').textContent = ''; showMargin(); });
  }
  const order = ['qty', 'price', 'cost', 'source'];
  order.slice(0, -1).forEach((id, i) => $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#' + order[i + 1]).focus(); } }));
  $('#save').addEventListener('click', save);
  $('#list').addEventListener('click', e => { const r = e.target.closest('[data-open]'); if (r) openItem(r.dataset.open); });
  $('#lang-btn').addEventListener('click', () => { lang = lang === 'ta' ? 'en' : 'ta'; localStorage.setItem('lang', lang); translatePage(); drawPhotos(); showMargin(); refreshCounts(); });

  translatePage();
  drawPhotos();
  // loading screen with the shop name
  const shopName = localStorage.getItem('storeName') || (C.shops || {})[STORE] || '';
  $('#splash-shop').textContent = shopName;
  if (shopName) { $('#store-name').textContent = shopName; document.title = shopName + ' · My Store'; }
  const splashStart = Date.now();
  window.addEventListener('load', () => setTimeout(() => { $('#splash').classList.add('hide'); setTimeout(() => $('#splash').remove(), 400); }, Math.max(0, 1200 - (Date.now() - splashStart))));
  if (!STORE) {
    $('#view-add').hidden = true; $('.tabs').hidden = true; $('#no-store').hidden = false;
  } else {
    if (navigator.onLine) rpc('store_name', { p_store: STORE }).then(n => {
      if (n) { localStorage.setItem('storeName', n); $('#store-name').textContent = n; document.title = n + ' · My Store'; }
      else toast(t('This shop link is not valid'));
    }).catch(() => {});
    refreshCounts();
    sync().then(refreshStatus);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__posAdd = { allItems, sync, refreshStatus, deviceKey: () => deviceKey };
})();
