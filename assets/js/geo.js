/* GeoLocate — coordinate math, no dependencies. Works in the browser (window.Geo) and in Node (tests). */
(function (root) {
  'use strict';

  var Geo = {};
  var R = 6371008.8; // mean Earth radius, metres
  var RAD = Math.PI / 180;

  Geo.valid = function (lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };

  /* ---------- formatting ---------- */
  var HEMI = {
    tr: { N: 'K', S: 'G', E: 'D', W: 'B' },
    en: { N: 'N', S: 'S', E: 'E', W: 'W' }
  };
  function hemi(value, isLat, lang) {
    var h = HEMI[lang || 'tr'];
    return isLat ? (value >= 0 ? h.N : h.S) : (value >= 0 ? h.E : h.W);
  }

  Geo.dd = function (lat, lng, digits) {
    var d = digits == null ? 6 : digits;
    return lat.toFixed(d) + ', ' + lng.toFixed(d);
  };

  Geo.toDMS = function (value, isLat, lang) {
    var total = Math.round(Math.abs(value) * 3600 * 100) / 100; // hundredths of a second, no 60.00″
    var d = Math.floor(total / 3600);
    var m = Math.floor((total - d * 3600) / 60);
    var s = total - d * 3600 - m * 60;
    return d + '° ' + m + '′ ' + s.toFixed(2) + '″ ' + hemi(value, isLat, lang);
  };

  Geo.toDDM = function (value, isLat, lang) {
    var totalMin = Math.round(Math.abs(value) * 60 * 10000) / 10000;
    var d = Math.floor(totalMin / 60);
    var m = totalMin - d * 60;
    return d + '° ' + m.toFixed(4) + '′ ' + hemi(value, isLat, lang);
  };

  /* ---------- UTM (WGS84) ---------- */
  var A = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
  var E2 = F * (2 - F), EP2 = E2 / (1 - E2);
  var BANDS = 'CDEFGHJKLMNPQRSTUVWXX';

  function utmZone(lat, lng) {
    var zone = Math.floor((lng + 180) / 6) + 1;
    if (zone > 60) zone = 60;
    if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) zone = 32; // Norway
    if (lat >= 72 && lat < 84) { // Svalbard
      if (lng >= 0 && lng < 9) zone = 31;
      else if (lng >= 9 && lng < 21) zone = 33;
      else if (lng >= 21 && lng < 33) zone = 35;
      else if (lng >= 33 && lng < 42) zone = 37;
    }
    return zone;
  }

  Geo.toUTM = function (lat, lng) {
    if (!Geo.valid(lat, lng) || lat < -80 || lat > 84) return null;
    var zone = utmZone(lat, lng);
    var lon0 = ((zone - 1) * 6 - 180 + 3) * RAD;
    var phi = lat * RAD, lam = lng * RAD;
    var sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
    var N = A / Math.sqrt(1 - E2 * sin * sin);
    var T = tan * tan, C = EP2 * cos * cos, Aa = cos * (lam - lon0);
    var e4 = E2 * E2, e6 = e4 * E2;
    var M = A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi -
      (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) +
      (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) -
      (35 * e6 / 3072) * Math.sin(6 * phi));
    var easting = K0 * N * (Aa + (1 - T + C) * Math.pow(Aa, 3) / 6 +
      (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(Aa, 5) / 120) + 500000;
    var northing = K0 * (M + N * tan * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(Aa, 4) / 24 +
      (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(Aa, 6) / 720));
    if (lat < 0) northing += 10000000;
    return { zone: zone, band: BANDS.charAt(Math.floor((lat + 80) / 8)), easting: easting, northing: northing };
  };

  Geo.formatUTM = function (u) {
    if (!u) return '—';
    return u.zone + u.band + ' ' + Math.round(u.easting) + ' ' + Math.round(u.northing);
  };

  Geo.fromUTM = function (zone, band, easting, northing) {
    band = String(band).toUpperCase();
    if (!(zone >= 1 && zone <= 60) || BANDS.indexOf(band) < 0) return null;
    var south = band < 'N';
    var x = easting - 500000, y = south ? northing - 10000000 : northing;
    var lon0 = ((zone - 1) * 6 - 180 + 3) * RAD;
    var e4 = E2 * E2, e6 = e4 * E2;
    var mu = (y / K0) / (A * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) +
      (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s1 = Math.sin(phi1), c1 = Math.cos(phi1), t1 = Math.tan(phi1);
    var N1 = A / Math.sqrt(1 - E2 * s1 * s1);
    var T1 = t1 * t1, C1 = EP2 * c1 * c1;
    var R1 = A * (1 - E2) / Math.pow(1 - E2 * s1 * s1, 1.5);
    var D = x / (N1 * K0);
    var lat = phi1 - (N1 * t1 / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lng = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c1;
    var out = { lat: lat / RAD, lng: lng / RAD };
    return Geo.valid(out.lat, out.lng) ? out : null;
  };

  /* ---------- Geohash ---------- */
  var B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  Geo.geohash = function (lat, lng, precision) {
    var p = precision || 10, out = '', bit = 0, ch = 0, even = true;
    var la = [-90, 90], lo = [-180, 180];
    while (out.length < p) {
      var r = even ? lo : la, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
      if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch = ch << 1; r[1] = mid; }
      even = !even;
      if (++bit === 5) { out += B32.charAt(ch); bit = 0; ch = 0; }
    }
    return out;
  };
  Geo.fromGeohash = function (hash) {
    var la = [-90, 90], lo = [-180, 180], even = true;
    hash = String(hash).toLowerCase();
    for (var i = 0; i < hash.length; i++) {
      var idx = B32.indexOf(hash.charAt(i));
      if (idx < 0) return null;
      for (var b = 4; b >= 0; b--) {
        var r = even ? lo : la, mid = (r[0] + r[1]) / 2;
        if ((idx >> b) & 1) r[0] = mid; else r[1] = mid;
        even = !even;
      }
    }
    return { lat: (la[0] + la[1]) / 2, lng: (lo[0] + lo[1]) / 2 };
  };

  /* ---------- distance, bearing, area ---------- */
  Geo.distance = function (a, b) {
    var p1 = a.lat * RAD, p2 = b.lat * RAD, dp = (b.lat - a.lat) * RAD, dl = (b.lng - a.lng) * RAD;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  Geo.pathLength = function (pts) {
    var t = 0;
    for (var i = 1; i < pts.length; i++) t += Geo.distance(pts[i - 1], pts[i]);
    return t;
  };
  Geo.bearing = function (a, b) {
    var p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  };
  Geo.compass = function (deg, lang) {
    var tr = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
    var en = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return (lang === 'en' ? en : tr)[Math.round(deg / 22.5) % 16];
  };
  Geo.midpoint = function (a, b) {
    var p1 = a.lat * RAD, p2 = b.lat * RAD, l1 = a.lng * RAD, dl = (b.lng - a.lng) * RAD;
    var bx = Math.cos(p2) * Math.cos(dl), by = Math.cos(p2) * Math.sin(dl);
    var p3 = Math.atan2(Math.sin(p1) + Math.sin(p2), Math.sqrt((Math.cos(p1) + bx) * (Math.cos(p1) + bx) + by * by));
    var l3 = l1 + Math.atan2(by, Math.cos(p1) + bx);
    return { lat: p3 / RAD, lng: ((l3 / RAD + 540) % 360) - 180 };
  };
  /* Spherical polygon area in m² (ring need not be closed). */
  Geo.area = function (pts) {
    if (!pts || pts.length < 3) return 0;
    var total = 0;
    for (var i = 0; i < pts.length; i++) {
      var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      total += (p2.lng - p1.lng) * RAD * (2 + Math.sin(p1.lat * RAD) + Math.sin(p2.lat * RAD));
    }
    return Math.abs(total * R * R / 2);
  };

  Geo.fmtDistance = function (m) {
    if (m < 1000) return Math.round(m).toLocaleString('tr-TR') + ' m';
    return (m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: m < 100000 ? 2 : 0 }) + ' km';
  };
  Geo.fmtArea = function (m2) {
    if (m2 < 10000) return Math.round(m2).toLocaleString('tr-TR') + ' m²';
    if (m2 < 1e6) return (m2 / 10000).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ha';
    return (m2 / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' km²';
  };

  /* ---------- parsing anything a person might paste ---------- */
  function num(s) { return parseFloat(String(s).replace(',', '.')); }
  function pair(lat, lng, source) {
    lat = num(lat); lng = num(lng);
    return Geo.valid(lat, lng) ? { lat: lat, lng: lng, source: source } : null;
  }

  var DMS_PART = /(\d{1,3}(?:[.,]\d+)?)\s*[°º˚]?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*)?([NSEWKGDB])\b/gi;
  var DMS_LEAD = /\b([NSEWKGDB])\s*(\d{1,3}(?:[.,]\d+)?)\s*[°º˚]?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|'')?)?/gi;
  var LAT_LETTERS = 'NSKG', NEG_LETTERS = 'SWGB';

  function fromParts(deg, min, sec, letter) {
    var v = num(deg) + (min ? num(min) / 60 : 0) + (sec ? num(sec) / 3600 : 0);
    letter = letter.toUpperCase();
    return { value: NEG_LETTERS.indexOf(letter) >= 0 ? -v : v, isLat: LAT_LETTERS.indexOf(letter) >= 0 };
  }

  function parseDMS(text) {
    var found = [], m;
    DMS_PART.lastIndex = 0;
    while ((m = DMS_PART.exec(text))) found.push(fromParts(m[1], m[2], m[3], m[4]));
    if (found.length !== 2) {
      found = [];
      DMS_LEAD.lastIndex = 0;
      while ((m = DMS_LEAD.exec(text))) found.push(fromParts(m[2], m[3], m[4], m[1]));
    }
    if (found.length !== 2) return null;
    var lat = found[0].isLat ? found[0] : found[1];
    var lng = found[0].isLat ? found[1] : found[0];
    if (!lat.isLat || lng.isLat) return null;
    return Geo.valid(lat.value, lng.value) ? { lat: lat.value, lng: lng.value, source: 'dms' } : null;
  }

  Geo.parse = function (input) {
    if (input == null) return null;
    var text = String(input).trim();
    if (!text) return null;
    var m;
    try { text = decodeURIComponent(text); } catch (e) { /* keep as typed */ }

    // Links: Google Maps, Apple Maps, OpenStreetMap, geo: URIs
    if ((m = text.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/))) return pair(m[1], m[2], 'link');
    if ((m = text.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/))) return pair(m[1], m[2], 'link');
    if ((m = text.match(/[?&#](?:q|query|ll|sll|destination|daddr|center|coordinates)=(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i))) return pair(m[1], m[2], 'link');
    if ((m = text.match(/[?&]mlat=(-?\d{1,3}(?:\.\d+)?)&mlon=(-?\d{1,3}(?:\.\d+)?)/i))) return pair(m[1], m[2], 'link');
    if ((m = text.match(/#map=\d{1,2}\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)/))) return pair(m[1], m[2], 'link');
    if ((m = text.match(/^geo:(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i))) return pair(m[1], m[2], 'link');

    // UTM: "36S 488545 4419530" or "36 S 488545 4419530"
    if ((m = text.match(/^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{3,7}(?:[.,]\d+)?)\s*(?:m?E)?\s*[, ]\s*(\d{1,8}(?:[.,]\d+)?)\s*(?:m?N)?$/i))) {
      var u = Geo.fromUTM(parseInt(m[1], 10), m[2], num(m[3]), num(m[4]));
      return u ? { lat: u.lat, lng: u.lng, source: 'utm' } : null;
    }

    // Decimal with a decimal comma, separated by ; or whitespace: "39,9255; 32,8663"
    if ((m = text.match(/^\(?\s*(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)\s*\)?$/))) return pair(m[1], m[2], 'decimal');
    // Plain decimal: "39.9255, 32.8663" / "39.9255 32.8663" / "(39.9, 32.8)"
    if ((m = text.match(/^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/))) return pair(m[1], m[2], 'decimal');

    // Degrees / minutes / seconds with hemisphere letters (N/S/E/W or K/G/D/B)
    var d = parseDMS(text);
    if (d) return d;

    // Geohash (letters and digits, at least one digit, 5–12 chars)
    if (/^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$/i.test(text) && /\d/.test(text)) {
      var g = Geo.fromGeohash(text);
      return g ? { lat: g.lat, lng: g.lng, source: 'geohash' } : null;
    }
    return null;
  };

  /* Links for opening a point elsewhere. */
  Geo.links = function (lat, lng) {
    var ll = lat.toFixed(6) + ',' + lng.toFixed(6);
    return {
      google: 'https://www.google.com/maps/search/?api=1&query=' + ll,
      osm: 'https://www.openstreetmap.org/?mlat=' + lat.toFixed(6) + '&mlon=' + lng.toFixed(6) + '#map=17/' + lat.toFixed(6) + '/' + lng.toFixed(6),
      apple: 'https://maps.apple.com/?ll=' + ll + '&q=' + ll,
      geo: 'geo:' + ll
    };
  };

  if (typeof module === 'object' && module.exports) module.exports = Geo;
  else root.Geo = Geo;
})(typeof window !== 'undefined' ? window : this);
