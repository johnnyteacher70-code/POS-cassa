// To'liq API test to'plami. Ishga tushirish: node api_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
process.env.DATA_DIR = DATA;
const db = require(ROOT + '/node_modules/better-sqlite3')(DATA + '/branches/1/app.db', { readonly: true });
const mainDb = require(ROOT + '/node_modules/better-sqlite3')(DATA + '/main.db', { readonly: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

function client(name) {
  let cookie = '';
  let headers = {};
  return {
    name,
    set(h) { headers = { ...headers, ...h }; return this; },
    async req(method, path, body, raw = false) {
      const h = { ...headers };
      if (cookie) h.Cookie = cookie;
      let b;
      if (body instanceof FormData) b = body;
      else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + path, { method, headers: h, body: b, redirect: 'manual' });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      if (raw) return r;
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data };
    },
    get(p) { return this.req('GET', p); }, post(p, b) { return this.req('POST', p, b ?? {}); },
    put(p, b) { return this.req('PUT', p, b); }, del(p) { return this.req('DELETE', p); },
  };
}

const today = new Date().toLocaleString('sv-SE').slice(0, 10);

(async () => {
  const anon = client('anon');
  const admin = client('admin');
  const seller = client('seller');

  // ================= A. Autentifikatsiya va ruxsatlar =================
  for (const p of ['/api/clients', '/api/sales', '/api/payments', '/api/products', '/api/dashboard', '/api/registers', '/api/audit', '/api/settings', '/api/import/products/template']) {
    const r = await anon.get(p); ok(r.status === 401, `A1 kirmasdan ${p} → 401`, r.status);
  }
  ok((await anon.get('/api/nomavjud')).status === 401, 'A2 nomavjud API ham himoyalangan');
  ok((await admin.post('/api/auth/login', { username: 'admin', password: 'xato' })).status === 401, 'A3 xato parol → 401');
  ok((await admin.post('/api/auth/login', { username: "admin' OR '1'='1", password: 'x' })).status === 401, 'A4 SQL injection login → 401');
  let r = await admin.post('/api/auth/login', { username: 'admin', password: 'admin123' });
  ok(r.status === 200 && r.data.role === 'admin', 'A5 admin kirdi', r.data);
  ok((await admin.get('/api/nomavjud')).status === 404, 'A6 nomavjud API → 404 JSON');
  r = await seller.post('/api/auth/login', { username: 'ali', password: '1234' });
  ok(r.status === 200 && r.data.role === 'seller', 'A7 sotuvchi kirdi', r.data);
  ok((await seller.get('/api/auth/users')).status === 403, 'A8 sotuvchi xodimlar ro\'yxatini ko\'ra olmaydi');
  ok((await seller.put('/api/settings', { company_name: 'X' })).status === 403, 'A9 sotuvchi sozlamani o\'zgartira olmaydi');
  ok((await seller.post('/api/registers', { name: 'X' })).status === 403, 'A10 sotuvchi kassa qo\'sha olmaydi');
  ok((await seller.post('/api/auth/users', { username: 'hack', password: '1234', role: 'admin' })).status === 403, 'A11 sotuvchi admin yarata olmaydi');
  r = await seller.get('/api/staff/report');
  ok(r.status === 200 && r.data.length === 1 && r.data[0].username === 'ali', 'A12 sotuvchi faqat o\'z hisobotini ko\'radi', r.data.length);
  r = await admin.get('/api/auth/users');
  ok(r.status === 200 && !JSON.stringify(r.data).includes('password_hash'), 'A13 parol xeshi chiqmaydi');
  const tmp = client('tmp'); await tmp.post('/api/auth/login', { username: 'vali', password: '1234' });
  await tmp.post('/api/auth/logout'); ok((await tmp.get('/api/auth/me')).status === 401, 'A14 chiqqandan keyin sessiya yopiladi');

  // ================= B. Mijozlar =================
  r = await admin.post('/api/clients', { type: 'b2b', company_name: 'Test Savdo MChJ', inn: '300 111 222', contact_name: 'Sinov Odam', phone: '90 777 11 22', opening_balance: -5000000 });
  ok(r.status === 200 && r.data.id, 'B1 mijoz + boshlang\'ich qarz', r.data);
  const C1 = r.data.id;
  r = await admin.get('/api/clients/' + C1);
  ok(r.data.client.balance === -5000000 && r.data.client.phone === '+998907771122' && r.data.client.inn === '300111222', 'B2 qarz va telefon/INN normallashuvi', r.data.client);
  ok(r.data.sales.some((s) => s.kind === 'opening' && s.total === 5000000), 'B3 boshlang\'ich qarz hujjati');
  r = await admin.post('/api/clients', { type: 'b2c', contact_name: 'Ikkinchi', phone: '+998907771122' });
  ok(r.status === 200 && r.data.warnings.length === 1, 'B4 takroriy telefon ogohlantirishi', r.data);
  const C2 = r.data.id;
  ok((await admin.post('/api/clients', { type: 'b2b' })).status === 400, 'B5 nomsiz mijoz → 400');
  for (const [q, name] of [['tsest savdo', 'xato yozilgan nom'], ['7771122', 'telefon qismi'], ['300111222', 'INN'], ['5000000', 'qarz summasi'], ['синов', 'kirillcha']]) {
    r = await admin.get('/api/clients?q=' + encodeURIComponent(q));
    ok(r.status === 200 && r.data.rows.some((c) => c.id === C1), `B6 qidiruv: ${name}`, r.data.rows.map((c) => c.company_name || c.contact_name).slice(0, 3));
  }
  for (const q of ["' OR 1=1 --", '"; DROP TABLE clients; --', '%', '_', '\\', '<script>alert(1)</script>']) {
    r = await admin.get('/api/clients?q=' + encodeURIComponent(q)); ok(r.status === 200, 'B7 xavfli qidiruv satri: ' + q, r.status);
  }
  r = await admin.get('/api/clients?filter=debtors'); ok(r.data.rows.every((c) => c.balance < 0), 'B8 qarzdorlar filtri');
  r = await admin.get('/api/clients?filter=advance'); ok(r.data.rows.every((c) => c.balance > 0), 'B9 avans filtri');
  r = await admin.put('/api/clients/' + C1, { type: 'b2b', company_name: 'Test Savdo MChJ', inn: '300111222', contact_name: 'Sinov Odam 2', phone: '+998907771122', address: '<b>Toshkent</b>' });
  ok(r.status === 200, 'B10 tahrirlash');
  ok((await admin.get('/api/clients/999999')).status === 404, 'B11 yo\'q mijoz → 404');
  ok((await admin.del('/api/clients/' + C2)).status === 200, 'B12 o\'chirish');
  r = await admin.get('/api/clients?q=Ikkinchi'); ok(!r.data.rows.some((c) => c.id === C2), 'B13 o\'chirilgan ro\'yxatda yo\'q');
  ok((await admin.post(`/api/clients/${C2}/restore`)).status === 200, 'B14 tiklash');

  // ================= C. Mahsulotlar va ombor =================
  let fd = new FormData();
  for (const [k, v] of Object.entries({ name: 'Test Atir', brand: 'TestBrend', volume: '50 ml', piece_price: 100000, box_price: 540000, box_qty: 6, initial_stock: 60 })) fd.append(k, v);
  r = await admin.req('POST', '/api/products', fd); ok(r.status === 200, 'C1 mahsulot yaratish', r.data);
  const P1 = r.data.id;
  fd = new FormData(); fd.append('name', 'Rasm sinovi'); fd.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
  r = await admin.req('POST', '/api/products', fd); ok(r.status === 200, 'C2 rasm bo\'lmagan fayl — mahsulot yaratiladi', r.data);
  const P2 = r.data.id;
  ok(!db.prepare('SELECT image FROM products WHERE id=?').get(P2).image, 'C3 rasm emas fayl saqlanmadi');
  const stockOf = async (id) => (await admin.get('/api/products/' + id)).data.stock;
  ok(await stockOf(P1) === 60, 'C4 boshlang\'ich qoldiq 60');
  await admin.post(`/api/products/${P1}/stock`, { unit: 'karobka', qty: 2 }); ok(await stockOf(P1) === 72, 'C5 kirim 2 karobka → 72');
  await admin.post(`/api/products/${P1}/stock`, { unit: 'dona', qty: -2 }); ok(await stockOf(P1) === 70, 'C6 hisobdan chiqarish → 70');
  ok((await admin.post(`/api/products/${P1}/stock`, { unit: 'dona', qty: 0 })).status === 400, 'C7 0 miqdor → 400');
  ok((await admin.post('/api/products', (() => { const f = new FormData(); f.append('name', ''); return f; })())).status === 400, 'C8 nomsiz mahsulot → 400');

  // ================= D. Sotuvlar =================
  const balOf = async (id) => (await admin.get('/api/clients/' + id)).data.client.balance;
  r = await admin.post('/api/sales', { client_id: C1, items: [{ product_id: P1, unit: 'karobka', qty: 2 }, { product_id: P1, unit: 'dona', qty: 3 }], discount: 30000, pay_now: { amount: 500000, method: 'cash' } });
  ok(r.status === 200, 'D1 sotuv (karobka + dona + chegirma + to\'lov)', r.data);
  const S1 = r.data.id;
  ok(r.data.summary.total === 2 * 540000 + 3 * 100000 - 30000, 'D2 summa to\'g\'ri', r.data.summary);
  ok(await stockOf(P1) === 70 - 15, 'D3 ombordan 15 dona chiqdi');
  ok(await balOf(C1) === -5000000 - 1350000 + 500000, 'D4 balans', await balOf(C1));
  r = await admin.put('/api/sales/' + S1, { client_id: C1, items: [{ product_id: P1, unit: 'karobka', qty: 1 }], discount: 0, date: today });
  ok(r.status === 200 && await stockOf(P1) === 70 - 6, 'D5 tahrir: ombor qayta hisoblandi', await stockOf(P1));
  ok(await balOf(C1) === -5000000 - 540000 + 500000, 'D6 tahrir: balans', await balOf(C1));
  // Sotuvni boshqa mijozga o'tkazish: to'g'ridan-to'g'ri to'lovi ham o'tadi
  r = await admin.put('/api/sales/' + S1, { client_id: C2, items: [{ product_id: P1, unit: 'karobka', qty: 1 }], date: today });
  ok(r.status === 200 && await balOf(C1) === -5000000 && await balOf(C2) === -540000 + 500000, 'D7 boshqa mijozga o\'tkazish', [await balOf(C1), await balOf(C2)]);
  ok((await admin.post(`/api/sales/${S1}/cancel`)).status === 200 && await balOf(C2) === 500000 && await stockOf(P1) === 70, 'D8 bekor: balans va ombor qaytdi', [await balOf(C2), await stockOf(P1)]);
  ok((await admin.post(`/api/sales/${S1}/uncancel`)).status === 200 && await balOf(C2) === -40000, 'D9 qayta tiklash', await balOf(C2));
  ok((await admin.del('/api/sales/' + S1)).status === 200 && await balOf(C2) === 500000, 'D10 o\'chirish');
  ok((await admin.post(`/api/sales/${S1}/restore`)).status === 200 && await balOf(C2) === -40000, 'D11 savatdan tiklash');
  ok((await admin.post('/api/sales', { client_id: C1, items: [] })).status === 400, 'D12 bo\'sh sotuv → 400');
  ok((await admin.post('/api/sales', { client_id: 999999, items: [{ product_id: P1, qty: 1 }] })).status === 400, 'D13 yo\'q mijoz → 400');
  ok((await admin.post('/api/sales', { client_id: C1, items: [{ product_id: P1, qty: 1 }], date: 'kecha' })).status === 400, 'D14 noto\'g\'ri sana → 400');
  r = await admin.post('/api/sales', { client_id: C1, items: [{ product_id: P1, unit: 'dona', qty: -5 }, { product_id: P1, unit: 'dona', qty: 1 }] });
  ok(r.status === 200 && r.data.summary.total === 100000, 'D15 manfiy miqdor e\'tiborsiz', r.data.summary);
  r = await admin.post('/api/sales/check-stock', { items: [{ product_id: P1, unit: 'karobka', qty: 100 }] });
  ok(r.data.warnings.length === 1, 'D16 ombor ogohlantirishi', r.data);
  r = await admin.post('/api/sales', { client_id: C1, kind: 'opening', total: 1000 }); ok(r.status === 200, 'D17 qo\'lda qarz yozish');
  ok((await admin.get('/api/sales?q=' + encodeURIComponent("' OR '1'='1"))).status === 200, 'D18 sotuv qidiruvida injection');
  ok((await admin.get('/api/sales/999999')).status === 404, 'D19 yo\'q sotuv → 404');

  // ================= E. To'lovlar va FIFO =================
  r = await admin.post('/api/clients', { type: 'b2b', company_name: 'FIFO MChJ' }); const C3 = r.data.id;
  const sA = (await admin.post('/api/sales', { client_id: C3, items: [{ name: 'Qo\'lda A', qty: 1, price: 1000 }], date: today + ' 09:00' })).data.id;
  const sB = (await admin.post('/api/sales', { client_id: C3, items: [{ name: 'Qo\'lda B', qty: 1, price: 2000 }], date: today + ' 10:00' })).data.id;
  r = await admin.post('/api/payments', { client_id: C3, amount: 1500, method: 'transfer', date: today + ' 11:00' });
  ok(r.data.allocations.length === 2 && r.data.allocations[0].number && r.data.unallocated === 0, 'E1 FIFO: eski qarzdan', r.data);
  let sa = (await admin.get('/api/sales/' + sA)).data, sb = (await admin.get('/api/sales/' + sB)).data;
  ok(sa.paid_amount === 1000 && sa.closed_at && sb.paid_amount === 500 && !sb.closed_at, 'E2 A yopildi, B qisman', [sa.paid_amount, sb.paid_amount]);
  r = await admin.post('/api/payments', { client_id: C3, amount: 5000, method: 'card', sale_id: sB, date: today + ' 12:00' });
  ok(r.data.allocations.length === 1 && r.data.allocations[0].amount === 2000 && await balOf(C3) === 3500, 'E3 aniq sotuvni to\'liq yopadi, umumiy ortiqcha avans (3500)', r.data);
  sb = (await admin.get('/api/sales/' + sB)).data; ok(sb.closed_at && sb.was_debt === 1, 'E4 B qarzi yopildi (yopilgan qarz)');
  r = await admin.post('/api/payments', { client_id: C3, amount: 1000, direction: 'out', method: 'cash' });
  ok(r.status === 200 && await balOf(C3) === 2500, 'E5 chiqim (qaytarish)');
  ok((await admin.post('/api/payments', { client_id: C3, amount: 0 })).status === 400, 'E6 0 summa → 400');
  ok((await admin.post('/api/payments', { client_id: C3, amount: -100 })).status === 400, 'E7 manfiy summa → 400');
  ok((await admin.post('/api/payments', { client_id: C3, amount: 100, sale_id: S1 })).status === 400, 'E8 boshqa mijoz sotuviga to\'lov → 400');
  const pid = r.data.id;
  r = await admin.put('/api/payments/' + pid, { client_id: C3, amount: 2000, direction: 'out', method: 'cash' });
  ok(r.status === 200 && await balOf(C3) === 1500, 'E9 to\'lovni tahrirlash', await balOf(C3));
  ok((await admin.del('/api/payments/' + pid)).status === 200 && await balOf(C3) === 3500, 'E10 to\'lovni o\'chirish');
  ok((await admin.post(`/api/payments/${pid}/restore`)).status === 200 && await balOf(C3) === 1500, 'E11 to\'lovni tiklash');
  // Avans bor mijozga yangi sotuv avansdan yechiladi
  r = await admin.post('/api/sales', { client_id: C3, items: [{ name: 'C', qty: 1, price: 1000 }] });
  ok(r.data.summary.from_advance === 1000 && r.data.summary.debt === 0, 'E12 sotuv avansdan yechildi', r.data.summary);

  // ================= F. KP =================
  r = await admin.post('/api/quotes', { client_id: C1, items: [{ product_id: P1, unit: 'karobka', qty: 3 }], note: 'Shartlar' });
  ok(r.status === 200, 'F1 KP yaratish'); const Q1 = r.data.id;
  r = await admin.get('/api/quotes/' + Q1); ok(r.data.total === 3 * 540000 && r.data.client_name === 'Test Savdo MChJ', 'F2 KP summasi', r.data.total);
  r = await admin.post('/api/sales', { client_id: C1, quote_id: Q1, items: [{ product_id: P1, unit: 'karobka', qty: 3 }] });
  ok((await admin.get('/api/quotes/' + Q1)).data.sale_id === r.data.id, 'F3 KP → sotuv bog\'landi');
  ok((await admin.del('/api/quotes/' + Q1)).status === 200 && (await admin.post(`/api/quotes/${Q1}/restore`)).status === 200, 'F4 KP o\'chirish/tiklash');

  // ================= G. Kassalar =================
  r = await admin.get('/api/registers'); ok(r.data.length >= 3, 'G1 kassalar bor');
  r = await admin.post('/api/registers', { name: 'Test kassa' }); const R4 = r.data.id; ok(R4, 'G2 kassa qo\'shish');
  r = await seller.post('/api/payments', { client_id: C1, amount: 777, method: 'cash', register_id: R4 });
  ok(db.prepare('SELECT register_id FROM payments WHERE id=?').get(r.data.id).register_id === R4, 'G3 to\'lov tanlangan kassaga');
  r = await seller.post('/api/payments', { client_id: C1, amount: 111, method: 'cash' });
  const aliReg = db.prepare("SELECT register_id FROM users WHERE username='ali'").get().register_id;
  ok(db.prepare('SELECT register_id FROM payments WHERE id=?').get(r.data.id).register_id === aliReg, 'G4 kassa ko\'rsatilmasa — xodimning kassasi', aliReg);
  await admin.put('/api/registers/' + R4, { name: 'Test kassa', active: 0 });
  r = await seller.post('/api/payments', { client_id: C1, amount: 222, method: 'cash', register_id: R4 });
  ok(db.prepare('SELECT register_id FROM payments WHERE id=?').get(r.data.id).register_id !== R4, 'G5 nofaol kassaga yozilmaydi');
  r = await admin.get(`/api/registers/report?from=${today}&to=${today}`);
  const regSum = r.data.reduce((a, x) => a + x.in_total - x.out_total, 0);
  const paySum = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM payments WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`).get(today + ' 00:00:00', today + ' 23:59:59').v;
  ok(regSum === paySum, 'G6 kassalar hisoboti = barcha to\'lovlar', [regSum, paySum]);

  // ================= H. Katalog (sayt) =================
  ok((await admin.put('/api/settings', { sell_unit: 'box' })).status === 200, 'H0 katalog: faqat karobka rejimi');
  const shop = client('shop');
  r = await shop.get('/api/shop/filial-a/catalog');
  ok(r.status === 200 && r.data.products.length > 0 && !('stock' in r.data.products[0]), 'H1 katalog, ombor ko\'rinmaydi');
  ok((await shop.get('/api/shop/filial-a/history')).status === 403, 'H2 kirmasdan tarix → 403');
  ok((await shop.post('/api/shop/filial-a/orders', { items: [] })).status === 403, 'H3 kirmasdan buyurtma → 403');
  ok((await shop.post('/api/shop/filial-a/web/register', { phone: '12345', password: '1234', contact_name: 'X' })).status === 400, 'H4 noto\'g\'ri telefon → 400');
  ok((await shop.post('/api/shop/filial-a/web/register', { phone: '+998907771122', password: '1234', contact_name: 'X' })).status === 409, 'H5 bazadagi raqam bilan ro\'yxat → 409');
  ok((await shop.post('/api/shop/filial-a/web/register', { phone: '+998 93 555 00 11', password: '12', contact_name: 'X' })).status === 400, 'H6 qisqa parol → 400');
  r = await shop.post('/api/shop/filial-a/web/register', { phone: '+998+998 93 555 00 11', password: 'parol1', type: 'b2b', company_name: 'Sayt Mijoz', contact_name: 'Sayt Odam' });
  ok(r.status === 200 && r.data.token, 'H7 ro\'yxatdan o\'tish (takror +998 bilan)', r.data);
  shop.set({ 'X-Shop-Token': r.data.token });
  ok(db.prepare("SELECT phone FROM clients WHERE company_name='Sayt Mijoz'").get().phone === '+998935550011', 'H8 telefon to\'g\'ri saqlandi');
  r = await shop.get('/api/shop/filial-a/me'); ok(r.data.client.name === 'Sayt Mijoz', 'H9 /me');
  r = await shop.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'dona', qty: 1 }] });
  ok(r.status === 400, 'H10 katalogdan dona → rad etiladi', r.data);
  r = await shop.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 500, price: 1 }], note: '<img src=x onerror=alert(1)>' });
  ok(r.status === 200 && r.data.total === 500 * 540000, 'H11 buyurtma: narx bazadan, ombordan ko\'p ham qabul', r.data);
  const O1 = r.data.id;
  const other = client('other'); const lo = await other.post('/api/shop/filial-a/web/register', { phone: '+998 93 555 00 12', password: 'parol2', contact_name: 'Begona' }); other.set({ 'X-Shop-Token': lo.data.token });
  ok((await other.post(`/api/shop/filial-a/orders/${O1}/cancel`)).status === 404, 'H12 begona buyurtmani bekor qila olmaydi');
  r = await other.get('/api/shop/filial-a/history'); ok(!r.data.orders.some((o) => o.id === O1), 'H13 begona tarixni ko\'rmaydi');
  ok((await shop.post('/api/shop/filial-a/profile', { type: 'b2b', company_name: 'Sayt Mijoz 2', contact_name: 'Sayt Odam' })).status === 200, 'H14 o\'z profilini tahrirlash');
  ok((await shop.post('/api/shop/filial-a/password', { password: 'yangi1' })).status === 200, 'H15 parolni o\'zgartirish');
  ok((await client('x').post('/api/shop/filial-a/web/login', { phone: '+998935550011', password: 'yangi1' })).status === 200, 'H16 yangi parol bilan kirish');
  // Telegram orqali parol tiklash olib tashlangan
  ok((await shop.post('/api/shop/filial-a/web/forgot', { phone: '+998935550011' })).status === 404, 'H17 /web/forgot yo\'q');
  ok((await shop.post('/api/shop/filial-a/web/reset', { phone: '+998935550011', code: '1', password: 'abcd1' })).status === 404, 'H18 /web/reset yo\'q');
  let last;
  for (let i = 0; i < 9; i++) last = await client('bf').post('/api/shop/filial-a/web/login', { phone: '+998935550012', password: 'xato' + i });
  ok(last.status === 429, 'H21 parol tanlashga qarshi blok', last.status);
  ok((await shop.post('/api/shop/filial-a/web/logout')).status === 200 && (await shop.get('/api/shop/filial-a/me')).data.client === null, 'H23 chiqish');

  // ================= I. Buyurtmalar (admin) =================
  r = await admin.get('/api/orders/' + O1); ok(r.status === 200 && r.data.source === 'web', 'I1 buyurtma manbasi: sayt');
  r = await admin.put('/api/orders/' + O1, { items: [{ product_id: P1, unit: 'karobka', qty: 2 }], admin_note: 'kamaytirildi' });
  ok(r.status === 200 && (await admin.get('/api/orders/' + O1)).data.total === 2 * 540000, 'I2 buyurtmani tahrirlash');
  r = await seller.post(`/api/orders/${O1}/confirm`, { pay_now: { amount: 100000, method: 'card' }, register_id: 2 });
  ok(r.status === 200 && r.data.summary.total === 1080000 && r.data.summary.paid_now === 100000, 'I3 tasdiqlash → sotuv', r.data);
  ok(db.prepare('SELECT register_id FROM sales WHERE id=?').get(r.data.id).register_id === 2, 'I4 sotuv tanlangan kassada');
  ok((await admin.post(`/api/orders/${O1}/confirm`)).status === 400, 'I5 ikki marta tasdiqlab bo\'lmaydi');
  ok((await admin.post(`/api/orders/${O1}/reopen`)).status === 400, 'I6 sotuvi bor buyurtmani qayta ochib bo\'lmaydi');
  r = await other.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 1 }] });
  ok((await admin.post(`/api/orders/${r.data.id}/reject`, { reason: 'Yo\'q' })).status === 200, 'I7 rad etish');
  ok((await admin.post(`/api/orders/${r.data.id}/reopen`)).status === 200, 'I8 qayta ochish');

  // ================= J. Hisobotlar va boshqalar =================
  for (const p of ['/api/dashboard', '/api/debts', '/api/debts?tab=closed', '/api/debts?overdue=1', '/api/audit?limit=50', '/api/trash', '/api/settings', '/api/staff/report', '/api/staff/list', `/api/registers/report?from=${today}`, '/api/payments?method=cash&direction=in', '/api/sales?status=debt', '/api/products', '/api/quotes', '/api/orders?status=new']) {
    r = await admin.get(p); ok(r.status === 200, 'J1 ' + p, r.status);
  }
  r = await admin.get('/api/debts'); ok(r.data.rows.every((x) => x.rest > 0), 'J2 ochiq qarzlar qoldiq > 0');
  r = await admin.get('/api/debts?tab=closed'); ok(r.data.rows.every((x) => x.rest === 0 && x.closed_at), 'J3 yopilgan qarzlar');
  r = await admin.put('/api/settings', { company_name: 'Optom Savdo', pos_pieces: '1' }); ok(r.status === 200, 'J4 sozlamalar');
  r = await admin.post(`/api/clients/${C1}/shop-password`, { password: '123' }); ok(r.status === 400, 'J5 qisqa katalog paroli → 400');
  r = await admin.post(`/api/clients/${C1}/shop-password`, { password: '4567' }); ok(r.status === 200, 'J6 admin katalog parolini beradi');
  ok((await client('c1').post('/api/shop/filial-a/web/login', { phone: '+998907771122', password: '4567' })).status === 200, 'J7 mijoz admin bergan parol bilan kiradi');

  // ================= K. Excel =================
  for (const p of ['/api/import/products/template', '/api/import/products/template?lang=ru', '/api/import/products/export']) {
    const rr = await admin.req('GET', p, undefined, true);
    const buf = Buffer.from(await rr.arrayBuffer());
    ok(rr.status === 200 && buf.slice(0, 2).toString() === 'PK' && buf.length > 3000, 'K1 xlsx: ' + p, [rr.status, buf.length]);
  }
  fd = new FormData(); fd.append('file', new Blob(['salom']), 'x.xlsx');
  r = await admin.req('POST', '/api/import/products', fd); ok(r.status === 400, 'K2 buzuq fayl → 400', r.status);
  ok((await admin.req('POST', '/api/import/products', new FormData())).status === 400, 'K3 fayl yo\'q → 400');

  // ================= M. Ko'rib chiqishda topilgan xatolar (regressiya) =================
  // S1: HTML faylni rasm deb yuklash
  fd = new FormData(); fd.append('name', 'XSS sinovi'); fd.append('image', new Blob(['<html><script>alert(1)</script></html>'], { type: 'image/png' }), 'x.html');
  r = await admin.req('POST', '/api/products', fd);
  const xImg = db.prepare('SELECT image FROM products WHERE id=?').get(r.data.id).image;
  ok(r.status === 200 && !xImg, 'M1 rasm emas (HTML) fayl saqlanmaydi', xImg);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f650000000049454e44ae426082', 'hex');
  fd = new FormData(); fd.append('name', 'PNG sinovi'); fd.append('image', new Blob([png], { type: 'image/png' }), 'evil.html');
  r = await admin.req('POST', '/api/products', fd);
  const pImg = db.prepare('SELECT image FROM products WHERE id=?').get(r.data.id).image;
  ok(/^\/uploads\/1\/[a-f0-9]+\.png$/.test(pImg), 'M2 haqiqiy rasm filial papkasida .png bo\'lib saqlanadi (nom kengaytmasi e\'tiborsiz)', pImg);
  const rr = await admin.req('GET', pImg, undefined, true);
  ok(rr.headers.get('x-content-type-options') === 'nosniff' && /image\/png/.test(rr.headers.get('content-type')), 'M3 rasm nosniff bilan beriladi');
  // R1: tanasiz so'rovlar
  ok((await fetch(B + '/api/auth/login', { method: 'POST' })).status === 401, 'M4 tanasiz login → 401 (500 emas)');
  ok([400, 401].includes((await fetch(B + '/api/shop/filial-a/web/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status), 'M5 JSON bo\'lmagan so\'rov → 4xx');
  // C1: buzuq cookie
  let rc = await fetch(B + '/api/auth/me', { headers: { Cookie: 'sid=%zz; boshqa=%E0%A4%A' } });
  ok(rc.status === 401, 'M6 buzuq cookie → 401 (500 emas)', rc.status);
  rc = await fetch(B + '/shop/', { headers: { Cookie: 'x=%zz' } }); ok(rc.status === 200, 'M7 buzuq cookie bilan katalog ochiladi');
  // C2: sessiya muddati mahalliy vaqtda
  const sess = mainDb.prepare('SELECT expires_at FROM sessions ORDER BY created_at DESC LIMIT 1').get();
  const daysLeft = (new Date(sess.expires_at.replace(' ', 'T')) - Date.now()) / 864e5;
  ok(daysLeft > 29.9 && daysLeft < 30.1, 'M8 admin sessiyasi 30 kun (vaqt mintaqasi to\'g\'ri)', daysLeft);
  // S3: admin kirishiga cheklov
  let lr; for (let i = 0; i < 11; i++) lr = await client('bf2').post('/api/auth/login', { username: 'dilnoza', password: 'xato' + i });
  ok(lr.status === 429, 'M9 admin panelga parol tanlash bloklanadi', lr.status);
  // S2: juda uzun "telefon"
  const t0 = Date.now(); r = await client('big').post('/api/shop/filial-a/web/login', { phone: '9'.repeat(1000000), password: 'x' });
  ok(r.status === 401 && Date.now() - t0 < 3000, 'M10 1 MB telefon — tez rad etiladi', r.status);
  // C3: mijoz bekor qilgan buyurtma
  const sh2 = client('sh2'); const reg2 = await sh2.post('/api/shop/filial-a/web/register', { phone: '+998 93 555 00 13', password: 'parol3', contact_name: 'Bekor Qiluvchi' }); sh2.set({ 'X-Shop-Token': reg2.data.token });
  r = await sh2.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 1 }] }); const O2 = r.data.id;
  await sh2.post(`/api/shop/filial-a/orders/${O2}/cancel`);
  ok((await admin.post(`/api/orders/${O2}/confirm`)).status === 400, 'M11 mijoz bekor qilgan buyurtmani tasdiqlab bo\'lmaydi');
  // C9: miqdor chegarasi
  r = await sh2.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 1e20 }] });
  ok(r.status === 200 && r.data.total === 10000 * 540000, 'M12 juda katta miqdor chegaralanadi', r.data);
  // C4 + C5: Excel narxlari va yangi artikul
  const ExcelJS = require(ROOT + '/node_modules/exceljs');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mahsulotlar');
  ws.addRow(['Nomi *', 'Hajmi', 'Artikul', 'Dona narxi', 'Karobkada (dona)', 'Karobka narxi']);
  ws.addRow(['Test Atir', '50 ml', 'YANGI-SKU', '120.000', 6, '650 000']);
  ws.addRow(['Excel Yangi', '30 ml', '', '1,450', 4, '5.500.000']);
  ws.addRow(['Faqat Karobka', '30 ml', '', '', 4, '5.500.000']);
  fd = new FormData(); fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 't.xlsx');
  r = await admin.req('POST', '/api/import/products', fd);
  const row1 = r.data.rows.find((x) => x.name === 'Test Atir'), row2 = r.data.rows.find((x) => x.name === 'Excel Yangi');
  ok(row1 && row1.action === 'create', 'M13 nomi bor mahsulot bilan bir xil — alohida yangi mahsulot', row1);
  { const dwb = new ExcelJS.Workbook(); const dws = dwb.addWorksheet('S');
    dws.addRow(['Nomi *', 'Dona narxi', 'Karobkada (dona)', 'Artikul']);
    dws.addRow(['Taroq', 5000, 50, '']); dws.addRow(['Taroq', 6000, 50, '']); dws.addRow(['Taroq', 7000, 40, '']);
    dws.addRow(['Taroq A', 1, 1, 'TQ-1']); dws.addRow(['Taroq B', 1, 1, 'TQ-1']);
    const dfd = new FormData(); dfd.append('file', new Blob([await dwb.xlsx.writeBuffer()]), 'd.xlsx');
    const dr = (await admin.req('POST', '/api/import/products', dfd)).data;
    ok(dr.summary.create === 5 && dr.summary.error === 0, 'M13b bir xil nomli taroqlar va takror artikul — hammasi alohida, xatosiz', dr.summary);
    const nwb = new ExcelJS.Workbook(); const nws = nwb.addWorksheet('S');
    nws.addRow(['Nomi *', 'Brend', 'Rang', 'Karobkada (dona)', 'Dona narxi']);
    nws.addRow(['', 'Nivea', '', '', '']); nws.addRow(['', '', 'Qizil', -5, -100]); nws.addRow(['Faqat nom', '', '', '', '']);
    const nfd = new FormData(); nfd.append('file', new Blob([await nwb.xlsx.writeBuffer()]), 'n.xlsx');
    const nr = (await admin.req('POST', '/api/import/products', nfd)).data;
    ok(nr.summary.error === 0 && nr.summary.create === 3 && nr.rows[0].name === 'Nivea' && /qator/.test(nr.rows[1].name), 'M13c hech narsa majburiy emas: nomsiz / bo\'sh qatorlar ham import', nr.rows.map((x) => [x.name, x.notes])); }
  ok(row1 && row1.piece_price === 120000 && row1.box_price === 720000, 'M14 "120.000" o\'qiladi, karobka = dona × 6', row1 && [row1.piece_price, row1.box_price]);
  ok(row2 && row2.piece_price === 1450 && row2.box_price === 5800, 'M15 "1,450" o\'qiladi, karobka = dona × 4', row2 && [row2.piece_price, row2.box_price]);
  const row3 = r.data.rows.find((x) => x.name === 'Faqat Karobka');
  ok(row3 && row3.box_price === 5500000 && row3.piece_price === 1375000, 'M15b faqat karobka narxi ("5.500.000") — dona narxi undan', row3 && [row3.piece_price, row3.box_price]);
  // C6: o'chirilgan sotuvga bog'langan to'lovni tahrirlash
  const s6 = (await admin.post('/api/sales', { client_id: C3, items: [{ name: 'X', qty: 1, price: 5000 }], pay_now: { amount: 5000, method: 'cash' } })).data.id;
  const p6 = db.prepare('SELECT id FROM payments WHERE sale_id=?').get(s6).id;
  await admin.del('/api/sales/' + s6);
  r = await admin.put('/api/payments/' + p6, { client_id: C3, amount: 6000, method: 'cash', sale_id: s6 });
  ok(r.status === 200, 'M16 o\'chirilgan sotuv to\'lovini tahrirlash mumkin', r.data);
  // C7: qarzi bor mijozni o'chirib bo'lmaydi
  ok((await admin.del('/api/clients/' + C1)).status === 400, 'M17 balansi 0 bo\'lmagan mijozni o\'chirib bo\'lmaydi');
  // C9: sana va qarz summasi
  ok((await admin.post('/api/payments', { client_id: C3, amount: 100, date: '2026-02-31' })).status === 400, 'M18 31-fevral → 400');
  ok((await admin.post('/api/payments', { client_id: C3, amount: 100, date: '2026-05-10 25:61' })).status === 400, 'M19 25:61 vaqt → 400');
  const op = (await admin.post('/api/sales', { client_id: C3, kind: 'opening', total: 1000 })).data.id;
  ok((await admin.put('/api/sales/' + op, { client_id: C3, total: 0 })).status === 400, 'M20 qarz hujjatini 0 ga tushirib bo\'lmaydi');
  // C9: bekor → buyurtma qayta ochildi → tiklash ikki marta hisoblamaydi
  r = await sh2.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 1 }] }); const O3 = r.data.id;
  const sale3 = (await admin.post(`/api/orders/${O3}/confirm`)).data.id;
  await admin.post(`/api/sales/${sale3}/cancel`); await admin.post(`/api/orders/${O3}/reopen`);
  ok((await admin.post(`/api/sales/${sale3}/uncancel`)).status === 200 && (await admin.get('/api/orders/' + O3)).data.sale_id === sale3, 'M21 tiklangan sotuv buyurtmaga qayta bog\'lanadi');
  ok((await admin.post(`/api/orders/${O3}/confirm`)).status === 400, 'M22 keyin buyurtmani yana tasdiqlab bo\'lmaydi (ikki marta hisob yo\'q)');
  // S4: raqamni oldindan egallab olish
  const att = client('att'); r = await att.post('/api/shop/filial-a/web/register', { phone: '+998 99 123 45 67', password: 'hacker1', contact_name: 'Begona' });
  ok(r.status === 200, 'M23 begona raqam bilan ro\'yxat (tasdiqsiz)');
  ok((await client('att2').post('/api/shop/filial-a/web/login', { phone: '+998991234567', password: 'hacker1' })).status === 200, 'M24 o\'z paroli bilan kiradi');

  // ================= R. Kategoriya, mahsulot sahifasi, sharhlar =================
  const rvA = client('rvA'); rvA.set({ 'X-Shop-Token': (await rvA.post('/api/shop/filial-a/web/register', { phone: '+998 93 555 77 01', password: 'parol9', contact_name: 'Sayt Odamov' })).data.token });
  { const fd = new FormData(); for (const [k, v] of Object.entries({ name: 'Test krem', brand: 'TestBrand', category: 'Yuz parvarishi', volume: '50 ml', box_price: 1200000, box_qty: 12, description: 'Qatorli\ntavsif' })) fd.append(k, v);
    r = await admin.req('POST', '/api/products', fd); }
  const PK = r.data.id;
  ok(r.status === 200 && (await admin.get('/api/products/' + PK)).data.category === 'Yuz parvarishi', 'R1 mahsulot kategoriyasi saqlanadi');
  ok((await admin.get('/api/products/categories')).data.includes('Yuz parvarishi'), 'R2 kategoriyalar ro\'yxati');
  let cat = (await client('anon').get('/api/shop/filial-a/catalog')).data;
  let cp = cat.products.find((p) => p.id === PK);
  ok(cp && cp.category === 'Yuz parvarishi' && cp.reviews === 0, 'R3 katalogda kategoriya va baho maydonlari');
  r = await client('anon').get('/api/shop/filial-a/products/' + PK);
  ok(r.status === 200 && /Qatorli\r?\ntavsif/.test(r.data.description) && Array.isArray(r.data.list) && r.data.mine === null, 'R4 mahsulot sahifasi (mehmon)', r.data);
  ok((await client('anon').post(`/api/shop/filial-a/products/${PK}/review`, { rating: 5 })).status === 403, 'R5 kirmagan foydalanuvchi sharh yoza olmaydi');
  ok((await rvA.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 7 })).status === 400, 'R6 baho 1–5 oralig\'ida');
  ok((await rvA.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 4, text: 'Yaxshi krem' })).status === 200, 'R7 mijoz sharh yozadi');
  ok((await rvA.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 5, text: 'Juda yaxshi' })).status === 200, 'R8 qayta yozsa — yangilanadi');
  ok((await other.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 2, text: '<script>x</script>' })).status === 200, 'R9 boshqa mijoz sharhi');
  r = await rvA.get('/api/shop/filial-a/products/' + PK);
  ok(r.data.reviews === 2 && r.data.rating === 3.5 && r.data.list.length === 2 && r.data.mine.rating === 5, 'R10 o\'rtacha baho va soni (bitta mijoz — bitta sharh)', r.data);
  ok(r.data.list.every((x) => !('client_id' in x) && !/\+998/.test(x.author)), 'R11 sharhda mijozning ID/telefoni ko\'rinmaydi');
  ok((r.data.list.find((x) => x.mine) || {}).author === 'Sayt O.', 'R12 muallif: ism + familiya bosh harfi', r.data.list.map((x) => x.author));
  const RV = (await admin.get('/api/reviews?product=' + PK)).data.rows;
  ok(RV.length === 2 && RV.every((x) => x.client_name), 'R13 admin: mahsulot sharhlari ro\'yxati');
  const badRv = RV.find((x) => x.rating === 2);
  await admin.post(`/api/reviews/${badRv.id}/hide`, { hidden: 1 });
  r = await client('anon').get('/api/shop/filial-a/products/' + PK);
  ok(r.data.reviews === 1 && r.data.rating === 5 && r.data.list.length === 1, 'R14 yashirilgan sharh katalogda ko\'rinmaydi va bahoga qo\'shilmaydi');
  ok((await other.get('/api/shop/filial-a/products/' + PK)).data.mine.hidden === 1, 'R15 muallif o\'z yashirilgan sharhini ko\'radi');
  ok((await admin.get('/api/reviews?status=hidden')).data.rows.some((x) => x.id === badRv.id), 'R16 admin: yashirilganlar filtri');
  await admin.post(`/api/reviews/${badRv.id}/hide`, { hidden: 0 });
  ok((await admin.del('/api/reviews/' + badRv.id)).status === 200 && (await client('anon').get('/api/shop/filial-a/products/' + PK)).data.reviews === 1, 'R17 admin sharhni o\'chiradi');
  ok((await admin.post(`/api/reviews/${badRv.id}/restore`)).status === 200 && (await client('anon').get('/api/shop/filial-a/products/' + PK)).data.reviews === 2, 'R18 o\'chirilgan sharh tiklanadi');
  ok((await rvA.del(`/api/shop/filial-a/products/${PK}/review`)).status === 200 && (await rvA.get('/api/shop/filial-a/products/' + PK)).data.mine === null, 'R19 mijoz o\'z sharhini o\'chiradi');
  ok((await rvA.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 3 })).status === 200 && (await rvA.get('/api/shop/filial-a/products/' + PK)).data.mine.rating === 3, 'R20 o\'chirgandan keyin yana yoza oladi');
  cat = (await client('anon').get('/api/shop/filial-a/catalog')).data; cp = cat.products.find((p) => p.id === PK);
  ok(cp.reviews === 2 && cp.rating === 2.5, 'R21 katalog kartasida baho yangilanadi', cp);
  { const fd = new FormData(); for (const [k, v] of Object.entries({ name: 'Test krem', category: 'Yuz parvarishi', box_price: 1, box_qty: 1, in_shop: 0 })) fd.append(k, v);
    await admin.req('PUT', '/api/products/' + PK, fd); }
  ok((await client('anon').get('/api/shop/filial-a/products/' + PK)).status === 404 && (await rvA.post(`/api/shop/filial-a/products/${PK}/review`, { rating: 5 })).status === 404, 'R22 katalogdan olingan mahsulot sahifasi/sharhi yo\'q');
  ok((await client('anon').get('/api/shop/filial-a/products/999999')).status === 404, 'R23 mavjud bo\'lmagan mahsulot → 404');
  ok((await client('anon').get('/api/reviews')).status === 401, 'R24 admin sharh API — faqat xodimlar');

  // ================= P. Katalog dona bilan (optom narx donaga) + Excel shabloni =================
  ok((await admin.put('/api/settings', { sell_unit: 'piece' })).status === 200 && (await admin.get('/api/settings')).data.sell_unit === 'piece', 'P1 sozlama: dona');
  ok((await client('anon').get('/api/shop/filial-a/catalog')).data.sell_unit === 'piece', 'P2 katalog: dona rejimi');
  ok((await rvA.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'karobka', qty: 1 }] })).status === 400, 'P3 dona rejimida karobka rad etiladi');
  { const pp = (await admin.get('/api/products/' + P1)).data.piece_price;
    r = await rvA.post('/api/shop/filial-a/orders', { items: [{ product_id: P1, unit: 'dona', qty: 24 }] });
    ok(r.status === 200 && r.data.total === 24 * pp, 'P4 dona bilan buyurtma: 24 × dona narxi', r.data); }
  r = await admin.req('GET', '/api/import/products/template', undefined, true);
  { const twb = new ExcelJS.Workbook(); await twb.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const hdr = twb.worksheets[0].getRow(1).values.slice(1);
    ok(JSON.stringify(hdr.slice(0, 17)) === JSON.stringify(['Nomi', 'Shtrix-kod', 'Artikul', 'Brend', 'Kategoriya', "O'lchov birligi (dona, kg, litr, metr)", 'Qadoq nomi (karobka, qop, blok)', 'Karobkada (dona)', 'Rasm', 'Dona narxi', 'Tannarx (kelish narxi)', 'Minimal qoldiq', 'Kimlar uchun', 'Hajmi', "O'lcham", 'Rang (vergul bilan)', 'Tavsif'])
      && hdr.slice(17).every((h) => /^Narx: /.test(h)), 'P5 shablon ustunlari (+ narx turlari)', hdr); }
  { const uwb = new ExcelJS.Workbook(); const uws = uwb.addWorksheet('Sheet1');
    uws.addRow(['Nomi *', 'Brend', 'Kategoriya', 'Hajmi', 'Karobkada (dona)', 'Rasm', 'dona narxi']);
    uws.addRow(['nivea sprey ayollar uchun', 'NIVEA', 'Gigiyena', '150 ml', 24, null, 27000]);
    uws.addRow(['Rasm formulasi', 'X', 'Makiyaj', '', 12, { formula: 'IMAGE("https://example.invalid/r.png")' }, '15 000']);
    const ufd = new FormData(); ufd.append('file', new Blob([await uwb.xlsx.writeBuffer()]), 'u.xlsx');
    r = await admin.req('POST', '/api/import/products', ufd);
    const n1 = r.data.rows.find((x) => x.name === 'nivea sprey ayollar uchun'), n2 = r.data.rows.find((x) => x.name === 'Rasm formulasi');
    ok(n1 && n1.piece_price === 27000 && n1.box_qty === 24 && n1.box_price === 648000 && n1.category === 'Gigiyena', 'P6 sizning formatingiz: karobka = 27 000 × 24 = 648 000', n1);
    ok(n2 && n2.image_url === 'https://example.invalid/r.png' && n2.box_price === 180000, 'P7 IMAGE("url") formulasidan rasm havolasi', n2);
    const ufd2 = new FormData(); ufd2.append('file', new Blob([await uwb.xlsx.writeBuffer()]), 'u.xlsx');
    r = await admin.req('POST', '/api/import/products?commit=1', ufd2);
    const np = db.prepare("SELECT * FROM products WHERE name='nivea sprey ayollar uchun'").get();
    ok(r.status === 200 && np && np.box_price === 648000 && np.piece_price === 27000, 'P8 import saqlandi', r.data);
    const ip = db.prepare("SELECT image FROM products WHERE name='Rasm formulasi'").get();
    ok(ip && ip.image === 'https://example.invalid/r.png', 'P9 yuklab bo\'lmagan rasm — havola qoladi', ip); }

  // ================= V. O'lcham va ranglar =================
  { const vf = new FormData(); for (const [k, v] of Object.entries({ name: 'Taroq', size: 'XL', colors: "Qizil, ko'k , Qora, qizil", piece_price: 18000, box_qty: 50, initial_stock: 2 })) vf.append(k, v);
    r = await admin.req('POST', '/api/products', vf); }
  const PV = r.data.id;
  let pv = (await admin.get('/api/products/' + PV)).data;
  ok(pv.size === 'XL' && JSON.stringify(pv.colors) === JSON.stringify(['Qizil', "ko'k", 'Qora']), 'V1 ranglar alohida saqlandi (takror olib tashlandi)', pv.colors);
  ok(db.prepare('SELECT COUNT(*) n FROM product_colors WHERE product_id=?').get(PV).n === 3, 'V2 bazada 3 ta alohida qator');
  const cpv = (await client('anon').get('/api/shop/filial-a/catalog')).data.products.find((x) => x.id === PV);
  ok(cpv && cpv.size === 'XL' && cpv.colors.length === 3, 'V3 katalogda o\'lcham va ranglar');
  ok((await rvA.post('/api/shop/filial-a/orders', { items: [{ product_id: PV, unit: 'dona', qty: 10 }] })).status === 200, 'V4 rang ixtiyoriy — rangsiz buyurtma ham qabul');
  ok((await rvA.post('/api/shop/filial-a/orders', { items: [{ product_id: PV, unit: 'dona', qty: 10, color: 'Yashil' }] })).status === 400, 'V5 mavjud bo\'lmagan rang rad etiladi');
  r = await rvA.post('/api/shop/filial-a/orders', { items: [{ product_id: PV, unit: 'dona', qty: 10, color: 'qizil' }, { product_id: PV, unit: 'dona', qty: 5, color: 'Qora' }] });
  ok(r.status === 200, 'V6 rang bilan buyurtma', r.data);
  const OV = r.data.id;
  ok(JSON.stringify(db.prepare('SELECT color FROM order_items WHERE order_id=? ORDER BY id').all(OV).map((x) => x.color)) === '["Qizil","Qora"]', 'V7 buyurtmada rang saqlandi (to\'g\'ri yozilishda)');
  r = await admin.post(`/api/orders/${OV}/confirm`, {});
  ok(r.status === 200 && JSON.stringify(db.prepare('SELECT color FROM sale_items WHERE sale_id=? ORDER BY id').all(r.data.id).map((x) => x.color)) === '["Qizil","Qora"]', 'V8 tasdiqlangach sotuvda ham rang', r.data);
  ok((await admin.post(`/api/products/${PV}/stock`, { unit: 'dona', qty: 20, color: 'Qora' })).status === 200, 'V9 rang bilan kirim');
  ok((await admin.post(`/api/products/${PV}/stock`, { unit: 'dona', qty: 1, color: 'Pushti' })).status === 400, 'V10 noto\'g\'ri rang bilan kirim → 400');
  pv = (await admin.get('/api/products/' + PV)).data;
  const st = Object.fromEntries(pv.color_stats.map((x) => [x.color, x]));
  ok(st.Qizil.sold === 10 && st.Qora.sold === 5 && st.Qora.in === 20 && st[''].in === 2, 'V11 rang bo\'yicha kirim / sotuv', pv.color_stats);
  ok(pv.sales.some((x) => x.color === 'Qizil'), 'V12 mahsulot sotuvlarida rang');
  ok((await admin.post('/api/sales', { client_id: C1, items: [{ product_id: PV, unit: 'dona', qty: 1, color: 'Oq' }] })).status === 400, 'V13 admin sotuvda ham noto\'g\'ri rang rad etiladi');
  { const ewb = new ExcelJS.Workbook(); const ews = ewb.addWorksheet('S');
    ews.addRow(['Nomi *', "O'lcham", 'Rang', 'Karobkada (dona)', 'Dona narxi']);
    ews.addRow(['Futbolka', 'M', "Oq, Qora , Ko'k", 20, 50000]); ews.addRow(['Futbolka', 'XL', 'Oq', 20, 55000]);
    const efd = new FormData(); efd.append('file', new Blob([await ewb.xlsx.writeBuffer()]), 'e.xlsx');
    r = await admin.req('POST', '/api/import/products?commit=1', efd);
    const fs = db.prepare("SELECT * FROM products WHERE name='Futbolka' ORDER BY id").all();
    ok(r.status === 200 && fs.length === 2 && fs[0].size === 'M' && fs[1].size === 'XL', 'V14 Excel: har o\'lcham alohida mahsulot', fs.map((x) => x.size));
    ok(fs.length === 2 && db.prepare('SELECT COUNT(*) n FROM product_colors WHERE product_id=?').get(fs[0].id).n === 3, 'V15 Excel: vergulli ranglar alohida saqlandi'); }

  // ================= W. Kimlar uchun (ixtiyoriy) =================
  { const wf = new FormData(); for (const [k, v] of Object.entries({ name: 'Erkak atiri', audience: 'men', piece_price: 1000, box_qty: 1 })) wf.append(k, v);
    r = await admin.req('POST', '/api/products', wf); }
  ok((await admin.get('/api/products/' + r.data.id)).data.audience === 'men', 'W1 formadan: erkaklar uchun');
  ok((await client('anon').get('/api/shop/filial-a/catalog')).data.products.find((x) => x.id === r.data.id).audience === 'men', 'W2 katalogda audience');
  { const wwb = new ExcelJS.Workbook(); const wws = wwb.addWorksheet('S');
    wws.addRow(['Nomi', 'Kimlar uchun']);
    wws.addRow(['W-a', 'Ayollar uchun']); wws.addRow(['W-b', 'Мужской']); wws.addRow(['W-c', 'uniseks']); wws.addRow(['W-d', '']); wws.addRow(['W-e', 'nimadir']);
    const wfd = new FormData(); wfd.append('file', new Blob([await wwb.xlsx.writeBuffer()]), 'w.xlsx');
    const wr = (await admin.req('POST', '/api/import/products', wfd)).data;
    ok(JSON.stringify(wr.rows.map((x) => x.audience)) === '["women","men","unisex","",""]' && wr.summary.error === 0, 'W3 Excel "Kimlar uchun" — ixtiyoriy, matndan aniqlanadi', wr.rows.map((x) => x.audience)); }

  // ================= Q. POS: tez mijoz (telefon / ism / chakana) =================
  r = await admin.post('/api/clients/quick', { query: '907891234' });
  ok(r.status === 200 && r.data.created && r.data.client.phone === '+998907891234' && r.data.client.type === 'b2c', 'Q1 9 raqam → +998907891234 yangi mijoz', r.data);
  const QC = r.data.client.id;
  for (const v of ['+998907891234', '+998 90 789 12 34', '998907891234', '+998 +998 907891234', '(90) 789-12-34']) {
    r = await admin.post('/api/clients/quick', { query: v });
    ok(r.status === 200 && !r.data.created && r.data.client.id === QC, `Q2 "${v}" — o'sha mijoz topiladi`, r.data);
  }
  r = await admin.post('/api/clients/quick', { query: '65645645656' });
  ok(r.status === 200 && r.data.created && r.data.client.phone === '65645645656' && (await admin.post('/api/clients/quick', { query: '65645645656' })).data.client.id === r.data.client.id, 'Q3 boshqa formatdagi raqam (11 raqam) ham yaratiladi, qayta — topiladi', r.data);
  r = await admin.post('/api/clients/quick', { query: 'Anvar aka' });
  ok(r.data.created && r.data.client.contact_name === 'Anvar aka' && (await admin.post('/api/clients/quick', { query: 'anvar aka' })).data.client.id === r.data.client.id, 'Q4 ism bilan yaratish / qayta topish');
  r = await admin.post('/api/clients/quick', {});
  const WI = r.data.client.id;
  ok(r.data.client.contact_name === 'Chakana xaridor' && (await admin.post('/api/clients/quick', { query: '' })).data.client.id === WI, 'Q5 bo\'sh — bitta "Chakana xaridor"');
  ok((await admin.post('/api/sales', { client_id: WI, items: [{ product_id: P1, unit: 'dona', qty: 1 }], pay_now: { amount: 100000, method: 'cash' } })).status === 200, 'Q6 chakana xaridorga sotuv');
  ok((await admin.get('/api/clients?q=907891234')).data.rows.some((c) => c.id === QC), 'Q7 qidiruvda 9 raqam bilan topiladi');

  // ================= K2. Kategoriya / brend — katta-kichik harf farqsiz =================
  { const mk = async (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return (await admin.req('POST', '/api/products', f)).data.id; };
    const a1 = await mk({ name: 'K-a', category: 'Soch parvarishi', brand: 'Augo' });
    const a2 = await mk({ name: 'K-b', category: 'soch PARVARISHI ', brand: 'augo' });
    const pr = (id) => db.prepare('SELECT category, brand FROM products WHERE id=?').get(id);
    ok(pr(a2).category === 'Soch parvarishi' && pr(a2).brand === 'Augo', 'K2a bir xil kategoriya / brend turlicha yozilsa — bittaga', pr(a2));
    const kwb = new ExcelJS.Workbook(); const kws = kwb.addWorksheet('S');
    kws.addRow(['Nomi', 'Kategoriya', 'Brend']); kws.addRow(['K-c', 'SOCH parvarishi', 'AUGO']); kws.addRow(['K-d', 'yangi turkum', 'x']); kws.addRow(['K-e', 'Yangi Turkum', 'X']);
    const kfd = new FormData(); kfd.append('file', new Blob([await kwb.xlsx.writeBuffer()]), 'k.xlsx');
    const kr = (await admin.req('POST', '/api/import/products', kfd)).data.rows;
    ok(kr[0].category === 'Soch parvarishi' && kr[0].brand === 'Augo' && kr[1].category === 'Yangi turkum' && kr[2].category === 'Yangi turkum' && kr[2].brand === 'X', 'K2b Excel: mavjudiga moslanadi', kr.map((x) => [x.category, x.brand])); }

  // ================= T. Telegram to'liq olib tashlangan =================
  for (const [m, p] of [['post', '/api/auth/tg-link'], ['post', '/api/auth/tg-notify'], ['post', '/api/auth/dev-tg-link'], ['get', '/api/orders/links/list'],
    ['post', '/api/shop/filial-a/link'], ['post', '/api/shop/filial-a/dev-contact'], ['post', '/api/shop/filial-a/lang']]) {
    r = await admin[m](p, {}); ok(r.status === 404, `T1 ${p} → 404`, r.status);
  }
  r = await admin.get('/api/auth/me');
  ok(!('telegram' in r.data) && !('admin_bot' in r.data), 'T2 /me da Telegram maydonlari yo\'q', r.data);
  r = await admin.get('/api/settings');
  ok(!('bot_username' in r.data) && !('admin_bot_username' in r.data) && !('notify_lang' in r.data) && !('password_hash' in r.data), 'T3 sozlamalarda bot maydonlari yo\'q', r.data);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  ok(!tables.some((t) => ['link_requests', 'staff_tg_links', 'password_resets'].includes(t)), 'T4 Telegram jadvallari yo\'q', tables);
  const ccols = db.prepare('PRAGMA table_info(clients)').all().map((c) => c.name);
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  ok(![...ccols, ...ucols].some((c) => /telegram|tg_/.test(c)), 'T5 Telegram ustunlari yo\'q');

  // ================= L. Butun baza: hisob-kitob o'zgarmasliklari =================
  const live = require(ROOT + '/node_modules/better-sqlite3')(DATA + '/branches/1/app.db', { readonly: true });
  const bad = [];
  for (const c of live.prepare('SELECT id, balance FROM clients').all()) {
    const inn = live.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE client_id=? AND deleted_at IS NULL AND direction='in'").get(c.id).v;
    const out = live.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE client_id=? AND deleted_at IS NULL AND direction='out'").get(c.id).v;
    const sal = live.prepare("SELECT COALESCE(SUM(total),0) v FROM sales WHERE client_id=? AND deleted_at IS NULL AND status='confirmed'").get(c.id).v;
    if (c.balance !== inn - out - sal) bad.push(`mijoz ${c.id}: ${c.balance} ≠ ${inn - out - sal}`);
  }
  ok(!bad.length, 'L1 har bir mijoz balansi = kirim − chiqim − sotuv', bad.slice(0, 5));
  const bad2 = [];
  for (const s of live.prepare("SELECT * FROM sales WHERE deleted_at IS NULL AND status='confirmed'").all()) {
    const al = live.prepare('SELECT COALESCE(SUM(amount),0) v FROM allocations WHERE sale_id=?').get(s.id).v;
    if (al !== s.paid_amount) bad2.push(`${s.number}: paid ${s.paid_amount} ≠ alloc ${al}`);
    if (s.paid_amount > s.total) bad2.push(`${s.number}: ortiqcha to'langan`);
    if ((s.paid_amount >= s.total) !== !!s.closed_at) bad2.push(`${s.number}: closed_at mos emas`);
  }
  ok(!bad2.length, 'L2 sotuvlar: to\'langan = taqsimot, yopilish sanasi to\'g\'ri', bad2.slice(0, 5));
  const bad3 = live.prepare(`SELECT p.id, p.amount, SUM(a.amount) s FROM payments p JOIN allocations a ON a.payment_id=p.id
    WHERE p.deleted_at IS NULL GROUP BY p.id HAVING s > p.amount`).all();
  ok(!bad3.length, 'L3 hech bir to\'lov o\'z summasidan ko\'p taqsimlanmagan', bad3.slice(0, 3));
  const bad4 = live.prepare(`SELECT a.id FROM allocations a LEFT JOIN payments p ON p.id=a.payment_id LEFT JOIN sales s ON s.id=a.sale_id
    WHERE p.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL OR s.status!='confirmed'`).all();
  ok(!bad4.length, 'L4 o\'chirilgan/bekor hujjatlarga taqsimot yo\'q', bad4.length);
  // Ombor: API qoldig'i = kirimlar − sotilgan
  const prods = (await admin.get('/api/products')).data;
  const bad5 = [];
  for (const p of prods) {
    const mv = live.prepare('SELECT COALESCE(SUM(qty_pieces),0) v FROM stock_moves WHERE product_id=? AND deleted_at IS NULL').get(p.id).v;
    const sold = live.prepare(`SELECT COALESCE(SUM(i.qty * CASE WHEN i.unit='karobka' THEN i.box_qty ELSE 1 END),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE i.product_id=? AND s.status='confirmed' AND s.deleted_at IS NULL`).get(p.id).v;
    if (p.stock !== mv - sold) bad5.push(`${p.name}: ${p.stock} ≠ ${mv - sold}`);
  }
  ok(!bad5.length, 'L5 ombor qoldig\'i to\'g\'ri', bad5.slice(0, 3));
  const neg = prods.filter((p) => p.stock < 0).map((p) => p.name + ':' + p.stock);
  console.log('   (ma\'lumot) manfiy qoldiqli mahsulotlar:', neg.length ? neg.join(', ') : "yo'q");

  console.log(`\nNATIJA: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗', f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(2); });
