const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { uploadsDir, currentUploadsUrl } = require('../branch_db');
const { keepContext, runInBranch } = require('../context');
const branches = require('../branches');
const { now, str, int, num, normDate, normText, httpError, audit, getSetting, fmtMoney } = require('../util');
// So'm narxini yaxlitlash: sozlamadagi qoida bo'yicha (1, 100, 500, 1000 so'm)
const roundSum = (v) => {
  const step = Number(getSetting('currency_rounding', '100')) || 100;
  if (step <= 1) return Math.round(v);
  return Math.round(v / step) * step;
};
const { normUnit } = require('../units');
const { canonical, parseAudience, parseColors, colorsOf, colorMap, setColors, matchColor } = require('../colors');
const { optimizeImageBuffer } = require('../image_util');
const { syncProductAcrossBranches, syncStockDeltaAcrossBranches } = require('../shared_sync');

const router = express.Router();

// Faqat oddiy rasm turlari; kengaytma fayl nomidan emas, turidan olinadi (SVG/HTML yuklab bo'lmaydi)
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, uploadsDir(req.branch.id)),   // filialning o'z papkasi
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + IMAGE_EXT[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, !!IMAGE_EXT[file.mimetype]),
});

// Yuklangan fayl haqiqatan rasmmi (birinchi baytlar bo'yicha) — bo'lmasa o'chiriladi
const fs = require('fs');
function isRealImage(file) {
  try {
    const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
    return (b[0] === 0xff && b[1] === 0xd8) || b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      || b.slice(0, 4).toString() === 'GIF8' || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP');
  } catch { return false; }
}

const FIELDS = ['name', 'brand', 'category', 'size', 'audience', 'volume', 'sku', 'piece_price', 'box_price', 'box_qty', 'description', 'in_shop', 'active',
  'unit', 'pack_name', 'barcode', 'min_stock', 'usd_price', 'mxik'];

function readProduct(b) {
  const p = {
    name: str(b.name, 200), brand: canonical('brand', str(b.brand, 100)), category: canonical('category', str(b.category, 60)), size: str(b.size, 30), audience: parseAudience(b.audience), volume: str(b.volume, 50), sku: str(b.sku, 50),
    piece_price: Math.max(0, int(b.piece_price)), box_price: Math.max(0, int(b.box_price)),
    box_qty: Math.max(1, int(b.box_qty, 1)), description: str(b.description, 2000),
    unit: normUnit(b.unit), pack_name: str(b.pack_name, 30) || 'karobka', barcode: str(b.barcode, 64).replace(/\s/g, ''),
    min_stock: Math.max(0, num(b.min_stock)),
    usd_price: Math.max(0, Math.round(num(b.usd_price) * 100) / 100), mxik: str(b.mxik, 20).replace(/\D/g, ''),
    in_shop: b.in_shop === false || b.in_shop === 0 || b.in_shop === '0' || b.in_shop === 'false' ? 0 : 1,
    active: b.active === false || b.active === 0 || b.active === '0' || b.active === 'false' ? 0 : 1,
  };
  if (!p.name) throw httpError(400, 'Mahsulot nomini kiriting');
  if (!p.sku && b.code) p.sku = str(b.code, 50);
  if (!p.barcode && b.code) p.barcode = str(b.code, 64).replace(/\s/g, '');
  if (p.barcode && !/^[0-9A-Za-z\-.]{3,64}$/.test(p.barcode)) throw httpError(400, "Shtrix-kod noto'g'ri");
  // Optom narx donaga: karobka narxi = dona narxi × karobkadagi dona (faqat karobka narxi berilsa — dona narxi undan)
  // (admin panel formasi karobka narxini o'zi hisoblab yuboradi; API'da berilmasa — shu yerda)
  // Dollar narxi berilgan bo'lsa — so'm narxi joriy kurs bo'yicha
  const rate = Number(getSetting('usd_rate', '0')) || 0;
  if (p.usd_price > 0 && rate > 0) { p.piece_price = roundSum(p.usd_price * rate); p.box_price = p.piece_price * p.box_qty; }
  if (!p.box_price && p.piece_price) p.box_price = p.piece_price * p.box_qty;
  else if (p.box_price && !p.piece_price) p.piece_price = Math.round(p.box_price / p.box_qty);
  return p;
}

function checkBarcode(code, exceptId = 0) {
  if (!code) return;
  const ex = db.prepare('SELECT name FROM products WHERE barcode=? AND id<>? AND deleted_at IS NULL').get(code, exceptId);
  if (ex) throw httpError(400, `Bu shtrix-kod boshqa mahsulotda bor: ${ex.name}`);
}

// Narx turlari bo'yicha narxlar: { levelId: dona narxi } (0 / bo'sh — asosiy narx ishlatiladi); qadoq narxi = dona × qadoqdagi soni
function savePrices(id, raw, boxQty) {
  if (raw === undefined) return false;
  let m = raw;
  if (typeof m === 'string') { try { m = JSON.parse(m || '{}'); } catch { m = {}; } }
  if (!m || typeof m !== 'object') m = {};
  const levels = new Set(db.prepare('SELECT id FROM price_levels WHERE deleted_at IS NULL').all().map((r) => r.id));
  const before = JSON.stringify(db.prepare('SELECT level_id, piece_price FROM product_prices WHERE product_id=? ORDER BY level_id').all(id));
  db.prepare('DELETE FROM product_prices WHERE product_id=?').run(id);
  const ins = db.prepare('INSERT INTO product_prices (product_id,level_id,piece_price,box_price) VALUES (?,?,?,?)');
  for (const [k, v] of Object.entries(m)) {
    const lvl = int(k), price = Math.max(0, int(v));
    if (levels.has(lvl) && price > 0) ins.run(id, lvl, price, price * boxQty);
  }
  return before !== JSON.stringify(db.prepare('SELECT level_id, piece_price FROM product_prices WHERE product_id=? ORDER BY level_id').all(id));
}
function pricesMap() {
  const m = new Map();
  for (const r of db.prepare('SELECT pp.product_id, pp.level_id, pp.piece_price, pp.box_price FROM product_prices pp JOIN price_levels l ON l.id=pp.level_id WHERE l.deleted_at IS NULL').all()) {
    if (!m.has(r.product_id)) m.set(r.product_id, {});
    m.get(r.product_id)[r.level_id] = [r.piece_price, r.box_price];
  }
  return m;
}

// Har mahsulotning o'rtacha bahosi va ko'rinadigan sharhlar soni
function ratingMap() {
  const m = new Map();
  for (const r of db.prepare(`SELECT product_id, ROUND(AVG(rating), 1) rating, COUNT(*) reviews FROM product_reviews
    WHERE deleted_at IS NULL AND hidden=0 GROUP BY product_id`).all()) m.set(r.product_id, { rating: r.rating, reviews: r.reviews });
  return m;
}

// showCost: tannarx faqat "products.cost" ruxsati borlarga
function listProducts({ q = '', includeInactive = true, showCost = false } = {}) {
  const rating = ratingMap();
  const colors = colorMap();
  const prices = pricesMap();
  let rows = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all()
    .map(({ stock_pieces, cost_price, ...p }) => ({
      ...p, colors: colors.get(p.id) || [], stock: stock_pieces || 0, prices: prices.get(p.id) || {},
      ...(showCost ? { cost_price } : {}), ...(rating.get(p.id) || { rating: 0, reviews: 0 }),
    }));
  if (!includeInactive) rows = rows.filter((p) => p.active);
  const qn = normText(q);
  if (qn) {
    const tokens = qn.split(' ');
    rows = rows.filter((p) => {
      const hay = normText(`${p.name} ${p.brand} ${p.category} ${p.volume} ${p.size} ${p.colors.join(' ')} ${p.sku} ${p.barcode}`);
      return tokens.every((t) => hay.includes(t));
    });
  }
  return rows;
}

router.get('/', (req, res) => {
  let rows = listProducts({ q: str(req.query.q), includeInactive: req.query.active !== '1', showCost: can(req, 'products.cost') });
  if (req.query.category) rows = rows.filter((p) => p.category === req.query.category);
  if (req.query.brand) rows = rows.filter((p) => p.brand === req.query.brand);
  if (req.query.limit) {
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    if (req.query.paginate === '1') {
      return res.json({ rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    }
    return res.json(rows.slice(offset, offset + limit));
  }
  res.json(rows);
});

// Mavjud kategoriyalar (forma uchun tavsiyalar)
router.get('/categories', (req, res) => {
  const rows = db.prepare("SELECT category, COUNT(*) n FROM products WHERE deleted_at IS NULL AND category<>'' GROUP BY category ORDER BY n DESC, category").all();
  res.json(req.query.full ? rows.map((r) => ({ name: r.category, n: r.n })) : rows.map((r) => r.category));
});

// Faqat qoldiqlar: { v, s: [[id, dona], ...] } — POS sotuvdan keyin butun ro'yxatni (megabaytlab) qayta yuklamasligi uchun.
// v — mahsulotlar "versiyasi" (soni + oxirgi o'zgarish): boshqa kompyuterda mahsulot qo'shilsa / o'zgarsa, POS buni bilib ro'yxatni yangilaydi.
router.get('/stock', (_req, res) => {
  const v = db.prepare('SELECT COUNT(*) n, MAX(updated_at) u, MAX(id) m FROM products WHERE deleted_at IS NULL').get();
  res.json({ v: `${v.n}:${v.u}:${v.m}`, s: db.prepare('SELECT id, stock_pieces FROM products WHERE deleted_at IS NULL').raw().all() });
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  p.stock = p.stock_pieces || 0;
  delete p.stock_pieces;
  if (!can(req, 'products.cost')) delete p.cost_price;
  p.prices = pricesMap().get(p.id) || {};
  Object.assign(p, ratingMap().get(p.id) || { rating: 0, reviews: 0 });
  p.colors = colorsOf(p.id);
  // Rang bo'yicha: kirim (rang ko'rsatilgan harakatlar) va sotilgan dona
  if (p.colors.length) {
    const inn = new Map(db.prepare(`SELECT color, SUM(qty_pieces) v FROM stock_moves WHERE product_id=? AND deleted_at IS NULL GROUP BY color`).all(p.id).map((r) => [r.color, r.v]));
    const sold = new Map(db.prepare(`SELECT i.color, SUM(i.qty * CASE WHEN i.unit='karobka' THEN i.box_qty ELSE 1 END) v, SUM(i.total) sum
      FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=? AND s.status='confirmed' AND s.deleted_at IS NULL GROUP BY i.color`).all(p.id).map((r) => [r.color, r]));
    p.color_stats = [...p.colors, ''].map((c) => ({
      color: c, in: inn.get(c) || 0, sold: sold.has(c) ? sold.get(c).v : 0, sold_sum: sold.has(c) ? sold.get(c).sum : 0,
    })).filter((r) => r.color || r.in || r.sold);
  }
  p.moves = db.prepare(`SELECT m.*${can(req, 'products.cost') ? '' : ', NULL cost'}, u.full_name user_name FROM stock_moves m LEFT JOIN users u ON u.id=m.created_by
    WHERE m.product_id=? AND m.deleted_at IS NULL ORDER BY m.date DESC, m.id DESC LIMIT 200`).all(p.id);
  p.sales = db.prepare(`SELECT s.id, s.number, s.date, c.company_name, c.contact_name, i.color, i.unit, i.qty, i.box_qty, i.price, i.total
    FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN clients c ON c.id=s.client_id
    WHERE i.product_id=? AND s.status='confirmed' AND s.deleted_at IS NULL ORDER BY s.date DESC LIMIT 200`).all(p.id);
  res.json(p);
});

// Barcha do'konlar (filiallar) bo'yicha mahsulot ombor qoldig'i (ostatka)
router.get('/:id/branches-stock', (req, res) => {
  const pid = int(req.params.id);
  const p = db.prepare('SELECT sku, barcode, name FROM products WHERE id=?').get(pid);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  const allB = branches.allBranches().filter((b) => b.status === 'active');
  const list = [];
  for (const b of allB) {
    const st = runInBranch(b.id, () => {
      let match = null;
      if (p.sku) match = db.prepare('SELECT stock_pieces FROM products WHERE sku=? AND deleted_at IS NULL').get(p.sku);
      if (!match && p.barcode) match = db.prepare('SELECT stock_pieces FROM products WHERE barcode=? AND deleted_at IS NULL').get(p.barcode);
      if (!match && p.name) match = db.prepare('SELECT stock_pieces FROM products WHERE name=? AND deleted_at IS NULL').get(p.name);
      return match ? (match.stock_pieces || 0) : 0;
    });
    list.push({ branch_id: b.id, branch_name: b.name, is_current: b.id === (req.branch ? req.branch.id : 0), stock: st });
  }
  res.json(list);
});

async function saveImage(req, id) {
  if (req.file) {
    if (!isRealImage(req.file.path)) {
      fs.rmSync(req.file.path, { force: true });
      req.file = null;
    } else {
      try {
        const rawBuf = fs.readFileSync(req.file.path);
        // Agar rasm brauzerda allaqachon siqilgan bo'lsa (<= 400 KB) —
        // 1 vCPU da og'ir Sharp resampler'ni chetlab o'tib, zudlik bilan saqlaymiz (0ms CPU)
        if (rawBuf.length <= 400 * 1024) {
          db.prepare('UPDATE products SET image=? WHERE id=?').run(currentUploadsUrl() + req.file.filename, id);
          return;
        }
        const opt = await optimizeImageBuffer(rawBuf);
        if (opt && opt.buffer) {
          const oldPath = req.file.path;
          const ext = path.extname(oldPath);
          const targetExt = '.' + opt.ext;
          let finalFilename = req.file.filename;
          let finalPath = oldPath;

          if (ext.toLowerCase() !== targetExt) {
            finalFilename = path.basename(oldPath, ext) + targetExt;
            finalPath = path.join(path.dirname(oldPath), finalFilename);
            fs.rmSync(oldPath, { force: true });
          }
          fs.writeFileSync(finalPath, opt.buffer);
          req.file.filename = finalFilename;
          req.file.path = finalPath;
        }
      } catch {}
      db.prepare('UPDATE products SET image=? WHERE id=?').run(currentUploadsUrl() + req.file.filename, id);
    }
  } else if (req.body.remove_image === '1') {
    db.prepare("UPDATE products SET image='' WHERE id=?").run(id);
  }
}

router.post('/', need('products.edit'), keepContext(upload.single('image')), async (req, res) => {
  const p = readProduct(req.body);
  checkBarcode(p.barcode);
  const t = now();
  const cost = can(req, 'products.cost') ? Math.max(0, num(req.body.cost_price)) : 0;
  const r = db.prepare(`INSERT INTO products (${FIELDS.join(',')},cost_price,created_at,updated_at) VALUES (${FIELDS.map(() => '?').join(',')},?,?,?)`)
    .run(...FIELDS.map((f) => p[f]), cost, t, t);
  const id = r.lastInsertRowid;
  await saveImage(req, id);
  setColors(id, parseColors(req.body.colors));
  savePrices(id, req.body.prices, p.box_qty);
  const initial = num(req.body.initial_stock !== undefined && req.body.initial_stock !== '' ? req.body.initial_stock : req.body.stock);
  if (initial) {
    db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, initial, t, "Boshlang'ich qoldiq", cost || null, req.user ? req.user.id : null, t);
  }
  audit(req, { action: 'create', entity: 'product', entity_id: id, summary: `Yangi mahsulot: ${p.name}`, after: p });
  const saved = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (saved && req.branch) syncProductAcrossBranches(req.branch.id, saved, { syncStock: true });
  res.json({ id });
});

router.put('/:id', need('products.edit'), keepContext(upload.single('image')), async (req, res) => {
  const old = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!old) throw httpError(404, 'Mahsulot topilmadi');
  const p = readProduct(req.body);
  checkBarcode(p.barcode, old.id);
  const changedExtra = [];
  db.prepare(`UPDATE products SET ${FIELDS.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`)
    .run(...FIELDS.map((f) => p[f]), now(), old.id);
  // Tannarx qo'lda (ruxsat bo'lsa; maydon yuborilmasa — o'zgarmaydi)
  if (can(req, 'products.cost') && req.body.cost_price !== undefined && req.body.cost_price !== '') {
    const cost = Math.max(0, num(req.body.cost_price));
    if (cost !== old.cost_price) { db.prepare('UPDATE products SET cost_price=? WHERE id=?').run(cost, old.id); changedExtra.push('tannarx'); }
  }
  if (req.body.set_stock !== undefined && req.body.set_stock !== '') {
    const targetStock = Math.round(num(req.body.set_stock) * 1000) / 1000;
    const cur = db.prepare('SELECT stock_pieces FROM products WHERE id=?').get(old.id);
    const curStock = (cur && cur.stock_pieces) || 0;
    const diff = Math.round((targetStock - curStock) * 1000) / 1000;
    if (Math.abs(diff) > 0.0001) {
      db.prepare('INSERT INTO stock_moves (product_id, qty_pieces, date, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(old.id, diff, now(), "Qoldiq to'g'rilandi (astatka)", req.user ? req.user.id : null, now());
      changedExtra.push('qoldiq');
    }
  }
  if (savePrices(old.id, req.body.prices, p.box_qty)) changedExtra.push('narx turlari');
  await saveImage(req, old.id);
  if (req.body.colors !== undefined) {
    const before = colorsOf(old.id).join(', ');
    setColors(old.id, parseColors(req.body.colors));
    if (before !== colorsOf(old.id).join(', ')) changedExtra.push('ranglar');
  }
  const changed = [...FIELDS.filter((f) => String(old[f]) !== String(p[f])), ...changedExtra];
  audit(req, {
    action: 'update', entity: 'product', entity_id: old.id, summary: `Mahsulot tahrirlandi: ${p.name} (${changed.join(', ') || 'rasm'})`,
    before: Object.fromEntries(changed.map((f) => [f, old[f]])), after: Object.fromEntries(changed.map((f) => [f, p[f]])),
  });
  const updatedP = db.prepare('SELECT * FROM products WHERE id=?').get(old.id);
  if (updatedP && req.branch) syncProductAcrossBranches(req.branch.id, updatedP, { syncStock: true });
  res.json({ ok: true });
});

router.post('/:id/colors', need('products.edit'), (req, res) => {
  const p = db.prepare('SELECT id, name FROM products WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  const before = colorsOf(p.id).join(', ');
  const colors = parseColors(req.body.colors);
  setColors(p.id, colors);
  const after = colorsOf(p.id).join(', ');
  if (before !== after) {
    db.prepare('UPDATE products SET updated_at=? WHERE id=?').run(now(), p.id);
    audit(req, {
      action: 'update',
      entity: 'product',
      entity_id: p.id,
      summary: `Mahsulot assortimenti yangilandi: ${p.name} (${after || "bo'shatildi"})`,
      before: { colors: before },
      after: { colors: after },
    });
    const updatedP = db.prepare('SELECT * FROM products WHERE id=?').get(p.id);
    if (updatedP && req.branch) syncProductAcrossBranches(req.branch.id, updatedP, { syncStock: true });
  }
  res.json({ ok: true, colors });
});

router.post('/bulk-delete', need('products.delete'), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) throw httpError(400, 'Mahsulotlar tanlanmagan');
  const ph = ids.map(() => '?').join(',');
  const prods = db.prepare(`SELECT * FROM products WHERE id IN (${ph}) AND deleted_at IS NULL`).all(...ids);
  if (!prods.length) return res.json({ ok: true, count: 0 });
  const t = now();
  db.transaction(() => {
    for (const p of prods) {
      db.prepare('UPDATE products SET deleted_at=? WHERE id=?').run(t, p.id);
      audit(req, { action: 'delete', entity: 'product', entity_id: p.id, summary: `Mahsulot o'chirildi: ${p.name}`, before: p });
      if (req.branch) syncProductAcrossBranches(req.branch.id, p, { isDelete: true });
    }
  })();
  res.json({ ok: true, count: prods.length });
});

router.post('/bulk-restore', need('products.delete'), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) throw httpError(400, 'Mahsulotlar tanlanmagan');
  const ph = ids.map(() => '?').join(',');
  const prods = db.prepare(`SELECT * FROM products WHERE id IN (${ph}) AND deleted_at IS NOT NULL`).all(...ids);
  if (!prods.length) return res.json({ ok: true, count: 0 });
  db.transaction(() => {
    for (const p of prods) {
      db.prepare('UPDATE products SET deleted_at=NULL WHERE id=?').run(p.id);
      audit(req, { action: 'restore', entity: 'product', entity_id: p.id, summary: `Mahsulot tiklandi: ${p.name}` });
      if (req.branch) syncProductAcrossBranches(req.branch.id, p, { isDelete: false });
    }
  })();
  res.json({ ok: true, count: prods.length });
});

router.delete('/:id', need('products.delete'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  db.prepare('UPDATE products SET deleted_at=? WHERE id=?').run(now(), p.id);
  audit(req, { action: 'delete', entity: 'product', entity_id: p.id, summary: `Mahsulot o'chirildi: ${p.name}`, before: p });
  if (req.branch) syncProductAcrossBranches(req.branch.id, p, { isDelete: true });
  res.json({ ok: true });
});

router.post('/:id/restore', need('products.delete'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE products SET deleted_at=NULL WHERE id=?').run(p.id);
  audit(req, { action: 'restore', entity: 'product', entity_id: p.id, summary: `Mahsulot tiklandi: ${p.name}` });
  if (req.branch) syncProductAcrossBranches(req.branch.id, p, { isDelete: false });
  res.json({ ok: true });
});

// Dollar kursi o'zgardi: narxi dollarda bo'lgan barcha mahsulotlarning so'm narxi va tannarxi qayta hisoblanadi
router.post('/reprice-usd', need('products.edit'), (req, res) => {
  const rate = Math.round(num(req.body.rate) * 100) / 100;
  if (!(rate > 0)) throw httpError(400, 'Kursni kiriting');
  const set = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  let n = 0;
  db.transaction(() => {
    set.run('usd_rate', String(rate));
    const up = db.prepare('UPDATE products SET piece_price=?, box_price=?, updated_at=? WHERE id=?');
    const upCost = db.prepare('UPDATE products SET cost_price=?, updated_at=? WHERE id=?');
    const t = now();
    for (const p of db.prepare('SELECT id, usd_price, box_qty, cost_usd FROM products WHERE (usd_price>0 OR cost_usd>0) AND deleted_at IS NULL').all()) {
      if (p.usd_price > 0) {
        const pr = roundSum(p.usd_price * rate);
        up.run(pr, pr * p.box_qty, t, p.id);
      }
      if (p.cost_usd > 0) {
        upCost.run(Math.round(p.cost_usd * rate), t, p.id);
      }
      n++;
    }
  })();
  audit(req, { action: 'update', entity: 'product', summary: `Dollar kursi: ${rate} so'm — ${n} ta mahsulot narxi/tannarxi qayta hisoblandi` });
  // Yagona ombor: boshqa barcha faol filiallarga ham kurs va narxlar tarqatiladi
  if (req.branch) {
    try {
      const { isSharedEnabled } = require('../shared_sync');
      if (isSharedEnabled()) {
        const { openBranch } = require('../branch_db');
        const others = branches.allBranches().filter((b) => b.status === 'active' && b.id !== req.branch.id);
        for (const b of others) {
          runInBranch(b.id, () => {
            const bdb = openBranch(b.id);
            bdb.transaction(() => {
              bdb.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('usd_rate', String(rate));
              const bUp = bdb.prepare('UPDATE products SET piece_price=?, box_price=?, updated_at=? WHERE id=?');
              const bUpCost = bdb.prepare('UPDATE products SET cost_price=?, updated_at=? WHERE id=?');
              const bt = now();
              for (const p of bdb.prepare('SELECT id, usd_price, box_qty, cost_usd FROM products WHERE (usd_price>0 OR cost_usd>0) AND deleted_at IS NULL').all()) {
                if (p.usd_price > 0) {
                  const pr = roundSum(p.usd_price * rate);
                  bUp.run(pr, pr * p.box_qty, bt, p.id);
                }
                if (p.cost_usd > 0) {
                  bUpCost.run(Math.round(p.cost_usd * rate), bt, p.id);
                }
              }
            })();
          });
        }
      }
    } catch (e) {
      console.warn('[reprice-usd] boshqa filiallarga kurs tarqatishda xato:', e.message);
    }
  }
  res.json({ ok: true, updated: n, rate });
});

// Faqat shtrix-kod berish (etiketka sahifasidan: kodi yo'q mahsulotlarga ichki kod)
router.post('/:id/barcode', need('products.edit'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  const code = str(req.body.barcode, 64).replace(/\s/g, '');
  if (!/^[0-9A-Za-z\-.]{3,64}$/.test(code)) throw httpError(400, "Shtrix-kod noto'g'ri");
  checkBarcode(code, p.id);
  db.prepare('UPDATE products SET barcode=?, updated_at=? WHERE id=?').run(code, now(), p.id);
  audit(req, { action: 'update', entity: 'product', entity_id: p.id, summary: `${p.name}: shtrix-kod ${code}` });
  res.json({ ok: true });
});

// O'rtacha tortilgan tannarx: (qoldiq × eski tannarx + kirim × kirim narxi) / (qoldiq + kirim)
function updateCost(p, qty, cost, costUsd = 0) {
  const cur = db.prepare('SELECT stock_pieces, cost_price, cost_usd FROM products WHERE id=?').get(p.id);
  if (!cur) return;
  const have = Math.max(0, cur.stock_pieces || 0);
  const next = have > 0 && cur.cost_price > 0 ? (have * cur.cost_price + qty * cost) / (have + qty) : cost;
  let nextUsd = cur.cost_usd || 0;
  if (costUsd > 0) {
    nextUsd = have > 0 && cur.cost_usd > 0 ? (have * cur.cost_usd + qty * costUsd) / (have + qty) : costUsd;
  }
  db.prepare('UPDATE products SET cost_price=?, cost_usd=? WHERE id=?').run(
    Math.round(next * 100) / 100,
    Math.round(nextUsd * 1000) / 1000,
    p.id
  );
}
// Kirim bekor qilinsa (ombor harakati hali o'chirilmagan paytda chaqiriladi): o'rtacha tannarxdan shu kirim ulushi chiqariladi.
// Qoldiq yetmasa yoki natija mantiqsiz bo'lsa — tannarx o'zgarmaydi (keyingi kirim to'g'rilaydi).
function revertCost(productId, qty, cost) {
  if (!(qty > 0) || !(cost > 0)) return;
  const cur = db.prepare('SELECT stock_pieces, cost_price FROM products WHERE id=?').get(productId);
  if (!cur || !(cur.cost_price > 0)) return;
  const left = (cur.stock_pieces || 0) - qty;
  if (!(left > 0)) return;
  const prev = ((cur.stock_pieces || 0) * cur.cost_price - qty * cost) / left;
  if (prev > 0) db.prepare('UPDATE products SET cost_price=? WHERE id=?').run(Math.round(prev * 100) / 100, productId);
}

// --- Ombor harakati: kirim (+) yoki hisobdan chiqarish (-) ---
router.post('/:id/stock', need('products.stock'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  const unit = req.body.unit === 'karobka' ? 'karobka' : 'dona';
  const qty = Math.round(num(req.body.qty) * 1000) / 1000;
  if (!qty) throw httpError(400, 'Miqdorni kiriting');
  const pieces = unit === 'karobka' ? qty * p.box_qty : qty;
  const color = matchColor(p.id, req.body.color);
  if (color === null) throw httpError(400, "Bunday rang yo'q");
  // Kirim narxi (asosiy birlik uchun): tannarx o'rtacha tortilgan usulda yangilanadi
  let cost = null;
  if (pieces > 0 && can(req, 'products.cost') && num(req.body.cost) > 0) {
    cost = unit === 'karobka' ? num(req.body.cost) / p.box_qty : num(req.body.cost);
  }
  const r = db.transaction(() => {
    if (cost !== null) updateCost(p, pieces, cost);
    return db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,color,date,note,cost,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(p.id, pieces, color, normDate(req.body.date), str(req.body.note, 500), cost, req.user.id, now());
  })();
  audit(req, { action: 'create', entity: 'stock', entity_id: r.lastInsertRowid, summary: `${p.name}${color ? ' (' + color + ')' : ''}: ombor ${pieces > 0 ? '+' : ''}${pieces} ${p.unit}${cost !== null ? `, narxi ${Math.round(cost)}` : ''}` });
  if (req.branch) {
    syncStockDeltaAcrossBranches(req.branch.id, [{
      product_id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      deltaPieces: pieces,
      note: str(req.body.note, 500) || "Ombor harakati",
    }]);
  }
  res.json({ id: r.lastInsertRowid });
});

// Muddati o'tgan partiyani hisobdan chiqarish: FIFO qoldig'i manfiy ombor harakati bilan chiqariladi
router.post('/expiry/:moveId/writeoff', need('products.stock'), (req, res) => {
  const b = require('../batches').leftOf(int(req.params.moveId));
  if (!b || !b.move.expires_at) throw httpError(404, 'Partiya topilmadi');
  if (!(b.qty > 0)) throw httpError(400, 'Bu partiyadan omborda qoldiq yo\'q');
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(b.move.product_id);
  const r = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,color,date,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(p.id, -b.qty, b.move.color || '', now(), `Muddati o'tgan (${b.move.expires_at}): hisobdan chiqarildi`, req.user.id, now());
  audit(req, { action: 'create', entity: 'stock', entity_id: r.lastInsertRowid, summary: `${p.name}: muddati o'tgan ${b.qty} ${p.unit} hisobdan chiqarildi (${b.move.expires_at}), ${fmtMoney(Math.round(b.qty * (p.cost_price || 0)))}` });
  res.json({ id: r.lastInsertRowid, qty: b.qty });
});

router.delete('/stock/:moveId', need('products.stock'), (req, res) => {
  const m = db.prepare('SELECT m.*, p.name FROM stock_moves m JOIN products p ON p.id=m.product_id WHERE m.id=? AND m.deleted_at IS NULL').get(req.params.moveId);
  if (!m) throw httpError(404, 'Topilmadi');
  db.transaction(() => {
    if (m.qty_pieces > 0 && m.cost > 0) revertCost(m.product_id, m.qty_pieces, m.cost);
    db.prepare('UPDATE stock_moves SET deleted_at=? WHERE id=?').run(now(), m.id);
  })();
  audit(req, { action: 'delete', entity: 'stock', entity_id: m.id, summary: `${m.name}: ombor harakati o'chirildi (${m.qty_pieces} dona)`, before: m });
  if (req.branch) {
    const prod = db.prepare('SELECT sku, barcode, unit FROM products WHERE id=?').get(m.product_id);
    syncStockDeltaAcrossBranches(req.branch.id, [{
      product_id: m.product_id,
      sku: prod && prod.sku,
      barcode: prod && prod.barcode,
      name: m.name,
      unit: prod && prod.unit,
      deltaPieces: -m.qty_pieces,
      note: "Ombor harakati o'chirildi",
    }]);
  }
  res.json({ ok: true });
});

router.post('/stock/:moveId/restore', need('products.stock'), (req, res) => {
  const m = db.prepare('SELECT m.*, p.name FROM stock_moves m JOIN products p ON p.id=m.product_id WHERE m.id=? AND m.deleted_at IS NOT NULL').get(req.params.moveId);
  if (!m) throw httpError(404, 'Topilmadi');
  db.transaction(() => {
    if (m.qty_pieces > 0 && m.cost > 0) updateCost({ id: m.product_id }, m.qty_pieces, m.cost);
    db.prepare('UPDATE stock_moves SET deleted_at=NULL WHERE id=?').run(m.id);
  })();
  audit(req, { action: 'restore', entity: 'stock', entity_id: m.id, summary: `${m.name}: ombor harakati tiklandi` });
  res.json({ ok: true });
});

module.exports = { router, listProducts, ratingMap, pricesMap, updateCost, revertCost };
