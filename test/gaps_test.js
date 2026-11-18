// Qolgan kamchiliklar: bonus (sotuv / qaytarish tiklanganda), tannarxni qaytarish, partiya muddati (FIFO + hisobdan chiqarish),
// mijozlarni Excel'dan import, shifrlangan zaxira (.dkz), eski jurnalni arxivlash.
// node gaps_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sqlite = require(ROOT + '/node_modules/better-sqlite3');
const ExcelJS = require(ROOT + '/node_modules/exceljs');
const db = sqlite(DATA + '/branches/1/app.db');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function client() {
  let cookie = '';
  return {
    async req(method, p, body, headers = {}) {
      const h = { ...headers };
      if (cookie) h.Cookie = cookie;
      let b;
      if (body instanceof FormData || Buffer.isBuffer(body)) b = body;
      else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + p, { method, headers: h, body: b });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const buf = Buffer.from(await r.arrayBuffer());
      let data; try { data = JSON.parse(buf.toString()); } catch { data = buf; }
      return { status: r.status, data };
    },
    get(p) { return this.req('GET', p); }, post(p, b, h) { return this.req('POST', p, b ?? {}, h); },
    put(p, b) { return this.req('PUT', p, b); }, del(p) { return this.req('DELETE', p); },
  };
}
async function login(u, p) { const c = client(); const r = await c.post('/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(u + ': ' + JSON.stringify(r.data)); return c; }
const near = (a, b) => Math.abs(a - b) < 0.01;
const prod = (id) => db.prepare('SELECT * FROM products WHERE id=?').get(id);
const day = (d) => new Date(Date.now() + d * 864e5).toLocaleString('sv-SE').slice(0, 10);

(async () => {
  const admin = await login('admin', 'admin123');
  const owner = await login('owner', 'owner123');

  // ================= BR. Bonus: tiklashda qaytadi =================
  {
    await admin.put('/api/settings', { bonus_enabled: '1', bonus_percent: '5', bonus_max_pay: '50' });
    const BP = (await admin.post('/api/products', { name: 'Bonus tiklash mahsuloti', piece_price: 100000 })).data.id;
    const mk = async (name, phone) => (await admin.post('/api/clients', { type: 'b2c', contact_name: name, phone })).data.id;
    const bonusOf = (id) => db.prepare('SELECT bonus FROM clients WHERE id=?').get(id).bonus;
    const bonusPays = (saleId) => db.prepare("SELECT COUNT(*) n FROM payments WHERE sale_id=? AND method='bonus' AND deleted_at IS NULL").get(saleId).n;
    const C1 = await mk('Bonus tiklash 1', '+998 94 200 00 01');
    await admin.post('/api/sales', { client_id: C1, items: [{ product_id: BP, unit: 'dona', qty: 2 }], pay_now: { amount: 200000 } });
    const s2 = (await admin.post('/api/sales', { client_id: C1, items: [{ product_id: BP, unit: 'dona', qty: 1 }], pay_now: [{ amount: 90000, method: 'cash' }, { amount: 10000, method: 'bonus' }] })).data;
    ok(bonusOf(C1) === 4500, 'BR1 boshlang\'ich: 10 000 − 10 000 + 4 500', bonusOf(C1));
    await admin.post(`/api/sales/${s2.id}/cancel`);
    ok(bonusOf(C1) === 10000 && bonusPays(s2.id) === 0, 'BR2 bekor: bonus to\'lovi va yig\'ilgani bekor', bonusOf(C1));
    await admin.post(`/api/sales/${s2.id}/uncancel`);
    ok(bonusOf(C1) === 4500 && bonusPays(s2.id) === 1, 'BR3 qayta tiklandi: bonus harakatlari va bonus to\'lovi qaytdi', [bonusOf(C1), bonusPays(s2.id)]);
    ok(db.prepare('SELECT balance FROM clients WHERE id=?').get(C1).balance === 0, 'BR4 tiklangan sotuv qarzga aylanmadi (bonus to\'lovi hisobda)');
    await admin.del('/api/sales/' + s2.id);
    ok(bonusOf(C1) === 10000, 'BR5 o\'chirildi: bonus qaytdi', bonusOf(C1));
    await admin.post(`/api/sales/${s2.id}/restore`);
    ok(bonusOf(C1) === 4500 && bonusPays(s2.id) === 1, 'BR6 o\'chirilgan sotuv tiklandi: bonus ham', bonusOf(C1));

    const C2 = await mk('Bonus tiklash 2', '+998 94 200 00 02');
    const s3 = (await admin.post('/api/sales', { client_id: C2, items: [{ product_id: BP, unit: 'dona', qty: 2 }], pay_now: { amount: 200000 } })).data;
    const it = (await admin.get('/api/returns/sale/' + s3.id)).data.items[0];
    const ret = (await admin.post('/api/returns', { sale_id: s3.id, items: [{ sale_item_id: it.id, qty: 1 }] })).data;
    ok(bonusOf(C2) === 5000, 'BR7 qaytarish: bonus ulushi olindi', bonusOf(C2));
    await admin.del('/api/returns/' + ret.id);
    ok(bonusOf(C2) === 10000, 'BR8 qaytarish bekor: olingan bonus qaytdi', bonusOf(C2));
    await admin.post(`/api/sales/${s3.id}/cancel`);
    ok(bonusOf(C2) === 0, 'BR9 sotuv bekor', bonusOf(C2));
    await admin.post(`/api/sales/${s3.id}/uncancel`);
    ok(bonusOf(C2) === 10000, 'BR10 tiklandi: bekor qilingan qaytarishning bonusi qayta olinmadi', bonusOf(C2));
    await admin.put('/api/settings', { bonus_enabled: '' });
  }

  // ================= CR. Tannarx: kirim bekor qilinsa qaytadi =================
  {
    const S = (await admin.post('/api/suppliers', { name: 'Tannarx yetkazuvchi' })).data.id;
    const P = (await admin.post('/api/products', { name: 'Tannarx qaytarish mahsuloti', piece_price: 5000 })).data.id;
    await admin.post('/api/purchases', { supplier_id: S, items: [{ product_id: P, unit: 'dona', qty: 10, price: 1000 }] });
    const k2 = (await admin.post('/api/purchases', { supplier_id: S, items: [{ product_id: P, unit: 'dona', qty: 10, price: 2000 }] })).data.id;
    ok(near(prod(P).cost_price, 1500), 'CR1 o\'rtacha tannarx 1 500', prod(P).cost_price);
    await admin.post(`/api/purchases/${k2}/cancel`);
    ok(near(prod(P).cost_price, 1000) && near(prod(P).stock_pieces, 10), 'CR2 kirim bekor: tannarx 1 000 ga qaytdi', prod(P));
    const mv = (await admin.post(`/api/products/${P}/stock`, { qty: 10, cost: 3000 })).data.id;
    ok(near(prod(P).cost_price, 2000), 'CR3 qo\'lda kirim: 2 000', prod(P).cost_price);
    await admin.del('/api/products/stock/' + mv);
    ok(near(prod(P).cost_price, 1000), 'CR4 qo\'lda kirim o\'chirildi: 1 000', prod(P).cost_price);
    await admin.post(`/api/products/stock/${mv}/restore`);
    ok(near(prod(P).cost_price, 2000), 'CR5 tiklandi: yana 2 000', prod(P).cost_price);
  }

  // ================= EX. Partiya muddati: FIFO qoldiq va hisobdan chiqarish =================
  {
    const S = (await admin.post('/api/suppliers', { name: 'Muddat yetkazuvchi' })).data.id;
    const P = (await admin.post('/api/products', { name: 'Muddatli mahsulot', piece_price: 3000 })).data.id;
    await admin.post('/api/purchases', { supplier_id: S, date: day(-10) + ' 10:00', items: [{ product_id: P, unit: 'dona', qty: 10, price: 1000, expires_at: day(-2) }] });
    await admin.post('/api/purchases', { supplier_id: S, date: day(-5) + ' 10:00', items: [{ product_id: P, unit: 'dona', qty: 10, price: 1000, expires_at: day(700) }] });
    const walk = (await admin.post('/api/clients/quick', { query: '' })).data.client.id;
    await admin.post('/api/sales', { client_id: walk, items: [{ product_id: P, unit: 'dona', qty: 5 }], pay_now: { amount: 15000 } });
    let rows = (await admin.get('/api/reports/expiry?days=60')).data.filter((r) => r.product_id === P);
    ok(rows.length === 1 && near(rows[0].qty, 5) && rows[0].received === 10 && rows[0].expired && rows[0].value === 5000,
      'EX1 FIFO: eski partiyadan 5 dona qolgan (10 kelgan, 5 sotilgan), muddati o\'tgan', rows);
    let r = await admin.post(`/api/products/expiry/${rows[0].id}/writeoff`);
    ok(r.status === 200 && near(r.data.qty, 5) && near(prod(P).stock_pieces, 10), 'EX2 hisobdan chiqarildi: qoldiq 10', [r.data, prod(P).stock_pieces]);
    rows = (await admin.get('/api/reports/expiry?days=60')).data.filter((x) => x.product_id === P);
    ok(rows.length === 0, 'EX3 ro\'yxatdan chiqdi', rows);
    const batch = db.prepare('SELECT id FROM stock_moves WHERE product_id=? AND expires_at IS NOT NULL ORDER BY id LIMIT 1').get(P).id;
    ok((await admin.post(`/api/products/expiry/${batch}/writeoff`)).status === 400, 'EX4 ikkinchi marta — rad (qoldiq yo\'q)');
    ok(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE summary LIKE '%muddati o''tgan%'").get().n >= 1, 'EX5 jurnalga yozildi');
  }

  // ================= CI. Mijozlarni Excel'dan import =================
  {
    let r = await admin.get('/api/import/clients/template');
    ok(r.status === 200 && Buffer.isBuffer(r.data) && r.data.subarray(0, 2).toString() === 'PK', 'CI1 shablon (.xlsx)');
    const EX = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Bor mijoz', phone: '90 777 11 09' })).data.id;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mijozlar');
    ws.addRow(['Ism-familiya', 'Kompaniya nomi', 'Telefon', 'Qarzi', 'Avans', 'Manzil']);
    ws.addRow(['Import Bir', '', '90 777 11 01', '1 500 000', '', 'Toshkent']);
    ws.addRow(['Import Ikki', 'Ikki MChJ', '+998 90 777 11 02', '', 30000, '']);
    ws.addRow(['Import Uch', '', '90-777-11-01', 1000, '', '']);     // takror telefon
    ws.addRow(['', '', '', '', '', '']);                             // bo'sh qator
    ws.addRow(['Bor mijoz', '', '8 90 777 11 09', 5000, '', 'Samarqand']);   // bazada bor
    ws.addRow(['Import Tort', '', '90 777 11 04', -20000, '', '']);   // manfiy qarz = avans
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const send = (commit, who = admin) => { const fd = new FormData(); fd.append('file', new Blob([file]), 'mijozlar.xlsx'); return who.post('/api/import/clients' + (commit ? '?commit=1' : ''), fd); };
    r = await send(false);
    const s = r.data.summary || {};
    ok(r.status === 200 && s.create === 3 && s.update === 1 && s.error === 1 && s.debt === 1500000 && s.advance === 50000, 'CI2 oldindan ko\'rish: 3 yangi, 1 bor, 1 takror', r.data.summary || r.data);
    ok(!db.prepare("SELECT 1 FROM clients WHERE contact_name='Import Bir'").get(), 'CI3 ko\'rishda hech narsa yozilmadi');
    const exRow = r.data.rows.find((x) => x.existing_id === EX);
    ok(exRow && exRow.notes.some((n) => n.includes('qo\'shilmaydi')), 'CI4 bazadagi mijozga qarz qayta qo\'shilmaydi (ogohlantirish)', exRow);
    r = await send(true);
    ok(r.status === 200 && r.data.created === 3 && r.data.updated === 1, 'CI5 import', r.data);
    const c = (name) => db.prepare('SELECT * FROM clients WHERE contact_name=? AND deleted_at IS NULL').get(name);
    ok(c('Import Bir') && c('Import Bir').phone === '+998907771101' && c('Import Bir').balance === -1500000 && c('Import Bir').address === 'Toshkent', 'CI6 telefon tozalandi, qarz yozildi', c('Import Bir'));
    ok(c('Import Ikki').balance === 30000 && c('Import Ikki').company_name === 'Ikki MChJ' && c('Import Ikki').type === 'b2b', 'CI7 avans va kompaniya', c('Import Ikki'));
    ok(c('Import Tort').balance === 20000, 'CI8 manfiy qarz — avans', c('Import Tort'));
    const ex = db.prepare('SELECT * FROM clients WHERE id=?').get(EX);
    ok(ex.balance === 0 && ex.address === 'Samarqand', 'CI9 bor mijoz: bo\'sh maydon to\'ldi, qarz qo\'shilmadi', ex);
    r = await send(true);
    ok(r.data.created === 0 && db.prepare("SELECT COUNT(*) n FROM clients WHERE contact_name='Import Bir'").get().n === 1 && c('Import Bir').balance === -1500000, 'CI10 qayta yuklash takror yaratmaydi', r.data);
    const bad = new ExcelJS.Workbook(); bad.addWorksheet('x').addRow(['Narsa', 'Boshqa']);
    const fd = new FormData(); fd.append('file', new Blob([Buffer.from(await bad.xlsx.writeBuffer())]), 'x.xlsx');
    ok((await admin.post('/api/import/clients', fd)).status === 400, 'CI11 sarlavhasiz fayl — tushunarli xato');
  }

  // ================= BK. Shifrlangan zaxira =================
  {
    let r = await owner.get('/api/owner/backups');
    ok(r.status === 200 && r.data.encrypted === false, 'BK1 standart: parol yo\'q');
    const snap = (await owner.post('/api/owner/backups')).data.name;
    ok((await owner.get(`/api/owner/backups/${snap}/download`)).status === 400, 'BK2 parolsiz yuklab olinmaydi (ochiq nusxa tarqalmasin)');
    ok((await owner.post('/api/owner/backups/password', { password: 'qisqa' })).status === 400, 'BK3 qisqa parol — rad');
    ok((await owner.post('/api/owner/backups/password', { password: 'Zaxira-parol-1' })).data.encrypted === true, 'BK4 parol o\'rnatildi');
    const biz = sqlite(DATA + '/main.db', { readonly: true });
    const stored = biz.prepare("SELECT group_concat(value,'|') v FROM business WHERE key LIKE 'backup%'").get().v || '';
    biz.close();
    ok(!stored.includes('Zaxira-parol-1'), 'BK5 parolning o\'zi saqlanmaydi');
    r = await owner.get(`/api/owner/backups/${snap}/download`);
    ok(r.status === 200 && Buffer.isBuffer(r.data) && r.data.subarray(0, 4).toString() === 'DKZ1', 'BK6 .dkz yuklab olindi', r.status);
    const dkz = r.data;
    ok(!dkz.includes(Buffer.from('SQLite format 3')), 'BK7 ichida ochiq baza yo\'q');
    ok((await admin.get(`/api/owner/backups/${snap}/download`)).status === 403, 'BK8 filial admini yuklab ololmaydi');
    r = await owner.post('/api/owner/backups/upload', dkz, { 'Content-Type': 'application/octet-stream', 'X-Backup-Password': 'xato' });
    ok(r.status === 400 && /Parol/.test(r.data.error), 'BK9 noto\'g\'ri parol — rad', r.data);
    r = await owner.post('/api/owner/backups/upload', dkz, { 'Content-Type': 'application/octet-stream', 'X-Backup-Password': encodeURIComponent('Zaxira-parol-1') });
    ok(r.status === 200 && /_fayldan$/.test(r.data.name), 'BK10 fayldan qo\'shildi', r.data);
    const up = (await owner.get('/api/owner/backups')).data.rows.find((x) => x.name === r.data.name);
    ok(up && up.branches >= 1 && fs.existsSync(path.join(DATA, 'backups', r.data.name, 'main.db')), 'BK11 ro\'yxatda, filial bazalari bilan (tiklashga tayyor)', up);
    await owner.post('/api/owner/backups/password', { password: '' });
    ok((await owner.get('/api/owner/backups')).data.encrypted === false, 'BK12 parol o\'chirildi');
  }

  // ================= AR. Eski jurnalni arxivlash =================
  {
    db.prepare("INSERT INTO audit_log (at,user_name,action,entity,summary) VALUES ('2019-03-04 10:00:00','test','create','test','Juda eski yozuv AR')").run();
    const newer = db.prepare('SELECT COUNT(*) n FROM audit_log WHERE at >= ?').get('2025-01-01').n;
    const r = await owner.post('/api/owner/archive/audit');
    ok(r.status === 200 && r.data.archived >= 1, 'AR1 arxivlandi', r.data);
    ok(!db.prepare("SELECT 1 FROM audit_log WHERE summary='Juda eski yozuv AR'").get(), 'AR2 bazadan chiqdi');
    ok(db.prepare('SELECT COUNT(*) n FROM audit_log WHERE at >= ?').get('2025-01-01').n >= newer, 'AR3 yangi yozuvlarga tegilmadi');
    const dir = path.join(DATA, 'archive', 'audit', '1');
    const text = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString()).join('') : '';
    ok(text.includes('Juda eski yozuv AR'), 'AR4 arxiv faylida saqlangan (gzip JSON)');
    ok((await admin.post('/api/owner/archive/audit')).status === 403, 'AR5 filial admini ishga tushira olmaydi');
  }

  console.log(`KAMCHILIKLAR: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
