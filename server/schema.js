// Filial bazasi sxemasi: har bir filialning app.db fayli shu jadvallar bilan yaratiladi / yangilanadi.
// (Filiallar ro'yxati, egasi akkaunti va sessiyalar — alohida main.db da, qarang: main_db.js)
module.exports = function initBranchSchema(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'seller',          -- admin | seller
    active INTEGER NOT NULL DEFAULT 1,
    is_owner INTEGER NOT NULL DEFAULT 0,          -- 1: biznes egasining shu filialdagi yozuvi (login qilmaydi, faqat amallar shu nomga yoziladi)
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Mijozlar (B2B kompaniyalar va B2C jismoniy shaxslar)
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'b2b',             -- b2b | b2c
    company_name TEXT NOT NULL DEFAULT '',
    inn TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    phone2 TEXT NOT NULL DEFAULT '',
    account_no TEXT NOT NULL DEFAULT '',          -- hisob raqami (shot)
    bank TEXT NOT NULL DEFAULT '',
    mfo TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    balance INTEGER NOT NULL DEFAULT 0,           -- kesh: + avans (biz qarzdormiz), - mijoz qarzdor
    last_activity TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  -- Mahsulotlar (kosmetika: atir, parvarish, makiyaj ...)
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    volume TEXT NOT NULL DEFAULT '',              -- masalan "100 ml"
    sku TEXT NOT NULL DEFAULT '',
    piece_price INTEGER NOT NULL DEFAULT 0,       -- dona narxi
    box_price INTEGER NOT NULL DEFAULT 0,         -- karobka narxi
    box_qty INTEGER NOT NULL DEFAULT 1,           -- karobkada necha dona
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    in_shop INTEGER NOT NULL DEFAULT 1,           -- katalogda ko'rinsinmi
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  -- Tovar kirimi (ombor)
  CREATE TABLE IF NOT EXISTS stock_moves (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty_pieces INTEGER NOT NULL,                  -- + kirim, - hisobdan chiqarish
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );

  -- Sotuvlar (hisob-faktura / nakladnoy)
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'sale',            -- sale | opening (boshlang'ich qarz)
    client_id INTEGER NOT NULL REFERENCES clients(id),
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',     -- confirmed | cancelled
    total INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    paid_amount INTEGER NOT NULL DEFAULT 0,       -- kesh (ledger)
    closed_at TEXT,                               -- qarz yopilgan sana (kesh)
    was_debt INTEGER NOT NULL DEFAULT 0,          -- kesh
    balance_before INTEGER,                       -- nakladnoy uchun (kesh)
    note TEXT NOT NULL DEFAULT '',
    order_id INTEGER,
    quote_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'dona',            -- dona | karobka
    qty REAL NOT NULL,
    box_qty INTEGER NOT NULL DEFAULT 1,
    price INTEGER NOT NULL,                       -- tanlangan birlik narxi
    piece_price INTEGER NOT NULL DEFAULT 0,
    box_price INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL
  );

  -- To'lovlar: kirim (mijozdan pul) va chiqim (mijozga qaytarish)
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    direction TEXT NOT NULL DEFAULT 'in',         -- in | out
    method TEXT NOT NULL DEFAULT 'cash',          -- cash | transfer | card | other
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    sale_id INTEGER REFERENCES sales(id),         -- aniq sotuvga to'lov (ixtiyoriy)
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);

  -- To'lovlarni sotuvlarga taqsimlash (ledger tomonidan qayta hisoblanadi)
  CREATE TABLE IF NOT EXISTS allocations (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    payment_id INTEGER NOT NULL,
    sale_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alloc_client ON allocations(client_id);

  -- Tijorat takliflari (KP)
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    client_name TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    valid_until TEXT,
    total INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    sale_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'dona',
    qty REAL NOT NULL,
    box_qty INTEGER NOT NULL DEFAULT 1,
    price INTEGER NOT NULL,
    piece_price INTEGER NOT NULL DEFAULT 0,
    box_price INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL
  );

  -- Katalog (sayt) buyurtmalari
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    status TEXT NOT NULL DEFAULT 'new',           -- new | confirmed | rejected | cancelled
    total INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    sale_id INTEGER,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_by INTEGER,
    processed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'dona',
    qty REAL NOT NULL,
    box_qty INTEGER NOT NULL DEFAULT 1,
    price INTEGER NOT NULL,
    total INTEGER NOT NULL
  );

  -- Har bir harakat tarixi (audit)
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,                         -- create | update | delete | restore | cancel | confirm ...
    entity TEXT NOT NULL,
    entity_id INTEGER,
    client_id INTEGER,
    summary TEXT NOT NULL DEFAULT '',
    before_json TEXT,
    after_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
  `);

  // --- Migratsiyalar (mavjud bazaga yangi ustunlar) ---
  function addColumn(table, col, def) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  addColumn('clients', 'self_registered', 'INTEGER NOT NULL DEFAULT 0');   // saytda o'zi ro'yxatdan o'tgan
  addColumn('clients', 'created_by', 'INTEGER');
  addColumn('clients', 'register_id', 'INTEGER');                          // tegishli do'kon/kassa (Do'kon 1, Do'kon 2...)
  addColumn('sales', 'closed_by', 'INTEGER');
  addColumn('clients', 'shop_password_hash', 'TEXT');                          // katalog saytiga kirish paroli
  // Kassalar (Kassa 1, 2, 3 ...): har bir sotuv va to'lov qaysi kassada bo'lgani yoziladi
  db.exec(`CREATE TABLE IF NOT EXISTS registers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`);
  if (!db.prepare('SELECT 1 FROM registers LIMIT 1').get()) {
    const t = new Date().toLocaleString('sv-SE').slice(0, 19);
    for (const n of ["Do'kon 1", "Do'kon 2", 'Kassa 3']) db.prepare('INSERT INTO registers (name,created_at) VALUES (?,?)').run(n, t);
  } else {
    try {
      db.prepare("UPDATE registers SET name='Do''kon 1' WHERE name='Kassa 1'").run();
      db.prepare("UPDATE registers SET name='Do''kon 2' WHERE name='Kassa 2'").run();
    } catch {}
  }
  addColumn('users', 'register_id', 'INTEGER');
  addColumn('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  addColumn('quotes', 'discount', "INTEGER NOT NULL DEFAULT 0");
  addColumn('quotes', 'register_id', "INTEGER");
  addColumn('orders', 'order_uuid', 'TEXT');

  // --- Rollar va ruxsatlar (qo'lda yaratiladi; "Administrator" — tizim roli, barcha ruxsatlar) ---
  db.exec(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    perms TEXT NOT NULL DEFAULT '[]',             -- JSON: ["pos.use", "sales.view", ...] yoki ["*"]
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  addColumn('users', 'role_id', 'INTEGER');
  if (!db.prepare('SELECT 1 FROM roles LIMIT 1').get()) {
    const { PRESETS } = require('./perms');
    const t = new Date().toLocaleString('sv-SE').slice(0, 19);
    const ins = db.prepare('INSERT INTO roles (name,perms,is_system,created_at,updated_at) VALUES (?,?,?,?,?)');
    ins.run('Administrator', '["*"]', 1, t, t);
    for (const p of PRESETS) ins.run(p.name, JSON.stringify(p.perms), 0, t, t);
  }
  // Eski "role" ustunidan ko'chirish: admin → Administrator, sotuvchi → "Sotuvchi" roli
  if (db.prepare('SELECT 1 FROM users WHERE role_id IS NULL LIMIT 1').get()) {
    const adminRole = db.prepare('SELECT id FROM roles WHERE is_system=1 ORDER BY id LIMIT 1').get().id;
    db.prepare("UPDATE users SET role_id=? WHERE role_id IS NULL AND (role='admin' OR is_owner=1)").run(adminRole);
    const seller = db.prepare("SELECT id FROM roles WHERE is_system=0 ORDER BY (name='Sotuvchi') DESC, id LIMIT 1").get();
    if (seller) db.prepare('UPDATE users SET role_id=? WHERE role_id IS NULL').run(seller.id);
  }
  addColumn('payments', 'register_id', 'INTEGER');
  addColumn('sales', 'register_id', 'INTEGER');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_register ON payments(register_id);
  CREATE INDEX IF NOT EXISTS idx_sales_register ON sales(register_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS shop_sessions (
    token TEXT PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);

  // Kosmetika turlari (Atir, Yuz parvarishi, Makiyaj ...) — katalogda bo'lim sifatida chiqadi
  addColumn('products', 'category', "TEXT NOT NULL DEFAULT ''");
  // Mahsulot sharhlari: har mijoz bitta mahsulotga bitta sharh (baho 1-5 + matn). Admin yashirishi mumkin.
  db.exec(`CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    rating INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique ON product_reviews(product_id, client_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_created ON product_reviews(created_at);`);

  // Bir martalik: katalog endi standart bo'yicha DONA bilan sotadi (optom narx — donaga)
  if (!db.prepare("SELECT 1 FROM settings WHERE key='sell_unit_v2'").get()) {
    db.prepare("INSERT INTO settings (key,value) VALUES ('sell_unit','piece') ON CONFLICT(key) DO UPDATE SET value='piece'").run();
    db.prepare("INSERT INTO settings (key,value) VALUES ('sell_unit_v2','1')").run();
  }

  // O'lcham (S, M, XL ...) — mahsulotning o'zida; ranglar — alohida jadvalda (mijoz tanlaydi).
  // Sotuv / KP / buyurtma qatorlari va ombor harakatida tanlangan rang saqlanadi.
  addColumn('products', 'size', "TEXT NOT NULL DEFAULT ''");
  addColumn('products', 'audience', "TEXT NOT NULL DEFAULT ''");   // kimlar uchun: men | women | unisex | kids | ''
  db.exec(`CREATE TABLE IF NOT EXISTS product_colors (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_product_colors ON product_colors(product_id);`);
  for (const t of ['sale_items', 'quote_items', 'order_items', 'stock_moves']) addColumn(t, 'color', "TEXT NOT NULL DEFAULT ''");
  for (const t of ['sale_items', 'quote_items', 'order_items']) addColumn(t, 'sku', "TEXT NOT NULL DEFAULT ''");

  // --- Indekslar (ma'lumot ko'payganda tezlik uchun) ---
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
  CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);
  CREATE INDEX IF NOT EXISTS idx_sales_closed ON sales(closed_at);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
  CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
  CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
  CREATE INDEX IF NOT EXISTS idx_alloc_sale ON allocations(sale_id);
  CREATE INDEX IF NOT EXISTS idx_alloc_payment ON allocations(payment_id);
  CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_moves(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
  CREATE INDEX IF NOT EXISTS idx_orders_uuid ON orders(order_uuid);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
  CREATE INDEX IF NOT EXISTS idx_clients_inn ON clients(inn);
  CREATE INDEX IF NOT EXISTS idx_shop_sessions_client ON shop_sessions(client_id);
  DROP INDEX IF EXISTS idx_sales_list;
  CREATE INDEX IF NOT EXISTS idx_sales_list2 ON sales(status, deleted_at, date, id, total, paid_amount);   -- ro'yxat va jami (jadvalga murojaatsiz)
  CREATE INDEX IF NOT EXISTS idx_sales_total ON sales(total);                                               -- summa bo'yicha qidiruv
  CREATE INDEX IF NOT EXISTS idx_sales_rest ON sales((total-paid_amount)) WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount;
  CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount);
  CREATE INDEX IF NOT EXISTS idx_sales_client_state ON sales(client_id, status, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_payments_client_state ON payments(client_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_clients_balance ON clients(balance);
  -- Faqat ochiq qarzlar (kichik qisman indekslar): muddati o'tganlar va qarzlar ro'yxati uchun
  CREATE INDEX IF NOT EXISTS idx_sales_open_due ON sales(due_date) WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount;
  CREATE INDEX IF NOT EXISTS idx_sales_open_date ON sales(date) WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount;
  `);
  // --- Ombor qoldig'i (dona): mahsulot yozuvida saqlanadi, trigger'lar bilan yangilanadi ---
  // Ilgari har so'rovda butun sotuv tarixidan qayta hisoblanardi (katta bazada 0,3–0,7 s). Trigger'lar bazaning
  // o'zida ishlaydi — kodning qaysi joyidan (yoki boshqa skriptdan) yozilmasin, qoldiq to'g'ri qoladi.
  // "Amaldagi sotuv" = tasdiqlangan va o'chirilmagan; faqat shular ombordan ayiriladi.
  addColumn('products', 'stock_pieces', 'REAL NOT NULL DEFAULT 0');
  const PCS = (r) => `${r}.qty * CASE WHEN ${r}.unit='karobka' THEN ${r}.box_qty ELSE 1 END`;
  const ACTIVE = (sid) => `EXISTS (SELECT 1 FROM sales WHERE id=${sid} AND status='confirmed' AND deleted_at IS NULL)`;
  db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_stock_si_ins AFTER INSERT ON sale_items
  WHEN NEW.product_id IS NOT NULL AND ${ACTIVE('NEW.sale_id')}
  BEGIN UPDATE products SET stock_pieces = stock_pieces - ${PCS('NEW')} WHERE id=NEW.product_id; END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_si_del AFTER DELETE ON sale_items
  WHEN OLD.product_id IS NOT NULL AND ${ACTIVE('OLD.sale_id')}
  BEGIN UPDATE products SET stock_pieces = stock_pieces + ${PCS('OLD')} WHERE id=OLD.product_id; END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_si_upd AFTER UPDATE OF qty, unit, box_qty, product_id, sale_id ON sale_items
  BEGIN
    UPDATE products SET stock_pieces = stock_pieces + ${PCS('OLD')} WHERE id=OLD.product_id AND ${ACTIVE('OLD.sale_id')};
    UPDATE products SET stock_pieces = stock_pieces - ${PCS('NEW')} WHERE id=NEW.product_id AND ${ACTIVE('NEW.sale_id')};
  END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_sale_state AFTER UPDATE OF status, deleted_at ON sales
  WHEN (OLD.status='confirmed' AND OLD.deleted_at IS NULL) <> (NEW.status='confirmed' AND NEW.deleted_at IS NULL)
  BEGIN
    UPDATE products SET stock_pieces = stock_pieces
      + (CASE WHEN NEW.status='confirmed' AND NEW.deleted_at IS NULL THEN -1 ELSE 1 END)
      * (SELECT SUM(${PCS('i')}) FROM sale_items i WHERE i.sale_id=NEW.id AND i.product_id=products.id)
    WHERE id IN (SELECT product_id FROM sale_items WHERE sale_id=NEW.id AND product_id IS NOT NULL);
  END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_mv_ins AFTER INSERT ON stock_moves
  WHEN NEW.deleted_at IS NULL
  BEGIN UPDATE products SET stock_pieces = stock_pieces + NEW.qty_pieces WHERE id=NEW.product_id; END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_mv_upd AFTER UPDATE OF qty_pieces, product_id, deleted_at ON stock_moves
  BEGIN
    UPDATE products SET stock_pieces = stock_pieces - OLD.qty_pieces WHERE id=OLD.product_id AND OLD.deleted_at IS NULL;
    UPDATE products SET stock_pieces = stock_pieces + NEW.qty_pieces WHERE id=NEW.product_id AND NEW.deleted_at IS NULL;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_stock_mv_del AFTER DELETE ON stock_moves
  WHEN OLD.deleted_at IS NULL
  BEGIN UPDATE products SET stock_pieces = stock_pieces - OLD.qty_pieces WHERE id=OLD.product_id; END;
  `);
  // Har ochilishda (server ishga tushganda) tekshiriladi — ehtiyot uchun. Faqat farq qilgan qatorlar yoziladi
  // (odatda birortasi ham emas): hamma qatorni qayta yozish WAL jurnalini shishirib, keyingi o'qishlarni sekinlashtirardi.
  db.exec(`WITH mv AS (SELECT product_id, SUM(qty_pieces) q FROM stock_moves WHERE deleted_at IS NULL GROUP BY product_id),
    sd AS (SELECT i.product_id, SUM(${PCS('i')}) q FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE s.status='confirmed' AND s.deleted_at IS NULL AND i.product_id IS NOT NULL GROUP BY i.product_id),
    calc AS (SELECT p.id, COALESCE(mv.q, 0) - COALESCE(sd.q, 0) v FROM products p LEFT JOIN mv ON mv.product_id=p.id LEFT JOIN sd ON sd.product_id=p.id)
    UPDATE products SET stock_pieces = calc.v FROM calc WHERE products.id=calc.id AND products.stock_pieces IS NOT calc.v`);
  let fixed = db.prepare('SELECT changes() n').get().n;

  // --- Mijozning ochiq qarz statistikasi: mijoz yozuvida (recomputeClient yangilaydi) ---
  // Ilgari mijozlar ro'yxati har safar barcha sotuvlardan hisoblardi.
  addColumn('clients', 'open_debt', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('clients', 'open_debts', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('clients', 'oldest_debt', 'TEXT');
  db.exec(`WITH d AS (SELECT client_id, SUM(total-paid_amount) debt, COUNT(*) n, MIN(date) oldest FROM sales
      WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount GROUP BY client_id),
    calc AS (SELECT c.id, COALESCE(d.debt, 0) debt, COALESCE(d.n, 0) n, d.oldest FROM clients c LEFT JOIN d ON d.client_id=c.id)
    UPDATE clients SET open_debt=calc.debt, open_debts=calc.n, oldest_debt=calc.oldest FROM calc
    WHERE clients.id=calc.id AND (clients.open_debt IS NOT calc.debt OR clients.open_debts IS NOT calc.n OR clients.oldest_debt IS NOT calc.oldest)`);
  fixed += db.prepare('SELECT changes() n').get().n;
  // Ko'p qator yozilgan bo'lsa (migratsiya) — WAL jurnali darhol siqiladi, keyingi o'qishlar sekinlashmasin
  if (fixed > 1000) db.pragma('wal_checkpoint(TRUNCATE)');

  // --- Universal mahsulot: o'lchov birligi, qadoq, shtrix-kod, tannarx, minimal qoldiq ---
  addColumn('products', 'unit', "TEXT NOT NULL DEFAULT 'dona'");         // asosiy birlik: dona | kg | l | m ...
  addColumn('products', 'pack_name', "TEXT NOT NULL DEFAULT 'karobka'"); // qadoq nomi: karobka | qop | blok ... (box_qty — undagi asosiy birlik soni)
  addColumn('products', 'barcode', "TEXT NOT NULL DEFAULT ''");
  addColumn('products', 'cost_price', 'REAL NOT NULL DEFAULT 0');        // tannarx (asosiy birlik uchun, o'rtacha tortilgan)
  addColumn('products', 'min_stock', 'REAL NOT NULL DEFAULT 0');         // shundan kam qolsa — "kam qolgan" ro'yxatida
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode<>''");
  for (const t of ['sale_items', 'quote_items', 'order_items']) {
    addColumn(t, 'base_unit', "TEXT NOT NULL DEFAULT ''");               // hujjatda birlik nomi (mahsulot keyin o'zgarsa ham)
    addColumn(t, 'pack_name', "TEXT NOT NULL DEFAULT ''");
  }
  addColumn('sale_items', 'cost', 'REAL NOT NULL DEFAULT 0');            // sotuv paytidagi tannarx (asosiy birlik uchun) — foyda hisobi
  addColumn('stock_moves', 'cost', 'REAL');                              // kirim narxi (asosiy birlik uchun)

  // --- Narx turlari: chakana, ulgurji, VIP ... (asosiy narx — mahsulotning o'zida) ---
  db.exec(`CREATE TABLE IF NOT EXISTS price_levels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS product_prices (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    level_id INTEGER NOT NULL REFERENCES price_levels(id) ON DELETE CASCADE,
    piece_price INTEGER NOT NULL DEFAULT 0,
    box_price INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, level_id)
  ) WITHOUT ROWID;`);
  addColumn('clients', 'price_level_id', 'INTEGER');                     // mijozning narx turi (bo'sh — asosiy narx)

  // --- Yetkazib beruvchilar va xarid (kirim hujjati) ---
  db.exec(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    inn TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    date TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',      -- confirmed | cancelled
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'dona',             -- dona (asosiy birlik) | karobka (qadoq)
    qty REAL NOT NULL,
    box_qty INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL,                           -- tanlangan birlik narxi
    total INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_purchase_items ON purchase_items(purchase_id);
  -- Yetkazib beruvchiga to'lovlar (biz to'laymiz) va undan qaytgan pul
  CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    purchase_id INTEGER,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    register_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_payments ON supplier_payments(supplier_id);`);
  addColumn('stock_moves', 'purchase_id', 'INTEGER');   // xarid hujjatidan kelgan kirim
  addColumn('stock_moves', 'return_id', 'INTEGER');     // mijoz qaytargan tovar

  // --- Qaytarish (vozvrat): mijoz sotuvdagi tovarning bir qismini qaytaradi ---
  // Tovar omborga qaytadi (stock_moves), summa mijoz hisobiga yoziladi (payments: method='return'),
  // naqd qaytarilsa — chiqim to'lovi (payments: direction='out').
  db.exec(`CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    date TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    refund INTEGER NOT NULL DEFAULT 0,             -- naqd / kartaga qaytarilgan qismi
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_returns_sale ON sale_returns(sale_id);
  CREATE TABLE IF NOT EXISTS sale_return_items (
    id INTEGER PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id INTEGER NOT NULL,
    product_id INTEGER,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    qty REAL NOT NULL,
    box_qty INTEGER NOT NULL DEFAULT 1,
    price INTEGER NOT NULL,
    total INTEGER NOT NULL,
    cost REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_return_items ON sale_return_items(return_id);`);
  addColumn('payments', 'return_id', 'INTEGER');

  // --- Xarajatlar (ijara, ish haqi, kommunal ...) ---
  db.exec(`CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    category_id INTEGER REFERENCES expense_categories(id),
    amount INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    register_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);`);
  if (!db.prepare('SELECT 1 FROM expense_categories LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO expense_categories (name) VALUES (?)');
    for (const n of ['Ijara', 'Ish haqi', 'Kommunal xizmatlar', 'Transport va yetkazish', 'Soliq va yig\'imlar', 'Reklama', 'Xo\'jalik xarajatlari', 'Boshqa']) ins.run(n);
  }

  // --- Kassa smenasi: ochilganda kassadagi naqd, yopilganda sanalgan naqd; farq — kamomad / ortiqcha ---
  db.exec(`CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY,
    register_id INTEGER,
    user_id INTEGER,
    opened_at TEXT NOT NULL,
    opening_cash INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    closed_by INTEGER,
    closing_cash INTEGER,
    expected_cash INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_shifts_register ON shifts(register_id, closed_at);`);

  // --- Inventarizatsiya (reviziya): haqiqiy qoldiq sanaladi, farq ombor harakati bilan tuzatiladi ---
  db.exec(`CREATE TABLE IF NOT EXISTS inventories (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',          -- draft | done | cancelled
    category TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    done_at TEXT,
    done_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS inventory_items (
    inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    expected REAL NOT NULL DEFAULT 0,
    counted REAL,
    cost REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (inventory_id, product_id)
  ) WITHOUT ROWID;`);
  addColumn('stock_moves', 'inventory_id', 'INTEGER');
  addColumn('stock_moves', 'transfer_id', 'INTEGER');    // filiallararo ko'chirish (main.db transfers.id)

  // --- Valyuta va soliq kodlari ---
  addColumn('products', 'usd_price', 'REAL NOT NULL DEFAULT 0');       // narx dollarda (0 — so'mda); kurs o'zgarsa so'm narxi qayta hisoblanadi
  addColumn('products', 'cost_usd', 'REAL NOT NULL DEFAULT 0');        // tannarx dollarda (kurs o'zgarsa tannarx ham yangilanadi)
  addColumn('products', 'mxik', "TEXT NOT NULL DEFAULT ''");           // MXIK (IKPU) — mahsulot va xizmatlarning yagona soliq kodi
  addColumn('stock_moves', 'expires_at', 'TEXT');                       // partiyaning yaroqlilik muddati (kirimda)
  addColumn('purchase_items', 'expires_at', 'TEXT');
  addColumn('purchase_items', 'price_usd', 'REAL NOT NULL DEFAULT 0');
  addColumn('purchase_items', 'cost_usd', 'REAL NOT NULL DEFAULT 0');
  addColumn('purchases', 'currency', "TEXT NOT NULL DEFAULT 'UZS'");
  addColumn('purchases', 'rate', 'REAL NOT NULL DEFAULT 1');
  addColumn('purchases', 'total_usd', 'REAL NOT NULL DEFAULT 0');

  // --- Filial aniqligi: qaysi do'kondan sotilgani har bir sotuvda kodi bilan saqlanadi ---
  addColumn('sales', 'branch_id', 'INTEGER');
  addColumn('sales', 'branch_code', "TEXT NOT NULL DEFAULT ''");
  addColumn('sales', 'branch_name', "TEXT NOT NULL DEFAULT ''");
  addColumn('sale_returns', 'branch_id', 'INTEGER');
  addColumn('sale_returns', 'branch_code', "TEXT NOT NULL DEFAULT ''");
  addColumn('sale_returns', 'branch_name', "TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
  CREATE INDEX IF NOT EXISTS idx_returns_branch ON sale_returns(branch_id);`);

  // --- Aksiyalar: foizli chegirma (butun do'kon / kategoriya / mahsulot), sana oralig'i, minimal miqdor ---
  db.exec(`CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    percent REAL NOT NULL,
    scope TEXT NOT NULL DEFAULT 'all',            -- all | category | product
    target TEXT NOT NULL DEFAULT '',              -- kategoriya nomi yoki mahsulot ID
    min_qty REAL NOT NULL DEFAULT 0,              -- shuncha (asosiy birlikda) va undan ko'p olinsa
    date_from TEXT,
    date_to TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  )`);

  // --- Kassa uskunalari: har bir kassaning chek printeri (JSON: mode, host, port, name, device, width, codepage, cut, drawer, qr, auto) ---
  addColumn('registers', 'printer', "TEXT NOT NULL DEFAULT ''");

  // --- Yetkazib beruvchiga buyurtma (zakaz) ---
  db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',          -- draft | sent | received | cancelled
    note TEXT NOT NULL DEFAULT '',
    purchase_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    unit TEXT NOT NULL DEFAULT 'dona',
    qty REAL NOT NULL,
    price REAL NOT NULL DEFAULT 0
  );`);

  // --- Bonus (loyallik) ---
  db.exec(`CREATE TABLE IF NOT EXISTS bonus_moves (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    sale_id INTEGER,
    amount INTEGER NOT NULL,                       -- + yig'ildi, − ishlatildi / olindi
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bonus_client ON bonus_moves(client_id);
  CREATE INDEX IF NOT EXISTS idx_bonus_sale ON bonus_moves(sale_id);`);
  addColumn('clients', 'bonus', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('bonus_moves', 'return_id', 'INTEGER');   // qaytarishda olingan bonus — qaytarish bekor qilinsa qaytadi

  addColumn('clients', 'reminded_at', 'TEXT');   // qarz haqida oxirgi eslatilgan vaqt

  // --- Xodimlar: ish vaqti (keldi/ketdi) va oylik ---
  db.exec(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,                            -- YYYY-MM-DD
    in_at TEXT NOT NULL,
    out_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id, date);
  CREATE TABLE IF NOT EXISTS payroll (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,                           -- YYYY-MM
    fixed_part INTEGER NOT NULL DEFAULT 0,
    percent_part INTEGER NOT NULL DEFAULT 0,
    adjustment INTEGER NOT NULL DEFAULT 0,         -- + bonus / − jarima
    total INTEGER NOT NULL,
    expense_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll(month);`);
  addColumn('users', 'salary_fixed', 'INTEGER NOT NULL DEFAULT 0');      // oylik (belgilangan)
  addColumn('users', 'salary_percent', 'REAL NOT NULL DEFAULT 0');       // foiz
  addColumn('users', 'salary_base', "TEXT NOT NULL DEFAULT 'sales'");    // foiz nimadan: sales (o'z sotuvi) | profit (o'z sotuvi foydasi)

  // Qo'shnilar va hamkor do'konlar bilan tovar va pul oldi-berdisi (tovar qarzi & barter)
  db.exec(`CREATE TABLE IF NOT EXISTS partner_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT NOT NULL,
    partner_phone TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'give',        -- 'give' (biz berdik), 'take' (biz oldik)
    status TEXT NOT NULL DEFAULT 'open',      -- 'open', 'partial', 'closed'
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_partner_loans_partner ON partner_loans(partner_name);
  CREATE INDEX IF NOT EXISTS idx_partner_loans_status ON partner_loans(status);

  CREATE TABLE IF NOT EXISTS partner_loan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES partner_loans(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'dona',
    qty_initial REAL NOT NULL,
    qty_returned_goods REAL NOT NULL DEFAULT 0,
    qty_paid_money REAL NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_partner_loan_items_loan ON partner_loan_items(loan_id);

  CREATE TABLE IF NOT EXISTS partner_loan_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES partner_loans(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES partner_loan_items(id),
    action_type TEXT NOT NULL,                -- 'return_goods' (joyiga joy tovar qaytdi), 'pay_money' (pul to'landi)
    qty REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    register_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_partner_loan_actions_loan ON partner_loan_actions(loan_id);`);

  // Avval jurnalga tushib qolgan parol xeshlarini tozalash
  for (const col of ['before_json', 'after_json']) {
    db.prepare(`UPDATE audit_log SET ${col}=json_remove(${col}, '$.shop_password_hash', '$.password_hash')
      WHERE ${col} LIKE '%password_hash%' AND json_valid(${col})`).run();
  }
  db.pragma('optimize');
};
