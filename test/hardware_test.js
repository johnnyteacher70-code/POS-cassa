// Kassa uskunalari: soxta tarmoq printeri (TCP) — chek, test, pul yashigi; sozlama va ruxsatlar.
// node hardware_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const net = require('net');
const iconv = require(ROOT + '/node_modules/iconv-lite');

let pass = 0, fail = 0;
const fails = [];
const ok = (c, n, e) => { if (c) pass++; else { fail++; fails.push(n + (e !== undefined ? ' → ' + JSON.stringify(e).slice(0, 300) : '')); } };
function client() {
  let cookie = '';
  return {
    async req(method, p, body) {
      const h = {}; if (cookie) h.Cookie = cookie;
      let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + p, { method, headers: h, body: b });
      const sc = r.headers.get('set-cookie'); if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data };
    },
    get(p) { return this.req('GET', p); }, post(p, b) { return this.req('POST', p, b ?? {}); }, put(p, b) { return this.req('PUT', p, b); },
  };
}
async function login(u, p) { const c = client(); await c.post('/api/auth/login', { username: u, password: p }); return c; }

// Soxta printer: har bir ulanishda kelgan baytlarni yig'adi
const jobs = [];
const srv = net.createServer((s) => { const chunks = []; s.on('data', (d) => chunks.push(d)); s.on('end', () => jobs.push(Buffer.concat(chunks))); });
const has = (buf, bytes) => buf.indexOf(Buffer.from(bytes)) >= 0;
const waitJob = async (n) => { for (let i = 0; i < 40 && jobs.length < n; i++) await new Promise((r) => setTimeout(r, 50)); return jobs[n - 1]; };

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const admin = await login('admin', 'admin123');
  const REG = (await admin.post('/api/registers', { name: 'Printer kassasi' })).data.id;

  let r = await admin.get('/api/hardware/printer/' + REG);
  ok(r.status === 200 && r.data.mode === 'browser', 'H1 standart — brauzer orqali', r.data);
  r = await admin.put('/api/hardware/printer/' + REG, { mode: 'network', host: '127.0.0.1', port, width: 58, cut: true, drawer: true, qr: true });
  ok(r.status === 200 && r.data.mode === 'network' && r.data.width === 58, 'H2 tarmoq printeri sozlandi', r.data);
  ok((await admin.get('/api/hardware/devices')).status === 200, 'H3 qurilmalar ro\'yxati');

  r = await admin.post('/api/hardware/test/' + REG);
  const t = await waitJob(1);
  ok(r.status === 200 && t && has(t, [0x1b, 0x40]) && has(t, [0x1d, 0x56]) && t.includes(Buffer.from('TEST')), 'H4 test cheki: boshlash, kesish, matn', r.data);
  ok(t && t.includes(iconv.encode('Ташкент', 'cp866')), 'H5 kirill CP866 da');

  // Sotuv: naqd 30 000, mijoz 50 000 berdi → qaytim 20 000, pul yashigi ochiladi
  const P = (await admin.post('/api/products', { name: 'Printer mahsuloti', piece_price: 15000 })).data.id;
  const C = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Chek mijozi' })).data.id;
  const S = (await admin.post('/api/sales', { client_id: C, register_id: REG, items: [{ product_id: P, unit: 'dona', qty: 2 }], pay_now: { amount: 30000, method: 'cash' } })).data;
  r = await admin.post('/api/hardware/receipt', { sale_id: S.id, register_id: REG, cash_given: 50000 });
  const j = await waitJob(2);
  ok(r.status === 200 && j && j.includes(Buffer.from(S.number)) && j.includes(Buffer.from('30 000')), 'H6 chekda raqam va summa', r.data);
  ok(j && j.includes(Buffer.from('Qaytim')) && j.includes(Buffer.from('20 000')), 'H7 qaytim chekda');
  ok(j && has(j, [0x1b, 0x70, 0x00]), 'H8 naqd to\'lovda pul yashigi buyrug\'i');
  ok(j && has(j, [0x1d, 0x28, 0x6b]), 'H9 QR kod buyrug\'i');
  r = await admin.post('/api/hardware/drawer/' + REG);
  const d = await waitJob(3);
  ok(r.status === 200 && d && has(d, [0x1b, 0x70]), 'H10 pul yashigini alohida ochish');

  // Printer o'chiq bo'lsa — tushunarli xato
  await admin.put('/api/hardware/printer/' + REG, { mode: 'network', host: '127.0.0.1', port: 1 });
  r = await admin.post('/api/hardware/test/' + REG);
  ok(r.status === 424 && /ulanib bo'lmadi/.test(r.data.error), 'H11 printer javob bermasa — 424 va tushunarli xabar', r.data);
  r = await admin.put('/api/hardware/printer/' + REG, { mode: 'device', device: '/etc/passwd' });
  ok(r.status === 200, 'H12 qurilma sozlamasi saqlandi');
  r = await admin.post('/api/hardware/test/' + REG);
  ok(r.status === 424 && /Qurilma nomi/.test(r.data.error), 'H13 printer bo\'lmagan faylga yozib bo\'lmaydi', r.data);
  await admin.put('/api/hardware/printer/' + REG, { mode: 'system', name: 'x; rm -rf /' });
  ok((await admin.post('/api/hardware/test/' + REG)).status === 424, 'H14 printer nomida buyruq — rad');

  const kas = await login('vali', '1234');
  ok((await kas.put('/api/hardware/printer/' + REG, { mode: 'browser' })).status === 403, 'H15 kassir printer sozlamasini o\'zgartira olmaydi');
  ok((await kas.get('/api/hardware/printer/' + REG)).status === 200, 'H16 kassir sozlamani o\'qiydi');

  srv.close();
  console.log(`USKUNALAR: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
