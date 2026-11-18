const express = require('express');
const db = require('../db');
const { currentBranchId } = require('../context');
const { need, can, canAny } = require('./auth');
const { now, str, httpError, audit, fmtMoney } = require('../util');
const { readItems, itemsTotal } = require('../items');
const { createSale } = require('./sales');
const { onOrderConfirmedAcrossBranches } = require('../shared_sync');

const router = express.Router();

router.get('/', need('orders.view'), (req, res) => {
  const status = str(req.query.status);
  const args = [];
  let where = 'o.deleted_at IS NULL';
  if (['new', 'confirmed', 'rejected', 'cancelled'].includes(status)) { where += ' AND o.status=?'; args.push(status); }
  const rows = db.prepare(`SELECT o.*, c.company_name, c.contact_name, c.phone, c.balance, s.number sale_number,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) items_count
    FROM orders o JOIN clients c ON c.id=o.client_id LEFT JOIN sales s ON s.id=o.sale_id
    WHERE ${where} ORDER BY CASE o.status WHEN 'new' THEN 0 ELSE 1 END, o.id DESC LIMIT 500`).all(...args);
  const counts = db.prepare(`SELECT status, COUNT(*) n FROM orders WHERE deleted_at IS NULL GROUP BY status`).all();
  res.json({ rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

// Yangi buyurtmalar soni (menyu nishoni uchun — ro'yxatsiz, yengil)
router.get('/count', (req, res) => {
  if (!can(req, 'orders.view')) return res.json({ new: 0 });
  res.json({ new: db.prepare("SELECT COUNT(*) n FROM orders WHERE status='new' AND deleted_at IS NULL").get().n });
});

router.get('/:id', need('orders.view'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(o.id);
  o.client = db.prepare('SELECT * FROM clients WHERE id=?').get(o.client_id);
  o.sale = o.sale_id ? db.prepare('SELECT id, number FROM sales WHERE id=?').get(o.sale_id) : null;
  o.audit = db.prepare(`SELECT at, user_name, action, summary FROM audit_log WHERE entity='order' AND entity_id=? ORDER BY id DESC`).all(o.id);
  res.json(o);
});

function saveItems(orderId, items) {
  db.prepare('DELETE FROM order_items WHERE order_id=?').run(orderId);
  const ins = db.prepare('INSERT INTO order_items (order_id,product_id,name,color,unit,qty,box_qty,price,total,base_unit,pack_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for (const i of items) ins.run(orderId, i.product_id, i.name, i.color || '', i.unit, i.qty, i.box_qty, i.price, i.total, i.base_unit || '', i.pack_name || '');
}

// Buyurtmani tahrirlash (mijoz bilan gaplashgandan keyin)
router.put('/:id', need('orders.process'), (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  if (o.status === 'confirmed') throw httpError(400, 'Tasdiqlangan buyurtmani sotuv sahifasida tahrirlang');
  const items = readItems(req.body.items);
  db.transaction(() => {
    saveItems(o.id, items);
    db.prepare('UPDATE orders SET total=?, admin_note=?, updated_at=? WHERE id=?').run(itemsTotal(items), str(req.body.admin_note, 1000), now(), o.id);
  })();
  audit(req, { action: 'update', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} tahrirlandi: ${fmtMoney(o.total)} → ${fmtMoney(itemsTotal(items))}` });
  res.json({ ok: true });
});

// Tasdiqlash => haqiqiy sotuvga aylanadi (mijoz hisobidan yechiladi / qarzga yoziladi).
function confirmOrder(req, id, body = {}) {
  const o = db.prepare("SELECT * FROM orders WHERE id=? AND deleted_at IS NULL").get(id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi yoki boshqa do\'kon tomonidan qabul qilingan');
  if (o.status === 'confirmed') throw httpError(400, 'Buyurtma allaqachon tasdiqlangan');
  if (o.status === 'cancelled') throw httpError(400, 'Bu buyurtma bekor qilingan yoki boshqa do\'kon tomonidan qabul qilingan');
  const items = body.items ? readItems(body.items) : db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  const result = createSale(req, {
    client_id: o.client_id, items, date: body.date, due_date: body.due_date,
    note: str(body.note) || `Sayt buyurtma #${o.id}${o.note ? ': ' + o.note : ''}`,
    order_id: o.id, pay_now: body.pay_now, discount: body.discount, register_id: body.register_id,
  }, { trustedPrices: !body.items });
  db.prepare("UPDATE orders SET status='confirmed', sale_id=?, admin_note=?, processed_by=?, processed_at=?, updated_at=? WHERE id=?")
    .run(result.id, str(body.admin_note, 1000), req.user.id, now(), now(), o.id);
  audit(req, { action: 'confirm', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} tasdiqlandi → sotuv ${result.number}` });

  // Buyurtma qabul qilingach, nargi (boshqa) do'konlardan butunlay olib tashlaymiz
  if (o.order_uuid) {
    try {
      onOrderConfirmedAcrossBranches(currentBranchId(), o.order_uuid, req.user ? req.user.name : '');
    } catch (err) {
      console.error('[orders] onOrderConfirmedAcrossBranches error:', err.message);
    }
  }

  return result;
}

function rejectOrder(req, id, reasonText) {
  const o = db.prepare("SELECT * FROM orders WHERE id=? AND deleted_at IS NULL").get(id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  if (o.status === 'confirmed') throw httpError(400, 'Tasdiqlangan buyurtmani bekor qilish uchun sotuvni bekor qiling');
  if (o.status === 'cancelled') throw httpError(400, 'Mijoz bu buyurtmani bekor qilgan');
  const reason = str(reasonText, 500);
  db.prepare("UPDATE orders SET status='rejected', admin_note=?, processed_by=?, processed_at=?, updated_at=? WHERE id=?")
    .run(reason, req.user.id, now(), now(), o.id);
  audit(req, { action: 'reject', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} rad etildi${reason ? ': ' + reason : ''}` });
  return { ok: true };
}

router.post('/:id/confirm', need('orders.process'), (req, res) => res.json(confirmOrder(req, req.params.id, req.body)));
router.post('/:id/reject', need('orders.process'), (req, res) => res.json(rejectOrder(req, req.params.id, req.body.reason)));

// Rad etilganni qayta "yangi" holatga qaytarish
router.post('/:id/reopen', need('orders.delete'), (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  if (o.status === 'cancelled') throw httpError(400, 'Mijoz bu buyurtmani bekor qilgan');
  if (o.status === 'confirmed') {
    const s = o.sale_id && db.prepare("SELECT status, deleted_at FROM sales WHERE id=?").get(o.sale_id);
    if (s && s.status === 'confirmed' && !s.deleted_at) throw httpError(400, "Avval bog'langan sotuvni bekor qiling");
  }
  db.prepare("UPDATE orders SET status='new', sale_id=NULL, updated_at=? WHERE id=?").run(now(), o.id);
  audit(req, { action: 'restore', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} qayta ochildi` });
  res.json({ ok: true });
});

router.delete('/:id', need('orders.delete'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  db.prepare('UPDATE orders SET deleted_at=? WHERE id=?').run(now(), o.id);
  audit(req, { action: 'delete', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} o'chirildi` });
  res.json({ ok: true });
});

router.post('/:id/restore', need('orders.delete'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!o) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE orders SET deleted_at=NULL WHERE id=?').run(o.id);
  audit(req, { action: 'restore', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Buyurtma #${o.id} tiklandi` });
  res.json({ ok: true });
});

module.exports = { router, confirmOrder, rejectOrder };
