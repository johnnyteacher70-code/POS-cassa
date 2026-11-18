// Rollar va ruxsatlar: qo'lda yaratiladigan rollar, har bir amalning ruxsati, huquqni oshirib berishga qarshi himoya.
// node roles_test.js <baseURL> <DATA_DIR> <projectRoot>
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
async function login(username, password) {
  const c = client();
  const r = await c.post('/api/auth/login', { username, password });
  if (r.status !== 200) throw new Error(`${username} kira olmadi: ${JSON.stringify(r.data)}`);
  return c;
}

(async () => {
  const admin = await login('admin', 'admin123');

  // ================= R. Katalog va tayyor rollar =================
  let r = await admin.get('/api/auth/perms');
  ok(r.status === 200 && r.data.groups.some((g) => g.perms.some((p) => p.key === 'roles.manage')), 'R1 ruxsatlar katalogi', r.data);
  const roles = (await admin.get('/api/auth/roles')).data;
  const adminRole = roles.find((x) => x.is_system);
  ok(adminRole && adminRole.name === 'Administrator' && adminRole.perms[0] === '*', 'R2 Administrator — tizim roli', roles);
  ok(['Sotuvchi', 'Kassir', 'Omborchi', 'Buxgalter', 'Menejer'].every((n) => roles.some((x) => x.name === n)), 'R2a tayyor rollar yaratilgan');
  ok(db.prepare("SELECT COUNT(*) n FROM users WHERE role_id IS NULL").get().n === 0, 'R2b barcha xodimlarda rol bor');

  // ================= C. Rol yaratish =================
  r = await admin.post('/api/auth/roles', { name: 'Test kassir', perms: ['pos.use', 'yolgon.ruxsat', '*'] });
  ok(r.status === 200, 'C1 rol yaratildi', r.data);
  const TK = r.data.id;
  ok(JSON.stringify((await admin.get('/api/auth/roles')).data.find((x) => x.id === TK).perms) === '["pos.use"]', 'C2 noma\'lum ruxsat va "*" saqlanmaydi');
  ok((await admin.post('/api/auth/roles', { name: 'test KASSIR', perms: [] })).status === 400, 'C3 bir xil nom — rad');
  ok((await admin.post('/api/auth/roles', { name: '', perms: [] })).status === 400, 'C4 nomsiz — rad');
  ok((await admin.put('/api/auth/roles/' + adminRole.id, { name: 'X', perms: [] })).status === 400, 'C5 Administrator rolini o\'zgartirib bo\'lmaydi');
  ok((await admin.del('/api/auth/roles/' + adminRole.id)).status === 400, 'C6 Administrator rolini o\'chirib bo\'lmaydi');

  r = await admin.post('/api/auth/users', { username: 'tkassir', password: '1234', full_name: 'Test Kassir', role_id: TK });
  ok(r.status === 200, 'C7 rol bilan xodim', r.data);
  const tkId = r.data.id;
  const kas = await login('tkassir', '1234');
  r = await kas.get('/api/auth/me');
  ok(r.data.role_id === TK && r.data.role_name === 'Test kassir' && JSON.stringify(r.data.perms) === '["pos.use"]' && r.data.role === 'seller', 'C8 /me: rol va ruxsatlar', r.data);

  // ================= P. Ruxsatlar amalda (faqat pos.use) =================
  const P = (await admin.get('/api/products')).data.find((p) => p.piece_price >= 10000 && !p.deleted_at);
  const C = (await admin.post('/api/clients', { type: 'b2c', contact_name: 'Rol Mijoz', phone: '+998 93 111 22 33' })).data.id;
  ok((await kas.get('/api/dashboard')).status === 403, 'P1 bosh sahifa — ruxsat yo\'q');
  ok((await kas.get('/api/clients?q=Rol')).status === 200, 'P2 mijoz qidirish (kassa uchun) — bor');
  ok((await kas.get(`/api/clients/${C}?brief=1`)).status === 200, 'P3 mijoz qisqa ma\'lumoti — bor');
  ok((await kas.get(`/api/clients/${C}`)).status === 403, 'P4 mijoz kartasi (to\'liq) — yo\'q');
  ok((await kas.get('/api/products')).status === 200, 'P5 mahsulotlar ro\'yxati — bor');
  ok((await kas.post('/api/products', { name: 'X' })).status === 403, 'P6 mahsulot qo\'shish — yo\'q');
  ok((await kas.get('/api/audit')).status === 403, 'P7 tarix — yo\'q');
  ok((await kas.get('/api/payments')).status === 403, 'P8 to\'lovlar ro\'yxati — yo\'q');
  ok((await kas.put('/api/settings', { company_name: 'X' })).status === 403, 'P9 sozlamalar — yo\'q');
  ok((await kas.get('/api/auth/users')).status === 403, 'P10 xodimlar — yo\'q');
  ok((await kas.get('/api/auth/roles')).status === 403, 'P11 rollar — yo\'q');
  ok((await kas.post('/api/clients', { type: 'b2c', contact_name: 'Y' })).status === 403, 'P12 mijoz qo\'shish (forma) — yo\'q');
  ok((await kas.post('/api/clients/quick', { q: '+998 93 777 66 55' })).status !== 403, 'P13 kassada tezkor mijoz — bor');
  ok((await kas.get('/api/orders/count')).data.new === 0, 'P14 buyurtmalar soni — ruxsatsiz 0');
  ok((await kas.get('/api/orders')).status === 403, 'P15 buyurtmalar — yo\'q');

  const item = { product_id: P.id, unit: 'dona', qty: 1, price: P.piece_price };
  r = await kas.post('/api/sales', { client_id: C, items: [item], pay_now: { amount: P.piece_price, method: 'cash' } });
  ok(r.status === 200 && r.data.summary.debt === 0, 'S1 to\'liq to\'langan sotuv — bor', r.data);
  const ownSale = r.data.id;
  ok((await kas.post('/api/sales', { client_id: C, items: [item] })).status === 403, 'S2 qarzga sotish — yo\'q');
  ok((await kas.post('/api/sales', { client_id: C, items: [item], discount: 1000, pay_now: { amount: P.piece_price } })).status === 403, 'S3 chegirma — yo\'q');
  ok((await kas.post('/api/sales', { client_id: C, items: [{ ...item, price: P.piece_price - 1000 }], pay_now: { amount: P.piece_price } })).status === 403, 'S4 narxni pasaytirish — yo\'q');
  ok((await kas.post('/api/sales', { client_id: C, items: [{ ...item, price: P.piece_price + 1000 }], pay_now: { amount: P.piece_price + 1000 } })).status === 200, 'S5 narxni oshirish — mumkin');
  ok((await kas.post('/api/sales', { client_id: C, items: [{ name: 'Erkin mahsulot', unit: 'dona', qty: 1, price: 5000 }], pay_now: { amount: 5000 } })).status === 403, 'S6 katalogda yo\'q mahsulot — narx ruxsatisiz yo\'q');
  ok((await kas.post('/api/sales', { kind: 'opening', client_id: C, total: 50000 })).status === 403, 'S7 boshlang\'ich qarz — yo\'q');
  r = await kas.get('/api/sales');
  ok(r.status === 200 && r.data.rows.length >= 1 && r.data.rows.every((s) => s.created_by === tkId), 'S8 sotuvlar ro\'yxati — faqat o\'zinikilar', r.data.rows.length);
  ok((await kas.get('/api/sales/' + ownSale)).status === 200, 'S9 o\'z sotuvi (chek) — bor');
  const other = db.prepare('SELECT id FROM sales WHERE created_by<>? AND deleted_at IS NULL LIMIT 1').get(tkId).id;
  ok((await kas.get('/api/sales/' + other)).status === 403, 'S10 boshqaning sotuvi — yo\'q');
  ok((await kas.post(`/api/sales/${ownSale}/cancel`)).status === 403, 'S11 bekor qilish — yo\'q');
  r = await kas.get('/api/staff/report');
  ok(r.status === 200 && r.data.length === 1 && r.data[0].id === tkId, 'S12 xodim hisoboti — faqat o\'zi', r.data.length);

  // Ruxsat qo'shilsa — qayta kirmasdan darhol ishlaydi
  r = await admin.put('/api/auth/roles/' + TK, { name: 'Test kassir', perms: ['pos.use', 'sales.credit', 'dashboard.view'] });
  ok(r.status === 200, 'U1 rol tahrirlandi', r.data);
  ok((await kas.post('/api/sales', { client_id: C, items: [item] })).status === 200, 'U2 qarzga sotish — endi bor (darhol)');
  ok((await kas.get('/api/dashboard')).status === 200, 'U3 bosh sahifa — endi bor');
  ok(db.prepare("SELECT summary FROM audit_log WHERE entity='role' AND entity_id=? ORDER BY id DESC LIMIT 1").get(TK).summary.includes('+sales.credit'), 'U4 tarixda ruxsatlar farqi');

  // ================= E. Huquqni oshirib berishga qarshi =================
  r = await admin.post('/api/auth/roles', { name: 'Kadrlar', perms: ['users.manage', 'roles.manage'] });
  const HR = r.data.id;
  r = await admin.post('/api/auth/users', { username: 'kadr', password: '12345', role_id: HR });
  ok(r.status === 400, 'E0 xodim/rol boshqaruvchisi paroli kamida 6', r.data);
  r = await admin.post('/api/auth/users', { username: 'kadr', password: 'kadr123', full_name: 'Kadrlar', role_id: HR });
  const hrId = r.data.id;
  const hr = await login('kadr', 'kadr123');
  ok((await hr.get('/api/auth/users')).status === 200, 'E1 xodimlar ro\'yxati — bor');
  ok((await hr.post('/api/auth/roles', { name: 'Ko\'proq', perms: ['audit.view'] })).status === 403, 'E2 o\'zida yo\'q ruxsatli rol — rad');
  r = await hr.post('/api/auth/roles', { name: 'Yordamchi kadr', perms: ['users.manage'] });
  ok(r.status === 200, 'E3 o\'z doirasidagi rol — mumkin', r.data);
  const SUB = r.data.id;
  ok((await hr.post('/api/auth/users', { username: 'hacker1', password: 'hacker123', role_id: adminRole.id })).status === 403, 'E4 Administrator rolini berish — rad');
  ok((await hr.post('/api/auth/users', { username: 'hacker2', password: 'hacker123', role: 'admin' })).status === 403, 'E5 eski API orqali admin — rad');
  ok((await hr.post('/api/auth/users', { username: 'hacker3', password: '1234', role_id: TK })).status === 403, 'E6 o\'zida yo\'q ruxsatli rolni berish — rad');
  ok((await hr.post('/api/auth/users', { username: 'yordamchi', password: 'yordam123', role_id: SUB })).status === 200, 'E7 o\'z doirasidagi rolni berish — mumkin');
  const adminUser = db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
  ok((await hr.put('/api/auth/users/' + adminUser, { full_name: 'X', role_id: SUB, active: 0 })).status === 403, 'E8 admin xodimni tahrirlash — rad');
  ok((await hr.put('/api/auth/users/' + hrId, { full_name: 'Kadrlar', role_id: adminRole.id })).status === 403, 'E9 o\'ziga admin rolini berish — rad');
  ok((await hr.put('/api/auth/users/' + hrId, { full_name: 'Kadrlar', role_id: SUB })).status === 400, 'E10 o\'z rolini o\'zgartirish — rad');
  ok((await hr.put('/api/auth/users/' + hrId, { full_name: 'Kadrlar', role_id: HR, active: 0 })).status === 400, 'E11 o\'zini o\'chirish — rad');
  ok((await hr.put('/api/auth/roles/' + HR, { name: 'Kadrlar', perms: ['users.manage', 'roles.manage', 'audit.view'] })).status === 400, 'E12 o\'z rolini tahrirlash — rad');
  ok((await hr.put('/api/auth/roles/' + TK, { name: 'Test kassir', perms: [] })).status === 403, 'E13 o\'zidan boshqa ruxsatli rolni tahrirlash — rad');
  ok((await hr.del('/api/auth/roles/' + TK)).status === 403, 'E14 bunday rolni o\'chirish — rad');
  ok((await admin.put('/api/auth/users/' + adminUser, { full_name: 'Admin', role_id: TK })).status === 400, 'E15 admin o\'z rolini tushira olmaydi');

  // ================= D. O'chirish =================
  ok((await admin.del('/api/auth/roles/' + TK)).status === 400, 'D1 xodimi bor rolni o\'chirib bo\'lmaydi');
  await admin.put('/api/auth/users/' + tkId, { full_name: 'Test Kassir', role_id: SUB, active: 0 });
  ok((await admin.del('/api/auth/roles/' + TK)).status === 200, 'D2 bo\'sh rol o\'chirildi');
  ok((await kas.get('/api/auth/me')).status === 401, 'D3 o\'chirilgan (nofaol) xodim sessiyasi yopildi');

  // ================= L. Eski API va egasi =================
  r = await admin.post('/api/auth/users', { username: 'eski_admin', password: 'eski123', role: 'admin' });
  ok(r.status === 200 && db.prepare('SELECT role_id, role FROM users WHERE id=?').get(r.data.id).role_id === adminRole.id, 'L1 role:"admin" → Administrator roli');
  const owner = await login('owner', 'owner123');
  await owner.post('/api/owner/enter', { branch_id: 1 });
  r = await owner.get('/api/auth/me');
  ok(JSON.stringify(r.data.perms) === '["*"]' && r.data.role_name === 'Egasi', 'L2 egasi filialda — barcha ruxsatlar', r.data);
  ok((await owner.put('/api/auth/roles/' + HR, { name: 'Kadrlar', perms: ['users.manage'] })).status === 200, 'L3 egasi istalgan rolni tahrirlaydi');

  console.log(`ROLLAR: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
