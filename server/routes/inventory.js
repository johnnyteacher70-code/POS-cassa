// Inventarizatsiya (reviziya): yaratilganda tizimdagi qoldiqlar "kutilgan" sifatida yoziladi,
// xodimlar haqiqiy sanoqni kiritadi, yakunlanganda farq ombor harakati (stock_moves.inventory_id) bilan tuzatiladi.
// Yakunlashda kutilgan qoldiq qayta olinadi: sanash davomida bo'lgan sotuvlar farqni buzmaydi
// (farq = sanalgan − hozirgi qoldiq, sanash vaqtidagi sotuvlar tufayli emas).
const express = require('express');
const db = require('../db');
const { now, str, int, num, httpError, audit, fmtMoney, nextNumber } = require('../util');
const { need, can } = require('./auth');
const { unitLabel } = require('../units');

const router = express.Router();
router.use(need('inventory.manage'));

router.get('/', (_req, res) => {
  res.json(db.prepare(`SELECT i.*, COALESCE(NULLIF(u.full_name,''), u.username) user_name,
      (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id=i.id) items_n,
      (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id=i.id AND x.counted IS NOT NULL) counted_n
    FROM inventories i LEFT JOIN users u ON u.id=i.created_by ORDER BY i.id DESC LIMIT 200`).all());
});

router.post('/', (req, res) => {
  if (db.prepare("SELECT 1 FROM inventories WHERE status='draft'").get()) throw httpError(400, 'Tugallanmagan inventarizatsiya bor — avval uni yakunlang yoki bekor qiling');
  const category = str(req.body.category, 60);
  const t = now();
  let id, number;
  db.transaction(() => {
    number = nextNumber('inventories', 'INV');
    id = Number(db.prepare('INSERT INTO inventories (number,category,note,created_by,created_at) VALUES (?,?,?,?,?)')
      .run(number, category, str(req.body.note, 500), req.user.id, t).lastInsertRowid);
    db.prepare(`INSERT INTO inventory_items (inventory_id,product_id,expected,cost)
      SELECT ?, id, stock_pieces, cost_price FROM products WHERE deleted_at IS NULL AND active=1 ${category ? 'AND category=?' : ''}`)
      .run(...(category ? [id, category] : [id]));
  })();
  audit(req, { action: 'create', entity: 'inventory', entity_id: id, summary: `Inventarizatsiya boshlandi: ${number}${category ? ' (' + category + ')' : ''}` });
  res.json({ id, number });
});

function load(id, req) {
  const inv = db.prepare('SELECT * FROM inventories WHERE id=?').get(id);
  if (!inv) throw httpError(404, 'Topilmadi');
  const showCost = can(req, 'products.cost');
  inv.items = db.prepare(`SELECT x.product_id, x.expected, x.counted, ${showCost ? 'x.cost,' : ''} p.name, p.barcode, p.sku, p.unit, p.pack_name, p.box_qty, p.category,
      COALESCE(p.image, '') image, p.stock_pieces current
    FROM inventory_items x JOIN products p ON p.id=x.product_id WHERE x.inventory_id=? ORDER BY p.category, p.name`).all(inv.id);
  for (const i of inv.items) i.base_unit = unitLabel(i.unit);
  return inv;
}

router.get('/:id', (req, res) => res.json(load(req.params.id, req)));

// Sanoqni saqlash (qisman ham bo'ladi): items: [{ product_id, counted }] — counted bo'sh bo'lsa sanalmagan
router.put('/:id', (req, res) => {
  const inv = db.prepare("SELECT * FROM inventories WHERE id=? AND status='draft'").get(req.params.id);
  if (!inv) throw httpError(400, 'Inventarizatsiya yakunlangan yoki topilmadi');
  const up = db.prepare('UPDATE inventory_items SET counted=? WHERE inventory_id=? AND product_id=?');
  db.transaction(() => {
    for (const it of Array.isArray(req.body.items) ? req.body.items : []) {
      const c = it.counted === '' || it.counted === null || it.counted === undefined ? null : Math.max(0, Math.round(num(it.counted) * 1000) / 1000);
      up.run(c, inv.id, int(it.product_id));
    }
  })();
  res.json({ ok: true });
});

// Yakunlash: sanalgan har bir mahsulot uchun farq = sanalgan − hozirgi qoldiq → ombor harakati
router.post('/:id/finish', (req, res) => {
  const inv = db.prepare("SELECT * FROM inventories WHERE id=? AND status='draft'").get(req.params.id);
  if (!inv) throw httpError(400, 'Inventarizatsiya yakunlangan yoki topilmadi');
  const t = now();
  let plus = 0, minus = 0, n = 0;
  const syncItems = [];
  db.transaction(() => {
    const rows = db.prepare(`SELECT x.product_id, x.counted, p.stock_pieces, p.cost_price, p.sku, p.barcode, p.name, p.unit FROM inventory_items x JOIN products p ON p.id=x.product_id
      WHERE x.inventory_id=? AND x.counted IS NOT NULL`).all(inv.id);
    const ins = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,inventory_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
    const fix = db.prepare('UPDATE inventory_items SET expected=?, cost=? WHERE inventory_id=? AND product_id=?');
    for (const r of rows) {
      const diff = Math.round((r.counted - (r.stock_pieces || 0)) * 1000) / 1000;
      fix.run(r.stock_pieces || 0, r.cost_price || 0, inv.id, r.product_id);
      if (!diff) continue;
      ins.run(r.product_id, diff, t, `Inventarizatsiya ${inv.number}`, r.cost_price || null, inv.id, req.user.id, t);
      n++;
      if (diff > 0) plus += diff * (r.cost_price || 0); else minus += -diff * (r.cost_price || 0);
      syncItems.push({
        product_id: r.product_id,
        sku: r.sku,
        barcode: r.barcode,
        name: r.name,
        unit: r.unit,
        deltaPieces: diff,
        note: `Inventarizatsiya ${inv.number}`,
      });
    }
    db.prepare("UPDATE inventories SET status='done', done_at=?, done_by=? WHERE id=?").run(t, req.user.id, inv.id);
  })();
  if (syncItems.length) {
    try {
      const { isSharedEnabled, syncStockDeltaAcrossBranches } = require('../shared_sync');
      if (isSharedEnabled()) syncStockDeltaAcrossBranches(req.branch ? req.branch.id : 0, syncItems);
    } catch (e) {
      console.warn('[inventory finish] shared_sync xatolik:', e.message);
    }
  }
  audit(req, { action: 'finish', entity: 'inventory', entity_id: inv.id, summary: `Inventarizatsiya yakunlandi: ${inv.number}, ${n} ta tuzatish, kamomad ${fmtMoney(Math.round(minus))}, ortiqcha ${fmtMoney(Math.round(plus))}` });
  res.json({ ok: true, adjusted: n, shortage: Math.round(minus), surplus: Math.round(plus) });
});

router.post('/:id/cancel', (req, res) => {
  const inv = db.prepare("SELECT * FROM inventories WHERE id=? AND status='draft'").get(req.params.id);
  if (!inv) throw httpError(400, 'Faqat tugallanmagan inventarizatsiyani bekor qilish mumkin');
  db.prepare("UPDATE inventories SET status='cancelled', done_at=?, done_by=? WHERE id=?").run(now(), req.user.id, inv.id);
  audit(req, { action: 'cancel', entity: 'inventory', entity_id: inv.id, summary: `Inventarizatsiya bekor qilindi: ${inv.number}` });
  res.json({ ok: true });
});

module.exports = { router };
