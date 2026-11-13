/* GeoLocate — map page: search, point details, measuring, saved places, share links. */
(function () {
  'use strict';
  var GL = window.GL, Geo = window.Geo;
  var $ = function (id) { return document.getElementById(id); };

  // Button labels with icons
  function label(id, icon, text) { var b = $(id); if (b) b.innerHTML = GL.icon(icon) + '<span>' + GL.esc(text) + '</span>'; }
  label('locate-btn', 'target', 'Konumum');
  label('measure-btn', 'ruler', 'Ölç');
  label('share-btn', 'share', 'Paylaş');
  label('clear-btn', 'x', 'Temizle');
  label('save-btn', 'star', 'Bu noktayı kaydet');
  label('export-csv', 'download', 'CSV');
  label('export-geojson', 'download', 'GeoJSON');
  document.querySelectorAll('[data-icon]').forEach(function (el) { el.innerHTML = GL.icon(el.getAttribute('data-icon')); });

  var state = { point: null, zoom: 13 };
  var map = null, marker = null, accuracy = null, layers = {}, savedLayer = null;
  var measure = { on: false, pts: [], line: null, poly: null, dots: [] };

  /* ---------- map ---------- */
  function initMap() {
    if (typeof L === 'undefined') {
      $('map-loading').innerHTML = '<div style="padding:0 20px">' + GL.icon('warn', '') +
        '<p><strong>Harita yüklenemedi.</strong><br>İnternet bağlantını kontrol edip sayfayı yenile. Koordinat arama ve diğer araçlar çalışmaya devam eder.</p>' +
        '<button class="btn btn-sm" type="button" onclick="location.reload()">Yenile</button></div>';
      return;
    }
    map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([39.0, 35.2], 6);
    layers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
    layers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' });
    layers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap' });
    var saved = GL.store.get('gl-layer', 'street');
    (layers[saved] || layers.street).addTo(map);
    setLayerButtons(layers[saved] ? saved : 'street');
    L.control.scale({ imperial: false }).addTo(map);
    savedLayer = L.layerGroup().addTo(map);
    map.whenReady(function () { $('map-loading').classList.add('done'); setTimeout(function () { map.invalidateSize(); }, 120); });
    map.on('click', function (e) {
      if (measure.on) addMeasurePoint(e.latlng.lat, e.latlng.lng);
      else select(e.latlng.lat, e.latlng.lng, { source: 'Haritadan seçildi', keepZoom: true });
    });
  }

  function setLayerButtons(key) {
    document.querySelectorAll('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-layer') === key ? 'true' : 'false'); });
  }
  document.querySelectorAll('[data-layer]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!map) return;
      var key = b.getAttribute('data-layer');
      Object.keys(layers).forEach(function (k) { if (map.hasLayer(layers[k])) map.removeLayer(layers[k]); });
      layers[key].addTo(map);
      setLayerButtons(key);
      GL.store.set('gl-layer', key);
    });
  });

  function pinIcon() { return L.divIcon({ className: '', html: '<div class="gl-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }); }

  /* ---------- selecting a point ---------- */
  function select(lat, lng, opts) {
    opts = opts || {};
    if (!Geo.valid(lat, lng)) { GL.toast('Geçersiz koordinat', 'err'); return; }
    state.point = { lat: lat, lng: lng };
    $('lat').value = lat.toFixed(6);
    $('lng').value = lng.toFixed(6);
    $('pt-source').textContent = opts.source || '';
    if (map) {
      if (accuracy && !opts.keepAccuracy) { map.removeLayer(accuracy); accuracy = null; }
      if (marker) marker.setLatLng([lat, lng]);
      else marker = L.marker([lat, lng], { icon: pinIcon(), keyboard: false }).addTo(map);
      if (opts.bounds) map.fitBounds(opts.bounds, { maxZoom: 17, padding: [30, 30] });
      else if (!opts.keepZoom) map.flyTo([lat, lng], opts.zoom || Math.max(map.getZoom(), 15), { duration: 0.9 });
    }
    renderPoint(lat, lng, opts.name);
    updateHash();
  }

  function row(key, value, copyValue, mono) {
    return '<div class="kv-row"><div class="kv-key">' + GL.esc(key) + '</div><div class="kv-val' + (mono ? ' mono' : '') + '">' + GL.esc(value) + '</div>' +
      (copyValue ? GL.copyBtn(copyValue, key + ' kopyala') : '<span></span>') + '</div>';
  }

  function renderPoint(lat, lng, name) {
    var utm = Geo.toUTM(lat, lng);
    var links = Geo.links(lat, lng);
    var dd = Geo.dd(lat, lng);
    var dms = Geo.toDMS(lat, true) + ', ' + Geo.toDMS(lng, false);
    var ddm = Geo.toDDM(lat, true) + ', ' + Geo.toDDM(lng, false);
    var gh = Geo.geohash(lat, lng, 9);
    $('point').innerHTML =
      '<div class="address-block"><div class="addr" id="addr">' + (name ? GL.esc(name) : '<span class="skeleton"></span>') + '</div>' +
      '<div class="addr-sub" id="addr-sub">' + (name ? '' : 'Adres aranıyor…') + '</div></div>' +
      '<div class="kv">' +
      row('Ondalık', dd, dd, true) +
      row('DMS', dms, dms, true) +
      row('DDM', ddm, ddm, true) +
      row('UTM', Geo.formatUTM(utm), utm ? Geo.formatUTM(utm) : '', true) +
      row('Geohash', gh, gh, true) +
      '<div class="kv-row"><div class="kv-key">Posta kodu</div><div class="kv-val" id="postal">—</div><span></span></div>' +
      '</div>' +
      '<div class="open-in">' +
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + links.google + '">' + GL.icon('external') + 'Google Maps</a>' +
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + links.osm + '">' + GL.icon('external') + 'OpenStreetMap</a>' +
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + links.apple + '">' + GL.icon('external') + 'Apple Haritalar</a>' +
      '</div>';
    reverse(lat, lng);
  }

  /* ---------- reverse geocoding (Nominatim: at most one request per second) ---------- */
  var revTimer = null, revLast = 0, revSeq = 0;
  function reverse(lat, lng) {
    clearTimeout(revTimer);
    var seq = ++revSeq;
    var wait = Math.max(0, 1100 - (Date.now() - revLast));
    revTimer = setTimeout(function () {
      revLast = Date.now();
      GL.json('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=tr&lat=' + lat + '&lon=' + lng, 9000)
        .then(function (d) {
          if (seq !== revSeq || !$('addr')) return;
          var a = d.address || {};
          var place = [a.road && (a.road + (a.house_number ? ' ' + a.house_number : '')), a.neighbourhood || a.suburb || a.quarter].filter(Boolean).join(', ');
          var area = [a.town || a.city || a.village || a.county, a.province || a.state, a.country].filter(Boolean).join(' / ');
          $('addr').textContent = d.name || place || area || (d.error ? 'Bu noktada adres yok (deniz ya da boş alan)' : 'Adres bulunamadı');
          $('addr-sub').textContent = d.name || place ? area : '';
          $('postal').textContent = a.postcode || '—';
        })
        .catch(function () {
          if (seq !== revSeq || !$('addr')) return;
          $('addr').textContent = 'Adres şu an alınamadı';
          $('addr-sub').textContent = 'Adres servisi yanıt vermedi; koordinatlar doğru.';
        });
    }, wait);
  }

  /* ---------- search ---------- */
  var results = $('search-results');
  function hideResults() { results.hidden = true; results.innerHTML = ''; }
  $('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('search-input').value.trim();
    if (!q) { GL.toast('Bir adres ya da koordinat yaz', 'err'); return; }
    var parsed = Geo.parse(q);
    if (parsed) {
      hideResults();
      var src = { decimal: 'Koordinat', dms: 'Derece/dakika/saniye', utm: 'UTM', geohash: 'Geohash', link: 'Harita bağlantısı' }[parsed.source] || 'Koordinat';
      select(parsed.lat, parsed.lng, { source: src + ' çözüldü' });
      return;
    }
    results.hidden = false;
    results.innerHTML = '<li class="loader"><div class="spinner"></div>Aranıyor…</li>';
    GL.json('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&accept-language=tr&q=' + encodeURIComponent(q), 9000)
      .then(function (list) {
        if (!list || !list.length) { results.innerHTML = '<li class="note info">' + GL.icon('info') + '<span>Sonuç bulunamadı. Daha açık yaz (ör. "Kızılay, Ankara") ya da koordinat gir.</span></li>'; return; }
        results.innerHTML = '';
        list.forEach(function (r) {
          var li = document.createElement('li');
          var b = document.createElement('button');
          b.type = 'button';
          var parts = String(r.display_name || '').split(', ');
          b.innerHTML = '<span class="r-pin">' + GL.icon('pin') + '</span><span><span class="r-name"></span><br><span class="r-sub"></span></span>';
          b.querySelector('.r-name').textContent = r.name || parts[0] || 'Yer';
          b.querySelector('.r-sub').textContent = parts.slice(1).join(', ');
          b.addEventListener('click', function () {
            var bb = r.boundingbox ? [[+r.boundingbox[0], +r.boundingbox[2]], [+r.boundingbox[1], +r.boundingbox[3]]] : null;
            hideResults();
            select(parseFloat(r.lat), parseFloat(r.lon), { source: 'Aramadan', name: r.display_name, bounds: bb });
          });
          li.appendChild(b);
          results.appendChild(li);
        });
        var first = results.querySelector('button');
        if (first) first.focus();
      })
      .catch(function () {
        results.innerHTML = '<li class="note error">' + GL.icon('warn') + '<span>Arama servisi yanıt vermedi. Biraz sonra tekrar dene; koordinat girerek aramak her zaman çalışır.</span></li>';
      });
  });

  /* ---------- toolbar ---------- */
  function goFromInputs() {
    var la = $('lat').value.trim(), lo = $('lng').value.trim();
    var p = Geo.parse(la + (lo ? ', ' + lo : ''));
    if (!p && !lo) p = Geo.parse(la); // whole coordinate pasted into the first box
    if (!p) { GL.toast('Geçerli bir koordinat gir (ör. 39.92, 32.86)', 'err'); return; }
    select(p.lat, p.lng, { source: 'Elle girildi' });
  }
  $('go-btn').addEventListener('click', goFromInputs);
  ['lat', 'lng'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') goFromInputs(); });
  });
  // Pasting "39.9, 32.8" into one box fills both
  $('lat').addEventListener('paste', function (e) {
    var t = (e.clipboardData || window.clipboardData).getData('text');
    var p = Geo.parse(t);
    if (p) { e.preventDefault(); select(p.lat, p.lng, { source: 'Yapıştırıldı' }); }
  });

  $('locate-btn').addEventListener('click', function () {
    if (!navigator.geolocation) { GL.toast('Tarayıcın konum özelliğini desteklemiyor', 'err'); return; }
    var btn = this;
    btn.disabled = true;
    GL.toast('Konumun alınıyor…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      var c = pos.coords;
      select(c.latitude, c.longitude, { source: 'Cihaz konumu (±' + Math.round(c.accuracy) + ' m)', zoom: 16 });
      if (map) {
        accuracy = L.circle([c.latitude, c.longitude], { radius: c.accuracy, color: '#34d399', weight: 1, fillOpacity: 0.1 }).addTo(map);
      }
      GL.toast('Konumun bulundu', 'ok');
    }, function (err) {
      btn.disabled = false;
      GL.toast({ 1: 'Konum izni verilmedi', 2: 'Konum belirlenemedi', 3: 'Konum zaman aşımına uğradı' }[err.code] || 'Konum alınamadı', 'err');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });

  $('clear-btn').addEventListener('click', function () {
    if (marker && map) { map.removeLayer(marker); marker = null; }
    if (accuracy && map) { map.removeLayer(accuracy); accuracy = null; }
    state.point = null;
    $('lat').value = ''; $('lng').value = '';
    $('pt-source').textContent = '';
    $('point').innerHTML = '<div class="point-empty">' + GL.icon('pin') + 'Haritada bir yere dokun ya da yukarıdan ara.</div>';
    if (measure.on) stopMeasure();
    history.replaceState(null, '', location.pathname + location.search);
  });

  /* ---------- share link (#lat,lng,zoom) ---------- */
  function updateHash() {
    if (!state.point) return;
    var z = map ? map.getZoom() : 15;
    history.replaceState(null, '', '#' + state.point.lat.toFixed(6) + ',' + state.point.lng.toFixed(6) + ',' + z);
  }
  $('share-btn').addEventListener('click', function () {
    if (!state.point) { GL.toast('Önce bir nokta seç', 'err'); return; }
    updateHash();
    var url = location.href;
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ title: 'GeoLocate konumu', text: Geo.dd(state.point.lat, state.point.lng), url: url }).catch(function () {});
    } else GL.copy(url);
  });
  function readHash() {
    var m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d{1,2}))?/);
    if (!m) return false;
    var lat = parseFloat(m[1]), lng = parseFloat(m[2]), z = m[3] ? parseInt(m[3], 10) : 15;
    if (!Geo.valid(lat, lng)) return false;
    if (map) map.setView([lat, lng], Math.min(Math.max(z, 2), 19));
    select(lat, lng, { source: 'Paylaşılan bağlantı', keepZoom: true });
    return true;
  }
  window.addEventListener('hashchange', readHash);

  /* ---------- measuring ---------- */
  function startMeasure() {
    if (!map) { GL.toast('Harita yüklenmeden ölçüm yapılamaz', 'err'); return; }
    measure.on = true;
    $('measure-btn').classList.add('is-on');
    $('measure-btn').setAttribute('aria-pressed', 'true');
    $('measure-bar').hidden = false;
    map.getContainer().classList.add('measuring');
    drawMeasure();
  }
  function stopMeasure() {
    measure.on = false;
    $('measure-btn').classList.remove('is-on');
    $('measure-btn').setAttribute('aria-pressed', 'false');
    $('measure-bar').hidden = true;
    if (map) map.getContainer().classList.remove('measuring');
    clearMeasureLayers();
    measure.pts = [];
  }
  function clearMeasureLayers() {
    if (!map) return;
    if (measure.line) map.removeLayer(measure.line);
    if (measure.poly) map.removeLayer(measure.poly);
    measure.dots.forEach(function (d) { map.removeLayer(d); });
    measure.line = measure.poly = null;
    measure.dots = [];
  }
  function addMeasurePoint(lat, lng) { measure.pts.push({ lat: lat, lng: lng }); drawMeasure(); }
  function drawMeasure() {
    clearMeasureLayers();
    var pts = measure.pts, ll = pts.map(function (p) { return [p.lat, p.lng]; });
    pts.forEach(function (p) {
      measure.dots.push(L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div class="gl-dot"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), interactive: false }).addTo(map));
    });
    if (pts.length >= 2) measure.line = L.polyline(ll, { color: '#f5c84c', weight: 3, dashArray: '6 6' }).addTo(map);
    if (pts.length >= 3) measure.poly = L.polygon(ll, { color: '#34d399', weight: 0, fillOpacity: 0.12, interactive: false }).addTo(map);
    var len = Geo.pathLength(pts);
    $('m-total').textContent = Geo.fmtDistance(len);
    $('m-sub').textContent = pts.length === 0 ? 'Haritaya dokunarak nokta ekle' :
      pts.length === 1 ? '1 nokta · devam et' :
      pts.length + ' nokta' + (pts.length >= 3 ? ' · alan ' + Geo.fmtArea(Geo.area(pts)) : '');
    $('m-undo').disabled = pts.length === 0;
  }
  $('measure-btn').addEventListener('click', function () { if (measure.on) stopMeasure(); else startMeasure(); });
  $('m-undo').addEventListener('click', function () { measure.pts.pop(); drawMeasure(); });
  $('m-done').addEventListener('click', function () {
    if (measure.pts.length >= 2) {
      var txt = Geo.fmtDistance(Geo.pathLength(measure.pts)) + (measure.pts.length >= 3 ? ' · alan ' + Geo.fmtArea(Geo.area(measure.pts)) : '');
      GL.toast('Ölçüm: ' + txt, 'ok');
    }
    stopMeasure();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && measure.on) stopMeasure(); });

  /* ---------- saved places ---------- */
  function getSaved() { var a = GL.store.get('gl-saved', []); return Array.isArray(a) ? a.filter(function (s) { return s && Geo.valid(s.lat, s.lng); }) : []; }
  function renderSaved() {
    var list = getSaved(), el = $('saved-list');
    $('saved-count').textContent = list.length ? list.length + ' yer' : '';
    if (savedLayer) savedLayer.clearLayers();
    if (!list.length) { el.innerHTML = '<li class="saved-empty">Henüz kayıtlı yer yok. Bir nokta seçip <strong>Bu noktayı kaydet</strong>e bas.</li>'; return; }
    el.innerHTML = '';
    list.forEach(function (s, i) {
      var li = document.createElement('li');
      li.className = 'saved-item';
      li.innerHTML = '<button class="s-main" type="button"><div class="s-name"></div><div class="s-co"></div></button>' +
        GL.copyBtn(Geo.dd(s.lat, s.lng), 'Koordinatı kopyala') +
        '<button class="copy-btn" type="button" data-del="' + i + '" aria-label="Sil" title="Sil">' + GL.icon('trash') + '</button>';
      li.querySelector('.s-name').textContent = s.name;
      li.querySelector('.s-co').textContent = Geo.dd(s.lat, s.lng, 5);
      li.querySelector('.s-main').addEventListener('click', function () { select(s.lat, s.lng, { source: 'Kayıtlı yer', name: s.name }); });
      el.appendChild(li);
      if (savedLayer) {
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<div class="gl-saved"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), title: s.name })
          .on('click', function () { select(s.lat, s.lng, { source: 'Kayıtlı yer', name: s.name, keepZoom: true }); })
          .addTo(savedLayer);
      }
    });
  }
  $('saved-list').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]');
    if (!d) return;
    var list = getSaved(), i = parseInt(d.getAttribute('data-del'), 10), gone = list[i];
    list.splice(i, 1);
    GL.store.set('gl-saved', list);
    renderSaved();
    if (gone) GL.toast('"' + gone.name + '" silindi');
  });
  $('save-btn').addEventListener('click', function () {
    if (!state.point) { GL.toast('Önce bir nokta seç', 'err'); return; }
    $('save-form').hidden = false;
    var addr = $('addr') && $('addr').textContent;
    $('save-name').value = addr && !/aranıyor|alınamadı|bulunamadı|yok/i.test(addr) ? addr.split(',')[0].slice(0, 60) : 'Yer ' + (getSaved().length + 1);
    $('save-name').focus();
    $('save-name').select();
  });
  $('save-cancel').addEventListener('click', function () { $('save-form').hidden = true; });
  $('save-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!state.point) return;
    var name = $('save-name').value.trim() || 'Yer ' + (getSaved().length + 1);
    var list = getSaved();
    list.unshift({ name: name, lat: +state.point.lat.toFixed(6), lng: +state.point.lng.toFixed(6), ts: Date.now() });
    if (list.length > 200) list.length = 200;
    if (!GL.store.set('gl-saved', list)) { GL.toast('Bu tarayıcıda kayıt yapılamıyor (gizli sekme olabilir)', 'err'); return; }
    $('save-form').hidden = true;
    renderSaved();
    GL.toast('Kaydedildi: ' + name, 'ok');
  });
  $('export-csv').addEventListener('click', function () {
    var list = getSaved();
    if (!list.length) { GL.toast('Dışa aktarılacak kayıt yok', 'err'); return; }
    var csv = '﻿Ad;Enlem;Boylam;Kayıt tarihi\n' + list.map(function (s) {
      return '"' + String(s.name).replace(/"/g, '""') + '";' + s.lat + ';' + s.lng + ';' + (s.ts ? new Date(s.ts).toISOString() : '');
    }).join('\n');
    GL.download('geolocate-yerler.csv', csv, 'text/csv;charset=utf-8');
  });
  $('export-geojson').addEventListener('click', function () {
    var list = getSaved();
    if (!list.length) { GL.toast('Dışa aktarılacak kayıt yok', 'err'); return; }
    var gj = { type: 'FeatureCollection', features: list.map(function (s) {
      return { type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
    }) };
    GL.download('geolocate-yerler.geojson', JSON.stringify(gj, null, 2), 'application/geo+json');
  });

  /* ---------- theme change: Leaflet needs a size recheck ---------- */
  document.addEventListener('gl:theme', function () { if (map) setTimeout(function () { map.invalidateSize(); }, 250); });
  window.addEventListener('resize', function () { if (map) map.invalidateSize(); });

  initMap();
  renderSaved();
  readHash();
})();
