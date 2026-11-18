// Xarajatlar va kassa smenalari.
// Smena: kassir smenani ochadi (kassadagi boshlang'ich naqd), yopishda naqdni sanab kiritadi.
// Kutilgan naqd = boshlang'ich + naqd kirimlar − naqd chiqimlar − naqd xarajatlar − yetkazib beruvchiga naqd to'lovlar (shu kassa, smena vaqtida).
const express = require('express');
const db = require('../db');
const { now, str, int, normDate, httpError, audit, fmtMoney, registerFor, getSetting } = require('../util');
const { need, can } = require('./auth');

const router = express.Router();
const METHODS = ['cash', 'transfer', 'card', 'other'];

// ================= Xarajatlar =================
router.get('/expense-categories', need('expenses.view', 'expenses.create'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM expense_categories WHERE deleted_at IS NULL ORDER BY id').all());
});
router.post('/expense-categories', need('expenses.delete'), (req, res) => {
  const name = str(req.body.name, 60);
  if (!name) throw httpError(400, 'Nomini kiriting');
  if (db.prepare('SELECT 1 FROM expense_categories WHERE lower(name)=lower(?) AND deleted_at IS NULL').get(name)) throw httpError(400, 'Bunday kategoriya bor');
  const id = Number(db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name).lastInsertRowid);
  audit(req, { action: 'create', entity: 'expense_category', entity_id: id, summary: `Xarajat kategoriyasi: ${name}` });
  res.json({ id });
});
router.delete('/expense-categories/:id', need('expenses.delete'), (req, res) => {
  const c = db.prepare('SELECT * FROM expense_categories WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!c) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE expense_categories SET deleted_at=? WHERE id=?').run(now(), c.id);
  audit(req, { action: 'delete', entity: 'expense_category', entity_id: c.id, summary: `Xarajat kategoriyasi o'chirildi: ${c.name}` });
  res.json({ ok: true });
});

router.get('/expenses', need('expenses.view'), (req, res) => {
  const where = ['e.deleted_at IS NULL'];
  const args = [];
  if (req.query.from) { where.push('e.date>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('e.date<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  if (req.query.category_id) { where.push('e.category_id=?'); args.push(int(req.query.category_id)); }
  if (req.query.register_id) { where.push('e.register_id=?'); args.push(int(req.query.register_id)); }
  const w = where.join(' AND ');
  const rows = db.prepare(`SELECT e.*, c.name category, COALESCE(NULLIF(u.full_name,''), u.username) user_name, r.name register_name
    FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=e.created_by LEFT JOIN registers r ON r.id=e.register_id
    WHERE ${w} ORDER BY e.date DESC, e.id DESC LIMIT 2000`).all(...args);
  const byCat = db.prepare(`SELECT c.name category, COALESCE(SUM(e.amount),0) total, COUNT(*) n FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id
    WHERE ${w} GROUP BY e.category_id ORDER BY total DESC`).all(...args);
  res.json({ rows, byCat, total: byCat.reduce((a, r) => a + r.total, 0) });
});

router.post('/expenses', need('expenses.create'), (req, res) => {
  const amount = int(req.body.amount);
  if (amount <= 0) throw httpError(400, 'Summani kiriting');
  const cat = db.prepare('SELECT * FROM expense_categories WHERE id=? AND deleted_at IS NULL').get(int(req.body.category_id));
  if (!cat) throw httpError(400, 'Kategoriyani tanlang');
  const method = METHODS.includes(req.body.method) ? req.body.method : 'cash';
  const id = Number(db.prepare(`INSERT INTO expenses (category_id,amount,method,date,note,register_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(cat.id, amount, method, normDate(req.body.date), str(req.body.note, 500), registerFor(req, req.body.register_id), req.user.id, now()).lastInsertRowid);
  audit(req, { action: 'create', entity: 'expense', entity_id: id, summary: `Xarajat (${cat.name}): ${fmtMoney(amount)}${req.body.note ? ' — ' + str(req.body.note, 100) : ''}` });
  res.json({ id });
});

router.delete('/expenses/:id', need('expenses.delete'), (req, res) => {
  const e = db.prepare('SELECT * FROM expenses WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!e) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE expenses SET deleted_at=? WHERE id=?').run(now(), e.id);
  audit(req, { action: 'delete', entity: 'expense', entity_id: e.id, summary: `Xarajat o'chirildi: ${fmtMoney(e.amount)}` });
  res.json({ ok: true });
});

// ================= Kassa smenalari =================
// Smena davomidagi pul harakati (shu kassa bo'yicha)
function shiftReport(sh) {
  const to = sh.closed_at || now();
  const rid = sh.register_id;
  const regCond = rid ? 'register_id=?' : 'register_id IS NULL';
  const a = rid ? [rid, sh.opened_at, to] : [sh.opened_at, to];
  const pays = db.prepare(`SELECT direction, method, COALESCE(SUM(amount),0) total, COUNT(*) n FROM payments
    WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND ${regCond} AND date BETWEEN ? AND ? GROUP BY direction, method`).all(...a);
  const sales = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(total-paid_amount),0) debt FROM sales
    WHERE deleted_at IS NULL AND status='confirmed' AND kind='sale' AND ${regCond} AND date BETWEEN ? AND ?`).get(...a);
  const returns = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(r.total),0) total FROM sale_returns r
    WHERE r.deleted_at IS NULL AND r.date BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM payments p WHERE p.return_id=r.id AND p.${regCond.replace('register_id', 'register_id')})`).get(sh.opened_at, to, ...(rid ? [rid] : []));
  const exp = db.prepare(`SELECT method, COALESCE(SUM(amount),0) total, COUNT(*) n FROM expenses
    WHERE deleted_at IS NULL AND ${regCond} AND date BETWEEN ? AND ? GROUP BY method`).all(...a);
  const sup = db.prepare(`SELECT method, COALESCE(SUM(amount),0) total, COUNT(*) n FROM supplier_payments
    WHERE deleted_at IS NULL AND ${regCond} AND date BETWEEN ? AND ? GROUP BY method`).all(...a);
  const byMethod = {};
  for (const m of METHODS) byMethod[m] = { in: 0, out: 0, expense: 0, supplier: 0 };
  for (const p of pays) byMethod[p.method][p.direction] += p.total;
  for (const e of exp) byMethod[e.method].expense += e.total;
  for (const s of sup) byMethod[s.method].supplier += s.total;
  const c = byMethod.cash;
  const expected = sh.opening_cash + c.in - c.out - c.expense - c.supplier;
  return { sales, returns, byMethod, expected };
}

const shiftRow = (id) => db.prepare(`SELECT s.*, r.name register_name, COALESCE(NULLIF(u.full_name,''), u.username) user_name,
    COALESCE(NULLIF(cu.full_name,''), cu.username) closer_name
  FROM shifts s LEFT JOIN registers r ON r.id=s.register_id LEFT JOIN users u ON u.id=s.user_id LEFT JOIN users cu ON cu.id=s.closed_by WHERE s.id=?`).get(id);

// Kassaning ochiq smenasi
router.get('/shifts/current', (req, res) => {
  const rid = int(req.query.register_id) || null;
  const sh = db.prepare(`SELECT id FROM shifts WHERE closed_at IS NULL AND ${rid ? 'register_id=?' : 'register_id IS NULL'} ORDER BY id DESC LIMIT 1`).get(...(rid ? [rid] : []));
  if (!sh) return res.json({ shift: null, required: getSetting('require_shift', '') === '1' });
  const row = shiftRow(sh.id);
  res.json({ shift: { ...row, report: can(req, 'shifts.use') || can(req, 'shifts.view') ? shiftReport(row) : null }, required: getSetting('require_shift', '') === '1' });
});

router.get('/shifts', need('shifts.view', 'shifts.use'), (req, res) => {
  const where = [];
  const args = [];
  if (!can(req, 'shifts.view')) { where.push('s.user_id=?'); args.push(req.user.id); }   // faqat o'z smenalari
  if (req.query.register_id) { where.push('s.register_id=?'); args.push(int(req.query.register_id)); }
  if (req.query.from) { where.push('s.opened_at>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('s.opened_at<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  res.json(db.prepare(`SELECT s.*, r.name register_name, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM shifts s LEFT JOIN registers r ON r.id=s.register_id LEFT JOIN users u ON u.id=s.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT 500`).all(...args));
});

router.get('/shifts/:id', need('shifts.view', 'shifts.use'), (req, res) => {
  const sh = shiftRow(req.params.id);
  if (!sh) throw httpError(404, 'Topilmadi');
  if (!can(req, 'shifts.view') && sh.user_id !== req.user.id) throw httpError(403, "Bu amal uchun ruxsatingiz yo'q");
  res.json({ ...sh, report: shiftReport(sh) });
});

router.post('/shifts/open', need('shifts.use'), (req, res) => {
  const rid = registerFor(req, req.body.register_id);
  if (db.prepare(`SELECT 1 FROM shifts WHERE closed_at IS NULL AND ${rid ? 'register_id=?' : 'register_id IS NULL'}`).get(...(rid ? [rid] : []))) {
    throw httpError(400, 'Bu kassada smena allaqachon ochiq');
  }
  const opening = Math.max(0, int(req.body.opening_cash));
  const id = Number(db.prepare('INSERT INTO shifts (register_id,user_id,opened_at,opening_cash,note) VALUES (?,?,?,?,?)')
    .run(rid, req.user.id, now(), opening, str(req.body.note, 300)).lastInsertRowid);
  audit(req, { action: 'create', entity: 'shift', entity_id: id, summary: `Smena ochildi: kassada ${fmtMoney(opening)}` });
  res.json({ id });
});

router.post('/shifts/:id/close', need('shifts.use'), (req, res) => {
  const sh = shiftRow(req.params.id);
  if (!sh || sh.closed_at) throw httpError(400, 'Smena topilmadi yoki yopilgan');
  if (sh.user_id !== req.user.id && !can(req, 'shifts.view')) throw httpError(403, "Boshqa xodimning smenasini yopa olmaysiz");
  if (req.body.closing_cash === undefined || req.body.closing_cash === '') throw httpError(400, 'Kassadagi naqd pulni sanab kiriting');
  const closing = Math.max(0, int(req.body.closing_cash));
  const t = now();
  const rep = shiftReport({ ...sh, closed_at: t });
  db.prepare('UPDATE shifts SET closed_at=?, closed_by=?, closing_cash=?, expected_cash=?, note=? WHERE id=?')
    .run(t, req.user.id, closing, rep.expected, str(req.body.note, 300) || sh.note, sh.id);
  const diff = closing - rep.expected;
  audit(req, { action: 'close', entity: 'shift', entity_id: sh.id, summary: `Smena yopildi: kutilgan ${fmtMoney(rep.expected)}, sanalgan ${fmtMoney(closing)}${diff ? `, ${diff < 0 ? 'kamomad' : 'ortiqcha'} ${fmtMoney(Math.abs(diff))}` : ''}` });
  res.json({ ...shiftRow(sh.id), report: rep });
});

module.exports = { router, shiftReport };
