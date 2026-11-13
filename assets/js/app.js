/* GeoLocate HUD — full-screen 3D map: intro globe dive, search, point panel, measuring, IP drawer. */
(function () {
  'use strict';
  var GL = window.GL, Geo = window.Geo;
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STREET = 'https://tiles.openfreemap.org/styles/liberty';
  var SAT = {
    version: 8,
    sources: { sat: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } },
    layers: [{ id: 'sat', type: 'raster', source: 'sat' }]
  };

  var map = null, pin = null, sat = false, threeD = true, point = null;
  var measure = { on: false, pts: [], markers: [] };
  var introDone = false, spin = true;

  /* ---------- intro log ---------- */
  function log(text) {
    var el = document.createElement('div');
    el.textContent = '› ' + text;
    $('log').appendChild(el);
    while ($('log').children.length > 3) $('log').removeChild($('log').firstChild);
  }
  function endIntro() {
    if (introDone) return;
    introDone = true;
    spin = false;
    $('intro').classList.add('gone');
    $('skip').remove();
    setTimeout(function () { var i = $('intro'); if (i) i.remove(); }, 1300);
    $('panel').classList.toggle('hide', !point);
  }
  $('skip').addEventListener('click', function () { endIntro(); });

  /* ---------- map ---------- */
  function initMap() {
    if (typeof maplibregl === 'undefined') {
      var f = document.createElement('div');
      f.className = 'fail';
      f.innerHTML = '<div><b>3B harita yüklenemedi.</b><br>Bağlantını kontrol et ya da <a href="harita-klasik.html">klasik haritayı</a> kullan.</div>';
      document.body.appendChild(f);
      endIntro();
      return false;
    }
    map = new maplibregl.Map({
      container: 'map', style: STREET, center: [20, 25], zoom: 1.4, pitch: 0, bearing: 0,
      attributionControl: { compact: true }, maxPitch: 75
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('style.load', function () {
      try { map.setProjection({ type: 'globe' }); } catch (e) { /* older engines: flat map */ }
      if (map.getLayer && map.getStyle().layers.some(function (l) { return l.id === 'building-3d'; })) {
        map.setLayoutProperty('building-3d', 'visibility', threeD ? 'visible' : 'none');
      }
      drawMeasure();
    });
    map.on('load', function () { log('Uydu bağlantısı kuruldu'); spinGlobe(); });
    map.on('error', function () { /* a missing tile must not break the page */ });
    map.on('mousemove', function (e) {
      $('r-lat').textContent = e.lngLat.lat.toFixed(5);
      $('r-lng').textContent = e.lngLat.lng.toFixed(5);
      $('xh-tag').textContent = e.lngLat.lat.toFixed(4) + ', ' + e.lngLat.lng.toFixed(4);
    });
    map.on('zoom', function () { $('r-z').textContent = map.getZoom().toFixed(1); });
    map.on('click', function (e) {
      if (measure.on) { measure.pts.push({ lat: e.lngLat.lat, lng: e.lngLat.lng }); drawMeasure(); return; }
      select(e.lngLat.lat, e.lngLat.lng, 'Haritadan seçildi', { fly: false });
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(function (ev) { map.on(ev, function () { spin = false; }); });
    return true;
  }

  function spinGlobe() {
    if (!spin || !map || reduce) return;
    var c = map.getCenter();
    map.easeTo({ center: [c.lng + 12, c.lat], duration: 1000, easing: function (t) { return t; } });
    map.once('moveend', spinGlobe);
  }

  /* ---------- crosshair ---------- */
  var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  if (fine) {
    document.addEventListener('mousemove', function (e) {
      var overMap = e.target && e.target.closest && e.target.closest('#map');
      ['xh-v', 'xh-h', 'xh-tag'].forEach(function (id) { $(id).classList.toggle('on', !!overMap && introDone); });
      $('xh-v').style.left = e.clientX + 'px';
      $('xh-h').style.top = e.clientY + 'px';
      $('xh-tag').style.left = e.clientX + 'px';
      $('xh-tag').style.top = e.clientY + 'px';
    });
  }

  /* ---------- effects ---------- */
  function scramble(el, finalText) {
    if (reduce) { el.textContent = finalText; return; }
    var start = performance.now(), dur = 700;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur), keep = Math.floor(finalText.length * p), out = '';
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText.charAt(i);
        out += i < keep || !/\d/.test(ch) ? ch : String(Math.floor(Math.random() * 10));
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var typeTimer = null;
  function typeText(el, text) {
    clearInterval(typeTimer);
    if (reduce) { el.textContent = text; return; }
    var i = 0;
    el.innerHTML = '<span></span><span class="cur"></span>';
    var span = el.firstChild;
    typeTimer = setInterval(function () {
      i += 2;
      span.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typeTimer); setTimeout(function () { if (el.lastChild && el.lastChild.className === 'cur') el.removeChild(el.lastChild); }, 900); }
    }, 18);
  }

  /* ---------- selecting a point ---------- */
  function pinEl() { var d = document.createElement('div'); d.className = 'pin'; d.innerHTML = '<i></i>'; return d; }
  function select(lat, lng, src, opts) {
    opts = opts || {};
    if (!Geo.valid(lat, lng)) { GL.toast('Geçersiz koordinat', 'err'); return; }
    point = { lat: lat, lng: lng };
    spin = false;
    if (map) {
      if (pin) pin.setLngLat([lng, lat]);
      else pin = new maplibregl.Marker({ element: pinEl() }).setLngLat([lng, lat]).addTo(map);
      if (opts.fly !== false) {
        map.flyTo({ center: [lng, lat], zoom: opts.zoom || 16, pitch: threeD ? 60 : 0, bearing: opts.bearing != null ? opts.bearing : -20,
          duration: reduce ? 0 : (opts.duration || 3200), curve: 1.6, essential: true });
      }
    }
    $('panel').classList.toggle('hide', !introDone);
    $('p-src').textContent = src || 'Hedef';
    scramble($('p-coord'), Geo.dd(lat, lng));
    var utm = Geo.toUTM(lat, lng), dms = Geo.toDMS(lat, true) + ' ' + Geo.toDMS(lng, false);
    var rows = [['DMS', dms], ['UTM', Geo.formatUTM(utm)], ['GEOHASH', Geo.geohash(lat, lng, 9)], ['ONDALIK', Geo.dd(lat, lng)]];
    $('p-rows').innerHTML = rows.map(function (r) {
      return '<div class="row"><span class="k">' + r[0] + '</span><span class="v">' + GL.esc(r[1]) + '</span>' +
        '<button class="cp" type="button" data-copy="' + GL.esc(r[1]) + '" aria-label="' + r[0] + ' kopyala">' + GL.icon('copy') + '</button></div>';
    }).join('');
    var links = Geo.links(lat, lng);
    $('a-osm').href = links.osm;
    $('a-gm').href = links.google;
    $('p-addr').textContent = 'Adres çözümleniyor…';
    reverse(lat, lng);
    history.replaceState(null, '', '#' + lat.toFixed(6) + ',' + lng.toFixed(6) + ',' + (opts.zoom || 16));
  }

  var revSeq = 0, revLast = 0, revT = null;
  function reverse(lat, lng) {
    var seq = ++revSeq;
    clearTimeout(revT);
    revT = setTimeout(function () {
      revLast = Date.now();
      GL.json('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=tr&lat=' + lat + '&lon=' + lng, 9000)
        .then(function (d) {
          if (seq !== revSeq) return;
          var a = d.address || {};
          var text = d.display_name ? d.display_name.split(', ').slice(0, 4).join(', ') :
            [a.road, a.suburb, a.city || a.town || a.village, a.country].filter(Boolean).join(', ');
          typeText($('p-addr'), text || 'Bu noktada adres yok');
        })
        .catch(function () { if (seq === revSeq) $('p-addr').textContent = 'Adres şu an alınamadı (koordinat doğru)'; });
    }, Math.max(0, 1100 - (Date.now() - revLast)));
  }

  /* ---------- search ---------- */
  $('search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim(), res = $('results');
    if (!q) return;
    endIntro();
    var p = Geo.parse(q);
    if (p) { res.hidden = true; select(p.lat, p.lng, 'Koordinat çözüldü'); return; }
    res.hidden = false;
    res.innerHTML = '<li style="padding:12px;color:var(--t2)">Aranıyor…</li>';
    GL.json('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=tr&q=' + encodeURIComponent(q), 9000)
      .then(function (list) {
        if (!list || !list.length) { res.innerHTML = '<li style="padding:12px;color:var(--t2)">Sonuç yok. Daha açık yaz ya da koordinat gir.</li>'; return; }
        res.innerHTML = '';
        list.forEach(function (r) {
          var li = document.createElement('li'), b = document.createElement('button'), parts = String(r.display_name || '').split(', ');
          b.type = 'button';
          b.innerHTML = '<div class="n"></div><div class="s"></div>';
          b.querySelector('.n').textContent = r.name || parts[0];
          b.querySelector('.s').textContent = parts.slice(1).join(', ');
          b.addEventListener('click', function () { res.hidden = true; select(parseFloat(r.lat), parseFloat(r.lon), 'Aramadan'); });
          li.appendChild(b);
          res.appendChild(li);
        });
      })
      .catch(function () { res.innerHTML = '<li style="padding:12px;color:var(--t2)">Arama servisi yanıt vermedi. Koordinat girerek arama her zaman çalışır.</li>'; });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('#results') && !e.target.closest('#search')) $('results').hidden = true; });

  /* ---------- dock ---------- */
  $('d-locate').addEventListener('click', function () {
    if (!navigator.geolocation) { GL.toast('Tarayıcın konum desteklemiyor', 'err'); return; }
    GL.toast('Konum alınıyor…');
    navigator.geolocation.getCurrentPosition(function (p) {
      endIntro();
      select(p.coords.latitude, p.coords.longitude, 'Cihaz konumu ±' + Math.round(p.coords.accuracy) + ' m', { zoom: 17 });
    }, function (err) { GL.toast({ 1: 'Konum izni verilmedi', 2: 'Konum bulunamadı', 3: 'Zaman aşımı' }[err.code] || 'Konum alınamadı', 'err'); },
    { enableHighAccuracy: true, timeout: 12000 });
  });
  $('d-3d').addEventListener('click', function () {
    if (!map) return;
    threeD = !threeD;
    this.classList.toggle('on', threeD);
    if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', threeD ? 'visible' : 'none');
    map.easeTo({ pitch: threeD ? 60 : 0, bearing: threeD ? -20 : 0, duration: 1200 });
  });
  $('d-3d').classList.add('on');
  $('d-sat').addEventListener('click', function () {
    if (!map) return;
    sat = !sat;
    this.classList.toggle('on', sat);
    map.setStyle(sat ? SAT : STREET);
  });
  $('d-globe').addEventListener('click', function () {
    if (!map) return;
    endIntro();
    map.flyTo({ center: point ? [point.lng, point.lat] : [30, 30], zoom: 1.6, pitch: 0, bearing: 0, duration: reduce ? 0 : 2600 });
  });

  /* ---------- measuring ---------- */
  function drawMeasure() {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    var coords = measure.pts.map(function (p) { return [p.lng, p.lat]; });
    var data = { type: 'FeatureCollection', features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] };
    if (map.getSource('measure')) map.getSource('measure').setData(data);
    else {
      map.addSource('measure', { type: 'geojson', data: data });
      map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', paint: { 'line-color': '#f5c84c', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    }
    measure.markers.forEach(function (m) { m.remove(); });
    measure.markers = measure.pts.map(function (p) {
      var d = document.createElement('div'); d.className = 'mdot';
      return new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map);
    });
    var len = Geo.pathLength(measure.pts);
    $('r-m').innerHTML = measure.on ? 'ÖLÇÜM <b>' + GL.esc(Geo.fmtDistance(len)) + '</b>' + (measure.pts.length > 2 ? ' · ALAN <b>' + GL.esc(Geo.fmtArea(Geo.area(measure.pts))) + '</b>' : '') : '';
  }
  $('d-measure').addEventListener('click', function () {
    measure.on = !measure.on;
    this.classList.toggle('on', measure.on);
    if (!measure.on) { measure.pts = []; GL.toast('Ölçüm kapatıldı'); } else GL.toast('Haritaya dokunarak nokta ekle', 'ok');
    drawMeasure();
  });

  /* ---------- panel actions ---------- */
  $('a-share').addEventListener('click', function () {
    if (!point) return;
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) navigator.share({ title: 'GeoLocate', url: location.href }).catch(function () {});
    else GL.copy(location.href);
  });
  $('a-save').addEventListener('click', function () {
    if (!point) return;
    var list = GL.store.get('gl-saved', []);
    if (!Array.isArray(list)) list = [];
    var at = ($('p-addr').textContent || '').trim();
    var name = (/çözümleniyor|alınamadı|adres yok/i.test(at) ? '' : at.split(',')[0].trim()) || 'Yer ' + (list.length + 1);
    list.unshift({ name: name.slice(0, 60), lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), ts: Date.now() });
    GL.store.set('gl-saved', list.slice(0, 200));
    GL.toast('Kaydedildi: ' + name, 'ok');
  });

  /* ---------- IP ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function asnNum(v) { var m = v == null ? null : String(v).match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  var PROVIDERS = [
    function (ip) { return GL.json('https://ipwho.is/' + (ip || ''), 7000).then(function (d) { if (d.success === false) throw 0; var c = d.connection || {}; return { ip: d.ip, cc: d.country_code, country: d.country, city: d.city, lat: num(d.latitude), lon: num(d.longitude), isp: c.isp, org: c.org, asn: asnNum(c.asn), src: 'ipwho.is' }; }); },
    function (ip) { return GL.json(ip ? 'https://ipapi.co/' + ip + '/json/' : 'https://ipapi.co/json/', 7000).then(function (d) { if (d.error) throw 0; return { ip: d.ip, cc: d.country_code, country: d.country_name, city: d.city, lat: num(d.latitude), lon: num(d.longitude), isp: d.org, org: d.org, asn: asnNum(d.asn), src: 'ipapi.co' }; }); },
    function (ip) { return GL.json('https://ipwhois.app/json/' + (ip || ''), 7000).then(function (d) { if (d.success === false) throw 0; return { ip: d.ip, cc: d.country_code, country: d.country, city: d.city, lat: num(d.latitude), lon: num(d.longitude), isp: d.isp, org: d.org, asn: asnNum(d.asn), src: 'ipwhois.app' }; }); }
  ];
  function lookup(ip, i) {
    i = i || 0;
    if (i >= PROVIDERS.length) return Promise.reject(new Error('all'));
    return PROVIDERS[i](ip).then(function (r) { if (!r.ip) throw 0; return r; }).catch(function () { return lookup(ip, i + 1); });
  }
  var OPS = {
    34984: ['Turkcell Superonline', 'Sabit hat / fiber', '#d99a00', 'TS', false], 16135: ['Turkcell', 'Mobil', '#1e5aa8', 'TC', true],
    9121: ['Türk Telekom', 'Sabit hat', '#0b4ea2', 'TT', false], 20978: ['Türk Telekom Mobil', 'Mobil', '#1aa1e0', 'TM', true],
    15897: ['Vodafone Türkiye', 'Mobil', '#e60000', 'VF', true], 15924: ['Vodafone Net', 'Sabit hat', '#c50000', 'VN', false],
    12735: ['TurkNet', 'Sabit hat / fiber', '#6c2bd9', 'TN', false], 47524: ['Türksat Kablonet', 'Kablo', '#0f8a5f', 'KN', false]
  };
  var NAMES = [[/superonline/i, 34984], [/turkcell/i, 16135], [/tt\s*mobil|avea/i, 20978], [/ttnet|t[üu]rk telekom/i, 9121], [/vodafone/i, 15897], [/turknet/i, 12735], [/kablonet|t[üu]rksat/i, 47524]];
  var DC = { 16509: 'AWS', 14618: 'AWS', 15169: 'Google Cloud', 396982: 'Google Cloud', 8075: 'Microsoft', 13335: 'Cloudflare', 14061: 'DigitalOcean', 24940: 'Hetzner', 16276: 'OVH', 31898: 'Oracle Cloud', 63949: 'Akamai/Linode', 20473: 'Vultr' };
  function operator(r) {
    var o = OPS[r.asn];
    if (!o) { var n = (r.isp || '') + ' ' + (r.org || ''); for (var k = 0; k < NAMES.length; k++) if (NAMES[k][0].test(n)) { o = OPS[NAMES[k][1]]; break; } }
    return o;
  }
  function flag(cc) { return cc && /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint.apply(null, cc.toUpperCase().split('').map(function (c) { return 127397 + c.charCodeAt(0); })) : ''; }

  function renderIp(r, mine) {
    var o = operator(r), dc = DC[r.asn];
    var html = '<div class="label">' + (mine ? 'Senin IP adresin' : 'Sorgulanan IP') + '</div>' +
      '<div class="ipbig" id="ipbig"></div>' +
      '<div style="margin-top:4px;color:var(--t2)">' + flag(r.cc) + ' ' + GL.esc([r.city, r.country].filter(Boolean).join(', ') || '—') + '</div>';
    if (o) html += '<div class="op"><div class="lg" style="background:' + o[2] + '">' + o[3] + '</div><div><b>' + GL.esc(o[0]) + '</b><div style="font-size:12px;color:var(--t3)">' + GL.esc(o[1]) + ' · tahmini' + (r.asn ? ' (AS' + r.asn + ')' : '') + '</div></div></div>';
    else html += '<div class="op"><div class="lg" style="background:#2a3b33">' + GL.esc(((r.isp || r.org || '?').trim().charAt(0) || '?').toUpperCase()) + '</div><div><b>' + GL.esc(r.isp || r.org || 'Bilinmeyen operatör') + '</b><div style="font-size:12px;color:var(--t3)">' + (r.asn ? 'AS' + r.asn : '') + (dc ? ' · Veri merkezi / VPN olabilir (' + GL.esc(dc) + ')' : '') + '</div></div></div>';
    if (o && o[4]) html += '<div class="note">Mobil hatlarda (Turkcell, Vodafone, Türk Telekom Mobil) aynı IP birçok kişi tarafından paylaşılır; konum genelde operatörün bölge merkezini gösterir.</div>';
    html += '<div class="rows" style="margin-top:14px">' +
      [['ISP', r.isp], ['ORG', r.org], ['ASN', r.asn ? 'AS' + r.asn : ''], ['KONUM', r.lat != null ? r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) : '']].map(function (x) {
        return '<div class="row"><span class="k">' + x[0] + '</span><span class="v">' + GL.esc(x[1] || '—') + '</span>' + (x[1] ? '<button class="cp" type="button" data-copy="' + GL.esc(x[1]) + '" aria-label="Kopyala">' + GL.icon('copy') + '</button>' : '<span></span>') + '</div>';
      }).join('') + '</div>' +
      (r.lat != null ? '<div class="actions"><button class="btn gold" type="button" id="ip-fly">Haritada göster</button></div>' : '') +
      '<div style="margin-top:8px;font-size:11px;color:var(--t3)">Kaynak: ' + GL.esc(r.src) + '</div>';
    $('ip-out').innerHTML = html;
    scramble($('ipbig'), r.ip);
    var fly = $('ip-fly');
    if (fly) fly.addEventListener('click', function () { closeDrawer(); select(r.lat, r.lon, 'IP konumu (yaklaşık)', { zoom: 11 }); });
  }
  function runIp(ip) {
    $('ip-out').innerHTML = '<div class="scan">TARANIYOR…</div>';
    return lookup(ip).then(function (r) { renderIp(r, !ip); return r; }).catch(function () {
      $('ip-out').innerHTML = '<div class="note">IP servislerinin hiçbiri yanıt vermedi. Reklam engelleyici ya da ağ kısıtlaması olabilir.</div><div class="actions"><button class="btn" type="button" id="ip-retry">Tekrar dene</button></div>';
      $('ip-retry').addEventListener('click', function () { runIp(ip); });
      throw new Error('ip');
    });
  }
  function openDrawer() { $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
  $('ip-open').addEventListener('click', function () { endIntro(); openDrawer(); if (!$('ip-out').innerHTML) runIp(''); });
  $('ip-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); if (measure.on) $('d-measure').click(); } });
  $('ipq').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('ip-in').value.trim();
    if (v && !/^(\d{1,3}\.){3}\d{1,3}$/.test(v) && !/^[0-9a-f:]+$/i.test(v)) { GL.toast('Yalnızca IPv4 ya da IPv6 adresi gir', 'err'); return; }
    runIp(v);
  });

  /* ---------- start: shared link, or intro dive to the visitor's city ---------- */
  var ok = initMap();
  var m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d{1,2}))?/);
  if (m && Geo.valid(+m[1], +m[2])) {
    log('Paylaşılan konum açılıyor');
    var go = function () { endIntro(); select(+m[1], +m[2], 'Paylaşılan bağlantı', { zoom: m[3] ? +m[3] : 16 }); };
    if (map) map.once('load', function () { setTimeout(go, 600); }); else go();
  } else if (ok) {
    log('IP çözümleniyor…');
    var started = Date.now();
    runIp('').then(function (r) {
      log('Konum kilitlendi: ' + [r.city, r.country].filter(Boolean).join(', '));
      var dive = function () {
        if (introDone) return;
        spin = false;
        map.stop();
        map.flyTo({ center: [r.lon, r.lat], zoom: 11.5, pitch: 55, bearing: -25, duration: reduce ? 0 : 5200, curve: 1.8, essential: true });
        map.once('moveend', function () { endIntro(); });
        setTimeout(endIntro, 6500);
      };
      setTimeout(dive, Math.max(0, 2600 - (Date.now() - started)));
    }).catch(function () { log('IP bulunamadı, serbest gezinme'); setTimeout(endIntro, 1500); });
  }
  setTimeout(endIntro, 12000); // never keep the intro longer than this
})();
