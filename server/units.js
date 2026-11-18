// O'lchov birliklari. Mahsulotning asosiy birligi shulardan biri; qadoq (karobka, qop, blok ...) — erkin nom,
// box_qty — qadoqdagi asosiy birlik soni. Ichki "unit" qiymatlari o'zgarmaydi: 'dona' — asosiy birlik, 'karobka' — qadoq.
// Interfeysdagi ro'yxat: public/admin/js/units.js (bir xil bo'lishi kerak).
const UNITS = {
  dona: { label: 'dona', frac: false },
  kg: { label: 'kg', frac: true },
  g: { label: 'g', frac: true },
  l: { label: 'litr', frac: true },
  ml: { label: 'ml', frac: true },
  m: { label: 'metr', frac: true },
  m2: { label: 'm²', frac: true },
  pachka: { label: 'pachka', frac: false },
  quti: { label: 'quti', frac: false },
  juft: { label: 'juft', frac: false },
  komplekt: { label: 'komplekt', frac: false },
};

const normUnit = (u) => (UNITS[u] ? u : 'dona');
const unitLabel = (u) => (UNITS[u] ? UNITS[u].label : 'dona');

// Mahsulotning shu narx turidagi narxi (narx turida berilmagan bo'lsa — asosiy narx)
function priceOf(db, product, levelId, unit) {
  let piece = product.piece_price, box = product.box_price || product.piece_price * product.box_qty;
  if (levelId) {
    const lp = db.prepare('SELECT piece_price, box_price FROM product_prices WHERE product_id=? AND level_id=?').get(product.id, levelId);
    if (lp && lp.piece_price > 0) { piece = lp.piece_price; box = lp.box_price || lp.piece_price * product.box_qty; }
  }
  return unit === 'karobka' ? box : piece;
}

// Bugun amaldagi aksiyalar
function activePromos(db) {
  const d = new Date().toLocaleString('sv-SE').slice(0, 10);
  return db.prepare(`SELECT * FROM promotions WHERE deleted_at IS NULL AND active=1
    AND (date_from IS NULL OR date_from<=?) AND (date_to IS NULL OR date_to>=?)`).all(d, d);
}
// Mahsulotga eng katta aksiya foizi (miqdor shartini hisobga olib; pieces — asosiy birlikda)
function promoPercent(promos, product, pieces) {
  let best = 0;
  for (const p of promos) {
    const hit = p.scope === 'all' || (p.scope === 'category' && p.target === (product.category || '')) || (p.scope === 'product' && Number(p.target) === product.id);
    if (hit && pieces >= (p.min_qty || 0) && p.percent > best) best = p.percent;
  }
  return best;
}
// Aksiyali narx (100 so'mgacha yaxlitlanadi — kassa ham shunday hisoblaydi)
const promoPrice = (price, pct) => (pct > 0 ? Math.round(price * (1 - pct / 100) / 100) * 100 : price);

module.exports = { UNITS, normUnit, unitLabel, priceOf, activePromos, promoPercent, promoPrice };
