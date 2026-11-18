// Xodimlar: ish vaqti (keldi / ketdi) va oylik hisoblash, to'lash (xarajat "Ish haqi" sifatida yoziladi).
const express = require('express');
const db = require('../db');
const { now, str, int, num, httpError, audit, fmtMoney, getSetting } = require('../util');
const { need, can } = require('./auth');

const router = express.Router();
const PCS = (a) => `(${a}.qty * CASE WHEN ${a}.unit='karobka' THEN ${a}.box_qty ELSE 1 END)`;
const monthOf = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? v : now().slice(0, 7));
const range = (m) => [m + '-01 00:00:00', m + '-31 23:59:59'];

// ---------- Ish vaqti ----------
router.get('/attendance/me', (req, res) => {
  if (req.user.is_owner) return res.json({ open: null, owner: true });
  const open = db.prepare('SELECT * FROM attendance WHERE user_id=? AND out_at IS NULL ORDER BY id DESC LIMIT 1').get(req.user.id);
  res.json({ open: open || null });
});

router.post('/attendance/check', (req, res) => {
  if (req.user.is_owner) throw httpError(400, 'Egasi uchun ish vaqti yuritilmaydi');
  const t = now();
  const open = db.prepare('SELECT * FROM attendance WHERE user_id=? AND out_at IS NULL ORDER BY id DESC LIMIT 1').get(req.user.id);
  if (req.body.action === 'out') {
    if (!open) throw httpError(400, '"Keldim" belgilanmagan');
    db.prepare('UPDATE attendance SET out_at=? WHERE id=?').run(t, open.id);
    return res.json({ ok: true, out_at: t });
  }
  if (open) throw httpError(400, 'Siz allaqachon "Keldim" belgilagansiz');
  const id = Number(db.prepare('INSERT INTO attendance (user_id,date,in_at) VALUES (?,?,?)').run(req.user.id, t.slice(0, 10), t).lastInsertRowid);
  res.json({ ok: true, id, in_at: t });
});

// Oy bo'yicha: har bir xodimning kunlari va soatlari
function attendanceStats(m) {
  const rows = db.prepare(`SELECT user_id, date, in_at, out_at FROM attendance WHERE date LIKE ? ORDER BY in_at`).all(m + '%');
  const by = new Map();
  for (const r of rows) {
    const s = by.get(r.user_id) || { days: new Set(), hours: 0, rows: [] };
    s.days.add(r.date);
    if (r.out_at) s.hours += (new Date(r.out_at.replace(' ', 'T')) - new Date(r.in_at.replace(' ', 'T'))) / 3.6e6;
    s.rows.push(r);
    by.set(r.user_id, s);
  }
  return by;
}

router.get('/attendance', need('payroll.manage', 'staff.report_all'), (req, res) => {
  const m = monthOf(req.query.month);
  const st = attendanceStats(m);
  const users = db.prepare('SELECT id, username, full_name FROM users WHERE is_owner=0 ORDER BY active DESC, id').all();
  res.json(users.map((u) => { const s = st.get(u.id); return { ...u, days: s ? s.days.size : 0, hours: s ? Math.round(s.hours * 10) / 10 : 0, rows: s ? s.rows : [] }; }));
});

// ---------- Oylik ----------
router.get('/payroll', need('payroll.manage'), (req, res) => {
  const m = monthOf(req.query.month);
  const r = range(m);
  const st = attendanceStats(m);
  const sales = new Map(db.prepare(`SELECT s.created_by uid, COALESCE(SUM(s.total),0) revenue,
      COALESCE(SUM((SELECT SUM(i.cost * ${PCS('i')}) FROM sale_items i WHERE i.sale_id=s.id)),0) cogs
    FROM sales s WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.kind='sale' AND s.date BETWEEN ? AND ? GROUP BY s.created_by`).all(...r).map((x) => [x.uid, x]));
  const deductReturns = getSetting('payroll_deduct_returns', '1') !== '0';
  const returns = new Map();
  if (deductReturns) {
    for (const ret of db.prepare(`SELECT s.created_by uid, COALESCE(SUM(r.total),0) total_ret,
        COALESCE(SUM((SELECT SUM(ri.cost * ${PCS('ri')}) FROM sale_return_items ri WHERE ri.return_id=r.id)),0) cogs_ret
      FROM sale_returns r JOIN sales s ON s.id=r.sale_id
      WHERE r.deleted_at IS NULL AND r.date BETWEEN ? AND ? GROUP BY s.created_by`).all(...r)) {
      returns.set(ret.uid, ret);
    }
  }
  const paid = new Map(db.prepare('SELECT * FROM payroll WHERE month=? AND deleted_at IS NULL').all(m).map((x) => [x.user_id, x]));
  const users = db.prepare(`SELECT u.id, u.username, u.full_name, u.active, u.salary_fixed, u.salary_percent, u.salary_base, ro.name role_name
    FROM users u LEFT JOIN roles ro ON ro.id=u.role_id WHERE u.is_owner=0 ORDER BY u.active DESC, u.id`).all();
  res.json({ month: m, rows: users.map((u) => {
    const sl = sales.get(u.id) || { revenue: 0, cogs: 0 };
    const ret = returns.get(u.id) || { total_ret: 0, cogs_ret: 0 };
    const netRevenue = Math.max(0, sl.revenue - ret.total_ret);
    const netCogs = Math.max(0, sl.cogs - ret.cogs_ret);
    const profit = Math.round(netRevenue - netCogs);
    const base = u.salary_base === 'profit' ? profit : netRevenue;
    const percentPart = Math.round(Math.max(0, base) * (u.salary_percent || 0) / 100);
    const a = st.get(u.id);
    return { ...u, revenue: netRevenue, profit, gross_revenue: sl.revenue, returns: ret.total_ret, days: a ? a.days.size : 0, hours: a ? Math.round(a.hours * 10) / 10 : 0,
      fixed_part: u.salary_fixed || 0, percent_part: percentPart, computed: (u.salary_fixed || 0) + percentPart, paid: paid.get(u.id) || null };
  }) });
});

router.put('/payroll/settings/:userId', need('payroll.manage'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND is_owner=0').get(req.params.userId);
  if (!u) throw httpError(404, 'Xodim topilmadi');
  const fixed = Math.max(0, int(req.body.salary_fixed));
  const pct = Math.max(0, Math.min(100, Math.round(num(req.body.salary_percent) * 100) / 100));
  const base = req.body.salary_base === 'profit' ? 'profit' : 'sales';
  db.prepare('UPDATE users SET salary_fixed=?, salary_percent=?, salary_base=? WHERE id=?').run(fixed, pct, base, u.id);
  audit(req, { action: 'update', entity: 'user', entity_id: u.id, summary: `${u.username}: oylik ${fmtMoney(fixed)} + ${pct}% (${base === 'profit' ? 'foydadan' : 'sotuvdan'})` });
  res.json({ ok: true });
});

// To'lash: oylik + tuzatish (bonus / jarima) → "Ish haqi" xarajati
router.post('/payroll/pay', need('payroll.manage'), (req, res) => {
  const m = monthOf(req.body.month);
  const u = db.prepare('SELECT * FROM users WHERE id=? AND is_owner=0').get(int(req.body.user_id));
  if (!u) throw httpError(404, 'Xodim topilmadi');
  if (db.prepare('SELECT 1 FROM payroll WHERE user_id=? AND month=? AND deleted_at IS NULL').get(u.id, m)) throw httpError(400, 'Bu oy uchun oylik allaqachon to\'langan');
  const fixed = Math.max(0, int(req.body.fixed_part)), pct = Math.max(0, int(req.body.percent_part)), adj = int(req.body.adjustment);
  const total = fixed + pct + adj;
  if (total <= 0) throw httpError(400, 'To\'lanadigan summa noldan katta bo\'lishi kerak');
  const method = ['cash', 'card', 'transfer', 'other'].includes(req.body.method) ? req.body.method : 'cash';
  let cat = db.prepare("SELECT id FROM expense_categories WHERE name='Ish haqi' AND deleted_at IS NULL").get();
  if (!cat) cat = { id: Number(db.prepare("INSERT INTO expense_categories (name) VALUES ('Ish haqi')").run().lastInsertRowid) };
  const t = now();
  const name = u.full_name || u.username;
  let id;
  db.transaction(() => {
    const eid = Number(db.prepare('INSERT INTO expenses (category_id,amount,method,date,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(cat.id, total, method, t, `Ish haqi ${m}: ${name}`, req.user.id, t).lastInsertRowid);
    id = Number(db.prepare('INSERT INTO payroll (user_id,month,fixed_part,percent_part,adjustment,total,expense_id,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(u.id, m, fixed, pct, adj, total, eid, str(req.body.note, 300), req.user.id, t).lastInsertRowid);
  })();
  audit(req, { action: 'create', entity: 'payroll', entity_id: id, summary: `Ish haqi ${m}: ${name} — ${fmtMoney(total)}` });
  res.json({ id, total });
});

router.delete('/payroll/:id', need('payroll.manage'), (req, res) => {
  const p = db.prepare('SELECT * FROM payroll WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!p) throw httpError(404, 'Topilmadi');
  const t = now();
  db.transaction(() => {
    db.prepare('UPDATE payroll SET deleted_at=? WHERE id=?').run(t, p.id);
    if (p.expense_id) db.prepare('UPDATE expenses SET deleted_at=? WHERE id=?').run(t, p.expense_id);
  })();
  audit(req, { action: 'delete', entity: 'payroll', entity_id: p.id, summary: `Ish haqi to'lovi bekor qilindi: ${p.month}, ${fmtMoney(p.total)}` });
  res.json({ ok: true });
});

module.exports = { router };
