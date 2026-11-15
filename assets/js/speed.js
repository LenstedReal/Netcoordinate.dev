/* GeoLocate — internet speed test (download, upload, ping, jitter) against Cloudflare's nearest server, with operator and history. */
(function () {
  'use strict';
  var GL = window.GL;
  var $ = function (id) { return document.getElementById(id); };
  if (!$('sp-run')) return;

  var BASE = 'https://speed.cloudflare.com';
  var KEY = 'gl-speed';
  var running = false;
  var isp = null;
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  var bust = function () { return 'r=' + Math.random().toString(36).slice(2); };
  function limit(ms) {
    var c = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = c ? setTimeout(function () { c.abort(); }, ms) : null;
    return { signal: c ? c.signal : undefined, done: function () { if (t) clearTimeout(t); } };
  }
  function fmt(v) { return v == null ? '—' : v >= 100 ? Math.round(v).toLocaleString('tr-TR') : v.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }); }
  function ms(v) { return v == null ? '—' : Math.round(v).toLocaleString('tr-TR'); }

  /* gauge: 0-1000 Mbps on a log scale, so slow and fast lines both move the needle */
  var ARC = 283; // length of the semicircle path (r = 90)
  function gauge(v) {
    var p = v > 0 ? Math.min(1, Math.log10(1 + v) / Math.log10(1001)) : 0;
    $('sp-arc').style.strokeDashoffset = String(ARC * (1 - p));
    $('sp-num').textContent = fmt(v || 0);
  }
  function phase(text, kind) {
    var el = $('sp-phase');
    el.textContent = text;
    el.className = 'sp-phase' + (kind ? ' ' + kind : '');
  }
  function set(id, v) { var el = $(id); el.textContent = v; el.parentNode.classList.add('done'); }

  async function measurePing(n) {
    var times = [];
    for (var i = 0; i < n; i++) {
      var l = limit(4000), s = now();
      try {
        var r = await fetch(BASE + '/__down?bytes=0&' + bust(), { cache: 'no-store', signal: l.signal });
        await r.arrayBuffer();
        times.push(now() - s);
      } catch (e) { /* lost probe */ } finally { l.done(); }
    }
    if (times.length < 3) throw new Error('ping');
    times.shift(); // the first probe includes opening the connection
    var sorted = times.slice().sort(function (a, b) { return a - b; });
    var jit = 0;
    for (var j = 1; j < times.length; j++) jit += Math.abs(times[j] - times[j - 1]);
    return { ping: sorted[Math.floor(sorted.length / 2)], jitter: times.length > 1 ? jit / (times.length - 1) : 0 };
  }

  async function measureDown(onRate) {
    var sizes = [1e5, 1e6, 1e7, 2.5e7, 2.5e7], best = [], t0 = now();
    for (var i = 0; i < sizes.length && now() - t0 < 9000; i++) {
      var l = limit(15000), s = now(), bytes = 0;
      try {
        var r = await fetch(BASE + '/__down?bytes=' + sizes[i] + '&' + bust(), { cache: 'no-store', signal: l.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if (r.body && r.body.getReader) {
          var reader = r.body.getReader();
          for (;;) {
            var x = await reader.read();
            if (x.done) break;
            bytes += x.value.length;
            var el = (now() - s) / 1000;
            if (el > 0.15) onRate(bytes * 8 / el / 1e6);
          }
        } else bytes = (await r.arrayBuffer()).byteLength;
        var sec = Math.max(0.001, (now() - s) / 1000);
        best.push({ mbps: bytes * 8 / sec / 1e6, sec: sec });
      } finally { l.done(); }
    }
    if (!best.length) throw new Error('down');
    var long = best.filter(function (b) { return b.sec > 0.25; });
    var use = (long.length ? long : best).map(function (b) { return b.mbps; }).sort(function (a, b) { return b - a; });
    return use.length > 1 ? (use[0] + use[1]) / 2 : use[0];
  }

  async function measureUp(onRate) {
    var sizes = [1e5, 1e6, 5e6, 1e7], best = [], t0 = now();
    for (var i = 0; i < sizes.length && now() - t0 < 8000; i++) {
      var body = new Blob([new Uint8Array(sizes[i])], { type: 'text/plain' });
      var l = limit(15000), s = now();
      try {
        var r = await fetch(BASE + '/__up?' + bust(), { method: 'POST', body: body, cache: 'no-store', signal: l.signal });
        await r.arrayBuffer();
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var sec = Math.max(0.001, (now() - s) / 1000), mbps = sizes[i] * 8 / sec / 1e6;
        best.push({ mbps: mbps, sec: sec });
        onRate(mbps);
      } finally { l.done(); }
    }
    if (!best.length) throw new Error('up');
    var long = best.filter(function (b) { return b.sec > 0.25; });
    var use = (long.length ? long : best).map(function (b) { return b.mbps; }).sort(function (a, b) { return b - a; });
    return use.length > 1 ? (use[0] + use[1]) / 2 : use[0];
  }

  /* what the line is good for */
  function verdicts(r) {
    var list = [
      ['4K video izleme', r.down != null && r.down >= 25, '25 Mbps indirme'],
      ['HD görüntülü görüşme', r.up != null && r.up >= 3 && r.ping != null && r.ping < 120, '3 Mbps yükleme, 120 ms altı ping'],
      ['Çevrim içi oyun', r.ping != null && r.ping < 50 && r.jitter != null && r.jitter < 20, '50 ms altı ping, 20 ms altı dalgalanma'],
      ['Büyük dosya indirme', r.down != null && r.down >= 100, '100 Mbps ve üstü'],
      ['Canlı yayın yapma', r.up != null && r.up >= 10, '10 Mbps yükleme'],
    ];
    return '<ul class="sp-verdicts">' + list.map(function (v) {
      return '<li class="' + (v[1] ? 'yes' : 'no') + '"><span class="sp-v-ic">' + GL.icon(v[1] ? 'check' : 'x') + '</span><b>' + v[0] + '</b><span>' + v[2] + '</span></li>';
    }).join('') + '</ul>';
  }

  function history() {
    var list = GL.store.get(KEY, []);
    if (!Array.isArray(list) || !list.length) { $('sp-hist').innerHTML = ''; return; }
    $('sp-hist').innerHTML = '<div class="field-label" style="margin:18px 0 8px">Önceki testler (bu cihazda)</div><div class="table-scroll sp-hist"><table class="batch-table"><thead><tr>' +
      '<th>Tarih</th><th>İndirme</th><th>Yükleme</th><th>Ping</th><th>Operatör</th></tr></thead><tbody>' +
      list.slice(0, 10).map(function (h) {
        return '<tr><td>' + new Date(h.ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</td><td class="mono">' + fmt(h.down) +
          ' Mbps</td><td class="mono">' + fmt(h.up) + ' Mbps</td><td class="mono">' + ms(h.ping) + ' ms</td><td>' + GL.esc(h.isp || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  var OPS = [[/superonline/i, 'Turkcell Superonline (fiber/sabit)'], [/turkcell/i, 'Turkcell (mobil)'], [/tt\s*mobil|avea/i, 'Türk Telekom Mobil'],
    [/ttnet|t[üu]rk\s*telekom/i, 'Türk Telekom (sabit)'], [/vodafone/i, 'Vodafone'], [/turknet/i, 'TurkNet'], [/kablonet|t[üu]rksat/i, 'Türksat Kablonet'],
    [/millenicom/i, 'Millenicom'], [/d-smart|dsmart/i, 'D-Smart']];
  function operatorName(raw) {
    for (var i = 0; i < OPS.length; i++) if (OPS[i][0].test(raw)) return OPS[i][1];
    return raw;
  }
  GL.json('https://ipwho.is/', 7000).then(function (d) {
    var raw = (d && d.connection && (d.connection.isp || d.connection.org)) || '';
    if (!raw) throw 0;
    isp = operatorName(raw);
    $('sp-op').textContent = isp + (d.city ? ' · ' + d.city : '');
  }).catch(function () { $('sp-op').textContent = 'Operatör bilgisi alınamadı'; });

  $('sp-run').addEventListener('click', async function () {
    if (running) return;
    running = true;
    var btn = this, r = { down: null, up: null, ping: null, jitter: null };
    btn.disabled = true;
    btn.textContent = 'Ölçülüyor…';
    $('sp-verdict').innerHTML = '';
    ['sp-down', 'sp-up', 'sp-ping', 'sp-jit'].forEach(function (id) { $(id).textContent = '—'; $(id).parentNode.classList.remove('done'); });
    $('sp-gauge').classList.add('live');
    try {
      phase('Gecikme ölçülüyor', 'ping');
      gauge(0);
      var p = await measurePing(12);
      r.ping = p.ping; r.jitter = p.jitter;
      set('sp-ping', ms(r.ping)); set('sp-jit', ms(r.jitter));
      phase('İndirme ölçülüyor', 'down');
      r.down = await measureDown(gauge);
      set('sp-down', fmt(r.down)); gauge(r.down);
      phase('Yükleme ölçülüyor', 'up');
      try { r.up = await measureUp(gauge); set('sp-up', fmt(r.up)); } catch (e) { set('sp-up', 'ölçülemedi'); }
      gauge(r.down);
      phase('Tamamlandı', 'ok');
      $('sp-verdict').innerHTML = verdicts(r);
      var list = GL.store.get(KEY, []);
      if (!Array.isArray(list)) list = [];
      list.unshift({ ts: Date.now(), down: r.down, up: r.up, ping: r.ping, jitter: r.jitter, isp: isp });
      GL.store.set(KEY, list.slice(0, 20));
      history();
    } catch (e) {
      phase('Ölçülemedi', 'err');
      gauge(0);
      $('sp-verdict').innerHTML = '<div class="note">' + GL.icon('warn') + '<span>Hız testi sunucusuna ulaşılamadı. Reklam engelleyici, VPN ya da ağ kısıtlaması olabilir; biraz sonra yeniden dene.</span></div>';
    } finally {
      $('sp-gauge').classList.remove('live');
      btn.disabled = false;
      btn.textContent = 'Testi yeniden başlat';
      running = false;
    }
  });

  history();
})();
