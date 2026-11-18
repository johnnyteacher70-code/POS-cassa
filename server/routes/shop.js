// Mijozlar katalogi (sayt) va shaxsiy kabinet: telefon + parol bilan kirish
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { num } = require('../util');
const { sellUnit, now, str, int, digits, normPhone, isUzPhone, limiter, httpError, fmtMoney, getSetting, audit } = require('../util');
const { readItems, itemsTotal } = require('../items');
const { listProducts, ratingMap } = require('./products');
const { clientName } = require('./clients');
const { colorsOf } = require('../colors');
const { priceOf, activePromos, promoPercent, promoPrice, UNITS } = require('../units');
const { syncNewOrderAcrossBranches, onOrderCancelledAcrossBranches } = require('../shared_sync');

// Mijozga tegishli aksiyalar ro'yxati (mahsulot bo'yicha): [{ pct, min }] — katalog ham, server ham bir xil qoida bilan
function promosFor(promos, p) {
  return promos.filter((a) => a.scope === 'all' || (a.scope === 'category' && a.target === (p.category || '')) || (a.scope === 'product' && Number(a.target) === p.id))
    .map((a) => ({ pct: a.percent, min: a.min_qty || 0 }));
}

const router = express.Router();

// Mijoz sessiya tokeni (X-Shop-Token) bo'yicha aniqlanadi
function identify(req, _res, next) {
  const token = req.get('X-Shop-Token');
  const s = token && db.prepare('SELECT client_id FROM shop_sessions WHERE token=? AND expires_at>?').get(token, now());
  req.client = s ? db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(s.client_id) || null : null;
  if (req.client) req.actorName = `Sayt: ${clientName(req.client)}`;
  next();
}
function requireClient(req, _res, next) {
  if (!req.client) return next(httpError(403, 'Avval katalogga kiring'));
  next();
}

function publicClient(c) {
  return {
    id: c.id, type: c.type, company_name: c.company_name, contact_name: c.contact_name, phone: c.phone, inn: c.inn,
    balance: c.balance, name: clientName(c), address: c.address,
    self_registered: c.self_registered, needs_profile: c.self_registered === 1, has_password: !!c.shop_password_hash,
  };
}

// --- Katalog (ochiq) ---
// Kirgan mijozga — uning narx turi bo'yicha narxlar; hammaga — amaldagi aksiyalar, o'lchov birligi va qadoq nomi
router.get('/catalog', identify, (req, res) => {
  const lvl = req.client && req.client.price_level_id;
  const promos = activePromos(db);
  const products = listProducts({ includeInactive: false }).filter((p) => p.in_shop).map((p) => {
    const piece = priceOf(db, p, lvl, 'dona'), box = priceOf(db, p, lvl, 'karobka');
    return {
      id: p.id, name: p.name, brand: p.brand, category: p.category, volume: p.volume, size: p.size, audience: p.audience, colors: p.colors, description: p.description, image: p.image,
      piece_price: piece, box_price: box, box_qty: p.box_qty, rating: p.rating, reviews: p.reviews,
      base_piece: p.piece_price,                                   // asosiy narx (mijozning narxi boshqa bo'lsa — ustidan chizilgan holda ko'rsatiladi)
      unit_label: (UNITS[p.unit] || UNITS.dona).label, pack_name: p.pack_name || 'karobka', frac: !!(UNITS[p.unit] || {}).frac,
      promos: promosFor(promos, p),
    };
  });
  const level = lvl ? db.prepare('SELECT name FROM price_levels WHERE id=? AND deleted_at IS NULL').get(lvl) : null;
  res.json({
    price_level: level ? level.name : '',
    title: getSetting('shop_title') || getSetting('company_name') || 'LA CHERRY — Onlayn Katalog',
    welcome: getSetting('shop_welcome') || "LA CHERRY kosmetika olamiga xush kelibsiz!",
    phone: getSetting('company_phone'),
    theme_color: getSetting('theme_color') || '#d94680',
    theme_preset: getSetting('theme_preset') || 'cherry',
    usd_enabled: getSetting('usd_enabled') || '',
    usd_rate: getSetting('usd_rate') || '',
    usd_display_mode: getSetting('usd_display_mode') || 'uzs',
    products,
    sell_unit: sellUnit(),
  });
});

router.get('/me', identify, (req, res) => {
  res.json({ client: req.client ? publicClient(req.client) : null });
});

// ---------- Sayt orqali: ro'yxatdan o'tish / kirish (telefon + parol) ----------
const SHOP_SESSION_DAYS = 90;
function newShopSession(clientId) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SHOP_SESSION_DAYS * 864e5).toLocaleString('sv-SE').slice(0, 19);
  db.prepare('INSERT INTO shop_sessions (token,client_id,created_at,expires_at) VALUES (?,?,?,?)').run(token, clientId, now(), exp);
  return token;
}
// Parol tanlashga qarshi cheklovlar (xotirasi chegaralangan)
const loginByPhone = limiter(8, 15 * 60e3);
const loginByIp = limiter(40, 15 * 60e3);
const registerByIp = limiter(10, 3600e3);
const TOO_MANY = "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring";

router.post('/web/register', async (req, res) => {
  const b = req.body;
  if (registerByIp.blocked(req.ip)) throw httpError(429, TOO_MANY);
  registerByIp.hit(req.ip);
  const phone = normPhone(b.phone);
  const password = String(b.password || '');
  if (!isUzPhone(phone)) throw httpError(400, "Telefon raqamini to'liq kiriting");
  if (password && password.length < 4) throw httpError(400, 'Parol kamida 4 belgi');
  const p = {
    type: b.type === 'b2b' ? 'b2b' : 'b2c', company_name: str(b.company_name, 200), inn: digits(b.inn).slice(0, 14),
    contact_name: str(b.contact_name, 200) || phone, address: str(b.address, 300),
  };
  if (p.type === 'b2b' && !p.company_name) throw httpError(400, 'Kompaniya nomini kiriting');
  if (p.type === 'b2c') { p.company_name = ''; p.inn = ''; }
  const ex = db.prepare('SELECT id FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?)').get(phone, phone);
  if (ex) {
    if (password) throw httpError(409, "Bu raqam bazada bor. Kirish parolini do'kon menejeridan oling");
    return res.json({ token: newShopSession(ex.id) });
  }
  const t = now();
  const passHash = password ? await bcrypt.hash(password, 10) : null;
  const id = db.prepare(`INSERT INTO clients (type,company_name,inn,contact_name,phone,address,note,self_registered,shop_password_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,2,?,?,?)`).run(p.type, p.company_name, p.inn, p.contact_name, phone, p.address,
    "Sayt orqali ro'yxatdan o'tgan", passHash, t, t).lastInsertRowid;
  audit({ actorName: `Sayt: ${p.contact_name}` }, { action: 'create', entity: 'client', entity_id: id, client_id: id, summary: `Yangi mijoz (sayt): ${p.company_name || p.contact_name} ${phone}` });
  res.json({ token: newShopSession(id) });
});

router.post('/web/login', async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!isUzPhone(phone)) throw httpError(401, "Telefon raqamini to'liq kiriting");
  if (loginByPhone.blocked(phone) || loginByIp.blocked(req.ip)) throw httpError(429, TOO_MANY);
  let c = db.prepare('SELECT * FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?)').get(phone, phone);

  if (req.body.password) {
    if (!c || !c.shop_password_hash || !(await bcrypt.compare(String(req.body.password), c.shop_password_hash))) {
      loginByPhone.hit(phone); loginByIp.hit(req.ip);
      throw httpError(401, "Telefon yoki parol noto'g'ri");
    }
  }

  // Parolsiz kirish: bazada bo'lmasa — avtomatik mijoz yaratib kirish
  if (!c) {
    const name = str(req.body.name || req.body.contact_name, 200).trim() || phone;
    const t = now();
    const id = db.prepare(`INSERT INTO clients (type,contact_name,phone,note,self_registered,created_at,updated_at)
      VALUES ('b2c',?,?, 'Sayt orqali tezkor kirish', 2,?,?)`).run(name, phone, t, t).lastInsertRowid;
    c = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
    audit({ actorName: `Sayt: ${phone}` }, { action: 'create', entity: 'client', entity_id: id, client_id: id, summary: `Yangi mijoz (sayt telefon kirish): ${name} ${phone}` });
  }

  loginByPhone.reset(phone);
  res.json({ token: newShopSession(c.id) });
});

// Kirgan mijoz parolini o'zgartiradi (eski parol so'ralmaydi — sessiya yetarli)
router.post('/password', identify, requireClient, async (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 4) throw httpError(400, 'Parol kamida 4 belgi');
  db.prepare('UPDATE clients SET shop_password_hash=? WHERE id=?').run(await bcrypt.hash(password, 10), req.client.id);
  // boshqa qurilmalardagi kirishlar yopiladi, joriysi qoladi
  db.prepare('DELETE FROM shop_sessions WHERE client_id=? AND token != ?').run(req.client.id, req.get('X-Shop-Token') || '');
  audit(req, { action: 'update', entity: 'client', entity_id: req.client.id, client_id: req.client.id, summary: "Mijoz parolini o'zgartirdi" });
  res.json({ ok: true });
});

router.post('/web/logout', (req, res) => {
  const token = req.get('X-Shop-Token');
  if (token) db.prepare('DELETE FROM shop_sessions WHERE token=?').run(token);
  res.json({ ok: true });
});

// Ro'yxatdan o'tgan mijoz o'z ma'lumotlarini to'ldiradi / tahrirlaydi
// (faqat saytda o'zi ro'yxatdan o'tganlar; do'kon kiritgan mijozlarni faqat admin o'zgartiradi)
router.post('/profile', identify, requireClient, (req, res) => {
  const c = req.client;
  if (!c.self_registered) throw httpError(403, "Ma'lumotlarni o'zgartirish uchun menejerga murojaat qiling");
  const b = req.body;
  const p = {
    type: b.type === 'b2b' ? 'b2b' : 'b2c',
    company_name: str(b.company_name, 200), inn: digits(b.inn).slice(0, 14),
    contact_name: str(b.contact_name, 200), address: str(b.address, 300),
  };
  if (p.type === 'b2b' && !p.company_name) throw httpError(400, 'Kompaniya nomini kiriting');
  if (!p.contact_name) throw httpError(400, 'Ism familiyangizni kiriting');
  if (p.type === 'b2c') { p.company_name = ''; p.inn = ''; }
  db.prepare(`UPDATE clients SET type=?, company_name=?, inn=?, contact_name=?, address=?, self_registered=2, updated_at=? WHERE id=?`)
    .run(p.type, p.company_name, p.inn, p.contact_name, p.address, now(), c.id);
  audit(req, {
    action: 'update', entity: 'client', entity_id: c.id, client_id: c.id, summary: `Mijoz o'z ma'lumotlarini to'ldirdi (sayt)`,
    before: { type: c.type, company_name: c.company_name, inn: c.inn, contact_name: c.contact_name, address: c.address }, after: p,
  });
  res.json({ ok: true });
});

// Shaxsiy kabinet: balans, sotuvlar, to'lovlar, buyurtmalar
router.get('/history', identify, requireClient, (req, res) => {
  const id = req.client.id;
  const sales = db.prepare(`SELECT id, number, kind, date, due_date, total, paid_amount, closed_at FROM sales
    WHERE client_id=? AND status='confirmed' AND deleted_at IS NULL ORDER BY date DESC LIMIT 200`).all(id);
  const items = db.prepare(`SELECT i.sale_id, i.name, i.color, i.unit, i.qty, i.box_qty, i.price, i.total FROM sale_items i
    JOIN sales s ON s.id=i.sale_id WHERE s.client_id=? AND s.status='confirmed' AND s.deleted_at IS NULL`).all(id);
  for (const s of sales) s.items = items.filter((i) => i.sale_id === s.id);
  const payments = db.prepare(`SELECT p.id, p.direction, p.method, p.amount, p.date, s.number sale_number FROM payments p
    LEFT JOIN sales s ON s.id=p.sale_id WHERE p.client_id=? AND p.deleted_at IS NULL ORDER BY p.date DESC LIMIT 200`).all(id);
  const orders = db.prepare(`SELECT o.id, o.status, o.total, o.note, o.admin_note, o.created_at, s.number sale_number FROM orders o
    LEFT JOIN sales s ON s.id=o.sale_id WHERE o.client_id=? AND o.deleted_at IS NULL ORDER BY o.id DESC LIMIT 100`).all(id);
  const oitems = db.prepare(`SELECT i.order_id, i.name, i.color, i.unit, i.qty, i.price, i.total FROM order_items i
    JOIN orders o ON o.id=i.order_id WHERE o.client_id=?`).all(id);
  for (const o of orders) o.items = oitems.filter((i) => i.order_id === o.id);
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
  res.json({ client: publicClient(c), sales, payments, orders });
});

router.post('/orders', identify, requireClient, (req, res) => {
  // Narxlar faqat bazadan olinadi
  const raw = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => ({
    product_id: int(i.product_id), unit: i.unit === 'dona' ? 'dona' : 'karobka', qty: Math.min(10000, Math.max(0, Math.round(num(i.qty) * 1000) / 1000)), color: str(i.color, 40),
  }));
  const su = sellUnit();
  if (su === 'box' && raw.some((i) => i.unit === 'dona')) throw httpError(400, 'Faqat karobka bilan buyurtma berish mumkin');
  if (su === 'piece' && raw.some((i) => i.unit === 'karobka')) throw httpError(400, 'Faqat dona bilan buyurtma berish mumkin');
  // Narx: mijozning narx turi, aksiya (miqdor sharti bilan); kasr miqdor faqat kg/litr/metr kabi birliklarda
  const promos = activePromos(db);
  for (const i of raw) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL AND active=1 AND in_shop=1').get(i.product_id);
    if (!p) throw httpError(400, 'Mahsulot mavjud emas');
    if (!(i.unit === 'dona' && (UNITS[p.unit] || {}).frac)) i.qty = Math.round(i.qty);
    const pieces = i.unit === 'karobka' ? i.qty * p.box_qty : i.qty;
    i.price = promoPrice(priceOf(db, p, req.client.price_level_id, i.unit), promoPercent(promos, p, pieces));
  }
  const items = readItems(raw);
  const total = itemsTotal(items);
  const t = now();
  const orderUuid = crypto.randomUUID();
  let id;
  db.transaction(() => {
    id = db.prepare(`INSERT INTO orders (client_id,order_uuid,status,total,note,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(req.client.id, orderUuid, 'new', total, str(req.body.note, 1000), 'web', t, t).lastInsertRowid;
    const ins = db.prepare('INSERT INTO order_items (order_id,product_id,name,color,unit,qty,box_qty,price,total,base_unit,pack_name,sku) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const i of items) ins.run(id, i.product_id, i.name, i.color || '', i.unit, i.qty, i.box_qty, i.price, i.total, i.base_unit || '', i.pack_name || '', i.sku || '');
  })();
  audit(req, { action: 'create', entity: 'order', entity_id: id, client_id: req.client.id, summary: `Sayt buyurtma #${id}: ${fmtMoney(total)}` });

  // Buyurtmani ikkala (barcha faol) do'konga ham yuborish
  try {
    syncNewOrderAcrossBranches({
      sourceBranchId: req.branch ? req.branch.id : 3,
      orderUuid,
      client: req.client,
      items,
      total,
      note: req.body.note,
      source: 'web',
    });
  } catch (err) {
    console.error('[shop] syncNewOrderAcrossBranches error:', err.message);
  }

  res.json({ id, total });
});

// Tezkor buyurtma (ro'yxatdan o'tmasdan / mehmon sifatida)
router.post('/guest-order', identify, (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!isUzPhone(phone)) throw httpError(400, "Telefon raqamini to'liq kiriting");
  const name = str(req.body.name, 200).trim();
  if (!name) throw httpError(400, 'Ismingizni kiriting');

  let client = db.prepare('SELECT * FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?)').get(phone, phone);
  const t = now();
  if (!client) {
    const id = db.prepare(`INSERT INTO clients (type,contact_name,phone,note,self_registered,created_at,updated_at)
      VALUES ('b2c',?,?, 'Katalog (mehmon buyurtmasi)', 2,?,?)`).run(name, phone, t, t).lastInsertRowid;
    client = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
    audit({ actorName: `Mehmon: ${name}` }, { action: 'create', entity: 'client', entity_id: id, client_id: id, summary: `Yangi mijoz (mehmon buyurtma): ${name} ${phone}` });
  }

  const raw = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => ({
    product_id: int(i.product_id), unit: i.unit === 'dona' ? 'dona' : 'karobka', qty: Math.min(10000, Math.max(0, Math.round(num(i.qty) * 1000) / 1000)), color: str(i.color, 40),
  }));
  const su = sellUnit();
  if (su === 'box' && raw.some((i) => i.unit === 'dona')) throw httpError(400, 'Faqat karobka bilan buyurtma berish mumkin');
  if (su === 'piece' && raw.some((i) => i.unit === 'karobka')) throw httpError(400, 'Faqat dona bilan buyurtma berish mumkin');

  const promos = activePromos(db);
  for (const i of raw) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL AND active=1 AND in_shop=1').get(i.product_id);
    if (!p) throw httpError(400, 'Mahsulot mavjud emas');
    if (!(i.unit === 'dona' && (UNITS[p.unit] || {}).frac)) i.qty = Math.round(i.qty);
    const pieces = i.unit === 'karobka' ? i.qty * p.box_qty : i.qty;
    i.price = promoPrice(priceOf(db, p, client.price_level_id, i.unit), promoPercent(promos, p, pieces));
  }
  const items = readItems(raw);
  const total = itemsTotal(items);
  const orderUuid = crypto.randomUUID();
  let id;
  db.transaction(() => {
    id = db.prepare(`INSERT INTO orders (client_id,order_uuid,status,total,note,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(client.id, orderUuid, 'new', total, str(req.body.note, 1000), 'web', t, t).lastInsertRowid;
    const ins = db.prepare('INSERT INTO order_items (order_id,product_id,name,color,unit,qty,box_qty,price,total,base_unit,pack_name,sku) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const i of items) ins.run(id, i.product_id, i.name, i.color || '', i.unit, i.qty, i.box_qty, i.price, i.total, i.base_unit || '', i.pack_name || '', i.sku || '');
  })();
  audit({ actorName: `Mehmon: ${name}` }, { action: 'create', entity: 'order', entity_id: id, client_id: client.id, summary: `Mehmon buyurtma #${id}: ${fmtMoney(total)}` });

  // Buyurtmani ikkala (barcha faol) do'konga ham yuborish
  try {
    syncNewOrderAcrossBranches({
      sourceBranchId: req.branch ? req.branch.id : 3,
      orderUuid,
      client: {
        id: client.id,
        name,
        contact_name: name,
        phone,
        type: 'b2c',
        note: req.body.note,
      },
      items,
      total,
      note: req.body.note,
      source: 'web',
    });
  } catch (err) {
    console.error('[shop] syncNewOrderAcrossBranches guest error:', err.message);
  }

  const token = newShopSession(client.id);
  res.json({ id, total, token });
});

router.post('/orders/:id/cancel', identify, requireClient, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=? AND client_id=? AND deleted_at IS NULL").get(req.params.id, req.client.id);
  if (!o) throw httpError(404, 'Buyurtma topilmadi');
  if (o.status !== 'new') throw httpError(400, "Bu buyurtmani endi bekor qilib bo'lmaydi");
  db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?").run(now(), o.id);
  if (o.order_uuid) {
    onOrderCancelledAcrossBranches(req.branch ? req.branch.id : 3, o.order_uuid);
  }
  audit(req, { action: 'cancel', entity: 'order', entity_id: o.id, client_id: o.client_id, summary: `Mijoz buyurtma #${o.id} ni bekor qildi` });
  res.json({ ok: true });
});

// ---------- Mahsulot sahifasi va sharhlar ----------
// Sharh muallifi: ism + familiyaning bosh harfi (to'liq ism va kompaniya nomi boshqalarga ko'rsatilmaydi)
function reviewerName(c) {
  const parts = String(c.contact_name || c.company_name || '').replace(/["«»]/g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Mijoz';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}
function shopProduct(id) {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL AND active=1 AND in_shop=1').get(id);
  if (!p) throw httpError(404, 'Mahsulot topilmadi');
  return p;
}
const boughtStmt = () => db.prepare(`SELECT 1 FROM sale_items i JOIN sales s ON s.id=i.sale_id
  WHERE i.product_id=? AND s.client_id=? AND s.status='confirmed' AND s.deleted_at IS NULL LIMIT 1`);

router.get('/products/:id', identify, (req, res) => {
  const p = shopProduct(req.params.id);
  const bought = boughtStmt();
  const rows = db.prepare(`SELECT r.id, r.rating, r.text, r.created_at, r.updated_at, r.client_id, c.contact_name, c.company_name
    FROM product_reviews r JOIN clients c ON c.id=r.client_id
    WHERE r.product_id=? AND r.deleted_at IS NULL AND r.hidden=0 ORDER BY r.created_at DESC LIMIT 200`).all(p.id);
  const reviews = rows.map((r) => ({
    id: r.id, rating: r.rating, text: r.text, date: r.created_at, author: reviewerName(r),
    buyer: !!bought.get(p.id, r.client_id), mine: !!req.client && r.client_id === req.client.id,
  }));
  const dist = [5, 4, 3, 2, 1].map((n) => rows.filter((r) => r.rating === n).length);
  // Mijozning o'z sharhi (yashirilgan bo'lsa ham o'zi ko'radi)
  const mine = req.client ? db.prepare('SELECT rating, text, hidden FROM product_reviews WHERE product_id=? AND client_id=? AND deleted_at IS NULL').get(p.id, req.client.id) : null;
  res.json({
    id: p.id, name: p.name, brand: p.brand, category: p.category, volume: p.volume, size: p.size, audience: p.audience, colors: colorsOf(p.id), description: p.description, image: p.image,
    piece_price: p.piece_price, box_price: p.box_price, box_qty: p.box_qty,
    ...(ratingMap().get(p.id) || { rating: 0, reviews: 0 }), dist, list: reviews, mine: mine || null,
  });
});

const reviewByClient = limiter(20, 3600e3);
router.post('/products/:id/review', identify, requireClient, (req, res) => {
  const p = shopProduct(req.params.id);
  if (reviewByClient.blocked(req.client.id)) throw httpError(429, TOO_MANY);
  reviewByClient.hit(req.client.id);
  const rating = int(req.body.rating);
  if (rating < 1 || rating > 5) throw httpError(400, 'Bahoni tanlang (1–5 yulduz)');
  const text = str(req.body.text, 1000);
  const t = now();
  const ex = db.prepare('SELECT * FROM product_reviews WHERE product_id=? AND client_id=?').get(p.id, req.client.id);
  if (ex) {
    // O'chirilgan sharh qayta yozilsa tiklanadi; admin yashirgan bo'lsa yashirinligicha qoladi
    db.prepare('UPDATE product_reviews SET rating=?, text=?, updated_at=?, deleted_at=NULL WHERE id=?').run(rating, text, t, ex.id);
  } else {
    db.prepare('INSERT INTO product_reviews (product_id,client_id,rating,text,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(p.id, req.client.id, rating, text, t, t);
  }
  audit(req, { action: ex ? 'update' : 'create', entity: 'review', entity_id: ex ? ex.id : null, client_id: req.client.id,
    summary: `Sharh: ${p.name} — ${rating}★` });
  res.json({ ok: true });
});

router.delete('/products/:id/review', identify, requireClient, (req, res) => {
  const r = db.prepare('SELECT r.*, p.name FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE r.product_id=? AND r.client_id=? AND r.deleted_at IS NULL')
    .get(req.params.id, req.client.id);
  if (!r) throw httpError(404, 'Sharh topilmadi');
  db.prepare('UPDATE product_reviews SET deleted_at=? WHERE id=?').run(now(), r.id);
  audit(req, { action: 'delete', entity: 'review', entity_id: r.id, client_id: req.client.id, summary: `Mijoz sharhini o'chirdi: ${r.name}` });
  res.json({ ok: true });
});

module.exports = { router };
