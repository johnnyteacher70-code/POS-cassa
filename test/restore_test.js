// Zaxiradan tiklash (to'liq sikl): nazoratchi bilan server → nusxa → o'zgarish → tiklash → server qayta ishga tushadi →
// o'zgarish yo'q. Yangilanishdan oldingi avtomatik zaxira ham tekshiriladi.
// node test/restore_test.js <projectRoot>
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = process.argv[2];
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
const PORT = 3996;
const B = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    get(p) { return this.req('GET', p); }, post(p, b) { return this.req('POST', p, b ?? {}); },
  };
}
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/healthz')).ok) return true; } catch { /* hali yo'q */ } await sleep(250); } return false; }

(async () => {
  const sup = spawn(process.execPath, [path.join(ROOT, 'scripts/run.js')], { env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BACKUP_DISABLED: '1' }, stdio: 'ignore' });
  try {
    ok(await up(), 'R0 server (nazoratchi bilan) ishga tushdi');
    const owner = client();
    await owner.post('/api/setup', { full_name: 'Tiklash Egasi', username: 'tiklash', password: 'tiklash123' });
    await owner.post('/api/owner/branches', { name: 'Tiklash filiali', slug: 'tiklash', admin: { username: 'tadmin', password: 'tadmin123' } });
    const a = client(); await a.post('/api/auth/login', { username: 'tadmin', password: 'tadmin123' });
    await a.post('/api/clients', { type: 'b2c', contact_name: 'Nusxadagi mijoz' });
    let r = await owner.post('/api/owner/backups');
    ok(r.status === 200 && /qolda$/.test(r.data.name), 'R1 qo\'lda zaxira olindi', r.data);
    const snap = r.data.name;
    await a.post('/api/clients', { type: 'b2c', contact_name: 'Keyin qo\'shilgan mijoz' });
    r = await owner.get('/api/owner/backups');
    ok(r.data.rows.some((x) => x.name === snap && x.branches === 1 && x.size > 0), 'R2 ro\'yxatda', r.data.rows);
    ok((await owner.post('/api/owner/backups/restore', { name: snap })).status === 400, 'R3 tasdiqlashsiz tiklanmaydi');
    ok((await a.post('/api/owner/backups/restore', { name: snap, confirm: 'TIKLASH' })).status === 403, 'R4 filial admini tiklay olmaydi');
    r = await owner.post('/api/owner/backups/restore', { name: snap, confirm: 'TIKLASH' });
    ok(r.status === 200 && r.data.restarting, 'R5 tiklash boshlandi', r.data);
    await sleep(1500);
    ok(await up(), 'R6 server qayta ishga tushdi');
    const a2 = client(); await a2.post('/api/auth/login', { username: 'tadmin', password: 'tadmin123' });
    const names = (await a2.get('/api/clients')).data.rows.map((c) => c.contact_name);
    ok(names.includes('Nusxadagi mijoz') && !names.includes("Keyin qo'shilgan mijoz"), 'R7 ma\'lumotlar nusxadagidek', names);
    const dirs = fs.readdirSync(path.join(DATA, 'backups'));
    ok(dirs.some((d) => d.endsWith('tiklashdan_oldin')), 'R8 tiklashdan oldingi holat ham saqlangan', dirs);
    // ================= 2FA va faol kirishlar =================
    {
      const totp = require(path.join(ROOT, 'server/totp'));
      const o = client(); await o.post('/api/auth/login', { username: 'tiklash', password: 'tiklash123' });
      const st = await o.post('/api/owner/2fa/setup');
      ok(st.status === 200 && st.data.secret && st.data.qr.includes('<svg'), 'F1 2FA: QR kod va kalit', st.status);
      ok((await o.post('/api/owner/2fa/enable', { code: '000000' })).status === 400, 'F2 noto\'g\'ri kod bilan yoqilmaydi');
      ok((await o.post('/api/owner/2fa/enable', { code: totp.code(st.data.secret) })).status === 200, 'F3 2FA yoqildi');
      const n = client();
      let r = await n.post('/api/auth/login', { username: 'tiklash', password: 'tiklash123' });
      ok(r.data.need_2fa && r.data.ticket && (await n.get('/api/owner/branches')).status === 401, 'F4 parol to\'g\'ri — lekin kod so\'raladi, sessiya yo\'q', r.data);
      ok((await n.post('/api/auth/2fa', { ticket: r.data.ticket, code: '123456' })).status === 401, 'F5 noto\'g\'ri kod — rad');
      r = await n.post('/api/auth/2fa', { ticket: r.data.ticket, code: totp.code(st.data.secret) });
      ok(r.status === 200 && (await n.get('/api/owner/branches')).status === 200, 'F6 to\'g\'ri kod — kirildi');
      const ss = (await o.get('/api/owner/sessions')).data;
      const other = ss.find((x) => !x.current && x.kind === 'owner');
      ok(ss.some((x) => x.current) && other && other.ua !== undefined && !('token' in other), 'F7 faol kirishlar (tokensiz)', ss);
      ok((await o.req('DELETE', '/api/owner/sessions/' + other.id)).status === 200 && (await n.get('/api/owner/branches')).status === 401, 'F8 boshqa qurilma chiqarildi');
      ok((await o.post('/api/owner/2fa/disable', { password: 'tiklash123', code: totp.code(st.data.secret) })).status === 200, 'F9 2FA o\'chirildi');
    }
    // Yangilanish: versiya fayli eski bo'lsa — keyingi ishga tushishda zaxira olinadi
    fs.writeFileSync(path.join(DATA, '.app_version'), '1.0.0');
    sup.kill('SIGTERM'); await sleep(1200);
    const sup2 = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BACKUP_DISABLED: '1' }, stdio: 'ignore' });
    ok(await up(), 'R9 yangi versiya ishga tushdi');
    ok(fs.readdirSync(path.join(DATA, 'backups')).some((d) => d.endsWith('yangilash_1.0.0')), 'R10 yangilanishdan oldin avtomatik zaxira');
    ok(fs.readFileSync(path.join(DATA, '.app_version'), 'utf8') === require(path.join(ROOT, 'package.json')).version, 'R11 versiya yozildi');
    sup2.kill('SIGTERM'); await sleep(800);
  } finally {
    sup.kill('SIGTERM');
    await sleep(300);
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`TIKLASH: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST YIQILDI:', e); process.exit(1); });
