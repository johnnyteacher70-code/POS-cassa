// Partiyalar (yaroqlilik muddati bo'yicha): qoldiq FIFO tartibida — avval eski kirim sotiladi,
// shuning uchun ombordagi qoldiq eng yangi kirimlarga tegishli deb hisoblanadi.
// Kirimdagi har bir musbat harakat (xarid, qo'lda kirim, ko'chirish, qaytarish) — bitta partiya.
const db = require('./db');

const today = () => new Date().toLocaleString('sv-SE').slice(0, 10);

// Muddati `limit` (YYYY-MM-DD) gacha bo'lgan, omborda hali qolgan partiyalar
function expiring(limit) {
  const ids = db.prepare(`SELECT DISTINCT m.product_id FROM stock_moves m JOIN products p ON p.id=m.product_id
    WHERE m.deleted_at IS NULL AND m.qty_pieces>0 AND m.expires_at IS NOT NULL AND m.expires_at<=? AND p.deleted_at IS NULL AND p.stock_pieces>0`).all(limit).map((r) => r.product_id);
  const prod = db.prepare('SELECT id, name, unit, pack_name, box_qty, stock_pieces, cost_price FROM products WHERE id=?');
  const moves = db.prepare('SELECT id, qty_pieces, expires_at, date FROM stock_moves WHERE product_id=? AND deleted_at IS NULL AND qty_pieces>0 ORDER BY date DESC, id DESC');
  const t = today();
  const out = [];
  for (const id of ids) {
    const p = prod.get(id);
    let left = p.stock_pieces;
    for (const m of moves.all(id)) {
      if (left <= 1e-9) break;
      const qty = Math.min(m.qty_pieces, left);
      left = Math.round((left - qty) * 1000) / 1000;
      if (m.expires_at && m.expires_at <= limit) {
        out.push({ id: m.id, product_id: p.id, name: p.name, unit: p.unit, pack_name: p.pack_name, box_qty: p.box_qty,
          qty, received: m.qty_pieces, expires_at: m.expires_at, date: m.date, stock: p.stock_pieces,
          value: Math.round(qty * (p.cost_price || 0)), expired: m.expires_at < t });
      }
    }
  }
  return out.sort((a, b) => a.expires_at.localeCompare(b.expires_at)).slice(0, 300);
}

// Bitta partiyaning hozirgi (FIFO) qoldig'i
function leftOf(moveId) {
  const m = db.prepare('SELECT * FROM stock_moves WHERE id=? AND deleted_at IS NULL AND qty_pieces>0').get(moveId);
  if (!m) return null;
  const b = expiring('9999-12-31').find((x) => x.id === m.id);
  return { move: m, qty: b ? b.qty : 0 };
}

module.exports = { expiring, leftOf, today };
