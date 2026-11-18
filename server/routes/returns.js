// Qaytarish (vozvrat): mijoz sotuvdagi tovarning bir qismini (yoki hammasini) qaytaradi.
//   - tovar omborga qaytadi (stock_moves.return_id);
//   - qaytarilgan summa mijoz hisobiga yoziladi: payments (direction='in', method='return') — avval shu sotuv qarzini yopadi,
//     qarz bo'lmasa avansga aylanadi;
//   - pul qaytarilsa (naqd / karta) — chiqim to'lovi (payments: direction='out').
// Chegirmali sotuvda qaytarish summasi chegirmaga mutanosib kamaytiriladi.
const express = require('express');
const db = require('../db');
const { now, str, int, num, normDate, httpError, audit, fmtMoney, nextNumber, registerFor, currentBranchInfo } = require('../util');
const { need } = require('./auth');
const { recomputeClient } = require('../ledger');
const { pieces } = require('../items');
const { updateCost } = require('./products');

const router = express.Router();
const METHODS = ['cash', 'transfer', 'card', 'other'];

// Har bir sotuv pozitsiyasidan allaqachon qaytarilgan miqdor
function returnedMap(saleId) {
  return new Map(db.prepare(`SELECT ri.sale_item_id, SUM(ri.qty) q FROM sale_return_items ri JOIN sale_returns r ON r.id=ri.return_id
    WHERE r.sale_id=? AND r.deleted_at IS NULL GROUP BY ri.sale_item_id`).all(saleId).map((r) => [r.sale_item_id, r.q]));
}

router.get('/', need('sales.return', 'sales.view'), (req, res) => {
  const where = ['r.deleted_at IS NULL'];
  const args = [];
  if (req.query.sale_id) { where.push('r.sale_id=?'); args.push(int(req.query.sale_id)); }
  if (req.query.client_id) { where.push('r.client_id=?'); args.push(int(req.query.client_id)); }
  if (req.query.from) { where.push('r.date>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('r.date<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  res.json(db.prepare(`SELECT r.*, s.number sale_number, c.company_name, c.contact_name, c.phone, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM sale_returns r JOIN sales s ON s.id=r.sale_id JOIN clients c ON c.id=r.client_id LEFT JOIN users u ON u.id=r.created_by
    WHERE ${where.join(' AND ')} ORDER BY r.date DESC, r.id DESC LIMIT 1000`).all(...args));
});

// Sotuv bo'yicha qaytarish mumkin bo'lgan pozitsiyalar
router.get('/sale/:saleId', need('sales.return'), (req, res) => {
  const s = db.prepare("SELECT * FROM sales WHERE id=? AND deleted_at IS NULL").get(req.params.saleId);
  if (!s) throw httpError(404, 'Sotuv topilmadi');
  const back = returnedMap(s.id);
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(s.id)
    .map((i) => ({ ...i, returned: back.get(i.id) || 0, left: Math.max(0, Math.round((i.qty - (back.get(i.id) || 0)) * 1000) / 1000) }));
  res.json({ sale: s, items });
});

router.post('/', need('sales.return'), (req, res) => {
  const b = req.body;
  const s = db.prepare("SELECT * FROM sales WHERE id=? AND deleted_at IS NULL").get(int(b.sale_id));
  if (!s) throw httpError(404, 'Sotuv topilmadi');
  if (s.status !== 'confirmed') throw httpError(400, 'Bekor qilingan sotuvdan qaytarib bo\'lmaydi');
  const all = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(s.id);
  const itemsSum = all.reduce((a, i) => a + i.total, 0);
  const k = itemsSum > 0 ? s.total / itemsSum : 1;   // chegirma ulushi
  const back = returnedMap(s.id);
  const lines = [];
  for (const r of Array.isArray(b.items) ? b.items : []) {
    const it = all.find((i) => i.id === int(r.sale_item_id));
    if (!it) throw httpError(400, 'Pozitsiya topilmadi');
    const qty = Math.round(num(r.qty) * 1000) / 1000;
    if (!(qty > 0)) continue;
    const left = Math.round((it.qty - (back.get(it.id) || 0)) * 1000) / 1000;
    if (qty > left + 1e-9) throw httpError(400, `${it.name}: ko'pi bilan ${left} qaytarish mumkin`);
    const total = Math.round((it.total / it.qty) * qty * k);
    lines.push({ it, qty, total, price: Math.round(total / qty) });
  }
  if (!lines.length) throw httpError(400, 'Qaytariladigan miqdorni kiriting');
  const total = lines.reduce((a, l) => a + l.total, 0);
  const refund = Math.min(total, Math.max(0, int(b.refund && b.refund.amount)));
  const method = METHODS.includes(b.refund && b.refund.method) ? b.refund.method : 'cash';
  const date = normDate(b.date);
  const t = now();
  const register = registerFor(req, b.register_id);
  const binfo = currentBranchInfo();
  let id, number;
  db.transaction(() => {
    number = nextNumber('sale_returns', 'V');
    id = Number(db.prepare(`INSERT INTO sale_returns (number,sale_id,client_id,date,total,refund,note,branch_id,branch_code,branch_name,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(number, s.id, s.client_id, date, total, refund, str(b.note, 500), binfo.id, binfo.code, binfo.name, req.user.id, t).lastInsertRowid);
    const insI = db.prepare(`INSERT INTO sale_return_items (return_id,sale_item_id,product_id,name,unit,qty,box_qty,price,total,cost) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insM = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,return_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
    for (const l of lines) {
      insI.run(id, l.it.id, l.it.product_id, l.it.name, l.it.unit, l.qty, l.it.box_qty, l.price, l.total, l.it.cost || 0);
      if (l.it.product_id) {
        const retPieces = pieces({ ...l.it, qty: l.qty });
        insM.run(l.it.product_id, retPieces, date, `Qaytarish ${number} (${s.number})`, l.it.cost || null, id, req.user.id, t);
        if (l.it.cost > 0) updateCost({ id: l.it.product_id }, retPieces, l.it.cost);
      }
    }
    const insP = db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,sale_id,note,return_id,register_id,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    insP.run(s.client_id, 'in', 'return', total, date, s.id, `Qaytarish ${number}`, id, register, req.user.id, t, t);
    if (refund) insP.run(s.client_id, 'out', method, refund, date, null, `Qaytarish ${number}: pul qaytarildi`, id, register, req.user.id, t, t);
  })();
  recomputeClient(s.client_id);
  require('../bonus').onReturn(s, total, id);
  audit(req, {
    action: 'create', entity: 'return', entity_id: id, client_id: s.client_id,
    summary: `Qaytarish ${number} (${s.number}): ${fmtMoney(total)}${refund ? `, pul qaytarildi ${fmtMoney(refund)}` : ', mijoz hisobiga'}`,
  });
  const { syncStockDeltaAcrossBranches } = require('../shared_sync');
  const syncItems = lines.filter((l) => l.it.product_id).map((l) => {
    const prod = db.prepare('SELECT name, sku, barcode, unit FROM products WHERE id=?').get(l.it.product_id);
    return {
      product_id: l.it.product_id,
      name: (prod && prod.name) || l.it.name,
      sku: prod && prod.sku,
      barcode: prod && prod.barcode,
      unit: l.it.unit,
      deltaPieces: pieces({ ...l.it, qty: l.qty }),
      note: `Qaytarish ${number} (${s.number})`,
    };
  });
  syncStockDeltaAcrossBranches(binfo.id, syncItems);
  res.json({ id, number, total, refund });
});

router.get('/:id', need('sales.return', 'sales.view'), (req, res) => {
  const r = db.prepare(`SELECT r.*, s.number sale_number FROM sale_returns r JOIN sales s ON s.id=r.sale_id WHERE r.id=?`).get(req.params.id);
  if (!r) throw httpError(404, 'Topilmadi');
  r.items = db.prepare('SELECT * FROM sale_return_items WHERE return_id=? ORDER BY id').all(r.id);
  r.client = db.prepare('SELECT * FROM clients WHERE id=?').get(r.client_id);
  res.json(r);
});

// Qaytarishni bekor qilish: tovar yana chiqadi, mijoz hisobidagi yozuvlar o'chadi
router.delete('/:id', need('sales.return'), (req, res) => {
  const r = db.prepare('SELECT * FROM sale_returns WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!r) throw httpError(404, 'Topilmadi');
  const t = now();
  db.transaction(() => {
    db.prepare('UPDATE sale_returns SET deleted_at=? WHERE id=?').run(t, r.id);
    db.prepare('UPDATE stock_moves SET deleted_at=? WHERE return_id=? AND deleted_at IS NULL').run(t, r.id);
    db.prepare('UPDATE payments SET deleted_at=?, updated_at=? WHERE return_id=? AND deleted_at IS NULL').run(t, t, r.id);
  })();
  recomputeClient(r.client_id);
  require('../bonus').onReturnVoid(r);
  audit(req, { action: 'delete', entity: 'return', entity_id: r.id, client_id: r.client_id, summary: `Qaytarish bekor qilindi: ${r.number}` });
  res.json({ ok: true });
});

module.exports = { router };
