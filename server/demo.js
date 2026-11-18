// To'liq demo ma'lumotlar tanlangan filialga: npm run demo -- <filial ID>
// 50 ta atir (rasmlari bilan), mijozlar, xodimlar, 2 oylik sotuv/to'lov tarixi, qarzlar, buyurtmalar, KP.
// Faqat mahsulotlar va mijozlar bo'sh bazaga qo'shiladi (haqiqiy ma'lumot bilan aralashmasligi uchun).
require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { now, nextNumber } = require('./util');
const { recomputeAll } = require('./ledger');
const { enterBranch } = require('./context');
const branches = require('./branches');
const branchDb = require('./branch_db');
const accounts = require('./accounts');

const BRANCH = branches.getBranch(Number(process.argv[2]));
if (!BRANCH) {
  console.log('Ishlatish: node server/demo.js <filial ID>\nFiliallar: ' + (branches.allBranches().map((b) => `${b.id} — ${b.name}`).join(', ') || "yo'q"));
  process.exit(1);
}
enterBranch(BRANCH.id);

if (db.prepare('SELECT 1 FROM products LIMIT 1').get() || db.prepare('SELECT 1 FROM clients LIMIT 1').get()) {
  console.log("Bazada mahsulot yoki mijoz bor — demo qo'shilmadi (haqiqiy ma'lumotlar bilan aralashmasligi uchun).");
  process.exit(0);
}

// Takrorlanadigan "tasodifiy" sonlar
let seed = 20261001;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const round = (n, step = 1000) => Math.round(n / step) * step;

const pad = (x) => String(x).padStart(2, '0');
function dayAgo(n, h = ri(9, 19), m = ri(0, 59)) {
  const d = new Date(Date.now() - n * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(m)}:00`;
}
const t = now();

// ---------- Sozlamalar ----------
const set = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING');
for (const [k, v] of Object.entries({
  company_name: 'Optom Savdo', company_address: "Toshkent sh., Chilonzor tumani, Bunyodkor ko'chasi 1",
  company_phone: '+998 90 000 00 00', company_inn: '305000000', company_account: '20208000000000000001',
  company_bank: '"Kapitalbank" ATB', company_mfo: '01088', director: 'A. Karimov',
  shop_title: 'Ulgurji katalog', shop_welcome: 'Xush kelibsiz! Kosmetika mahsulotlarini optom narxda buyurtma qiling.',
  kp_note: "Narxlar QQS bilan. Yetkazib berish Toshkent bo'ylab bepul.",
})) set.run(k, v);

// ---------- Xodimlar ----------
const staff = [db.prepare("SELECT id FROM users WHERE role='admin' AND is_owner=0 ORDER BY id LIMIT 1").get().id];
// Loginlar butun tizimda yagona: ikkinchi filialda filial ID qo'shiladi (ali2, vali2 ...)
const sfx = BRANCH.id === 1 ? '' : String(BRANCH.id);
for (const [u0, name, roleName] of [['ali', 'Ali Sotuvchi', 'Sotuvchi'], ['vali', 'Vali Kassir', 'Kassir'], ['dilnoza', 'Dilnoza Menejer', 'Menejer']]) {
  const u = u0 + sfx;
  const ex = db.prepare('SELECT id FROM users WHERE username=?').get(u);
  if (ex) { staff.push(ex.id); continue; }
  if (accounts.loginTaken(u)) continue;
  const id = Number(db.prepare("INSERT INTO users (username,password_hash,full_name,role,role_id,created_at) VALUES (?,?,?,'seller',(SELECT id FROM roles WHERE name IN (?,'Sotuvchi') ORDER BY (name=?) DESC, id LIMIT 1),?)")
    .run(u, bcrypt.hashSync('1234', 10), name, roleName, roleName, t).lastInsertRowid);
  accounts.addLogin(u, BRANCH.id, id);
  staff.push(id);
}

// ---------- 50 ta atir ----------
// [nom, brend, hajm, dona narxi (so'm), karobkada dona, rang]
const PRODUCTS = [
  ['Coco Mademoiselle', 'Chanel', '100 ml', 1950000, 6, '#c9a227'],
  ['Chance Eau Tendre', 'Chanel', '100 ml', 1850000, 6, '#e8a0b4'],
  ['Bleu de Chanel', 'Chanel', '100 ml', 1900000, 6, '#1f3a5f'],
  ['N°5 Eau de Parfum', 'Chanel', '100 ml', 2100000, 6, '#d4af37'],
  ['Sauvage EDT', 'Dior', '100 ml', 1650000, 6, '#2c4a6e'],
  ['Sauvage Elixir', 'Dior', '60 ml', 2200000, 6, '#3b2a5c'],
  ["J'adore", 'Dior', '100 ml', 1800000, 6, '#e6c35c'],
  ['Miss Dior Blooming Bouquet', 'Dior', '100 ml', 1550000, 6, '#f2a7c3'],
  ['Black Orchid', 'Tom Ford', '100 ml', 2300000, 4, '#2b1b2f'],
  ['Tobacco Vanille', 'Tom Ford', '50 ml', 3400000, 4, '#7a4a2a'],
  ['Lost Cherry', 'Tom Ford', '50 ml', 3600000, 4, '#9b1b30'],
  ['Ombré Leather', 'Tom Ford', '100 ml', 2500000, 4, '#5a3e2b'],
  ['Eros', 'Versace', '100 ml', 950000, 6, '#2a8c8c'],
  ['Bright Crystal', 'Versace', '90 ml', 900000, 6, '#f4b6c2'],
  ['Dylan Blue', 'Versace', '100 ml', 980000, 6, '#2d4f9e'],
  ['Si', 'Giorgio Armani', '100 ml', 1450000, 6, '#3d2b2b'],
  ['Acqua di Giò Profondo', 'Giorgio Armani', '125 ml', 1500000, 6, '#2276a8'],
  ['Stronger With You', 'Giorgio Armani', '100 ml', 1250000, 6, '#6b4b3a'],
  ['Libre', 'Yves Saint Laurent', '90 ml', 1700000, 6, '#c8a24a'],
  ['Black Opium', 'Yves Saint Laurent', '90 ml', 1600000, 6, '#2b2b2b'],
  ['Y Eau de Parfum', 'Yves Saint Laurent', '100 ml', 1550000, 6, '#4a6fa5'],
  ['Good Girl', 'Carolina Herrera', '80 ml', 1500000, 6, '#1c2a4a'],
  ['Bad Boy', 'Carolina Herrera', '100 ml', 1350000, 6, '#3a3a3a'],
  ['La Vie Est Belle', 'Lancôme', '100 ml', 1500000, 6, '#d7a1b8'],
  ['Idôle', 'Lancôme', '50 ml', 1300000, 6, '#e8c3a8'],
  ['Aventus', 'Creed', '100 ml', 3900000, 4, '#2f3b2f'],
  ['Silver Mountain Water', 'Creed', '100 ml', 3500000, 4, '#9fb8c8'],
  ['Baccarat Rouge 540', 'Maison Francis Kurkdjian', '70 ml', 3800000, 4, '#b1342f'],
  ["Angels' Share", 'Kilian', '50 ml', 2900000, 4, '#a0622d'],
  ['Good Girl Gone Bad', 'Kilian', '50 ml', 2950000, 4, '#d9a3a3'],
  ['Asad', 'Lattafa', '100 ml', 320000, 12, '#1b1b1b'],
  ['Khamrah', 'Lattafa', '100 ml', 380000, 12, '#8b3a1e'],
  ['Yara', 'Lattafa', '100 ml', 300000, 12, '#f3b2c8'],
  ['Badee Al Oud for Glory', 'Lattafa', '100 ml', 350000, 12, '#4b2e1e'],
  ['Fakhar Black', 'Lattafa', '100 ml', 310000, 12, '#222831'],
  ['Club de Nuit Intense Man', 'Armaf', '105 ml', 450000, 12, '#111111'],
  ['Club de Nuit Untold', 'Armaf', '105 ml', 480000, 12, '#9c2f3a'],
  ['Club de Nuit Woman', 'Armaf', '105 ml', 420000, 12, '#c2185b'],
  ['Hawas for Him', 'Rasasi', '100 ml', 520000, 12, '#2a7fb8'],
  ['Hawas Ice', 'Rasasi', '100 ml', 540000, 12, '#8ec5e6'],
  ['Amber Oud Gold Edition', 'Al Haramain', '120 ml', 690000, 12, '#c9a227'],
  ["L'Aventure", 'Al Haramain', '100 ml', 430000, 12, '#3e5c76'],
  ['9 PM', 'Afnan', '100 ml', 400000, 12, '#2b2d42'],
  ['Supremacy Noir', 'Afnan', '100 ml', 470000, 12, '#1d1d1d'],
  ['Turathi Blue', 'Afnan', '90 ml', 430000, 12, '#1e5aa8'],
  ['Erba Pura', 'Xerjoff', '100 ml', 3300000, 4, '#e8a33d'],
  ['Naxos', 'Xerjoff', '100 ml', 3200000, 4, '#d4a017'],
  ['Layton', 'Parfums de Marly', '125 ml', 3100000, 4, '#6d4c9a'],
  ['Delina', 'Parfums de Marly', '75 ml', 3250000, 4, '#e5a9c1'],
  ['Wood Sage & Sea Salt', 'Jo Malone', '100 ml', 1900000, 6, '#a7b59a'],
];

const UPLOADS = branchDb.uploadsDir(BRANCH.id);
const URL = `/uploads/${BRANCH.id}/`;
fs.mkdirSync(UPLOADS, { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function svgImage(name, brand, volume, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity=".45"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient></defs>
<rect width="400" height="400" fill="#f7f5fb"/><rect width="400" height="400" fill="url(#bg)"/>
<rect x="172" y="58" width="56" height="34" rx="6" fill="#2b2b2b"/><rect x="186" y="88" width="28" height="22" fill="#9a8f7a"/>
<rect x="112" y="106" width="176" height="226" rx="26" fill="${color}"/><rect x="112" y="106" width="176" height="226" rx="26" fill="url(#gl)"/>
<rect x="134" y="176" width="132" height="88" rx="8" fill="#fff" fill-opacity=".9"/>
<text x="200" y="208" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#222" font-weight="bold">${esc(brand.toUpperCase().slice(0, 18))}</text>
<text x="200" y="232" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" fill="#444">${esc(name.slice(0, 20))}</text>
<text x="200" y="252" font-family="Arial,sans-serif" font-size="11" text-anchor="middle" fill="#777">${esc(volume)}</text>
</svg>`;
}

// Soha: buyruq qatoridagi 2-argument yoki biznes sozlamasi (standart — kosmetika)
const INDUSTRY = process.argv[3] || require('./business').get('industry') || 'cosmetics';
const IND_DATA = INDUSTRY !== 'cosmetics' && require('./demo_industries')[INDUSTRY];
const PROFILE = require('./demo_profiles')[INDUSTRY] || null;
// Filial sohasi: mahsulot formasidagi maydonlar, katalog matni; chakana do'konda chek avtomatik
{
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const fields = require('./business').INDUSTRY_FIELDS[INDUSTRY];
  if (fields) { up.run('industry', INDUSTRY); up.run('product_fields', fields.join(',')); }
  if (PROFILE) {
    up.run('shop_welcome', PROFILE.welcome);
    up.run('shop_title', PROFILE.mode === 'retail' ? 'Onlayn katalog' : 'Ulgurji katalog');
    if (PROFILE.mode === 'retail') up.run('receipt_auto', '1');
  }
}
// Boshqa sohada — umumiy ko'rinishdagi rasm (qadoq va nomi)
function boxImage(name, brand, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f8fafc"/>
<rect x="70" y="90" width="260" height="230" rx="18" fill="${color}" stroke="#cbd5e1" stroke-width="3"/>
<rect x="70" y="90" width="260" height="60" rx="18" fill="#000" fill-opacity=".08"/>
<rect x="100" y="185" width="200" height="90" rx="10" fill="#fff" fill-opacity=".92"/>
<text x="200" y="220" font-family="Arial,sans-serif" font-size="16" text-anchor="middle" fill="#111" font-weight="bold">${esc((brand || '').toUpperCase().slice(0, 18))}</text>
<text x="200" y="248" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" fill="#333">${esc(name.slice(0, 24))}</text></svg>`;
}
const insP = db.prepare(`INSERT INTO products (name,brand,category,volume,sku,piece_price,box_price,box_qty,description,image,in_shop,created_at,updated_at)
  VALUES (?,?,'Atir',?,?,?,?,?,?,?,1,?,?)`);
const insPG = db.prepare(`INSERT INTO products (name,brand,category,volume,sku,piece_price,box_price,box_qty,description,image,in_shop,unit,pack_name,size,audience,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`);
const insM = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,created_by,created_at) VALUES (?,?,?,?,?,?)');
const products = [];
db.transaction(() => {
  if (IND_DATA) {
    IND_DATA.forEach(([name, brand, category, volume, price, box, color, unit, pack, size = '', audience = ''], i) => {
      const file = `demo-${INDUSTRY}-${String(i + 1).padStart(2, '0')}.svg`;
      fs.writeFileSync(path.join(UPLOADS, file), boxImage(name, brand, color));
      const sku = String(1000 + i + 1);
      const id = insPG.run(name, brand, category, volume, sku, price, price * box, box, '', URL + file, unit, pack, size, require('./colors').parseAudience(audience), t, t).lastInsertRowid;
      // Chakana do'konda dona bilan, ulgurjida — qadoq bilan ko'proq zaxira
      const mode = PROFILE ? PROFILE.mode : '';
      let stock = mode === 'retail' ? ri(15, 60) : mode === 'wholesale' ? box * ri(20, 60) : box >= 5 ? box * ri(6, 20) : ri(40, 150);
      if (INDUSTRY === 'clothing' && !['juft'].includes(unit) && category !== 'Aksessuarlar') {
        const pal = ['Qora', 'Oq', "Ko'k", 'Kulrang', 'Bej', 'Qizil', 'Yashil', 'Pushti'];
        require('./colors').setColors(id, [...new Set([pick(pal), pick(pal), pick(pal)])]);
      }
      insM.run(id, stock, dayAgo(62, 10), "Boshlang'ich kirim", staff[0], t);
      products.push({ id, name, volume, price, boxPrice: price * box, box, arab: box >= 12, stock });
    });
    return;
  }
  PRODUCTS.forEach(([name, brand, volume, price, box, color], i) => {
    const file = `demo-${String(i + 1).padStart(2, '0')}.svg`;
    fs.writeFileSync(path.join(UPLOADS, file), svgImage(name, brand, volume, color));
    const boxPrice = round(price * box * 0.95);
    const sku = brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + '-' + String(i + 1).padStart(3, '0');
    const arab = box === 12;
    const who = /Man|Him|Sauvage|Bleu|Eros|Aventus|Bad Boy|Y Eau|Stronger|Dylan|Asad|Fakhar|Supremacy|9 PM|Turathi|Layton|Hawas/.test(name) ? 'Erkaklar uchun' : 'Ayollar uchun';
    const desc = `${who} atir (${volume}).\n` + (arab ? "Sharq atiri: ud, amber va ziravor notalari. Hid uzoq saqlanadi." : "Eau de Parfum. Hid 6–8 soat saqlanadi.")
      + `\nKarobkada ${box} dona.`;
    const id = insP.run(name, brand, volume, sku, price, boxPrice, box, desc, URL + file, t, t).lastInsertRowid;
    // Boshlang'ich kirim (2 oy oldin) + keyinroq yana bitta kirim
    let stock = box * ri(arab ? 10 : 4, arab ? 30 : 12);
    insM.run(id, stock, dayAgo(62, 10), "Boshlang'ich kirim", staff[0], t);
    if (rnd() < 0.5) { const add = box * ri(2, 6); stock += add; insM.run(id, add, dayAgo(ri(10, 30), 11), "Yetkazib beruvchidan kirim", staff[0], t); }
    products.push({ id, name, volume, price, boxPrice, box, arab, stock });
  });
})();

// ---------- Mijozlar ----------
const B2B = PROFILE ? PROFILE.b2b : [
  ['"Parfum Market" MChJ', 'Alisher Valiyev', 'Toshkent, Yunusobod'], ['"Gulnoza Kosmetika" XK', 'Gulnoza Rahimova', 'Samarqand'],
  ['"Aroma House" MChJ', 'Bekzod Tursunov', "Farg'ona"], ['"Atirgul Savdo" MChJ', 'Shahzod Karimov', 'Andijon'],
  ['"Lux Beauty" MChJ', 'Malika Ergasheva', 'Toshkent, Chilonzor'], ['"Oasis Parfum" XK', 'Jasur Abdullayev', 'Buxoro'],
  ['"Navro\'z Market" MChJ', 'Dilshod Nazarov', 'Namangan'], ['"Shirin Hid" XK', 'Nodira Saidova', 'Qarshi'],
  ['"Elite Scent" MChJ', 'Sardor Aliyev', 'Toshkent, Mirzo Ulug\'bek'], ['"Kosmo Plus" MChJ', 'Feruza Xolmatova', 'Nukus'],
  ['"Gold Aroma" XK', 'Otabek Yusupov', 'Termiz'], ['"Parfum City" MChJ', 'Kamola Mirzayeva', 'Toshkent, Sergeli'],
  ['"Silk Road Beauty" MChJ', 'Rustam Hamidov', 'Xiva'], ['"Ideal Kosmetika" XK', 'Zarina Qodirova', 'Jizzax'],
  ['"Afsona Savdo" MChJ', 'Ulug\'bek Rasulov', 'Guliston'], ['"Bahor Parfum" XK', 'Sevara Tojiyeva', 'Navoiy'],
  ['"Mega Hid" MChJ', 'Akmal Sobirov', "Qo'qon"], ['"Charm Store" MChJ', 'Laylo Usmonova', 'Toshkent, Yakkasaroy'],
];
const B2C = PROFILE ? PROFILE.b2c : ['Dilnoza Karimova', 'Aziza Yo\'ldosheva', 'Bobur Ismoilov', 'Madina Ahmedova', 'Javohir Ortiqov', 'Nilufar Rashidova', 'Sherzod Qosimov'];
const insC = db.prepare(`INSERT INTO clients (type,company_name,inn,contact_name,phone,address,bank,account_no,created_by,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const clients = [];
const phone = () => `+99890${ri(1000000, 9999999)}`;
B2B.forEach(([co, person, addr], i) => {
  const id = insC.run('b2b', co, String(301000000 + i * 1117 + ri(1, 999)), person, phone(), addr, pick(['"Kapitalbank" ATB', '"Hamkorbank" ATB', '"Ipoteka-bank" ATB', '"Asakabank" ATB']),
    '2020800' + String(ri(1e12, 9e12)), pick(staff), dayAgo(63, 9), t).lastInsertRowid;
  clients.push({ id, b2b: true, payer: PROFILE && PROFILE.mode === 'retail' ? pick(['good', 'good', 'slow']) : pick(['good', 'good', 'slow', 'advance', 'debtor']) });
});
B2C.forEach((name) => {
  const id = insC.run('b2c', '', '', name, phone(), 'Toshkent', '', '', pick(staff), dayAgo(60, 9), t).lastInsertRowid;
  clients.push({ id, b2b: false, payer: 'cash' });
});
// Chakana savdo bor joyda — «Chakana xaridor» (kassada mijozsiz sotuvlar shunga yoziladi)
let walkin = null;
if (PROFILE && PROFILE.mode !== 'wholesale') {
  const id = Number(insC.run('b2c', '', '', 'Chakana xaridor', '', '', '', '', staff[0], dayAgo(63, 9), t).lastInsertRowid);
  db.prepare("INSERT INTO settings (key,value) VALUES ('walkin_client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(id));
  walkin = { id, b2b: false, payer: 'cash' };
}

// ---------- Sotuv va to'lovlar (so'nggi 60 kun) ----------
const insS = db.prepare(`INSERT INTO sales (number,kind,client_id,date,due_date,status,total,discount,note,created_by,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insI = db.prepare(`INSERT INTO sale_items (sale_id,product_id,name,unit,qty,box_qty,price,piece_price,box_price,total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const insPay = db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,sale_id,note,created_by,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
const method = (b2b) => (b2b ? pick(['transfer', 'transfer', 'cash', 'card']) : pick(['cash', 'card', 'card']));

let sales = 0, pays = 0;
db.transaction(() => {
  // Avans beradigan mijozlar oldindan pul o'tkazadi
  for (const c of clients.filter((x) => x.payer === 'advance')) {
    insPay.run(c.id, 'in', 'transfer', round(ri(...(PROFILE ? [5, 25] : [40, 120])) * 1e6, 1e6), dayAgo(ri(50, 58)), null, "Oldindan to'lov (avans)", pick(staff), t, t); pays++;
  }
  const MODE = PROFILE ? PROFILE.mode : 'mixed';
  const b2bs = clients.filter((x) => x.b2b), b2cs = clients.filter((x) => !x.b2b);
  for (let n = 0; n < (PROFILE ? PROFILE.sales : 85); n++) {
    // Ulgurji: 90% kompaniyalar; chakana: 90% oddiy xaridorlar
    const share = MODE === 'wholesale' ? 0.9 : MODE === 'retail' ? 0.1 : 0.55;
    const c = walkin && rnd() < (MODE === 'retail' ? 0.6 : 0.3) ? walkin : rnd() < share && b2bs.length ? pick(b2bs) : pick(b2cs.length ? b2cs : clients);
    const ago = ri(0, 58);
    const date = dayAgo(ago);
    const lines = [];
    const used = new Set();
    for (let k = 0, cnt = c.b2b ? ri(1, 5) : ri(1, 2); k < cnt; k++) {
      const p = pick(products);
      if (used.has(p.id)) continue;
      used.add(p.id);
      let unit = c.b2b && MODE !== 'retail' && p.box > 1 && rnd() < 0.8 ? 'karobka' : 'dona';
      let qty = unit === 'karobka' ? ri(1, p.arab ? 6 : 3) : ri(1, c.b2b ? 10 : 2);
      if (unit === 'karobka' && qty * p.box > p.stock) { unit = 'dona'; qty = Math.min(qty, p.stock); }
      if (qty * (unit === 'karobka' ? p.box : 1) > p.stock || qty < 1) continue;   // omborda yetarli emas
      p.stock -= qty * (unit === 'karobka' ? p.box : 1);
      const price = unit === 'karobka' ? p.boxPrice : p.price;
      lines.push({ p, unit, qty, price, total: price * qty });
    }
    if (!lines.length) continue;
    const sum = lines.reduce((a, l) => a + l.total, 0);
    const discount = c.b2b && sum > 30e6 && rnd() < 0.3 ? round(sum * 0.02, 10000) : 0;
    const total = sum - discount;
    const seller = pick(staff);
    const due = c.b2b && c.payer !== 'cash' ? dayAgo(ago - ri(7, 21), 23, 59) : null;
    const id = insS.run(nextNumber('sales', 'N'), 'sale', c.id, date, due, 'confirmed', total, discount, '', seller, t, t).lastInsertRowid;
    for (const l of lines) insI.run(id, l.p.id, `${l.p.name} ${l.p.volume}`, l.unit, l.qty, l.p.box, l.price, l.p.price, l.p.boxPrice, l.total);
    sales++;

    // To'lov xulqi
    const later = (d) => dayAgo(Math.max(0, ago - d));
    if (c.payer === 'cash' || (c.payer === 'good' && rnd() < 0.6)) {
      insPay.run(c.id, 'in', method(c.b2b), total, date, id, "Sotuv vaqtida to'lov", seller, t, t); pays++;
    } else if (c.payer === 'good') {
      if (ago > 5) { insPay.run(c.id, 'in', method(true), total, later(ri(3, Math.min(20, ago))), id, '', pick(staff), t, t); pays++; }
    } else if (c.payer === 'slow') {
      if (ago > 10) { insPay.run(c.id, 'in', method(true), round(total * ri(30, 70) / 100, 100000), later(ri(5, 10)), id, "Qisman to'lov", pick(staff), t, t); pays++; }
    } else if (c.payer === 'debtor') {
      if (ago > 25 && rnd() < 0.4) { insPay.run(c.id, 'in', 'cash', round(total * 0.25, 100000), later(ri(10, 20)), null, '', pick(staff), t, t); pays++; }
    }
  }
  // Bir nechta qaytarish (chiqim)
  for (let k = 0; k < 2; k++) {
    const c = pick(clients.filter((x) => x.payer === 'advance'));
    if (c) { insPay.run(c.id, 'out', 'cash', round(ri(1, 4) * 1e6, 1e6), dayAgo(ri(5, 20)), null, 'Ortiqcha pul qaytarildi', staff[0], t, t); pays++; }
  }
  // Eski daftardan o'tkazilgan qarz
  const old = clients.find((x) => x.payer === 'debtor');
  if (old) {
    insS.run(nextNumber('sales', 'Q'), 'opening', old.id, dayAgo(61, 9), null, 'confirmed', PROFILE && PROFILE.mode !== 'wholesale' ? 4500000 : 18500000, 0, "Eski daftar bo'yicha qarz", staff[0], t, t);
  }
})();

// ---------- Sayt buyurtmalar (yangi) ----------
const insO = db.prepare(`INSERT INTO orders (client_id,status,total,note,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
const insOI = db.prepare('INSERT INTO order_items (order_id,product_id,name,unit,qty,box_qty,price,total) VALUES (?,?,?,?,?,?,?,?)');
for (const [k, note] of [[0, 'Ertaga olib ketamiz'], [1, ''], [2, 'Samarqandga yuborish kerak'], [3, ''], [4, 'Narxni kelishamiz']]) {
  const c = clients[k * 3];
  const lines = Array.from({ length: ri(1, 3) }, () => pick(products)).filter((p, i, a) => a.indexOf(p) === i)
    .map((p) => ({ p, unit: 'karobka', qty: ri(1, 3) }));
  const total = lines.reduce((a, l) => a + l.p.boxPrice * l.qty, 0);
  const id = insO.run(c.id, 'new', total, note, 'web', dayAgo(k === 0 ? 0 : ri(0, 2)), t).lastInsertRowid;
  for (const l of lines) insOI.run(id, l.p.id, `${l.p.name} ${l.p.volume}`, 'karobka', l.qty, l.p.box, l.p.boxPrice, l.p.boxPrice * l.qty);
}

// ---------- KP ----------
const insQ = db.prepare(`INSERT INTO quotes (number,client_id,client_name,date,valid_until,total,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const insQI = db.prepare(`INSERT INTO quote_items (quote_id,product_id,name,unit,qty,box_qty,price,piece_price,box_price,total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
for (let k = 0; k < 3; k++) {
  const c = clients[k + 4];
  const row = db.prepare('SELECT company_name FROM clients WHERE id=?').get(c.id);
  const lines = [pick(products), pick(products), pick(products)].filter((p, i, a) => a.indexOf(p) === i);
  const total = lines.reduce((a, p) => a + p.boxPrice * 2, 0);
  const id = insQ.run(nextNumber('quotes', 'KP'), c.id, row.company_name, dayAgo(ri(1, 10)), dayAgo(-14, 23, 59), total, '', staff[0], t, t).lastInsertRowid;
  for (const p of lines) insQI.run(id, p.id, `${p.name} ${p.volume}`, 'karobka', 2, p.box, p.boxPrice, p.price, p.boxPrice, p.boxPrice * 2);
}

recomputeAll();
const sum = db.prepare(`SELECT COALESCE(SUM(CASE WHEN balance<0 THEN -balance END),0) debt, COALESCE(SUM(CASE WHEN balance>0 THEN balance END),0) adv FROM clients`).get();
// Kosmetika (yuz, soch, tana parvarishi, makiyaj ...) + namuna sharhlar
const kos = IND_DATA ? { added: 0, reviews: 0 } : require('./demo_cosmetics').addCosmetics(db, { uploads: UPLOADS, url: URL, staffId: staff[0], now, dayAgo, rnd });
if (!IND_DATA) console.log(`Kosmetika: +${kos.added} ta mahsulot, ${kos.reviews} ta sharh`);

// ---------- Savdo tizimi: tannarx, shtrix-kod, narx turlari, yetkazib beruvchilar, xaridlar, xarajatlar ----------
const ean = (n) => { const d = ('2' + String(n).padStart(11, '0')).split('').map(Number); const s = d.reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return d.join('') + ((10 - (s % 10)) % 10); };
let purchasesN = 0, expensesN = 0;
db.transaction(() => {
  const all = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL').all();
  const upP = db.prepare('UPDATE products SET cost_price=?, barcode=?, min_stock=? WHERE id=?');
  for (const p of all) {
    const cost = Math.round(p.piece_price * (0.62 + rnd() * 0.14) / 100) * 100;   // ustama ~25-40%
    upP.run(cost, ean(1000000 + BRANCH.id * 10000 + p.id), rnd() < 0.3 ? p.box_qty * 2 : 0, p.id);
  }
  db.prepare('UPDATE stock_moves SET cost=(SELECT cost_price FROM products WHERE id=stock_moves.product_id) WHERE qty_pieces>0 AND cost IS NULL').run();
  db.prepare('UPDATE sale_items SET cost=COALESCE((SELECT cost_price FROM products WHERE id=sale_items.product_id),0) WHERE cost=0').run();

  // Narx turlari: ulgurji (−8%) va VIP (−12%); kompaniyalar — ulgurji narxda
  const lvl = (name, k) => {
    const id = Number(db.prepare('INSERT INTO price_levels (name,created_at) VALUES (?,?)').run(name, t).lastInsertRowid);
    const ins = db.prepare('INSERT INTO product_prices (product_id,level_id,piece_price,box_price) VALUES (?,?,?,?)');
    for (const p of all) { const pr = Math.round(p.piece_price * k / 1000) * 1000; ins.run(p.id, id, pr, pr * p.box_qty); }
    return id;
  };
  const wholesale = lvl('Ulgurji', 0.92);
  lvl('VIP', 0.88);
  db.prepare("UPDATE clients SET price_level_id=? WHERE type='b2b'").run(wholesale);

  // Yetkazib beruvchilar va xaridlar (so'nggi 40 kun)
  const sup = db.prepare('INSERT INTO suppliers (name,contact_name,phone,inn,address,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  const pur = db.prepare('INSERT INTO purchases (number,supplier_id,date,total,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
  const pit = db.prepare('INSERT INTO purchase_items (purchase_id,product_id,name,unit,qty,box_qty,price,total) VALUES (?,?,?,?,?,?,?,?)');
  const mv = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,purchase_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
  const spay = db.prepare('INSERT INTO supplier_payments (supplier_id,purchase_id,amount,method,date,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
  for (const [name, contact, inn] of (PROFILE ? PROFILE.suppliers : [['Parfum Distribution MChJ', 'Rustam Aliyev', '305112233'], ['Beauty Import LLC', 'Olga Kim', '306445566'], ['Toshkent Kosmetik Baza', 'Akmal Yusupov', '307778899']])) {
    const sid = Number(sup.run(name, contact, phone(), inn, 'Toshkent', t, t).lastInsertRowid);
    for (let k = 0; k < 2; k++) {
      const date = dayAgo(ri(1, 40));
      const number = nextNumber('purchases', 'K');
      const lines = [...new Set([pick(all), pick(all), pick(all), pick(all)])];
      const pid = Number(pur.run(number, sid, date, 0, 'Hisob-faktura №' + ri(100, 999), staff[0], t, t).lastInsertRowid);
      let total = 0;
      for (const p of lines) {
        const boxes = ri(2, 6), price = Math.round(p.cost_price || p.piece_price * 0.7) * p.box_qty;
        pit.run(pid, p.id, p.name, 'karobka', boxes, p.box_qty, price, boxes * price);
        mv.run(p.id, boxes * p.box_qty, date, `Xarid ${number}: ${name}`, price / p.box_qty, pid, staff[0], t);
        total += boxes * price;
      }
      db.prepare('UPDATE purchases SET total=? WHERE id=?').run(total, pid);
      spay.run(sid, pid, k ? Math.round(total * 0.6 / 1000) * 1000 : total, pick(['transfer', 'cash']), date, `Xarid ${number} uchun`, staff[0], t);
      purchasesN++;
    }
  }

  // Xarajatlar: oylik ijara, ish haqi, kommunal va mayda xarajatlar
  const cat = (n) => db.prepare('SELECT id FROM expense_categories WHERE name=?').get(n).id;
  const ex = db.prepare('INSERT INTO expenses (category_id,amount,method,date,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)');
  for (const back of [55, 25]) {
    ex.run(cat('Ijara'), 8000000, 'transfer', dayAgo(back), 'Do\'kon ijarasi', staff[0], t);
    ex.run(cat('Ish haqi'), 18000000, 'cash', dayAgo(back - 2), 'Xodimlar oyligi', staff[0], t);
    ex.run(cat('Kommunal xizmatlar'), ri(9, 15) * 100000, 'transfer', dayAgo(back - 4), 'Elektr, suv, internet', staff[0], t);
    expensesN += 3;
  }
  for (let k = 0; k < 8; k++) { ex.run(cat(pick(['Transport va yetkazish', "Xo'jalik xarajatlari", 'Reklama'])), ri(2, 15) * 50000, 'cash', dayAgo(ri(0, 50)), '', staff[0], t); expensesN++; }
})();
console.log(`Savdo: tannarx va shtrix-kodlar, 2 ta narx turi, 3 ta yetkazib beruvchi, ${purchasesN} ta xarid, ${expensesN} ta xarajat`);
console.log(`Demo qo'shildi (${INDUSTRY}): ${products.length} ta mahsulot (rasmlari bilan), ${clients.length} ta mijoz, ${sales} ta sotuv, ${pays} ta to'lov, 5 ta sayt buyurtma, 3 ta KP.`);
console.log(`Bizga qarz: ${sum.debt.toLocaleString('ru')} so'm, avanslar: ${sum.adv.toLocaleString('ru')} so'm`);
console.log(`Xodimlar: ali${sfx} / vali${sfx} / dilnoza${sfx} — parol 1234`);
