const express = require('express');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, normDate, normDay, httpError, audit, fmtMoney, nextNumber, currentBranchInfo } = require('../util');
const { readItems, itemsTotal } = require('../items');

const router = express.Router();

function insertItems(quoteId, items) {
  const ins = db.prepare(`INSERT INTO quote_items (quote_id,product_id,name,color,unit,qty,box_qty,price,piece_price,box_price,total,base_unit,pack_name,sku)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const i of items) ins.run(quoteId, i.product_id, i.name, i.color || '', i.unit, i.qty, i.box_qty, i.price, i.piece_price, i.box_price, i.total, i.base_unit, i.pack_name, i.sku || '');
}

function readQuote(b) {
  const clientId = b.client_id ? int(b.client_id) : null;
  const client = clientId ? db.prepare('SELECT * FROM clients WHERE id=?').get(clientId) : null;
  const clientName = str(b.client_name, 300) || (client ? (client.company_name || client.contact_name) : '');
  const items = readItems(b.items);
  const subtotal = itemsTotal(items);
  const discount = Math.min(Math.max(0, int(b.discount || 0)), subtotal);
  const total = subtotal - discount;
  return {
    client_id: client ? client.id : null, client_name: clientName, date: normDate(b.date),
    valid_until: normDay(b.valid_until), note: str(b.note, 2000), items, subtotal, discount, total,
    register_id: int(b.register_id) || null,
  };
}

router.get('/', need('quotes.view'), (req, res) => {
  const q = str(req.query.q);
  const args = [];
  let where = 'q.deleted_at IS NULL';
  if (q) {
    where += ' AND (q.number LIKE ? OR q.client_name LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ?)';
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  res.json(db.prepare(`SELECT q.*, c.company_name, c.contact_name, s.number sale_number,
      (SELECT COUNT(*) FROM quote_items i WHERE i.quote_id=q.id) items_count
    FROM quotes q LEFT JOIN clients c ON c.id=q.client_id LEFT JOIN sales s ON s.id=q.sale_id
    WHERE ${where} ORDER BY q.id DESC LIMIT 500`).all(...args));
});

router.get('/:id', need('quotes.view'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id=?').get(req.params.id);
  if (!q) throw httpError(404, 'KP topilmadi');
  q.items = db.prepare(`SELECT i.*, COALESCE(p.image, '') image,
      COALESCE(NULLIF(i.sku, ''), p.sku, p.barcode, '') sku,
      COALESCE(p.barcode, p.sku, '') barcode
    FROM quote_items i
    LEFT JOIN products p ON p.id=i.product_id
    WHERE i.quote_id=? ORDER BY i.id`).all(q.id);
  q.client = q.client_id ? db.prepare('SELECT * FROM clients WHERE id=?').get(q.client_id) : null;
  q.sale = q.sale_id ? db.prepare('SELECT id, number FROM sales WHERE id=?').get(q.sale_id) : null;
  q.creator = q.created_by ? db.prepare('SELECT id, full_name, username, phone FROM users WHERE id=?').get(q.created_by) : null;
  q.register = q.register_id ? db.prepare('SELECT id, name FROM registers WHERE id=?').get(q.register_id) : null;
  q.register_name = q.register ? q.register.name : '';
  q.subtotal = (q.total || 0) + (q.discount || 0);
  const bi = currentBranchInfo();
  q.branch_name = bi ? bi.name : '';
  res.json(q);
});

router.post('/', need('quotes.edit'), (req, res) => {
  const q = readQuote(req.body);
  const regId = req.user && req.user.register_id ? req.user.register_id : (q.register_id || null);
  const t = now();
  let id;
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO quotes (number,client_id,client_name,date,valid_until,total,discount,register_id,note,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(nextNumber('quotes', 'KP'), q.client_id, q.client_name, q.date, q.valid_until, q.total, q.discount, regId, q.note, req.user.id, t, t);
    id = r.lastInsertRowid;
    insertItems(id, q.items);
  })();
  audit(req, { action: 'create', entity: 'quote', entity_id: id, client_id: q.client_id, summary: `KP yaratildi: ${q.client_name} — ${fmtMoney(q.total)}` });
  res.json({ id });
});

router.put('/:id', need('quotes.edit'), (req, res) => {
  const old = db.prepare('SELECT * FROM quotes WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, 'KP topilmadi');
  const q = readQuote(req.body);
  const regId = q.register_id || old.register_id;
  db.transaction(() => {
    db.prepare('UPDATE quotes SET client_id=?, client_name=?, date=?, valid_until=?, total=?, discount=?, register_id=?, note=?, updated_at=? WHERE id=?')
      .run(q.client_id, q.client_name, q.date, q.valid_until, q.total, q.discount, regId, q.note, now(), old.id);
    db.prepare('DELETE FROM quote_items WHERE quote_id=?').run(old.id);
    insertItems(old.id, q.items);
  })();
  audit(req, { action: 'update', entity: 'quote', entity_id: old.id, client_id: q.client_id, summary: `KP ${old.number} tahrirlandi: ${fmtMoney(old.total)} → ${fmtMoney(q.total)}` });
  res.json({ ok: true });
});

router.delete('/:id', need('quotes.delete'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!q) throw httpError(404, 'KP topilmadi');
  db.prepare('UPDATE quotes SET deleted_at=? WHERE id=?').run(now(), q.id);
  audit(req, { action: 'delete', entity: 'quote', entity_id: q.id, client_id: q.client_id, summary: `KP ${q.number} o'chirildi` });
  res.json({ ok: true });
});

router.post('/:id/restore', need('quotes.delete'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!q) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE quotes SET deleted_at=NULL WHERE id=?').run(q.id);
  audit(req, { action: 'restore', entity: 'quote', entity_id: q.id, client_id: q.client_id, summary: `KP ${q.number} tiklandi` });
  res.json({ ok: true });
});

module.exports = { router };
