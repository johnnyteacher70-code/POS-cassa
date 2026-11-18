// Tezlik o'lchovi (npm test ga kirmaydi): katta sun'iy bazada asosiy so'rovlar vaqti.
// Ishga tushirish: node test/bench.js
// 5 000 mahsulot, 20 000 mijoz, 100 000 sotuv (300 000 qator), 50 000 to'lov; "Chakana xaridor" da 20 000 sotuv.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3610;
const B = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function generate() {
  const db = require(ROOT + '/node_modules/better-sqlite3')(path.join(DATA, 'branches/1/app.db'));
  db.pragma('journal_mode = WAL');
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const t = '2026-01-01 10:00:00';
  const day = (n) => { const d = new Date(Date.UTC(2025, 0, 1) + n * 864e5); return d.toISOString().slice(0, 10) + ' ' + String(ri(9, 19)).padStart(2, '0') + ':' + String(ri(0, 59)).padStart(2, '0') + ':00'; };
  const NAMES = ['Aziz', 'Bobur', 'Dilnoza', 'Gulnora', 'Jasur', 'Kamola', 'Lola', 'Malika', 'Nodir', 'Otabek', 'Rustam', 'Sardor', 'Timur', 'Umid', 'Zarina'];
  const CO = ['Savdo', 'Market', 'Trade', 'Kosmo', 'Beauty', 'Parfum', 'Lux', 'Style', 'Grand', 'Optom'];
  db.transaction(() => {
    const insP = db.prepare('INSERT INTO products (name,brand,category,volume,sku,piece_price,box_price,box_qty,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insM = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,created_at) VALUES (?,?,?,?,?)');
    for (let i = 0; i < 5000; i++) {
      const price = ri(10, 500) * 1000;
      const id = insP.run(`Mahsulot ${i}`, `Brend ${i % 200}`, `Kategoriya ${i % 30}`, `${ri(30, 200)} ml`, `SKU${i}`, price, price * 6, 6, 'Tavsif matni '.repeat(10), t, t).lastInsertRowid;
      insM.run(id, ri(100, 5000), t, 'Kirim', t);
    }
    const insC = db.prepare("INSERT INTO clients (type,company_name,contact_name,phone,address,created_at,updated_at) VALUES ('b2b',?,?,?,?,?,?)");
    for (let i = 0; i < 20000; i++) {
      insC.run(`"${CO[i % 10]} ${NAMES[i % 15]} ${i}" MChJ`, `${NAMES[(i * 7) % 15]} ${NAMES[(i * 3) % 15]}ov`, '+99890' + String(1000000 + i).slice(-7), `Toshkent, ${i % 12}-mavze`, t, t);
    }
    const walk = db.prepare("INSERT INTO clients (type,contact_name,created_at,updated_at) VALUES ('b2c','Chakana xaridor',?,?)").run(t, t).lastInsertRowid;
    db.prepare("INSERT INTO settings (key,value) VALUES ('walkin_client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(walk));
    const firstC = db.prepare('SELECT MIN(id) m FROM clients').get().m;
    const firstP = db.prepare("SELECT MIN(id) m FROM products WHERE name LIKE 'Mahsulot %'").get().m;
    const insS = db.prepare("INSERT INTO sales (number,kind,client_id,date,status,total,paid_amount,created_by,created_at,updated_at) VALUES (?,'sale',?,?,'confirmed',?,?,1,?,?)");
    const insI = db.prepare("INSERT INTO sale_items (sale_id,product_id,name,unit,qty,box_qty,price,piece_price,box_price,total) VALUES (?,?,?,'dona',?,6,?,?,?,?)");
    const insPay = db.prepare("INSERT INTO payments (client_id,direction,method,amount,date,sale_id,note,created_by,created_at,updated_at) VALUES (?,'in','cash',?,?,?,?,1,?,?)");
    for (let i = 0; i < 100000; i++) {
      const cid = i < 20000 ? walk : firstC + ri(0, 19999);
      const date = day(ri(0, 600));
      let total = 0;
      const items = [];
      for (let k = 0; k < 3; k++) { const pid = firstP + ri(0, 4999); const price = ri(10, 500) * 1000; const qty = ri(1, 5); items.push([pid, qty, price]); total += qty * price; }
      const paid = cid === walk ? total : 0;
      const sid = insS.run(`B${i}`, cid, date, total, paid, t, t).lastInsertRowid;
      for (const [pid, qty, price] of items) insI.run(sid, pid, `Mahsulot`, qty, price, price, price * 6, qty * price);
      if (cid === walk) insPay.run(walk, total, date, sid, "Sotuv vaqtida to'lov", t, t);
    }
    for (let i = 0; i < 30000; i++) insPay.run(firstC + ri(0, 19999), ri(1, 500) * 10000, day(ri(0, 600)), null, '', t, t);
  })();
  db.close();
}

async function login() {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  return 'sid=' + r.headers.get('set-cookie').match(/sid=([^;]+)/)[1];
}

async function time(cookie, method, p, body) {
  const runs = [];
  let size = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = await fetch(B + p, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(typeof body === 'function' ? body() : body) : undefined });
    const buf = await r.arrayBuffer();
    runs.push(performance.now() - t0);
    size = buf.byteLength;
    if (!r.ok) throw new Error(`${p} → ${r.status} ${Buffer.from(buf).toString().slice(0, 200)}`);
  }
  runs.sort((a, b) => a - b);
  return { ms: Math.round(runs[1]), kb: Math.round(size / 1024) };
}

(async () => {
  const srv = spawn('node', [ROOT + '/server/index.js'], { env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BACKUP_DISABLED: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch { /* kutish */ } await sleep(250); }
    execFileSync('node', [ROOT + '/test/bootstrap.js', B], { stdio: 'ignore' });
    console.log('Katta baza yaratilmoqda...');
    generate();
    // Server qayta ishga tushadi (qoldiq va mijoz keshlari yangi ma'lumotdan hisoblansin)
    srv.kill(); await sleep(800);
    const srv2 = spawn('node', [ROOT + '/server/index.js'], { env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BACKUP_DISABLED: '1' }, stdio: 'ignore' });
    process.on('exit', () => srv2.kill());
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch { /* kutish */ } await sleep(100); }
    console.log(`Server ishga tushdi: ${Math.round(performance.now() - t0)} ms\n`);
    const cookie = await login();
    const walk = (await (await fetch(B + '/api/clients/quick', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).json()).client.id;
    const prod0 = (await (await fetch(B + '/api/products?q=Mahsulot%2010', { headers: { Cookie: cookie } })).json())[0];
    const pid = prod0.id;
    const cases = [
      ['Mahsulotlar ro\'yxati', 'GET', '/api/products'],
      ['Bitta mahsulot', 'GET', `/api/products/${pid}`],
      ['Katalog (ochiq)', 'GET', '/api/shop/filial-a/catalog'],
      ['Mijozlar ro\'yxati', 'GET', '/api/clients'],
      ['Mijoz qidiruvi: matn', 'GET', '/api/clients?q=bobur'],
      ['Mijoz qidiruvi: xatoli', 'GET', '/api/clients?q=bbour'],
      ['Mijoz qidiruvi: telefon', 'GET', '/api/clients?q=901005'],
      ['Chakana xaridor sahifasi', 'GET', `/api/clients/${walk}`],
      ['Chakana xaridor (POS, qisqa)', 'GET', `/api/clients/${walk}?brief=1`],
      ['Sotuvlar ro\'yxati', 'GET', '/api/sales'],
      ['Qarzlar', 'GET', '/api/debts'],
      ['Bosh sahifa', 'GET', '/api/dashboard'],
      ['Xodimlar hisoboti', 'GET', '/api/staff/report'],
      ['Yangi buyurtmalar soni', 'GET', '/api/orders/count'],
      ['POS sotuv (Chakana xaridor)', 'POST', '/api/sales', { client_id: walk, items: [{ product_id: pid, unit: 'dona', qty: 1 }], pay_now: { amount: prod0.piece_price, method: 'cash' } }],   // kassadagi "To'liq" tugmasi
      ['Ombor tekshiruvi (POS)', 'POST', '/api/sales/check-stock', { items: [{ product_id: pid, unit: 'dona', qty: 1 }] }],
    ];
    const res = [];
    for (const [name, m, p, body] of cases) {
      try { res.push({ so_rov: name, ...(await time(cookie, m, p, body)) }); } catch (e) { res.push({ so_rov: name, ms: 'xato', kb: e.message.slice(0, 60) }); }
    }
    console.table(res);
  } finally {
    srv.kill();
    await sleep(500);
    if (process.env.KEEP) console.log('Baza saqlandi:', DATA);   // KEEP=1 — tahlil uchun baza o'chirilmaydi
    else fs.rmSync(DATA, { recursive: true, force: true });
    process.exit(0);
  }
})();
