// Qo'shnilar va hamkor do'konlar bilan tovar va pul oldi-berdisi (Tovar qarzdorligi & Barter).
// - Qo'shniga tovar berilganda: ombordan tovar rasman chiqadi (kamomad bo'lmasligi uchun),
//   qo'shni hisobida Tovar qarzi (dona) va Pul ekvivalenti ochiladi.
// - Qarzni yopish:
//     1) Joyiga joy tovar qaytardi: tovar yana omborga kirim bo'ladi, tovar qarzi 0 bo'ladi (kassaga pul aralashmaydi).
//     2) Pulini to'ladi: kassaga pul kiradi, tovar sotilgan deb qayd etiladi.
//     3) Qisman tovar, qisman pul.
// - Qo'shnidan tovar olinganda: teskari jarayon (bizning omborga kiradi, biz qarzdor bo'lib turamiz).

const express = require('express');
const db = require('../db');
const { now, str, int, num, httpError, audit, fmtMoney } = require('../util');
const { need } = require('./auth');
const { pieces } = require('../items');
const { recomputeClient } = require('../ledger');

const router = express.Router();

function getLoan(id) {
  const loan = db.prepare('SELECT * FROM partner_loans WHERE id=? AND deleted_at IS NULL').get(id);
  if (!loan) throw httpError(404, 'Oldi-berdi hujjati topilmadi');
  const items = db.prepare('SELECT * FROM partner_loan_items WHERE loan_id=? ORDER BY id').all(loan.id)
    .map((it) => {
      const left = Math.max(0, Math.round((it.qty_initial - (it.qty_returned_goods || 0) - (it.qty_paid_money || 0)) * 1000) / 1000);
      return {
        ...it,
        qty_left: left,
        sum_left: Math.round(left * (it.price || 0)),
        is_closed: left <= 0,
      };
    });
  const actions = db.prepare(`SELECT a.*, COALESCE(NULLIF(u.full_name,''), u.username) user_name, r.name register_name
    FROM partner_loan_actions a
    LEFT JOIN users u ON u.id=a.created_by
    LEFT JOIN registers r ON r.id=a.register_id
    WHERE a.loan_id=? ORDER BY a.created_at DESC, a.id DESC`).all(loan.id);

  return { ...loan, items, actions };
}

// 1. Ro'yxat
router.get('/', need('partners.view', 'sales.view', 'pos.use'), (req, res) => {
  const where = ['l.deleted_at IS NULL'];
  const args = [];

  if (req.query.status && req.query.status !== 'all') {
    where.push('l.status=?');
    args.push(req.query.status);
  }
  if (req.query.type && req.query.type !== 'all') {
    where.push('l.type=?');
    args.push(req.query.type);
  }
  if (req.query.partner) {
    where.push('LOWER(l.partner_name) LIKE ?');
    args.push('%' + str(req.query.partner).toLowerCase() + '%');
  }
  if (req.query.q) {
    const q = '%' + str(req.query.q).toLowerCase() + '%';
    where.push(`(LOWER(l.partner_name) LIKE ? OR LOWER(l.partner_phone) LIKE ? OR LOWER(l.note) LIKE ? OR EXISTS (
      SELECT 1 FROM partner_loan_items pi WHERE pi.loan_id=l.id AND (LOWER(pi.name) LIKE ? OR LOWER(pi.color) LIKE ?)
    ))`);
    args.push(q, q, q, q, q);
  }

  const loans = db.prepare(`
    SELECT l.*, COALESCE(NULLIF(u.full_name,''), u.username) created_by_name,
      (SELECT COUNT(*) FROM partner_loan_items WHERE loan_id=l.id) items_count,
      (SELECT SUM(qty_initial - qty_returned_goods - qty_paid_money) FROM partner_loan_items WHERE loan_id=l.id) total_qty_left,
      (SELECT SUM((qty_initial - qty_returned_goods - qty_paid_money) * price) FROM partner_loan_items WHERE loan_id=l.id) total_sum_left
    FROM partner_loans l
    LEFT JOIN users u ON u.id=l.created_by
    WHERE ${where.join(' AND ')}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 300
  `).all(...args);

  // Har bir loan uchun qisqa itemlar
  const allLoanIds = loans.map((x) => x.id);
  const itemsMap = new Map();
  if (allLoanIds.length) {
    const items = db.prepare(`SELECT * FROM partner_loan_items WHERE loan_id IN (${allLoanIds.join(',')}) ORDER BY id`).all();
    for (const it of items) {
      if (!itemsMap.has(it.loan_id)) itemsMap.set(it.loan_id, []);
      const left = Math.max(0, Math.round((it.qty_initial - (it.qty_returned_goods || 0) - (it.qty_paid_money || 0)) * 1000) / 1000);
      itemsMap.get(it.loan_id).push({
        ...it,
        qty_left: left,
        sum_left: Math.round(left * (it.price || 0)),
      });
    }
  }

  loans.forEach((l) => {
    l.items = itemsMap.get(l.id) || [];
  });

  // Hamkorlar ro'yxati (autocomplete uchun)
  const partners = db.prepare(`
    SELECT partner_name, partner_phone, COUNT(*) loans_count
    FROM partner_loans WHERE deleted_at IS NULL
    GROUP BY partner_name ORDER BY MAX(created_at) DESC LIMIT 100
  `).all();

  // Statistika
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN l.type='give' AND l.status != 'closed' THEN (pi.qty_initial - pi.qty_returned_goods - pi.qty_paid_money) ELSE 0 END), 0) total_given_left_qty,
      COALESCE(SUM(CASE WHEN l.type='give' AND l.status != 'closed' THEN (pi.qty_initial - pi.qty_returned_goods - pi.qty_paid_money) * pi.price ELSE 0 END), 0) total_given_left_sum,
      COALESCE(SUM(CASE WHEN l.type='take' AND l.status != 'closed' THEN (pi.qty_initial - pi.qty_returned_goods - pi.qty_paid_money) ELSE 0 END), 0) total_taken_left_qty,
      COALESCE(SUM(CASE WHEN l.type='take' AND l.status != 'closed' THEN (pi.qty_initial - pi.qty_returned_goods - pi.qty_paid_money) * pi.price ELSE 0 END), 0) total_taken_left_sum,
      COUNT(DISTINCT CASE WHEN l.status != 'closed' THEN l.partner_name END) active_partners_count,
      COUNT(DISTINCT CASE WHEN l.type='give' AND l.status != 'closed' THEN l.id END) open_give_count,
      COUNT(DISTINCT CASE WHEN l.type='take' AND l.status != 'closed' THEN l.id END) open_take_count,
      COUNT(DISTINCT CASE WHEN l.status = 'closed' THEN l.id END) closed_count,
      COUNT(DISTINCT l.id) total_count
    FROM partner_loans l
    LEFT JOIN partner_loan_items pi ON pi.loan_id=l.id
    WHERE l.deleted_at IS NULL
  `).get();

  res.json({
    loans,
    partners,
    stats: {
      given_qty: Math.round((stats?.total_given_left_qty || 0) * 10) / 10,
      given_sum: Math.round(stats?.total_given_left_sum || 0),
      taken_qty: Math.round((stats?.total_taken_left_qty || 0) * 10) / 10,
      taken_sum: Math.round(stats?.total_taken_left_sum || 0),
      active_partners: stats?.active_partners_count || 0,
      open_give_count: stats?.open_give_count || 0,
      open_take_count: stats?.open_take_count || 0,
      closed_count: stats?.closed_count || 0,
      total_count: stats?.total_count || 0,
    },
  });
});

// 2. Bitta oldi-berdi hujjati
router.get('/:id', need('partners.view', 'sales.view', 'pos.use'), (req, res) => {
  res.json(getLoan(int(req.params.id)));
});

// 3. Yangi oldi-berdi ochish (Qo'shniga berish yoki Qo'shnidan olish)
router.post('/', need('partners.manage', 'sales.create', 'pos.use'), (req, res) => {
  const b = req.body;
  const partnerName = str(b.partner_name, 100).trim();
  if (!partnerName) throw httpError(400, "Qo'shni do'kon nomini kiriting");
  const partnerPhone = str(b.partner_phone, 40).trim();
  const type = b.type === 'take' ? 'take' : 'give';
  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (!rawItems.length) throw httpError(400, 'Kamida bitta mahsulot tanlang');

  const t = now();
  let loanId;

  db.transaction(() => {
    let totalAmount = 0;
    const validatedItems = [];

    for (const it of rawItems) {
      const pid = int(it.product_id);
      const prod = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(pid);
      if (!prod) throw httpError(400, `Mahsulot topilmadi (id: ${pid})`);
      const qty = Math.max(0.001, num(it.qty));
      const price = Math.max(0, num(it.price !== undefined ? it.price : prod.piece_price));
      const color = str(it.color || '', 40);
      const unit = it.unit === 'karobka' ? 'karobka' : 'dona';
      const rowTotal = Math.round(qty * price);
      totalAmount += rowTotal;

      validatedItems.push({
        product: prod,
        product_id: pid,
        name: [prod.name, prod.volume, prod.size].filter(Boolean).join(' '),
        color,
        unit,
        qty,
        price,
        total: rowTotal,
      });
    }

    const note = str(b.note, 500);
    loanId = db.prepare(`
      INSERT INTO partner_loans (partner_name, partner_phone, type, status, total_amount, paid_amount, note, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, 0, ?, ?, ?, ?)
    `).run(partnerName, partnerPhone, type, totalAmount, note, req.user?.id || null, t, t).lastInsertRowid;

    const insItem = db.prepare(`
      INSERT INTO partner_loan_items (loan_id, product_id, name, color, unit, qty_initial, qty_returned_goods, qty_paid_money, price, total)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `);

    const insMove = db.prepare(`
      INSERT INTO stock_moves (product_id, qty_pieces, date, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const vi of validatedItems) {
      insItem.run(loanId, vi.product_id, vi.name, vi.color, vi.unit, vi.qty, vi.price, vi.total);

      // Ombor harakati:
      // give: Biz qo'shniga berdik -> ombordan tovar kamayadi (-qty)
      // take: Biz qo'shnidan oldik -> omborda tovar ko'payadi (+qty)
      const movePieces = vi.unit === 'karobka' ? Math.round(vi.qty * (vi.product?.box_qty || 1)) : vi.qty;
      const sign = type === 'give' ? -1 : 1;
      const colorSuffix = vi.color ? ` (rang: ${vi.color})` : '';
      const moveNote = type === 'give'
        ? `Qo'shniga berildi: ${partnerName} (#${loanId})${colorSuffix}`
        : `Qo'shnidan olindi: ${partnerName} (#${loanId})${colorSuffix}`;

      insMove.run(vi.product_id, sign * movePieces, t, moveNote, req.user?.id || null, t);
    }

    audit(req, {
      action: 'create',
      entity: 'partner_loan',
      entity_id: loanId,
      summary: type === 'give'
        ? `Qo'shniga tovar berildi: ${partnerName} (${fmtMoney(totalAmount)})`
        : `Qo'shnidan tovar olindi: ${partnerName} (${fmtMoney(totalAmount)})`,
    });
  })();

  res.json(getLoan(loanId));
});

// 4. Joyiga joy tovar qaytdi (Yoki biz tovarini qaytardik)
router.post('/:id/return-goods', need('partners.manage', 'sales.create', 'pos.use'), (req, res) => {
  const loanId = int(req.params.id);
  const loan = db.prepare('SELECT * FROM partner_loans WHERE id=? AND deleted_at IS NULL').get(loanId);
  if (!loan) throw httpError(404, 'Oldi-berdi hujjati topilmadi');
  if (loan.status === 'closed') throw httpError(400, 'Bu qarz allaqachon to\'liq yopilgan');

  const itemId = int(req.body.item_id);
  const it = db.prepare('SELECT * FROM partner_loan_items WHERE id=? AND loan_id=?').get(itemId, loan.id);
  if (!it) throw httpError(404, 'Mahsulot qatori topilmadi');

  const left = Math.max(0, Math.round((it.qty_initial - (it.qty_returned_goods || 0) - (it.qty_paid_money || 0)) * 1000) / 1000);
  const qty = Math.min(left, Math.max(0.001, num(req.body.qty)));
  if (qty <= 0) throw httpError(400, 'Qaytariladigan miqdorni kiriting');

  const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
  const t = now();
  const note = str(req.body.note, 255);

  db.transaction(() => {
    // 1. Qaytarilgan tovar miqdorini oshirish
    db.prepare('UPDATE partner_loan_items SET qty_returned_goods = qty_returned_goods + ? WHERE id=?').run(qty, it.id);

    // 2. Ombor harakati:
    // loan.type === 'give' bo'lsa: qo'shni tovar olib keldi -> bizning omborga kirim (+qty)
    // loan.type === 'take' bo'lsa: biz qo'shniga qaytardik -> ombordan chiqim (-qty)
    const movePieces = it.unit === 'karobka' ? Math.round(qty * (prod?.box_qty || 1)) : qty;
    const sign = loan.type === 'give' ? 1 : -1;
    const colorSuffix = it.color ? ` (rang: ${it.color})` : '';
    const moveNote = loan.type === 'give'
      ? `Qo'shni tovar qaytardi (joyiga joy): ${loan.partner_name} (#${loan.id})${colorSuffix}`
      : `Qo'shniga tovar qaytarildi: ${loan.partner_name} (#${loan.id})${colorSuffix}`;

    db.prepare(`
      INSERT INTO stock_moves (product_id, qty_pieces, date, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(it.product_id, sign * movePieces, t, moveNote, req.user?.id || null, t);

    // 3. Amal yozuvi
    db.prepare(`
      INSERT INTO partner_loan_actions (loan_id, item_id, action_type, qty, amount, note, created_by, created_at)
      VALUES (?, ?, 'return_goods', ?, 0, ?, ?, ?)
    `).run(loan.id, it.id, qty, note, req.user?.id || null, t);

    // 4. Hujjat statusini tekshirish
    const allLeft = db.prepare(`
      SELECT SUM(qty_initial - qty_returned_goods - qty_paid_money) left_qty FROM partner_loan_items WHERE loan_id=?
    `).get(loan.id)?.left_qty || 0;

    const newStatus = allLeft <= 0.0001 ? 'closed' : 'partial';
    db.prepare('UPDATE partner_loans SET status=?, updated_at=? WHERE id=?').run(newStatus, t, loan.id);

    audit(req, {
      action: 'update',
      entity: 'partner_loan',
      entity_id: loan.id,
      summary: `Qo'shnidan tovar qaytarib olindi: ${it.name} ${qty} ${it.unit} (${loan.partner_name})`,
    });
  })();

  res.json(getLoan(loan.id));
});

// 5. Pul bilan yopildi (Qo'shni tovar pulini to'ladi)
router.post('/:id/pay-money', need('partners.manage', 'payments.create', 'pos.use'), (req, res) => {
  const loanId = int(req.params.id);
  const loan = db.prepare('SELECT * FROM partner_loans WHERE id=? AND deleted_at IS NULL').get(loanId);
  if (!loan) throw httpError(404, 'Oldi-berdi hujjati topilmadi');
  if (loan.status === 'closed') throw httpError(400, 'Bu qarz allaqachon to\'liq yopilgan');

  const itemId = int(req.body.item_id);
  const it = db.prepare('SELECT * FROM partner_loan_items WHERE id=? AND loan_id=?').get(itemId, loan.id);
  if (!it) throw httpError(404, 'Mahsulot qatori topilmadi');

  const left = Math.max(0, Math.round((it.qty_initial - (it.qty_returned_goods || 0) - (it.qty_paid_money || 0)) * 1000) / 1000);
  const qty = Math.min(left, Math.max(0.001, num(req.body.qty)));
  if (qty <= 0) throw httpError(400, 'To\'lanayotgan miqdorni kiriting');

  const amount = num(req.body.amount || (qty * it.price));
  const registerId = int(req.body.register_id) || req.user?.register_id || null;
  const method = ['cash', 'card', 'transfer', 'other'].includes(req.body.method) ? req.body.method : 'cash';
  const t = now();
  const note = str(req.body.note, 255);

  db.transaction(() => {
    // 1. Tovar qatorini yangilash
    db.prepare('UPDATE partner_loan_items SET qty_paid_money = qty_paid_money + ? WHERE id=?').run(qty, it.id);
    db.prepare('UPDATE partner_loans SET paid_amount = paid_amount + ?, updated_at=? WHERE id=?').run(amount, t, loan.id);

    // 2. Kassaga to'lov kiritish (agar biz bergan tovardan pul kelgan bo'lsa)
    if (loan.type === 'give' && amount > 0) {
      const walkinClientId = db.prepare("SELECT value FROM settings WHERE key='walkin_client_id'").get()?.value || 1;
      const payNote = `Qo'shnidan to'lov: ${loan.partner_name} (#${loan.id}) · ${it.name} (${qty} ${it.unit})`;

      db.prepare(`
        INSERT INTO payments (client_id, register_id, amount, method, direction, date, note, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'in', ?, ?, ?, ?, ?)
      `).run(walkinClientId, registerId, amount, method, t, payNote, req.user?.id || null, t, t);

      recomputeClient(walkinClientId);
    }

    // 3. Amal yozuvi
    db.prepare(`
      INSERT INTO partner_loan_actions (loan_id, item_id, action_type, qty, amount, register_id, note, created_by, created_at)
      VALUES (?, ?, 'pay_money', ?, ?, ?, ?, ?, ?)
    `).run(loan.id, it.id, qty, amount, registerId, note, req.user?.id || null, t);

    // 4. Status
    const allLeft = db.prepare(`
      SELECT SUM(qty_initial - qty_returned_goods - qty_paid_money) left_qty FROM partner_loan_items WHERE loan_id=?
    `).get(loan.id)?.left_qty || 0;

    const newStatus = allLeft <= 0.0001 ? 'closed' : 'partial';
    db.prepare('UPDATE partner_loans SET status=?, updated_at=? WHERE id=?').run(newStatus, t, loan.id);

    audit(req, {
      action: 'update',
      entity: 'partner_loan',
      entity_id: loan.id,
      summary: `Qo'shnidan tovar puli qabul qilindi: ${loan.partner_name} · ${fmtMoney(amount)} (${it.name} ${qty} ${it.unit})`,
    });
  })();

  res.json(getLoan(loan.id));
});

// 6. Solishtirish dalolatnomasi (Akt-sverka)
router.get('/akt/:partnerName', need('partners.view', 'sales.view'), (req, res) => {
  const pName = str(req.params.partnerName).trim();
  const loans = db.prepare(`
    SELECT * FROM partner_loans WHERE LOWER(partner_name)=LOWER(?) AND deleted_at IS NULL ORDER BY created_at
  `).all(pName);

  if (!loans.length) throw httpError(404, 'Ushbu qo\'shni bo\'yicha ma\'lumot topilmadi');

  const lIds = loans.map((x) => x.id);
  const items = db.prepare(`SELECT * FROM partner_loan_items WHERE loan_id IN (${lIds.join(',')}) ORDER BY id`).all();
  const actions = db.prepare(`SELECT * FROM partner_loan_actions WHERE loan_id IN (${lIds.join(',')}) ORDER BY created_at`).all();

  res.json({
    partner_name: pName,
    partner_phone: loans[0].partner_phone || '',
    loans,
    items,
    actions,
  });
});

// 7. O'chirish / bekor qilish
router.delete('/:id', need('partners.manage'), (req, res) => {
  const loanId = int(req.params.id);
  const loan = db.prepare('SELECT * FROM partner_loans WHERE id=? AND deleted_at IS NULL').get(loanId);
  if (!loan) throw httpError(404, 'Hujjat topilmadi');

  // Agar qisman yopilgan bo'lsa, o'chirib bo'lmaydi
  const hasActions = db.prepare('SELECT 1 FROM partner_loan_actions WHERE loan_id=? LIMIT 1').get(loan.id);
  if (hasActions) throw httpError(400, "Qisman qaytarilgan yoki to'langan hujjatni to'g'ridan-to'g'ri o'chirib bo'lmaydi");

  const t = now();
  db.transaction(() => {
    // Ombor harakatlarini bekor qilish (rollback)
    const items = db.prepare('SELECT * FROM partner_loan_items WHERE loan_id=?').all(loan.id);
    for (const it of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      const movePieces = it.unit === 'karobka' ? Math.round(it.qty_initial * (prod?.box_qty || 1)) : it.qty_initial;
      // Dastlabki harakatning teskarisi
      const reverseSign = loan.type === 'give' ? 1 : -1;
      const colorSuffix = it.color ? ` (rang: ${it.color})` : '';
      db.prepare(`
        INSERT INTO stock_moves (product_id, qty_pieces, date, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(it.product_id, reverseSign * movePieces, t, `Oldi-berdi bekor qilindi (#${loan.id})${colorSuffix}`, req.user?.id || null, t);
    }

    db.prepare('UPDATE partner_loans SET deleted_at=?, updated_at=? WHERE id=?').run(t, t, loan.id);
    audit(req, { action: 'delete', entity: 'partner_loan', entity_id: loan.id, summary: `Oldi-berdi bekor qilindi: #${loan.id} ${loan.partner_name}` });
  })();

  res.json({ ok: true });
});

module.exports = { router };
