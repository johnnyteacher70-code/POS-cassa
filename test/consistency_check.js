// Barcha filial bazalarida kesh qiymatlari noldan hisoblangani bilan bir xilmi:
// ombor qoldig'i (trigger'lar), mijozning ochiq qarz statistikasi va balansi (recomputeClient).
// Server qayta ishga tushishidan OLDIN ishlatiladi — aks holda ishga tushishdagi tuzatish xatolarni yashirib qo'yardi.
// Ishga tushirish: node consistency_check.js <DATA_DIR> <projectRoot>
const [DATA, ROOT] = process.argv.slice(2);
const fs = require('fs');
const path = require('path');
const sqlite = require(ROOT + '/node_modules/better-sqlite3');

let pass = 0, fail = 0;
const fails = [];
const ok = (c, n, e) => { if (c) pass++; else { fail++; fails.push(n + (e !== undefined ? ' → ' + JSON.stringify(e).slice(0, 300) : '')); } };
const PCS = "i.qty * CASE WHEN i.unit='karobka' THEN i.box_qty ELSE 1 END";

for (const id of fs.readdirSync(path.join(DATA, 'branches'))) {
  const file = path.join(DATA, 'branches', id, 'app.db');
  if (!fs.existsSync(file)) continue;
  const db = sqlite(file, { readonly: true });
  const badStock = db.prepare(`SELECT p.id, p.name, p.stock_pieces,
      COALESCE((SELECT SUM(qty_pieces) FROM stock_moves m WHERE m.product_id=p.id AND m.deleted_at IS NULL),0)
      - COALESCE((SELECT SUM(${PCS}) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND s.status='confirmed' AND s.deleted_at IS NULL),0) real
    FROM products p`).all().filter((r) => Math.abs(r.stock_pieces - r.real) > 1e-9);
  ok(badStock.length === 0, `K1 filial ${id}: ombor qoldig'i (trigger) to'g'ri`, badStock.slice(0, 3));
  const badDebt = db.prepare(`SELECT c.id, c.open_debt, c.open_debts, d.debt, d.n FROM clients c LEFT JOIN
      (SELECT client_id, SUM(total-paid_amount) debt, COUNT(*) n FROM sales WHERE status='confirmed' AND deleted_at IS NULL AND total>paid_amount GROUP BY client_id) d
      ON d.client_id=c.id`).all().filter((r) => r.open_debt !== (r.debt || 0) || r.open_debts !== (r.n || 0));
  ok(badDebt.length === 0, `K2 filial ${id}: mijozlar ochiq qarzi to'g'ri`, badDebt.slice(0, 3));
  const badBal = db.prepare(`SELECT c.id, c.balance,
      COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) FROM payments p WHERE p.client_id=c.id AND p.deleted_at IS NULL),0)
      - COALESCE((SELECT SUM(total) FROM sales s WHERE s.client_id=c.id AND s.status='confirmed' AND s.deleted_at IS NULL),0) real
    FROM clients c`).all().filter((r) => r.balance !== r.real);
  ok(badBal.length === 0, `K3 filial ${id}: mijozlar balansi = kirim − chiqim − sotuv`, badBal.slice(0, 3));
  db.close();
}

console.log(`\nKESH TEKSHIRUVI: ${pass} o'tdi, ${fail} xato`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fail ? 1 : 0);
