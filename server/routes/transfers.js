// Filiallar orasida tovar ko'chirish.
//   jo'natish (manba filial): tovar manbadan chiqadi (stock_moves.transfer_id), hujjat "yo'lda" holatida — main.db transfers;
//   qabul qilish (qabul qiluvchi filial): har bir mahsulot shtrix-kod → artikul → nom bo'yicha topiladi, topilmasa —
//     jo'natilgan kartochkadan yaratiladi; omborga kirim, tannarx o'rtacha tortilgan usulda yangilanadi;
//   bekor qilish (faqat yo'ldaligida, manba filial): tovar manbaga qaytadi.
const express = require('express');
const db = require('../db');
const main = require('../main_db');
const branches = require('../branches');
const { runInBranch } = require('../context');
const { now, str, int, num, httpError, audit, fmtMoney } = require('../util');
const { need } = require('./auth');
const { updateCost } = require('./products');
const { unitLabel } = require('../units');
const fs = require('fs');
const path = require('path');
const branchDb = require('../branch_db');

// Rasm nusxasi: /uploads/<manba>/<fayl> → qabul qiluvchi filial papkasi
function copyImage(img, fromId, toId) {
  const m = /^\/uploads\/(\d+)\/([A-Za-z0-9._-]+)$/.exec(img || '');
  if (!m || Number(m[1]) !== fromId) return '';
  try {
    fs.copyFileSync(path.join(branchDb.uploadsDir(fromId), m[2]), path.join(branchDb.uploadsDir(toId), m[2]));
    return `/uploads/${toId}/${m[2]}`;
  } catch { return ''; }
}

const router = express.Router();
router.use(need('transfers.send', 'transfers.receive'));

const actor = (req) => req.user.full_name || req.user.username;
function nextTransferNumber() {
  const year = new Date().getFullYear();
  const row = main.prepare("SELECT number FROM transfers WHERE number LIKE ? ORDER BY id DESC LIMIT 1").get(`T${year}-%`);
  const n = row ? parseInt(row.number.split('-').pop(), 10) + 1 : 1;
  return `T${year}-${String(n).padStart(4, '0')}`;
}
// Faqat joriy filialga tegishli hujjat
function mine(req, id) {
  const t = main.prepare('SELECT * FROM transfers WHERE id=?').get(int(id));
  const b = req.branch.id;
  if (!t || (t.from_branch !== b && t.to_branch !== b)) throw httpError(404, 'Topilmadi');
  return t;
}

// Jo'natish mumkin bo'lgan filiallar
router.get('/branches', (req, res) => {
  res.json(branches.allBranches().filter((b) => b.id !== req.branch.id && b.status === 'active').map((b) => ({ id: b.id, name: b.name })));
});

router.get('/', (req, res) => {
  const b = req.branch.id;
  const rows = main.prepare(`SELECT t.*, (SELECT COUNT(*) FROM transfer_items i WHERE i.transfer_id=t.id) items_n
    FROM transfers t WHERE t.from_branch=? OR t.to_branch=? ORDER BY t.id DESC LIMIT 500`).all(b, b);
  res.json(rows.map((t) => ({ ...t, dir: t.from_branch === b ? 'out' : 'in' })));
});

// Qabul qilinishi kutilayotganlar soni (menyu nishoni uchun)
router.get('/incoming-count', (req, res) => {
  res.json({ n: main.prepare("SELECT COUNT(*) n FROM transfers WHERE to_branch=? AND status='sent'").get(req.branch.id).n });
});

router.get('/:id', (req, res) => {
  const t = mine(req, req.params.id);
  t.items = main.prepare('SELECT * FROM transfer_items WHERE transfer_id=? ORDER BY id').all(t.id)
    .map((i) => { const d = JSON.parse(i.data || '{}'); return { ...i, data: undefined, unit: d.unit, base_unit: unitLabel(d.unit), barcode: d.barcode || '' }; });
  t.dir = t.from_branch === req.branch.id ? 'out' : 'in';
  res.json(t);
});

const CARD = ['name', 'brand', 'category', 'volume', 'size', 'sku', 'barcode', 'unit', 'pack_name', 'box_qty', 'piece_price', 'box_price', 'cost_price', 'description', 'in_shop', 'image'];

router.post('/', need('transfers.send'), (req, res) => {
  const to = branches.getBranch(int(req.body.to_branch_id));
  if (!to || to.id === req.branch.id || to.status !== 'active') throw httpError(400, 'Qabul qiluvchi filialni tanlang');
  const lines = [];
  const need = new Map();
  for (const it of Array.isArray(req.body.items) ? req.body.items : []) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').get(int(it.product_id));
    if (!p) throw httpError(400, 'Mahsulot topilmadi');
    const unit = it.unit === 'karobka' && p.box_qty > 1 ? 'karobka' : 'dona';
    const qty = Math.round(num(it.qty) * (unit === 'karobka' ? p.box_qty : 1) * 1000) / 1000;
    if (!(qty > 0)) continue;
    need.set(p.id, (need.get(p.id) || 0) + qty);
    if (need.get(p.id) > (p.stock_pieces || 0) + 1e-9) throw httpError(400, `${p.name}: omborda ${p.stock_pieces} ${unitLabel(p.unit)}, jo'natish ${need.get(p.id)}`);
    lines.push({ p, qty });
  }
  if (!lines.length) throw httpError(400, "Kamida bitta mahsulot qo'shing");
  const t = now();
  const totalCost = lines.reduce((a, l) => a + l.qty * (l.p.cost_price || 0), 0);
  // Avval markaziy hujjat, keyin manba filialdan chiqim (xato bo'lsa — hujjat o'chiriladi)
  let id, number;
  main.transaction(() => {
    number = nextTransferNumber();
    id = Number(main.prepare(`INSERT INTO transfers (number,from_branch,to_branch,from_name,to_name,note,total_cost,sent_by,sent_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(number, req.branch.id, to.id, req.branch.name, to.name, str(req.body.note, 500), totalCost, actor(req), t).lastInsertRowid);
    const ins = main.prepare('INSERT INTO transfer_items (transfer_id,src_product_id,name,data,qty,cost) VALUES (?,?,?,?,?,?)');
    for (const l of lines) ins.run(id, l.p.id, l.p.name, JSON.stringify(Object.fromEntries(CARD.map((k) => [k, l.p[k]]))), l.qty, l.p.cost_price || 0);
  })();
  try {
    db.transaction(() => {
      const mv = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,transfer_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const l of lines) mv.run(l.p.id, -l.qty, t, `Ko'chirish ${number} → ${to.name}`, l.p.cost_price || null, id, req.user.id, t);
    })();
  } catch (e) {
    main.prepare('DELETE FROM transfers WHERE id=?').run(id);
    throw e;
  }
  audit(req, { action: 'create', entity: 'transfer', entity_id: id, summary: `Ko'chirish ${number} → ${to.name}: ${lines.length} ta mahsulot (${fmtMoney(Math.round(totalCost))} tannarxda)` });
  res.json({ id, number });
});

// Qabul qiluvchida mahsulotni topish: shtrix-kod → artikul → nom (+ birlik)
function matchProduct(d) {
  if (d.barcode) { const p = db.prepare('SELECT * FROM products WHERE barcode=? AND deleted_at IS NULL').get(d.barcode); if (p) return p; }
  if (d.sku) { const p = db.prepare("SELECT * FROM products WHERE sku=? AND sku<>'' AND deleted_at IS NULL").get(d.sku); if (p) return p; }
  return db.prepare('SELECT * FROM products WHERE lower(name)=lower(?) AND unit=? AND deleted_at IS NULL').get(d.name, d.unit || 'dona') || null;
}

router.post('/:id/receive', need('transfers.receive'), (req, res) => {
  const tr = mine(req, req.params.id);
  if (tr.to_branch !== req.branch.id) throw httpError(403, 'Bu hujjatni faqat qabul qiluvchi filial tasdiqlaydi');
  if (tr.status !== 'sent') throw httpError(400, 'Hujjat allaqachon qabul qilingan yoki bekor qilingan');
  const items = main.prepare('SELECT * FROM transfer_items WHERE transfer_id=?').all(tr.id);
  const inputMap = new Map((Array.isArray(req.body.items) ? req.body.items : []).map((x) => [int(x.id), x]));
  const t = now();
  let created = 0;
  let totalDamaged = 0;
  const dst = new Map();
  db.transaction(() => {
    const mv = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,transfer_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
    for (const i of items) {
      const inp = inputMap.get(i.id);
      const acc = inp && inp.accepted_qty !== undefined ? Math.min(i.qty, Math.max(0, num(inp.accepted_qty))) : i.qty;
      const dam = Math.max(0, Math.round((i.qty - acc) * 1000) / 1000);
      if (dam > 0) totalDamaged += dam;
      i.accepted_qty = acc;
      i.damaged_qty = dam;
      i.damaged_note = inp && inp.note ? str(inp.note, 255) : '';

      const d = JSON.parse(i.data || '{}');
      let p = matchProduct({ ...d, name: d.name || i.name });
      if (!p) {
        // Kartochka nusxasi (rasm ham ko'chiriladi; shtrix-kod band bo'lsa — bo'sh)
        const barcode = d.barcode && !db.prepare('SELECT 1 FROM products WHERE barcode=? AND deleted_at IS NULL').get(d.barcode) ? d.barcode : '';
        const pid = Number(db.prepare(`INSERT INTO products (name,brand,category,volume,size,sku,barcode,unit,pack_name,box_qty,piece_price,box_price,cost_price,description,in_shop,image,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.name || i.name, d.brand || '', d.category || '', d.volume || '', d.size || '', d.sku || '', barcode,
          d.unit || 'dona', d.pack_name || 'karobka', d.box_qty || 1, d.piece_price || 0, d.box_price || 0, 0, d.description || '', d.in_shop ?? 1,
          copyImage(d.image, tr.from_branch, req.branch.id), t, t).lastInsertRowid);
        p = db.prepare('SELECT * FROM products WHERE id=?').get(pid);
        created++;
      }
      if (acc > 0) {
        if (i.cost > 0) updateCost(p, acc, i.cost);
        mv.run(p.id, acc, t, `Ko'chirish ${tr.number} ← ${tr.from_name}${dam > 0 ? ` (${acc}/${i.qty} qabul)` : ''}`, i.cost || null, tr.id, req.user.id, t);
      }
      dst.set(i.id, p.id);
    }
  })();
  main.transaction(() => {
    const up = main.prepare('UPDATE transfer_items SET dst_product_id=?, accepted_qty=?, damaged_qty=?, damaged_note=? WHERE id=?');
    for (const [iid, pid] of dst) {
      const item = items.find((x) => x.id === iid);
      up.run(pid, item ? item.accepted_qty : null, item ? item.damaged_qty : 0, item ? item.damaged_note : '', iid);
    }
    main.prepare("UPDATE transfers SET status='received', received_by=?, received_at=? WHERE id=?").run(actor(req), t, tr.id);
  })();
  audit(req, { action: 'receive', entity: 'transfer', entity_id: tr.id, summary: `Ko'chirish qabul qilindi ${tr.number} ← ${tr.from_name}: ${items.length} ta mahsulot${totalDamaged > 0 ? `, ${totalDamaged} ta kamomad/shikastlangan` : ''}${created ? `, ${created} ta yangi yaratildi` : ''}` });
  res.json({ ok: true, created, totalDamaged });
});

router.post('/:id/cancel', need('transfers.send'), (req, res) => {
  const tr = mine(req, req.params.id);
  if (tr.from_branch !== req.branch.id) throw httpError(403, 'Faqat jo\'natgan filial bekor qila oladi');
  if (tr.status !== 'sent') throw httpError(400, 'Faqat yo\'ldagi hujjatni bekor qilish mumkin');
  const t = now();
  db.prepare('UPDATE stock_moves SET deleted_at=? WHERE transfer_id=? AND deleted_at IS NULL AND qty_pieces<0').run(t, tr.id);
  main.prepare("UPDATE transfers SET status='cancelled', received_by=?, received_at=? WHERE id=?").run(actor(req), t, tr.id);
  audit(req, { action: 'cancel', entity: 'transfer', entity_id: tr.id, summary: `Ko'chirish bekor qilindi: ${tr.number} (tovar omborga qaytdi)` });
  res.json({ ok: true });
});

module.exports = { router };
