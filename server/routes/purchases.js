// Yetkazib beruvchilar, xarid (kirim hujjati) va yetkazib beruvchiga to'lovlar.
// Xarid tasdiqlanganda har bir pozitsiya omborga kirim bo'ladi (stock_moves.purchase_id) va mahsulot tannarxi
// o'rtacha tortilgan usulda yangilanadi. Yetkazib beruvchi balansi: xaridlar − to'lovlar (= bizning qarzimiz).
const express = require('express');
const db = require('../db');
const { now, str, int, num, digits, normPhone, normDate, httpError, audit, fmtMoney, nextNumber, registerFor } = require('../util');
const { need, can } = require('./auth');
const { updateCost, revertCost } = require('./products');
const { unitLabel } = require('../units');

const router = express.Router();
const METHODS = ['cash', 'transfer', 'card', 'other'];

// --- Yetkazib beruvchilar ---
const SUP_FIELDS = ['name', 'contact_name', 'phone', 'inn', 'address', 'note'];
function readSupplier(b) {
  const s = Object.fromEntries(SUP_FIELDS.map((f) => [f, str(b[f], 500)]));
  s.phone = normPhone(s.phone);
  s.inn = digits(s.inn);
  if (!s.name) throw httpError(400, 'Yetkazib beruvchi nomini kiriting');
  return s;
}
const BALANCE_SQL = `(SELECT COALESCE(SUM(total),0) FROM purchases p WHERE p.supplier_id=s.id AND p.status='confirmed' AND p.deleted_at IS NULL)
  - (SELECT COALESCE(SUM(amount),0) FROM supplier_payments sp WHERE sp.supplier_id=s.id AND sp.deleted_at IS NULL)`;

router.get('/suppliers', need('suppliers.view', 'purchases.create', 'suppliers.pay'), (_req, res) => {
  res.json(db.prepare(`SELECT s.*, ${BALANCE_SQL} debt,
      (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id=s.id AND p.status='confirmed' AND p.deleted_at IS NULL) purchases_n,
      (SELECT MAX(date) FROM purchases p WHERE p.supplier_id=s.id AND p.deleted_at IS NULL) last_date
    FROM suppliers s WHERE s.deleted_at IS NULL ORDER BY s.name COLLATE NOCASE`).all());
});

router.get('/suppliers/:id', need('suppliers.view'), (req, res) => {
  const s = db.prepare(`SELECT s.*, ${BALANCE_SQL} debt FROM suppliers s WHERE s.id=?`).get(req.params.id);
  if (!s) throw httpError(404, 'Topilmadi');
  s.purchases = db.prepare(`SELECT id, number, date, total, status, note FROM purchases WHERE supplier_id=? AND deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 500`).all(s.id);
  s.payments = db.prepare(`SELECT sp.*, COALESCE(NULLIF(u.full_name,''), u.username) user_name, p.number purchase_number FROM supplier_payments sp
    LEFT JOIN users u ON u.id=sp.created_by LEFT JOIN purchases p ON p.id=sp.purchase_id
    WHERE sp.supplier_id=? AND sp.deleted_at IS NULL ORDER BY sp.date DESC, sp.id DESC LIMIT 500`).all(s.id);
  res.json(s);
});

router.post('/suppliers', need('suppliers.edit'), (req, res) => {
  const s = readSupplier(req.body);
  const t = now();
  const id = Number(db.prepare(`INSERT INTO suppliers (${SUP_FIELDS.join(',')},created_at,updated_at) VALUES (${SUP_FIELDS.map(() => '?').join(',')},?,?)`)
    .run(...SUP_FIELDS.map((f) => s[f]), t, t).lastInsertRowid);
  audit(req, { action: 'create', entity: 'supplier', entity_id: id, summary: `Yetkazib beruvchi: ${s.name}` });
  res.json({ id });
});

router.put('/suppliers/:id', need('suppliers.edit'), (req, res) => {
  const old = db.prepare('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, 'Topilmadi');
  const s = readSupplier(req.body);
  db.prepare(`UPDATE suppliers SET ${SUP_FIELDS.map((f) => f + '=?').join(',')}, updated_at=? WHERE id=?`).run(...SUP_FIELDS.map((f) => s[f]), now(), old.id);
  audit(req, { action: 'update', entity: 'supplier', entity_id: old.id, summary: `Yetkazib beruvchi tahrirlandi: ${s.name}` });
  res.json({ ok: true });
});

router.delete('/suppliers/:id', need('suppliers.edit'), (req, res) => {
  const s = db.prepare(`SELECT s.*, ${BALANCE_SQL} debt FROM suppliers s WHERE s.id=? AND s.deleted_at IS NULL`).get(req.params.id);
  if (!s) throw httpError(404, 'Topilmadi');
  if (s.debt) throw httpError(400, `Hisob yopilmagan (${fmtMoney(s.debt)}) — avval hisob-kitobni yakunlang`);
  db.prepare('UPDATE suppliers SET deleted_at=? WHERE id=?').run(now(), s.id);
  audit(req, { action: 'delete', entity: 'supplier', entity_id: s.id, summary: `Yetkazib beruvchi o'chirildi: ${s.name}` });
  res.json({ ok: true });
});

// --- Xaridlar ---
router.get('/purchases', need('suppliers.view'), (req, res) => {
  const where = ['p.deleted_at IS NULL'];
  const args = [];
  if (req.query.supplier_id) { where.push('p.supplier_id=?'); args.push(int(req.query.supplier_id)); }
  if (req.query.from) { where.push('p.date>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('p.date<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  if (req.query.status) { where.push('p.status=?'); args.push(str(req.query.status)); }
  const rows = db.prepare(`SELECT p.*, s.name supplier_name, COALESCE(NULLIF(u.full_name,''), u.username) user_name,
      (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id=p.id) items_n
    FROM purchases p JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN users u ON u.id=p.created_by
    WHERE ${where.join(' AND ')} ORDER BY p.date DESC, p.id DESC LIMIT 1000`).all(...args);
  const sum = db.prepare(`SELECT COALESCE(SUM(total),0) total, COUNT(*) n FROM purchases p WHERE ${where.join(' AND ')} AND p.status='confirmed'`).get(...args);
  res.json({ rows, sum });
});

router.get('/purchases/:id', need('suppliers.view', 'purchases.create'), (req, res) => {
  const p = db.prepare(`SELECT p.*, s.name supplier_name, s.phone supplier_phone, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM purchases p JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN users u ON u.id=p.created_by WHERE p.id=?`).get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  p.items = db.prepare(`SELECT i.*, pr.unit unit_code, pr.pack_name, COALESCE(pr.image, '') image FROM purchase_items i LEFT JOIN products pr ON pr.id=i.product_id WHERE i.purchase_id=? ORDER BY i.id`).all(p.id);
  for (const i of p.items) i.base_unit = unitLabel(i.unit_code);
  p.payments = db.prepare('SELECT * FROM supplier_payments WHERE purchase_id=? AND deleted_at IS NULL ORDER BY date').all(p.id);
  p.paid = p.payments.reduce((a, x) => a + x.amount, 0);
  res.json(p);
});

function readPurchaseItems(items, currency = 'UZS', rate = 1) {
  if (!Array.isArray(items)) items = [];
  const out = [];
  for (const it of items) {
    const product = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(int(it.product_id));
    if (!product) throw httpError(400, "Mahsulot topilmadi — ro'yxatdan qayta tanlang");
    const unit = it.unit === 'karobka' && product.box_qty > 1 ? 'karobka' : 'dona';
    const qty = Math.round(num(it.qty) * 1000) / 1000;
    if (!(qty > 0)) continue;
    let price = Math.max(0, num(it.price));
    let priceUsd = Math.max(0, num(it.price_usd));
    if (currency === 'USD' && rate > 0) {
      if (priceUsd > 0 && !price) price = Math.round(priceUsd * rate);
      else if (price > 0 && !priceUsd) priceUsd = Math.round((price / rate) * 100) / 100;
    } else if (priceUsd > 0 && rate > 0 && !price) {
      price = Math.round(priceUsd * rate);
    }
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(String(it.expires_at || '')) ? it.expires_at : null;   // partiya yaroqlilik muddati
    out.push({ product, unit, qty, box_qty: product.box_qty, price, price_usd: priceUsd, total: Math.round(qty * price), expires });
  }
  if (!out.length) throw httpError(400, "Kamida bitta mahsulot qo'shing");
  return out;
}

router.post('/purchases', need('purchases.create'), (req, res) => res.json(createPurchase(req, req.body)));

function createPurchase(req, b) {
  const sup = db.prepare('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL').get(int(b.supplier_id));
  if (!sup) throw httpError(400, 'Yetkazib beruvchini tanlang');
  const currency = str(b.currency, 10).toUpperCase() === 'USD' ? 'USD' : 'UZS';
  const rate = Math.max(1, num(b.rate, 1));
  const items = readPurchaseItems(b.items, currency, rate);
  const total = items.reduce((a, i) => a + i.total, 0);
  const totalUsd = currency === 'USD' ? Math.round(items.reduce((a, i) => a + i.qty * (i.price_usd || 0), 0) * 100) / 100 : 0;
  const date = normDate(b.date);
  const t = now();
  const paid = Math.max(0, int(b.paid && b.paid.amount));
  if (paid && !can(req, 'suppliers.pay')) throw httpError(403, "Yetkazib beruvchiga to'lov ruxsatingiz yo'q");
  // Xarid narxi = tannarx manbai (xarid yaratish ruxsati kirim narxini ko'rish va kiritishni ham o'z ichiga oladi)
  let id, number;
  db.transaction(() => {
    number = nextNumber('purchases', 'K');
    id = Number(db.prepare(`INSERT INTO purchases (number,supplier_id,date,total,currency,rate,total_usd,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(number, sup.id, date, total, currency, rate, totalUsd, str(b.note, 1000), req.user.id, t, t).lastInsertRowid);
    const insI = db.prepare('INSERT INTO purchase_items (purchase_id,product_id,name,unit,qty,box_qty,price,total,expires_at,price_usd,cost_usd) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insM = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,purchase_id,expires_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const i of items) {
      const p = i.product;
      const pieces = i.unit === 'karobka' ? i.qty * i.box_qty : i.qty;
      const cost = i.price > 0 ? (i.unit === 'karobka' ? i.price / i.box_qty : i.price) : null;
      const costUsd = i.price_usd > 0 ? (i.unit === 'karobka' ? i.price_usd / i.box_qty : i.price_usd) : (currency === 'USD' && cost && rate > 0 ? cost / rate : 0);
      insI.run(id, p.id, p.name, i.unit, i.qty, i.box_qty, i.price, i.total, i.expires, i.price_usd || 0, costUsd || 0);
      if (cost !== null) updateCost(p, pieces, cost, costUsd);
      insM.run(p.id, pieces, date, `Xarid ${number}: ${sup.name}`, cost, id, i.expires, req.user.id, t);
    }
    if (paid) {
      const method = METHODS.includes(b.paid.method) ? b.paid.method : 'cash';
      db.prepare(`INSERT INTO supplier_payments (supplier_id,purchase_id,amount,method,date,note,register_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(sup.id, id, paid, method, date, `Xarid ${number} uchun`, registerFor(req, b.register_id), req.user.id, t);
    }
  })();
  // Yagona ombor: xarid tasdiqlanganda boshqa filiallarga ham kirim sinxronlanadi
  try {
    const { isSharedEnabled, syncStockDeltaAcrossBranches } = require('../shared_sync');
    if (isSharedEnabled()) {
      const syncItems = items.map((i) => {
        const pieces = i.unit === 'karobka' ? i.qty * i.box_qty : i.qty;
        return {
          product_id: i.product.id,
          name: i.product.name,
          sku: i.product.sku,
          barcode: i.product.barcode,
          unit: i.unit,
          deltaPieces: pieces,  // musbat — omborga kirim
          note: `Xarid ${number}: ${sup.name}`,
        };
      });
      syncStockDeltaAcrossBranches(req.branch ? req.branch.id : 0, syncItems);
    }
  } catch (e) {
    console.warn('[purchases] shared_sync xatolik:', e.message);
  }
  audit(req, { action: 'create', entity: 'purchase', entity_id: id, summary: `Xarid ${number}: ${sup.name}, ${items.length} ta mahsulot, ${fmtMoney(total)}${paid ? `, to'landi ${fmtMoney(paid)}` : ''}` });
  return { id, number };
}

// ================= Yetkazib beruvchiga buyurtma (zakaz) =================
// Qoralama → yuborildi → (tovar keldi) qabul qilindi = xarid hujjati yaratiladi; yoki bekor qilindi
const PO_STATUS = ['draft', 'sent', 'received', 'cancelled'];
router.get('/purchase-orders', need('suppliers.view', 'purchases.create'), (req, res) => {
  const where = ['1=1'], args = [];
  if (req.query.status) { where.push('o.status=?'); args.push(str(req.query.status)); }
  res.json(db.prepare(`SELECT o.*, s.name supplier_name, (SELECT COUNT(*) FROM purchase_order_items i WHERE i.order_id=o.id) items_n,
      (SELECT COALESCE(SUM(i.qty * i.price),0) FROM purchase_order_items i WHERE i.order_id=o.id) total, p.number purchase_number
    FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN purchases p ON p.id=o.purchase_id
    WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 500`).all(...args));
});

// Tavsiya: kam qolgan tovarlar — taklif qilinadigan miqdor = 2 × minimal − qoldiq (qadoqqa yaxlitlab), narx — oxirgi tannarx
router.get('/purchase-orders/suggest', need('purchases.create'), (_req, res) => {
  const rows = db.prepare(`SELECT id, name, unit, pack_name, box_qty, stock_pieces stock, min_stock, cost_price FROM products
    WHERE deleted_at IS NULL AND active=1 AND min_stock>0 AND stock_pieces<=min_stock ORDER BY stock_pieces / min_stock LIMIT 300`).all();
  res.json(rows.map((p) => {
    const need = Math.max(p.min_stock * 2 - Math.max(0, p.stock), p.box_qty > 1 ? p.box_qty : 1);
    const pack = p.box_qty > 1;
    const qty = pack ? Math.ceil(need / p.box_qty) : Math.ceil(need);
    return { product_id: p.id, name: p.name, unit: pack ? 'karobka' : 'dona', qty, box_qty: p.box_qty, unit_code: p.unit, pack_name: p.pack_name,
      price: Math.round((p.cost_price || 0) * (pack ? p.box_qty : 1)), stock: p.stock, min_stock: p.min_stock };
  }));
});

router.get('/purchase-orders/:id', need('suppliers.view', 'purchases.create'), (req, res) => {
  const o = db.prepare(`SELECT o.*, s.name supplier_name, s.phone supplier_phone, s.contact_name supplier_contact, p.number purchase_number
    FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN purchases p ON p.id=o.purchase_id WHERE o.id=?`).get(req.params.id);
  if (!o) throw httpError(404, 'Topilmadi');
  o.items = db.prepare(`SELECT i.*, pr.name, pr.unit unit_code, pr.pack_name, pr.box_qty, pr.stock_pieces stock FROM purchase_order_items i
    JOIN products pr ON pr.id=i.product_id WHERE i.order_id=? ORDER BY i.id`).all(o.id);
  for (const i of o.items) i.base_unit = unitLabel(i.unit_code);
  res.json(o);
});

function savePoItems(orderId, items) {
  db.prepare('DELETE FROM purchase_order_items WHERE order_id=?').run(orderId);
  const ins = db.prepare('INSERT INTO purchase_order_items (order_id,product_id,unit,qty,price) VALUES (?,?,?,?,?)');
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const p = db.prepare('SELECT id, box_qty FROM products WHERE id=? AND deleted_at IS NULL').get(int(it.product_id));
    const qty = Math.round(num(it.qty) * 1000) / 1000;
    if (!p || !(qty > 0)) continue;
    ins.run(orderId, p.id, it.unit === 'karobka' && p.box_qty > 1 ? 'karobka' : 'dona', qty, Math.max(0, num(it.price)));
    n++;
  }
  if (!n) throw httpError(400, "Kamida bitta mahsulot qo'shing");
}

router.post('/purchase-orders', need('purchases.create'), (req, res) => {
  const sup = db.prepare('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL').get(int(req.body.supplier_id));
  if (!sup) throw httpError(400, 'Yetkazib beruvchini tanlang');
  let id, number;
  db.transaction(() => {
    number = nextNumber('purchase_orders', 'Z');
    id = Number(db.prepare('INSERT INTO purchase_orders (number,supplier_id,date,status,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(number, sup.id, now(), 'draft', str(req.body.note, 500), req.user.id, now()).lastInsertRowid);
    savePoItems(id, req.body.items);
  })();
  audit(req, { action: 'create', entity: 'purchase_order', entity_id: id, summary: `Buyurtma (zakaz) ${number}: ${sup.name}` });
  res.json({ id, number });
});

router.put('/purchase-orders/:id', need('purchases.create'), (req, res) => {
  const o = db.prepare("SELECT * FROM purchase_orders WHERE id=? AND status IN ('draft','sent')").get(req.params.id);
  if (!o) throw httpError(400, "Faqat qoralama yoki yuborilgan buyurtmani o'zgartirish mumkin");
  db.transaction(() => {
    savePoItems(o.id, req.body.items);
    db.prepare('UPDATE purchase_orders SET note=? WHERE id=?').run(str(req.body.note, 500), o.id);
  })();
  res.json({ ok: true });
});

router.post('/purchase-orders/:id/status', need('purchases.create'), (req, res) => {
  const o = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id);
  if (!o) throw httpError(404, 'Topilmadi');
  const st = str(req.body.status, 20);
  if (!['sent', 'cancelled'].includes(st) || !['draft', 'sent'].includes(o.status)) throw httpError(400, "Holatni o'zgartirib bo'lmaydi");
  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(st, o.id);
  audit(req, { action: 'update', entity: 'purchase_order', entity_id: o.id, summary: `Buyurtma ${o.number}: ${st === 'sent' ? 'yuborildi' : 'bekor qilindi'}` });
  res.json({ ok: true });
});

// Tovar keldi: buyurtma pozitsiyalaridan (yoki qabul paytida tuzatilgan miqdor/narxdan) xarid hujjati yaratiladi
router.post('/purchase-orders/:id/receive', need('purchases.create'), (req, res) => {
  const o = db.prepare("SELECT * FROM purchase_orders WHERE id=? AND status IN ('draft','sent')").get(req.params.id);
  if (!o) throw httpError(400, 'Buyurtma qabul qilingan yoki bekor qilingan');
  const items = Array.isArray(req.body.items) && req.body.items.length ? req.body.items
    : db.prepare('SELECT product_id, unit, qty, price FROM purchase_order_items WHERE order_id=?').all(o.id);
  const r = createPurchase(req, { supplier_id: o.supplier_id, items, note: `Buyurtma ${o.number}`, paid: req.body.paid, date: req.body.date });
  db.prepare("UPDATE purchase_orders SET status='received', purchase_id=? WHERE id=?").run(r.id, o.id);
  audit(req, { action: 'receive', entity: 'purchase_order', entity_id: o.id, summary: `Buyurtma ${o.number} qabul qilindi → xarid ${r.number}` });
  res.json(r);
});

// Bekor qilish: omborga kirgan tovar chiqariladi (kirim harakatlari o'chiriladi), to'lovlar yetkazib beruvchi hisobida qoladi
router.post('/purchases/:id/cancel', need('purchases.delete'), (req, res) => {
  const p = db.prepare("SELECT * FROM purchases WHERE id=? AND deleted_at IS NULL AND status='confirmed'").get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  const moves = db.prepare('SELECT product_id, qty_pieces, cost FROM stock_moves WHERE purchase_id=? AND deleted_at IS NULL').all(p.id);
  const { getSetting } = require('../util');
  if (getSetting('allow_negative_stock', '1') === '0') {
    const shortages = [];
    for (const m of moves) {
      const prod = db.prepare('SELECT name, stock_pieces, unit FROM products WHERE id=?').get(m.product_id);
      if (prod && (prod.stock_pieces || 0) < m.qty_pieces - 1e-9) {
        shortages.push(`${prod.name}: omborda faqat ${prod.stock_pieces || 0} dona qolgan, xaridda ${m.qty_pieces} dona bo'lgan`);
      }
    }
    if (shortages.length > 0) {
      throw httpError(400, "Xaridni bekor qilib bo'lmaydi, tovarlar allaqachon sotilgan va omborda yetarli qoldiq yo'q: " + shortages.join('; '));
    }
  }
  const t = now();
  db.transaction(() => {
    db.prepare("UPDATE purchases SET status='cancelled', updated_at=? WHERE id=?").run(t, p.id);
    // Tannarx: shu kirim ulushi o'rtachadan chiqariladi (harakatlar o'chirilishidan oldin — qoldiq hali ularni o'z ichiga oladi)
    for (const m of moves) revertCost(m.product_id, m.qty_pieces, m.cost);
    db.prepare('UPDATE stock_moves SET deleted_at=? WHERE purchase_id=? AND deleted_at IS NULL').run(t, p.id);
  })();
  try {
    const { isSharedEnabled, syncStockDeltaAcrossBranches } = require('../shared_sync');
    if (isSharedEnabled() && moves.length) {
      const syncItems = moves.map((m) => {
        const prod = db.prepare('SELECT name, sku, barcode, unit FROM products WHERE id=?').get(m.product_id) || {};
        return {
          product_id: m.product_id,
          name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode,
          unit: prod.unit,
          deltaPieces: -Number(m.qty_pieces || 0),
          note: `Xarid bekor qilindi ${p.number}`,
        };
      });
      syncStockDeltaAcrossBranches(req.branch ? req.branch.id : 0, syncItems);
    }
  } catch (e) {
    console.warn('[purchases cancel] shared_sync xatolik:', e.message);
  }
  audit(req, { action: 'cancel', entity: 'purchase', entity_id: p.id, summary: `Xarid bekor qilindi: ${p.number}` });
  res.json({ ok: true });
});

// --- Yetkazib beruvchiga to'lov ---
router.post('/suppliers/:id/payments', need('suppliers.pay'), (req, res) => {
  const s = db.prepare('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!s) throw httpError(404, 'Topilmadi');
  const amount = int(req.body.amount);
  if (!amount) throw httpError(400, 'Summani kiriting');
  const method = METHODS.includes(req.body.method) ? req.body.method : 'cash';
  const pid = int(req.body.purchase_id) || null;
  if (pid && !db.prepare('SELECT 1 FROM purchases WHERE id=? AND supplier_id=?').get(pid, s.id)) throw httpError(400, 'Xarid topilmadi');
  const id = Number(db.prepare(`INSERT INTO supplier_payments (supplier_id,purchase_id,amount,method,date,note,register_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(s.id, pid, amount, method, normDate(req.body.date), str(req.body.note, 500), registerFor(req, req.body.register_id), req.user.id, now()).lastInsertRowid);
  audit(req, { action: 'create', entity: 'supplier_payment', entity_id: id, summary: `${s.name}ga to'lov: ${fmtMoney(amount)}` });
  res.json({ id });
});

router.delete('/supplier-payments/:id', need('suppliers.pay'), (req, res) => {
  const p = db.prepare('SELECT sp.*, s.name FROM supplier_payments sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.id=? AND sp.deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE supplier_payments SET deleted_at=? WHERE id=?').run(now(), p.id);
  audit(req, { action: 'delete', entity: 'supplier_payment', entity_id: p.id, summary: `${p.name}ga to'lov o'chirildi: ${fmtMoney(p.amount)}` });
  res.json({ ok: true });
});

module.exports = { router };
