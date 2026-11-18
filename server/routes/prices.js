// Narx turlari (chakana, ulgurji, VIP ...): ro'yxat hammaga (kassa narxni tanlashi uchun), boshqarish — "prices.manage"
const express = require('express');
const db = require('../db');
const { now, str, httpError, audit } = require('../util');
const { need } = require('./auth');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json(db.prepare(`SELECT l.id, l.name, (SELECT COUNT(*) FROM clients c WHERE c.price_level_id=l.id AND c.deleted_at IS NULL) clients,
      (SELECT COUNT(*) FROM product_prices p WHERE p.level_id=l.id) products
    FROM price_levels l WHERE l.deleted_at IS NULL ORDER BY l.id`).all());
});

function readName(req, exceptId = 0) {
  const name = str(req.body.name, 40);
  if (!name) throw httpError(400, 'Narx turi nomini kiriting');
  if (db.prepare('SELECT 1 FROM price_levels WHERE lower(name)=lower(?) AND id<>? AND deleted_at IS NULL').get(name, exceptId)) throw httpError(400, 'Bunday narx turi bor');
  return name;
}

router.post('/', need('prices.manage'), (req, res) => {
  const name = readName(req);
  const id = Number(db.prepare('INSERT INTO price_levels (name,created_at) VALUES (?,?)').run(name, now()).lastInsertRowid);
  audit(req, { action: 'create', entity: 'price_level', entity_id: id, summary: `Narx turi: ${name}` });
  res.json({ id });
});

router.put('/:id', need('prices.manage'), (req, res) => {
  const l = db.prepare('SELECT * FROM price_levels WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!l) throw httpError(404, 'Topilmadi');
  const name = readName(req, l.id);
  db.prepare('UPDATE price_levels SET name=? WHERE id=?').run(name, l.id);
  audit(req, { action: 'update', entity: 'price_level', entity_id: l.id, summary: `Narx turi: ${l.name} → ${name}` });
  res.json({ ok: true });
});

// O'chirilganda mijozlar asosiy narxga o'tadi, mahsulotlardagi shu turdagi narxlar o'chadi
router.delete('/:id', need('prices.manage'), (req, res) => {
  const l = db.prepare('SELECT * FROM price_levels WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!l) throw httpError(404, 'Topilmadi');
  db.transaction(() => {
    db.prepare('UPDATE price_levels SET deleted_at=? WHERE id=?').run(now(), l.id);
    db.prepare('UPDATE clients SET price_level_id=NULL WHERE price_level_id=?').run(l.id);
    db.prepare('DELETE FROM product_prices WHERE level_id=?').run(l.id);
  })();
  audit(req, { action: 'delete', entity: 'price_level', entity_id: l.id, summary: `Narx turi o'chirildi: ${l.name}` });
  res.json({ ok: true });
});

// ---------- Aksiyalar (/api/price-levels/promotions/...) ----------
const { int, num } = require('../util');
const { activePromos } = require('../units');
router.get('/promotions/active', (_req, res) => res.json(activePromos(db)));
router.get('/promotions', need('promotions.manage'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM promotions WHERE deleted_at IS NULL ORDER BY active DESC, id DESC').all());
});
function readPromo(b) {
  const p = {
    name: str(b.name, 80), percent: Math.round(num(b.percent) * 100) / 100,
    scope: ['all', 'category', 'product'].includes(b.scope) ? b.scope : 'all', target: str(b.target, 100),
    min_qty: Math.max(0, num(b.min_qty)), active: b.active === 0 || b.active === false ? 0 : 1,
    date_from: /^\d{4}-\d{2}-\d{2}$/.test(b.date_from || '') ? b.date_from : null, date_to: /^\d{4}-\d{2}-\d{2}$/.test(b.date_to || '') ? b.date_to : null,
  };
  if (!p.name) throw httpError(400, 'Aksiya nomini kiriting');
  if (!(p.percent > 0 && p.percent < 100)) throw httpError(400, 'Chegirma foizi 0 dan 100 gacha');
  if (p.scope === 'all') p.target = '';
  if (p.scope !== 'all' && !p.target) throw httpError(400, p.scope === 'category' ? 'Kategoriyani tanlang' : 'Mahsulotni tanlang');
  if (p.scope === 'product' && !db.prepare('SELECT 1 FROM products WHERE id=?').get(int(p.target))) throw httpError(400, 'Mahsulot topilmadi');
  return p;
}
const PF = ['name', 'percent', 'scope', 'target', 'min_qty', 'active', 'date_from', 'date_to'];
router.post('/promotions', need('promotions.manage'), (req, res) => {
  const p = readPromo(req.body);
  const id = Number(db.prepare(`INSERT INTO promotions (${PF.join(',')},created_at) VALUES (${PF.map(() => '?').join(',')},?)`).run(...PF.map((k) => p[k]), now()).lastInsertRowid);
  audit(req, { action: 'create', entity: 'promotion', entity_id: id, summary: `Aksiya: ${p.name} −${p.percent}%` });
  res.json({ id });
});
router.put('/promotions/:id', need('promotions.manage'), (req, res) => {
  const old = db.prepare('SELECT * FROM promotions WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, 'Topilmadi');
  const p = readPromo(req.body);
  db.prepare(`UPDATE promotions SET ${PF.map((k) => k + '=?').join(',')} WHERE id=?`).run(...PF.map((k) => p[k]), old.id);
  audit(req, { action: 'update', entity: 'promotion', entity_id: old.id, summary: `Aksiya: ${p.name} −${p.percent}%${p.active ? '' : ' (o\'chirilgan)'}` });
  res.json({ ok: true });
});
router.delete('/promotions/:id', need('promotions.manage'), (req, res) => {
  const old = db.prepare('SELECT * FROM promotions WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE promotions SET deleted_at=? WHERE id=?').run(now(), old.id);
  audit(req, { action: 'delete', entity: 'promotion', entity_id: old.id, summary: `Aksiya o'chirildi: ${old.name}` });
  res.json({ ok: true });
});

module.exports = { router };
