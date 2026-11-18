const express = require('express');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, normDate, httpError, audit, fmtMoney, registerFor } = require('../util');
const { recomputeClient } = require('../ledger');
const { clientName } = require('./clients');

const router = express.Router();
const METHODS = { cash: 'Naqd', transfer: 'Perechisleniye', card: 'Karta', other: 'Boshqa' };

function readPayment(b, old = {}) {
  const client = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(int(b.client_id || old.client_id));
  if (!client) throw httpError(400, 'Mijozni tanlang');
  const amount = int(b.amount);
  if (!(amount > 0)) throw httpError(400, "Summani to'g'ri kiriting");
  // Maydon yuborilmasa — eski bog'lanish saqlanadi (o'chib ketmaydi)
  let saleId = 'sale_id' in b ? (b.sale_id ? int(b.sale_id) : null) : (old.sale_id || null);
  if (saleId) {
    const s = db.prepare("SELECT id FROM sales WHERE id=? AND client_id=? AND deleted_at IS NULL").get(saleId, client.id);
    if (!s) {
      // Tahrirlashda eski bog'lanish (sotuv o'chirilgan yoki mijoz almashgan) — jimgina umumiy hisobga o'tadi
      if (old.id && saleId === old.sale_id) saleId = null;
      else throw httpError(400, 'Tanlangan sotuv bu mijozga tegishli emas');
    }
  }
  const direction = b.direction === 'out' ? 'out' : 'in';
  if (direction === 'out') saleId = null;
  return {
    client,
    p: {
      client_id: client.id, direction, method: METHODS[b.method] ? b.method : 'cash', amount,
      date: normDate(b.date, old.date), sale_id: saleId, note: 'note' in b ? str(b.note, 1000) : (old.note || ''),
    },
  };
}

function describe(p) {
  return `${p.direction === 'in' ? 'Kirim' : 'Chiqim'} ${fmtMoney(p.amount)} (${METHODS[p.method] || 'Tovar qaytarish'})`;
}

// To'lov qayerga taqsimlanganini tushuntirish
function paymentResult(paymentId, clientId) {
  const allocs = db.prepare(`SELECT a.amount, s.number, s.total, s.paid_amount FROM allocations a JOIN sales s ON s.id=a.sale_id
    WHERE a.payment_id=? ORDER BY a.date`).all(paymentId);
  const p = db.prepare('SELECT amount, direction FROM payments WHERE id=?').get(paymentId);
  const used = allocs.reduce((a, x) => a + x.amount, 0);
  const bal = db.prepare('SELECT balance FROM clients WHERE id=?').get(clientId).balance;
  return { allocations: allocs, unallocated: p.direction === 'in' ? p.amount - used : 0, balance_after: bal };
}

router.get('/', need('payments.view'), (req, res) => {
  const where = ['p.deleted_at IS NULL'];
  const args = [];
  if (req.query.direction === 'in' || req.query.direction === 'out') { where.push('p.direction=?'); args.push(req.query.direction); }
  if (METHODS[req.query.method]) { where.push('p.method=?'); args.push(req.query.method); }
  if (req.query.client_id) { where.push('p.client_id=?'); args.push(int(req.query.client_id)); }
  if (req.query.user_id) { where.push('p.created_by=?'); args.push(int(req.query.user_id)); }
  if (req.query.register_id) { where.push('p.register_id=?'); args.push(int(req.query.register_id)); }
  if (req.query.from) { where.push('p.date>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('p.date<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  const q = str(req.query.q);
  if (q) {
    const like = `%${q.replace(/\s/g, '%')}%`;
    where.push('(c.company_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ? OR p.note LIKE ? OR CAST(p.amount AS TEXT) LIKE ?)');
    args.push(like, like, `%${q.replace(/\D/g, '') || q}%`, like, `${q.replace(/\D/g, '') || q}%`);
  }
  const w = where.join(' AND ');
  const rows = db.prepare(`SELECT p.*, c.company_name, c.contact_name, c.phone, s.number sale_number, COALESCE(NULLIF(u.full_name,''), u.username) user_name, rg.name register_name
    FROM payments p JOIN clients c ON c.id=p.client_id LEFT JOIN sales s ON s.id=p.sale_id LEFT JOIN users u ON u.id=p.created_by LEFT JOIN registers rg ON rg.id=p.register_id
    WHERE ${w} ORDER BY p.date DESC, p.id DESC LIMIT ?`).all(...args, Math.min(int(req.query.limit, 500), 5000));
  const sums = db.prepare(`SELECT p.direction, p.method, SUM(p.amount) total, COUNT(*) n
    FROM payments p JOIN clients c ON c.id=p.client_id WHERE ${w} AND p.method NOT IN ('return','bonus') GROUP BY p.direction, p.method`).all(...args);   // tovar qaytarish — pul emas
  res.json({ rows, sums });
});

router.get('/:id', need('payments.view', 'payments.edit'), (req, res) => {
  const p = db.prepare(`SELECT p.*, s.number sale_number FROM payments p LEFT JOIN sales s ON s.id=p.sale_id WHERE p.id=?`).get(req.params.id);
  if (!p) throw httpError(404, "To'lov topilmadi");
  p.client = db.prepare('SELECT * FROM clients WHERE id=?').get(p.client_id);
  Object.assign(p, paymentResult(p.id, p.client_id));
  p.audit = db.prepare(`SELECT at, user_name, action, summary FROM audit_log WHERE entity='payment' AND entity_id=? ORDER BY id DESC`).all(p.id);
  res.json(p);
});

router.post('/', need('payments.create'), (req, res) => {
  const { client, p } = readPayment(req.body);
  const t = now();
  const r = db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,sale_id,note,created_by,register_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(p.client_id, p.direction, p.method, p.amount, p.date, p.sale_id, p.note, req.user.id,
    registerFor(req, req.body.register_id), t, t);
  const id = r.lastInsertRowid;
  recomputeClient(client.id);
  const result = paymentResult(id, client.id);
  audit(req, {
    action: 'create', entity: 'payment', entity_id: id, client_id: client.id,
    summary: `${describe(p)} — ${clientName(client)}`
      + (result.allocations.length ? `; yopildi: ${result.allocations.map((a) => `${a.number} (${fmtMoney(a.amount)})`).join(', ')}` : '')
      + (result.unallocated ? `; avans: ${fmtMoney(result.unallocated)}` : ''),
    after: p,
  });
  res.json({ id, ...result });
});

router.put('/:id', need('payments.edit'), (req, res) => {
  const old = db.prepare('SELECT * FROM payments WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, "To'lov topilmadi");
  if (old.return_id) throw httpError(400, "Bu yozuv qaytarish hujjatiga tegishli — qaytarishni o'zini tahrirlang yoki bekor qiling");
  if (old.method === 'bonus') throw httpError(400, "Bonus to'lovi sotuvga bog'langan — sotuvni bekor qiling");
  const { client, p } = readPayment(req.body, old);
  const reg = req.body.register_id ? registerFor(req, req.body.register_id) : old.register_id;
  db.prepare(`UPDATE payments SET client_id=?, direction=?, method=?, amount=?, date=?, sale_id=?, note=?, register_id=?, updated_at=? WHERE id=?`)
    .run(p.client_id, p.direction, p.method, p.amount, p.date, p.sale_id, p.note, reg, now(), old.id);
  recomputeClient(client.id);
  if (client.id !== old.client_id) recomputeClient(old.client_id);
  audit(req, {
    action: 'update', entity: 'payment', entity_id: old.id, client_id: client.id,
    summary: `To'lov tahrirlandi: ${describe(old)} → ${describe(p)}`, before: old, after: p,
  });
  res.json({ ok: true, ...paymentResult(old.id, client.id) });
});

router.delete('/:id', need('payments.delete'), (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, "To'lov topilmadi");
  if (p.return_id) throw httpError(400, "Bu yozuv qaytarish hujjatiga tegishli — qaytarishni bekor qiling");
  if (p.method === 'bonus') throw httpError(400, "Bonus to'lovi sotuvga bog'langan — sotuvni bekor qiling");
  db.prepare('UPDATE payments SET deleted_at=? WHERE id=?').run(now(), p.id);
  recomputeClient(p.client_id);
  audit(req, { action: 'delete', entity: 'payment', entity_id: p.id, client_id: p.client_id, summary: `To'lov o'chirildi: ${describe(p)}`, before: p });
  res.json({ ok: true });
});

router.post('/:id/restore', need('payments.delete'), (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  if (p.return_id) throw httpError(400, 'Qaytarish hujjatiga tegishli yozuv alohida tiklanmaydi');
  if (db.prepare('SELECT deleted_at FROM clients WHERE id=?').get(p.client_id).deleted_at) throw httpError(400, "Mijoz o'chirilgan — avval mijozni Savatdan tiklang");
  db.prepare('UPDATE payments SET deleted_at=NULL WHERE id=?').run(p.id);
  recomputeClient(p.client_id);
  audit(req, { action: 'restore', entity: 'payment', entity_id: p.id, client_id: p.client_id, summary: `To'lov tiklandi: ${describe(p)}` });
  res.json({ ok: true });
});

module.exports = { router, METHODS };
