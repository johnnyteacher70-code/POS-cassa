// Xarajatlar, kassa smenasi (kutilgan naqd, kamomad), inventarizatsiya, aralash to'lov, foyda hisobotlari.
// node finance_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const sqlite = require(ROOT + '/node_modules/better-sqlite3');
const db = sqlite(DATA + '/branches/1/app.db', { readonly: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function client() {
  let cookie = '';
  return {
    async req(method, p, body) {
      const h = {};
      if (cookie) h.Cookie = cookie;
      let b;
      if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + p, { method, headers: h, body: b });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data };
    },
    get(p) { return this.req('GET', p); }, post(p, b) { return this.req('POST', p, b ?? {}); },
    put(p, b) { return this.req('PUT', p, b); }, del(p) { return this.req('DELETE', p); },
    cookie() { return cookie; },
  };
}
async function login(u, p) { const c = client(); const r = await c.post('/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(u + ': ' + JSON.stringify(r.data)); return c; }
const near = (a, b) => Math.abs(a - b) < 0.01;
const prod = (id) => db.prepare('SELECT * FROM products WHERE id=?').get(id);
const today = new Date().toLocaleString('sv-SE').slice(0, 10);

(async () => {
  const admin = await login('admin', 'admin123');
  // Alohida kassa — boshqa testlarning to'lovlari aralashmasin
  const REG = (await admin.post('/api/registers', { name: 'Moliya test kassasi' })).data.id;

  // ================= E. Xarajatlar =================
  const cats = (await admin.get('/api/expense-categories')).data;
  ok(cats.length >= 5 && cats.some((c) => c.name === 'Ijara'), 'E1 tayyor xarajat kategoriyalari', cats);
  const rent = cats.find((c) => c.name === 'Ijara').id;
  let r = await admin.post('/api/expenses', { category_id: rent, amount: 300000, method: 'cash', note: 'Oktabr ijarasi', register_id: REG, date: '2026-01-05 10:00' });
  ok(r.status === 200, 'E2 xarajat kiritildi', r.data);
  const E1 = r.data.id;
  ok((await admin.post('/api/expenses', { category_id: rent, amount: 0 })).status === 400, 'E3 nol summa — rad');
  ok((await admin.post('/api/expenses', { amount: 100 })).status === 400, 'E4 kategoriyasiz — rad');
  r = await admin.get('/api/expenses?from=2026-01-01&to=2026-01-31');
  ok(r.data.rows.some((e) => e.id === E1) && r.data.byCat.some((c) => c.category === 'Ijara'), 'E5 ro\'yxat va kategoriya bo\'yicha jami');
  const kas = await login('vali', '1234');   // Kassir: xarajat ruxsati yo'q
  ok((await kas.post('/api/expenses', { category_id: rent, amount: 1000 })).status === 403, 'E6 kassir xarajat kirita olmaydi');

  // ================= SH. Kassa smenasi =================
  r = await admin.post('/api/shifts/open', { register_id: REG, opening_cash: 200000 });
  ok(r.status === 200, 'SH1 smena ochildi', r.data);
  const SH = r.data.id;
  ok((await admin.post('/api/shifts/open', { register_id: REG })).status === 400, 'SH2 ikkinchi smena ochib bo\'lmaydi');
  r = await admin.get('/api/shifts/current?register_id=' + REG);
  ok(r.data.shift && r.data.shift.id === SH, 'SH3 joriy smena', r.data);

  const P = (await admin.post('/api/products', { name: 'Moliya mahsuloti', piece_price: 50000, cost_price: 30000 })).data.id;
  await admin.post(`/api/products/${P}/stock`, { qty: 100, cost: 30000 });
  const C = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Moliya mijoz', phone: '+998 93 555 00 11' })).data.id;
  // Aralash to'lov: 100 000 → 60 000 naqd + 40 000 karta
  r = await admin.post('/api/sales', { client_id: C, register_id: REG, items: [{ product_id: P, unit: 'dona', qty: 2 }],
    pay_now: [{ amount: 60000, method: 'cash' }, { amount: 40000, method: 'card' }] });
  ok(r.status === 200 && r.data.summary.debt === 0 && r.data.summary.paid_now === 100000, 'M1 aralash to\'lov (naqd + karta)', r.data);
  const pm = db.prepare('SELECT method, amount FROM payments WHERE sale_id=? ORDER BY id').all(r.data.id);
  ok(pm.length === 2 && pm[0].method === 'cash' && pm[1].method === 'card', 'M2 ikki to\'lov yozildi', pm);
  ok((await kas.post('/api/sales', { client_id: C, items: [{ product_id: P, unit: 'dona', qty: 1 }], pay_now: [{ amount: 20000, method: 'cash' }, { amount: 20000, method: 'card' }] })).status === 403, 'M3 aralash to\'lov ham qarzni yopmasa — qarz ruxsatisiz rad');
  // Qaytarish naqd bilan (−50 000 naqd); 300 000 lik ijara smenadan oldin (yanvarda) — hisoblanmaydi
  const saleId = r.data.id;
  const it = (await admin.get('/api/returns/sale/' + saleId)).data.items[0];
  await admin.post('/api/returns', { sale_id: saleId, register_id: REG, items: [{ sale_item_id: it.id, qty: 1 }], refund: { amount: 50000, method: 'cash' } });
  await admin.post('/api/expenses', { category_id: rent, amount: 10000, method: 'cash', note: 'Smena ichida', register_id: REG });
  // Kutilgan naqd: 200 000 + 60 000 − 50 000 − 10 000 = 200 000
  r = await admin.get('/api/shifts/' + SH);
  ok(r.data.report.expected === 200000 && r.data.report.byMethod.card.in === 40000, 'SH4 kutilgan naqd va karta', r.data.report);
  ok(r.data.report.sales.n === 1 && r.data.report.sales.total === 100000, 'SH5 smenadagi sotuvlar', r.data.report.sales);
  ok((await admin.post(`/api/shifts/${SH}/close`, {})).status === 400, 'SH6 sanalmagan naqd bilan yopib bo\'lmaydi');
  r = await admin.post(`/api/shifts/${SH}/close`, { closing_cash: 195000 });
  ok(r.status === 200 && r.data.expected_cash === 200000 && r.data.closing_cash === 195000, 'SH7 smena yopildi: kamomad 5 000', r.data);
  ok(db.prepare("SELECT summary FROM audit_log WHERE entity='shift' AND entity_id=? ORDER BY id DESC LIMIT 1").get(SH).summary.includes('kamomad'), 'SH8 tarixda kamomad');

  // Smenasiz sotuv taqiqlansa
  await admin.put('/api/settings', { require_shift: '1' });
  ok((await admin.post('/api/sales', { client_id: C, register_id: REG, items: [{ product_id: P, unit: 'dona', qty: 1 }], pay_now: { amount: 50000 } })).status === 400, 'SH9 smena yopiq — sotuv rad');
  await admin.post('/api/shifts/open', { register_id: REG, opening_cash: 0 });
  ok((await admin.post('/api/sales', { client_id: C, register_id: REG, items: [{ product_id: P, unit: 'dona', qty: 1 }], pay_now: { amount: 50000 } })).status === 200, 'SH10 smena ochiq — sotuv bor');
  await admin.put('/api/settings', { require_shift: '' });
  ok((await kas.get('/api/shifts')).status === 200, 'SH11 kassir o\'z smenalarini ko\'radi');

  // ================= I. Inventarizatsiya =================
  const stock0 = prod(P).stock_pieces;
  r = await admin.post('/api/inventory', { note: 'Oktabr reviziyasi' });
  ok(r.status === 200 && /INV\d{4}-0001$/.test(r.data.number), 'I1 inventarizatsiya boshlandi', r.data);
  const INV = r.data.id;
  ok((await admin.post('/api/inventory', {})).status === 400, 'I2 ikkinchisini boshlab bo\'lmaydi');
  r = await admin.get('/api/inventory/' + INV);
  const row = r.data.items.find((x) => x.product_id === P);
  ok(row && near(row.expected, stock0), 'I3 kutilgan qoldiq yozildi', row);
  // Sanash vaqtida 1 dona sotildi — farqqa ta'sir qilmasligi kerak
  await admin.post('/api/sales', { client_id: C, items: [{ product_id: P, unit: 'dona', qty: 1 }], pay_now: { amount: 50000 } });
  // Haqiqatda ombor: (stock0 − 1) − 3 dona yo'qolgan
  await admin.put('/api/inventory/' + INV, { items: [{ product_id: P, counted: stock0 - 1 - 3 }] });
  r = await admin.post(`/api/inventory/${INV}/finish`);
  ok(r.status === 200 && r.data.adjusted === 1 && r.data.shortage === 90000, 'I4 yakunlandi: 3 dona kamomad (90 000 tannarxda)', r.data);
  ok(near(prod(P).stock_pieces, stock0 - 4), 'I5 qoldiq sanalganga tenglashdi', prod(P).stock_pieces);
  ok((await admin.put('/api/inventory/' + INV, { items: [] })).status === 400, 'I6 yakunlanganini o\'zgartirib bo\'lmaydi');
  ok((await kas.get('/api/inventory')).status === 403, 'I7 kassirda ruxsat yo\'q');

  // ================= F. Tez yo'l (to'liq to'langan chakana sotuv) = to'liq qayta hisoblash bilan bir xil =================
  const W = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Tez yol mijozi' })).data.id;
  const FP = (await admin.post('/api/products', { name: 'Tez yol mahsuloti', piece_price: 50000 })).data.id;
  for (const [q, pays] of [[1, [{ amount: 50000, method: 'cash' }]], [2, [{ amount: 60000, method: 'cash' }, { amount: 40000, method: 'card' }]], [1, [{ amount: 50000, method: 'card' }]]]) {
    await new Promise((res) => setTimeout(res, 1100));   // har sotuv alohida soniyada (eng oxirgi hodisa)
    await admin.post('/api/sales', { client_id: W, items: [{ product_id: FP, unit: 'dona', qty: q }], pay_now: pays });
  }
  const snap = () => JSON.stringify({
    a: db.prepare('SELECT payment_id, sale_id, amount, date FROM allocations WHERE client_id=? ORDER BY payment_id').all(W),
    s: db.prepare('SELECT id, paid_amount, closed_at, closed_by, was_debt, balance_before FROM sales WHERE client_id=? ORDER BY id').all(W),
    c: db.prepare('SELECT balance, last_activity, open_debt, open_debts, oldest_debt FROM clients WHERE id=?').get(W),
  });
  const fastState = snap();
  ok(db.prepare('SELECT COUNT(*) n FROM allocations WHERE client_id=?').get(W).n === 4, 'F1 tez yo\'lda taqsimotlar yozildi');
  // To'liq qayta hisoblashni majburlash: 1 so'mlik to'lov qo'shib o'chiriladi (har ikki amal recomputeClient chaqiradi)
  const tmp = (await admin.post('/api/payments', { client_id: W, direction: 'in', method: 'cash', amount: 1, date: '2020-01-01 00:00' })).data.id;
  await admin.del('/api/payments/' + tmp);
  ok(snap() === fastState, 'F2 tez yo\'l natijasi to\'liq qayta hisoblash bilan aynan bir xil', [fastState, snap()]);

  // ================= BN. Bonus (loyallik) =================
  {
    await admin.put('/api/settings', { bonus_enabled: '1', bonus_percent: '5', bonus_max_pay: '50' });
    const BC = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Bonus mijoz', phone: '+998 94 111 22 33' })).data.id;
    const BP = (await admin.post('/api/products', { name: 'Bonus mahsuloti', piece_price: 100000 })).data.id;
    const cb = () => db.prepare('SELECT bonus FROM clients WHERE id=?').get(BC).bonus;
    let b1 = await admin.post('/api/sales', { client_id: BC, items: [{ product_id: BP, unit: 'dona', qty: 2 }], pay_now: { amount: 200000 } });
    ok(b1.data.bonus.earned === 10000 && cb() === 10000, 'BN1 200 000 dan 5% = 10 000 bonus', b1.data.bonus);
    ok((await admin.post('/api/sales', { client_id: BC, items: [{ product_id: BP, unit: 'dona', qty: 1 }], pay_now: [{ amount: 90000, method: 'cash' }, { amount: 20000, method: 'bonus' }] })).status === 400, 'BN2 bonusdan ko\'p — rad');
    const b2 = await admin.post('/api/sales', { client_id: BC, items: [{ product_id: BP, unit: 'dona', qty: 1 }], pay_now: [{ amount: 90000, method: 'cash' }, { amount: 10000, method: 'bonus' }] });
    ok(b2.status === 200 && b2.data.summary.debt === 0 && b2.data.bonus.used === 10000 && b2.data.bonus.earned === 4500 && cb() === 4500, 'BN3 bonus bilan to\'lov; yangi bonus faqat puldan (90 000 × 5%)', b2.data);
    const reg = (await admin.get('/api/registers/report')).data;
    ok(!JSON.stringify(reg).includes('"bonus"'), 'BN4 kassa hisobotida bonus pul emas');
    await admin.post(`/api/sales/${b2.data.id}/cancel`);
    ok(cb() === 10000, 'BN5 sotuv bekor: yig\'ilgani olindi, ishlatilgani qaytdi', cb());
    const it = (await admin.get('/api/returns/sale/' + b1.data.id)).data.items[0];
    await admin.post('/api/returns', { sale_id: b1.data.id, items: [{ sale_item_id: it.id, qty: 1 }] });
    ok(cb() === 5000, 'BN6 qaytarishda bonus ulushi olindi', cb());
    const walk = (await admin.post('/api/clients/quick', { query: '' })).data.client.id;
    const b3 = await admin.post('/api/sales', { client_id: walk, items: [{ product_id: BP, unit: 'dona', qty: 1 }], pay_now: { amount: 100000 } });
    ok(b3.data.bonus.earned === 0, 'BN7 «Chakana xaridor» bonus yig\'maydi', b3.data.bonus);
    await admin.put('/api/settings', { bonus_enabled: '' });
  }

  // ================= RM. Qarz eslatmalari =================
  {
    const RC = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Eslatma mijoz', phone: '+998 95 777 66 55' })).data.id;
    const RP = (await admin.post('/api/products', { name: 'Eslatma mahsuloti', piece_price: 70000 })).data.id;
    await admin.post('/api/sales', { client_id: RC, date: '2026-01-10 10:00', due_date: '2026-01-20', items: [{ product_id: RP, unit: 'dona', qty: 1 }] });
    const rm = (await admin.get('/api/debts/reminders?days=30')).data.find((x) => x.id === RC);
    ok(rm && rm.overdue === 70000 && /70 000/.test(rm.text_uz) && /Здравствуйте/.test(rm.text_ru), 'RM1 eslatma ro\'yxati va tayyor matn', rm);
    ok((await admin.post(`/api/clients/${RC}/reminded`, { how: 'telefon' })).status === 200 && db.prepare('SELECT reminded_at FROM clients WHERE id=?').get(RC).reminded_at, 'RM2 eslatildi belgisi');
  }

  // ================= PY. Ish vaqti va oylik =================
  {
    const pr = await admin.post('/api/auth/users', { username: 'oylikchi', password: '1234', role: 'seller' });
    const PU = pr.data.id;
    const ps = await login('oylikchi', '1234');
    ok((await ps.post('/api/attendance/check', { action: 'in' })).status === 200, 'PY1 keldim');
    ok((await ps.post('/api/attendance/check', { action: 'in' })).status === 400, 'PY2 ikki marta keldim — rad');
    ok((await ps.get('/api/attendance/me')).data.open, 'PY3 ishda');
    ok((await ps.post('/api/attendance/check', { action: 'out' })).status === 200, 'PY4 ketdim');
    const PP = (await admin.post('/api/products', { name: 'Oylik mahsuloti', piece_price: 100000, cost_price: 60000 })).data.id;
    const PC = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Oylik mijozi', phone: '+998 97 111 00 99' })).data.id;
    await ps.post('/api/sales', { client_id: PC, items: [{ product_id: PP, unit: 'dona', qty: 5 }], pay_now: { amount: 500000 } });
    await admin.req('PUT', '/api/payroll/settings/' + PU, { salary_fixed: 2000000, salary_percent: 10, salary_base: 'profit' });
    const m = new Date().toLocaleString('sv-SE').slice(0, 7);
    const row = (await admin.get('/api/payroll?month=' + m)).data.rows.find((x) => x.id === PU);
    ok(row && row.days === 1 && row.revenue === 500000 && row.profit === 200000 && row.percent_part === 20000 && row.computed === 2020000, 'PY5 oylik: 2 000 000 + 10% foydadan (200 000)', row);
    const pay = await admin.post('/api/payroll/pay', { user_id: PU, month: m, fixed_part: 2000000, percent_part: 20000, adjustment: -20000 });
    ok(pay.status === 200 && pay.data.total === 2000000, 'PY6 to\'landi (jarima bilan)', pay.data);
    ok(db.prepare("SELECT e.amount FROM expenses e JOIN payroll p ON p.expense_id=e.id WHERE p.id=?").get(pay.data.id).amount === 2000000, 'PY7 ish haqi xarajati yozildi');
    ok((await admin.post('/api/payroll/pay', { user_id: PU, month: m, fixed_part: 1 })).status === 400, 'PY8 bir oyda ikki marta to\'lab bo\'lmaydi');
    ok((await ps.get('/api/payroll')).status === 403, 'PY9 sotuvchi oylik bo\'limini ko\'rmaydi');
  }

  // ================= EX. Excel eksport =================
  {
    const ExcelJS = require(ROOT + '/node_modules/exceljs');
    for (const t of ['profit', 'products', 'staff', 'stock', 'sales', 'debts', 'expenses']) {
      const res = await fetch(B + `/api/reports/export?type=${t}&from=2000-01-01&to=2099-12-31`, { headers: { Cookie: admin.cookie() } });
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
      ok(res.status === 200 && wb.worksheets[0].rowCount >= 2, 'EX ' + t + ' — Excel fayl', [res.status, wb.worksheets[0] && wb.worksheets[0].rowCount]);
    }
    ok((await fetch(B + '/api/reports/export?type=profit', { headers: { Cookie: kas.cookie() } })).status === 403, 'EX kassirga hisobot eksporti yo\'q');
  }

  // ================= AK. Akt sverki =================
  {
    const AC = (await admin.post('/api/clients', { type: 'b2b', company_name: 'Akt MChJ', opening_balance: -100000 })).data.id;
    const AP = (await admin.post('/api/products', { name: 'Akt mahsuloti', piece_price: 50000 })).data.id;
    await admin.post('/api/sales', { client_id: AC, items: [{ product_id: AP, unit: 'dona', qty: 2 }], pay_now: { amount: 30000 } });   // 100 000, 30 000 to'landi
    await admin.post('/api/payments', { client_id: AC, direction: 'in', method: 'transfer', amount: 50000 });
    const ak = (await admin.get(`/api/clients/${AC}/reconciliation?from=2000-01-01&to=2099-12-31`)).data;
    ok(ak.opening === 0 && ak.debit === 200000 && ak.credit === 80000 && ak.closing === 120000 && ak.rows[ak.rows.length - 1].balance === 120000, 'AK1 akt: aylanma va oxirgi qoldiq', ak);
    const ak2 = (await admin.get(`/api/clients/${AC}/reconciliation?from=2099-01-01&to=2099-12-31`)).data;
    ok(ak2.opening === 120000 && ak2.rows.length === 0 && ak2.closing === 120000, 'AK2 keyingi davr: boshidagi qoldiq o\'tdi', ak2);
    ok((await kas.get(`/api/clients/${AC}/reconciliation`)).status === 403, 'AK3 ruxsatsiz — yo\'q');
  }

  // ================= R. Hisobotlar =================
  r = await admin.get(`/api/reports/profit?from=${today}&to=${today}`);
  const pr = r.data;
  ok(r.status === 200 && pr.revenue > 0 && pr.cogs > 0 && pr.gross === pr.net_revenue - pr.cogs && pr.net_profit === pr.gross - pr.expenses, 'R1 foyda: tushum − tannarx − xarajat', pr);
  ok(pr.returns >= 50000 && pr.expenses >= 10000, 'R2 qaytarish va xarajatlar hisobda', { returns: pr.returns, exp: pr.expenses });
  r = await admin.get(`/api/reports/products?from=${today}&to=${today}`);
  const mp = r.data.rows.find((x) => x.id === P);
  ok(mp && mp.qty === 4 && mp.revenue === 200000 && mp.cogs === 120000 && mp.profit === 80000 && ['A', 'B', 'C'].includes(mp.abc), 'R3 mahsulot: miqdor, tushum, tannarx, foyda, ABC', mp);
  r = await admin.get('/api/reports/stock');
  ok(r.status === 200 && r.data.cost_value > 0 && r.data.sale_value >= r.data.cost_value * 0, 'R4 ombor qiymati', r.data);
  r = await admin.get(`/api/reports/staff?from=${today}&to=${today}`);
  ok(r.status === 200 && r.data.length > 0 && r.data[0].avg > 0, 'R5 xodimlar hisoboti', r.data);
  ok((await kas.get('/api/reports/profit')).status === 403, 'R6 kassirga hisobot yo\'q');
  r = await admin.get('/api/dashboard');
  ok(r.data.profit && typeof r.data.profit.today.net === 'number' && 'low_stock' in r.data && Array.isArray(r.data.open_shifts), 'R7 bosh sahifada foyda, kam qolgan, smenalar', r.data.profit);
  await admin.post('/api/auth/users', { username: 'dash_seller', password: '1234', role: 'seller' });
  ok(!(await (await login('dash_seller', '1234')).get('/api/dashboard')).data.profit, 'R8 tannarx ruxsatisiz sotuvchiga foyda ko\'rinmaydi');

  console.log(`MOLIYA: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
