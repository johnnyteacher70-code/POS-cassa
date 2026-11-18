// Universal mahsulot: o'lchov birligi va qadoq, kasr miqdor, shtrix-kod, tannarx (o'rtacha tortilgan), narx turlari.
// node products_test.js <baseURL> <DATA_DIR> <projectRoot>
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
    cookie() { return cookie; },
  };
}
async function login(u, p) { const c = client(); const r = await c.post('/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(u + ': ' + JSON.stringify(r.data)); return c; }
const near = (a, b) => Math.abs(a - b) < 0.01;
const prod = (id) => db.prepare('SELECT * FROM products WHERE id=?').get(id);

(async () => {
  const admin = await login('admin', 'admin123');

  // ================= M. Mahsulot: birlik, qadoq, shtrix-kod, tannarx =================
  let r = await admin.post('/api/products', {
    name: 'Guruch Lazer', unit: 'kg', pack_name: 'qop', box_qty: 50, piece_price: 12000, cost_price: 0,
    barcode: '4780000000017', min_stock: 10, category: 'Bakaleya',
  });
  ok(r.status === 200, 'M1 kg mahsulot yaratildi', r.data);
  const G = r.data.id;
  let p = prod(G);
  ok(p.unit === 'kg' && p.pack_name === 'qop' && p.box_qty === 50 && p.box_price === 600000 && p.min_stock === 10, 'M2 birlik, qadoq, qadoq narxi avtomatik', p);
  ok((await admin.post('/api/products', { name: 'Boshqa', piece_price: 1, barcode: '4780000000017' })).status === 400, 'M3 takroriy shtrix-kod — rad');
  ok((await admin.post('/api/products', { name: 'Boshqa', piece_price: 1, barcode: 'abc<>' })).status === 400, 'M4 noto\'g\'ri shtrix-kod — rad');
  ok((await admin.post('/api/products', { name: 'Noma\'lum birlik', piece_price: 1, unit: 'tonna' })).data.id && prod((await admin.get('/api/products?q=Noma')).data[0].id).unit === 'dona', 'M5 noma\'lum birlik → dona');
  ok((await admin.get('/api/products?q=4780000000017')).data.some((x) => x.id === G), 'M6 shtrix-kod bo\'yicha qidiruv');

  // Kirim narxi bilan: 2 qop × 500 000 → 100 kg, tannarx 10 000/kg
  r = await admin.post(`/api/products/${G}/stock`, { unit: 'karobka', qty: 2, cost: 500000 });
  ok(r.status === 200 && near(prod(G).stock_pieces, 100) && near(prod(G).cost_price, 10000), 'T1 qadoqda kirim: qoldiq 100 kg, tannarx 10 000', prod(G));
  // 50 kg × 8 000 → (100×10000 + 50×8000) / 150 = 9333.33
  await admin.post(`/api/products/${G}/stock`, { unit: 'dona', qty: 50, cost: 8000 });
  ok(near(prod(G).cost_price, 9333.33), 'T2 o\'rtacha tortilgan tannarx', prod(G).cost_price);
  ok(db.prepare('SELECT cost FROM stock_moves WHERE product_id=? ORDER BY id DESC LIMIT 1').get(G).cost === 8000, 'T3 kirim narxi harakatda saqlandi');
  // Kasr hisobdan chiqarish
  await admin.post(`/api/products/${G}/stock`, { unit: 'dona', qty: -0.5 });
  ok(near(prod(G).stock_pieces, 149.5), 'T4 kasr miqdorda chiqarish (0.5 kg)', prod(G).stock_pieces);

  // ================= S. Sotuv: kasr miqdor, birlik nomi, tannarx pozitsiyada =================
  const C = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Universal Mijoz', phone: '+998 93 444 55 66' })).data.id;
  r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 2.5 }], pay_now: { amount: 30000 } });
  ok(r.status === 200 && r.data.summary.debt === 0, 'S1 2.5 kg sotildi (30 000)', r.data);
  const it = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').get(r.data.id);
  ok(it.qty === 2.5 && it.total === 30000 && it.base_unit === 'kg' && it.pack_name === 'qop' && near(it.cost, 9333.33), 'S2 pozitsiyada birlik nomi va tannarx', it);
  ok(near(prod(G).stock_pieces, 147), 'S3 qoldiq kasr bilan kamaydi (147 kg)', prod(G).stock_pieces);
  r = await admin.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'karobka', qty: 1 }], pay_now: { amount: 600000 } });
  ok(r.status === 200 && near(prod(G).stock_pieces, 97), 'S4 1 qop sotildi → 97 kg', prod(G).stock_pieces);
  // Tahrirlashda tannarx o'zgarmaydi (keyin kirim narxi o'zgarsa ham)
  const saleId = r.data.id;
  await admin.post(`/api/products/${G}/stock`, { unit: 'dona', qty: 10, cost: 20000 });
  await admin.put('/api/sales/' + saleId, { client_id: C, items: [{ product_id: G, unit: 'karobka', qty: 1 }] });
  ok(near(db.prepare('SELECT cost FROM sale_items WHERE sale_id=?').get(saleId).cost, 9333.33), 'S5 tahrirlashda sotuv paytidagi tannarx qoladi');
  r = await admin.post('/api/quotes', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 3 }] });
  ok(db.prepare('SELECT base_unit FROM quote_items WHERE quote_id=?').get(r.data.id).base_unit === 'kg', 'S6 KP pozitsiyasida birlik nomi');

  // ================= C. Tannarx ruxsati =================
  const kas = await login('vali', '1234');   // demo: Kassir roli (tannarx ruxsatisiz)
  const kp = (await kas.get('/api/products')).data.find((x) => x.id === G);
  ok(kp && !('cost_price' in kp), 'C1 kassirga tannarx ko\'rinmaydi', kp);
  ok(!('cost_price' in (await kas.get('/api/products/' + G)).data), 'C2 bitta mahsulotda ham ko\'rinmaydi');
  ok('cost_price' in (await admin.get('/api/products')).data.find((x) => x.id === G), 'C3 adminga ko\'rinadi');

  // ================= L. Narx turlari =================
  r = await admin.post('/api/price-levels', { name: 'Diler' });
  ok(r.status === 200, 'L1 narx turi yaratildi', r.data);
  const L = r.data.id;
  ok((await admin.post('/api/price-levels', { name: 'diler' })).status === 400, 'L2 takroriy nom — rad');
  ok((await kas.post('/api/price-levels', { name: 'VIP' })).status === 403, 'L3 ruxsatsiz — rad');
  r = await admin.put('/api/products/' + G, { ...prod(G), prices: JSON.stringify({ [L]: 11000, 99999: 5 }) });
  ok(r.status === 200, 'L4 mahsulotga ulgurji narx', r.data);
  const pp = db.prepare('SELECT * FROM product_prices WHERE product_id=?').all(G);
  ok(pp.length === 1 && pp[0].piece_price === 11000 && pp[0].box_price === 550000, 'L5 faqat mavjud tur saqlandi, qadoq narxi hisoblandi', pp);
  ok(JSON.stringify((await admin.get('/api/products/' + G)).data.prices) === JSON.stringify({ [L]: [11000, 550000] }), 'L6 API da narxlar');
  const W = (await admin.post('/api/clients', { type: 'b2b', company_name: 'Ulgurji Xaridor MChJ', price_level_id: L })).data.id;
  ok(db.prepare('SELECT price_level_id FROM clients WHERE id=?').get(W).price_level_id === L, 'L7 mijozga narx turi');
  await admin.put('/api/clients/' + W, { type: 'b2b', company_name: 'Ulgurji Xaridor MChJ', phone: '+998 90 777 88 99' });
  ok(db.prepare('SELECT price_level_id FROM clients WHERE id=?').get(W).price_level_id === L, 'L8 tahrirda yuborilmasa — narx turi saqlanadi');

  // Narxni o'zgartirish ruxsatisiz rol: ulgurji mijozga ulgurji narx — mumkin, oddiy mijozga — yo'q
  const role = (await admin.post('/api/auth/roles', { name: 'Narxsiz kassir', perms: ['pos.use', 'sales.credit'] })).data.id;
  await admin.post('/api/auth/users', { username: 'narxsiz', password: '1234', role_id: role });
  const np = await login('narxsiz', '1234');
  ok((await np.post('/api/sales', { client_id: W, items: [{ product_id: G, unit: 'dona', qty: 1, price: 11000 }] })).status === 200, 'L9 ulgurji mijozga ulgurji narx — ruxsatsiz ham mumkin');
  ok((await np.post('/api/sales', { client_id: W, items: [{ product_id: G, unit: 'karobka', qty: 1, price: 550000 }] })).status === 200, 'L10 qadoqda ulgurji narx');
  ok((await np.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 1, price: 11000 }] })).status === 403, 'L11 oddiy mijozga ulgurji narx — rad');
  ok((await np.post('/api/sales', { client_id: W, items: [{ product_id: G, unit: 'dona', qty: 1, price: 10000 }] })).status === 403, 'L12 ulgurjidan ham past — rad');

  r = await admin.del('/api/price-levels/' + L);
  ok(r.status === 200 && db.prepare('SELECT price_level_id FROM clients WHERE id=?').get(W).price_level_id === null
    && !db.prepare('SELECT 1 FROM product_prices WHERE level_id=?').get(L), 'L13 o\'chirilgan tur: mijoz va mahsulot narxlari tozalandi');

  // ================= U. Dollar narx va kurs, MXIK =================
  r = await admin.post('/api/products/reprice-usd', { rate: 12500 });
  ok(r.status === 200 && r.data.rate === 12500, 'U1 kurs saqlandi', r.data);
  r = await admin.post('/api/products', { name: 'Dollarli tovar', usd_price: 10, piece_price: 1, box_qty: 6, mxik: '0610 0100-0010-01' });
  const U = r.data.id;
  ok(prod(U).piece_price === 125000 && prod(U).box_price === 750000 && prod(U).mxik === '06100100001001', 'U2 so\'m narxi kurs bo\'yicha, MXIK raqamlar', prod(U));
  r = await admin.post('/api/products/reprice-usd', { rate: 12644 });
  ok(r.data.updated >= 1 && prod(U).piece_price === 126400, 'U3 kurs o\'zgardi — narx qayta hisoblandi (100 so\'mgacha)', prod(U).piece_price);
  ok((await admin.post('/api/products/reprice-usd', { rate: 0 })).status === 400, 'U4 nol kurs — rad');
  ok((await kas.post('/api/products/reprice-usd', { rate: 13000 })).status === 403, 'U5 kassir kursni o\'zgartira olmaydi');

  // ================= A. Aksiyalar =================
  r = await admin.post('/api/price-levels/promotions', { name: 'Guruch aksiyasi', percent: 10, scope: 'product', target: G, min_qty: 5 });
  ok(r.status === 200, 'A1 aksiya yaratildi', r.data);
  const AK = r.data.id;
  ok((await admin.post('/api/price-levels/promotions', { name: 'X', percent: 150 })).status === 400, 'A2 noto\'g\'ri foiz — rad');
  ok((await kas.get('/api/price-levels/promotions/active')).data.some((x) => x.id === AK), 'A3 kassaga amaldagi aksiyalar');
  const listG = prod(G).piece_price;   // asosiy narx (narx turi o'chirilgan)
  const promoG = Math.round(listG * 0.9 / 100) * 100;
  ok((await np.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 5, price: promoG }] })).status === 200, 'A4 5 kg dan — aksiya narxida sotiladi (narx ruxsatisiz ham)');
  ok((await np.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 2, price: promoG }] })).status === 403, 'A5 minimal miqdordan kam — aksiya narxi rad');
  await admin.put('/api/price-levels/promotions/' + AK, { name: 'Guruch aksiyasi', percent: 10, scope: 'product', target: G, min_qty: 5, active: 0 });
  ok((await np.post('/api/sales', { client_id: C, items: [{ product_id: G, unit: 'dona', qty: 5, price: promoG }] })).status === 403, 'A6 o\'chirilgan aksiya — qo\'llanmaydi');
  r = await admin.post('/api/price-levels/promotions', { name: 'Kategoriya', percent: 5, scope: 'category', target: 'Bakaleya', date_from: '2020-01-01', date_to: '2020-12-31' });
  ok(!(await kas.get('/api/price-levels/promotions/active')).data.some((x) => x.id === r.data.id), 'A7 muddati o\'tgan aksiya amalda emas');
  ok((await kas.get('/api/price-levels/promotions')).status === 403, 'A8 kassir aksiyalarni boshqara olmaydi');

  // ================= K. Onlayn katalog: birlik, narx turi, aksiya, kasr buyurtma =================
  const KL = (await admin.post('/api/price-levels', { name: 'Katalog ulgurji' })).data.id;
  const KP = (await admin.post('/api/products', { name: 'Katalog guruchi', unit: 'kg', pack_name: 'qop', box_qty: 25, piece_price: 10000, in_shop: 1, prices: JSON.stringify({ [KL]: 9000 }) })).data.id;
  await admin.post('/api/price-levels/promotions', { name: 'Katalog aksiya', percent: 10, scope: 'product', target: KP, min_qty: 10 });
  const KC = (await admin.post('/api/clients', { type: 'b2b', company_name: 'Katalog ulgurji MChJ', phone: '+998 91 300 40 50', price_level_id: KL })).data.id;
  await admin.post(`/api/clients/${KC}/shop-password`, { password: 'kat1234' });
  const shop = async (method, path, body, token) => {
    const r = await fetch(B + '/api/shop/filial-a' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Shop-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  let kc = (await shop('GET', '/catalog')).data.products.find((x) => x.id === KP);
  ok(kc && kc.piece_price === 10000 && kc.unit_label === 'kg' && kc.pack_name === 'qop' && kc.frac && kc.promos[0].pct === 10, 'K1 katalog: birlik, qadoq, kasr, aksiya (mehmon — asosiy narx)', kc);
  const tok = (await shop('POST', '/web/login', { phone: '+998 91 300 40 50', password: 'kat1234' })).data.token;
  const cat = (await shop('GET', '/catalog', null, tok)).data;
  kc = cat.products.find((x) => x.id === KP);
  ok(kc.piece_price === 9000 && kc.base_piece === 10000 && cat.price_level === 'Katalog ulgurji', 'K2 kirgan ulgurji mijozga — uning narxi', { p: kc.piece_price, lvl: cat.price_level });
  r = await shop('POST', '/orders', { items: [{ product_id: KP, unit: 'dona', qty: 2.5 }] }, tok);
  ok(r.status === 200 && r.data.total === 22500, 'K3 kasr buyurtma (2.5 kg × 9 000)', r.data);
  r = await shop('POST', '/orders', { items: [{ product_id: KP, unit: 'dona', qty: 10 }] }, tok);
  ok(r.data.total === 81000, 'K4 10 kg dan aksiya: 9 000 × 0.9 = 8 100', r.data);
  await admin.put('/api/settings', { sell_unit: 'both' });
  r = await shop('POST', '/orders', { items: [{ product_id: KP, unit: 'karobka', qty: 1, price: 1 }] }, tok);
  await admin.put('/api/settings', { sell_unit: 'piece' });
  ok(r.data.total === Math.round(225000 * 0.9 / 100) * 100, 'K5 qadoq narxi serverda (mijoz yuborgan narx e\'tiborsiz)', r.data);

  // ================= X. Excel: yangi maydonlar (shtrix-kod, birlik, qadoq, tannarx, minimal qoldiq, narx turi) =================
  {
    const ExcelJS = require(ROOT + '/node_modules/exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mahsulotlar');
    ws.addRow(['Nomi', 'Shtrix-kod', "O'lchov birligi", 'Qadoq nomi', 'Karobkada (dona)', 'Dona narxi', 'Tannarx', 'Minimal qoldiq', 'Narx: Katalog ulgurji', 'MXIK']);
    ws.addRow(['Excel shakar', '4780000055551', 'кг', 'qop', 50, 12000, 9500, 100, 11000, '0170 1001 0010 0100']);
    ws.addRow(['Excel suv', '4780000055552', 'litr', '', 1, 3000, 2000, '', '', '']);
    ws.addRow(['Guruch yangi narx', '4780000000017', '', '', '', 13000, '', '', '', '']);   // bazadagi (shtrix-kod bo'yicha) — yangilanadi
    const fd = () => { const f = new FormData(); f.append('file', new Blob([buf]), 'yangi.xlsx'); return f; };
    const buf = await wb.xlsx.writeBuffer();
    const up = (q) => fetch(B + '/api/import/products' + q, { method: 'POST', headers: { Cookie: admin.cookie() }, body: fd() }).then((x) => x.json());
    const pv = await up('');
    ok(pv.summary && pv.summary.create === 2 && pv.summary.update === 1, 'X1 oldindan ko\'rish: 2 yangi, 1 yangilanadi (shtrix-kod bo\'yicha)', pv.summary);
    const g = pv.rows.find((r) => r.name === 'Guruch yangi narx');
    ok(g && g.existing_id === G && g.changes.some((c) => c.includes('dona narxi')), 'X2 mavjud mahsulot shtrix-kod bo\'yicha topildi', g);
    const cm = await up('?commit=1');
    ok(cm.created === 2 && cm.updated === 1, 'X3 import bajarildi', cm);
    const sh = db.prepare("SELECT * FROM products WHERE barcode='4780000055551'").get();
    ok(sh && sh.unit === 'kg' && sh.pack_name === 'qop' && sh.box_qty === 50 && sh.cost_price === 9500 && sh.min_stock === 100 && sh.mxik === '0170100100100100', 'X4 yangi maydonlar saqlandi', sh);
    ok(db.prepare('SELECT piece_price FROM product_prices WHERE product_id=? AND level_id=?').get(sh.id, KL).piece_price === 11000, 'X5 narx turi ustuni saqlandi');
    ok(db.prepare("SELECT unit FROM products WHERE barcode='4780000055552'").get().unit === 'l' && prod(G).piece_price === 13000, 'X6 litr birligi; mavjud mahsulot narxi yangilandi');
    const ex = await fetch(B + '/api/import/products/export', { headers: { Cookie: admin.cookie() } });
    const ewb = new ExcelJS.Workbook(); await ewb.xlsx.load(Buffer.from(await ex.arrayBuffer()));
    const hdr = ewb.worksheets[0].getRow(1).values.join('|');
    ok(/Shtrix-kod/.test(hdr) && /Tannarx/.test(hdr) && /Narx: Katalog ulgurji/.test(hdr) && /MXIK/.test(hdr), 'X7 eksportda yangi ustunlar', hdr);
    const ex2 = await fetch(B + '/api/import/products/export', { headers: { Cookie: kas.cookie() } });
    ok(ex2.status === 403 || !/Tannarx/.test(await (async () => { const w = new ExcelJS.Workbook(); await w.xlsx.load(Buffer.from(await ex2.arrayBuffer())); return w.worksheets[0].getRow(1).values.join('|'); })()), 'X8 tannarx ruxsatsizga eksportda yo\'q');
  }

  // ================= A. Mahsulot assortimenti (/colors endpoint) =================
  {
    let cRes = await admin.post(`/api/products/${G}/colors`, { colors: ['Qulupnayli', 'Limonli', 'Olmali'] });
    ok(cRes.status === 200 && cRes.data.ok && cRes.data.colors.length === 3, 'A1 assortiment qo\'shildi', cRes.data);
    let pDetail = (await admin.get(`/api/products/${G}`)).data;
    ok(pDetail.colors && pDetail.colors.join(',') === 'Qulupnayli,Limonli,Olmali', 'A2 mahsulot ma\'lumotida assortiment bor', pDetail.colors);
    // Bitta assortimentni olib tashlash
    cRes = await admin.post(`/api/products/${G}/colors`, { colors: ['Qulupnayli', 'Olmali'] });
    ok(cRes.status === 200 && cRes.data.colors.length === 2, 'A3 assortiment yangilandi (biri o\'chirildi)', cRes.data);
    pDetail = (await admin.get(`/api/products/${G}`)).data;
    ok(pDetail.colors && pDetail.colors.join(',') === 'Qulupnayli,Olmali', 'A4 bazada to\'g\'ri saqlandi', pDetail.colors);
    // 404 tekshiruvi
    ok((await admin.post('/api/products/999999/colors', { colors: ['Qizil'] })).status === 404, 'A5 mavjud bo\'lmagan mahsulotga 404');
  }

  // ================= F. Mahsulot maydonlari sozlamasi =================
  ok((await admin.get('/api/settings')).data.product_fields === 'brand,volume,size,audience,colors', 'F1 sozlanmagan — eski maydonlar');
  await admin.put('/api/settings', { industry: 'grocery', product_fields: 'brand,volume,yolgon' });
  r = (await admin.get('/api/settings')).data;
  ok(r.industry === 'grocery' && r.product_fields === 'brand,volume', 'F2 soha va maydonlar (noma\'lumi olib tashlandi)', r);
  await admin.put('/api/settings', { product_fields: 'brand,volume,size,audience,colors', industry: '' });

  console.log(`MAHSULOT: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
