// Kosmetika uchun to'liq test ma'lumotlari: Kategoriyalar, brendlar va ko'p variantli assortimentlar
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'branches', '3', 'app.db');
const db = new Database(dbPath);

console.log('Baza yuklanmoqda:', dbPath);

const cosmeticsData = [
  {
    name: "Gel effektli tirnoq laki (Nail Polish)",
    brand: "Golden Rose",
    category: "Tirnoq bo'yoqlari",
    piece_price: 25000,
    box_price: 240000,
    box_qty: 12,
    colors: ["Qulupnayli", "Limonli", "Qizil 05", "Oq matoviy", "Pushti pastel", "Qora yaltiroq", "Bordo 12", "Fransuz nudi", "Olcha rang"],
    description: "Uzoq muddat saqlanuvchi, yorqin yaltiroq gel effektli lak",
    barcode: "4780011223341",
    stock: 240,
  },
  {
    name: "Matte Velvet lab bo'yog'i (Pomada)",
    brand: "Maybelline",
    category: "Lab bo'yoqlari",
    piece_price: 55000,
    box_price: 500000,
    box_qty: 10,
    colors: ["01 Ruby Red", "02 Nude Peach", "03 Berry Pink", "04 Choco Rose", "05 Coral"],
    description: "Labni quritmaydigan, 16 soatgacha turuvchi baxmal pomada",
    barcode: "4780011223342",
    stock: 150,
  },
  {
    name: "Mevali yaltiroq lab balzami (Lip Gloss Tint)",
    brand: "La Cherry",
    category: "Lab bo'yoqlari",
    piece_price: 32000,
    box_price: 350000,
    box_qty: 12,
    colors: ["Qulupnayli", "Gilosli", "Shaftolili", "Tarvuzli", "Malinali"],
    description: "Labga tabiiy yaltiroqlik va mayin hid beruvchi mevali balzam",
    barcode: "4780011223343",
    stock: 180,
  },
  {
    name: "Tana uchun xushbo'y sprey (Body Mist 250ml)",
    brand: "Victoria's Secret",
    category: "Parfyumeriya & Spreylar",
    piece_price: 120000,
    box_price: 1100000,
    box_qty: 10,
    colors: ["Vanilla & Coconut", "Cherry Blossom", "Mango Passion", "Lavender Night", "Amber Romance"],
    description: "Butun kun davomida tetiklantiruvchi muattar tana spreyi",
    barcode: "4780011223344",
    stock: 80,
  },
  {
    name: "Tonal krem SPF 25 (Matte Foundation)",
    brand: "L'Oreal Paris",
    category: "Yuz parvarishi",
    piece_price: 85000,
    box_price: 780000,
    box_qty: 10,
    colors: ["10 Light Ivory", "20 Natural Beige", "30 Sand Tan", "40 Warm Honey"],
    description: "Yuzdagi nuqsonlarni berkituvchi, tabiiy mot effekt beruvchi tonal krem",
    barcode: "4780011223345",
    stock: 120,
  },
  {
    name: "Mato yuz niqobi (Sheet Mask Korea)",
    brand: "FarmStay",
    category: "Yuz parvarishi",
    piece_price: 12000,
    box_price: 100000,
    box_qty: 10,
    colors: ["Aloe Vera", "Collagen", "Salitsil kislota", "Vitamin C", "Choy daraxti (Tea Tree)", "Muzli gidrolat"],
    description: "Chuqur namlantiruvchi va terini oziqlantiruvchi koreys mato niqobi",
    barcode: "4780011223346",
    stock: 500,
  },
  {
    name: "Suvga chidamli ko'z podvodkasi (Waterproof Eyeliner)",
    brand: "Flormar",
    category: "Ko'z makiyaji",
    piece_price: 38000,
    box_price: 420000,
    box_qty: 12,
    colors: ["01 Qora matoviy", "02 To'q jigarrang", "03 Ko'k metallik", "04 Zumrad yashil"],
    description: "Aniq va ingichka chiziqlar chizuvchi qulay podvodka",
    barcode: "4780011223347",
    stock: 140,
  },
  {
    name: "Hajm beruvchi qora tush (Mascara 3D)",
    brand: "Eveline",
    category: "Ko'z makiyaji",
    piece_price: 45000,
    box_price: 480000,
    box_qty: 12,
    colors: ["Ultra Black", "Dark Brown"],
    description: "Kipriklarga maksimal hajm va uzunlik beruvchi tush",
    barcode: "4780011223348",
    stock: 110,
  },
  {
    name: "Sulfatsiz tiklovchi shampun 400ml",
    brand: "CP-1",
    category: "Soch parvarishi",
    piece_price: 72000,
    box_price: 680000,
    box_qty: 10,
    colors: ["Kerasilk Argan", "Piyoz ekstraktli", "Yalpiz & Mentol", "Kokos moyi"],
    description: "Zararlangan va bo'yalgan sochlarni tiklovchi professional shampun",
    barcode: "4780011223349",
    stock: 90,
  },
  {
    name: "Soch uchun ipak zardob (Hair Silk Serum 100ml)",
    brand: "Mise en Scene",
    category: "Soch parvarishi",
    piece_price: 68000,
    box_price: 620000,
    box_qty: 10,
    colors: ["Original Gold", "Rose Petal", "Super Rich"],
    description: "Soch uchlarining gullashini oldini oluvchi ipakdek zardob",
    barcode: "4780011223350",
    stock: 75,
  },
  {
    name: "Makiyaj gubkasi (Beauty Blender)",
    brand: "Real Techniques",
    category: "Aksessuarlar",
    piece_price: 18000,
    box_price: 320000,
    box_qty: 20,
    colors: ["Pushti tomchi", "Binafsharang burchakli", "Qora marmar", "Yashil zaytun"],
    description: "Tonal vositalarni bir tekis surtish uchun yumshoq sponj",
    barcode: "4780011223351",
    stock: 200,
  },
  {
    name: "Metall soch qisqichi (Krabiklar)",
    brand: "Fashion Beauty",
    category: "Aksessuarlar",
    piece_price: 22000,
    box_price: 240000,
    box_qty: 12,
    colors: ["Oltinrang metall", "Kumushrang", "Qora matoviy", "Bej matoviy"],
    description: "Mustahkam va zamonaviy soch qisqichi",
    barcode: "4780011223352",
    stock: 160,
  },
  {
    name: "Quyoshdan himoyalovchi krem SPF 50+",
    brand: "Skin1004",
    category: "Quyoshdan himoya",
    piece_price: 95000,
    box_price: 900000,
    box_qty: 10,
    colors: ["Centella Air-fit", "Hyalu-Cica Water-fit"],
    description: "Yog'li iz qoldirmaydigan yengil quyosh kremi",
    barcode: "4780011223353",
    stock: 65,
  },
  {
    name: "Oziqlantiruvchi tana kremi (Body Butter 200g)",
    brand: "The Body Shop",
    category: "Tana parvarishi",
    piece_price: 88000,
    box_price: 820000,
    box_qty: 10,
    colors: ["Mango", "Shea Butter", "British Rose", "Coconut"],
    description: "Quruq terini 48 soatgacha mayin va nam tutuvchi krem",
    barcode: "4780011223354",
    stock: 50,
  }
];

const insertProd = db.prepare(`
  INSERT INTO products (
    name, brand, category, piece_price, box_price, box_qty, description, barcode,
    stock_pieces, unit, pack_name, in_shop, active, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, 'dona', 'karobka', 1, 1, datetime('now'), datetime('now')
  )
`);

const insertColor = db.prepare(`
  INSERT INTO product_colors (product_id, name, sort) VALUES (?, ?, ?)
`);

const insertStockMove = db.prepare(`
  INSERT INTO stock_moves (product_id, qty_pieces, date, note, created_by, created_at)
  VALUES (?, ?, datetime('now'), 'Boshlang''ich qoldiq (test)', 1, datetime('now'))
`);

const tx = db.transaction(() => {
  for (const item of cosmeticsData) {
    const existing = db.prepare('SELECT id FROM products WHERE name=?').get(item.name);
    let prodId;
    if (existing) {
      prodId = existing.id;
      db.prepare(`
        UPDATE products SET
          brand=?, category=?, piece_price=?, box_price=?, box_qty=?,
          description=?, barcode=?, stock_pieces=?, in_shop=1, active=1
        WHERE id=?
      `).run(item.brand, item.category, item.piece_price, item.box_price, item.box_qty, item.description, item.barcode, item.stock, prodId);
    } else {
      const res = insertProd.run(
        item.name, item.brand, item.category, item.piece_price, item.box_price, item.box_qty,
        item.description, item.barcode, item.stock
      );
      prodId = res.lastInsertRowid;
      insertStockMove.run(prodId, item.stock);
    }

    db.prepare('DELETE FROM product_colors WHERE product_id=?').run(prodId);
    if (item.colors && item.colors.length) {
      item.colors.forEach((c, idx) => {
        insertColor.run(prodId, c, idx);
      });
    }
    console.log(`✓ [${prodId}] ${item.name} (${item.category}) — ${item.colors.length} ta assortiment qo'shildi`);
  }
});

tx();
console.log('✅ Barcha kosmetika test mahsulotlari muvaffaqiyatli yuklandi!');
