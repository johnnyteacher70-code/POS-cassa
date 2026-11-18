// Testlar uchun boshlang'ich holat: egasi akkaunti (birinchi sozlash) va A filiali (admin / admin123).
// Ishga tushirish: node bootstrap.js <baseURL>
const B = process.argv[2];

async function call(method, path, body, cookie) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = (r.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  return { status: r.status, data: await r.json().catch(() => null), cookie: sc ? 'sid=' + sc[1] : cookie };
}

(async () => {
  const st = await call('GET', '/api/setup');
  if (!st.data || st.data.needed !== true) throw new Error('Yangi bazada /api/setup needed=true bo\'lishi kerak: ' + JSON.stringify(st.data));
  const s = await call('POST', '/api/setup', { full_name: 'Biznes Egasi', username: 'owner', password: 'owner123' });
  if (s.status !== 200) throw new Error('Setup: ' + JSON.stringify(s.data));
  const b = await call('POST', '/api/owner/branches', {
    name: 'A filial', slug: 'filial-a', address: 'Toshkent, Chilonzor', phone: '+998 90 000 00 01',
    admin: { full_name: 'Administrator', username: 'admin', password: 'admin123' },
  }, s.cookie);
  if (b.status !== 200 || b.data.id !== 1) throw new Error('Filial yaratish: ' + JSON.stringify(b.data));
  console.log('bootstrap: egasi va A filiali (id=1) tayyor');
})().catch((e) => { console.error(e.message); process.exit(1); });
