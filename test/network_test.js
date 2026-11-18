// Tarmoq: egasining umumiy hisoboti, filiallar orasida tovar ko'chirish, katalogni tarqatish.
// node network_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const sqlite = require(ROOT + '/node_modules/better-sqlite3');

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
  };
}
async function login(u, p) { const c = client(); const r = await c.post('/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(u + ': ' + JSON.stringify(r.data)); return c; }
const near = (a, b) => Math.abs(a - b) < 0.01;

(async () => {
  const owner = await login('owner', 'owner123');
  let r = await owner.post('/api/owner/branches', { name: 'Tarmoq C', slug: 'tarmoq-c', admin: { full_name: 'C admin', username: 'netadmin', password: 'netadmin123' } });
  if (r.status !== 200) throw new Error('C filial yaratilmadi: ' + JSON.stringify(r.data));
  const CID = r.data.id;
  const dbA = sqlite(DATA + '/branches/1/app.db', { readonly: true });
  const dbC = sqlite(DATA + `/branches/${CID}/app.db`, { readonly: true });
  const A = await login('admin', 'admin123');
  const C = await login('netadmin', 'netadmin123');

  // ================= S. Umumiy hisobot =================
  r = await owner.get('/api/owner/summary');
  ok(r.status === 200 && r.data.rows.some((x) => x.id === 1) && r.data.rows.some((x) => x.id === CID), 'S1 barcha filiallar hisobotda', r.data.rows.map((x) => x.name));
  const sumRev = r.data.rows.reduce((a, x) => a + x.revenue, 0);
  ok(r.data.total.revenue === sumRev && r.data.rows.find((x) => x.id === 1).revenue > 0, 'S2 jami = filiallar yig\'indisi', r.data.total);
  ok((await A.get('/api/owner/summary')).status === 403, 'S3 filial admini umumiy hisobotni ko\'rmaydi');

  // ================= T. Ko'chirish =================
  const P = (await A.post('/api/products', { name: 'Ko\'chiriladigan tovar', piece_price: 9000, box_qty: 10, pack_name: 'karobka', barcode: '4780000099998', cost_price: 0 })).data.id;
  await A.post(`/api/products/${P}/stock`, { unit: 'dona', qty: 20, cost: 5000 });
  const stockA = () => dbA.prepare('SELECT stock_pieces FROM products WHERE id=?').get(P).stock_pieces;
  r = await A.get('/api/transfers/branches');
  ok(r.data.some((b) => b.id === CID) && !r.data.some((b) => b.id === 1), 'T1 jo\'natish uchun boshqa filiallar', r.data);
  ok((await A.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, qty: 25 }] })).status === 400, 'T2 qoldiqdan ko\'p — rad');
  ok((await A.post('/api/transfers', { to_branch_id: 1, items: [{ product_id: P, qty: 1 }] })).status === 400, 'T3 o\'ziga jo\'natib bo\'lmaydi');
  r = await A.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, unit: 'dona', qty: 5 }], note: 'Test' });
  ok(r.status === 200 && /^T\d{4}-\d{4}$/.test(r.data.number), 'T4 jo\'natildi', r.data);
  const T1 = r.data.id;
  ok(near(stockA(), 15), 'T5 manbadan chiqdi (20 → 15)', stockA());
  ok((await C.get('/api/transfers/incoming-count')).data.n === 1, 'T6 qabul qiluvchida 1 ta kutilmoqda');
  ok((await A.post(`/api/transfers/${T1}/receive`)).status === 403, 'T7 jo\'natuvchi o\'zi qabul qila olmaydi');
  r = await C.post(`/api/transfers/${T1}/receive`);
  ok(r.status === 200 && r.data.created === 1, 'T8 qabul qilindi, mahsulot yaratildi', r.data);
  const pc = dbC.prepare("SELECT * FROM products WHERE barcode='4780000099998'").get();
  ok(pc && near(pc.stock_pieces, 5) && near(pc.cost_price, 5000) && pc.box_qty === 10 && pc.piece_price === 9000, 'T9 C da kartochka, qoldiq va tannarx', pc);
  ok((await C.post(`/api/transfers/${T1}/receive`)).status === 400, 'T10 ikkinchi marta qabul qilib bo\'lmaydi');
  // Qadoqda: 1 karobka = 10 dona; C da mahsulot shtrix-kod bo'yicha topiladi
  r = await A.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, unit: 'karobka', qty: 1 }] });
  await C.post(`/api/transfers/${r.data.id}/receive`);
  ok(near(stockA(), 5) && near(dbC.prepare('SELECT stock_pieces FROM products WHERE id=?').get(pc.id).stock_pieces, 15)
    && dbC.prepare("SELECT COUNT(*) n FROM products WHERE barcode='4780000099998'").get().n === 1, 'T11 qadoqda ko\'chirish, mavjud mahsulotga qo\'shildi');
  // Bekor qilish
  r = await A.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, qty: 3 }] });
  const T3 = r.data.id;
  ok(near(stockA(), 2), 'T12 uchinchi jo\'natma: 5 → 2');
  ok((await C.post(`/api/transfers/${T3}/cancel`)).status === 403, 'T13 qabul qiluvchi bekor qila olmaydi');
  r = await A.post(`/api/transfers/${T3}/cancel`);
  ok(r.status === 200 && near(stockA(), 5), 'T14 bekor qilindi — tovar manbaga qaytdi', stockA());
  ok((await C.post(`/api/transfers/${T3}/receive`)).status === 400, 'T15 bekor qilinganini qabul qilib bo\'lmaydi');
  r = await C.get('/api/transfers');
  ok(r.data.length === 3 && r.data.every((t) => t.dir === 'in'), 'T16 C ro\'yxatida kiruvchi hujjatlar', r.data.map((t) => t.status));
  ok((await C.get('/api/transfers/' + T1)).data.items[0].base_unit === 'dona', 'T17 hujjat tafsiloti');
  const kas = await login('vali', '1234');
  ok((await kas.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, qty: 1 }] })).status === 403, 'T18 kassirda ruxsat yo\'q');
  ok((await owner.get('/api/owner/transfers')).data.length >= 3, 'T19 egasi barcha ko\'chirishlarni ko\'radi');
  // Yo'ldagi tovar hisobotda
  const T4 = (await A.post('/api/transfers', { to_branch_id: CID, items: [{ product_id: P, qty: 1 }] })).data.id;
  ok((await owner.get('/api/owner/summary')).data.transit.n === 1, 'T20 yo\'ldagi tovar umumiy hisobotda');
  await C.post(`/api/transfers/${T4}/receive`);

  // ================= K. Katalogni tarqatish =================
  const before = dbC.prepare('SELECT COUNT(*) n FROM products WHERE deleted_at IS NULL').get().n;
  r = await owner.post('/api/owner/catalog/copy', { from_branch: 1, to_branches: [CID], mode: 'missing' });
  ok(r.status === 200 && r.data.results[0].added > 10, 'K1 katalog tarqatildi', r.data);
  const after = dbC.prepare('SELECT COUNT(*) n FROM products WHERE deleted_at IS NULL').get().n;
  ok(after === before + r.data.results[0].added && dbC.prepare('SELECT SUM(stock_pieces) s FROM products WHERE barcode<>?').get('4780000099998').s === 0, 'K2 yangi mahsulotlar qoldiqsiz qo\'shildi');
  r = await owner.post('/api/owner/catalog/copy', { from_branch: 1, to_branches: [CID], mode: 'missing' });
  ok(r.data.results[0].added === 0, 'K3 qayta tarqatishda takror yo\'q', r.data);
  await A.put('/api/products/' + P, { ...dbA.prepare('SELECT * FROM products WHERE id=?').get(P), piece_price: 9500 });
  r = await owner.post('/api/owner/catalog/copy', { from_branch: 1, to_branches: [CID], mode: 'prices' });
  ok(r.data.results[0].updated > 0 && dbC.prepare('SELECT piece_price FROM products WHERE id=?').get(pc.id).piece_price === 9500, 'K4 narxlar yangilandi', r.data);
  ok((await A.post('/api/owner/catalog/copy', { from_branch: 1, to_branches: [CID] })).status === 403, 'K5 filial admini tarqata olmaydi');

  // ================= D. Demo filial (bir tugma) =================
  r = await owner.post('/api/owner/demo');
  ok(r.status === 200 && r.data.admin && r.data.password === 'demo123', 'D1 demo filial yaratildi', r.data);
  const dd = sqlite(DATA + `/branches/${r.data.id}/app.db`, { readonly: true });
  ok(dd.prepare('SELECT COUNT(*) n FROM products').get().n > 30 && dd.prepare('SELECT COUNT(*) n FROM sales').get().n > 30 && dd.prepare('SELECT COUNT(*) n FROM purchases').get().n > 0, 'D2 demo ma\'lumotlar bor');
  const demo = await login(r.data.admin, 'demo123');
  ok((await demo.get('/api/reports/profit')).data.cogs > 0, 'D3 demoda tannarx va foyda hisoblanadi');
  r = await owner.post('/api/owner/demo', { industry: 'building' });
  const db2 = sqlite(DATA + `/branches/${r.data.id}/app.db`, { readonly: true });
  ok(r.status === 200 && db2.prepare("SELECT COUNT(*) n FROM products WHERE category='Santexnika'").get().n > 0 && db2.prepare("SELECT unit FROM products WHERE name='Plitka 30x60'").get().unit === 'm2', 'D2a qurilish sohasi demosi (m², kabel metrda)', r.data);
  r = await owner.get('/api/owner/business');
  ok(r.status === 200 && 'color' in r.data, 'D4 biznes sozlamalari');
  r = await owner.req('PUT', '/api/owner/business', { name: 'Tarmoq Savdo', color: 'red' });
  ok(r.status === 400, 'D5 noto\'g\'ri rang — rad');
  await owner.req('PUT', '/api/owner/business', { name: 'Tarmoq Savdo', tagline: 'ULGURJI', color: '#0f766e' });
  ok((await (await fetch(B + '/api/brand.js')).text()).includes('Tarmoq Savdo'), 'D6 brend hammaga ochiq skriptda');
  ok((await owner.get('/api/owner/network')).data.local.startsWith('http://localhost:'), 'D7 tarmoq manzillari');

  console.log(`TARMOQ: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
