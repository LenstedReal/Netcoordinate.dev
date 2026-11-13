/* GeoLocate — IP analysis page */
(function () {
  'use strict';
  var GL = window.GL;
  var $ = function (id) { return document.getElementById(id); };
  var HKEY = 'gl-ip-history';
  var TIMEOUT = 7000;
  var lastQuery = null;
  var map = null, circle = null, reqId = 0;

  document.querySelectorAll('.ic[data-icon]').forEach(function (el) { el.innerHTML = GL.icon(el.getAttribute('data-icon')); });

  /* ---------- validation ---------- */
  function isV4(s) {
    var p = s.split('.');
    if (p.length !== 4) return false;
    return p.every(function (x) { return /^\d{1,3}$/.test(x) && +x <= 255 && (x.length === 1 || x[0] !== '0'); });
  }
  function isV6(s) {
    if (!/^[0-9a-fA-F:.]+$/.test(s) || s.indexOf(':') < 0) return false;
    var dbl = s.split('::');
    if (dbl.length > 2) return false;
    var parts = [];
    var last = s.slice(s.lastIndexOf(':') + 1);
    var tailV4 = last.indexOf('.') >= 0;
    if (tailV4 && !isV4(last)) return false;
    var groups = function (str) { return str ? str.split(':') : []; };
    if (dbl.length === 2) parts = groups(dbl[0]).concat(groups(dbl[1]));
    else parts = groups(s);
    if (tailV4) parts.pop();
    var max = tailV4 ? 6 : 8;
    if (!parts.every(function (g) { return /^[0-9a-fA-F]{1,4}$/.test(g); })) return false;
    return dbl.length === 2 ? parts.length < max : parts.length === max;
  }
  function version(ip) { return isV4(ip) ? 'IPv4' : isV6(ip) ? 'IPv6' : ''; }

  /* ---------- providers ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function asnNum(v) { if (v == null) return null; var m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  var PROVIDERS = [
    {
      name: 'ipwho.is',
      url: function (ip) { return 'https://ipwho.is/' + (ip ? encodeURIComponent(ip) : ''); },
      norm: function (d) {
        if (d.success === false) throw new Error(d.message || 'başarısız');
        var c = d.connection || {}, t = d.timezone || {};
        return { ip: d.ip, version: d.type, country: d.country, cc: d.country_code, region: d.region, city: d.city, zip: d.postal,
          lat: num(d.latitude), lon: num(d.longitude), tz: t.id, isp: c.isp, org: c.org, asn: asnNum(c.asn), currency: d.currency && d.currency.code, calling: d.calling_code };
      }
    },
    {
      name: 'ipapi.co',
      url: function (ip) { return ip ? 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/' : 'https://ipapi.co/json/'; },
      norm: function (d) {
        if (d.error) throw new Error(d.reason || 'başarısız');
        return { ip: d.ip, version: d.version, country: d.country_name, cc: d.country_code, region: d.region, city: d.city, zip: d.postal,
          lat: num(d.latitude), lon: num(d.longitude), tz: d.timezone, isp: d.org, org: d.org, asn: asnNum(d.asn), currency: d.currency, calling: d.country_calling_code };
      }
    },
    {
      name: 'ipwhois.app',
      url: function (ip) { return 'https://ipwhois.app/json/' + (ip ? encodeURIComponent(ip) : ''); },
      norm: function (d) {
        if (d.success === false) throw new Error(d.message || 'başarısız');
        return { ip: d.ip, version: d.type, country: d.country, cc: d.country_code, region: d.region, city: d.city, zip: d.postal || '',
          lat: num(d.latitude), lon: num(d.longitude), tz: d.timezone, isp: d.isp, org: d.org, asn: asnNum(d.asn), currency: d.currency_code, calling: d.country_phone };
      }
    }
  ];

  function lookup(ip) {
    var fails = [];
    var i = 0;
    function next() {
      if (i >= PROVIDERS.length) { var e = new Error('all'); e.fails = fails; return Promise.reject(e); }
      var p = PROVIDERS[i++];
      return GL.json(p.url(ip), TIMEOUT).then(function (d) {
        var r = p.norm(d || {});
        if (!r.ip) throw new Error('boş yanıt');
        r.source = p.name;
        return r;
      }).catch(function (err) {
        var msg = err && err.name === 'AbortError' ? 'zaman aşımı (7 sn)' : err instanceof TypeError ? 'bağlantı kurulamadı' : (err && err.message) || 'hata';
        fails.push({ name: p.name, msg: msg });
        return next();
      });
    }
    return next();
  }

  /* ---------- operator recognition ---------- */
  var ASN_OPS = {
    34984: ['Turkcell Superonline', 'Sabit hat / fiber', '#f5b400', 'TS', false],
    16135: ['Turkcell', 'Mobil', '#1e5aa8', 'TC', true],
    9121: ['Türk Telekom', 'Sabit hat', '#0b4ea2', 'TT', false],
    20978: ['Türk Telekom Mobil', 'Mobil', '#1aa1e0', 'TM', true],
    15897: ['Vodafone Türkiye', 'Mobil', '#e60000', 'VF', true],
    15924: ['Vodafone Net', 'Sabit hat', '#c50000', 'VN', false],
    12735: ['TurkNet', 'Sabit hat / fiber', '#6c2bd9', 'TN', false],
    47524: ['Türksat Kablonet', 'Kablo', '#0f8a5f', 'KN', false]
  };
  var NAME_OPS = [
    [/superonline/i, 34984],
    [/turkcell/i, 16135],
    [/tt\s*mobil|avea/i, 20978],
    [/ttnet|türk telekom|turk telekom/i, 9121],
    [/vodafone/i, 15897],
    [/turknet/i, 12735],
    [/kablonet|türksat|turksat/i, 47524],
    [/millenicom/i, ['Millenicom', 'Sabit hat / sanal operatör', '#ff6a00', 'MC', false]],
    [/d-smart|dsmart/i, ['D-Smart', 'Sabit hat', '#00a3e0', 'DS', false]]
  ];
  var DC = { 16509: 'AWS', 14618: 'AWS', 15169: 'Google Cloud', 396982: 'Google Cloud', 8075: 'Microsoft', 13335: 'Cloudflare', 14061: 'DigitalOcean', 24940: 'Hetzner', 16276: 'OVH', 31898: 'Oracle Cloud', 63949: 'Akamai/Linode', 20473: 'Vultr' };

  function operator(r) {
    var o = r.asn != null ? ASN_OPS[r.asn] : null;
    var via = 'ASN';
    if (!o) {
      var name = (r.isp || '') + ' ' + (r.org || '');
      for (var k = 0; k < NAME_OPS.length; k++) {
        if (NAME_OPS[k][0].test(name)) { var v = NAME_OPS[k][1]; o = typeof v === 'number' ? ASN_OPS[v] : v; via = 'ad'; break; }
      }
    }
    if (!o) return null;
    return { name: o[0], type: o[1], color: o[2], initials: o[3], mobile: o[4], via: via };
  }

  /* ---------- helpers ---------- */
  function flag(cc) {
    if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
    cc = cc.toUpperCase();
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  }
  function localTime(tz) {
    if (!tz) return '';
    try { return new Intl.DateTimeFormat('tr-TR', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date()); } catch (e) { return ''; }
  }
  function badge(text, cls, icon) {
    return '<span class="badge ' + (cls || '') + '">' + (icon ? GL.icon(icon) : '') + GL.esc(text) + '</span>';
  }
  function row(key, val, mono) {
    var has = val != null && val !== '';
    var s = has ? String(val) : '—';
    return '<div class="kv-row"><span class="kv-key">' + GL.esc(key) + '</span><span class="kv-val' + (mono ? ' mono' : '') + '">' + GL.esc(s) + '</span>' +
      (has ? GL.copyBtn(s, key + ' kopyala') : '<span></span>') + '</div>';
  }
  function section(title, icon, rows, i) {
    return '<section class="card reveal" style="--i:' + i + '"><div class="card-head"><h2 class="card-title"><span class="ic">' + GL.icon(icon) + '</span>' + GL.esc(title) + '</h2></div><div class="card-body"><div class="kv">' + rows.join('') + '</div></div></section>';
  }
  function note(cls, icon, html) { return '<div class="note ' + cls + '">' + GL.icon(icon) + '<div>' + html + '</div></div>'; }

  /* ---------- history ---------- */
  function getHist() { var h = GL.store.get(HKEY, []); return Array.isArray(h) ? h.filter(function (x) { return typeof x === 'string' && version(x); }).slice(0, 5) : []; }
  function pushHist(ip) {
    var h = getHist().filter(function (x) { return x !== ip; });
    h.unshift(ip);
    GL.store.set(HKEY, h.slice(0, 5));
    renderHist();
  }
  function renderHist() {
    var el = $('ip-history');
    var h = getHist();
    el.innerHTML = h.map(function (ip) { return '<button type="button" class="chip" data-ip="' + GL.esc(ip) + '">' + GL.esc(ip) + '</button>'; }).join('');
  }
  $('ip-history').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ip]');
    if (b) { $('ip-input').value = b.getAttribute('data-ip'); run(b.getAttribute('data-ip')); }
  });

  /* ---------- rendering ---------- */
  function loading() {
    $('ip-hero').innerHTML = '<div class="loader"><div class="spinner"></div>IP bilgileri alınıyor…</div>';
  }
  function showError(fails) {
    var list = fails.map(function (f) { return '<li><b>' + GL.esc(f.name) + '</b>: ' + GL.esc(f.msg) + '</li>'; }).join('');
    $('ip-hero').innerHTML = '<div class="ip-label">IP bilgisi alınamadı</div>' +
      note('error', 'warn', 'Hiçbir servis yanıt vermedi. Reklam engelleyici veya ağ kısıtlaması bu servisleri engelliyor olabilir.<ul class="ip-fails">' + list + '</ul>') +
      '<div class="badges"><button type="button" class="btn btn-primary btn-sm" id="ip-retry">' + GL.icon('refresh') + 'Tekrar dene</button></div>';
    $('ip-retry').addEventListener('click', function () { run(lastQuery); });
    $('ip-operator-card').hidden = true;
    $('ip-map-card').hidden = true;
    $('ip-details').innerHTML = '';
  }

  function render(r, queried) {
    var ver = r.version && /6/.test(r.version) ? 'IPv6' : (r.version && /4/.test(r.version) ? 'IPv4' : version(r.ip) || '—');
    var op = operator(r);
    var dc = r.asn != null ? DC[r.asn] : null;
    var place = [r.city, r.region !== r.city ? r.region : '', r.country].filter(Boolean).join(', ');
    var badges = badge(ver, 'blue');
    if (dc) badges += badge('Veri merkezi / VPN olabilir · ' + dc, 'gold', 'server');
    else if (op) badges += badge(op.type + ' (tahmini)', 'green', op.mobile ? 'phone' : 'wifi');
    if (op) badges += badge(op.name, '');
    else if (r.isp) badges += badge(r.isp, '');

    $('ip-hero').innerHTML =
      '<div class="ip-label">' + (queried ? 'Sorgulanan IP' : 'Senin IP adresin') + '</div>' +
      '<div class="ip-value">' + GL.esc(r.ip) + '</div>' +
      '<div class="ip-place">' + (flag(r.cc) ? '<span class="flag" aria-hidden="true">' + flag(r.cc) + '</span>' : GL.icon('globe')) +
      '<span>' + GL.esc(place || 'Konum bilinmiyor') + '</span></div>' +
      '<div class="badges">' + badges + '</div>' +
      '<div class="ip-hero-foot"><span class="ip-src">Kaynak: ' + GL.esc(r.source) + '</span>' + GL.copyBtn(r.ip, 'IP adresini kopyala') + '</div>';

    // operator card
    var oc = '';
    if (op) {
      oc += '<div class="operator-card"><div class="operator-logo" style="background:' + op.color + '">' + GL.esc(op.initials) + '</div><div><div class="operator-name">' + GL.esc(op.name) + '</div>' +
        '<div class="operator-sub">' + GL.esc(op.type) + ' · tahmini (' + (op.via === 'ASN' ? 'ASN ' + GL.esc(r.asn) : 'ad eşleşmesi') + ')</div></div></div>';
    } else if (dc) {
      oc += '<div class="operator-card"><div class="operator-logo" style="background:#64748b">' + GL.icon('server') + '</div><div><div class="operator-name">' + GL.esc(dc) + '</div>' +
        '<div class="operator-sub">Veri merkezi / bulut · VPN ya da proxy olabilir (tahmini)</div></div></div>';
    } else {
      oc += '<div class="operator-card"><div class="operator-logo" style="background:#475569">' + GL.esc(((r.isp || r.org || '?').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '').slice(0, 2) || '?').toUpperCase()) + '</div><div><div class="operator-name">' + GL.esc(r.isp || r.org || 'Bilinmeyen sağlayıcı') + '</div>' +
        '<div class="operator-sub">Tanınan bir Türk operatörü değil' + (r.asn ? ' · ASN ' + GL.esc(r.asn) : '') + '</div></div></div>';
    }
    if (op && op.mobile) {
      oc += note('', 'phone', 'Mobil operatörler (Turkcell, Vodafone, Türk Telekom Mobil) aynı IP adresini birçok kullanıcıyla paylaşır (CGNAT). Bu yüzden IP konumu genellikle kişinin gerçek yerini değil, operatörün bölgesel merkezini gösterir.');
    }
    oc += '<div style="height:10px"></div>' + note('info', 'info', 'IP konumu yaklaşıktır (şehir düzeyi), kesin adres göstermez.');
    $('ip-operator').innerHTML = oc;
    $('ip-operator-card').hidden = false;

    // details
    var ll = r.lat != null && r.lon != null ? r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) : '';
    $('ip-details').innerHTML = '<div class="ip-sections">' +
      section('Ağ', 'server', [row('ISP', r.isp), row('Organizasyon', r.org), row('ASN', r.asn != null ? 'AS' + r.asn : '', true)], 3) +
      section('Konum (tahmini)', 'globe', [row('Ülke', r.country ? r.country + (r.cc ? ' (' + r.cc + ')' : '') : ''), row('Bölge', r.region), row('Şehir', r.city), row('Posta kodu', r.zip, true),
        row('Enlem/Boylam', ll, true), row('Saat dilimi', r.tz), row('Yerel saat', localTime(r.tz))], 4) +
      section('Diğer', 'layers', [row('IP sürümü', ver), row('Para birimi', r.currency), row('Telefon kodu', r.calling ? (String(r.calling).charAt(0) === '+' ? r.calling : '+' + r.calling) : '', true)], 5) +
      '</div>';

    showMap(r);
  }

  function showMap(r) {
    var card = $('ip-map-card');
    if (r.lat == null || r.lon == null || !window.L) { card.hidden = true; return; }
    card.hidden = false;
    $('ip-map-link').href = './#' + r.lat.toFixed(6) + ',' + r.lon.toFixed(6) + ',10';
    try {
      if (!map) {
        map = L.map('ip-map', { scrollWheelZoom: false, attributionControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
      }
      var ll = [r.lat, r.lon];
      if (circle) circle.remove();
      circle = L.circle(ll, { radius: 8000, color: '#34d399', weight: 2, fillColor: '#6ee7b7', fillOpacity: 0.18 }).addTo(map);
      map.invalidateSize();
      map.fitBounds(circle.getBounds(), { padding: [20, 20] });
    } catch (e) { card.hidden = true; }
  }

  /* ---------- run ---------- */
  function run(ip) {
    lastQuery = ip || null;
    var my = ++reqId;
    loading();
    lookup(ip || null).then(function (r) {
      if (my !== reqId) return;
      render(r, !!ip);
      if (ip) pushHist(ip);
    }, function (e) {
      if (my !== reqId) return;
      showError((e && e.fails) || []);
    });
  }

  $('ip-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('ip-input').value.trim().replace(/^\[|\]$/g, '');
    if (!v) { GL.toast('Bir IP adresi yaz.', 'err'); return; }
    if (!version(v)) {
      GL.toast(/[a-z]/i.test(v) && v.indexOf('.') > 0 && v.indexOf(':') < 0 ? 'Alan adı desteklenmiyor; yalnızca IPv4 veya IPv6 adresi gir.' : 'Geçerli bir IPv4 veya IPv6 adresi gir.', 'err');
      return;
    }
    run(v);
  });
  $('ip-mine').addEventListener('click', function () { $('ip-input').value = ''; run(null); });

  renderHist();
  var q = new URLSearchParams(location.search).get('ip');
  if (q && version(q.trim())) { $('ip-input').value = q.trim(); run(q.trim()); } else run(null);
})();
