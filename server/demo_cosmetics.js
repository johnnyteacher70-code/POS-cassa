// Demo: kosmetika mahsulotlari (atirdan tashqari) + atirlarga kategoriya/tavsif + namuna sharhlar.
// demo.js ichidan chaqiriladi; mavjud demo bazaga alohida ham qo'shish mumkin:  node server/demo_cosmetics.js
// Qayta ishga tushirilsa takrorlamaydi (artikul bo'yicha tekshiradi).
const fs = require('fs');
const path = require('path');

const COSMETICS = [
  // [nom, brend, kategoriya, hajm, dona narxi, karobkada, rang, shakl, tavsif]
  ['Namlovchi krem', 'CeraVe', 'Yuz parvarishi', '52 ml', 210000, 12, '#4a90c2', 'jar',
    "Quruq va normal teri uchun kunlik krem. 3 xil seramid va gialuron kislotasi teri to'sig'ini tiklaydi, 24 soat namlikni ushlab turadi.\nHidsiz, komedogen emas.\nIshlatish: ertalab va kechqurun tozalangan teriga surting."],
  ["Ko'piklanuvchi yuvish geli", 'CeraVe', 'Yuz parvarishi', '236 ml', 190000, 12, '#3f7fb0', 'bottle',
    "Normal va yog'li teri uchun. Teri to'sig'ini buzmasdan ortiqcha yog' va bo'yanish qoldiqlarini tozalaydi.\nIshlatish: nam teriga surtib, ko'pirtiring va suv bilan yuving."],
  ['Effaclar Duo+', 'La Roche-Posay', 'Yuz parvarishi', '40 ml', 260000, 12, '#2d6cb5', 'tube',
    "Akne, qora nuqta va dog'larga qarshi krem. Niatsinamid va salitsil kislotasi bilan.\nYog'li va muammoli teri uchun."],
  ['Anthelios SPF 50+', 'La Roche-Posay', 'Yuz parvarishi', '50 ml', 280000, 12, '#f2a33a', 'tube',
    "Yuz uchun quyoshdan yuqori himoya. Suvga chidamli, yengil tekstura, oq iz qoldirmaydi.\nKo'chaga chiqishdan 15 daqiqa oldin surting."],
  ['Hyaluronic Acid 2% + B5', 'The Ordinary', 'Yuz parvarishi', '30 ml', 150000, 24, '#cfc8ba', 'dropper',
    "Namlovchi zardob (serum). Gialuron kislotasi va B5 vitamini terini chuqur namlaydi va silliqlaydi.\nKremdan oldin 2-3 tomchi."],
  ['Niacinamide 10% + Zinc 1%', 'The Ordinary', 'Yuz parvarishi', '30 ml', 140000, 24, '#bdb6a7', 'dropper',
    "Kengaygan teshikchalar va yog'lanishga qarshi zardob. Teri rangini tekislaydi."],
  ['Micellar suv', 'Garnier', 'Yuz parvarishi', '400 ml', 75000, 12, '#e86fa0', 'bottle',
    "Bo'yanishni yuvish va yuzni tozalash uchun. Sezgir teriga ham mos, yuvib tashlash shart emas."],
  ['Soft krem', 'Nivea', 'Tana parvarishi', '200 ml', 65000, 24, '#1d4f9c', 'jar',
    "Yuz, qo'l va tana uchun yengil namlovchi krem. Jojoba moyi va E vitamini bilan. Tez singadi."],
  ['Warm Vanilla Sugar losyon', 'Bath & Body Works', 'Tana parvarishi', '236 ml', 160000, 12, '#e9c79a', 'bottle',
    "Tana uchun xushbo'y losyon: vanil va shakar notalari. Shi yog'i terini yumshatadi, hid kun bo'yi saqlanadi."],
  ['Dush geli Aloe Vera', 'Dove', 'Tana parvarishi', '250 ml', 45000, 24, '#7fb8a4', 'bottle',
    "Aloe vera va namlovchi komponentlar bilan yumshoq dush geli. Terini quritmaydi."],
  ['Elseve Gialuron shampuni', "L'Oréal Paris", 'Soch parvarishi', '400 ml', 70000, 12, '#6aa5d8', 'bottle',
    "Suvsizlangan soch uchun. Gialuron kislotasi sochni namlaydi, 72 soatgacha yengillik va hajm."],
  ['Extraordinary Oil soch moyi', "L'Oréal Paris", 'Soch parvarishi', '100 ml', 120000, 12, '#c69a3c', 'dropper',
    "6 xil gul moyidan iborat. Quruq uchlarni oziqlantiradi, sochga yaltiroqlik beradi. Yog'li iz qoldirmaydi."],
  ['Nutritive soch niqobi', 'Kérastase', 'Soch parvarishi', '200 ml', 520000, 6, '#8b6fb3', 'jar',
    "Juda quruq soch uchun professional niqob. Haftada 1-2 marta, 5 daqiqa ushlab yuving."],
  ['Fit Me tonal krem', 'Maybelline', 'Makiyaj', '30 ml', 130000, 12, '#d9a77f', 'bottle',
    "Tabiiy matlik beradigan tonal krem. Teshikchalarni yashiradi, kun bo'yi turadi. Ranglari: 110-130."],
  ['Lash Sensational tushi', 'Maybelline', 'Makiyaj', '9.5 ml', 110000, 24, '#1b1b1b', 'stick',
    "Kipriklarga hajm va uzunlik beruvchi tush. Yopishmaydi, oson yuviladi."],
  ['Ruby Woo pomada', 'MAC', 'Makiyaj', '3 g', 290000, 12, '#b5122a', 'lipstick',
    "Klassik qizil mat pomada. Uzoq turadi, yuqori pigmentli."],
  ['Infallible pudra', "L'Oréal Paris", 'Makiyaj', '9 g', 150000, 12, '#e3b996', 'compact',
    "Kompakt pudra: 24 soatgacha matlik, yaltirashni yo'qotadi. Ko'zgu va gubka bilan."],
  ['Ballet Slippers lak', 'Essie', 'Tirnoq', '13.5 ml', 95000, 24, '#f2cfd6', 'nail',
    "Och pushti tirnoq laki — klassik rang. Tez quriydi, tekis yotadi."],
  ['Invisible antiperspirant', 'Nivea', 'Gigiyena', '150 ml', 48000, 24, '#22304a', 'spray',
    "Kiyimda oq va sariq iz qoldirmaydi. 48 soat himoya."],
  ["Sovg'a to'plami Rose", 'Premium', "Sovg'a to'plamlari", '3 dona', 450000, 6, '#c98a9b', 'box',
    "Sovg'a qutisi: atir 30 ml + tana losyoni + qo'l kremi. Bayramlar uchun tayyor qadoqda."],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function label(x, y, w, brand, name, vol) {
  return `<rect x="${x}" y="${y}" width="${w}" height="64" rx="7" fill="#fff" fill-opacity=".92"/>
<text x="200" y="${y + 24}" font-family="Georgia,serif" font-size="13" text-anchor="middle" fill="#222" font-weight="bold">${esc(brand.toUpperCase().slice(0, 20))}</text>
<text x="200" y="${y + 42}" font-family="Arial,sans-serif" font-size="11" text-anchor="middle" fill="#444">${esc(name.slice(0, 24))}</text>
<text x="200" y="${y + 57}" font-family="Arial,sans-serif" font-size="10" text-anchor="middle" fill="#777">${esc(vol)}</text>`;
}
function cosmeticSvg(name, brand, volume, c, shape) {
  const gl = '<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient>';
  const body = {
    jar: `<rect x="110" y="150" width="180" height="40" rx="10" fill="#e9edf1" stroke="#b9c2cb"/><rect x="100" y="186" width="200" height="140" rx="22" fill="${c}"/><rect x="100" y="186" width="200" height="140" rx="22" fill="url(#gl)"/>${label(124, 222, 152, brand, name, volume)}`,
    tube: `<path d="M140 70 H260 L246 300 H154 Z" fill="${c}"/><path d="M140 70 H260 L246 300 H154 Z" fill="url(#gl)"/><rect x="170" y="300" width="60" height="44" rx="6" fill="#e9edf1" stroke="#b9c2cb"/><rect x="136" y="62" width="128" height="12" fill="${c}" opacity=".8"/>${label(146, 150, 108, brand, name, volume)}`,
    bottle: `<rect x="182" y="46" width="36" height="40" rx="5" fill="#2e3d4f"/><rect x="128" y="86" width="144" height="250" rx="30" fill="${c}"/><rect x="128" y="86" width="144" height="250" rx="30" fill="url(#gl)"/>${label(138, 180, 124, brand, name, volume)}`,
    dropper: `<ellipse cx="200" cy="66" rx="18" ry="22" fill="#1f2a36"/><rect x="186" y="80" width="28" height="40" fill="#2e3d4f"/><rect x="140" y="120" width="120" height="210" rx="18" fill="${c}"/><rect x="140" y="120" width="120" height="210" rx="18" fill="url(#gl)"/>${label(150, 196, 100, brand, name, volume)}`,
    stick: `<rect x="176" y="60" width="48" height="110" rx="10" fill="#1b1b1b"/><rect x="170" y="166" width="60" height="174" rx="12" fill="${c}"/><rect x="170" y="166" width="60" height="174" rx="12" fill="url(#gl)"/><text x="200" y="260" font-family="Georgia,serif" font-size="12" text-anchor="middle" fill="#eee" transform="rotate(-90 200 260)">${esc(brand.toUpperCase())}</text>`,
    lipstick: `<path d="M178 70 L222 92 V170 H178 Z" fill="${c}"/><rect x="170" y="166" width="60" height="50" rx="4" fill="#c3cbd3"/><rect x="164" y="212" width="72" height="128" rx="8" fill="#1f1f1f"/><text x="200" y="286" font-family="Georgia,serif" font-size="13" text-anchor="middle" fill="#ddd">${esc(brand.toUpperCase())}</text>`,
    compact: `<circle cx="200" cy="210" r="120" fill="#2b2b2b"/><circle cx="200" cy="210" r="96" fill="${c}"/><circle cx="200" cy="210" r="96" fill="url(#gl)"/><text x="200" y="206" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#3b2b20" font-weight="bold">${esc(brand.toUpperCase().slice(0, 16))}</text><text x="200" y="228" font-family="Arial,sans-serif" font-size="12" text-anchor="middle" fill="#3b2b20">${esc(name.slice(0, 22))}</text>`,
    nail: `<rect x="180" y="60" width="40" height="120" rx="6" fill="#1b1b1b"/><rect x="134" y="176" width="132" height="150" rx="26" fill="${c}"/><rect x="134" y="176" width="132" height="150" rx="26" fill="url(#gl)"/>${label(144, 222, 112, brand, name, volume)}`,
    spray: `<rect x="176" y="44" width="48" height="30" rx="6" fill="#c3cbd3"/><rect x="150" y="74" width="100" height="270" rx="20" fill="${c}"/><rect x="150" y="74" width="100" height="270" rx="20" fill="url(#gl)"/>${label(156, 170, 88, brand, name, volume)}`,
    box: `<rect x="90" y="120" width="220" height="200" rx="10" fill="${c}"/><rect x="90" y="120" width="220" height="200" rx="10" fill="url(#gl)"/><rect x="190" y="120" width="20" height="200" fill="#fff" opacity=".7"/><rect x="90" y="200" width="220" height="20" fill="#fff" opacity=".7"/><path d="M200 120 C170 80 140 96 160 118 Z M200 120 C230 80 260 96 240 118 Z" fill="#fff" opacity=".85"/>`,
  }[shape];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs>${gl}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".12"/><stop offset="1" stop-color="${c}" stop-opacity=".38"/></linearGradient></defs>
<rect width="400" height="400" fill="#f5f7f9"/><rect width="400" height="400" fill="url(#bg)"/>${body}</svg>`;
}

const REVIEW_TEXTS = {
  5: ["Juda yoqdi, hammaga tavsiya qilaman!", "Sifati a'lo, original. Mijozlarimiz ham mamnun.", "Ikkinchi marta olyapmiz, tez sotiladi.", "Hidi uzoq saqlanadi, qadoqlash ham chiroyli.", "Narxiga nisbatan juda yaxshi mahsulot.", ''],
  4: ["Yaxshi, lekin karobkada yetkazish biroz kechikdi.", "Sifati yaxshi, narxi biroz qimmatroq.", "Mijozlar so'rab kelishadi, yaxshi ketadi.", ''],
  3: ["O'rtacha. Kutganimdek emas, lekin yomon ham emas.", "Normal, narxi tushsa yaxshi bo'lardi."],
  2: ["Qadoq shikastlangan holda keldi, almashtirib berishdi."],
};

function addCosmetics(db, { uploads, url, staffId, now, dayAgo, rnd }) {
  fs.mkdirSync(uploads, { recursive: true });
  const t = now();
  // Atirlarga kategoriya
  db.prepare("UPDATE products SET category='Atir' WHERE category='' AND deleted_at IS NULL AND image LIKE ?").run(url + 'demo-%');
  // Eski demo atirlarning qisqa tavsifini to'liqroq qilish
  for (const p of db.prepare("SELECT id, volume, box_qty, description FROM products WHERE image LIKE ? AND description IN ('Erkaklar uchun','Ayollar uchun','Sharq atiri, uzoq saqlanadi')").all(url + 'demo-%')) {
    const arab = p.description.startsWith('Sharq');
    const d = (arab ? 'Unisex' : p.description) + ` atir (${p.volume}).\n`
      + (arab ? 'Sharq atiri: ud, amber va ziravor notalari. Hid uzoq saqlanadi.' : 'Eau de Parfum. Hid 6–8 soat saqlanadi.') + `\nKarobkada ${p.box_qty} dona.`;
    db.prepare('UPDATE products SET description=? WHERE id=?').run(d, p.id);
  }
  const insP = db.prepare(`INSERT INTO products (name,brand,category,volume,sku,piece_price,box_price,box_qty,description,image,in_shop,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`);
  const insM = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,created_by,created_at) VALUES (?,?,?,?,?,?)');
  let added = 0;
  db.transaction(() => {
    COSMETICS.forEach(([name, brand, cat, volume, price, box, color, shape, desc], i) => {
      const sku = 'KOS-' + String(i + 1).padStart(3, '0');
      if (db.prepare('SELECT 1 FROM products WHERE sku=?').get(sku)) return;
      const file = `demo-kos-${String(i + 1).padStart(2, '0')}.svg`;
      fs.writeFileSync(path.join(uploads, file), cosmeticSvg(name, brand, volume, color, shape));
      const id = insP.run(name, brand, cat, volume, sku, price, Math.round(price * box * 0.95 / 1000) * 1000, box, desc, url + file, t, t).lastInsertRowid;
      insM.run(id, box * (5 + Math.floor(rnd() * 20)), dayAgo(40, 10), "Boshlang'ich kirim", staffId, t);
      added++;
    });
  })();

  // Namuna sharhlar (faqat hali sharh bo'lmasa)
  let reviews = 0;
  if (!db.prepare('SELECT 1 FROM product_reviews LIMIT 1').get()) {
    const clients = db.prepare('SELECT id FROM clients WHERE deleted_at IS NULL ORDER BY id LIMIT 25').all().map((c) => c.id);
    const products = db.prepare('SELECT id FROM products WHERE deleted_at IS NULL AND in_shop=1').all().map((p) => p.id);
    const ins = db.prepare('INSERT OR IGNORE INTO product_reviews (product_id,client_id,rating,text,created_at,updated_at) VALUES (?,?,?,?,?,?)');
    db.transaction(() => {
      for (const pid of products) {
        if (rnd() < 0.35 || !clients.length) continue;
        const n = 1 + Math.floor(rnd() * 5);
        for (let k = 0; k < n; k++) {
          const x = rnd();
          const rating = x < 0.55 ? 5 : x < 0.85 ? 4 : x < 0.96 ? 3 : 2;
          const pool = REVIEW_TEXTS[rating];
          const at = dayAgo(1 + Math.floor(rnd() * 50));
          reviews += ins.run(pid, clients[Math.floor(rnd() * clients.length)], rating, pool[Math.floor(rnd() * pool.length)], at, at).changes;
        }
      }
    })();
  }
  return { added, reviews };
}

module.exports = { addCosmetics, COSMETICS };

