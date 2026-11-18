// Hujjat PDF'lari uchun vaqtinchalik havola (telefon va mobil qurilmalar uchun).
// Brauzer yaratgan PDF serverga yuklanadi → 30 daqiqa amal qiladigan havola beriladi:
//   - Mobil brauzerda yuklab olish yoki alohida oynada ochish
//   - u yerdan telefon "Ulashish" oynasi orqali Canon PRINT / Print / Fayllar
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('./util');

const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'tmp-docs');
const TTL = 30 * 60e3;
fs.mkdirSync(DIR, { recursive: true });

const safeName = (n) => String(n || 'hujjat.pdf').replace(/[^\w.\-]+/g, '_').replace(/^_+/, '').slice(0, 80).replace(/(\.pdf)?$/i, '.pdf');

function cleanup() {
  const now = Date.now();
  for (const f of fs.readdirSync(DIR)) {
    try { if (now - fs.statSync(path.join(DIR, f)).mtimeMs > TTL) fs.rmSync(path.join(DIR, f), { force: true }); } catch { /* jim */ }
  }
}
setInterval(cleanup, 10 * 60e3).unref();

// POST /api/docs/pdf?name=Nakladnoy_N2026-0001.pdf  (tanasi — PDF), faqat kirgan xodim
const upload = express.Router();
upload.post('/pdf', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.slice(0, 5).toString() !== '%PDF-') throw httpError(400, 'PDF emas');
  const token = crypto.randomBytes(16).toString('hex');
  const name = safeName(req.query.name);
  fs.writeFileSync(path.join(DIR, token + '.pdf'), buf);
  res.json({ url: `/files/${token}/${encodeURIComponent(name)}`, name });
});

// GET /files/<token>/<nom>.pdf  (?dl=1 — yuklab olish sifatida). Token — 32 belgi, taxmin qilib bo'lmaydi
const serve = express.Router();
serve.get('/:token/:name', (req, res) => {
  const { token } = req.params;
  const file = /^[a-f0-9]{32}$/.test(token) && path.join(DIR, token + '.pdf');
  if (!file || !fs.existsSync(file) || Date.now() - fs.statSync(file).mtimeMs > TTL) throw httpError(404, 'Havola eskirgan');
  const name = safeName(req.params.name);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${req.query.dl ? 'attachment' : 'inline'}; filename="${name}"`,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(file);
});

module.exports = { upload, serve };
