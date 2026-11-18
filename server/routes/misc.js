const express = require('express');
const db = require('../db');
const { now, str, int, audit, getSetting, fmtMoney, httpError } = require('../util');
const { need, can, canAny } = require('./auth');

const router = express.Router();

const SETTING_KEYS = [
  'company_name', 'company_address', 'company_phone', 'company_inn', 'company_account', 'company_bank', 'company_mfo',
  'director', 'manager_contacts', 'shop_title', 'shop_welcome', 'kp_note', 'invoice_note', 'sell_unit', 'pos_pieces', 'track_stock',
  'industry', 'product_fields', 'receipt_width', 'receipt_note', 'receipt_auto', 'require_shift',
  'usd_enabled', 'usd_rate', 'usd_display_mode', 'currency_rounding', 'allow_usd_payment',
  'track_expiry', 'bonus_enabled', 'bonus_percent', 'bonus_max_pay',
  'theme_preset', 'theme_color', 'theme_mode', 'sidebar_style',
  'allow_negative_stock', 'payroll_deduct_returns',
  'module_pos', 'module_debts', 'module_catalog', 'module_quotes', 'module_purchases',
  'module_transfers', 'module_inventory', 'module_expenses', 'module_shifts', 'module_payroll',
  'module_promotions', 'module_bonus', 'module_reviews',
];
const PRODUCT_FIELDS = ['brand', 'volume', 'size', 'audience', 'colors', 'mxik'];

// --- Bosh sahifa ---
router.get('/dashboard', need('dashboard.view'), (req, res) => {
  const today = now().slice(0, 10);
  const month = now().slice(0, 7);
  const totals = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN balance<0 THEN -balance END),0) receivable,
      COALESCE(SUM(CASE WHEN balance>0 THEN balance END),0) payable,
      COUNT(CASE WHEN balance<0 THEN 1 END) debtors,
      COUNT(CASE WHEN balance>0 THEN 1 END) advance,
      COUNT(*) clients
    FROM clients WHERE deleted_at IS NULL`).get();
  // prefix: 'YYYY-MM-DD' yoki 'YYYY-MM' — sana oralig'i (indeks ishlatiladi)
  const range = (prefix) => [prefix.length === 10 ? prefix + ' 00:00:00' : prefix + '-01 00:00:00', prefix + (prefix.length === 10 ? ' 23:59:59' : '-31 23:59:59')];
  const salesAgg = (prefix) => db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM sales
    WHERE status='confirmed' AND deleted_at IS NULL AND kind='sale' AND date BETWEEN ? AND ?`).get(...range(prefix));
  // Tovar qaytarish (method='return') — pul emas, kassa ko'rsatkichlariga kirmaydi
  const payAgg = (prefix) => db.prepare(`SELECT direction, method, COALESCE(SUM(amount),0) total, COUNT(*) n FROM payments
    WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND date BETWEEN ? AND ? GROUP BY direction, method`).all(...range(prefix));
  const topDebtors = db.prepare(`SELECT id, company_name, contact_name, phone, balance, last_activity FROM clients
    WHERE deleted_at IS NULL AND balance<0 ORDER BY balance LIMIT 10`).all();
  const overdue = db.prepare(`SELECT s.id, s.number, s.date, s.due_date, s.total, s.paid_amount, c.id client_id, c.company_name, c.contact_name, c.phone
    FROM sales s JOIN clients c ON c.id=s.client_id
    WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.total>s.paid_amount AND s.due_date IS NOT NULL AND s.due_date<?
    ORDER BY s.due_date LIMIT 20`).all(now());
  const orders = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status='new' AND deleted_at IS NULL`).get().n;
  const recent = db.prepare(`SELECT id, at, user_name, action, entity, entity_id, client_id, summary FROM audit_log ORDER BY id DESC LIMIT 15`).all();
  // Foyda (tannarx ruxsati bo'lsa): tushum − qaytarish − tannarx; xarajatlar alohida
  let profit = null;
  if (can(req, 'reports.view') || can(req, 'products.cost')) {
    const PCS = (a) => `(${a}.qty * CASE WHEN ${a}.unit='karobka' THEN ${a}.box_qty ELSE 1 END)`;
    const calc = (prefix) => {
      const r = range(prefix);
      const rev = db.prepare(`SELECT COALESCE(SUM(total),0) v FROM sales WHERE status='confirmed' AND deleted_at IS NULL AND kind='sale' AND date BETWEEN ? AND ?`).get(...r).v;
      const cogs = db.prepare(`SELECT COALESCE(SUM(i.cost * ${PCS('i')}),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.kind='sale' AND s.date BETWEEN ? AND ?`).get(...r).v;
      const ret = db.prepare(`SELECT COALESCE(SUM(ri.total),0) t, COALESCE(SUM(ri.cost * ${PCS('ri')}),0) c FROM sale_returns x JOIN sale_return_items ri ON ri.return_id=x.id
        WHERE x.deleted_at IS NULL AND x.date BETWEEN ? AND ?`).get(...r);
      const exp = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ?').get(...r).v;
      const gross = Math.round(rev - ret.t - (cogs - ret.c));
      return { gross, expenses: exp, net: gross - exp, returns: ret.t };
    };
    profit = { today: calc(today), month: calc(month) };
  }
  const stock = db.prepare(`SELECT SUM(CASE WHEN min_stock>0 AND stock_pieces<=min_stock THEN 1 ELSE 0 END) low,
    SUM(CASE WHEN stock_pieces<=0 THEN 1 ELSE 0 END) out FROM products WHERE deleted_at IS NULL AND active=1`).get();
  const shifts = db.prepare(`SELECT s.id, s.opened_at, r.name register_name, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM shifts s LEFT JOIN registers r ON r.id=s.register_id LEFT JOIN users u ON u.id=s.user_id WHERE s.closed_at IS NULL ORDER BY s.id`).all();
  const supplierDebt = db.prepare(`SELECT COALESCE(SUM(total),0) - (SELECT COALESCE(SUM(amount),0) FROM supplier_payments WHERE deleted_at IS NULL) v
    FROM purchases WHERE status='confirmed' AND deleted_at IS NULL`).get().v;
  res.json({
    totals, today: { sales: salesAgg(today), payments: payAgg(today) }, month: { sales: salesAgg(month), payments: payAgg(month) },
    top_debtors: topDebtors, overdue, new_orders: orders, recent,
    profit, low_stock: stock.low || 0, out_of_stock: stock.out || 0, open_shifts: shifts, supplier_debt: supplierDebt,
  });
});

// --- Qarz eslatmalari: muddati o'tgan (yoki N kundan eski) qarzi bor mijozlar, tayyor matn bilan ---
router.get('/debts/reminders', need('debts.view'), (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const t = now();
  const old = new Date(Date.now() - days * 864e5).toLocaleString('sv-SE').slice(0, 19);
  const rows = db.prepare(`SELECT c.id, c.company_name, c.contact_name, c.phone, c.balance, c.reminded_at,
      SUM(s.total - s.paid_amount) overdue, COUNT(*) n, MIN(COALESCE(s.due_date, s.date)) oldest
    FROM sales s JOIN clients c ON c.id=s.client_id
    WHERE s.status='confirmed' AND s.deleted_at IS NULL AND s.total>s.paid_amount AND c.deleted_at IS NULL AND c.balance<0
      AND ((s.due_date IS NOT NULL AND s.due_date<?) OR (s.due_date IS NULL AND s.date<?))
    GROUP BY c.id ORDER BY overdue DESC LIMIT 500`).all(t, old);
  const company = getSetting('company_name', '');
  const phone = getSetting('company_phone', '');
  for (const r of rows) {
    const name = r.contact_name || r.company_name;
    const debt = fmtMoney(-r.balance);
    r.text_uz = `Assalomu alaykum${name ? ', ' + name : ''}! ${company ? company + ' ' : ''}eslatma: sizning ${debt} so'm qarzingiz bor` +
      `${r.oldest ? ` (eng eskisi ${r.oldest.slice(0, 10)} dan)` : ''}. Iltimos, to'lovni amalga oshiring.${phone ? ' Tel: ' + phone : ''}`;
    r.text_ru = `Здравствуйте${name ? ', ' + name : ''}! ${company ? company + ': ' : ''}напоминаем, что у вас задолженность ${debt} сум` +
      `${r.oldest ? ` (самая ранняя с ${r.oldest.slice(0, 10)})` : ''}. Просим произвести оплату.${phone ? ' Тел: ' + phone : ''}`;
  }
  res.json(rows);
});

// --- Qarzlar: ochiq va yopilgan (har bir sotuv bo'yicha) ---
router.get('/debts', need('debts.view'), (req, res) => {
  const tab = req.query.tab === 'closed' ? 'closed' : 'open';
  const where = ["s.status='confirmed'", 's.deleted_at IS NULL'];
  const args = [];
  if (tab === 'open') where.push('s.total>s.paid_amount');
  else where.push('s.was_debt=1 AND s.closed_at IS NOT NULL');
  if (req.query.client_id) { where.push('s.client_id=?'); args.push(int(req.query.client_id)); }
  const dateCol = tab === 'open' ? 's.date' : 's.closed_at';
  if (req.query.from) { where.push(`${dateCol}>=?`); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push(`${dateCol}<=?`); args.push(str(req.query.to) + ' 23:59:59'); }
  if (req.query.overdue === '1') { where.push('s.due_date IS NOT NULL AND s.due_date<?'); args.push(now()); }
  const q = str(req.query.q);
  if (q) {
    const like = `%${q.replace(/\s/g, '%')}%`;
    const d = q.replace(/\D/g, '');
    where.push('(s.number LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ? OR c.inn LIKE ? OR c.phone LIKE ? OR CAST(s.total AS TEXT) LIKE ? OR CAST(s.total-s.paid_amount AS TEXT) LIKE ?)');
    args.push(like, like, like, `%${d || q}%`, `%${d || q}%`, `${d || q}%`, `${d || q}%`);
  }
  if (req.query.user_id) { where.push(tab === 'closed' ? 's.closed_by=?' : 's.created_by=?'); args.push(int(req.query.user_id)); }
  const rows = db.prepare(`SELECT s.id, s.number, s.kind, s.date, s.due_date, s.closed_at, s.total, s.paid_amount, s.total-s.paid_amount rest, s.note,
      c.id client_id, c.company_name, c.contact_name, c.phone, c.inn, c.balance,
      COALESCE(NULLIF(u.full_name,''), u.username) seller_name, COALESCE(NULLIF(u2.full_name,''), u2.username) closer_name,
      CAST(julianday(COALESCE(s.closed_at, ?)) - julianday(s.date) AS INTEGER) days
    FROM sales s JOIN clients c ON c.id=s.client_id LEFT JOIN users u ON u.id=s.created_by LEFT JOIN users u2 ON u2.id=s.closed_by WHERE ${where.join(' AND ')}
    ORDER BY ${tab === 'open' ? 's.date ASC' : 's.closed_at DESC'} LIMIT 2000`).all(now(), ...args);
  // Jami — ko'rsatilgan 2000 qatordan emas, filtrga mos barcha qarzlardan
  const sum = db.prepare(`SELECT COALESCE(SUM(s.total),0) total, COALESCE(SUM(s.total-s.paid_amount),0) rest, COALESCE(SUM(s.paid_amount),0) paid, COUNT(*) n
    FROM sales s JOIN clients c ON c.id=s.client_id WHERE ${where.join(' AND ')}`).get(...args);
  res.json({ rows, sum });
});

// Filtrlar uchun xodimlar ro'yxati
router.get('/staff/list', (_req, res) => {
  res.json(db.prepare(`SELECT id, COALESCE(NULLIF(full_name,''), username) name, active FROM users ORDER BY active DESC, name`).all());
});

// --- Xodimlar hisoboti (sotuvchilar bo'yicha) ---
router.get('/staff/report', (req, res) => {
  const from = (str(req.query.from) || '0000-00-00') + ' 00:00:00';
  const to = (str(req.query.to) || '9999-12-31') + ' 23:59:59';
  let users = db.prepare(`SELECT u.id, u.username, u.full_name, u.phone, u.role, u.role_id, ro.name role_name, ro.is_system role_system,
      u.active, u.register_id, r.name register_name
    FROM users u LEFT JOIN registers r ON r.id=u.register_id LEFT JOIN roles ro ON ro.id=u.role_id ORDER BY u.active DESC, u.id`).all();
  if (!can(req, 'staff.report_all')) users = users.filter((u) => u.id === req.user.id);
  const map = (sql, ...a) => new Map(db.prepare(sql).all(...a).map((r) => [r.uid, r]));
  const sales = map(`SELECT created_by uid, COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(total-paid_amount),0) open_debt
    FROM sales WHERE status='confirmed' AND deleted_at IS NULL AND kind='sale' AND date BETWEEN ? AND ? GROUP BY created_by`, from, to);
  const pays = db.prepare(`SELECT created_by uid, direction, method, COALESCE(SUM(amount),0) total, COUNT(*) n
    FROM payments WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND date BETWEEN ? AND ? GROUP BY created_by, direction, method`).all(from, to);
  const closed = map(`SELECT closed_by uid, COUNT(*) n, COALESCE(SUM(total),0) total FROM sales
    WHERE was_debt=1 AND closed_by IS NOT NULL AND deleted_at IS NULL AND status='confirmed' AND closed_at BETWEEN ? AND ? GROUP BY closed_by`, from, to);
  const orders = map(`SELECT processed_by uid, COUNT(*) n FROM orders WHERE status='confirmed' AND deleted_at IS NULL
    AND processed_at BETWEEN ? AND ? GROUP BY processed_by`, from, to);
  const clients = map(`SELECT created_by uid, COUNT(*) n FROM clients WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? GROUP BY created_by`, from, to);
  res.json(users.map((u) => {
    const pm = pays.filter((p) => p.uid === u.id);
    const by = {};
    for (const p of pm) if (p.direction === 'in') by[p.method] = (by[p.method] || 0) + p.total;
    return {
      ...u,
      sales_n: sales.get(u.id)?.n || 0, sales_total: sales.get(u.id)?.total || 0, open_debt: sales.get(u.id)?.open_debt || 0,
      in_total: pm.filter((p) => p.direction === 'in').reduce((a, p) => a + p.total, 0),
      out_total: pm.filter((p) => p.direction === 'out').reduce((a, p) => a + p.total, 0),
      in_by_method: by,
      closed_n: closed.get(u.id)?.n || 0, closed_total: closed.get(u.id)?.total || 0,
      orders_n: orders.get(u.id)?.n || 0, clients_n: clients.get(u.id)?.n || 0,
    };
  }));
});

// --- Harakatlar tarixi (audit) ---
router.get('/audit', need('audit.view'), (req, res) => {
  const where = ['1=1'];
  const args = [];
  if (req.query.entity) { where.push('entity=?'); args.push(str(req.query.entity)); }
  if (req.query.client_id) { where.push('client_id=?'); args.push(int(req.query.client_id)); }
  if (req.query.user_id) { where.push('user_id=?'); args.push(int(req.query.user_id)); }
  if (req.query.q) { where.push('(summary LIKE ? OR user_name LIKE ?)'); args.push(`%${str(req.query.q)}%`, `%${str(req.query.q)}%`); }
  if (req.query.from) { where.push('at>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('at<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  res.json(db.prepare(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args, Math.min(int(req.query.limit, 300), 3000)));
});

// --- Savat: o'chirilganlar (tiklash mumkin) ---
router.get('/trash', need('trash.view'), (_req, res) => {
  res.json({
    clients: db.prepare('SELECT id, company_name, contact_name, phone, balance, deleted_at FROM clients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(),
    sales: db.prepare(`SELECT s.id, s.number, s.date, s.total, s.deleted_at, c.company_name, c.contact_name FROM sales s JOIN clients c ON c.id=s.client_id
      WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC`).all(),
    payments: db.prepare(`SELECT p.id, p.direction, p.method, p.amount, p.date, p.deleted_at, c.company_name, c.contact_name FROM payments p JOIN clients c ON c.id=p.client_id
      WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`).all(),
    products: db.prepare('SELECT id, name, volume, deleted_at FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(),
    quotes: db.prepare('SELECT id, number, client_name, total, deleted_at FROM quotes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(),
    orders: db.prepare(`SELECT o.id, o.total, o.created_at, o.deleted_at, c.company_name, c.contact_name FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE o.deleted_at IS NOT NULL ORDER BY o.deleted_at DESC`).all(),
    stock: db.prepare(`SELECT m.id, m.qty_pieces, m.date, m.note, m.deleted_at, p.name FROM stock_moves m JOIN products p ON p.id=m.product_id
      WHERE m.deleted_at IS NOT NULL ORDER BY m.deleted_at DESC`).all(),
  });
});

// --- Sozlamalar ---
router.get('/settings', (_req, res) => {
  const business = require('../business');
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, '']));
  for (const r of rows) if (SETTING_KEYS.includes(r.key)) out[r.key] = r.value;
  if (!out.company_name) out.company_name = business.get('brand_name') || "Do'kon boshqaruvi";
  out.sell_unit = ['piece', 'box', 'both'].includes(out.sell_unit) ? out.sell_unit : 'piece';
  out.pos_pieces = out.pos_pieces === '0' ? '0' : '1';
  out.track_stock = out.track_stock === '1' ? '1' : '0';   // ombor qoldig'i (standart: o'chiq)
  // Mahsulot formasidagi ixtiyoriy maydonlar (sozlanmagan bo'lsa — hammasi, eski bazalardagidek)
  out.product_fields = rows.some((r) => r.key === 'product_fields')
    ? out.product_fields.split(',').filter((f) => PRODUCT_FIELDS.includes(f)).join(',') : 'brand,volume,size,audience,colors';
  out.usd_display_mode = ['uzs', 'both', 'usd'].includes(out.usd_display_mode) ? out.usd_display_mode : 'uzs';
  out.currency_rounding = ['1', '100', '500', '1000'].includes(out.currency_rounding) ? out.currency_rounding : '100';
  out.theme_mode = ['light', 'dark', 'auto'].includes(out.theme_mode) ? out.theme_mode : 'light';
  out.theme_preset = out.theme_preset || 'cherry';
  out.theme_color = out.theme_color || '#d94680';
  out.allow_negative_stock = out.allow_negative_stock === '0' ? '0' : '1';
  out.payroll_deduct_returns = out.payroll_deduct_returns === '0' ? '0' : '1';
  for (const m of ['pos', 'debts', 'catalog', 'quotes', 'purchases', 'transfers', 'inventory', 'expenses', 'shifts', 'payroll', 'promotions', 'bonus', 'reviews']) {
    const k = 'module_' + m;
    out[k] = out[k] === '0' ? '0' : '1';
  }
  res.json(out);
});

router.put('/settings', need('settings.edit'), (req, res) => {
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const k of SETTING_KEYS) if (k in req.body) up.run(k, str(req.body[k], 3000));
  audit(req, { action: 'update', entity: 'settings', summary: 'Sozlamalar yangilandi' });
  res.json({ ok: true });
});

module.exports = { router, SETTING_KEYS };
