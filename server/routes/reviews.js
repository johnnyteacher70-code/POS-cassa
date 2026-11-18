// Mahsulot sharhlari (admin): ko'rish, yashirish/ko'rsatish, o'chirish/tiklash
const express = require('express');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, httpError, audit } = require('../util');
const { clientName } = require('./clients');

const router = express.Router();

const SELECT = `SELECT r.*, p.name product_name, p.volume product_volume, p.image product_image,
  c.type, c.company_name, c.contact_name, c.phone
  FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN clients c ON c.id=r.client_id`;
const row = (r) => ({ ...r, client_name: clientName(r) });

// ?status=all|visible|hidden|deleted  ?product=ID  ?q=matn
router.get('/', need('reviews.manage'), (req, res) => {
  const where = [];
  const args = [];
  const st = str(req.query.status) || 'all';
  if (st === 'deleted') where.push('r.deleted_at IS NOT NULL');
  else {
    where.push('r.deleted_at IS NULL');
    if (st === 'hidden') where.push('r.hidden=1');
    if (st === 'visible') where.push('r.hidden=0');
  }
  if (int(req.query.product)) { where.push('r.product_id=?'); args.push(int(req.query.product)); }
  const q = str(req.query.q, 100);
  if (q) { where.push("(p.name LIKE ? OR r.text LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ?)"); args.push(...Array(4).fill(`%${q}%`)); }
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC, r.id DESC LIMIT 500`).all(...args).map(row);
  const stats = db.prepare(`SELECT COUNT(*) total, SUM(hidden) hidden, ROUND(AVG(CASE WHEN hidden=0 THEN rating END), 1) avg
    FROM product_reviews WHERE deleted_at IS NULL`).get();
  res.json({ rows, stats });
});

function get(id, deleted = false) {
  const r = db.prepare(`${SELECT} WHERE r.id=? AND r.deleted_at IS ${deleted ? 'NOT ' : ''}NULL`).get(id);
  if (!r) throw httpError(404, 'Sharh topilmadi');
  return row(r);
}

router.post('/:id/hide', need('reviews.manage'), (req, res) => {
  const r = get(req.params.id);
  const hidden = req.body.hidden === false || req.body.hidden === 0 ? 0 : 1;
  db.prepare('UPDATE product_reviews SET hidden=? WHERE id=?').run(hidden, r.id);
  audit(req, { action: 'update', entity: 'review', entity_id: r.id, client_id: r.client_id,
    summary: `Sharh ${hidden ? 'yashirildi' : "ko'rsatildi"}: ${r.product_name} (${r.client_name})` });
  res.json({ ok: true });
});

router.delete('/:id', need('reviews.manage'), (req, res) => {
  const r = get(req.params.id);
  db.prepare('UPDATE product_reviews SET deleted_at=? WHERE id=?').run(now(), r.id);
  audit(req, { action: 'delete', entity: 'review', entity_id: r.id, client_id: r.client_id,
    summary: `Sharh o'chirildi: ${r.product_name} (${r.client_name})`, before: { rating: r.rating, text: r.text } });
  res.json({ ok: true });
});

router.post('/:id/restore', need('reviews.manage'), (req, res) => {
  const r = get(req.params.id, true);
  db.prepare('UPDATE product_reviews SET deleted_at=NULL WHERE id=?').run(r.id);
  audit(req, { action: 'restore', entity: 'review', entity_id: r.id, client_id: r.client_id, summary: `Sharh tiklandi: ${r.product_name} (${r.client_name})` });
  res.json({ ok: true });
});

module.exports = { router };
