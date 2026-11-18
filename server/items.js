// Sotuv / KP / buyurtma pozitsiyalarini tekshirish va hisoblash
const db = require('./db');
const { str, int, num, httpError } = require('./util');
const { matchColor } = require('./colors');
const { unitLabel } = require('./units');

// keep: tahrirlashda — hujjatda allaqachon bor mahsulotlar (keyin o'chirilgan bo'lsa ham) qoldirilishi mumkin
function readItems(items, { allowEmpty = false, keep = new Set() } = {}) {
  if (!Array.isArray(items)) items = [];
  const out = [];
  for (const it of items) {
    const product = it.product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(int(it.product_id)) : null;
    if (it.product_id && (!product || product.deleted_at) && !keep.has(int(it.product_id))) throw httpError(400, "Mahsulot o'chirilgan yoki topilmadi — savatdan olib tashlang");
    const unit = it.unit === 'karobka' ? 'karobka' : 'dona';
    const qty = num(it.qty);
    if (!(qty > 0)) continue;
    const box_qty = Math.max(1, int(it.box_qty, product ? product.box_qty : 1));
    const piece_price = Math.max(0, int(it.piece_price, product ? product.piece_price : 0));
    const box_price = Math.max(0, int(it.box_price, product ? product.box_price : piece_price * box_qty));
    const defPrice = unit === 'karobka' ? box_price : piece_price;
    const price = Math.max(0, int(it.price, defPrice));
    const name = str(it.name, 300) || (product ? [product.name, product.volume, product.size].filter(Boolean).join(' ') : '');
    if (!name) throw httpError(400, 'Mahsulot nomi kiritilmagan');
    // Rang: mahsulot ranglaridan biri bo'lishi kerak
    let color = str(it.color, 40);
    if (color && product) {
      const m = matchColor(product.id, color);
      if (m === null) throw httpError(400, `${name}: "${color}" rangi yo'q`);
      color = m;
    }
    out.push({
      product_id: product ? product.id : null, name, color, unit, qty, box_qty,
      price, piece_price, box_price, total: Math.round(qty * price),
      sku: product ? (product.sku || product.barcode || '') : (str(it.sku, 50) || str(it.barcode, 50) || ''),
      // Hujjatda birlik nomi: mahsulotniki (keyin o'zgarsa ham hujjat o'zgarmaydi); tannarx — sotuv paytidagi
      base_unit: product ? unitLabel(product.unit) : str(it.base_unit, 20) || 'dona',
      pack_name: product ? product.pack_name || 'karobka' : str(it.pack_name, 30) || 'karobka',
      cost: product ? product.cost_price || 0 : 0,
    });
  }
  if (!out.length && !allowEmpty) throw httpError(400, "Kamida bitta mahsulot qo'shing");
  return out;
}

function itemsTotal(items) { return items.reduce((a, i) => a + i.total, 0); }

function pieces(i) { return i.unit === 'karobka' ? i.qty * i.box_qty : i.qty; }

module.exports = { readItems, itemsTotal, pieces };
