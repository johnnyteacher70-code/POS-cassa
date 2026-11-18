// Tashqi havoladan rasmni xavfsiz yuklab olish (Excel importdagi rasm havolalari uchun).
// Server o'zining ichki tarmog'iga (localhost, 192.168.x.x, 169.254.169.254 ...) murojaat qilmasligi kerak (SSRF):
//   - manzil DNS orqali aniqlanib, faqat ochiq internet IP siga ulaniladi — tekshiruv aynan ulanish
//     paytida (lookup) bajariladi, shuning uchun DNS javobini almashtirish hiylasi ham ishlamaydi;
//   - har bir yo'naltirish (redirect) qayta tekshiriladi, ko'pi bilan 3 ta;
//   - hajm oqim davomida cheklanadi (Content-Length yolg'on yoki yo'q bo'lsa ham).
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

function v4ToInt(ip) { return ip.split('.').reduce((a, x) => (a << 8) + Number(x), 0) >>> 0; }
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
].map(([a, bits]) => [v4ToInt(a), bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0]);

function isPublicIp(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !V4_BLOCKED.some(([base, mask]) => ((n & mask) >>> 0) === base);
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    if (x === '::' || x === '::1') return false;
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8')) return false;
    return true;
  }
  return false;
}

function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => !isPublicIp(a.address))) return cb(new Error('Ichki tarmoq manziliga ruxsat yo\'q'));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

// Natija: Buffer yoki null (xato, ruxsat yo'q, juda katta)
function fetchLimited(url, { maxBytes = 8 * 1024 * 1024, timeoutMs = 15000, redirects = 3 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve(null); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return resolve(null);
    // Manzil to'g'ridan-to'g'ri IP bo'lsa Node DNS (lookup) ni chaqirmaydi — shuning uchun alohida tekshiriladi
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !isPublicIp(host)) return resolve(null);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { lookup: safeLookup, timeout: timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0 DokonBoshqaruv/1.0', Accept: 'image/*' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return resolve(null);
        let next;
        try { next = new URL(res.headers.location, u).toString(); } catch { return resolve(null); }
        return resolve(fetchLimited(next, { maxBytes, timeoutMs, redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200 || Number(res.headers['content-length'] || 0) > maxBytes) { res.resume(); return resolve(null); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(); resolve(null); } else chunks.push(c);
      });
      res.on('end', () => resolve(size <= maxBytes ? Buffer.concat(chunks) : null));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

module.exports = { fetchLimited, isPublicIp };
