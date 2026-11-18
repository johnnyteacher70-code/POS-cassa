// Hisobotlar: foyda va zarar, mahsulotlar (eng ko'p sotilgan / foydali, ABC tahlil), xodimlar, pul oqimi, ombor qiymati.
// Tannarx — sotuv paytida pozitsiyaga yozilgan (sale_items.cost); qaytarishlar tushum va tannarxdan ayriladi.
const express = require('express');
const db = require('../db');
const { str } = require('../util');
const { need } = require('./auth');

const router = express.Router();
const { can } = require('./auth');
// Excel eksport: sotuvlar / qarzlar / xarajatlar ro'yxatlari o'z ruxsatlari bilan, qolgani — hisobotlar ruxsati
const EXPORT_PERM = { sales: 'sales.view', debts: 'debts.view', expenses: 'expenses.view' };
router.get('/export', async (req, res, next) => {
  const type = String(req.query.type || '');
  if (!can(req, EXPORT_PERM[type] || 'reports.view')) return next(require('../util').httpError(403, "Bu amal uchun ruxsatingiz yo'q"));
  try { await exportXlsx(req, res, type); } catch (e) { next(e); }
});
router.use(need('reports.view'));

const PCS = (a) => `(${a}.qty * CASE WHEN ${a}.unit='karobka' THEN ${a}.box_qty ELSE 1 END)`;
// Pozitsiyaning chegirmadan keyingi ulushi: pozitsiya summasi × (sotuv summasi / pozitsiyalar yig'indisi)
const NET = `(i.total * 1.0 * s.total / NULLIF((SELECT SUM(x.total) FROM sale_items x WHERE x.sale_id=s.id), 0))`;

function range(req) {
  const from = (str(req.query.from) || '0000-00-00') + ' 00:00:00';
  const to = (str(req.query.to) || '9999-12-31') + ' 23:59:59';
  return [from, to];
}
const SALES = "s.status='confirmed' AND s.deleted_at IS NULL AND s.kind='sale' AND s.date BETWEEN ? AND ?";

router.get('/profit', (req, res) => {
  const r = range(req);
  const sales = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) revenue, COALESCE(SUM(discount),0) discount FROM sales s WHERE ${SALES}`).get(...r);
  const cogs = db.prepare(`SELECT COALESCE(SUM(i.cost * ${PCS('i')}),0) v,
      SUM(CASE WHEN i.product_id IS NOT NULL AND i.cost=0 THEN 1 ELSE 0 END) no_cost
    FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${SALES}`).get(...r);
  const ret = db.prepare(`SELECT COUNT(DISTINCT r.id) n, COALESCE(SUM(ri.total),0) total, COALESCE(SUM(ri.cost * ${PCS('ri')}),0) cogs
    FROM sale_returns r JOIN sale_return_items ri ON ri.return_id=r.id WHERE r.deleted_at IS NULL AND r.date BETWEEN ? AND ?`).get(...r);
  const exp = db.prepare(`SELECT COALESCE(c.name, '—') category, COALESCE(SUM(e.amount),0) total FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id
    WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? GROUP BY e.category_id ORDER BY total DESC`).all(...r);
  const expenses = exp.reduce((a, x) => a + x.total, 0);
  const net = sales.revenue - ret.total;
  const cogsNet = Math.round(cogs.v - ret.cogs);
  const gross = net - cogsNet;
  // Kunlar bo'yicha (grafik uchun): qaytarishlar ham ayiriladi
  const days = db.prepare(`SELECT substr(s.date,1,10) day, COALESCE(SUM(s.total),0) revenue, COUNT(*) n,
      COALESCE(SUM((SELECT SUM(i.cost * ${PCS('i')}) FROM sale_items i WHERE i.sale_id=s.id)),0) cogs,
      COALESCE((SELECT SUM(ri.total) FROM sale_returns rx JOIN sale_return_items ri ON ri.return_id=rx.id
        WHERE rx.deleted_at IS NULL AND substr(rx.date,1,10)=substr(s.date,1,10)),0) returns_day
    FROM sales s WHERE ${SALES} GROUP BY day ORDER BY day`).all(...r);
  // Pul oqimi (kassa): kirim / chiqim turlari bo'yicha
  const pays = db.prepare(`SELECT direction, method, COALESCE(SUM(amount),0) total FROM payments
    WHERE deleted_at IS NULL AND method NOT IN ('return','bonus') AND date BETWEEN ? AND ? GROUP BY direction, method`).all(...r);
  const supplierPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM supplier_payments WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`).get(...r).v;
  const purchases = db.prepare(`SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM purchases WHERE status='confirmed' AND deleted_at IS NULL AND date BETWEEN ? AND ?`).get(...r);
  res.json({
    sales: sales.n, revenue: sales.revenue, discount: sales.discount, returns: ret.total, returns_n: ret.n,
    net_revenue: net, cogs: cogsNet, gross, margin: net > 0 ? Math.round(gross / net * 1000) / 10 : 0,
    expenses, expenses_by_cat: exp, net_profit: gross - expenses, no_cost_items: cogs.no_cost || 0,
    days: days.map((d) => ({ ...d, cogs: Math.round(d.cogs), returns: Math.round(d.returns_day || 0), net_revenue: Math.round(d.revenue - (d.returns_day || 0)), profit: Math.round(d.revenue - (d.returns_day || 0) - d.cogs) })),
    cash: { pays, supplier_paid: supplierPaid, purchases: purchases.v, purchases_n: purchases.n },
  });
});

// Mahsulotlar: tushum, foyda, ABC (A — tushumning 80%, B — keyingi 15%, C — qolgan 5%)
router.get('/products', (req, res) => {
  const r = range(req);
  const rows = db.prepare(`SELECT i.product_id id, MAX(i.name) name, p.unit, p.category, SUM(${PCS('i')}) qty,
      ROUND(SUM(${NET})) revenue, ROUND(SUM(i.cost * ${PCS('i')})) cogs, COUNT(DISTINCT s.id) sales
    FROM sale_items i JOIN sales s ON s.id=i.sale_id LEFT JOIN products p ON p.id=i.product_id
    WHERE ${SALES} AND i.product_id IS NOT NULL GROUP BY i.product_id ORDER BY revenue DESC`).all(...r);
  const total = rows.reduce((a, x) => a + (x.revenue || 0), 0);
  let cum = 0;
  for (const x of rows) {
    x.profit = (x.revenue || 0) - (x.cogs || 0);
    cum += x.revenue || 0;
    const share = total ? cum / total : 1;
    x.abc = share <= 0.8 || x === rows[0] ? 'A' : share <= 0.95 ? 'B' : 'C';
  }
  const cats = new Map();
  for (const x of rows) {
    const c = cats.get(x.category || '') || { category: x.category || '', revenue: 0, profit: 0, qty: 0 };
    c.revenue += x.revenue || 0; c.profit += x.profit; cats.set(x.category || '', c);
  }
  // Umuman sotilmagan faol mahsulotlar (o'lik tovar)
  const dead = db.prepare(`SELECT id, name, stock_pieces stock, cost_price FROM products p WHERE deleted_at IS NULL AND active=1 AND stock_pieces>0
    AND NOT EXISTS (SELECT 1 FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND ${SALES})
    ORDER BY stock_pieces * cost_price DESC LIMIT 50`).all(...r);
  res.json({ rows, total, categories: [...cats.values()].sort((a, b) => b.revenue - a.revenue), dead });
});

// Xodimlar: sotuv, foyda, o'rtacha chek
router.get('/staff', (req, res) => {
  const r = range(req);
  const rows = db.prepare(`SELECT s.created_by id, COALESCE(NULLIF(u.full_name,''), u.username, '—') name, COUNT(*) n, SUM(s.total) revenue,
      ROUND(SUM((SELECT SUM(i.cost * ${PCS('i')}) FROM sale_items i WHERE i.sale_id=s.id))) cogs
    FROM sales s LEFT JOIN users u ON u.id=s.created_by WHERE ${SALES} GROUP BY s.created_by ORDER BY revenue DESC`).all(...r);
  for (const x of rows) { x.profit = x.revenue - (x.cogs || 0); x.avg = x.n ? Math.round(x.revenue / x.n) : 0; }
  res.json(rows);
});

// Ombor qiymati: tannarx va sotuv narxida, kam qolgan va tugagan tovarlar
router.get('/stock', (_req, res) => {
  const v = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN stock_pieces>0 THEN stock_pieces*cost_price END),0) cost_value,
      COALESCE(SUM(CASE WHEN stock_pieces>0 THEN stock_pieces*piece_price END),0) sale_value,
      SUM(CASE WHEN stock_pieces<=0 THEN 1 ELSE 0 END) out_n,
      SUM(CASE WHEN min_stock>0 AND stock_pieces<=min_stock THEN 1 ELSE 0 END) low_n,
      SUM(CASE WHEN cost_price=0 THEN 1 ELSE 0 END) no_cost_n
    FROM products WHERE deleted_at IS NULL AND active=1`).get();
  const low = db.prepare(`SELECT id, name, unit, stock_pieces stock, min_stock, box_qty, pack_name FROM products
    WHERE deleted_at IS NULL AND active=1 AND min_stock>0 AND stock_pieces<=min_stock ORDER BY stock_pieces / min_stock LIMIT 100`).all();
  res.json({ ...v, cost_value: Math.round(v.cost_value), sale_value: Math.round(v.sale_value), low });
});

// Yaroqlilik muddati yaqinlashgan (yoki o'tgan) partiyalar — omborda FIFO bo'yicha hali qolgan miqdori bilan
router.get('/expiry', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const limit = new Date(Date.now() + days * 864e5).toLocaleString('sv-SE').slice(0, 10);
  res.json(require('../batches').expiring(limit));
});

// ---------- Excel ----------
const ExcelJS = require('exceljs');
async function exportXlsx(req, res, type) {
  const r = range(req);
  const ru = req.query.lang === 'ru';
  const L = (uz, rus) => (ru ? rus : uz);
  const wb = new ExcelJS.Workbook();
  const sheet = (name, cols) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([key, header, width, fmt]) => ({ key, header, width: width || 16, style: fmt ? { numFmt: fmt } : {} }));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  };
  const M = '#,##0';
  const period = `${str(req.query.from) || '…'} — ${str(req.query.to) || '…'}`;
  let file = type;
  if (type === 'profit') {
    const P = db.prepare.bind(db);
    const sales = P(`SELECT COUNT(*) n, COALESCE(SUM(total),0) revenue, COALESCE(SUM(discount),0) discount FROM sales s WHERE ${SALES}`).get(...r);
    const cogs = P(`SELECT COALESCE(SUM(i.cost * ${PCS('i')}),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${SALES}`).get(...r).v;
    const ret = P(`SELECT COALESCE(SUM(ri.total),0) t, COALESCE(SUM(ri.cost * ${PCS('ri')}),0) c FROM sale_returns x JOIN sale_return_items ri ON ri.return_id=x.id WHERE x.deleted_at IS NULL AND x.date BETWEEN ? AND ?`).get(...r);
    const exp = P(`SELECT COALESCE(c.name, '—') category, COALESCE(SUM(e.amount),0) total FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? GROUP BY e.category_id ORDER BY total DESC`).all(...r);
    const net = sales.revenue - ret.t, cg = Math.round(cogs - ret.c), gross = net - cg, ex = exp.reduce((a, x) => a + x.total, 0);
    const ws = sheet(L('Foyda va zarar', 'Прибыли и убытки'), [['k', L('Ko\'rsatkich', 'Показатель'), 40], ['v', L('Summa', 'Сумма'), 18, M]]);
    ws.addRow({ k: L('Davr', 'Период') + ': ' + period });
    for (const [k, v] of [[L('Sotuvlar (tushum)', 'Продажи (выручка)'), sales.revenue], [L('shundan chegirmalar', 'в т.ч. скидки'), sales.discount], [L('Qaytarishlar', 'Возвраты'), -ret.t],
      [L('Sof tushum', 'Чистая выручка'), net], [L('Sotilgan tovar tannarxi', 'Себестоимость проданного'), -cg], [L('Yalpi foyda', 'Валовая прибыль'), gross],
      ...exp.map((x) => ['  ' + x.category, -x.total]), [L('Xarajatlar jami', 'Расходы всего'), -ex], [L('Sof foyda', 'Чистая прибыль'), gross - ex]]) ws.addRow({ k, v });
    file = L('foyda', 'pribyl');
  } else if (type === 'products') {
    const rows = db.prepare(`SELECT MAX(i.name) name, p.category, p.barcode, SUM(${PCS('i')}) qty, ROUND(SUM(${NET})) revenue, ROUND(SUM(i.cost * ${PCS('i')})) cogs
      FROM sale_items i JOIN sales s ON s.id=i.sale_id LEFT JOIN products p ON p.id=i.product_id WHERE ${SALES} AND i.product_id IS NOT NULL GROUP BY i.product_id ORDER BY revenue DESC`).all(...r);
    const total = rows.reduce((a, x) => a + (x.revenue || 0), 0); let cum = 0;
    const ws = sheet(L('Mahsulotlar', 'Товары'), [['abc', 'ABC', 6], ['name', L('Mahsulot', 'Товар'), 36], ['category', L('Kategoriya', 'Категория'), 18], ['barcode', L('Shtrix-kod', 'Штрихкод'), 16],
      ['qty', L('Sotildi', 'Продано'), 10], ['revenue', L('Tushum', 'Выручка'), 16, M], ['cogs', L('Tannarx', 'Себестоимость'), 16, M], ['profit', L('Foyda', 'Прибыль'), 16, M], ['share', L('Ulush %', 'Доля %'), 10, '0.0']]);
    for (const x of rows) { cum += x.revenue || 0; const sh = total ? cum / total : 1; ws.addRow({ ...x, abc: sh <= 0.8 || x === rows[0] ? 'A' : sh <= 0.95 ? 'B' : 'C', profit: (x.revenue || 0) - (x.cogs || 0), share: total ? (x.revenue || 0) / total * 100 : 0 }); }
    file = L('mahsulotlar_abc', 'tovary_abc');
  } else if (type === 'staff') {
    const rows = db.prepare(`SELECT COALESCE(NULLIF(u.full_name,''), u.username, '—') name, COUNT(*) n, SUM(s.total) revenue,
      ROUND(SUM((SELECT SUM(i.cost * ${PCS('i')}) FROM sale_items i WHERE i.sale_id=s.id))) cogs FROM sales s LEFT JOIN users u ON u.id=s.created_by WHERE ${SALES} GROUP BY s.created_by ORDER BY revenue DESC`).all(...r);
    const ws = sheet(L('Xodimlar', 'Сотрудники'), [['name', L('Xodim', 'Сотрудник'), 28], ['n', L('Sotuvlar', 'Продажи'), 10], ['revenue', L('Tushum', 'Выручка'), 16, M], ['avg', L("O'rtacha chek", 'Средний чек'), 16, M], ['profit', L('Yalpi foyda', 'Валовая прибыль'), 16, M]]);
    for (const x of rows) ws.addRow({ ...x, avg: x.n ? Math.round(x.revenue / x.n) : 0, profit: x.revenue - (x.cogs || 0) });
    file = L('xodimlar', 'sotrudniki');
  } else if (type === 'stock') {
    const rows = db.prepare(`SELECT name, category, barcode, unit, stock_pieces stock, min_stock, cost_price, piece_price FROM products WHERE deleted_at IS NULL AND active=1 ORDER BY name`).all();
    const ws = sheet(L('Ombor', 'Склад'), [['name', L('Mahsulot', 'Товар'), 36], ['category', L('Kategoriya', 'Категория'), 18], ['barcode', L('Shtrix-kod', 'Штрихкод'), 16], ['unit', L('Birlik', 'Ед.'), 8],
      ['stock', L('Qoldiq', 'Остаток'), 10], ['min_stock', L('Minimal', 'Минимум'), 10], ['cost_price', L('Tannarx', 'Себестоимость'), 14, M], ['piece_price', L('Narx', 'Цена'), 14, M], ['cost_value', L('Qiymati (tannarx)', 'Стоимость (себест.)'), 18, M]]);
    for (const x of rows) ws.addRow({ ...x, cost_price: Math.round(x.cost_price), cost_value: Math.round(Math.max(0, x.stock) * x.cost_price) });
    file = L('ombor', 'sklad');
  } else if (type === 'sales') {
    const rows = db.prepare(`SELECT s.number, s.date, COALESCE(NULLIF(c.company_name,''), c.contact_name, c.phone) client, s.total, s.discount, s.paid_amount,
      COALESCE(NULLIF(u.full_name,''), u.username) seller, s.status FROM sales s JOIN clients c ON c.id=s.client_id LEFT JOIN users u ON u.id=s.created_by
      WHERE s.deleted_at IS NULL AND s.date BETWEEN ? AND ? ORDER BY s.date`).all(...r);
    const ws = sheet(L('Sotuvlar', 'Продажи'), [['number', '№', 16], ['date', L('Sana', 'Дата'), 18], ['client', L('Mijoz', 'Клиент'), 30], ['total', L('Summa', 'Сумма'), 14, M], ['discount', L('Chegirma', 'Скидка'), 12, M],
      ['paid_amount', L("To'langan", 'Оплачено'), 14, M], ['debt', L('Qarz', 'Долг'), 14, M], ['seller', L('Sotuvchi', 'Продавец'), 20], ['status', L('Holati', 'Статус'), 12]]);
    for (const x of rows) ws.addRow({ ...x, debt: x.status === 'confirmed' ? x.total - x.paid_amount : 0, status: x.status === 'confirmed' ? L('amalda', 'действует') : L('bekor', 'отменена') });
    file = L('sotuvlar', 'prodazhi');
  } else if (type === 'debts') {
    const rows = db.prepare(`SELECT COALESCE(NULLIF(company_name,''), contact_name) name, phone, inn, -balance debt, open_debts, oldest_debt, last_activity FROM clients
      WHERE deleted_at IS NULL AND balance<0 ORDER BY balance`).all();
    const ws = sheet(L('Qarzdorlar', 'Должники'), [['name', L('Mijoz', 'Клиент'), 32], ['phone', L('Telefon', 'Телефон'), 16], ['inn', L('INN', 'ИНН'), 14], ['debt', L('Qarz', 'Долг'), 16, M],
      ['open_debts', L('Ochiq hujjatlar', 'Открытых документов'), 12], ['oldest_debt', L('Eng eski qarz', 'Самый старый долг'), 18], ['last_activity', L('Oxirgi harakat', 'Последнее действие'), 18]]);
    for (const x of rows) ws.addRow(x);
    file = L('qarzdorlar', 'dolzhniki');
  } else if (type === 'expenses') {
    const rows = db.prepare(`SELECT e.date, c.name category, e.amount, e.method, e.note, COALESCE(NULLIF(u.full_name,''), u.username) user FROM expenses e
      LEFT JOIN expense_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=e.created_by WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? ORDER BY e.date`).all(...r);
    const ws = sheet(L('Xarajatlar', 'Расходы'), [['date', L('Sana', 'Дата'), 18], ['category', L('Kategoriya', 'Категория'), 22], ['amount', L('Summa', 'Сумма'), 14, M], ['method', L("To'lov turi", 'Способ'), 12], ['note', L('Izoh', 'Примечание'), 30], ['user', L('Kim', 'Кто'), 18]]);
    for (const x of rows) ws.addRow(x);
    file = L('xarajatlar', 'rashody');
  } else {
    throw require('../util').httpError(400, "Noma'lum hisobot turi");
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file}_${new Date().toLocaleString('sv-SE').slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { router };
