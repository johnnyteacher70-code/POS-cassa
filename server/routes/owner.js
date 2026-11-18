// Biznes egasi: birinchi sozlash va filiallarni boshqarish
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const main = require('../main_db');
const accounts = require('../accounts');
const branches = require('../branches');
const { requireOwner, sidOf } = require('./auth');
const { now, str, int, httpError, audit } = require('../util');

// ---- Birinchi ishga tushirish: egasi akkauntini yaratish (faqat bir marta) ----
const setup = express.Router();
const needsSetup = () => !main.prepare('SELECT 1 FROM owners LIMIT 1').get();

// Egasi yaratilguncha tarmoqdagi begona odam "egasi" bo'lib olmasligi uchun: server kompyuterining o'zidan
// (localhost) kod so'ralmaydi, boshqa kompyuterdan — server konsolida chiqqan bir martalik kod kerak.
// Proxy orqasida (TRUST_PROXY) barcha so'rovlar localhost'dan kelgandek ko'rinadi — u holda kod doim so'raladi.
const SETUP_TOKEN = crypto.randomBytes(4).toString('hex').toUpperCase();
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const tokenRequired = (req) => !!process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '0' || !LOOPBACK.has(req.socket.remoteAddress);

setup.get('/', (req, res) => res.json({ needed: needsSetup(), token_required: needsSetup() && tokenRequired(req) }));

setup.post('/', async (req, res) => {
  if (!needsSetup()) throw httpError(404, 'Topilmadi');
  if (tokenRequired(req)) {
    const a = Buffer.from(String(req.body.token || '').trim().toUpperCase()); const b = Buffer.from(SETUP_TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError(403, "Sozlash kodi noto'g'ri (server oynasida ko'rsatilgan)");
  }
  const username = accounts.normLogin(str(req.body.username, 50));
  const password = String(req.body.password || '');
  const full_name = str(req.body.full_name, 100);
  if (!full_name) throw httpError(400, 'Ismingizni kiriting');
  if (!accounts.LOGIN_RE.test(username)) throw httpError(400, 'Login kamida 3 belgi (a-z, 0-9, _ .)');
  if (password.length < 6) throw httpError(400, 'Parol kamida 6 belgi');
  const hash = await bcrypt.hash(password, 10);
  let id;
  main.transaction(() => {
    if (!needsSetup()) throw httpError(404, 'Topilmadi');   // bir vaqtda ikki so'rov kelsa
    id = Number(main.prepare('INSERT INTO owners (username,password_hash,full_name,created_at) VALUES (?,?,?,?)')
      .run(username, hash, full_name, now()).lastInsertRowid);
  })();
  res.cookie('sid', accounts.createSession({ kind: 'owner', owner_id: id }), { httpOnly: true, sameSite: 'lax', maxAge: accounts.SESSION_DAYS * 864e5, secure: req.secure });
  res.json({ ok: true });
});

// ---- Filiallar (faqat egasi) ----
const router = express.Router();
router.use(requireOwner);
const ownerReq = (req) => ({ actorName: `Egasi: ${req.owner.full_name || req.owner.username}` });
const idOf = (req) => int(req.params.id);

router.get('/branches', (_req, res) => res.json(branches.listBranches()));
router.post('/branches', (req, res) => {
  const can = require('../license').canAddBranch(branches.allBranches().length);
  if (!can.ok) throw httpError(402, can.reason);
  const out = branches.createBranch(req.body, ownerReq(req));
  const { isSharedEnabled, syncAllBranchesCatalogAndStock } = require('../shared_sync');
  if (isSharedEnabled()) {
    try { syncAllBranchesCatalogAndStock(); } catch (e) { console.warn('[createBranch shared_sync]', e.message); }
  }
  res.json(out);
});

// ---- Litsenziya ----
router.get('/license', (_req, res) => res.json({ ...require('../license').status(), branches_used: branches.allBranches().length }));
router.post('/license', (req, res) => {
  const st = require('../license').install(req.body.key);
  if (!st) throw httpError(400, "Litsenziya kaliti noto'g'ri");
  res.json(st);
});
router.put('/branches/:id', (req, res) => res.json(branches.updateBranch(idOf(req), req.body)));
router.post('/branches/:id/status', (req, res) => res.json(branches.setStatus(idOf(req), str(req.body.status, 20))));
router.delete('/branches/:id', async (req, res) => res.json(await branches.deleteBranch(idOf(req), req.body.confirm_name)));
router.get('/branches/:id/admins', (req, res) => res.json(branches.branchAdmins(idOf(req))));
router.post('/branches/:id/admin-password', (req, res) => res.json(branches.resetAdminPassword(idOf(req), int(req.body.user_id), req.body.password, ownerReq(req))));

// Egasi filialga kiradi (sessiyada shu filial belgilanadi) yoki filiallar sahifasiga qaytadi
// ---- O'z brendi va biznes sozlamalari ----
const business = require('../business');
const multer = require('multer');
const pathM = require('path');
const fsM = require('fs');
const { DATA_DIR } = require('../config');
const BRAND_DIR = pathM.join(DATA_DIR, 'brand');
const LOGO_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_r, f, cb) => cb(null, !!LOGO_EXT[f.mimetype]) });
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.get('/business', (_req, res) => res.json({ ...business.publicBrand(), sale_mode: business.get('sale_mode'), shared_warehouse: business.get('shared_warehouse') === '1' }));
router.put('/business', (req, res) => {
  const b = req.body;
  if ('name' in b) business.set('brand_name', str(b.name, 40));
  if ('tagline' in b) business.set('brand_tagline', str(b.tagline, 30));
  if ('color' in b) { const c = str(b.color, 7); if (c && !COLOR_RE.test(c)) throw httpError(400, "Rang noto'g'ri"); business.set('brand_color', c); }
  if ('industry' in b) business.set('industry', str(b.industry, 30));
  if ('sale_mode' in b) business.set('sale_mode', ['retail', 'wholesale', 'mixed'].includes(b.sale_mode) ? b.sale_mode : 'mixed');
  if ('shared_warehouse' in b) {
    const on = b.shared_warehouse ? '1' : '0';
    business.set('shared_warehouse', on);
    if (on === '1') {
      const { syncAllBranchesCatalogAndStock } = require('../shared_sync');
      try { syncAllBranchesCatalogAndStock(); } catch (e) { console.warn('[shared_warehouse sync]', e.message); }
    }
  }
  res.json({ ok: true });
});
router.post('/business/logo', logoUpload.single('logo'), (req, res) => {
  if (!req.file) throw httpError(400, 'PNG, JPG yoki WEBP rasm tanlang (2 MB gacha)');
  const b = req.file.buffer;
  const real = (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP');
  if (!real) throw httpError(400, 'Fayl rasm emas');
  fsM.mkdirSync(BRAND_DIR, { recursive: true });
  const name = 'logo-' + crypto.randomBytes(5).toString('hex') + LOGO_EXT[req.file.mimetype];
  fsM.writeFileSync(pathM.join(BRAND_DIR, name), b);
  const old = business.get('brand_logo');
  business.set('brand_logo', '/brand-assets/' + name);
  if (old) fsM.rmSync(pathM.join(BRAND_DIR, pathM.basename(old)), { force: true });
  res.json({ logo: '/brand-assets/' + name });
});
router.delete('/business/logo', (_req, res) => {
  const old = business.get('brand_logo');
  if (old) fsM.rmSync(pathM.join(BRAND_DIR, pathM.basename(old)), { force: true });
  business.set('brand_logo', '');
  res.json({ ok: true });
});

// ---- Zaxira nusxalar: ro'yxat, hozir olish, tiklash ----
function dirSize(d) {
  let n = 0;
  for (const f of fsM.readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? dirSize(pathM.join(d, f.name)) : fsM.statSync(pathM.join(d, f.name)).size;
  return n;
}
router.get('/backups', (_req, res) => {
  const { BACKUP_DIR } = require('../backup');
  const list = fsM.existsSync(BACKUP_DIR) ? fsM.readdirSync(BACKUP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}_\d{4}/.test(f) && fsM.existsSync(pathM.join(BACKUP_DIR, f, 'main.db'))) : [];
  res.json({
    dir: BACKUP_DIR, copy_dir: process.env.BACKUP_COPY_DIR || '', encrypted: !!require('../backup').backupKey(),
    rows: list.sort().reverse().map((name) => {
      const p = pathM.join(BACKUP_DIR, name);
      const brs = fsM.existsSync(pathM.join(p, 'branches')) ? fsM.readdirSync(pathM.join(p, 'branches')).length : 0;
      return { name, date: name.slice(0, 10) + ' ' + name.slice(11, 13) + ':' + name.slice(13, 15), label: name.slice(16), branches: brs, size: dirSize(p) };
    }),
  });
});
router.post('/backups', async (_req, res) => {
  const snap = await require('../backup').runBackup('qolda');
  res.json({ name: pathM.basename(snap) });
});
// Tiklash: avval joriy holat saqlanadi, keyin server qayta ishga tushadi va nusxa bazalar ochilishidan oldin qo'yiladi
router.post('/backups/restore', async (req, res) => {
  const { BACKUP_DIR } = require('../backup');
  const name = pathM.basename(str(req.body.name, 100));
  if (!name || !fsM.existsSync(pathM.join(BACKUP_DIR, name, 'main.db'))) throw httpError(404, 'Zaxira nusxa topilmadi');
  if (str(req.body.confirm, 20) !== 'TIKLASH') throw httpError(400, 'Tasdiqlash uchun TIKLASH deb yozing');
  await require('../backup').runBackup('tiklashdan_oldin');
  fsM.writeFileSync(require('../startup').PENDING, name);
  res.json({ ok: true, restarting: true });
  // Nazoratchi (scripts/run.js yoki systemd) serverni qayta ishga tushiradi
  setTimeout(() => {
    try { require('../branch_db').closeAll(); main.close(); } catch { /* jim */ }
    process.exit(75);
  }, 400);
});

// ---- Shifrlangan zaxira: parol, .dkz yuklab olish, .dkz fayldan tiklash ----
router.post('/backups/password', (req, res) => {
  const pw = String(req.body.password || '');
  if (!pw) { business.set('backup_salt', ''); business.set('backup_key', ''); return res.json({ encrypted: false }); }
  if (pw.length < 8) throw httpError(400, "Parol kamida 8 belgi bo'lsin");
  const k = require('../backup_crypt').makeKey(pw);
  business.set('backup_salt', k.salt);
  business.set('backup_key', k.key);
  res.json({ encrypted: true });
});
router.get('/backups/:name/download', (req, res) => {
  const { BACKUP_DIR, backupKey } = require('../backup');
  const name = pathM.basename(String(req.params.name));
  const dir = pathM.join(BACKUP_DIR, name);
  if (!fsM.existsSync(pathM.join(dir, 'main.db'))) throw httpError(404, 'Zaxira nusxa topilmadi');
  const key = backupKey();
  if (!key) throw httpError(400, "Avval zaxira parolini o'rnating — nusxa faqat shifrlangan holda yuklab olinadi");
  const buf = require('../backup_crypt').seal(dir, key);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="dokon-zaxira_${name}.dkz"`);
  res.end(buf);
});
// .dkz fayl (boshqa kompyuterdan / fleshkadan) → zaxiralar ro'yxatiga qo'shiladi; keyin odatdagidek «Tiklash»
router.post('/backups/upload', express.raw({ type: 'application/octet-stream', limit: '2gb' }), (req, res) => {
  const { BACKUP_DIR, stampNow } = require('../backup');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'Faylni tanlang');
  const name = `${stampNow()}_fayldan`;
  const dir = pathM.join(BACKUP_DIR, name);
  try { require('../backup_crypt').open(req.body, decodeURIComponent(String(req.get('x-backup-password') || '')), dir); }
  catch (e) { fsM.rmSync(dir, { recursive: true, force: true }); throw httpError(400, e.message); }
  res.json({ name });
});

// ---- Eski amallar jurnali arxivi (avtomatik har kuni; bu yerdan — hozir) ----
router.post('/archive/audit', (_req, res) => {
  const { runInBranch } = require('../context');
  const { archiveAudit } = require('../archive');
  let n = 0;
  for (const b of branches.allBranches()) n += runInBranch(b.id, () => archiveAudit(b.id));
  res.json({ archived: n });
});

// ---- Tarmoq: boshqa kompyuter / planshet / telefonlardan ulanish manzillari (QR kod bilan) ----
router.get('/network', async (_req, res) => {
  const os = require('os');
  const port = Number(process.env.PORT) || 3000;
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const urls = ips.map((ip) => `http://${ip}:${port}`);
  const QR = require('qrcode');
  const qr = urls[0] ? await QR.toString(urls[0], { type: 'svg', margin: 1, width: 180 }) : '';
  res.json({ urls, local: `http://localhost:${port}`, qr });
});

// ---- Demo filial: taqdimot va sinov uchun bir tugma bilan (keyin bloklab o'chirish mumkin) ----
router.post('/demo', (req, res) => {
  const lic = require('../license').canAddBranch(branches.allBranches().length);
  if (!lic.ok) throw httpError(402, lic.reason);
  let slug = 'demo', n = 1;
  while (branches.getBySlug(slug)) slug = `demo-${++n}`;
  let login = 'demo_admin', k = 1;
  while (accounts.loginTaken(login)) login = `demo_admin${++k}`;
  const b = branches.createBranch({ name: n > 1 ? `Demo filial ${n}` : 'Demo filial', slug, address: 'Toshkent', admin: { full_name: 'Demo Admin', username: login, password: 'demo123' } }, ownerReq(req));
  const { execFileSync } = require('child_process');
  try {
    const ind = /^[a-z]{3,20}$/.test(String(req.body.industry || '')) ? req.body.industry : '';
    execFileSync(process.execPath, [pathM.join(__dirname, '..', 'demo.js'), String(b.id), ...(ind ? [ind] : [])], { env: process.env, stdio: 'ignore', timeout: 120000 });
  } catch (e) { throw httpError(500, 'Demo ma\'lumotlarni qo\'shib bo\'lmadi'); }
  require('../branch_db').closeBranch(b.id);   // demo.js boshqa jarayonda yozdi — kesh qayta ochilsin
  res.json({ id: b.id, slug, admin: login, password: 'demo123' });
});

// ---- Xavfsizlik: ikki bosqichli kirish (TOTP) va faol kirishlar ----
const totp = require('../totp');
const pending2fa = new Map();   // owner_id → yangi sir (tasdiqlanguncha)
router.get('/security', (req, res) => {
  const o = main.prepare('SELECT totp_secret FROM owners WHERE id=?').get(req.owner.id);
  res.json({ totp: !!(o && o.totp_secret) });
});
router.post('/2fa/setup', async (req, res) => {
  const secret = totp.newSecret();
  pending2fa.set(req.owner.id, secret);
  const url = totp.otpauth(secret, req.owner.username, require('../business').get('brand_name') || "Do'kon boshqaruv");
  res.json({ secret, url, qr: await require('qrcode').toString(url, { type: 'svg', margin: 1, width: 200 }) });
});
router.post('/2fa/enable', (req, res) => {
  const secret = pending2fa.get(req.owner.id);
  if (!secret) throw httpError(400, 'Avval QR kodni oling');
  if (!totp.verify(secret, req.body.code)) throw httpError(400, "Kod noto'g'ri — ilovadagi joriy kodni kiriting");
  main.prepare('UPDATE owners SET totp_secret=? WHERE id=?').run(secret, req.owner.id);
  pending2fa.delete(req.owner.id);
  res.json({ ok: true });
});
router.post('/2fa/disable', async (req, res) => {
  const o = main.prepare('SELECT * FROM owners WHERE id=?').get(req.owner.id);
  if (!(await bcrypt.compare(String(req.body.password || ''), o.password_hash))) throw httpError(400, "Parol noto'g'ri");
  if (!totp.verify(o.totp_secret, req.body.code)) throw httpError(400, "Kod noto'g'ri");
  main.prepare('UPDATE owners SET totp_secret=NULL WHERE id=?').run(o.id);
  res.json({ ok: true });
});

router.get('/sessions', (req, res) => {
  const { runInBranch } = require('../context');
  const cur = sidOf(req);
  const rows = main.prepare(`SELECT s.*, b.name branch_name FROM sessions s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.expires_at>? ORDER BY s.created_at DESC`).all(now());
  const names = new Map();
  res.json(rows.filter((s) => s.kind === 'staff' || s.owner_id === req.owner.id).map((s) => {
    let who = req.owner.full_name || req.owner.username;
    if (s.kind === 'staff') {
      const k = s.branch_id + ':' + s.user_id;
      if (!names.has(k)) {
        try { names.set(k, runInBranch(s.branch_id, () => { const u = require('../db').prepare('SELECT full_name, username FROM users WHERE id=?').get(s.user_id); return u ? u.full_name || u.username : '—'; })); }
        catch { names.set(k, '—'); }
      }
      who = names.get(k);
    }
    return { id: accounts.sessionId(s.token), kind: s.kind, who, branch: s.branch_name || '', ip: s.ip, ua: s.ua, created_at: s.created_at, current: s.token === cur };
  }));
});
router.delete('/sessions/:id', (req, res) => {
  const s = main.prepare('SELECT token, kind, owner_id FROM sessions').all().find((x) => accounts.sessionId(x.token) === req.params.id);
  if (!s || (s.kind === 'owner' && s.owner_id !== req.owner.id)) throw httpError(404, 'Topilmadi');
  if (s.token === sidOf(req)) throw httpError(400, "Joriy kirishni bu yerdan yopib bo'lmaydi — «Chiqish» ni bosing");
  accounts.deleteSession(s.token);
  res.json({ ok: true });
});

// ---- Umumiy hisobot: barcha filiallar bir sahifada (har bir filial bazasidan alohida hisoblanadi) ----
const PCS = (a) => `(${a}.qty * CASE WHEN ${a}.unit='karobka' THEN ${a}.box_qty ELSE 1 END)`;
function branchStats(from, to, today) {
  const db = require('../db');
  const S = "status='confirmed' AND deleted_at IS NULL AND kind='sale'";
  const sales = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) revenue FROM sales WHERE ${S} AND date BETWEEN ? AND ?`).get(from, to);
  const cogs = db.prepare(`SELECT COALESCE(SUM(i.cost * ${PCS('i')}),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id
    WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.kind='sale' AND s.date BETWEEN ? AND ?`).get(from, to).v;
  const ret = db.prepare(`SELECT COALESCE(SUM(ri.total),0) total, COALESCE(SUM(ri.cost * ${PCS('ri')}),0) cogs FROM sale_returns r JOIN sale_return_items ri ON ri.return_id=r.id
    WHERE r.deleted_at IS NULL AND r.date BETWEEN ? AND ?`).get(from, to);
  const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ?').get(from, to).v;
  const todayRev = db.prepare(`SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM sales WHERE ${S} AND date BETWEEN ? AND ?`).get(today + ' 00:00:00', today + ' 23:59:59');
  const cashIn = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM payments
    WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND date BETWEEN ? AND ?`).get(from, to).v;
  const debt = db.prepare('SELECT COALESCE(SUM(-balance),0) v, COUNT(*) n FROM clients WHERE deleted_at IS NULL AND balance<0').get();
  const stock = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN stock_pieces>0 THEN stock_pieces*cost_price END),0) v,
    COALESCE(SUM(CASE WHEN stock_pieces>0 THEN stock_pieces END),0) pieces,
    COALESCE(SUM(CASE WHEN stock_pieces>0 THEN (stock_pieces / CASE WHEN box_qty > 0 THEN box_qty ELSE 1 END) END),0) boxes,
    SUM(CASE WHEN min_stock>0 AND stock_pieces<=min_stock AND stock_pieces>0 THEN 1 ELSE 0 END) low,
    SUM(CASE WHEN stock_pieces<=0 THEN 1 ELSE 0 END) out_of_stock
    FROM products WHERE deleted_at IS NULL AND active=1`).get();
  const topProducts = db.prepare(`SELECT i.name, COALESCE(p.sku, '') sku, SUM(${PCS('i')}) qty, SUM(i.total) revenue
    FROM sale_items i
    JOIN sales s ON s.id=i.sale_id
    LEFT JOIN products p ON p.id=i.product_id
    WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.kind='sale' AND s.date BETWEEN ? AND ?
    GROUP BY i.name, p.sku
    ORDER BY qty DESC LIMIT 10`).all(from, to);
  const openShifts = db.prepare('SELECT COUNT(*) n FROM shifts WHERE closed_at IS NULL').get().n;
  const newOrders = db.prepare("SELECT COUNT(*) n FROM orders WHERE status='new' AND deleted_at IS NULL").get().n;
  const net = sales.revenue - ret.total;
  const gross = net - Math.round(cogs - ret.cogs);
  return {
    sales: sales.n, revenue: net, gross, expenses, net_profit: gross - expenses, cash_in: cashIn,
    today: todayRev.v, today_n: todayRev.n, debt: debt.v, debtors: debt.n,
    stock_value: Math.round(stock.v), stock_pieces: Math.round(stock.pieces), stock_boxes: Math.round(stock.boxes),
    low_stock: stock.low || 0, out_of_stock: stock.out_of_stock || 0,
    open_shifts: openShifts, new_orders: newOrders,
    top_products: topProducts,
  };
}

router.get('/summary', (req, res) => {
  const from = (str(req.query.from) || '0000-00-00') + ' 00:00:00';
  const to = (str(req.query.to) || '9999-12-31') + ' 23:59:59';
  const today = new Date().toLocaleString('sv-SE').slice(0, 10);
  const { runInBranch } = require('../context');
  const rows = branches.allBranches().map((b) => ({ id: b.id, name: b.name, slug: b.slug, status: b.status, ...runInBranch(b.id, () => branchStats(from, to, today)) }));
  const keys = ['sales', 'revenue', 'gross', 'expenses', 'net_profit', 'cash_in', 'today', 'today_n', 'debt', 'debtors', 'stock_value', 'stock_pieces', 'stock_boxes', 'low_stock', 'out_of_stock', 'open_shifts', 'new_orders'];
  const total = Object.fromEntries(keys.map((k) => [k, rows.reduce((a, r) => a + (r[k] || 0), 0)]));
  const topMap = new Map();
  for (const r of rows) {
    for (const tp of (r.top_products || [])) {
      const k = tp.name;
      if (!topMap.has(k)) topMap.set(k, { name: tp.name, sku: tp.sku, qty: 0, revenue: 0 });
      const cur = topMap.get(k);
      cur.qty += tp.qty;
      cur.revenue += tp.revenue;
    }
  }
  const top_products = Array.from(topMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const transit = main.prepare("SELECT COUNT(*) n, COALESCE(SUM(total_cost),0) v FROM transfers WHERE status='sent'").get();
  res.json({ rows, total, top_products, transit: { n: transit.n, value: Math.round(transit.v) } });
});

// ---- Barcha filiallar bo'yicha yagona sotuvlar ro'yxati (Barcha do'konlar sotuvlari bir joyda) ----
router.get('/sales', (req, res) => {
  const { runInBranch } = require('../context');
  const branchId = int(req.query.branch_id);
  const q = str(req.query.q).toLowerCase().trim();
  const from = req.query.from ? str(req.query.from) + ' 00:00:00' : null;
  const to = req.query.to ? str(req.query.to) + ' 23:59:59' : null;
  const limit = Math.min(1000, Math.max(10, int(req.query.limit, 100)));

  const allB = branches.allBranches().filter((b) => !branchId || b.id === branchId);
  const allSales = [];

  for (const b of allB) {
    if (b.status !== 'active' && branchId !== b.id) continue;
    runInBranch(b.id, () => {
      const db = require('../db');
      let sql = `SELECT s.id, s.number, s.date, s.total, s.paid_amount, s.discount, s.status, s.note,
                        c.company_name, c.contact_name, c.phone,
                        u.full_name creator_name, u.username creator_username
                 FROM sales s
                 LEFT JOIN clients c ON c.id=s.client_id
                 LEFT JOIN users u ON u.id=s.created_by
                 WHERE s.deleted_at IS NULL AND s.status='confirmed' AND s.kind='sale'`;
      const params = [];
      if (from) { sql += ` AND s.date >= ?`; params.push(from); }
      if (to) { sql += ` AND s.date <= ?`; params.push(to); }
      sql += ` ORDER BY s.date DESC LIMIT ?`;
      params.push(limit);

      const rows = db.prepare(sql).all(...params);
      for (const r of rows) {
        const items = db.prepare(`SELECT i.name, i.qty, i.unit, i.color, i.price, i.total, p.sku
                                  FROM sale_items i
                                  LEFT JOIN products p ON p.id=i.product_id
                                  WHERE i.sale_id=?`).all(r.id);
        const payments = db.prepare(`SELECT p.method, a.amount FROM allocations a
                                     JOIN payments p ON p.id=a.payment_id
                                     WHERE a.sale_id=?`).all(r.id);
        allSales.push({
          ...r,
          branch_id: b.id,
          branch_code: (b.doc_prefix || b.slug || `B${b.id}`).toUpperCase(),
          branch_name: b.name,
          items_count: items.reduce((sum, it) => sum + it.qty, 0),
          items: items,
          methods: payments.map((p) => p.method),
        });
      }
    });
  }

  allSales.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  let filtered = allSales;
  if (q) {
    filtered = allSales.filter((s) =>
      (s.number && s.number.toLowerCase().includes(q)) ||
      (s.branch_name && s.branch_name.toLowerCase().includes(q)) ||
      (s.company_name && s.company_name.toLowerCase().includes(q)) ||
      (s.contact_name && s.contact_name.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.creator_name && s.creator_name.toLowerCase().includes(q)) ||
      (s.items && s.items.some((i) => (i.name && i.name.toLowerCase().includes(q)) || (i.sku && i.sku.toLowerCase().includes(q)) || (i.color && i.color.toLowerCase().includes(q))))
    );
  }

  const resultRows = filtered.slice(0, limit);
  res.json({
    rows: resultRows,
    total_count: filtered.length,
    total_revenue: filtered.reduce((sum, s) => sum + s.total, 0),
    branches: branches.allBranches().map((b) => ({ id: b.id, name: b.name, status: b.status }))
  });
});

// ---- Barcha filiallar / skladlar bo'yicha umumiy ombor qoldig'i (Umumiy sklad) ----
router.get('/stock', (req, res) => {
  const { runInBranch } = require('../context');
  const branchId = int(req.query.branch_id);
  const q = str(req.query.q).toLowerCase().trim();
  const lowOnly = req.query.low === '1';

  const allB = branches.allBranches().filter((b) => b.status === 'active');
  const productsMap = new Map();

  for (const b of allB) {
    runInBranch(b.id, () => {
      const db = require('../db');
      const colors = require('../colors').colorMap();
      const rows = db.prepare(`SELECT p.id, p.name, p.brand, p.category, p.volume, p.size, p.sku, p.barcode,
                                      p.piece_price, p.box_price, p.box_qty, p.cost_price, p.image,
                                      p.min_stock, p.stock_pieces, p.active
                               FROM products p
                               WHERE p.deleted_at IS NULL AND p.active=1`).all();
      for (const r of rows) {
        const key = (r.sku || r.barcode || r.name).toLowerCase().trim();
        if (!productsMap.has(key)) {
          productsMap.set(key, {
            sku: r.sku,
            barcode: r.barcode,
            name: r.name,
            brand: r.brand,
            category: r.category,
            volume: r.volume,
            size: r.size,
            colors: colors.get(r.id) || [],
            piece_price: r.piece_price,
            cost_price: r.cost_price,
            box_qty: r.box_qty,
            image: r.image,
            min_stock: r.min_stock,
            stocks: {},
            total_stock: 0,
          });
        }
        const prod = productsMap.get(key);
        const st = r.stock_pieces || 0;
        prod.stocks[b.id] = st;
        prod.total_stock += st;
        if (!prod.image && r.image) prod.image = r.image;
        if ((!prod.colors || !prod.colors.length) && colors.has(r.id)) prod.colors = colors.get(r.id);
      }
    });
  }

  let list = Array.from(productsMap.values());

  if (branchId) {
    list = list.filter((p) => (p.stocks[branchId] !== undefined));
  }

  if (lowOnly) {
    list = list.filter((p) => p.total_stock <= (p.min_stock || 0) || p.total_stock === 0);
  }

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = `${p.sku || ''} ${p.name || ''} ${p.brand || ''} ${p.barcode || ''} ${(p.colors || []).join(' ')}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  list.sort((a, b) => ((a.sku || a.name) > (b.sku || b.name) ? 1 : -1));

  res.json({
    rows: list,
    branches: allB.map((b) => ({ id: b.id, name: b.name })),
    total_products: list.length,
    total_pieces: list.reduce((sum, p) => sum + p.total_stock, 0)
  });
});

// Barcha filiallar orasidagi ko'chirishlar
router.get('/transfers', (_req, res) => {
  res.json(main.prepare(`SELECT t.*, (SELECT COUNT(*) FROM transfer_items i WHERE i.transfer_id=t.id) items_n FROM transfers t ORDER BY t.id DESC LIMIT 500`).all());
});

router.get('/transfers/:id', (req, res) => {
  const t = main.prepare(`SELECT * FROM transfers WHERE id=?`).get(int(req.params.id));
  if (!t) throw httpError(404, 'Topilmadi');
  const items = main.prepare(`SELECT * FROM transfer_items WHERE transfer_id=?`).all(t.id);
  res.json({ ...t, items });
});

// ---- Katalogni tarqatish: bitta filial mahsulotlari boshqa filiallarga (shtrix-kod → artikul → nom bo'yicha moslanadi) ----
//   mode: 'missing' — faqat yo'qlari qo'shiladi (qoldiqsiz); 'prices' — bor mahsulotlarning narxi ham manbadagidek bo'ladi
router.post('/catalog/copy', (req, res) => {
  const { runInBranch } = require('../context');
  const db = require('../db');
  const src = branches.getBranch(int(req.body.from_branch));
  if (!src) throw httpError(400, 'Manba filialni tanlang');
  const targets = (Array.isArray(req.body.to_branches) ? req.body.to_branches : []).map(int).filter((id) => id !== src.id).map(branches.getBranch).filter(Boolean);
  if (!targets.length) throw httpError(400, 'Qaysi filiallarga tarqatishni tanlang');
  const mode = req.body.mode === 'prices' ? 'prices' : 'missing';
  const F = ['name', 'brand', 'category', 'volume', 'size', 'sku', 'barcode', 'unit', 'pack_name', 'box_qty', 'piece_price', 'box_price', 'description', 'in_shop', 'image'];
  const list = runInBranch(src.id, () => db.prepare(`SELECT ${F.join(',')} FROM products WHERE deleted_at IS NULL AND active=1`).all());
  const fsx = require('fs'); const pathx = require('path'); const branchDb = require('../branch_db');
  const out = [];
  for (const b of targets) {
    const r = runInBranch(b.id, () => {
      let added = 0, updated = 0;
      const t = now();
      db.transaction(() => {
        for (const p of list) {
          let ex = null;
          if (p.barcode) ex = db.prepare('SELECT id FROM products WHERE barcode=? AND deleted_at IS NULL').get(p.barcode);
          if (!ex && p.sku) ex = db.prepare("SELECT id FROM products WHERE sku=? AND sku<>'' AND deleted_at IS NULL").get(p.sku);
          if (!ex) ex = db.prepare('SELECT id FROM products WHERE lower(name)=lower(?) AND unit=? AND deleted_at IS NULL').get(p.name, p.unit);
          if (ex) {
            if (mode === 'prices') { db.prepare('UPDATE products SET piece_price=?, box_price=?, box_qty=?, updated_at=? WHERE id=?').run(p.piece_price, p.box_price, p.box_qty, t, ex.id); updated++; }
            continue;
          }
          let img = '';
          const m = /^\/uploads\/(\d+)\/([A-Za-z0-9._-]+)$/.exec(p.image || '');
          if (m && Number(m[1]) === src.id) {
            try { fsx.copyFileSync(pathx.join(branchDb.uploadsDir(src.id), m[2]), pathx.join(branchDb.uploadsDir(b.id), m[2])); img = `/uploads/${b.id}/${m[2]}`; } catch { /* rasmsiz */ }
          }
          db.prepare(`INSERT INTO products (${F.join(',')},created_at,updated_at) VALUES (${F.map(() => '?').join(',')},?,?)`).run(...F.map((k) => (k === 'image' ? img : p[k])), t, t);
          added++;
        }
      })();
      audit({ actorName: `Egasi: ${req.owner.full_name || req.owner.username}` }, { action: 'import', entity: 'product', summary: `Katalog "${src.name}" filialidan: +${added} ta yangi${updated ? `, ${updated} ta narx yangilandi` : ''}` });
      return { added, updated };
    });
    out.push({ branch_id: b.id, name: b.name, ...r });
  }
  res.json({ results: out });
});

router.post('/enter', (req, res) => {
  const b = branches.getBranch(int(req.body.branch_id));
  if (!b) throw httpError(404, 'Filial topilmadi');
  accounts.setSessionBranch(sidOf(req), b.id);
  res.json({ ok: true, branch: { id: b.id, name: b.name, slug: b.slug, status: b.status } });
});
router.post('/leave', (req, res) => {
  accounts.setSessionBranch(sidOf(req), null);
  res.json({ ok: true });
});

module.exports = { router, setup, needsSetup, SETUP_TOKEN };
