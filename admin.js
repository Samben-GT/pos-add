// Admin page: Sam logs in with the admin password, creates stores, sets PIN / phase / location,
// sees and edits products waiting in the cloud, and adds products on behalf of a store.
(() => {
  'use strict';
  const C = window.POS_CONFIG;
  const API = C.url + '/functions/v1/admin';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let token = localStorage.getItem('adminToken') || '';
  let stores = [];
  let current = null, tab = 'items';

  async function call(action, data = {}) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin': token }, body: JSON.stringify({ action, ...data }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && action !== 'login') { token = ''; localStorage.removeItem('adminToken'); showLogin(); throw new Error('Please log in again'); }
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  let tt = 0;
  function toast(m, ok) { const el = $('#toast'); el.textContent = m; el.className = 'toast' + (ok ? ' ok' : ''); el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }
  const fail = e => toast(String(e.message || e));
  function copy(text) { navigator.clipboard.writeText(text).then(() => toast('Copied', true), () => toast(text)); }
  function share(text) { if (navigator.share) navigator.share({ text }).catch(() => {}); else copy(text); }

  // ---------- login ----------
  function showLogin() {
    $('#logout').hidden = true; $('#back').hidden = true; $('#title').textContent = 'My Store Admin'; $('#sub').textContent = '';
    $('#main').innerHTML = `<div class="card"><h3>Log in</h3>
      <label class="field"><span>Admin password</span><input id="pw" type="password" autocomplete="current-password"></label>
      <div class="err" id="err"></div><button class="btn primary" id="login">Log in</button></div>`;
    const go = async () => {
      try { const j = await call('login', { password: $('#pw').value }); token = j.token; localStorage.setItem('adminToken', token); loadStores(); }
      catch (e) { $('#err').textContent = e.message; }
    };
    $('#login').onclick = go;
    $('#pw').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#pw').focus();
  }

  // ---------- stores ----------
  async function loadStores() {
    try { stores = (await call('stores')).stores; showStores(); } catch (e) { fail(e); }
  }
  function storeCard(s) {
    return `<div class="card"><div class="row-between"><h3>${esc(s.name)}</h3><span class="badge ${s.phase}">${s.phase === 'live' ? 'Live (POS)' : 'Adding stock'}</span></div>
      <div class="muted">${esc([s.area, s.city].filter(Boolean).join(', ') || 'No location')} · code ${esc(s.code)}</div>
      <div class="stats-line"><span class="pill">${s.waiting} being named</span><span class="pill">${s.ready} ready for POS</span><span class="pill">${s.catalog} in customer list</span><span class="pill">${s.phones} phones${s.has_pin ? ' · PIN on' : ''}</span></div>
      <div class="btns"><button class="btn primary small" data-open="${esc(s.code)}">Open</button></div></div>`;
  }
  function showStores() {
    current = null;
    $('#logout').hidden = false; $('#back').hidden = true; $('#title').textContent = 'Stores'; $('#sub').textContent = `${stores.length} store${stores.length === 1 ? '' : 's'}`;
    $('#main').innerHTML = `<button class="btn primary" id="new">+ New store</button>${stores.map(storeCard).join('')}
      <div class="btns" style="margin-top:18px"><button class="btn ghost small" id="pwc">Change admin password</button></div>`;
    $('#new').onclick = newStoreSheet;
    $('#pwc').onclick = async () => { const p = prompt('New admin password (at least 8 characters)'); if (!p) return; try { await call('change_password', { password: p }); toast('Password changed', true); } catch (e) { fail(e); } };
    $('#main').querySelectorAll('[data-open]').forEach(b => { b.onclick = () => openStore(b.dataset.open); });
  }

  // a Google Maps link or "lat, lng" -> numbers
  function parseLoc(v) {
    const m = String(v || '').match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) || String(v || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  }
  function locFields(s = {}) {
    return `<div class="grid2"><label class="field"><span>Area</span><input id="f-area" value="${esc(s.area || '')}" placeholder="e.g. Chromepet"></label>
      <label class="field"><span>City</span><input id="f-city" value="${esc(s.city || '')}" placeholder="e.g. Chennai"></label></div>
      <label class="field"><span>Location (Google Maps link or lat, lng)</span><input id="f-loc" value="${s.lat != null ? esc(s.lat + ', ' + s.lng) : ''}" placeholder="Paste a Maps link"></label>
      <button class="link" id="f-here" type="button">Use my current location</button>`;
  }
  function bindLoc() {
    $('#f-here').onclick = () => navigator.geolocation.getCurrentPosition(p => { $('#f-loc').value = p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6); }, () => toast('Location not available'), { enableHighAccuracy: true, timeout: 10000 });
  }
  function sheet(html) { const sh = $('#sheet'); sh.innerHTML = `<div class="sheet">${html}</div>`; sh.hidden = false; sh.onclick = e => { if (e.target === sh) sh.hidden = true; }; return sh; }
  function newStoreSheet() {
    sheet(`<h3>New store</h3>
      <label class="field"><span>Store name</span><input id="f-name" placeholder="e.g. Sri Murugan Stores"></label>
      ${locFields()}
      <label class="field"><span>Owner name / phone</span><input id="f-contact"></label>
      <label class="field"><span>Shop link PIN (optional, 4 to 6 digits)</span><input id="f-pin" inputmode="numeric" maxlength="6"></label>
      <div class="err" id="f-err"></div>
      <button class="btn primary" id="f-save">Create store</button>`);
    bindLoc();
    $('#f-save').onclick = async () => {
      const loc = parseLoc($('#f-loc').value) || {};
      try {
        const j = await call('create_store', { name: $('#f-name').value, area: $('#f-area').value, city: $('#f-city').value, contact: $('#f-contact').value, pin: $('#f-pin').value.replace(/\D/g, ''), ...loc });
        stores = j.stores; $('#sheet').hidden = true; openStore(j.code); toast('Store created', true);
      } catch (e) { $('#f-err').textContent = e.message; }
    };
  }

  // ---------- one store ----------
  function openStore(code) {
    current = stores.find(s => s.code === code);
    if (!current) return showStores();
    const s = current;
    $('#back').hidden = false; $('#title').textContent = s.name; $('#sub').textContent = [s.area, s.city].filter(Boolean).join(', ');
    $('#main').innerHTML = `<div class="card"><div class="row-between"><h3>Stage</h3><span class="badge ${s.phase}">${s.phase === 'live' ? 'Live (POS)' : 'Adding stock'}</span></div>
        <p class="muted">${s.phase === 'live' ? 'The shop link is closed. The shop bills with the POS app. You can still add products here.' : 'Staff add stock with the shop link. When the stock is in, switch to Live.'}</p>
        <div class="btns"><button class="btn ${s.phase === 'live' ? 'ghost' : 'primary'} small" id="phase">${s.phase === 'live' ? 'Reopen shop link' : 'Go live: close shop link'}</button></div></div>
      <div class="card"><h3>Shop link (adding stock)</h3><div class="code-box">${esc(s.link)}</div>
        <div class="btns"><button class="btn small" id="link-copy">Copy</button><button class="btn small" id="link-share">Send</button><button class="btn small" id="pin">${s.has_pin ? 'Change PIN' : 'Set PIN'}</button>${s.has_pin ? '<button class="btn small danger" id="pin-off">Remove PIN</button>' : ''}</div></div>
      <div class="card"><h3>POS setup code</h3><p class="muted">Enter in the POS app: Settings &gt; Shop link.</p><div class="code-box">${esc(s.setup_code || 'not available')}</div>
        <div class="btns"><button class="btn small" id="code-copy">Copy</button><button class="btn small danger" id="code-new">Make new code</button></div></div>
      <div class="card"><h3>Details</h3>
        <label class="field"><span>Store name</span><input id="f-name" value="${esc(s.name)}"></label>${locFields(s)}
        <label class="field"><span>Owner name / phone</span><input id="f-contact" value="${esc(s.contact || '')}"></label>
        <button class="btn small" id="f-save" style="width:auto">Save details</button></div>
      <div class="tabs2"><button data-tab="items" class="${tab === 'items' ? 'on' : ''}">Products in cloud</button><button data-tab="add" class="${tab === 'add' ? 'on' : ''}">Add product</button></div>
      <div id="tabbody"></div>`;
    bindLoc();
    $('#phase').onclick = async () => {
      const to = s.phase === 'live' ? 'onboarding' : 'live';
      if (to === 'live' && !confirm('Close the shop link for ' + s.name + '? Staff will no longer be able to add stock.')) return;
      try { stores = (await call('update_store', { code: s.code, fields: { phase: to } })).stores; openStore(s.code); toast(to === 'live' ? 'Store is live' : 'Shop link reopened', true); } catch (e) { fail(e); }
    };
    $('#link-copy').onclick = () => copy(s.link);
    $('#link-share').onclick = () => share(`Open this link in Chrome, tap Install, then add the shop's products with photos:\n${s.link}${s.has_pin ? '\nAsk the owner for the PIN.' : ''}`);
    $('#pin').onclick = async () => {
      const p = (prompt('New PIN for the shop link (4 to 6 digits). Phones already in must enter it again.') || '').replace(/\D/g, '');
      if (!p) return; if (p.length < 4) return toast('Use 4 to 6 digits');
      try { stores = (await call('update_store', { code: s.code, fields: { pin: p } })).stores; openStore(s.code); toast('PIN set: ' + p, true); } catch (e) { fail(e); }
    };
    if ($('#pin-off')) $('#pin-off').onclick = async () => { try { stores = (await call('update_store', { code: s.code, fields: { pin: '' } })).stores; openStore(s.code); toast('PIN removed', true); } catch (e) { fail(e); } };
    $('#code-copy').onclick = () => copy(s.setup_code || '');
    $('#code-new').onclick = async () => {
      if (!confirm('Make a new POS setup code? The old code stops working and must be replaced in the POS app.')) return;
      try { stores = (await call('new_key', { code: s.code })).stores; openStore(s.code); toast('New code made', true); } catch (e) { fail(e); }
    };
    $('#f-save').onclick = async () => {
      const raw = $('#f-loc').value.trim(); const loc = parseLoc(raw);
      if (raw && !loc) return toast('Could not read that location');
      try {
        stores = (await call('update_store', { code: s.code, fields: { name: $('#f-name').value, area: $('#f-area').value, city: $('#f-city').value, contact: $('#f-contact').value, lat: loc ? loc.lat : '', lng: loc ? loc.lng : '' } })).stores;
        openStore(s.code); toast('Saved', true);
      } catch (e) { fail(e); }
    };
    $('#main').querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; openStore(s.code); }; });
    if (tab === 'items') showItems(); else showAdd();
  }

  async function showItems() {
    const box = $('#tabbody');
    box.innerHTML = '<div class="card muted">Loading...</div>';
    let items;
    try { items = (await call('items', { store: current.code })).items; } catch (e) { box.innerHTML = ''; return fail(e); }
    const label = { uploading: 'Uploading', new: 'Being named', catalogued: 'Named, ready for POS', failed: 'Not named' };
    box.innerHTML = `<div class="card"><div class="row-between"><h3>${items.length} product${items.length === 1 ? '' : 's'}</h3><button class="btn small" id="name-now">Name them now</button></div>
      <p class="muted">Products stay here until the POS app collects them. Changes here go to the POS app.</p>
      ${items.map(it => `<div class="item" data-id="${it.id}">${it.photos[0] ? `<a href="${esc(it.photos[0])}" target="_blank"><img src="${esc(it.photos[0])}" alt=""></a>` : '<div class="ph"></div>'}
        <div><div class="row-between"><span class="st2 ${it.status}">${label[it.status] || it.status}</span><span class="muted">${new Date(it.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${it.added_by ? ' · by admin' : ''}</span></div>
          <input data-f="name" value="${esc(it.name || '')}" placeholder="Name (filled overnight)" style="margin-top:6px">
          <input data-f="tamil_name" value="${esc(it.tamil_name || '')}" placeholder="Tamil name (for voice billing)" style="margin-top:6px">
          <div class="mini"><label>Qty<input data-f="qty" inputmode="decimal" value="${esc(it.qty)}"></label><label>Sell ₹<input data-f="price" inputmode="decimal" value="${esc(it.price)}"></label><label>Buy ₹<input data-f="cost" inputmode="decimal" value="${esc(it.cost == null ? '' : it.cost)}"></label></div>
          <textarea data-f="source" rows="2" placeholder="Source" style="margin-top:6px;min-height:0">${esc(it.source || '')}</textarea>
          <div class="muted">${esc([it.brand, it.size, it.category, it.barcode ? 'barcode ' + it.barcode : '', it.ai_note].filter(Boolean).join(' · '))}</div>
          ${it.photos.length > 1 ? `<div class="pics">${it.photos.slice(1).map(u => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}" alt=""></a>`).join('')}</div>` : ''}
          <div class="btns"><button class="btn small primary" data-save>Save</button><button class="btn small danger" data-del>Delete</button></div></div></div>`).join('')}</div>`;
    $('#name-now').onclick = async () => {
      toast('Naming... this can take a minute');
      try { const r = await call('catalogue_now'); toast(r.skipped ? r.skipped : `Named ${r.done || 0}`, true); showItems(); } catch (e) { fail(e); }
    };
    box.querySelectorAll('.item').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-save]').onclick = async () => {
        const fields = {};
        row.querySelectorAll('[data-f]').forEach(i => { fields[i.dataset.f] = i.value.trim(); });
        try { await call('update_item', { id, fields }); toast('Saved', true); } catch (e) { fail(e); }
      };
      row.querySelector('[data-del]').onclick = async () => {
        if (!confirm('Delete this product and its photos?')) return;
        try { await call('delete_item', { id }); row.remove(); toast('Deleted', true); } catch (e) { fail(e); }
      };
    });
  }

  // ---------- add on behalf of the store ----------
  let photos = [];
  function draw(img, max) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const toJpeg = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { draw(img, 1280).toBlob(b => { URL.revokeObjectURL(url); b ? res(b) : rej(new Error('bad image')); }, 'image/jpeg', 0.8); };
    img.onerror = () => rej(new Error('Could not read that picture'));
    img.src = url;
  });
  function showAdd() {
    photos = [];
    $('#tabbody').innerHTML = `<div class="card"><h3>Add product for ${esc(current.name)}</h3>
      <div class="field"><span>Photos (1 to 4)</span><div class="photos" id="a-photos"></div>
        <input type="file" id="a-file" accept="image/*" multiple hidden></div>
      <label class="field"><span>Product name (optional)</span><input id="a-name"></label>
      <div class="grid2"><label class="field"><span>Quantity *</span><input id="a-qty" inputmode="decimal"></label>
        <label class="field"><span>Selling price ₹ *</span><input id="a-price" inputmode="decimal"></label>
        <label class="field"><span>Buying price ₹</span><input id="a-cost" inputmode="decimal"></label></div>
      <label class="field"><span>Source</span><textarea id="a-source" rows="3"></textarea></label>
      <div class="err" id="a-err"></div><button class="btn primary" id="a-save">Save and add next</button></div>`;
    const drawP = () => {
      $('#a-photos').innerHTML = [0, 1, 2, 3].map(i => photos[i] ? `<div class="slot"><img src="${URL.createObjectURL(photos[i])}"><button class="x" data-x="${i}">×</button></div>`
        : i === photos.length ? '<button class="slot add" id="a-add">+ Photo</button>' : '<div class="slot empty"></div>').join('');
    };
    drawP();
    $('#a-photos').onclick = e => {
      const x = e.target.closest('[data-x]'); if (x) { photos.splice(+x.dataset.x, 1); drawP(); return; }
      if (e.target.closest('#a-add')) $('#a-file').click();
    };
    $('#a-file').onchange = async e => { for (const f of [...e.target.files]) { if (photos.length >= 4) break; try { photos.push(await toJpeg(f)); } catch (er) { fail(er); } } e.target.value = ''; drawP(); };
    for (const id of ['a-qty', 'a-price', 'a-cost']) $('#' + id).oninput = e => { e.target.value = e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); };
    $('#a-save').onclick = async () => {
      const err = $('#a-err');
      if (!photos.length) return (err.textContent = 'Add at least 1 photo');
      if (!(Number($('#a-qty').value) > 0)) return (err.textContent = 'Enter the quantity');
      if (!(Number($('#a-price').value) > 0)) return (err.textContent = 'Enter the selling price');
      err.textContent = 'Uploading...';
      try {
        const j = await call('add_item', { store: current.code, name: $('#a-name').value, qty: $('#a-qty').value, price: $('#a-price').value, cost: $('#a-cost').value, source: $('#a-source').value, photos: photos.length });
        for (let i = 0; i < photos.length; i++) {
          const r = await fetch(j.uploads[i], { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: photos[i] });
          if (!r.ok) throw new Error('Photo upload failed (' + r.status + ')');
        }
        await call('finish_item', { id: j.id });
        const keepSource = $('#a-source').value;
        showAdd(); $('#a-source').value = keepSource;
        toast('Saved. It will be named overnight, or tap Name them now.', true);
      } catch (e) { err.textContent = e.message; }
    };
  }

  $('#back').onclick = () => loadStores();
  $('#logout').onclick = () => { token = ''; localStorage.removeItem('adminToken'); showLogin(); };
  if (token) loadStores(); else showLogin();
})();
