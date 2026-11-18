require('dotenv').config({ quiet: true });
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
// Bazalar ochilishidan oldin: zaxiradan tiklash (so'ralgan bo'lsa) va yangi versiyadan oldingi zaxira
require('./startup').beforeOpen();
const PROD = process.env.NODE_ENV === 'production';

const path = require('path');
const express = require('express');
const compression = require('compression');
const fs = require('fs');
const { DATA_DIR } = require('./config');
const db = require('./db');
const main = require('./main_db');
const branchDb = require('./branch_db');
const branches = require('./branches');
const accounts = require('./accounts');
const { runInBranch } = require('./context');
const { now, normPhone, httpError } = require('./util');
const auth = require('./routes/auth');
const owner = require('./routes/owner');

const app = express();
// X-Forwarded-For faqat ishonchli proxy (Caddy, nginx) orqasida hisobga olinadi: .env → TRUST_PROXY=1.
// Aks holda har kim bu headerni soxtalashtirib, IP bo'yicha cheklovlarni aylanib o'ta olardi.
const TP = process.env.TRUST_PROXY;
app.set('trust proxy', !TP || TP === '0' ? false : /^\d+$/.test(TP) ? Number(TP) : TP);
app.disable('x-powered-by');
app.use(compression());                    // gzip: sahifalar va API telefonda tezroq yuklanadi
app.use(express.json({ limit: '2mb' }));
app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });   // tanasiz so'rovlar 500 bermasin
// Xavfsizlik header'lari: boshqa sayt panelni iframe ichida ochib (clickjacking) tugmalarni bostira olmaydi
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    'Referrer-Policy': 'same-origin',
  });
  next();
});
// Parol xeshlari hech qaysi API javobida chiqmaydi
app.set('json replacer', (k, v) => (k === 'shop_password_hash' || k === 'password_hash' ? undefined : v));
app.use(auth.loadUser);

const ROOT = path.join(__dirname, '..');

// Ishlayotgan kod versiyasi (git commit) — deploy to'g'ri o'tganini tekshirish uchun
const VERSION = (() => {
  try {
    const fs = require('fs');
    const git = path.join(__dirname, '..', '.git');
    const head = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    const sha = head.startsWith('ref: ') ? fs.readFileSync(path.join(git, head.slice(5)), 'utf8').trim() : head;
    return sha.slice(0, 7);
  } catch { return ''; }
})();

// Server holatini tekshirish (monitoring, deploy va avtomatik yangilanish uchun)
app.get('/healthz', (_req, res) => {
  try { main.prepare('SELECT 1').get(); res.json({ ok: true, time: now(), version: VERSION }); } catch { res.status(500).json({ ok: false }); }
});

// Katalog (sayt): filial URL'dagi qisqa kod bo'yicha aniqlanadi. Admin sessiyasi bu yerda hisobga olinmaydi —
// mijoz amallari faqat shu filial bazasiga va "Sayt: ..." nomi bilan yoziladi.
function shopBranch(req, _res, next) {
  let b = branches.getBySlug(req.params.slug);
  if (!b && (req.params.slug === 'default' || req.params.slug === 'catalog' || !req.params.slug)) {
    b = branches.allBranches().find((x) => x.status === 'active');
  }
  if (!b || b.status !== 'active') return next(httpError(404, 'Katalog topilmadi'));
  req.user = null; req.owner = null; req.branch = b;
  runInBranch(b.id, next);
}

// --- API ---
// O'z brendi: sahifa ochilishidan oldin yuklanadi (window.__BRAND) — logo va rang birinchi chizishdayoq to'g'ri
app.get('/api/brand.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send('window.__BRAND=' + JSON.stringify(require('./business').publicBrand()).replace(/</g, '\\u003c') + ';');
});
app.use('/brand-assets', express.static(path.join(DATA_DIR, 'brand'), { maxAge: '7d', fallthrough: false }));
app.use('/api/setup', owner.setup);
app.use('/api/auth', auth.router);
app.use('/api/owner', owner.router);
app.get('/api/shop-branches', (_req, res) => res.json(branches.allBranches().filter((b) => b.status === 'active').map((b) => ({ slug: b.slug, name: b.name, address: b.address }))));
app.use('/api/shop/:slug', shopBranch, require('./routes/shop').router, (_req, _res, next) => next(httpError(404, 'Topilmadi')));
app.use('/api/clients', auth.requireAuth, require('./routes/clients').router);
app.use('/api/products', auth.requireAuth, require('./routes/products').router);
app.use('/api/import', auth.requireAuth, require('./routes/import').router);
app.use('/api/sales', auth.requireAuth, require('./routes/sales').router);
app.use('/api/payments', auth.requireAuth, require('./routes/payments').router);
app.use('/api/quotes', auth.requireAuth, require('./routes/quotes').router);
app.use('/api/orders', auth.requireAuth, require('./routes/orders').router);
app.use('/api/registers', auth.requireAuth, require('./routes/registers').router);
app.use('/api/reviews', auth.requireAuth, require('./routes/reviews').router);
app.use('/api/price-levels', auth.requireAuth, require('./routes/prices').router);
app.use('/api/returns', auth.requireAuth, require('./routes/returns').router);
app.use('/api/inventory', auth.requireAuth, require('./routes/inventory').router);
app.use('/api/reports', auth.requireAuth, require('./routes/reports').router);
app.use('/api/transfers', auth.requireAuth, require('./routes/transfers').router);
app.use('/api/partners', auth.requireAuth, require('./routes/partners').router);
app.use('/api/hardware', auth.requireAuth, require('./routes/hardware').router);
app.use('/api', auth.requireAuth, require('./routes/purchases').router);
app.use('/api', auth.requireAuth, require('./routes/finance').router);
app.use('/api', auth.requireAuth, require('./routes/staffpay').router);   // /api/attendance, /api/payroll   // /api/expenses, /api/expense-categories, /api/shifts   // /api/suppliers, /api/purchases, /api/supplier-payments
app.use('/api/docs', auth.requireAuth, require('./doc_files').upload);
app.use('/api', auth.requireAuth, require('./routes/misc').router);
app.use('/api', (_req, _res, next) => { const e = new Error('Topilmadi'); e.status = 404; next(e); });

// --- Statik fayllar ---
app.use('/files', require('./doc_files').serve);   // hujjat PDF'lari (vaqtinchalik havola)
// Mahsulot rasmlari: /uploads/<filial ID>/<fayl> — har bir filialning o'z papkasidan
app.get('/uploads/:bid/:file', (req, res, next) => {
  const bid = Number(req.params.bid);
  if (!Number.isInteger(bid) || bid <= 0 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(req.params.file)) return next();
  let file = path.join(branchDb.uploadsDir(bid), req.params.file);
  if (!fs.existsSync(file)) {
    // Agar fayl joriy filialda bo'lmasa, boshqa faol filiallarning papkasidan qidiramiz (fallback)
    const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== bid);
    for (const ob of allB) {
      const altFile = path.join(branchDb.uploadsDir(ob.id), req.params.file);
      if (fs.existsSync(altFile)) {
        try {
          fs.mkdirSync(branchDb.uploadsDir(bid), { recursive: true });
          fs.copyFileSync(altFile, file);
        } catch {}
        break;
      }
    }
  }
  if (!fs.existsSync(file)) return next();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
});
// Kutubxonalar o'zgarmaydi — brauzer 30 kun keshda saqlaydi; ilova fayllari ETag bilan tekshiriladi (yangilanish darhol ko'rinadi)
const LONG = { maxAge: '30d', immutable: true };
app.use('/vendor/vue.js', express.static(path.join(ROOT, 'node_modules/vue/dist/vue.esm-browser.prod.js'), LONG));
app.use('/vendor/zxing.js', express.static(path.join(ROOT, 'node_modules/@zxing/library/umd/index.min.js'), LONG));   // kamera bilan shtrix-kod o'qish
app.use('/vendor/inter', express.static(path.join(ROOT, 'node_modules/@fontsource-variable/inter'), LONG));   // shrift — internetsiz ham
app.use('/vendor/html2pdf.js', express.static(path.join(ROOT, 'node_modules/html2pdf.js/dist/html2pdf.bundle.min.js'), LONG));
app.use('/brand', express.static(path.join(ROOT, 'public/brand'), { maxAge: 0 })); // ETag bilan qayta tekshiriladi — logo yangilansa darhol ko'rinadi
app.get('/sw.js', (_req, res) => { res.set('Cache-Control', 'no-cache').set('Service-Worker-Allowed', '/').sendFile(path.join(ROOT, 'public/sw.js')); });
app.get('/manifest.webmanifest', (_req, res) => {
  // Ilova nomi — biznes brendi
  const b = require('./business').publicBrand();
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
  if (b.name) { m.name = b.name + (b.tagline ? ' ' + b.tagline : ''); m.short_name = b.name; }
  if (b.color) m.theme_color = b.color;
  if (b.logo) m.icons = [{ src: b.logo, sizes: '512x512', type: b.logo.endsWith('.png') ? 'image/png' : b.logo.endsWith('.webp') ? 'image/webp' : 'image/jpeg', purpose: 'any' }, ...m.icons];
  res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify(m));
});
app.use(express.static(path.join(ROOT, 'public'), { index: false }));
app.get(['/shop', '/shop/', '/shop/:slug', '/shop/:slug/'], (_req, res) => res.sendFile(path.join(ROOT, 'public/shop/index.html')));
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.startsWith('lacherry.') && !host.includes('admin')) {
    return res.sendFile(path.join(ROOT, 'public/shop/index.html'));
  }
  return res.sendFile(path.join(ROOT, 'public/admin/index.html'));
});
app.get('/display', (_req, res) => res.sendFile(path.join(ROOT, 'public/display/index.html')));   // xaridor ekrani (ikkinchi monitor)

// --- Xatolar ---
app.use((err, _req, res, _next) => {
  const isLimit = err.code === 'LIMIT_FILE_SIZE';
  const isAbort = err.message === 'Request aborted';
  const status = err.status || (isLimit || isAbort ? 400 : 500);
  if (status >= 500 && !isAbort) console.error(err);
  let errMsg = err.message;
  if (isLimit) {
    errMsg = "Fayl hajmi juda katta (maksimal 250 MB). Excel ichidagi rasmlarni siqish yoki kichikroq bo'laklarga bo'lish tavsiya etiladi.";
  } else if (isAbort) {
    errMsg = "Ulanish uzildi (Request aborted). Internetingizni tekshirib, qayta urinib ko'ring.";
  }
  // Ichki xato tafsilotlari foydalanuvchiga chiqmaydi (jurnalga yoziladi)
  res.status(status).json({ error: status >= 500 ? 'Server xatosi. Qayta urinib ko\'ring' : errMsg, ...(err.code === 'no_branch' ? { code: err.code } : {}) });
});

// Har bir filial bazasida bajariladigan ish (bittasidagi xato boshqalarini to'xtatmaydi)
function forEachBranch(fn) {
  for (const b of branches.allBranches()) {
    try { runInBranch(b.id, () => fn(b)); } catch (e) { console.error(`[filial ${b.id}]`, e.message); }
  }
}

forEachBranch(() => {
  // Kategoriya / brendlardagi katta-kichik harf farqlarini birlashtirish
  require('./colors').mergeCaseVariants();
  // Avvalroq "+998" takrorlanib saqlangan telefonlarni tuzatish
  for (const c of db.prepare("SELECT id, phone, phone2 FROM clients WHERE length(phone) > 13 OR length(phone2) > 13").all()) {
    db.prepare('UPDATE clients SET phone=?, phone2=? WHERE id=?').run(normPhone(c.phone), normPhone(c.phone2), c.id);
  }
});

// Yagona ombor va filiallararo umumiy mahsulotlar sinxronizatsiyasi
const { isSharedEnabled, syncAllBranchesCatalogAndStock } = require('./shared_sync');
if (isSharedEnabled()) {
  try { syncAllBranchesCatalogAndStock(); } catch (e) { console.error('[shared_sync startup]', e.message); }
}

// Eskirgan sessiyalarni tozalash (ishga tushganda va har 6 soatda)
function cleanupSessions() {
  accounts.cleanupSessions();
  forEachBranch(() => db.prepare('DELETE FROM shop_sessions WHERE expires_at < ?').run(now()));
}
cleanupSessions();
setInterval(cleanupSessions, 6 * 3600e3).unref();

// Eski amallar jurnalini arxivga chiqarish (ishga tushgandan 1 daqiqa keyin va har kuni)
const archiveAll = () => forEachBranch((b) => require('./archive').archiveAudit(b.id));
setTimeout(archiveAll, 60e3).unref();
setInterval(archiveAll, 24 * 3600e3).unref();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (admin panel)${PROD ? '  [production]' : ''}`);
  if (owner.needsSetup()) console.log(`Birinchi sozlash: brauzerda http://localhost:${PORT}/ ni oching va egasi akkauntini yarating\n  (boshqa kompyuterdan ochilsa so'raladigan sozlash kodi: ${owner.SETUP_TOKEN})`);
  require('./backup').scheduleBackups();
});
// Katta hajmdagi fayllarni (100–250 MB) sekin tarmoqda uzilishsiz yuklash uchun
server.requestTimeout = 10 * 60 * 1000; // 10 daqiqa
server.headersTimeout = 65 * 1000;

// To'g'ri to'xtash (Ctrl+C): yangi so'rovlar qabul qilinmaydi, baza yopiladi
function shutdown(sig) {
  console.log(`[${sig}] to'xtatilmoqda...`);
  server.close(() => {
    branchDb.closeAll();
    try { main.close(); } catch { /* jim */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && (err.stack || err.message || err));
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && (reason.stack || reason.message || reason));
});
