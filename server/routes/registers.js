// Kassalar: ro'yxat, boshqarish va har bir kassa bo'yicha hisobot
const express = require('express');
const db = require('../db');
const { now, str, int, httpError, audit } = require('../util');
const { need, can, canAny } = require('./auth');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json(db.prepare(`SELECT r.*, (SELECT group_concat(COALESCE(NULLIF(u.full_name,''), u.username), ', ')
      FROM users u WHERE u.register_id=r.id AND u.active=1) staff
    FROM registers r ORDER BY r.active DESC, r.id`).all());
});

router.post('/', need('registers.manage'), (req, res) => {
  const name = str(req.body.name, 60);
  if (!name) throw httpError(400, 'Kassa nomini kiriting');
  const id = db.prepare('INSERT INTO registers (name,note,created_at) VALUES (?,?,?)').run(name, str(req.body.note, 300), now()).lastInsertRowid;
  audit(req, { action: 'create', entity: 'register', entity_id: id, summary: `Kassa: ${name}` });
  res.json({ id });
});

router.put('/:id', need('registers.manage'), (req, res) => {
  const r = db.prepare('SELECT * FROM registers WHERE id=?').get(req.params.id);
  if (!r) throw httpError(404, 'Topilmadi');
  const name = str(req.body.name, 60) || r.name;
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  db.prepare('UPDATE registers SET name=?, note=?, active=? WHERE id=?').run(name, str(req.body.note, 300), active, r.id);
  audit(req, { action: 'update', entity: 'register', entity_id: r.id, summary: `Kassa: ${r.name}${name !== r.name ? ' → ' + name : ''}${active ? '' : ' (nofaol)'}` });
  res.json({ ok: true });
});

// Hisobot: har bir kassa bo'yicha kirim/chiqim (to'lov turlari kesimida) va sotuvlar
router.get('/report', need('registers.view'), (req, res) => {
  const from = (str(req.query.from) || '0000-00-00') + ' 00:00:00';
  const to = (str(req.query.to) || '9999-12-31') + ' 23:59:59';
  const regs = db.prepare('SELECT id, name, active FROM registers ORDER BY id').all();
  const pays = db.prepare(`SELECT register_id rid, direction, method, COALESCE(SUM(amount),0) total, COUNT(*) n
    FROM payments WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND date BETWEEN ? AND ? GROUP BY register_id, direction, method`).all(from, to);
  const sales = db.prepare(`SELECT register_id rid, COUNT(*) n, COALESCE(SUM(total),0) total
    FROM sales WHERE deleted_at IS NULL AND status='confirmed' AND kind='sale' AND date BETWEEN ? AND ? GROUP BY register_id`).all(from, to);
  const staff = db.prepare(`SELECT register_id rid, group_concat(COALESCE(NULLIF(full_name,''), username), ', ') names
    FROM users WHERE active=1 AND register_id IS NOT NULL GROUP BY register_id`).all();
  const build = (rid, name, active) => {
    const pm = pays.filter((p) => p.rid === rid);
    const by = {};
    for (const p of pm) {
      by[p.method] ||= { in: 0, out: 0 };
      by[p.method][p.direction] += p.total;
    }
    const inT = pm.filter((p) => p.direction === 'in').reduce((a, p) => a + p.total, 0);
    const outT = pm.filter((p) => p.direction === 'out').reduce((a, p) => a + p.total, 0);
    const s = sales.find((x) => x.rid === rid);
    return {
      id: rid, name, active, by_method: by, in_total: inT, out_total: outT, net: inT - outT,
      cash_net: (by.cash ? by.cash.in - by.cash.out : 0),
      sales_n: s ? s.n : 0, sales_total: s ? s.total : 0, payments_n: pm.reduce((a, p) => a + p.n, 0),
      staff: (staff.find((x) => x.rid === rid) || {}).names || '',
    };
  };
  const rows = regs.map((r) => build(r.id, r.name, r.active));
  const unassigned = build(null, '', 1);
  if (unassigned.payments_n || unassigned.sales_n) rows.push({ ...unassigned, name: null });
  res.json(rows);
});

module.exports = { router };
