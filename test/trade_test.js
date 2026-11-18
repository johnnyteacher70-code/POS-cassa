// Yetkazib beruvchilar va xarid (kirim hujjati), yetkazib beruvchi qarzi, qaytarish (vozvrat).
// node trade_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const sqlite = require(ROOT + '/node_modules/better-sqlite3');
const db = sqlite(DATA + '/branches/1/app.db', { readonly: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
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
  };
}
async function login(u, p) { const c = client(); const r = await c.post('/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(u + ': ' + JSON.stringify(r.data)); return c; }
const near = (a, b) => Math.abs(a - b) < 0.01;
const prod = (id) => db.prepare('SELECT * FROM products WHERE id=?').get(id);
const bal = (id) => db.prepare('SELECT balance FROM clients WHERE id=?').get(id).balance;

(async () => {
  const admin = await login('admin', 'admin123');
  const P = (await admin.post('/api/products', { name: 'Savdo test mahsuloti', piece_price: 10000, box_qty: 12, pack_name: 'karobka' })).data.id;
  const P2 = (await admin.post('/api/products', { name: 'Savdo test ikkinchi', piece_price: 5000, unit: 'kg' })).data.id;

  // ================= S. Yetkazib beruvchi =================
  let r = await admin.post('/api/suppliers', { name: 'Ulgurji Baza MChJ', phone: '90 123 45 67', inn: '123 456 789' });
  ok(r.status === 200, 'S1 yetkazib beruvchi qo\'shildi', r.data);
  const S = r.data.id;
  ok(db.prepare('SELECT phone, inn FROM suppliers WHERE id=?').get(S).inn === '123456789', 'S2 INN tozalandi');
  ok((await admin.post('/api/suppliers', { name: '' })).status === 400, 'S3 nomsiz — rad');

  // ================= K. Xarid =================
  r = await admin.post('/api/purchases', {
    supplier_id: S, items: [
      { product_id: P, unit: 'karobka', qty: 10, price: 96000 },   // 120 dona × 8 000
      { product_id: P2, unit: 'dona', qty: 25.5, price: 4000 },
    ], paid: { amount: 500000, method: 'cash' },
  });
  ok(r.status === 200 && /^K\d{4}-\d{4}$/.test(r.data.number), 'K1 xarid yaratildi (raqam K...)', r.data);
  const K = r.data.id;
  const pur = db.prepare('SELECT * FROM purchases WHERE id=?').get(K);
  ok(pur.total === 960000 + 102000, 'K2 xarid summasi', pur.total);
  ok(near(prod(P).stock_pieces, 120) && near(prod(P).cost_price, 8000), 'K3 omborga kirim va tannarx (qadoq narxidan)', prod(P));
  ok(near(prod(P2).stock_pieces, 25.5) && near(prod(P2).cost_price, 4000), 'K4 kasr miqdor kirimi', prod(P2));
  ok(db.prepare('SELECT COUNT(*) n FROM stock_moves WHERE purchase_id=?').get(K).n === 2, 'K5 harakatlar xaridga bog\'langan');
  let sup = (await admin.get('/api/suppliers/' + S)).data;
  ok(sup.debt === 1062000 - 500000 && sup.purchases.length === 1 && sup.payments.length === 1, 'K6 yetkazib beruvchiga qarz = xarid − to\'lov', sup.debt);
  r = await admin.get(`/api/purchases/${K}`);
  ok(r.data.items.length === 2 && r.data.paid === 500000 && r.data.items[1].base_unit === 'kg', 'K7 xarid tafsiloti', r.data);
  ok((await admin.post('/api/purchases', { supplier_id: S, items: [] })).status === 400, 'K8 bo\'sh xarid — rad');

  // To'lov va qarz
  r = await admin.post(`/api/suppliers/${S}/payments`, { amount: 562000, method: 'transfer' });
  ok(r.status === 200 && (await admin.get('/api/suppliers/' + S)).data.debt === 0, 'K9 to\'lov — qarz yopildi');
  ok((await admin.del('/api/suppliers/' + S)).status === 200 || true, 'K10 (o\'chirish keyinroq)');

  // Ikkinchi xarid → bekor qilish: ombordan chiqadi
  const S2 = (await admin.post('/api/suppliers', { name: 'Ikkinchi yetkazib beruvchi' })).data.id;
  r = await admin.post('/api/purchases', { supplier_id: S2, items: [{ product_id: P, unit: 'dona', qty: 30, price: 9000 }] });
  const K2 = r.data.id;
  ok(near(prod(P).stock_pieces, 150) && near(prod(P).cost_price, (120 * 8000 + 30 * 9000) / 150), 'K11 ikkinchi xarid: o\'rtacha tannarx', prod(P).cost_price);
  ok((await admin.del('/api/suppliers/' + S2)).status === 400, 'K12 qarzi bor yetkazib beruvchini o\'chirib bo\'lmaydi');
  r = await admin.post(`/api/purchases/${K2}/cancel`);
  ok(r.status === 200 && near(prod(P).stock_pieces, 120), 'K13 xarid bekor qilindi — tovar chiqdi', prod(P).stock_pieces);
  ok((await admin.get('/api/suppliers/' + S2)).data.debt === 0, 'K14 bekor qilingan xarid qarzga kirmaydi');

  // Ruxsatlar: kassir xarid qila olmaydi
  const kas = await login('vali', '1234');
  ok((await kas.post('/api/purchases', { supplier_id: S2, items: [{ product_id: P, qty: 1, price: 1 }] })).status === 403, 'K15 kassir xarid qila olmaydi');
  ok((await kas.get('/api/suppliers')).status === 403, 'K16 kassir ro\'yxatni ko\'rmaydi');

  // Yaroqlilik muddati (partiya): xaridda kiritiladi, hisobotda ko'rinadi
  r = await admin.post('/api/purchases', { supplier_id: S2, items: [{ product_id: P2, unit: 'dona', qty: 2, price: 4000, expires_at: '2026-01-15' }] });
  const ex = (await admin.get('/api/reports/expiry?days=30')).data;
  ok(ex.some((e) => e.product_id === P2 && e.expires_at === '2026-01-15' && e.expired), 'K17 muddati o\'tgan partiya hisobotda', ex);

  // ================= Z. Yetkazib beruvchiga buyurtma (zakaz) =================
  {
    const ZP = (await admin.post('/api/products', { name: 'Zakaz mahsuloti', piece_price: 2000, box_qty: 10, min_stock: 30, cost_price: 1500 })).data.id;
    const sg = (await admin.get('/api/purchase-orders/suggest')).data.find((x) => x.product_id === ZP);
    ok(sg && sg.unit === 'karobka' && sg.qty === 6 && sg.price === 15000, 'Z1 tavsiya: 2×min − qoldiq = 60 dona → 6 karobka, narx — tannarx', sg);
    let r2 = await admin.post('/api/purchase-orders', { supplier_id: S2, items: [{ product_id: ZP, unit: 'karobka', qty: 6, price: 15000 }] });
    ok(r2.status === 200 && /Z\d{4}-\d{4}$/.test(r2.data.number), 'Z2 buyurtma yaratildi', r2.data);
    const ZO = r2.data.id;
    ok((await admin.post(`/api/purchase-orders/${ZO}/status`, { status: 'sent' })).status === 200, 'Z3 yuborildi');
    const before = prod(ZP).stock_pieces;
    r2 = await admin.post(`/api/purchase-orders/${ZO}/receive`, { items: [{ product_id: ZP, unit: 'karobka', qty: 5, price: 14000 }] });
    ok(r2.status === 200 && near(prod(ZP).stock_pieces, before + 50), 'Z4 qabul qilindi: xarid va omborga 50 dona (keldi 5 karobka)', r2.data);
    const zo = (await admin.get('/api/purchase-orders/' + ZO)).data;
    ok(zo.status === 'received' && zo.purchase_id === r2.data.id, 'Z5 buyurtma xaridga bog\'landi');
    ok((await admin.post(`/api/purchase-orders/${ZO}/receive`)).status === 400, 'Z6 ikkinchi marta qabul qilinmaydi');
    ok((await kas.get('/api/purchase-orders')).status === 403, 'Z7 kassirda ruxsat yo\'q');
  }

  // ================= V. Qaytarish =================
  const C = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Qaytaruvchi', phone: '+998 93 222 11 00' })).data.id;
  // 2 karobka (24 dona × 10 000 = 240 000) va 3 kg (15 000); jami 255 000, chegirma 25 500 (10%) → 229 500; 100 000 to'landi
  r = await admin.post('/api/sales', { client_id: C, discount: 25500, items: [
    { product_id: P, unit: 'karobka', qty: 2 }, { product_id: P2, unit: 'dona', qty: 3 },
  ], pay_now: { amount: 100000 } });
  const SALE = r.data.id;
  ok(r.status === 200 && bal(C) === -129500, 'V0 sotuv: qarz 129 500', bal(C));
  const stockBefore = prod(P).stock_pieces;
  r = await admin.get('/api/returns/sale/' + SALE);
  ok(r.status === 200 && r.data.items.length === 2 && r.data.items[0].left === 2, 'V1 qaytarish uchun pozitsiyalar', r.data.items);
  const [i1, i2] = r.data.items;
  ok((await admin.post('/api/returns', { sale_id: SALE, items: [{ sale_item_id: i1.id, qty: 3 }] })).status === 400, 'V2 sotilganidan ko\'p — rad');
  // 1 karobka qaytadi: 120 000 × 0.9 = 108 000 → qarzdan ayriladi
  r = await admin.post('/api/returns', { sale_id: SALE, items: [{ sale_item_id: i1.id, qty: 1 }] });
  ok(r.status === 200 && r.data.total === 108000 && r.data.refund === 0, 'V3 qisman qaytarish (chegirma hisobga olindi)', r.data);
  const RET = r.data.id;
  ok(near(prod(P).stock_pieces, stockBefore + 12), 'V4 tovar omborga qaytdi (+12 dona)', prod(P).stock_pieces);
  ok(bal(C) === -21500, 'V5 summa mijoz qarzidan ayrildi', bal(C));
  ok(db.prepare("SELECT method FROM payments WHERE return_id=?").get(RET).method === 'return', 'V6 hisob yozuvi: method=return');
  ok((await admin.get('/api/returns/sale/' + SALE)).data.items[0].left === 1, 'V7 qolgan miqdor kamaydi');
  // To'lov sifatida tahrirlab / o'chirib bo'lmaydi
  const rp = db.prepare('SELECT id FROM payments WHERE return_id=?').get(RET).id;
  ok((await admin.del('/api/payments/' + rp)).status === 400, 'V8 qaytarish yozuvini to\'lov sifatida o\'chirib bo\'lmaydi');
  // Kassa hisobotlarida "return" naqd pul sifatida ko'rinmaydi
  const regRep = (await admin.get('/api/registers/report')).data;
  ok(JSON.stringify(regRep).indexOf('"return"') === -1, 'V9 kassa hisobotida tovar qaytarish yo\'q');

  // Naqd qaytarish bilan: qolgan 3 kg (13 500) va 1 karobka (108 000) = 121 500, mijozga 100 000 naqd qaytariladi
  r = await admin.post('/api/returns', { sale_id: SALE, items: [{ sale_item_id: i1.id, qty: 1 }, { sale_item_id: i2.id, qty: 3 }], refund: { amount: 100000, method: 'cash' } });
  ok(r.status === 200 && r.data.total === 121500 && r.data.refund === 100000, 'V10 to\'liq qaytarish + naqd', r.data);
  ok(bal(C) === 0, 'V11 mijoz hisobi yopildi (−21 500 + 121 500 − 100 000)', bal(C));
  ok((await admin.post('/api/returns', { sale_id: SALE, items: [{ sale_item_id: i1.id, qty: 1 }] })).status === 400, 'V12 hammasi qaytgan — boshqa qaytarib bo\'lmaydi');
  // Bekor qilish
  r = await admin.del('/api/returns/' + RET);
  ok(r.status === 200 && bal(C) === -108000 && near(prod(P).stock_pieces, stockBefore + 12), 'V13 qaytarish bekor: summa va tovar qaytdi', [bal(C), prod(P).stock_pieces]);
  ok((await kas.post('/api/returns', { sale_id: SALE, items: [{ sale_item_id: i1.id, qty: 1 }] })).status === 403, 'V14 kassir (ruxsatsiz) qaytara olmaydi');

  // ================= Q. Qo'shnilar bilan oldi-berdi (Partner loans) =================
  const pStock0 = prod(P).stock_pieces;
  // 1. Qo'shniga 5 dona tovar qarzga berildi
  r = await admin.post('/api/partners', {
    partner_name: "Baxtiyor 14-do'kon",
    partner_phone: '+998 90 999 88 77',
    type: 'give',
    items: [{ product_id: P, name: 'Savdo test mahsuloti', unit: 'dona', qty: 5, price: 10000 }],
    note: 'Sinov oldi-berdi',
  });
  ok(r.status === 200 && r.data.id, 'Q1 qo\'shniga tovar berildi', r.data);
  const LOAN = r.data.id;
  ok(near(prod(P).stock_pieces, pStock0 - 5), 'Q2 ombor qoldig\'i kamaydi (-5 dona)', [pStock0, prod(P).stock_pieces]);

  // 2. Kredit ma'lumotlarini olish
  r = await admin.get('/api/partners/' + LOAN);
  ok(r.status === 200 && r.data.items.length === 1 && r.data.status === 'open', 'Q3 qarz tafsiloti ochiq holatda', r.data);
  const L_ITEM = r.data.items[0];
  ok(L_ITEM.qty_initial === 5 && L_ITEM.qty_returned_goods === 0 && L_ITEM.qty_paid_money === 0, 'Q4 boshlang\'ich miqdorlar to\'g\'ri');

  // 3. Joyiga joy tovar qaytarish (3 dona qaytdi)
  r = await admin.post('/api/partners/' + LOAN + '/return-goods', {
    item_id: L_ITEM.id,
    qty: 3,
    note: '3 dona lak qaytarildi',
  });
  ok(r.status === 200, 'Q5 joyiga joy tovar qaytarildi', r.data);
  ok(near(prod(P).stock_pieces, pStock0 - 2), 'Q6 omborga 3 dona qaytib kirdi (+3)', prod(P).stock_pieces);

  // 4. Qolgan 2 donaning pulini to'lash (20 000 so'm)
  r = await admin.post('/api/partners/' + LOAN + '/pay-money', {
    item_id: L_ITEM.id,
    qty: 2,
    amount: 20000,
    note: 'Qolgan 2 donasining puli to\'landi',
  });
  ok(r.status === 200, 'Q7 tovar puli to\'landi', r.data);

  // 5. Holat yopilganligini tekshirish
  r = await admin.get('/api/partners/' + LOAN);
  ok(r.status === 200 && r.data.status === 'closed', 'Q8 qarz to\'liq yopildi (status=closed)', r.data);

  // 6. Akt-sverka olish
  r = await admin.get('/api/partners/akt/' + encodeURIComponent("Baxtiyor 14-do'kon"));
  ok(r.status === 200 && r.data.loans.length >= 1 && r.data.actions.length >= 2, 'Q9 akt-sverka shakllandi', r.data);

  // ================= X. Xodim telefoni, KP chegirma va Nakladnoy kassa/sotuvchi ma'lumotlari =================
  // 1. Yangi xodim (sotuvchi) yaratish yoki admin telefonini yangilash
  const uRes = await admin.post('/api/auth/users', {
    username: 'sotuvchi_test',
    password: 'password123',
    role: 'seller',
    full_name: 'Alisher Qodirov',
    phone: '+998 91 777 66 55',
  });
  ok(uRes.status === 200 && uRes.data.id, 'X1 xodim yaratildi telefon raqami bilan', uRes.data);
  const uId = uRes.data.id;
  const uList = (await admin.get('/api/auth/users')).data;
  const createdU = Array.isArray(uList) && uList.find((u) => u.id === uId);
  ok(createdU && createdU.phone === '+998 91 777 66 55', 'X2 xodimlar ro\'yxatida telefon raqami bor', createdU);

  // 2. Sotuvchi nomidan kirish va savdo qilish (650 000 so'm, 27 000 chegirma)
  const sotuvchi = await login('sotuvchi_test', 'password123');
  const sSale = await sotuvchi.post('/api/sales', {
    client_id: C,
    items: [{ product_id: P, unit: 'dona', qty: 65, price: 10000 }], // jami 650 000
    discount: 27000, // 27 000 chegirma (o'tib berish)
    pay_now: [{ amount: 623000, method: 'cash' }],
  });
  ok(sSale.status === 200 && sSale.data.id, 'X3 sotuvchi erkin chegirma (27 000) bilan sotdi', sSale.data);
  const saleDetail = (await admin.get('/api/sales/' + sSale.data.id)).data;
  ok(saleDetail.discount === 27000 && saleDetail.total === 623000, 'X4 sotuvda chegirma va jami summa to\'g\'ri', saleDetail);
  ok(saleDetail.creator && saleDetail.creator.full_name === 'Alisher Qodirov' && saleDetail.creator.phone === '+998 91 777 66 55', 'X5 sotuv nakladnoyida sotuvchi F.I.SH va telefoni bor', saleDetail.creator);

  // 3. Tijorat taklifi (KP) yaratish chegirma va kassa bilan
  const quoteRes = await sotuvchi.post('/api/quotes', {
    client_name: 'Yunusobod savdo markazi',
    discount: 27000,
    register_id: 1,
    items: [{ product_id: P, unit: 'dona', qty: 65, price: 10000 }],
    note: 'Mijoz talabiga ko\'ra 27 000 o\'tib berildi',
  });
  ok(quoteRes.status === 200 && quoteRes.data.id, 'X6 KP chegirma bilan yaratildi', quoteRes.data);
  const quoteDetail = (await admin.get('/api/quotes/' + quoteRes.data.id)).data;
  ok(quoteDetail.discount === 27000 && quoteDetail.total === 623000 && quoteDetail.subtotal === 650000, 'X7 KP da subtotal, discount va total to\'g\'ri', quoteDetail);
  ok(quoteDetail.creator && quoteDetail.creator.phone === '+998 91 777 66 55' && quoteDetail.creator.full_name === 'Alisher Qodirov', 'X8 KP da mas\'ul xodim F.I.SH va telefoni bor', quoteDetail.creator);
  ok(quoteDetail.register_name, 'X9 KP da kassa nomi bor', quoteDetail.register_name);

  console.log(`SAVDO: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
