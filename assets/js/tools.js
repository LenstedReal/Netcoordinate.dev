/* GeoLocate — tools page: converter, distance & bearing, batch conversion. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = GL.esc;

  document.querySelectorAll('[data-icon]').forEach(function (el) { el.innerHTML = GL.icon(el.getAttribute('data-icon')); });
  document.querySelectorAll('[data-icon-inline]').forEach(function (el) { el.outerHTML = GL.icon(el.getAttribute('data-icon-inline')); });

  function errNote(msg) {
    return '<div class="note error" style="margin-top:14px">' + GL.icon('warn') + '<span>' + esc(msg) + '</span></div>';
  }
  function row(key, val) {
    return '<div class="out-row"><span class="o-key">' + esc(key) + '</span><span class="o-val">' + esc(val) + '</span>' + GL.copyBtn(val, key + ' kopyala') + '</div>';
  }
  function mapLink(p, z) { return './#' + p.lat.toFixed(6) + ',' + p.lng.toFixed(6) + ',' + (z || 15); }
  function dms(p) { return Geo.toDMS(p.lat, true) + ' / ' + Geo.toDMS(p.lng, false); }
  function utm(p) { try { return Geo.formatUTM(Geo.toUTM(p.lat, p.lng)); } catch (e) { return '—'; } }

  /* ---------- a) converter ---------- */
  var convIn = $('conv-input'), convOut = $('conv-out');
  function convert() {
    var v = convIn.value.trim();
    if (!v) { convOut.innerHTML = ''; return; }
    var p = Geo.parse(v);
    if (!p) { convOut.innerHTML = errNote('Bu girdi anlaşılamadı. Örnek: 39.9255, 32.8663 · 39°55\'32"N 32°51\'59"E · 36S 488545 4419530 · sxk9q2'); return; }
    var l = Geo.links(p.lat, p.lng);
    convOut.innerHTML = '<div class="out-grid">' +
      row('Ondalık', Geo.dd(p.lat, p.lng)) +
      row('DMS', dms(p)) +
      row('DDM', Geo.toDDM(p.lat, true) + ' / ' + Geo.toDDM(p.lng, false)) +
      row('UTM', utm(p)) +
      row('Geohash', Geo.geohash(p.lat, p.lng, 9)) +
      '</div><div class="actions-row">' +
      '<a class="btn btn-sm btn-primary" href="' + esc(mapLink(p)) + '">' + GL.icon('pin') + 'Haritada aç</a>' +
      '<a class="btn btn-sm" href="' + esc(l.google) + '" target="_blank" rel="noopener">' + GL.icon('external') + 'Google Maps</a>' +
      '<a class="btn btn-sm" href="' + esc(l.osm) + '" target="_blank" rel="noopener">' + GL.icon('external') + 'OpenStreetMap</a>' +
      '</div>';
  }
  var t1;
  convIn.addEventListener('input', function () { clearTimeout(t1); t1 = setTimeout(convert, 120); });

  /* ---------- b) distance & bearing ---------- */
  var aIn = $('pt-a'), bIn = $('pt-b'), distOut = $('dist-out');
  function arrow(deg) {
    return '<svg class="compass" viewBox="0 0 54 54" aria-hidden="true" style="transform:rotate(' + deg.toFixed(1) + 'deg)">' +
      '<circle cx="27" cy="27" r="25" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>' +
      '<path d="M27 6 35 30 27 25 19 30Z" fill="var(--green)"/><path d="M27 48 21 30 27 33 33 30Z" fill="currentColor" fill-opacity=".35"/></svg>';
  }
  function stat(k, v, s, extra) {
    return '<div class="stat"><div class="s-k">' + esc(k) + '</div><div class="s-v">' + esc(v) + '</div>' + (s ? '<div class="s-s">' + s + '</div>' : '') + (extra || '') + '</div>';
  }
  function calc() {
    var a = Geo.parse(aIn.value), b = Geo.parse(bIn.value);
    if (!aIn.value.trim() || !bIn.value.trim()) { distOut.innerHTML = errNote('İki noktayı da gir.'); return; }
    if (!a || !b) { distOut.innerHTML = errNote((!a && !b ? 'A ve B' : !a ? 'A' : 'B') + ' noktası anlaşılamadı.'); return; }
    var d = Geo.distance(a, b), br = Geo.bearing(a, b), mid = Geo.midpoint(a, b);
    var hours = d / 1000 / 800, h = Math.floor(hours), m = Math.round((hours - h) * 60);
    if (m === 60) { h++; m = 0; }
    var flight = d < 1000 ? '< 1 dk' : (h ? h + ' sa ' : '') + m + ' dk';
    distOut.innerHTML = '<div class="stat-grid">' +
      stat('Mesafe', Geo.fmtDistance(d), 'Büyük daire (haversine)') +
      stat('İlk yön', br.toFixed(1) + '° ' + Geo.compass(br), '', arrow(br)) +
      stat('Orta nokta', Geo.dd(mid.lat, mid.lng, 5), '<a href="' + esc(mapLink(mid, 6)) + '">Haritada aç</a>') +
      stat('Yaklaşık uçuş süresi', flight, '800 km/sa ortalama hızla') +
      '</div>';
  }
  $('dist-form').addEventListener('submit', function (e) { e.preventDefault(); calc(); });
  $('swap-btn').addEventListener('click', function () {
    var t = aIn.value; aIn.value = bIn.value; bIn.value = t;
    if (distOut.innerHTML) calc();
  });

  /* ---------- c) batch ---------- */
  var MAX = 500, rows = [];
  var bIn2 = $('batch-input'), bOut = $('batch-out'), bMsg = $('batch-msg'), csvBtn = $('batch-csv'), cpBtn = $('batch-copy');
  function runBatch() {
    var lines = bIn2.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var msg = '';
    if (!lines.length) { rows = []; bOut.innerHTML = ''; bMsg.innerHTML = errNote('Dönüştürülecek satır yok.'); csvBtn.disabled = cpBtn.disabled = true; return; }
    if (lines.length > MAX) { msg = 'Yalnızca ilk ' + MAX + ' satır dönüştürüldü (' + lines.length + ' satır girildi).'; lines = lines.slice(0, MAX); }
    rows = lines.map(function (line, i) {
      var p = Geo.parse(line);
      return p ? { n: i + 1, input: line, ok: true, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), dms: dms(p), utm: utm(p) } : { n: i + 1, input: line, ok: false };
    });
    var bad = rows.filter(function (r) { return !r.ok; }).length;
    var html = '<table class="batch-table"><thead><tr><th>#</th><th>Girdi</th><th>Enlem</th><th>Boylam</th><th>DMS</th><th>UTM</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr' + (r.ok ? '' : ' class="bad"') + '><td>' + r.n + '</td><td class="mono b-in">' + esc(r.input) + '</td>' +
        (r.ok ? '<td class="mono">' + r.lat + '</td><td class="mono">' + r.lng + '</td><td class="mono">' + esc(r.dms) + '</td><td class="mono">' + esc(r.utm) + '</td>'
          : '<td colspan="4">anlaşılamadı</td>') + '</tr>';
    });
    bOut.innerHTML = html + '</tbody></table>';
    var summary = (rows.length - bad) + ' / ' + rows.length + ' satır dönüştürüldü' + (bad ? ', ' + bad + ' satır anlaşılamadı.' : '.');
    bMsg.innerHTML = '<div class="note ' + (msg || bad ? '' : 'info') + '" style="margin-top:14px">' + GL.icon(msg || bad ? 'warn' : 'check') + '<span>' + esc(summary + (msg ? ' ' + msg : '')) + '</span></div>';
    csvBtn.disabled = cpBtn.disabled = false;
  }
  function cells(r) { return [r.n, r.input, r.ok ? r.lat : '', r.ok ? r.lng : '', r.ok ? r.dms : 'anlaşılamadı', r.ok ? r.utm : '']; }
  var HEAD = ['#', 'Girdi', 'Enlem', 'Boylam', 'DMS', 'UTM'];
  function csvCell(v) { v = String(v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $('batch-run').addEventListener('click', runBatch);
  csvBtn.addEventListener('click', function () {
    if (!rows.length) return;
    var out = [HEAD].concat(rows.map(cells)).map(function (c) { return c.map(csvCell).join(';'); }).join('\r\n');
    GL.download('geolocate-koordinatlar.csv', '﻿' + out, 'text/csv;charset=utf-8');
    GL.toast('CSV indirildi', 'ok');
  });
  cpBtn.addEventListener('click', function () {
    if (!rows.length) return;
    var out = [HEAD].concat(rows.map(cells)).map(function (c) { return c.join('\t'); }).join('\n');
    GL.copy(out, cpBtn);
  });
})();
