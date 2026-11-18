// Mahsulot ranglari: Excel / formada bitta katakda vergul bilan ("Qizil, Ko'k, Qora"),
// bazada — har biri alohida qator (product_colors).
const db = require('./db');
const { str } = require('./util');

function parseColors(v) {
  let list = v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) { try { list = JSON.parse(t); } catch { list = t.split(/[,;\n]/); } } else list = t.split(/[,;\n]/);
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const c of list) {
    const name = str(c, 40).replace(/\s+/g, ' ');
    const k = name.toLowerCase();
    if (name && !seen.has(k)) { seen.add(k); out.push(name); }
  }
  return out.slice(0, 50);
}

function colorsOf(productId) {
  return db.prepare('SELECT name FROM product_colors WHERE product_id=? ORDER BY sort, id').all(productId).map((r) => r.name);
}

// product_id -> [ranglar] (ro'yxatlar uchun bitta so'rov)
function colorMap() {
  const m = new Map();
  for (const r of db.prepare('SELECT product_id, name FROM product_colors ORDER BY product_id, sort, id').all()) {
    if (!m.has(r.product_id)) m.set(r.product_id, []);
    m.get(r.product_id).push(r.name);
  }
  return m;
}

function setColors(productId, list) {
  db.prepare('DELETE FROM product_colors WHERE product_id=?').run(productId);
  const ins = db.prepare('INSERT INTO product_colors (product_id,name,sort) VALUES (?,?,?)');
  list.forEach((c, i) => ins.run(productId, c, i));
}

// Tanlangan rang mahsulot ranglaridan biri bo'lishi kerak (katta-kichik harf farqsiz) — to'g'ri yozilishi qaytariladi
function matchColor(productId, color) {
  const c = str(color, 40);
  if (!c) return '';
  const found = colorsOf(productId).find((x) => x.toLowerCase() === c.toLowerCase());
  return found || null;
}

// "Kimlar uchun": Erkaklar uchun / Ayollar uchun / Uniseks / Bolalar uchun (bo'sh — ko'rsatilmagan)
const AUDIENCES = ['men', 'women', 'unisex', 'kids'];
function parseAudience(v) {
  const t = String(v || '').toLowerCase().replace(/[ʻʼ'`‘’]/g, '');
  if (!t.trim()) return '';
  if (AUDIENCES.includes(t.trim())) return t.trim();
  if (/unisex|uniseks|унисекс|hamma|barcha|umumiy|универс|для всех/.test(t)) return 'unisex';
  if (/bola|дет|ребен|kid|child/.test(t)) return 'kids';
  if (/ayol|qiz|жен|дам|women|woman|female|her\b/.test(t)) return 'women';
  if (/erkak|муж|men|man|male|him\b|ogil/.test(t)) return 'men';
  return '';
}

// Kategoriya / brend: "soch parvarishi" va "Soch parvarishi" — bitta. Bazada borini (eng ko'p ishlatilganini) oladi.
function canonical(field, value) {
  const v = String(value || '').trim().replace(/\s+/g, ' ');
  if (!v || !['category', 'brand'].includes(field)) return v;
  const row = db.prepare(`SELECT ${field} v, COUNT(*) n FROM products WHERE deleted_at IS NULL AND lower(${field})=lower(?) GROUP BY ${field} ORDER BY n DESC LIMIT 1`).get(v);
  if (row) return row.v;
  return v.charAt(0).toUpperCase() + v.slice(1);   // yangi — bosh harf katta
}
// Bir martalik / har ishga tushishda: bazadagi turlicha yozilganlarni birlashtirish
function mergeCaseVariants() {
  for (const r of db.prepare("SELECT DISTINCT category c FROM products WHERE category<>'' AND substr(category,1,1)<>upper(substr(category,1,1))").all()) {
    db.prepare('UPDATE products SET category=? WHERE category=?').run(r.c.charAt(0).toUpperCase() + r.c.slice(1), r.c);
  }
  for (const f of ['category', 'brand']) {
    const groups = db.prepare(`SELECT lower(${f}) k, COUNT(DISTINCT ${f}) d FROM products WHERE ${f}<>'' GROUP BY lower(${f}) HAVING d > 1`).all();
    for (const g of groups) {
      const best = db.prepare(`SELECT ${f} v, COUNT(*) n FROM products WHERE lower(${f})=? GROUP BY ${f} ORDER BY n DESC, ${f} LIMIT 1`).get(g.k).v;
      db.prepare(`UPDATE products SET ${f}=? WHERE lower(${f})=?`).run(best, g.k);
    }
  }
}

module.exports = { canonical, mergeCaseVariants, AUDIENCES, parseAudience, parseColors, colorsOf, colorMap, setColors, matchColor };
