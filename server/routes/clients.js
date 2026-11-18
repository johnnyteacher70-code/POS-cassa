const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, digits, normPhone, normText, levenshteinMax, httpError, audit, fmtMoney, nextNumber } = require('../util');
const { currentBranchId } = require('../context');
const { recomputeClient } = require('../ledger');

const router = express.Router();
// Mijoz tanlash oynasi (qidiruv, qisqa ma'lumot) kerak bo'ladigan ruxsatlar: kassa, sotuv, KP, to'lov, buyurtma
const PICK = ['clients.view', 'pos.use', 'sales.create', 'quotes.edit', 'payments.create', 'orders.process'];

const CLIENT_FIELDS = ['type', 'company_name', 'inn', 'contact_name', 'phone', 'phone2', 'account_no', 'bank', 'mfo', 'address', 'note', 'price_level_id', 'register_id'];

// Parol xeshi hech qachon tashqariga chiqmaydi
function safe(c) {
  const { shop_password_hash: h, ...rest } = c;
  return { ...rest, has_shop_password: !!h };
}

function clientName(c) {
  return c.company_name || c.contact_name || c.phone || `#${c.id}`;
}

function readClient(body, old = null) {
  const c = {};
  for (const f of CLIENT_FIELDS) if (f !== 'register_id') c[f] = str(body[f], 500);
  c.register_id = body.register_id !== undefined ? (int(body.register_id) || null) : (old ? old.register_id : null);
  // Narx turi: yuborilmasa — o'zgarmaydi; mavjud bo'lmagan tur — asosiy narx
  if (!('price_level_id' in body)) c.price_level_id = old ? old.price_level_id : null;
  else {
    const lvl = int(body.price_level_id);
    c.price_level_id = lvl && db.prepare('SELECT 1 FROM price_levels WHERE id=? AND deleted_at IS NULL').get(lvl) ? lvl : null;
  }
  c.type = c.type === 'b2c' ? 'b2c' : 'b2b';
  c.phone = normPhone(c.phone);
  c.phone2 = normPhone(c.phone2);
  c.inn = digits(c.inn);
  if (!c.company_name && !c.contact_name) throw httpError(400, 'Kompaniya nomi yoki ism-familiya kiriting');
  return c;
}

// Summalar bo'yicha qidirish uchun: so'ralgan songa mos keladigan sotuv summalari, qolgan qarzlar va to'lovlar.
// Faqat mos qiymatlar olinadi (aniq teng, shu raqamlar bilan boshlanadi yoki ±5%) — hammasi xotiraga yuklanmaydi.
function amountIndex(qd) {
  const m = new Map();
  if (qd.length < 3) return m;
  const n = Number(qd);
  const lo = n >= 1000 ? n / 1.05 : -1;
  const hi = n >= 1000 ? n / 0.95 : -1;
  // "Shu raqamlar bilan boshlanadi" — sonli oraliqlar sifatida (indeks ishlaydi): 901005 → 901005, 9010050..9010059, ...
  const ranges = [[n, n], [lo, hi]];
  for (let k = 1; qd.length + k <= 13; k++) { const p = 10 ** k; ranges.push([n * p, n * p + p - 1]); }
  const cond = (col) => '(' + ranges.map(() => `${col} BETWEEN ? AND ?`).join(' OR ') + ')';
  const args = ranges.flat();
  const add = (r) => { if (!m.has(r.client_id)) m.set(r.client_id, []); m.get(r.client_id).push(r.v); };
  for (const r of db.prepare(`SELECT client_id, total v FROM sales WHERE ${cond('total')} AND status='confirmed' AND deleted_at IS NULL`).all(...args)) add(r);
  for (const r of db.prepare(`SELECT client_id, total-paid_amount v FROM sales WHERE ${cond('(total-paid_amount)')} AND status='confirmed' AND deleted_at IS NULL AND total>paid_amount`).all(...args)) add(r);
  for (const r of db.prepare(`SELECT client_id, amount v FROM payments WHERE ${cond('amount')} AND deleted_at IS NULL`).all(...args)) add(r);
  return m;
}

// Matn qidiruvi uchun mijozning normallashtirilgan so'zlari — keshda (mijoz o'zgarsa updated_at bilan yangilanadi)
const wordsCache = new Map();
function clientWords(c) {
  const k = `${currentBranchId()}:${c.id}`;
  const hit = wordsCache.get(k);
  if (hit && hit.u === c.updated_at) return hit;
  const hay = normText([c.company_name, c.contact_name, c.address, c.note].join(' '));
  const v = { u: c.updated_at, hay, words: hay.split(' ').filter(Boolean) };
  if (wordsCache.size > 200000) wordsCache.clear();
  wordsCache.set(k, v);
  return v;
}

// So'rov bir marta tayyorlanadi (har mijoz uchun qayta emas)
function prepareQuery(q) {
  const qd = digits(q);
  const qn = normText(q);
  return { qd, n: Number(qd), tokens: qn.split(' ').filter((t) => t.length >= 2 && !/^\d+$/.test(t)) };
}

function scoreClient(c, Q, amounts) {
  const { qd, tokens } = Q;
  let score = 0;

  // Raqamlar: telefon, INN, summa
  if (qd.length >= 3) {
    for (const ph of [c.phone, c.phone2]) {
      const pd = digits(ph);
      if (pd && pd.includes(qd)) score = Math.max(score, pd.endsWith(qd) ? 110 : 100);
    }
    if (c.inn && c.inn.includes(qd)) score = Math.max(score, c.inn === qd ? 130 : 100);
    if (c.account_no && digits(c.account_no).includes(qd)) score = Math.max(score, 70);
    const n = Q.n;
    const list = [Math.abs(c.balance), ...(amounts.get(c.id) || [])].filter((x) => x > 0);
    for (const a of list) {
      if (a === n) score = Math.max(score, 120);
      else if (String(a).startsWith(qd) && qd.length >= 3) score = Math.max(score, 60);
      else if (n >= 1000 && Math.abs(a - n) / a <= 0.05) score = Math.max(score, 45);
    }
  }

  // Matn: nom, ism, manzil — taxminiy (xatoli yozilsa ham) qidiruv
  if (tokens.length) {
    const { hay, words } = clientWords(c);
    let textScore = 0;
    let missed = 0;
    for (const t of tokens) {
      if (hay.includes(t)) {
        textScore += words.some((w) => w.startsWith(t)) ? 40 : 25;
        continue;
      }
      const allowed = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;
      let best = 99;
      // Levenshtein faqat imkoni bor so'zlarga (uzunlik farqi ruxsatdan katta bo'lsa — baribir mos kelmaydi)
      if (allowed) {
        for (const w of words) {
          if (w.length + allowed < t.length) continue;
          best = Math.min(best, levenshteinMax(t, w.slice(0, t.length), allowed));
          if (Math.abs(w.length - t.length) <= allowed) best = Math.min(best, levenshteinMax(t, w, allowed));
          if (best === 0) break;
        }
      }
      if (best <= allowed) textScore += 15 - best * 3;
      else missed++;
    }
    if (missed === 0) score = Math.max(score, textScore);
    else if (missed < tokens.length) score = Math.max(score, Math.round(textScore * 0.4));
  }
  return score;
}

router.get('/', need(...PICK), (req, res) => {
  const q = str(req.query.q, 100);
  const filter = str(req.query.filter) || 'all';
  const type = str(req.query.type);
  // Ochiq qarz statistikasi mijoz yozuvining o'zida (open_debt, open_debts, oldest_debt — recomputeClient yangilaydi)
  let rows = db.prepare(`SELECT c.*, r.name register_name FROM clients c LEFT JOIN registers r ON r.id=c.register_id WHERE c.deleted_at IS NULL ORDER BY COALESCE(c.last_activity, c.created_at) DESC`).all().map(safe);

  if (req.query.register_id) {
    const regId = int(req.query.register_id);
    rows = rows.filter((c) => c.register_id === regId || (!c.register_id && (c.contact_name || '').includes('Chakana xaridor')));
  } else if (req.user && req.user.role !== 'admin' && req.user.register_id) {
    rows = rows.filter((c) => !c.register_id || c.register_id === req.user.register_id || (c.contact_name || '').includes('Chakana xaridor'));
  }

  if (type === 'b2b' || type === 'b2c') rows = rows.filter((c) => c.type === type);
  if (filter === 'debtors') rows = rows.filter((c) => c.balance < 0);
  else if (filter === 'advance') rows = rows.filter((c) => c.balance > 0);
  else if (filter === 'zero') rows = rows.filter((c) => c.balance === 0);

  if (q) {
    const amounts = amountIndex(digits(q));
    const Q = prepareQuery(q);
    rows = rows.map((c) => ({ ...c, _score: scoreClient(c, Q, amounts) }))
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score);
  } else if (filter === 'debtors') {
    rows.sort((a, b) => a.balance - b.balance);
  } else if (filter === 'advance') {
    rows.sort((a, b) => b.balance - a.balance);
  }

  const totals = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN balance<0 THEN -balance END),0) receivable,
      COALESCE(SUM(CASE WHEN balance>0 THEN balance END),0) payable,
      COUNT(CASE WHEN balance<0 THEN 1 END) debtors,
      COUNT(CASE WHEN balance>0 THEN 1 END) advance
    FROM clients WHERE deleted_at IS NULL`).get();

  const limit = Math.min(int(req.query.limit, 300), 2000);
  res.json({ rows: rows.slice(0, limit), count: rows.length, totals });
});

// Tez mijoz (POS): qidiruvga yozilgan telefon yoki ism bo'yicha topadi, bo'lmasa darhol yaratadi.
// Telefon har qanday ko'rinishda: 907891234, 90 789 12 34, +998907891234, 998 90 789-12-34, "+998" ikki marta ...
// Bo'sh bo'lsa — "Chakana xaridor" (mijozsiz sotuv uchun bitta umumiy mijoz).
function quickPhone(q) {
  const t = String(q || '').trim();
  if (!/^[+\d\s()\-.]+$/.test(t)) return null;                 // harf bor — telefon emas
  if (digits(t).length < 7) return null;
  // O'zbekiston raqami — +998XXXXXXXXX; boshqa uzunlik (xorijiy / noto'g'ri yozilgan) — qanday yozilgan bo'lsa shunday
  return normPhone(t);
}
router.post('/quick', need('clients.create', 'pos.use'), (req, res) => {
  const q = str(req.body.query, 100);
  const t = now();
  const regId = (req.body && req.body.register_id) ? (int(req.body.register_id) || null) : (req.user && req.user.register_id ? req.user.register_id : null);
  const make = (fields, summary) => {
    const id = db.prepare(`INSERT INTO clients (type,company_name,contact_name,phone,register_id,created_by,created_at,updated_at) VALUES ('b2c','',?,?,?,?,?,?)`)
      .run(fields.contact_name || '', fields.phone || '', regId, req.user.id, t, t).lastInsertRowid;
    audit(req, { action: 'create', entity: 'client', entity_id: id, client_id: id, summary });
    return id;
  };
  let id, created = false;
  if (!q) {
    // Chakana xaridor — bir marta yaratiladi
    const w = db.prepare("SELECT value FROM settings WHERE key='walkin_client_id'").get();
    const ex = w && db.prepare('SELECT id FROM clients WHERE id=? AND deleted_at IS NULL').get(+w.value);
    if (ex) id = ex.id;
    else {
      id = make({ contact_name: 'Chakana xaridor' }, 'Yangi mijoz: Chakana xaridor (mijozsiz sotuvlar)');
      db.prepare("INSERT INTO settings (key,value) VALUES ('walkin_client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(id));
      created = true;
    }
  } else {
    const phone = quickPhone(q);
    const ex = phone
      ? db.prepare("SELECT id FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?) ORDER BY id LIMIT 1").get(phone, phone)
      : db.prepare("SELECT id FROM clients WHERE deleted_at IS NULL AND lower(trim(contact_name))=lower(?) AND company_name='' ORDER BY id LIMIT 1").get(q);
    if (ex) id = ex.id;
    else { id = make(phone ? { phone } : { contact_name: q }, `Yangi mijoz (POS): ${phone || q}`); created = true; }
  }
  res.json({ client: db.prepare('SELECT * FROM clients WHERE id=?').get(id), created });
});

// Mijoz sahifasi. ?brief=1 — faqat mijoz va ochiq qarzlari (POS, mijoz tanlash, to'lov oynasi uchun).
// To'liq sahifa: barcha ochiq qarzlar + oxirgi 500 ta sotuv / to'lov / tarix qadami (ko'p sotuvli mijozda
// — masalan "Chakana xaridor" — megabaytlab ma'lumot yuborilmasligi uchun). Statistika va balanslar butun tarixdan.
const RECENT = 500;
// Qarz haqida eslatildi (qo'ng'iroq / xabar) — sana yoziladi, tarixda ko'rinadi
router.post('/:id/reminded', need('debts.view', 'clients.view'), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!c) throw httpError(404, 'Mijoz topilmadi');
  db.prepare('UPDATE clients SET reminded_at=? WHERE id=?').run(now(), c.id);
  audit(req, { action: 'remind', entity: 'client', entity_id: c.id, client_id: c.id, summary: `Qarz eslatildi${req.body.how ? ' (' + str(req.body.how, 30) + ')' : ''}: ${fmtMoney(-c.balance)}` });
  res.json({ ok: true });
});

// --- Akt sverki (o'zaro hisob-kitob dalolatnomasi): davr boshidagi qoldiq, harakatlar, oxirgi qoldiq ---
// Debet — mijoz qarzini oshiradi (sotuv, unga qaytarilgan pul); kredit — kamaytiradi (to'lov, tovar qaytarish).
router.get('/:id/reconciliation', need('clients.view'), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) throw httpError(404, 'Mijoz topilmadi');
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : '2000-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? req.query.to : now().slice(0, 10);
  const F = from + ' 00:00:00', T = to + ' 23:59:59';
  const S = "client_id=? AND status='confirmed' AND deleted_at IS NULL";
  const P = 'client_id=? AND deleted_at IS NULL';
  const before = db.prepare(`SELECT (SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) FROM payments WHERE ${P} AND date<?)
      - (SELECT COALESCE(SUM(total),0) FROM sales WHERE ${S} AND date<?) v`).get(c.id, F, c.id, F).v;
  const rows = [
    ...db.prepare(`SELECT id, date, number, kind, total FROM sales WHERE ${S} AND date BETWEEN ? AND ?`).all(c.id, F, T).map((x) => ({
      date: x.date, doc: x.number, type: x.kind === 'opening' ? 'opening' : 'sale', debit: x.total, credit: 0, ref: '/sales/' + x.id,
    })),
    ...db.prepare(`SELECT p.id, p.date, p.direction, p.method, p.amount, p.note, s.number sale_number, r.number return_number FROM payments p
      LEFT JOIN sales s ON s.id=p.sale_id LEFT JOIN sale_returns r ON r.id=p.return_id WHERE p.client_id=? AND p.deleted_at IS NULL AND p.date BETWEEN ? AND ?`)
      .all(c.id, F, T).map((x) => ({
        date: x.date, doc: x.return_number || x.sale_number || '', method: x.method,
        type: x.method === 'return' ? 'return' : x.method === 'bonus' ? 'bonus' : x.direction === 'in' ? 'payment' : 'refund',
        debit: x.direction === 'out' ? x.amount : 0, credit: x.direction === 'in' ? x.amount : 0,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.debit ? -1 : 1));
  // Mijozning qarzi musbat ko'rinishda: qarz = −balans
  let bal = -before;
  for (const r of rows) { bal += r.debit - r.credit; r.balance = bal; }
  const debit = rows.reduce((a, r) => a + r.debit, 0), credit = rows.reduce((a, r) => a + r.credit, 0);
  res.json({ client: safe(c), from, to, opening: -before, debit, credit, closing: -before + debit - credit, rows });
});

router.get('/:id', need(...PICK), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) throw httpError(404, 'Mijoz topilmadi');
  const id = c.id;

  if (req.query.brief) {
    const open_sales = db.prepare(`SELECT id, number, kind, date, due_date, total, paid_amount, status FROM sales
      WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL AND (total>paid_amount OR id=?) ORDER BY date LIMIT 1000`).all(id, int(req.query.sale_id));
    return res.json({ client: safe(c), open_sales });
  }
  if (!can(req, 'clients.view')) throw httpError(403, "Bu amal uchun ruxsatingiz yo'q");

  const SALE_COLS = `s.*, COALESCE(NULLIF(u.full_name,''), u.username) seller_name, COALESCE(NULLIF(u2.full_name,''), u2.username) closer_name`;
  const SALE_FROM = 'FROM sales s LEFT JOIN users u ON u.id=s.created_by LEFT JOIN users u2 ON u2.id=s.closed_by';
  const sales = db.prepare(`SELECT ${SALE_COLS} ${SALE_FROM}
    WHERE s.client_id=? AND s.deleted_at IS NULL AND (s.id IN (SELECT id FROM sales WHERE client_id=? AND deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT ${RECENT})
      OR (s.status='confirmed' AND s.total>s.paid_amount))
    ORDER BY s.date DESC, s.id DESC`).all(id, id);
  const payments = db.prepare(`SELECT p.*, s.number sale_number, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM payments p LEFT JOIN sales s ON s.id=p.sale_id LEFT JOIN users u ON u.id=p.created_by
    WHERE p.client_id=? AND p.deleted_at IS NULL ORDER BY p.date DESC, p.id DESC LIMIT ${RECENT}`).all(id);
  // Taqsimotlar faqat ko'rsatiladigan sotuv / to'lovlar uchun, Map orqali guruhlanadi
  const saleIds = new Set(sales.map((x) => x.id)), payIds = new Set(payments.map((x) => x.id));
  const bySale = new Map(), byPay = new Map();
  for (const a of db.prepare('SELECT a.*, s.number sale_number FROM allocations a JOIN sales s ON s.id=a.sale_id WHERE a.client_id=?').all(id)) {
    if (saleIds.has(a.sale_id)) { if (!bySale.has(a.sale_id)) bySale.set(a.sale_id, []); bySale.get(a.sale_id).push(a); }
    if (payIds.has(a.payment_id)) { if (!byPay.has(a.payment_id)) byPay.set(a.payment_id, []); byPay.get(a.payment_id).push(a); }
  }
  for (const p of payments) p.allocations = byPay.get(p.id) || [];
  for (const x of sales) x.allocations = bySale.get(x.id) || [];

  const orders = db.prepare(`SELECT * FROM orders WHERE client_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ${RECENT}`).all(id);
  const quotes = db.prepare(`SELECT * FROM quotes WHERE client_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ${RECENT}`).all(id);
  const auditRows = db.prepare(`SELECT id, at, user_name, action, entity, entity_id, summary FROM audit_log
    WHERE client_id=? ORDER BY id DESC LIMIT 300`).all(id);

  // Tranzaksiyalar tarixi (yangi -> eski), har qadamdan keyingi balans bilan.
  // Balans butun tarix bo'yicha hisoblanadi (yengil ustunlar bilan), javobga oxirgi 500 qadam beriladi.
  const saleInfo = new Map(sales.map((x) => [x.id, x]));
  const payInfo = new Map(payments.map((x) => [x.id, x]));
  const ev = [
    ...db.prepare(`SELECT id, kind, date, number, total FROM sales WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL`).all(id)
      .map((x) => ({ type: x.kind === 'opening' ? 'opening' : 'sale', id: x.id, date: x.date, number: x.number, amount: -x.total, k: 0 })),
    ...db.prepare('SELECT id, direction, method, amount, date FROM payments WHERE client_id=? AND deleted_at IS NULL').all(id)
      .map((x) => ({ type: x.direction === 'in' ? 'payment_in' : 'payment_out', id: x.id, date: x.date, method: x.method, amount: x.direction === 'in' ? x.amount : -x.amount, k: 1 })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k || a.id - b.id));
  let bal = 0;
  for (const e of ev) { bal += e.amount; e.balance = bal; }
  const timeline = ev.slice(-RECENT).reverse();
  for (const e of timeline) {
    const src = e.k === 0 ? saleInfo.get(e.id) : payInfo.get(e.id);
    if (e.k === 0) Object.assign(e, { note: src ? src.note : '', user_name: src ? src.seller_name : '' });
    else Object.assign(e, { note: src ? src.note : '', sale_number: src ? src.sale_number : null, user_name: src ? src.user_name : '' });
  }

  const agg = db.prepare(`SELECT COALESCE(SUM(total),0) total_sales, COUNT(*) n FROM sales WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL`).get(id);
  const pay = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount END),0) total_in, COALESCE(SUM(CASE WHEN direction='out' THEN amount END),0) total_out
    FROM payments WHERE client_id=? AND deleted_at IS NULL`).get(id);
  const stats = {
    total_sales: agg.total_sales, total_in: pay.total_in, total_out: pay.total_out,
    open_debt: c.open_debt, unallocated: Math.max(0, c.balance),
  };

  const returns = db.prepare(`SELECT r.id, r.number, r.date, r.total, r.refund, r.note, s.id sale_id, s.number sale_number FROM sale_returns r
    JOIN sales s ON s.id=r.sale_id WHERE r.client_id=? AND r.deleted_at IS NULL ORDER BY r.date DESC LIMIT ${RECENT}`).all(id);
  const level = c.price_level_id ? db.prepare('SELECT name FROM price_levels WHERE id=?').get(c.price_level_id) : null;
  res.json({ client: { ...safe(c), price_level: level ? level.name : '' }, stats, sales, payments, orders, quotes, returns, timeline, audit: auditRows, truncated: agg.n > RECENT });
});

function warnDuplicates(c, exceptId = 0) {
  const w = [];
  if (c.inn) {
    const d = db.prepare('SELECT id, company_name, contact_name FROM clients WHERE inn=? AND id!=? AND deleted_at IS NULL').get(c.inn, exceptId);
    if (d) w.push(`Bu INN "${clientName(d)}" mijozida ham bor`);
  }
  if (c.phone) {
    const d = db.prepare('SELECT id, company_name, contact_name FROM clients WHERE (phone=? OR phone2=?) AND id!=? AND deleted_at IS NULL').get(c.phone, c.phone, exceptId);
    if (d) w.push(`Bu telefon "${clientName(d)}" mijozida ham bor`);
  }
  return w;
}

router.post('/', need('clients.create'), (req, res) => {
  const c = readClient(req.body);
  if (!c.register_id && req.user && req.user.register_id) c.register_id = req.user.register_id;
  const t = now();
  const r = db.prepare(`INSERT INTO clients (${CLIENT_FIELDS.join(',')},created_by,created_at,updated_at)
    VALUES (${CLIENT_FIELDS.map(() => '?').join(',')},?,?,?)`).run(...CLIENT_FIELDS.map((f) => c[f]), req.user.id, t, t);
  const id = r.lastInsertRowid;
  audit(req, { action: 'create', entity: 'client', entity_id: id, client_id: id, summary: `Yangi mijoz: ${clientName(c)}`, after: c });

  // Boshlang'ich qoldiq: + avans, - qarz
  const opening = int(req.body.opening_balance);
  if (opening && can(req, 'clients.edit')) addOpening(req, id, opening);

  res.json({ id, warnings: warnDuplicates(c, id) });
});

function addOpening(req, clientId, amount) {
  const t = now();
  if (amount > 0) {
    db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,note,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(clientId, 'in', 'other', amount, t, "Boshlang'ich qoldiq (avans)", req.user.id, t, t);
  } else {
    db.prepare(`INSERT INTO sales (number,kind,client_id,date,status,total,note,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nextNumber('sales', 'Q'), 'opening', clientId, t, 'confirmed', -amount, "Boshlang'ich qarz", req.user.id, t, t);
  }
  audit(req, { action: 'create', entity: 'opening', client_id: clientId, summary: `Boshlang'ich qoldiq: ${fmtMoney(amount)}` });
  recomputeClient(clientId);
}

router.put('/:id', need('clients.edit'), (req, res) => {
  const old = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!old) throw httpError(404, 'Mijoz topilmadi');
  const c = readClient(req.body, old);
  db.prepare(`UPDATE clients SET ${CLIENT_FIELDS.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`)
    .run(...CLIENT_FIELDS.map((f) => c[f]), now(), old.id);
  const changed = CLIENT_FIELDS.filter((f) => String(old[f]) !== String(c[f]));
  audit(req, {
    action: 'update', entity: 'client', entity_id: old.id, client_id: old.id,
    summary: `Mijoz tahrirlandi: ${changed.join(', ') || "o'zgarishsiz"}`,
    before: Object.fromEntries(changed.map((f) => [f, old[f]])), after: Object.fromEntries(changed.map((f) => [f, c[f]])),
  });
  res.json({ ok: true, warnings: warnDuplicates(c, old.id) });
});

// Katalog saytiga kirish paroli (bazadagi mijoz uchun admin/sotuvchi beradi)
router.post('/:id/shop-password', need('clients.shop_password'), async (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!c) throw httpError(404, 'Mijoz topilmadi');
  if (!c.phone) throw httpError(400, 'Avval mijozga telefon raqam kiriting');
  const pw = String(req.body.password || '');
  if (pw && pw.length < 4) throw httpError(400, 'Parol kamida 4 belgi');
  db.prepare('UPDATE clients SET shop_password_hash=? WHERE id=?').run(pw ? await bcrypt.hash(pw, 10) : null, c.id);
  db.prepare('DELETE FROM shop_sessions WHERE client_id=?').run(c.id);
  audit(req, { action: 'update', entity: 'client', entity_id: c.id, client_id: c.id, summary: pw ? 'Katalog paroli berildi' : 'Katalog paroli o\'chirildi' });
  res.json({ ok: true });
});

router.delete('/:id', need('clients.delete'), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!c) throw httpError(404, 'Mijoz topilmadi');
  if (c.balance !== 0) throw httpError(400, `Mijozning balansi 0 emas (${fmtMoney(c.balance)}). Avval hisob-kitobni yoping`);
  db.prepare('UPDATE clients SET deleted_at=? WHERE id=?').run(now(), c.id);
  audit(req, { action: 'delete', entity: 'client', entity_id: c.id, client_id: c.id, summary: `Mijoz o'chirildi: ${clientName(c)} (balans ${fmtMoney(c.balance)})`, before: c });
  res.json({ ok: true });
});

router.post('/:id/restore', need('clients.delete'), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!c) throw httpError(404, 'Topilmadi');
  db.prepare('UPDATE clients SET deleted_at=NULL WHERE id=?').run(c.id);
  audit(req, { action: 'restore', entity: 'client', entity_id: c.id, client_id: c.id, summary: `Mijoz tiklandi: ${clientName(c)}` });
  res.json({ ok: true });
});

module.exports = { router, clientName };
