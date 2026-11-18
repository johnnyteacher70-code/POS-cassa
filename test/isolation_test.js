// Ajratish testi (TZ 8-bo'lim): A filial xodimi B ma'lumotiga hech qanday yo'l bilan yeta olmaydi.
// Ikkala filialga noyob belgili yozuvlar qo'shiladi, keyin har bir API javobida boshqa filial belgisi qidiriladi.
// Ishga tushirish: node isolation_test.js <baseURL> <projectRoot>
const [B, ROOT] = process.argv.slice(2);
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

function client(extraHeaders = {}) {
  let cookie = '';
  return {
    async req(method, p, body, headers = {}) {
      const h = { ...extraHeaders, ...headers };
      if (cookie) h.Cookie = cookie;
      if (body !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(B + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data, text };
    },
    get(p, h) { return this.req('GET', p, undefined, h); }, post(p, b) { return this.req('POST', p, b ?? {}); },
  };
}

(async () => {
  const owner = client();
  await owner.post('/api/auth/login', { username: 'owner', password: 'owner123' });
  // Ikki yangi filial — toza holat
  const mk = async (slug, login) => (await owner.post('/api/owner/branches', { name: 'Iso ' + slug, slug, admin: { username: login, password: 'pass1234' } })).data;
  const X = await mk('iso-x', 'isox_admin');
  const Y = await mk('iso-y', 'isoy_admin');
  ok(X.id && Y.id && X.id !== Y.id, 'S0 ikki filial yaratildi', [X, Y]);
  const ax = client(); await ax.post('/api/auth/login', { username: 'isox_admin', password: 'pass1234' });
  const ay = client(); await ay.post('/api/auth/login', { username: 'isoy_admin', password: 'pass1234' });

  // Har bir filialga noyob belgili yozuvlar: mijoz, mahsulot, sotuv, to'lov, KP, kassa, xodim, sozlama
  async function seed(c, tag) {
    const cl = (await c.post('/api/clients', { type: 'b2b', company_name: `MIJOZ_${tag}`, phone: tag === 'X' ? '+998 90 100 00 01' : '+998 90 100 00 02' })).data.id;
    const pr = (await c.post('/api/products', { name: `MAHSULOT_${tag}`, piece_price: 5000, box_qty: 1 })).data.id;
    const sale = (await c.post('/api/sales', { client_id: cl, items: [{ product_id: pr, unit: 'dona', qty: 2 }], note: `SOTUV_${tag}` })).data;
    const pay = (await c.post('/api/payments', { client_id: cl, amount: 3000, direction: 'in', method: 'cash', note: `TOLOV_${tag}` })).data.id;
    const kp = (await c.post('/api/quotes', { client_id: cl, items: [{ product_id: pr, unit: 'dona', qty: 1 }], note: `KP_${tag}` })).data.id;
    const reg = (await c.post('/api/registers', { name: `KASSA_${tag}` })).data.id;
    const usr = (await c.post('/api/auth/users', { username: `isoxodim_${tag.toLowerCase()}`, password: '1234', full_name: `XODIM_${tag}` })).data.id;
    await c.req('PUT', '/api/settings', { company_name: `KOMPANIYA_${tag}`, kp_note: `SHART_${tag}` });
    return { cl, pr, sale: sale.id, pay, kp, reg, usr };
  }
  const idsX = await seed(ax, 'X');
  const idsY = await seed(ay, 'Y');
  ok(Object.values(idsX).every(Boolean) && Object.values(idsY).every(Boolean), 'S1 yozuvlar yaratildi', [idsX, idsY]);
  const RX = /(MIJOZ|MAHSULOT|SOTUV|TOLOV|KP|KASSA|XODIM|KOMPANIYA|SHART)_X/;
  const RY = /(MIJOZ|MAHSULOT|SOTUV|TOLOV|KP|KASSA|XODIM|KOMPANIYA|SHART)_Y/;

  // --- 1. Barcha ro'yxatlar: X javoblarida Y belgisi yo'q (va aksincha) ---
  const LISTS = ['/api/clients', '/api/clients?q=MIJOZ', '/api/products', '/api/products/categories', '/api/sales', '/api/sales?q=SOTUV', '/api/payments', '/api/quotes',
    '/api/orders', '/api/orders?status=', '/api/dashboard', '/api/debts', '/api/debts?tab=closed', '/api/staff/list', '/api/staff/report', '/api/audit?limit=3000',
    '/api/trash', '/api/settings', '/api/reviews', '/api/registers', '/api/registers/report', '/api/auth/users', '/api/auth/me'];
  for (const p of LISTS) {
    const rx = await ax.get(p); const ry = await ay.get(p);
    ok(rx.status === 200 && !RY.test(rx.text), `L X ${p}: Y ma'lumoti yo'q`, rx.status === 200 ? (rx.text.match(RY) || [])[0] : rx.status);
    ok(ry.status === 200 && !RX.test(ry.text), `L Y ${p}: X ma'lumoti yo'q`, ry.status === 200 ? (ry.text.match(RX) || [])[0] : ry.status);
  }
  // O'zinikini ko'radi (test o'zi to'g'ri ishlayotganini tasdiqlash)
  ok(/MIJOZ_X/.test((await ax.get('/api/clients')).text) && /MIJOZ_Y/.test((await ay.get('/api/clients')).text), 'L0 har biri o\'z ma\'lumotini ko\'radi');

  // --- 2. ID bo'yicha: Y yozuvlarining ID lari X dan ochilsa — Y ma'lumoti chiqmaydi ---
  const BYID = { cl: '/api/clients/', pr: '/api/products/', sale: '/api/sales/', pay: '/api/payments/', kp: '/api/quotes/' };
  for (const [k, base] of Object.entries(BYID)) {
    const r = await ax.get(base + idsY[k]);
    ok(!RY.test(r.text), `I X ${base}${idsY[k]}: Y yozuvi ochilmaydi`, r.status);
  }
  // O'zgartirish / o'chirish urinishlari: X da umuman yo'q ID lar (Y da bor) — X da 404, Y o'zgarmaydi.
  // (Bir xil ID li yozuv X da ham bo'lsa — bu X ning o'z yozuvi, shuning uchun bunday ID lar tanlanmaydi.)
  for (let i = 0; i < 3; i++) {
    await ay.post('/api/clients', { type: 'b2c', contact_name: 'Y to\'ldiruvchi ' + i });
    await ay.post('/api/products', { name: 'Y to\'ldiruvchi ' + i, piece_price: 1, box_qty: 1 });
    await ay.post('/api/auth/users', { username: 'isoyfill' + i, password: '1234' });
  }
  const yCl = (await ay.post('/api/clients', { type: 'b2b', company_name: 'MIJOZ_Y_NISHON' })).data.id;
  const yPr = (await ay.post('/api/products', { name: 'MAHSULOT_Y_NISHON', piece_price: 1, box_qty: 1 })).data.id;
  const yUs = (await ay.post('/api/auth/users', { username: 'isoy_nishon', password: '1234', full_name: 'XODIM_Y_NISHON' })).data.id;
  ok((await ax.req('PUT', '/api/clients/' + yCl, { type: 'b2b', company_name: 'BUZILDI' })).status === 404, 'I1a X da bu ID li mijoz yo\'q → 404');
  ok((await ax.req('DELETE', '/api/products/' + yPr)).status === 404, 'I2a X da bu ID li mahsulot yo\'q → 404');
  ok((await ax.req('PUT', '/api/auth/users/' + yUs, { full_name: 'BUZILDI', role: 'seller', active: 0 })).status === 404, 'I3a X da bu ID li xodim yo\'q → 404');
  ok((await ay.get('/api/clients/' + yCl)).data.client.company_name === 'MIJOZ_Y_NISHON', 'I1 Y mijozi o\'zgarmadi');
  ok((await ay.get('/api/products/' + yPr)).data.name === 'MAHSULOT_Y_NISHON', 'I2 Y mahsuloti o\'chmadi');
  ok((await ay.get('/api/auth/users')).data.some((u) => u.id === yUs && u.full_name === 'XODIM_Y_NISHON' && u.active === 1), 'I3 Y xodimi o\'zgarmadi');

  // --- 3. Soxta header / parametr / cookie bilan filialni almashtirish ---
  for (const h of [{ 'X-Branch-Id': String(Y.id) }, { 'X-Shop-Token': 'x' }, { Host: 'iso-y.localhost' }]) {
    const r = await ax.get('/api/clients', h);
    ok(!RY.test(r.text) && /MIJOZ_X/.test(r.text), `H header ${Object.keys(h)[0]}: filial almashmaydi`);
  }
  for (const q of [`?branch_id=${Y.id}`, `?branch=${Y.id}`, '?slug=iso-y']) {
    const r = await ax.get('/api/clients' + q);
    ok(!RY.test(r.text), `H parametr ${q}: filial almashmaydi`);
  }
  ok((await ax.post('/api/owner/enter', { branch_id: Y.id })).status === 403, 'H1 xodim owner/enter qila olmaydi');
  const r2 = await client().get('/api/clients', { Cookie: 'sid=' + 'f'.repeat(64) });
  ok(r2.status === 401, 'H2 soxta sessiya → 401');

  // --- 4. Bir vaqtda 200 ta aralash so'rov: hech biri boshqa filial javobini olmaydi ---
  const jobs = [];
  for (let i = 0; i < 100; i++) {
    jobs.push(ax.get('/api/clients').then((r) => ({ who: 'X', r })));
    jobs.push(ay.get('/api/clients').then((r) => ({ who: 'Y', r })));
  }
  const res = await Promise.all(jobs);
  const bad = res.filter(({ who, r }) => r.status !== 200 || (who === 'X' ? RY.test(r.text) || !/MIJOZ_X/.test(r.text) : RX.test(r.text) || !/MIJOZ_Y/.test(r.text)));
  ok(bad.length === 0, 'P1 parallel 200 so\'rov — aralashish yo\'q', bad.length);
  // Parallel yozish: har bir yozuv o'z filialiga tushadi
  await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? ax : ay).post('/api/clients', { type: 'b2c', contact_name: `PAR_${i % 2 ? 'X' : 'Y'}_${i}` })));
  const px = (await ax.get('/api/clients?q=PAR')).text; const py = (await ay.get('/api/clients?q=PAR')).text;
  ok(!/PAR_Y/.test(px) && !/PAR_X/.test(py), 'P2 parallel yozuvlar o\'z filialiga tushdi');

  // --- 5. Katalog: slug almashtirish ---
  // (ro'yxatdan o'tish IP bo'yicha cheklangan — oldingi testlar limitni ishlatgan; shuning uchun admin parol beradi)
  await ax.post(`/api/clients/${idsX.cl}/shop-password`, { password: 'parol1' });
  const sx = client(); const lg = await sx.post('/api/shop/iso-x/web/login', { phone: '+998901000001', password: 'parol1' });
  const tok = { 'X-Shop-Token': lg.data.token };
  ok(lg.status === 200 && ((await sx.get('/api/shop/iso-x/me', tok)).data.client || {}).name === 'MIJOZ_X', 'K1 X katalogida kirdi', lg.data);
  ok((await client().post('/api/shop/iso-y/web/login', { phone: '+998901000001', password: 'parol1' })).status === 401, 'K1a X mijozi paroli Y katalogida ishlamaydi');
  ok((await sx.get('/api/shop/iso-y/me', tok)).data.client === null, 'K2 X tokeni Y katalogida ishlamaydi');
  ok((await sx.get('/api/shop/iso-y/history', tok)).status === 403, 'K3 Y tarixi ochilmaydi');
  ok(!RX.test((await sx.get('/api/shop/iso-y/catalog')).text), 'K4 Y katalogida X mahsuloti yo\'q');

  // --- 6. Kodda Telegram va tashqi bot qoldiqlari yo'q ---
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|html|css|json)$/.test(f.name)) files.push(p); } };
  walk(path.join(ROOT, 'server')); walk(path.join(ROOT, 'public'));
  const hits = files.filter((f) => /telegram|grammy|BOT_TOKEN|t\.me\//i.test(fs.readFileSync(f, 'utf8')));
  ok(hits.length === 0, 'T1 kodda Telegram qoldiqlari yo\'q', hits.map((f) => path.relative(ROOT, f)));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(!pkg.dependencies.grammy, 'T2 grammy kutubxonasi yo\'q');

  console.log(`\nAJRATISH: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
