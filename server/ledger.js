// Mijoz hisob-kitobi:
//   balans = kirimlar - chiqimlar - sotuvlar
//   balans > 0  => mijozning avansi bor (biz unga tovar/pul qarzdormiz)
//   balans < 0  => mijoz bizga qarzdor
// To'lovlar sotuvlarga taqsimlanadi: avval aniq sotuvga ko'rsatilgan to'lovlar,
// qolgani (va umumiy kirimlar/avanslar) eng eski ochiq qarzdan boshlab (FIFO).
const db = require('./db');

function maxDate(a, b) { return a > b ? a : b; }

function recomputeClient(clientId) {
  const sales = db.prepare(`SELECT id, date, total FROM sales
    WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL ORDER BY date, id`).all(clientId);
  const payments = db.prepare(`SELECT id, direction, amount, date, sale_id, created_by FROM payments
    WHERE client_id=? AND deleted_at IS NULL ORDER BY date, id`).all(clientId);

  const out = new Map(sales.map((s) => [s.id, s.total]));   // qolgan qarz
  const lastAlloc = new Map();                               // sale_id -> { date, by } oxirgi to'lov
  const allocs = [];
  const pool = [];

  const allocate = (p, saleId, saleDate, amount) => {
    const date = maxDate(p.date, saleDate);
    allocs.push({ payment_id: p.id, sale_id: saleId, amount, date });
    const prev = lastAlloc.get(saleId);
    if (!prev || date >= prev.date) lastAlloc.set(saleId, { date, by: p.created_by || null });
  };

  const saleById = new Map(sales.map((s) => [s.id, s]));

  // 1) Aniq sotuvga qilingan to'lovlar
  for (const p of payments) {
    if (p.direction !== 'in') continue;
    let rest = p.amount;
    const s = p.sale_id && saleById.get(p.sale_id);
    if (s && out.get(s.id) > 0) {
      const a = Math.min(rest, out.get(s.id));
      out.set(s.id, out.get(s.id) - a);
      allocate(p, s.id, s.date, a);
      rest -= a;
    }
    if (rest > 0) pool.push({ ...p, rest });
  }

  // 2) Qolgan pul (avanslar) FIFO bo'yicha eski qarzlardan boshlab
  const debits = [
    ...sales.filter((s) => out.get(s.id) > 0).map((s) => ({ type: 'sale', id: s.id, date: s.date, rest: out.get(s.id) })),
    ...payments.filter((p) => p.direction === 'out').map((p) => ({ type: 'out', id: p.id, date: p.date, rest: p.amount })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  let pi = 0;
  for (const d of debits) {
    while (d.rest > 0 && pi < pool.length) {
      const p = pool[pi];
      const a = Math.min(d.rest, p.rest);
      d.rest -= a;
      p.rest -= a;
      if (d.type === 'sale') {
        out.set(d.id, d.rest);
        allocate(p, d.id, d.date, a);
      }
      if (p.rest === 0) pi++;
    }
  }

  // 3) Har bir sotuv uchun "oldingi qoldiq" (nakladnoyda ko'rsatiladi)
  const events = [
    ...sales.map((s) => ({ k: 0, id: s.id, date: s.date, delta: -s.total })),
    ...payments.map((p) => ({ k: 1, id: p.id, date: p.date, delta: p.direction === 'in' ? p.amount : -p.amount })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k || a.id - b.id));
  let bal = 0;
  const before = new Map();
  for (const e of events) {
    if (e.k === 0) before.set(e.id, bal);
    bal += e.delta;
  }

  const lastActivity = events.length ? events[events.length - 1].date : null;

  // Ochiq qarz statistikasi (mijozlar ro'yxati uchun)
  let openDebt = 0, openDebts = 0, oldestDebt = null;
  for (const s of sales) {
    const rest = out.get(s.id);
    if (rest > 0) { openDebt += rest; openDebts++; if (!oldestDebt || s.date < oldestDebt) oldestDebt = s.date; }
  }

  // Faqat o'zgargan qatorlar yoziladi: ko'p sotuvli mijozda (masalan "Chakana xaridor") har yangi sotuvda
  // butun tarix qayta yozilmaydi — odatda bitta-ikkita qator o'zgaradi.
  const key = (a) => `${a.payment_id}|${a.sale_id}|${a.amount}|${a.date}`;
  const tx = db.transaction(() => {
    const oldAllocs = db.prepare('SELECT id, payment_id, sale_id, amount, date FROM allocations WHERE client_id=?').all(clientId);
    const want = new Map();
    for (const a of allocs) { const k = key(a); want.set(k, (want.get(k) || 0) + 1); }
    const toDel = [];
    for (const a of oldAllocs) {
      const k = key(a);
      if (want.get(k) > 0) want.set(k, want.get(k) - 1);
      else toDel.push(a.id);
    }
    if (toDel.length > 0) {
      for (let i = 0; i < toDel.length; i += 500) {
        const chunk = toDel.slice(i, i + 500);
        db.prepare(`DELETE FROM allocations WHERE id IN (${chunk.map(() => '?').join(',')})`).run(...chunk);
      }
    }
    const ins = db.prepare('INSERT INTO allocations (client_id,payment_id,sale_id,amount,date) VALUES (?,?,?,?,?)');
    for (const a of allocs) { const k = key(a); if (want.get(k) > 0) { ins.run(clientId, a.payment_id, a.sale_id, a.amount, a.date); want.set(k, want.get(k) - 1); } }

    const cur = new Map(db.prepare(`SELECT id, paid_amount, closed_at, closed_by, was_debt, balance_before FROM sales
      WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL`).all(clientId).map((r) => [r.id, r]));
    const upd = db.prepare('UPDATE sales SET paid_amount=?, closed_at=?, closed_by=?, was_debt=?, balance_before=? WHERE id=?');
    for (const s of sales) {
      const rest = out.get(s.id);
      const last = lastAlloc.get(s.id);
      const closed = rest === 0 ? (last ? last.date : s.date) : null;
      const wasDebt = rest > 0 || (closed && closed > s.date) ? 1 : 0;
      const v = [s.total - rest, closed, rest === 0 && last ? last.by : null, wasDebt, before.get(s.id)];
      const c = cur.get(s.id);
      if (!c || c.paid_amount !== v[0] || c.closed_at !== v[1] || c.closed_by !== v[2] || c.was_debt !== v[3] || c.balance_before !== v[4]) upd.run(...v, s.id);
    }
    // Bekor qilingan / o'chirilgan sotuvlar keshini tozalash
    db.prepare(`UPDATE sales SET paid_amount=0, closed_at=NULL, closed_by=NULL, was_debt=0
      WHERE client_id=? AND (status!='confirmed' OR deleted_at IS NOT NULL)
        AND (paid_amount!=0 OR closed_at IS NOT NULL OR closed_by IS NOT NULL OR was_debt!=0)`).run(clientId);

    db.prepare('UPDATE clients SET balance=?, last_activity=COALESCE(?, last_activity), open_debt=?, open_debts=?, oldest_debt=? WHERE id=?')
      .run(bal, lastActivity, openDebt, openDebts, oldestDebt, clientId);
  });
  tx();
  return bal;
}

function recomputeAll() {
  for (const c of db.prepare('SELECT id FROM clients').all()) recomputeClient(c.id);
}

// Ombor qoldig'i (dona): kirimlar - amaldagi sotuvlar. Qiymat products.stock_pieces da (trigger'lar yangilaydi, schema.js)
function stockMap(ids = null) {
  const rows = ids
    ? db.prepare(`SELECT id, stock_pieces FROM products WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})`).all(...ids)
    : db.prepare('SELECT id, stock_pieces FROM products').all();
  return new Map(rows.map((r) => [r.id, r.stock_pieces]));
}

module.exports = { recomputeClient, recomputeAll, stockMap };
