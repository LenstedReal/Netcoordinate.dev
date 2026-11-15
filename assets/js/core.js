/* GeoLocate — shared helpers for every page: theme, menu, online status, toasts, copy, storage, icons. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var GL = window.GL = {};

  /* ---------- storage (never throws) ---------- */
  GL.store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  /* ---------- theme (applied before paint by the inline snippet in <head>) ---------- */
  function applyTheme(t) {
    doc.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f1f4f2' : '#0a1020');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', t === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç');
      b.setAttribute('title', t === 'light' ? 'Koyu tema' : 'Açık tema');
    });
    document.dispatchEvent(new CustomEvent('gl:theme', { detail: t }));
  }
  GL.theme = function () { return doc.getAttribute('data-theme') || 'dark'; };

  /* ---------- toasts ---------- */
  var host;
  GL.toast = function (msg, kind) {
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 2600);
  };

  /* ---------- copy ---------- */
  GL.copy = function (text, btn) {
    function done() {
      GL.toast('Kopyalandı', 'ok');
      if (btn) { btn.classList.add('ok'); setTimeout(function () { btn.classList.remove('ok'); }, 1200); }
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) done(); else GL.toast('Kopyalanamadı, elle seçip kopyala', 'err');
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  };

  GL.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  GL.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* fetch with a timeout; resolves JSON or rejects */
  GL.json = function (url, ms, opts) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
    var o = opts || {};
    o.headers = o.headers || { Accept: 'application/json' };
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  };

  /* Small inline icon set (stroke icons, 24×24). */
  var P = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'
  };
  GL.icon = function (name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };

  /* A copy button for a value; the value is read from data-copy when clicked. */
  GL.copyBtn = function (value, label) {
    return '<button type="button" class="copy-btn" data-copy="' + GL.esc(value) + '" aria-label="' + GL.esc(label || 'Kopyala') + '" title="' + GL.esc(label || 'Kopyala') + '">' + GL.icon('copy') + '</button>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (b) GL.copy(b.getAttribute('data-copy'), b);
  });

  /* ---------- page chrome ---------- */
  function initChrome() {
    applyTheme(GL.theme());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = GL.theme() === 'dark' ? 'light' : 'dark';
        GL.store.set('gl-theme', next);
        var swap = function () { applyTheme(next); };
        if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap);
        else swap();
      });
    });

    var header = document.querySelector('.site-header');
    var menu = document.querySelector('[data-menu-toggle]');
    if (header && menu) {
      menu.addEventListener('click', function () {
        var open = header.classList.toggle('open');
        menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && header.classList.contains('open')) { header.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus(); }
      });
      document.addEventListener('click', function (e) {
        if (header.classList.contains('open') && !header.contains(e.target)) { header.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
      });
    }

    var pill = document.querySelector('[data-online]');
    function net() {
      if (!pill) return;
      var on = navigator.onLine !== false;
      pill.classList.toggle('off', !on);
      pill.querySelector('span:last-child').textContent = on ? 'Çevrimiçi' : 'Bağlantı yok';
    }
    window.addEventListener('online', function () { net(); GL.toast('Bağlantı geri geldi', 'ok'); });
    window.addEventListener('offline', function () { net(); GL.toast('İnternet bağlantısı yok', 'err'); });
    net();

    var y = document.querySelector('[data-year]');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initChrome);
  else initChrome();
})();
