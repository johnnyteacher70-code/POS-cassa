// Server qayta ishga tushgandan keyin: filiallar, loginlar va ma'lumotlar joyida (TZ 8.12)
// Ishga tushirish: node restart_check.js <baseURL>
const B = process.argv[2];
let pass = 0, fail = 0;
const fails = [];
const ok = (c, n, e) => { if (c) pass++; else { fail++; fails.push(n + (e !== undefined ? ' → ' + JSON.stringify(e).slice(0, 200) : '')); } };

async function login(username, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const m = (r.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return m ? 'sid=' + m[1] : null;
}
const get = async (p, cookie) => (await fetch(B + p, { headers: cookie ? { Cookie: cookie } : {} })).json();

(async () => {
  ok((await get('/api/setup')).needed === false, 'Q1 qayta ishga tushgach setup so\'ralmaydi');
  const o = await login('owner', 'owner123');
  const list = o && await get('/api/owner/branches', o);
  ok(Array.isArray(list) && list.length >= 3 && list.some((b) => b.slug === 'filial-a'), 'Q2 filiallar joyida', list && list.length);
  const a = await login('admin', 'admin123');
  const cl = a && await get('/api/clients', a);
  ok(cl && cl.count > 10, 'Q3 A filial mijozlari joyida', cl && cl.count);
  const x = await login('isox_admin', 'pass1234');
  ok(x && /MIJOZ_X/.test(JSON.stringify(await get('/api/clients', x))), 'Q4 ajratish testidagi X ma\'lumotlari joyida');
  console.log(`\nQAYTA ISHGA TUSHIRISH: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
