// Filiallar va kirish testi: egasi, filial yaratish, login → filial, ajratish, bloklash, parol tiklash.
// bootstrap.js va demo (A filiali) dan keyin ishga tushiriladi: node branches_test.js <baseURL> <DATA_DIR> <projectRoot>
const [B, DATA, ROOT] = process.argv.slice(2);
const sqlite = require(ROOT + '/node_modules/better-sqlite3');
const mainDb = sqlite(DATA + '/main.db', { readonly: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

function client() {
  let cookie = '';
  const headers = {};
  return {
    set(h) { Object.assign(headers, h); return this; },
    async req(method, path, body) {
      const h = { ...headers };
      if (cookie) h.Cookie = cookie;
      let b;
      if (body instanceof FormData) b = body;
      else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(B + path, { method, headers: h, body: b, redirect: 'manual' });
      const sc = r.headers.get('set-cookie');
      if (sc) { const m = sc.match(/sid=([^;]*)/); if (m) cookie = m[1] ? 'sid=' + m[1] : ''; }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data };
    },
    get(p) { return this.req('GET', p); }, post(p, b) { return this.req('POST', p, b ?? {}); },
    put(p, b) { return this.req('PUT', p, b); }, del(p) { return this.req('DELETE', p); },
    get cookie() { return cookie; },
  };
}

(async () => {
  const anon = client();
  const owner = client();
  const aAdmin = client();

  // ================= S. Birinchi sozlash =================
  ok((await anon.get('/api/setup')).data.needed === false, 'S1 egasi bor — setup kerak emas');
  ok((await anon.post('/api/setup', { full_name: 'X', username: 'hacker', password: 'hacker123' })).status === 404, 'S2 setup ikkinchi marta ishlamaydi');
  ok(mainDb.prepare('SELECT COUNT(*) n FROM owners').get().n === 1, 'S3 egasi bitta');

  // ================= O. Egasi =================
  let r = await owner.post('/api/auth/login', { username: 'owner', password: 'xato' });
  ok(r.status === 401, 'O1 egasi: xato parol → 401');
  r = await owner.post('/api/auth/login', { username: 'OWNER', password: 'owner123' });
  ok(r.status === 200 && r.data.kind === 'owner', 'O2 egasi kirdi (login katta-kichik harf farqsiz)', r.data);
  r = await owner.get('/api/auth/me');
  ok(r.data.owner === true && r.data.branch === null && !('role' in r.data), 'O3 /me: egasi, filial tanlanmagan', r.data);
  r = await owner.get('/api/clients');
  ok(r.status === 403 && r.data.code === 'no_branch', 'O4 filial tanlanmasa filial API → 403 no_branch', r);
  r = await owner.get('/api/owner/branches');
  ok(r.status === 200 && r.data.length === 1 && r.data[0].slug === 'filial-a' && r.data[0].staff_count >= 1, 'O5 filiallar ro\'yxati', r.data);

  // Ruxsatlar
  ok((await anon.get('/api/owner/branches')).status === 401, 'O6 kirmagan → 401');
  await aAdmin.post('/api/auth/login', { username: 'admin', password: 'admin123' });
  ok((await aAdmin.get('/api/owner/branches')).status === 403, 'O7 filial admini egasi API\'siga kira olmaydi');
  ok((await aAdmin.post('/api/owner/enter', { branch_id: 1 })).status === 403, 'O8 filial admini boshqa filialga "kira" olmaydi');

  // ================= F. Filial yaratish =================
  const mk = (o) => ({ name: 'B filial', slug: 'filial-b', address: 'Yunusobod', phone: '+998 90 000 00 02', admin: { full_name: 'B Admin', username: 'badmin', password: 'bpass1' }, ...o });
  ok((await owner.post('/api/owner/branches', mk({ name: '' }))).status === 400, 'F1 nomsiz → 400');
  ok((await owner.post('/api/owner/branches', mk({ slug: 'Filial B!' }))).status === 400, 'F2 noto\'g\'ri qisqa kod → 400');
  ok((await owner.post('/api/owner/branches', mk({ slug: 'filial-a' }))).status === 400, 'F3 band qisqa kod → 400');
  ok((await owner.post('/api/owner/branches', mk({ admin: { username: 'admin', password: 'xxxx' } }))).status === 400, 'F4 A filialdagi login band → 400');
  ok((await owner.post('/api/owner/branches', mk({ admin: { username: 'owner', password: 'xxxx' } }))).status === 400, 'F5 egasi logini band → 400');
  ok((await owner.post('/api/owner/branches', mk({ admin: { username: 'bb', password: 'xxxx' } }))).status === 400, 'F6 qisqa login → 400');
  ok((await owner.post('/api/owner/branches', mk({ admin: { username: 'badmin', password: '12' } }))).status === 400, 'F7 qisqa parol → 400');
  ok((await owner.post('/api/owner/branches', mk({ doc_prefix: 'xx-1' }))).status === 400, 'F8 noto\'g\'ri prefiks → 400');
  ok(mainDb.prepare('SELECT COUNT(*) n FROM branches').get().n === 1, 'F9 xato so\'rovlardan keyin yarim filial qolmadi');
  r = await owner.post('/api/owner/branches', mk({ doc_prefix: 'yb' }));
  ok(r.status === 200 && r.data.id === 2 && r.data.doc_prefix === 'YB' && r.data.status === 'active', 'F10 B filial yaratildi', r.data);
  const BID = r.data.id;
  r = await owner.post('/api/owner/branches', { name: 'C filial', slug: 'filial-c', admin: { username: 'cadmin', password: 'cpass1' } });
  ok(r.status === 200 && r.data.id === 3, 'F11 C filial yaratildi', r.data);
  ok((await owner.get('/api/owner/branches')).data.length === 3, 'F12 ro\'yxatda 3 ta filial');

  // ================= L. Login → o'z filiali =================
  const bAdmin = client();
  r = await bAdmin.post('/api/auth/login', { username: 'badmin', password: 'bpass1' });
  ok(r.status === 200 && r.data.kind === 'staff' && r.data.role === 'admin' && r.data.branch.id === BID, 'L1 B admini kirdi → B filial', r.data);
  r = await bAdmin.get('/api/auth/me');
  ok(r.data.owner === false && r.data.branch.slug === 'filial-b' && r.data.username === 'badmin', 'L2 /me: B filial', r.data);
  r = await bAdmin.get('/api/settings');
  ok(r.data.company_name === 'B filial' && r.data.company_address === 'Yunusobod', 'L3 B sozlamalari filial ma\'lumotidan', r.data);

  // ================= I. Ma'lumotlar ajratilishi =================
  const aClients = (await aAdmin.get('/api/clients')).data;
  const bClients = (await bAdmin.get('/api/clients')).data;
  ok(aClients.count > 0 && bClients.count === 0, 'I1 A da mijozlar bor, B da yo\'q', [aClients.count, bClients.count]);
  ok((await aAdmin.get('/api/products')).data.length > 0 && (await bAdmin.get('/api/products')).data.length === 0, 'I2 mahsulotlar ham alohida');
  ok((await bAdmin.get('/api/sales')).data.rows.length === 0, 'I3 B da sotuv yo\'q');
  const bd = (await bAdmin.get('/api/dashboard')).data;
  ok(bd.totals.receivable === 0 && bd.totals.clients === 0 && bd.recent.every((x) => !/demo|Ali/.test(x.summary)), 'I4 B bosh sahifasi bo\'sh', bd.totals);
  r = await bAdmin.post('/api/clients', { type: 'b2b', company_name: 'Faqat B MChJ', phone: '+998 91 222 33 44' });
  ok(r.status === 200, 'I5 B ga mijoz qo\'shildi', r.data);
  const BC = r.data.id;
  ok(!(await aAdmin.get('/api/clients?q=' + encodeURIComponent('Faqat B'))).data.rows.some((c) => c.company_name === 'Faqat B MChJ'), 'I6 A qidiruvida B mijozi yo\'q');
  // ID bo'yicha: A da shu raqamli mijoz bo'lsa ham — bu A ning o'z mijozi, B niki emas
  r = await aAdmin.get('/api/clients/' + BC);
  ok(r.status === 404 || (r.data.client && r.data.client.company_name !== 'Faqat B MChJ'), 'I7 B mijozi ID si bilan A dan ochilmaydi', r.data.client && r.data.client.company_name);
  // Hujjat raqamlari har bir filialda alohida
  const bp = await bAdmin.post('/api/products', { name: 'B atir', piece_price: 1000, box_qty: 1 });
  r = await bAdmin.post('/api/sales', { client_id: BC, items: [{ product_id: bp.data.id, unit: 'dona', qty: 1 }] });
  ok(r.status === 200 && /^YB-N\d{4}-0001$/.test(r.data.number), 'I8 B dagi birinchi sotuv: filial prefiksi bilan, raqam 0001', r.data.number);
  ok(/^N\d{4}-\d{4}$/.test((await aAdmin.get('/api/sales')).data.rows[0].number), 'I8a A da prefiks yo\'q — eski formatda');
  ok((await bAdmin.get('/api/audit')).data.every((a) => !/Ali|demo/i.test(a.user_name)), 'I9 B jurnalida A xodimlari yo\'q');

  // ================= X. Xodimlar (login butun tizimda yagona) =================
  ok((await bAdmin.post('/api/auth/users', { username: 'ali', password: '1234' })).status === 400, 'X1 A dagi "ali" logini B da band');
  ok((await aAdmin.post('/api/auth/users', { username: 'badmin', password: '1234' })).status === 400, 'X2 B admini logini A da band');
  ok((await bAdmin.post('/api/auth/users', { username: 'owner', password: '1234' })).status === 400, 'X3 egasi logini band');
  r = await bAdmin.post('/api/auth/users', { username: 'bseller', password: '1234', full_name: 'B Sotuvchi' });
  ok(r.status === 200, 'X4 B ga sotuvchi qo\'shildi', r.data);
  const bSeller = client();
  r = await bSeller.post('/api/auth/login', { username: 'bseller', password: '1234' });
  ok(r.status === 200 && r.data.branch.id === BID && r.data.role === 'seller', 'X5 B sotuvchisi → B filial', r.data);
  ok(!(await aAdmin.get('/api/auth/users')).data.some((u) => u.username === 'bseller'), 'X6 A xodimlar ro\'yxatida B sotuvchisi yo\'q');
  ok(mainDb.prepare("SELECT branch_id FROM logins WHERE username='bseller'").get().branch_id === BID, 'X7 login indeksi → B');

  // ================= E. Egasi filialga kiradi =================
  ok((await owner.post('/api/owner/enter', { branch_id: 99 })).status === 404, 'E1 mavjud bo\'lmagan filial → 404');
  r = await owner.post('/api/owner/enter', { branch_id: BID });
  ok(r.status === 200 && r.data.branch.id === BID, 'E2 egasi B ga kirdi');
  r = await owner.get('/api/auth/me');
  ok(r.data.owner === true && r.data.branch.id === BID && r.data.role === 'admin' && /^Egasi:/.test(r.data.full_name), 'E3 /me: egasi B ichida', r.data);
  ok((await owner.get('/api/clients')).data.count === 1, 'E4 egasi B mijozlarini ko\'radi');
  r = await owner.post('/api/clients', { type: 'b2c', contact_name: 'Egasi qo\'shgan', phone: '+998 91 555 66 77' });
  ok(r.status === 200, 'E5 egasi B da amal bajardi');
  const au = (await owner.get('/api/audit?entity=client')).data[0];
  ok(au && /^Egasi: Biznes Egasi$/.test(au.user_name), 'E6 jurnalda "Egasi: ..." deb yozildi', au);
  ok(!(await owner.get('/api/auth/users')).data.some((u) => u.username.startsWith('__owner')), 'E7 egasining yozuvi xodimlar ro\'yxatida ko\'rinmaydi');
  ok((await anon.post('/api/auth/login', { username: '__owner_1', password: '!' })).status === 401, 'E8 egasining filialdagi yozuvi orqali kirib bo\'lmaydi');
  ok((await owner.get('/api/owner/branches')).status === 200, 'E9 filial ichida ham filiallar ro\'yxati ochiladi');
  await owner.post('/api/owner/enter', { branch_id: 1 });
  ok((await owner.get('/api/clients')).data.count === aClients.count, 'E10 egasi A ga o\'tdi — A mijozlari');
  await owner.post('/api/owner/leave');
  ok((await owner.get('/api/clients')).status === 403, 'E11 filiallar sahifasiga qaytdi → filial API yopiq');

  // ================= K. Bloklash =================
  r = await owner.post(`/api/owner/branches/${BID}/status`, { status: 'blocked' });
  ok(r.status === 200 && r.data.status === 'blocked', 'K1 B bloklandi');
  ok((await bAdmin.get('/api/clients')).status === 401 && (await bSeller.get('/api/clients')).status === 401, 'K2 B xodimlari darhol chiqarib yuborildi');
  r = await bAdmin.post('/api/auth/login', { username: 'badmin', password: 'bpass1' });
  ok(r.status === 403 && /yopilgan/.test(r.data.error), 'K3 bloklangan filialga kirib bo\'lmaydi', r.data);
  ok((await bAdmin.post('/api/auth/login', { username: 'badmin', password: 'xato' })).status === 401, 'K4 xato parolda filial holati oshkor qilinmaydi');
  ok((await aAdmin.get('/api/clients')).status === 200, 'K5 A ishlashda davom etadi');
  ok((await anon.get('/api/shop/filial-b/catalog')).status === 404, 'K6 bloklangan filial katalogi yopiq');
  ok((await owner.post(`/api/owner/branches/${BID}/status`, { status: 'x' })).status === 400, 'K7 noto\'g\'ri holat → 400');
  await owner.post(`/api/owner/branches/${BID}/status`, { status: 'active' });
  ok((await bAdmin.post('/api/auth/login', { username: 'badmin', password: 'bpass1' })).status === 200, 'K8 faollashtirilgach kirish mumkin');

  // ================= P. Admin parolini tiklash, tahrirlash =================
  const admins = (await owner.get(`/api/owner/branches/${BID}/admins`)).data;
  ok(admins.length === 1 && admins[0].username === 'badmin', 'P1 B adminlari ro\'yxati', admins);
  ok((await owner.post(`/api/owner/branches/${BID}/admin-password`, { user_id: admins[0].id, password: '1' })).status === 400, 'P2 qisqa parol → 400');
  const sellerId = (await bAdmin.get('/api/auth/users')).data.find((u) => u.username === 'bseller').id;
  ok((await owner.post(`/api/owner/branches/${BID}/admin-password`, { user_id: sellerId, password: 'zzzzz1' })).status === 404, 'P3 sotuvchi parolini egasi bu yo\'l bilan tiklamaydi');
  ok((await owner.post(`/api/owner/branches/${BID}/admin-password`, { user_id: admins[0].id, password: 'yangi1' })).status === 200, 'P4 B admin paroli tiklandi');
  ok((await bAdmin.get('/api/clients')).status === 401, 'P5 eski sessiya yopildi');
  ok((await client().post('/api/auth/login', { username: 'badmin', password: 'yangi1' })).status === 200, 'P6 yangi parol bilan kiradi');
  r = await owner.put(`/api/owner/branches/${BID}`, { name: 'B filial (Yunusobod)', address: 'Yunusobod 5', phone: '', doc_prefix: '' });
  ok(r.status === 200 && r.data.name === 'B filial (Yunusobod)' && r.data.slug === 'filial-b', 'P7 filial tahrirlandi, qisqa kod o\'zgarmaydi', r.data);

  // ================= R. Rasmlar va katalog =================
  const aImg = (await aAdmin.get('/api/products')).data.find((p) => p.image && p.image.startsWith('/uploads/1/'));
  ok(!!aImg, 'R1 A rasmlari /uploads/1/ da');
  if (aImg) {
    ok((await fetch(B + aImg.image)).status === 200, 'R2 A rasmi ochiladi');
    ok((await fetch(B + aImg.image.replace('/uploads/1/', '/uploads/2/'))).status === 404, 'R3 A rasmi B yo\'li orqali ochilmaydi');
  }
  ok((await fetch(B + '/uploads/1/..%2Fapp.db')).status === 404 && (await fetch(B + '/uploads/1/%2e%2e/app.db')).status === 404, 'R4 papkadan tashqariga chiqib bo\'lmaydi');
  ok((await fetch(B + '/uploads/99/x.png')).status === 404, 'R5 mavjud bo\'lmagan filial rasmi → 404');
  const catA = (await anon.get('/api/shop/filial-a/catalog')).data;
  const catB = (await anon.get('/api/shop/filial-b/catalog')).data;
  ok(catA.products.length > 0 && catB.products.length === 1 && catB.products[0].name === 'B atir', 'R6 kataloglar alohida', [catA.products.length, catB.products.length]);
  ok((await anon.get('/api/shop/yoq-filial/catalog')).status === 404, 'R7 noma\'lum filial katalogi → 404');
  const shopA = client();
  const reg = await shopA.post('/api/shop/filial-a/web/register', { phone: '+998 93 777 11 22', password: 'parol1', contact_name: 'A Xaridor' });
  shopA.set({ 'X-Shop-Token': reg.data.token });
  ok((await shopA.get('/api/shop/filial-a/me')).data.client.name === 'A Xaridor', 'R8 A katalogida kirdi');
  ok((await shopA.get('/api/shop/filial-b/me')).data.client === null, 'R9 A katalog tokeni B da ishlamaydi');
  ok((await client().post('/api/shop/filial-b/web/login', { phone: '+998937771122', password: 'parol1' })).status === 401, 'R10 A mijozi B katalogiga kira olmaydi');
  // Admin sessiyasi bilan katalogga yozilgan amal admin nomiga yozilmaydi (filial aralashmaydi)
  const bAdmin2 = client(); await bAdmin2.post('/api/auth/login', { username: 'badmin', password: 'yangi1' });
  const shopAsAdmin = client(); shopAsAdmin.set({ Cookie: bAdmin2.cookie });
  await shopAsAdmin.post('/api/shop/filial-a/web/register', { phone: '+998 93 777 11 33', password: 'parol1', contact_name: 'Admin cookie bilan' });
  const lastA = (await aAdmin.get('/api/audit?entity=client')).data[0];
  ok(lastA && lastA.user_name === 'Sayt: Admin cookie bilan' && !lastA.user_id, 'R11a B admin cookie\'si A katalogida admin sifatida hisoblanmaydi', lastA);
  r = await anon.get('/api/shop-branches');
  ok(r.data.length === 3 && r.data.every((b) => b.slug && b.name && !('id' in b) && !('status' in b)), 'R11 ochiq filiallar ro\'yxati (ichki ma\'lumotsiz)', r.data);

  // ================= D. Filialni o'chirish =================
  const cAdmin = client(); await cAdmin.post('/api/auth/login', { username: 'cadmin', password: 'cpass1' });
  await cAdmin.post('/api/clients', { type: 'b2c', contact_name: 'C mijozi', phone: '+998 94 111 22 33' });
  ok((await owner.del('/api/owner/branches/3')).status === 400, 'D1 faol filialni o\'chirib bo\'lmaydi');
  await owner.post('/api/owner/branches/3/status', { status: 'blocked' });
  ok((await owner.req('DELETE', '/api/owner/branches/3', { confirm_name: 'C' })).status === 400, 'D2 nomi noto\'g\'ri → 400');
  ok((await bAdmin2.req('DELETE', '/api/owner/branches/3', { confirm_name: 'C filial' })).status === 403, 'D3 filial admini o\'chira olmaydi');
  await owner.post('/api/owner/enter', { branch_id: 3 });
  r = await owner.req('DELETE', '/api/owner/branches/3', { confirm_name: 'C filial' });
  ok(r.status === 200 && r.data.backup, 'D4 C filial o\'chirildi', r.data);
  const fs = require('fs');
  ok(r.data.backup && fs.existsSync(r.data.backup + '/branches/3/app.db') && fs.existsSync(r.data.backup + '/filial.json'), 'D5 o\'chirishdan oldin zaxira nusxa olindi');
  if (r.data.backup && fs.existsSync(r.data.backup + '/branches/3/app.db')) {
    const bk = sqlite(r.data.backup + '/branches/3/app.db', { readonly: true });
    ok(bk.prepare("SELECT COUNT(*) n FROM clients WHERE contact_name='C mijozi'").get().n === 1, 'D6 zaxirada C ma\'lumotlari bor');
    bk.close();
  }
  ok(!fs.existsSync(DATA + '/branches/3'), 'D7 C papkasi o\'chirildi');
  ok(!mainDb.prepare("SELECT 1 FROM logins WHERE username='cadmin'").get(), 'D8 C loginlari o\'chirildi');
  ok((await cAdmin.get('/api/clients')).status === 401 && (await client().post('/api/auth/login', { username: 'cadmin', password: 'cpass1' })).status === 401, 'D9 C admini kira olmaydi');
  r = await owner.get('/api/auth/me');
  ok(r.status === 200 && r.data.owner && r.data.branch === null, 'D10 C ichida turgan egasi chiqarib yuborilmadi — filiallar sahifasiga qaytdi', r.data);
  ok((await owner.get('/api/owner/branches')).data.length === 2, 'D11 ro\'yxatda 2 ta filial');
  ok((await anon.get('/api/shop/filial-c/catalog')).status === 404, 'D12 C katalogi yopildi');
  r = await owner.post('/api/owner/branches', { name: 'C2', slug: 'filial-c', admin: { username: 'cadmin', password: 'cpass1' } });
  ok(r.status === 200 && r.data.id === 4 && (await anon.get('/api/shop/filial-c/catalog')).data.products.length === 0, 'D13 qisqa kod va login qayta ishlatiladi, yangi filial bo\'sh (eski ID qayta berilmaydi)', r.data);

  // ================= Q. Qo'lda zaxira nusxa =================
  const out = require('child_process').execFileSync('node', [ROOT + '/server/backup.js'], { env: { ...process.env, DATA_DIR: DATA }, encoding: 'utf8' });
  const snap = (out.match(/\[backup\] (\S+)/) || [])[1];
  ok(snap && fs.existsSync(snap + '/main.db') && fs.existsSync(snap + '/branches/1/app.db') && fs.existsSync(snap + '/branches/2/app.db') && fs.existsSync(snap + '/branches/4/app.db'), 'Q1 zaxira: main.db va har bir filial bazasi', out);
  if (snap && fs.existsSync(snap + '/main.db')) {
    const m = sqlite(snap + '/main.db', { readonly: true });
    ok(m.prepare('SELECT COUNT(*) n FROM branches').get().n === 3, 'Q2 zaxiradagi main.db da 3 ta filial');
    m.close();
  }

  // Tashqi papkaga nusxa (fleshka): alohida "dokon-zaxira" papkasiga; boshqa fayllarga tegilmaydi
  {
    const os = require('os'), path = require('path');
    const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'usb-'));
    fs.mkdirSync(path.join(usb, '2020-01-01_0000-meniki'));   // foydalanuvchining sana nomli papkasi
    const o2 = require('child_process').execFileSync('node', [ROOT + '/server/backup.js'], { env: { ...process.env, DATA_DIR: DATA, BACKUP_COPY_DIR: usb, BACKUP_KEEP: '1' }, encoding: 'utf8' });
    const copied = fs.existsSync(path.join(usb, 'dokon-zaxira')) ? fs.readdirSync(path.join(usb, 'dokon-zaxira')).filter((f) => /^\d{4}-/.test(f)) : [];
    ok(copied.length === 1 && fs.existsSync(path.join(usb, 'dokon-zaxira', copied[0], 'main.db')), 'Q3 nusxa tashqi papkaga ko\'chirildi', o2);
    ok(fs.existsSync(path.join(usb, '2020-01-01_0000-meniki')), 'Q4 tashqi papkadagi boshqa fayllarga tegilmadi');
    const o3 = require('child_process').execFileSync('node', [ROOT + '/server/backup.js'], { env: { ...process.env, DATA_DIR: DATA, BACKUP_COPY_DIR: path.join(usb, 'yoq') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    ok(/\[backup\]/.test(o3), 'Q5 fleshka ulanmagan bo\'lsa ham asosiy nusxa olinadi (xato yo\'q)');
    fs.rmSync(usb, { recursive: true, force: true });
  }

  // ================= Z. Sessiya xavfsizligi =================
  ok((await client().set({ Cookie: 'sid=' + 'a'.repeat(64) }).get('/api/auth/me')).status === 401, 'Z1 soxta sessiya → 401');
  const pw = await owner.post('/api/auth/password', { old_password: 'owner123', new_password: 'owner456' });
  ok(pw.status === 200, 'Z2 egasi parolini o\'zgartirdi');
  ok((await client().post('/api/auth/login', { username: 'owner', password: 'owner456' })).status === 200, 'Z3 yangi parol bilan kiradi');
  await owner.post('/api/auth/password', { old_password: 'owner456', new_password: 'owner123' });

  console.log(`\nFILIALLAR: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
