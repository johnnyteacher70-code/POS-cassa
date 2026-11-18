// Tahlilda topilgan xavfsizlik va hisob-kitob xatolari tuzatilganini tekshirish.
// Server qayta ishga tushgandan keyin (IP cheklovlari toza) ishga tushiriladi: node fixes_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const sqlite = require(ROOT + '/node_modules/better-sqlite3');
const ExcelJS = require(ROOT + '/node_modules/exceljs');
const db = sqlite(DATA + '/branches/1/app.db', { readonly: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

function client(base = {}) {
  let cookie = '';
  return {
    async req(method, p, body, headers = {}) {
      const h = { ...base, ...headers };
      if (cookie) h.Cookie = cookie;
      let b;
      if (body instanceof FormData) b = body;
      else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + p, { method, headers: h, body: b });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data, headers: r.headers, text };
    },
    get(p, h) { return this.req('GET', p, undefined, h); }, post(p, b, h) { return this.req('POST', p, b ?? {}, h); },
    put(p, b) { return this.req('PUT', p, b); }, del(p) { return this.req('DELETE', p); },
  };
}
const sale = (id) => db.prepare('SELECT * FROM sales WHERE id=?').get(id);
const bal = (id) => db.prepare('SELECT balance FROM clients WHERE id=?').get(id).balance;

(async () => {
  const admin = client(); await admin.post('/api/auth/login', { username: 'admin', password: 'admin123' });
  const seller = client(); await seller.post('/api/auth/login', { username: 'ali', password: '1234' });
  const products = (await admin.get('/api/products')).data;
  const P = products.find((p) => p.piece_price >= 10000 && p.box_qty >= 1);
  const C = (await admin.post('/api/clients', { type: 'b2b', company_name: 'Tuzatish MChJ', phone: '+998 97 555 44 33' })).data.id;

  // ================= X. Xavfsizlik =================
  // X1. Sotuvchi moliyaviy / buzuvchi amallarni bajara olmaydi
  const sx = (await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).data.id;
  const px = (await admin.post('/api/payments', { client_id: C, amount: 1000, method: 'cash' })).data.id;
  const deny = [
    ['put', `/api/sales/${sx}`, { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 9 }] }], ['post', `/api/sales/${sx}/cancel`], ['del', `/api/sales/${sx}`],
    ['put', `/api/payments/${px}`, { client_id: C, amount: 1 }], ['del', `/api/payments/${px}`],
    ['post', '/api/products', { name: 'X' }], ['put', `/api/products/${P.id}`, { name: 'X' }], ['del', `/api/products/${P.id}`], ['post', `/api/products/${P.id}/stock`, { pieces: 100 }],
    ['del', `/api/clients/${C}`], ['post', `/api/clients/${C}/shop-password`, { password: 'egallash' }],
    ['get', '/api/audit'], ['get', '/api/trash'], ['post', '/api/import/products', new FormData()],
    ['post', '/api/reviews/1/hide', {}], ['del', '/api/orders/1'], ['post', '/api/orders/1/reopen'],
  ];
  for (const [m, p, b] of deny) {
    const r = await seller[m](p, b);
    ok(r.status === 403, `X1 sotuvchi: ${m.toUpperCase()} ${p} → 403`, r.status);
  }
  ok(sale(sx).total === P.piece_price && !sale(sx).deleted_at && sale(sx).status === 'confirmed', 'X1a sotuv o\'zgarmadi');
  // X2. Sotuvchining kundalik ishi ishlaydi
  ok((await seller.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).status === 200, 'X2 sotuvchi sotuv qiladi');
  ok((await seller.post('/api/payments', { client_id: C, amount: 500, method: 'cash' })).status === 200, 'X2 sotuvchi to\'lov qabul qiladi');
  ok((await seller.post('/api/clients', { type: 'b2c', contact_name: 'Sotuvchi qo\'shgan' })).status === 200, 'X2 sotuvchi mijoz qo\'shadi');
  ok((await seller.post('/api/quotes', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).status === 200, 'X2 sotuvchi KP yozadi');
  ok((await seller.get('/api/products')).status === 200 && (await seller.get('/api/dashboard')).status === 200, 'X2 sotuvchi ro\'yxatlarni ko\'radi');

  // X3. Jurnalda parol xeshi yo'q
  const tmp = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Xesh sinovi', phone: '+998 97 111 00 99' })).data.id;
  await admin.post(`/api/clients/${tmp}/shop-password`, { password: 'maxfiy1' });
  await admin.del(`/api/clients/${tmp}`);
  const au = await admin.get('/api/audit?limit=50');
  ok(au.status === 200 && !/\$2[aby]\$|password_hash/.test(au.text), 'X3 jurnalda parol xeshi yo\'q');
  ok(!db.prepare("SELECT 1 FROM audit_log WHERE before_json LIKE '%password_hash%' OR after_json LIKE '%password_hash%'").get(), 'X3a bazadagi jurnalda ham yo\'q');

  // X4. Xavfsizlik header'lari
  const hr = await admin.get('/');
  ok(hr.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(hr.headers.get('content-security-policy') || '') && !hr.headers.get('x-powered-by'), 'X4 header\'lar: X-Frame-Options, CSP, X-Powered-By yo\'q');

  // X5. Admin paroli kamida 6 belgi, sotuvchiniki 4
  ok((await admin.post('/api/auth/users', { username: 'qisqa_admin', password: '12345', role: 'admin' })).status === 400, 'X5 admin uchun 5 belgili parol → 400');
  ok((await admin.post('/api/auth/users', { username: 'qisqa_sotuvchi', password: '1234', role: 'seller' })).status === 200, 'X5a sotuvchi uchun 4 belgi yetarli');

  // X6. Excel import: ichki tarmoq manzilidagi rasm yuklanmaydi (SSRF)
  {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mahsulotlar');
    ws.addRow(['Nomi', 'Dona narxi', 'Rasm']);
    const internal = `http://127.0.0.1:${new URL(B).port}/brand/mark.svg`;
    ws.addRow(['SSRF sinovi', 1000, internal]);
    ws.addRow(['SSRF sinovi 2', 1000, 'http://localhost:' + new URL(B).port + '/healthz']);
    const fd = new FormData(); fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 's.xlsx');
    const r = await admin.req('POST', '/api/import/products?commit=1', fd);
    const imgs = db.prepare("SELECT image FROM products WHERE name LIKE 'SSRF sinovi%'").all().map((x) => x.image);
    ok(r.status === 200 && imgs.length === 2 && imgs.every((i) => !i.startsWith('/uploads/')), 'X6 ichki manzildagi rasm serverga yuklanmadi', imgs);
    const { isPublicIp } = require(ROOT + '/server/safe_fetch');
    ok(['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1'].every((ip) => !isPublicIp(ip)) && isPublicIp('8.8.8.8'), 'X6a ichki IP lar ro\'yxati');
  }

  // ================= H. Hisob-kitob =================
  // H1. POS da to'liq to'langan sotuvni tahrirlash (forma sanani daqiqagacha yuboradi) — qarzga aylanmaydi
  let r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 2 }], pay_now: { amount: P.piece_price * 2, method: 'cash' }, date: '2026-09-01 10:15:37' });
  const S1 = r.data.id;
  ok(sale(S1).date === '2026-09-01 10:15:37' && sale(S1).paid_amount === P.piece_price * 2 && !sale(S1).was_debt, 'H1 POS sotuvi to\'liq to\'langan', sale(S1));
  await admin.put(`/api/sales/${S1}`, { client_id: C, date: '2026-09-01 10:15', items: [{ product_id: P.id, unit: 'dona', qty: 2 }], note: 'izoh' });
  ok(sale(S1).date === '2026-09-01 10:15:37' && !sale(S1).was_debt, 'H1a o\'sha daqiqa — sana va holat o\'zgarmadi', sale(S1));
  await admin.put(`/api/sales/${S1}`, { client_id: C, date: '2026-08-28 09:00', items: [{ product_id: P.id, unit: 'dona', qty: 2 }] });
  const pay1 = db.prepare('SELECT date FROM payments WHERE sale_id=? AND deleted_at IS NULL').get(S1);
  ok(sale(S1).date === '2026-08-28 09:00:00' && pay1.date === '2026-08-28 09:00:00' && !sale(S1).was_debt, 'H1b sana o\'zgarsa — to\'lov ham ko\'chdi, qarz emas', [sale(S1), pay1]);
  ok(sale(S1).note === 'izoh', 'H1c izoh yuborilmasa — o\'chib ketmaydi');

  // H2. POS sotuvi bekor qilinsa, to'langan pul yo'qolmaydi — mijozning avansi bo'lib qoladi (asl, ataylab qilingan xulq)
  const before = bal(C);
  const S2 = (await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 3 }], pay_now: { amount: P.piece_price * 3, method: 'cash' } })).data.id;
  await admin.post(`/api/sales/${S2}/cancel`);
  ok(bal(C) === before + P.piece_price * 3, 'H2 bekor qilindi — to\'langan pul avans bo\'lib qoldi', [before, bal(C)]);
  await admin.post(`/api/sales/${S2}/uncancel`);
  ok(bal(C) === before, 'H2a qayta tiklandi — balans avvalgidek');

  // H3. Bitta buyurtma ikki sotuvga aylanmaydi
  const ord = (await admin.get('/api/orders?status=new')).data.rows[0];
  if (ord) {
    const a = (await admin.post(`/api/orders/${ord.id}/confirm`, {})).data.id;
    await admin.del(`/api/sales/${a}`);
    ok((await admin.post(`/api/orders/${ord.id}/reopen`)).status === 200, 'H3 sotuv o\'chirilgach buyurtma qayta ochildi');
    const b2 = (await admin.post(`/api/orders/${ord.id}/confirm`, {})).data.id;
    r = await admin.post(`/api/sales/${a}/restore`);
    ok(r.status === 400 && b2 !== a, 'H3a eski sotuvni tiklab bo\'lmaydi (ikki marta hisob yo\'q)', r.data);
    ok(db.prepare("SELECT COUNT(*) n FROM sales WHERE order_id=? AND deleted_at IS NULL AND status='confirmed'").get(ord.id).n === 1, 'H3b buyurtmada bitta amaldagi sotuv');
  } else ok(false, 'H3 demo buyurtma topilmadi');

  // H4. O'chirilgan mijozning to'lovi / sotuvi tiklanmaydi
  const D = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'O\'chiriladigan', phone: '+998 97 222 33 44' })).data.id;
  const dp = (await admin.post('/api/payments', { client_id: D, amount: 700, method: 'cash' })).data.id;
  await admin.del(`/api/payments/${dp}`);
  ok((await admin.del(`/api/clients/${D}`)).status === 200, 'H4 balansi 0 mijoz o\'chirildi');
  r = await admin.post(`/api/payments/${dp}/restore`);
  ok(r.status === 400 && bal(D) === 0, 'H4a o\'chirilgan mijozning to\'lovi tiklanmaydi', r.data);

  // H5. Bitta KP dan faqat bitta sotuv
  const Q = (await admin.post('/api/quotes', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).data.id;
  ok((await admin.post('/api/sales', { client_id: C, quote_id: Q, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).status === 200, 'H5 KP sotuvga aylandi');
  r = await admin.post('/api/sales', { client_id: C, quote_id: Q, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] });
  ok(r.status === 400, 'H5a ikkinchi marta → 400', r.data);

  // H6. Ro'yxat jami cheklovdan qat'i nazar
  r = await admin.get('/api/sales?limit=3');
  const all = db.prepare("SELECT COUNT(*) n, SUM(total) t FROM sales WHERE status='confirmed' AND deleted_at IS NULL").get();
  ok(r.data.rows.length === 3 && r.data.sum.n === all.n && r.data.sum.total === all.t, 'H6 sotuvlar jami — barcha sotuvlardan', [r.data.sum, all]);
  const debts = await admin.get('/api/debts');
  const dAll = db.prepare("SELECT SUM(total-paid_amount) r FROM sales WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount").get().r;
  ok(debts.data.sum.rest === dAll, 'H6a qarzlar jami to\'g\'ri', [debts.data.sum.rest, dAll]);

  // H7. Telefon "8 90 ..." ko'rinishida
  r = await admin.post('/api/clients/quick', { query: '8 97 555 44 33' });
  ok(r.data.client.id === C && !r.data.created, 'H7 "8 97 ..." mavjud mijozni topadi (takror yaratmaydi)', r.data.client && r.data.client.phone);

  // H8. "1,5" — o'nlik kasr; chegirma jamidan oshmaydi; o'chirilgan mahsulot sotilmaydi
  r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: '1,5' }] });
  ok(sale(r.data.id).total === Math.round(P.piece_price * 1.5), 'H8 "1,5" dona = 1.5 dona', sale(r.data.id).total);
  r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }], discount: P.piece_price * 10 });
  ok(sale(r.data.id).total === 0 && sale(r.data.id).discount === P.piece_price, 'H8a chegirma jamigacha cheklandi', sale(r.data.id));
  const delP = (await admin.post('/api/products', { name: 'O\'chiriladigan mahsulot', piece_price: 100, box_qty: 1 })).data.id;
  await admin.del(`/api/products/${delP}`);
  ok((await admin.post('/api/sales', { client_id: C, items: [{ product_id: delP, unit: 'dona', qty: 1 }] })).status === 400, 'H8b o\'chirilgan mahsulot sotilmaydi');

  // H9. To'lovni qisman tahrirlash — sotuvga bog'lanish saqlanadi
  r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] });
  const lp = (await admin.post('/api/payments', { client_id: C, amount: 300, method: 'cash', sale_id: r.data.id })).data.id;
  await admin.put(`/api/payments/${lp}`, { amount: 400 });
  ok(db.prepare('SELECT sale_id, amount FROM payments WHERE id=?').get(lp).sale_id === r.data.id, 'H9 sale_id yo\'qolmadi');

  // H10. Excel: manfiy kirim olib tashlanadi
  {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mahsulotlar');
    ws.addRow(['Nomi', 'Dona narxi', 'Kirim (dona)']); ws.addRow(['Manfiy kirim', 1000, -50]);
    const fd = new FormData(); fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'n.xlsx');
    const pr = (await admin.req('POST', '/api/import/products', fd)).data;
    ok(pr.rows[0].notes.some((n) => /manfiy kirim/.test(n)) && !pr.rows[0].stock_in, 'H10 manfiy kirim olib tashlandi', pr.rows[0]);
  }

  // H11. Mijoz bekor qilgan buyurtmani qayta ochib bo'lmaydi
  const cancelled = db.prepare("SELECT id FROM orders WHERE status='cancelled' AND deleted_at IS NULL LIMIT 1").get();
  if (cancelled) ok((await admin.post(`/api/orders/${cancelled.id}/reopen`)).status === 400, 'H11 bekor qilingan buyurtma qayta ochilmaydi');

  // ================= T. Tezlik o'zgarishlari: kesh qiymatlari noldan hisoblangani bilan bir xil =================
  {
    const PCS = "i.qty * CASE WHEN i.unit='karobka' THEN i.box_qty ELSE 1 END";
    const badStock = db.prepare(`SELECT p.id, p.stock_pieces,
        COALESCE((SELECT SUM(qty_pieces) FROM stock_moves m WHERE m.product_id=p.id AND m.deleted_at IS NULL),0)
        - COALESCE((SELECT SUM(${PCS}) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND s.status='confirmed' AND s.deleted_at IS NULL),0) real
      FROM products p`).all().filter((r) => Math.abs(r.stock_pieces - r.real) > 1e-9);
    ok(badStock.length === 0, 'T1 barcha mahsulotlar qoldig\'i (trigger) = noldan hisoblangani', badStock.slice(0, 3));
    const badDebt = db.prepare(`SELECT c.id, c.open_debt, c.open_debts, c.oldest_debt, d.debt, d.n, d.oldest FROM clients c LEFT JOIN
        (SELECT client_id, SUM(total-paid_amount) debt, COUNT(*) n, MIN(date) oldest FROM sales WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount GROUP BY client_id) d
        ON d.client_id=c.id`).all().filter((r) => r.open_debt !== (r.debt || 0) || r.open_debts !== (r.n || 0) || (r.oldest_debt || null) !== (r.oldest || null));
    ok(badDebt.length === 0, 'T2 barcha mijozlar ochiq qarz statistikasi = noldan hisoblangani', badDebt.slice(0, 3));
    const badAlloc = db.prepare(`SELECT s.id, s.paid_amount, COALESCE((SELECT SUM(amount) FROM allocations a WHERE a.sale_id=s.id),0) a
      FROM sales s WHERE s.status='confirmed' AND s.deleted_at IS NULL`).all().filter((r) => r.paid_amount !== r.a);
    ok(badAlloc.length === 0, 'T3 sotuv to\'langan summasi = taqsimotlar yig\'indisi', badAlloc.slice(0, 3));
    ok((await admin.get('/api/orders/count')).data.new === db.prepare("SELECT COUNT(*) n FROM orders WHERE status='new' AND deleted_at IS NULL").get().n, 'T4 yangi buyurtmalar soni');
    r = await admin.get(`/api/clients/${C}?brief=1`);
    ok(r.data.client && r.data.client.id === C && Array.isArray(r.data.open_sales) && !r.data.sales && !r.data.timeline && !('shop_password_hash' in r.data.client), 'T5 qisqa mijoz javobi', Object.keys(r.data));
    const full = (await admin.get(`/api/clients/${C}`)).data;
    ok(full.timeline.length && full.timeline[0].balance === db.prepare('SELECT balance FROM clients WHERE id=?').get(C).balance, 'T6 mijoz tarixidagi oxirgi balans = mijoz balansi');
    // Summa bo'yicha qidiruv: noyob summali sotuv mijozni topadi (aniq va boshlanishi bo'yicha)
    const U = (await admin.post('/api/clients', { type: 'b2b', company_name: 'Summa Qidiruv MChJ' })).data.id;
    await admin.post('/api/sales', { client_id: U, items: [{ name: 'Maxsus', unit: 'dona', qty: 1, price: 7319461 }] });
    ok((await admin.get('/api/clients?q=7319461')).data.rows[0]?.id === U, 'T7 aniq summa bo\'yicha topildi');
    ok((await admin.get('/api/clients?q=73194')).data.rows.some((c) => c.id === U), 'T7a summa boshlanishi bo\'yicha topildi');
    ok((await admin.get('/api/clients?q=' + encodeURIComponent('summa qidiruv'))).data.rows[0]?.id === U, 'T7b nom bo\'yicha');
    ok((await admin.get('/api/clients?q=' + encodeURIComponent('sumna qidruv'))).data.rows.some((c) => c.id === U), 'T7c xatoli yozilsa ham');

    // T8: Sotuvda filial identifikatsiyasi (branch_id, branch_code, branch_name)
    const sb = (await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 1 }] })).data;
    const srow = db.prepare('SELECT branch_id, branch_code, branch_name FROM sales WHERE id=?').get(sb.id);
    ok(srow && srow.branch_id === 1 && srow.branch_code && srow.branch_name, 'T8 sotuvda filial kodi va nomi saqlangan', srow);

    // T9: Qaytarishda tannarx yangilanishi
    const costBefore = db.prepare('SELECT cost_price FROM products WHERE id=?').get(P.id).cost_price;
    const sret = (await admin.post('/api/sales', { client_id: C, items: [{ product_id: P.id, unit: 'dona', qty: 2, price: P.piece_price }] })).data;
    const saleItem = db.prepare('SELECT id FROM sale_items WHERE sale_id=?').get(sret.id);
    await admin.post('/api/returns', { sale_id: sret.id, items: [{ sale_item_id: saleItem.id, qty: 1 }] });
    const costAfter = db.prepare('SELECT cost_price FROM products WHERE id=?').get(P.id).cost_price;
    ok(costAfter > 0, 'T9 qaytarishdan keyin tannarx to\'g\'ri', { costBefore, costAfter });
  }

  // ================= Z. Kirish cheklovi (oxirida: shu IP dan "ali" 15 daqiqaga bloklanadi) =================
  // Soxta X-Forwarded-For bilan cheklovni aylanib o'tib bo'lmaydi
  for (let i = 0; i < 10; i++) await client({ 'X-Forwarded-For': `10.9.${i}.1` }).post('/api/auth/login', { username: 'ali', password: 'xato' + i });
  r = await client({ 'X-Forwarded-For': '10.9.99.1' }).post('/api/auth/login', { username: 'ali', password: '1234' });
  ok(r.status === 429, 'Z1 soxta X-Forwarded-For hisobga olinmaydi — blok ishlaydi', r.status);
  // Bloklash login+IP bo'yicha: shu IP dan boshqa login ishlaydi
  ok((await client().post('/api/auth/login', { username: 'admin', password: 'admin123' })).status === 200, 'Z2 boshqa foydalanuvchi bloklanmadi');

  console.log(`\nTUZATISHLAR: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
