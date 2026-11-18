const express = require('express');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, normDate, normDay, httpError, audit, fmtMoney, nextNumber, registerFor, getSetting, currentBranchInfo } = require('../util');
const { recomputeClient, stockMap } = require('../ledger');
const { readItems, itemsTotal, pieces } = require('../items');
const { clientName } = require('./clients');
const { priceOf, activePromos, promoPercent, promoPrice } = require('../units');
const bonus = require('../bonus');

const router = express.Router();
const METHODS = ['cash', 'transfer', 'card', 'other'];

function getClient(id) {
  const c = db.prepare('SELECT * FROM clients WHERE id=? AND deleted_at IS NULL').get(int(id));
  if (!c) throw httpError(400, 'Mijozni tanlang');
  return c;
}

function stockWarnings(items, exceptSaleId = 0) {
  // Faqat savatdagi mahsulotlar qoldig'i olinadi
  const stock = stockMap([...new Set(items.map((i) => i.product_id).filter(Boolean))]);
  if (exceptSaleId) {
    // Tahrirlashda eski pozitsiyalar omborga "qaytgan" deb hisoblanadi
    for (const i of db.prepare(`SELECT i.* FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE i.sale_id=? AND s.status='confirmed' AND s.deleted_at IS NULL`).all(exceptSaleId)) {
      if (i.product_id) stock.set(i.product_id, (stock.get(i.product_id) || 0) + pieces(i));
    }
  }
  const need = new Map();
  for (const i of items) if (i.product_id) need.set(i.product_id, (need.get(i.product_id) || 0) + pieces(i));
  const w = [];
  const todayStr = new Date().toLocaleString('sv-SE').slice(0, 10);
  for (const [pid, n] of need) {
    const have = stock.get(pid) || 0;
    if (n > have) {
      const p = db.prepare('SELECT name FROM products WHERE id=?').get(pid);
      w.push(`${p.name}: omborda ${have} dona, sotuvda ${n} dona`);
    }
    const expBatch = db.prepare(`SELECT expires_at FROM stock_moves WHERE product_id=? AND deleted_at IS NULL AND qty_pieces>0 AND expires_at IS NOT NULL AND expires_at < ? LIMIT 1`).get(pid, todayStr);
    if (expBatch) {
      const p = db.prepare('SELECT name FROM products WHERE id=?').get(pid);
      w.push(`DIQQAT: ${p.name} mahsulotining muddati o'tgan partiyasi bor (${expBatch.expires_at})`);
    }
  }
  return w;
}

function insertItems(saleId, items) {
  const ins = db.prepare(`INSERT INTO sale_items (sale_id,product_id,name,color,unit,qty,box_qty,price,piece_price,box_price,total,base_unit,pack_name,cost,sku)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const i of items) ins.run(saleId, i.product_id, i.name, i.color || '', i.unit, i.qty, i.box_qty, i.price, i.piece_price, i.box_price, i.total, i.base_unit, i.pack_name, i.cost || 0, i.sku || '');
}

function saleSummary(saleId) {
  const s = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
  const c = db.prepare('SELECT balance FROM clients WHERE id=?').get(s.client_id);
  const direct = db.prepare(`SELECT COALESCE(SUM(a.amount),0) v FROM allocations a JOIN payments p ON p.id=a.payment_id
    WHERE a.sale_id=? AND p.sale_id=?`).get(saleId, saleId).v;
  return {
    total: s.total,
    balance_before: s.balance_before,
    paid_now: direct,
    from_advance: s.paid_amount - direct,
    debt: s.total - s.paid_amount,
    balance_after: c.balance,
  };
}

// --- Ro'yxat ---
router.get('/', (req, res) => {
  const where = ['s.deleted_at IS NULL'];
  const args = [];
  if (!can(req, 'sales.view')) { where.push('s.created_by=?'); args.push(req.user.id); }   // faqat o'zining sotuvlari
  const status = str(req.query.status);
  if (status === 'cancelled') where.push("s.status='cancelled'");
  else {
    where.push("s.status='confirmed'");
    if (status === 'unpaid') where.push('s.paid_amount=0 AND s.total>0');
    if (status === 'partial') where.push('s.paid_amount>0 AND s.paid_amount<s.total');
    if (status === 'paid') where.push('s.paid_amount>=s.total');
    if (status === 'debt') where.push('s.paid_amount<s.total');
  }
  if (req.query.client_id) { where.push('s.client_id=?'); args.push(int(req.query.client_id)); }
  if (req.query.user_id) { where.push('s.created_by=?'); args.push(int(req.query.user_id)); }
  if (req.query.register_id) { where.push('s.register_id=?'); args.push(int(req.query.register_id)); }
  if (req.query.from) { where.push('s.date>=?'); args.push(str(req.query.from) + ' 00:00:00'); }
  if (req.query.to) { where.push('s.date<=?'); args.push(str(req.query.to) + ' 23:59:59'); }
  const q = str(req.query.q);
  if (q) {
    where.push(`(s.number LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ? OR CAST(s.total AS TEXT) LIKE ?)`);
    const like = `%${q.replace(/\s/g, '%')}%`;
    args.push(like, like, like, `%${q.replace(/\D/g, '') || q}%`, `${q.replace(/\D/g, '') || q}%`);
  }
  const rows = db.prepare(`SELECT s.*, c.company_name, c.contact_name, c.phone,
      COALESCE(NULLIF(u.full_name,''), u.username) seller_name, r.name register_name,
      (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id=s.id) items_count
    FROM sales s JOIN clients c ON c.id=s.client_id LEFT JOIN users u ON u.id=s.created_by LEFT JOIN registers r ON r.id=s.register_id WHERE ${where.join(' AND ')}
    ORDER BY s.date DESC, s.id DESC LIMIT ?`).all(...args, Math.min(int(req.query.limit, 500), 5000));
  const bi = currentBranchInfo();
  for (const r of rows) {
    if (!r.branch_id) r.branch_id = bi.id;
    if (!r.branch_code) r.branch_code = bi.code;
    if (!r.branch_name) r.branch_name = bi.name;
  }
  // Jami — ko'rsatilgan qatorlardan emas, filtrga mos barcha sotuvlardan
  // (mijoz ustunlari faqat qidiruvda kerak — aks holda JOIN siz, indeksning o'zidan)
  const sum = db.prepare(`SELECT COALESCE(SUM(s.total),0) total, COALESCE(SUM(s.paid_amount),0) paid, COUNT(*) n
    FROM sales s ${q ? 'JOIN clients c ON c.id=s.client_id' : ''} WHERE ${where.join(' AND ')}`).get(...args);
  res.json({ rows, sum });
});

// --- Bitta sotuv (nakladnoy uchun to'liq ma'lumot) ---
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM sales WHERE id=?').get(req.params.id);
  if (!s) throw httpError(404, 'Sotuv topilmadi');
  if (!can(req, 'sales.view') && s.created_by !== req.user.id) throw httpError(403, "Bu amal uchun ruxsatingiz yo'q");
  s.items = db.prepare(`SELECT i.*, COALESCE(p.image, '') image,
      COALESCE(NULLIF(i.sku, ''), p.sku, p.barcode, '') sku,
      COALESCE(p.barcode, p.sku, '') barcode
    FROM sale_items i
    LEFT JOIN products p ON p.id=i.product_id
    WHERE i.sale_id=? ORDER BY i.id`).all(s.id);
  s.client = db.prepare('SELECT * FROM clients WHERE id=?').get(s.client_id);
  s.allocations = db.prepare(`SELECT a.*, p.method, p.date payment_date, p.sale_id direct_sale,
      COALESCE(NULLIF(u.full_name,''), u.username) user_name FROM allocations a
    JOIN payments p ON p.id=a.payment_id LEFT JOIN users u ON u.id=p.created_by WHERE a.sale_id=? ORDER BY a.date`).all(s.id);
  s.payments = db.prepare('SELECT * FROM payments WHERE sale_id=? AND deleted_at IS NULL ORDER BY date').all(s.id);
  s.audit = db.prepare(`SELECT at, user_name, action, summary FROM audit_log WHERE entity='sale' AND entity_id=? ORDER BY id DESC`).all(s.id);
  s.creator = s.created_by ? db.prepare('SELECT id, full_name, username, phone FROM users WHERE id=?').get(s.created_by) : null;
  s.closer = s.closed_by ? db.prepare('SELECT id, full_name, username, phone FROM users WHERE id=?').get(s.closed_by) : null;
  s.register = s.register_id ? db.prepare('SELECT id, name FROM registers WHERE id=?').get(s.register_id) : null;
  s.register_name = s.register ? s.register.name : (s.register_name || '');
  const bi = currentBranchInfo();
  s.branch_id = s.branch_id || bi.id;
  s.branch_code = s.branch_code || bi.code;
  s.branch_name = s.branch_name || bi.name;
  s.returns = db.prepare(`SELECT r.id, r.number, r.date, r.total, r.refund, r.note, COALESCE(NULLIF(u.full_name,''), u.username) user_name
    FROM sale_returns r LEFT JOIN users u ON u.id=r.created_by WHERE r.sale_id=? AND r.deleted_at IS NULL ORDER BY r.date`).all(s.id);
  if (s.status === 'confirmed' && !s.deleted_at) s.summary = saleSummary(s.id);
  res.json(s);
});

// Kassadagi cheklovlar: chegirma, narxni o'zgartirish, qarzga sotish — rol ruxsatlariga qarab
const NO = "Bu amal uchun ruxsatingiz yo'q";
function checkSalePerms(req, { kind, client, items, discount, total, payNow, trustedPrices }) {
  if (kind === 'opening') {
    if (!can(req, 'clients.edit')) throw httpError(403, NO);
    return;
  }
  if (discount > 0 && !can(req, 'sales.discount')) throw httpError(403, "Chegirma berish ruxsatingiz yo'q");
  if (!trustedPrices && !can(req, 'sales.price')) {
    const promos = activePromos(db);
    for (const i of items) {
      if (!i.product_id) throw httpError(403, `${i.name}: katalogda yo'q mahsulotni sotish uchun narxni o'zgartirish ruxsati kerak`);
      const p = db.prepare('SELECT id, category, piece_price, box_price, box_qty FROM products WHERE id=?').get(i.product_id);
      // Mijozning narx turi bo'yicha, amaldagi aksiya chegirmasi bilan
      const list = promoPrice(priceOf(db, p, client.price_level_id, i.unit), promoPercent(promos, p, pieces(i)));
      if (i.price < list) throw httpError(403, `${i.name}: narxni pasaytirish ruxsatingiz yo'q (katalog narxi ${fmtMoney(list)})`);
    }
  }
  // Qarzga: to'lov + mijozning avansi sotuv summasini yopmasa
  if (!can(req, 'sales.credit') && total > payNow + Math.max(0, client.balance)) throw httpError(403, "Qarzga sotish ruxsatingiz yo'q — to'liq to'lov oling");
}

// Sotuv vaqtidagi to'lov: { amount, method } yoki aralash to'lov uchun ro'yxat [{ amount, method }, ...]
function readPayNow(v) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.map((p) => ({ amount: Math.max(0, int(p && p.amount)), method: METHODS.includes(p && p.method) || (p && p.method) === 'bonus' ? p.method : 'cash' })).filter((p) => p.amount > 0);
}

// --- Yangi sotuv ---
// opts.trustedPrices: pozitsiyalar serverning o'zidan (masalan, mijoz buyurtmasidan) olingan — narx tekshirilmaydi
function createSale(req, b, opts = {}) {
  const client = getClient(b.client_id);
  const kind = b.kind === 'opening' ? 'opening' : 'sale';
  const items = kind === 'opening' ? [] : readItems(b.items);
  const discount = kind === 'opening' ? 0 : Math.min(Math.max(0, int(b.discount)), itemsTotal(items));   // chegirma jamidan oshmaydi
  const total = kind === 'opening' ? Math.max(0, int(b.total)) : itemsTotal(items) - discount;
  if (kind === 'opening' && !total) throw httpError(400, 'Qarz summasini kiriting');
  const pays = kind === 'opening' ? [] : readPayNow(b.pay_now);
  // Bonus bilan to'lov: mijozning bonusi va chegaradan oshmasligi kerak
  const bonusPay = pays.filter((p) => p.method === 'bonus').reduce((a, p) => a + p.amount, 0);
  if (bonusPay && bonusPay > bonus.maxSpend(client, total)) throw httpError(400, `Bonus bilan ko'pi bilan ${fmtMoney(bonus.maxSpend(client, total))} to'lash mumkin`);
  checkSalePerms(req, { kind, client, items, discount, total, payNow: pays.reduce((a, p) => a + p.amount, 0), trustedPrices: !!opts.trustedPrices });
  // Bitta KP dan faqat bitta amaldagi sotuv
  if (b.quote_id) {
    const q = db.prepare('SELECT q.id, q.number, s.number sale_number FROM quotes q LEFT JOIN sales s ON s.id=q.sale_id AND s.deleted_at IS NULL AND s.status=\'confirmed\' WHERE q.id=?').get(int(b.quote_id));
    if (q && q.sale_number) throw httpError(400, `${q.number} KP allaqachon sotuvga aylantirilgan (${q.sale_number})`);
  }
  const date = normDate(b.date);
  const t = now();
  const warnings = stockWarnings(items);
  // Omborda tugagan yoki yetarli bo'lmagan tovarlarni sotishga yo'l qo'yilmaydi (agar allow_negative_stock='1' bo'lmasa)
  if (getSetting('allow_negative_stock', '0') !== '1' && warnings.length > 0) {
    throw httpError(400, "Omborda yetarli mahsulot yo'q: " + warnings.join('; '));
  }
  const register = registerFor(req, b.register_id);
  // Sozlamada "smenasiz sotish mumkin emas" yoqilgan bo'lsa — kassada ochiq smena bo'lishi kerak
  if (getSetting('require_shift', '') === '1' && !db.prepare(`SELECT 1 FROM shifts WHERE closed_at IS NULL AND ${register ? 'register_id=?' : 'register_id IS NULL'}`).get(...(register ? [register] : []))) {
    throw httpError(400, 'Avval kassa smenasini oching');
  }

  // Tez yo'l (chakana kassa): mijozda qarz ham avans ham yo'q, sotuv eng oxirgi hodisa va o'z to'lovlari bilan to'liq yopiladi —
  // ledger natijasi oldindan ma'lum (to'liq qayta hisoblash bilan aynan bir xil), shuning uchun butun tarix qayta ko'rilmaydi.
  const paySum = pays.reduce((a, p) => a + p.amount, 0);
  const fast = kind === 'sale' && total > 0 && paySum === total && client.balance === 0 && !client.open_debts
    && (!client.last_activity || date >= client.last_activity);
  let id;
  const binfo = currentBranchInfo();
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO sales (number,kind,client_id,date,due_date,status,total,discount,note,order_id,quote_id,created_by,register_id,branch_id,branch_code,branch_name,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      nextNumber('sales', kind === 'opening' ? 'Q' : 'N'), kind, client.id, date, normDay(b.due_date),
      'confirmed', total, discount, str(b.note, 1000), b.order_id ? int(b.order_id) : null, b.quote_id ? int(b.quote_id) : null,
      req.user.id, register, binfo.id, binfo.code, binfo.name, t, t);
    id = r.lastInsertRowid;
    insertItems(id, items);
    const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    if (pids.length) {
      db.prepare(`UPDATE products SET updated_at=? WHERE id IN (${pids.map(() => '?').join(',')})`).run(t, ...pids);
    }

    for (const { amount: payNow, method } of pays) {
      const pid = db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,sale_id,note,created_by,register_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(client.id, 'in', method, payNow, date, id, 'Sotuv vaqtida to\'lov', req.user.id, register, t, t).lastInsertRowid;
      if (fast) db.prepare('INSERT INTO allocations (client_id,payment_id,sale_id,amount,date) VALUES (?,?,?,?,?)').run(client.id, pid, id, payNow, date);
    }
    if (fast) {
      db.prepare('UPDATE sales SET paid_amount=?, closed_at=?, closed_by=?, was_debt=0, balance_before=0 WHERE id=?').run(total, date, req.user.id, id);
      db.prepare('UPDATE clients SET last_activity=? WHERE id=?').run(date, client.id);
    }
    if (b.quote_id) db.prepare('UPDATE quotes SET sale_id=? WHERE id=?').run(id, int(b.quote_id));
    if (b.order_id) {
      const oid = int(b.order_id);
      const ord = db.prepare('SELECT order_uuid FROM orders WHERE id=?').get(oid);
      db.prepare("UPDATE orders SET status='confirmed', sale_id=?, processed_by=?, processed_at=?, updated_at=? WHERE id=?")
        .run(id, req.user.id, t, t, oid);
      if (ord && ord.order_uuid) {
        try {
          const { onOrderConfirmedAcrossBranches } = require('../shared_sync');
          const { currentBranchId } = require('../context');
          onOrderConfirmedAcrossBranches(currentBranchId(), ord.order_uuid, req.user ? req.user.name : '');
        } catch (e) {
          console.error('[sales] onOrderConfirmedAcrossBranches error:', e.message);
        }
      }
    }
  })();

  if (!fast) recomputeClient(client.id);
  const bonusRes = kind === 'sale' ? bonus.afterSale(client, id, total, pays) : { used: 0, earned: 0 };
  const sale = db.prepare('SELECT number FROM sales WHERE id=?').get(id);
  const summary = saleSummary(id);
  audit(req, {
    action: 'create', entity: 'sale', entity_id: id, client_id: client.id,
    summary: `${kind === 'opening' ? "Boshlang'ich qarz" : 'Sotuv'} ${sale.number}: ${fmtMoney(total)}`
      + (summary.from_advance ? `, avansdan yechildi ${fmtMoney(summary.from_advance)}` : '')
      + (summary.paid_now ? `, to'landi ${fmtMoney(summary.paid_now)}` : '')
      + (summary.debt ? `, qarzga ${fmtMoney(summary.debt)}` : ''),
    after: { client: clientName(client), total, items },
  });
  if (kind === 'sale') {
    const { syncStockDeltaAcrossBranches } = require('../shared_sync');
    const syncItems = items.filter((it) => it.product_id).map((it) => {
      const p = db.prepare('SELECT name, sku, barcode, unit, box_qty FROM products WHERE id=?').get(it.product_id);
      const boxQty = it.unit === 'karobka' ? (it.box_qty || (p && p.box_qty) || 1) : 1;
      const pcs = it.qty * boxQty;
      return {
        product_id: it.product_id,
        name: it.name || (p && p.name),
        sku: (p && p.sku) || it.code,
        barcode: (p && p.barcode) || it.barcode,
        unit: it.unit,
        deltaPieces: -pcs,
        note: `Sotuv (${binfo.name || 'Filial'}, Chek #${sale.number})`,
      };
    });
    syncStockDeltaAcrossBranches(binfo.id, syncItems);
  }
  return { id, number: sale.number, summary, warnings, bonus: bonusRes };
}

router.post('/', need('pos.use', 'sales.create'), (req, res) => res.json(createSale(req, req.body)));

// Ombor ogohlantirishlari (saqlashdan oldin tekshirish uchun)
router.post('/check-stock', (req, res) => {
  res.json({ warnings: stockWarnings(readItems(req.body.items, { allowEmpty: true }), int(req.body.sale_id)) });
});

// --- Tahrirlash ---
router.put('/:id', need('sales.edit'), (req, res) => {
  const old = db.prepare('SELECT * FROM sales WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!old) throw httpError(404, 'Sotuv topilmadi');
  const oldItems = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(old.id);
  const b = req.body;
  const client = getClient(b.client_id || old.client_id);
  const items = old.kind === 'opening' ? [] : readItems(b.items, { keep: new Set(oldItems.map((i) => i.product_id)) });
  // Tahrirlashda tannarx sotuv paytidagicha qoladi (hujjatda bor mahsulot uchun)
  const oldCost = new Map(oldItems.filter((i) => i.product_id).map((i) => [i.product_id, i.cost]));
  for (const i of items) if (oldCost.has(i.product_id)) i.cost = oldCost.get(i.product_id);
  // Yuborilmagan maydon o'zgarmaydi (o'chib ketmaydi)
  const discount = old.kind === 'opening' ? 0 : Math.min(Math.max(0, int('discount' in b ? b.discount : old.discount)), itemsTotal(items));
  const total = old.kind === 'opening' ? Math.max(0, int(b.total)) : itemsTotal(items) - discount;
  if (old.kind === 'opening' && !total) throw httpError(400, 'Qarz summasini kiriting');
  // Forma sanani daqiqagacha yuboradi: o'sha daqiqa bo'lsa — asl (soniyali) sana qoladi.
  // Aks holda sotuv vaqtidagi to'lov sotuvdan "keyin" bo'lib qolib, sotuv yopilgan qarzga aylanib qolardi.
  let date = normDate(b.date, old.date);
  if (date.slice(0, 16) === old.date.slice(0, 16)) date = old.date;
  const dueDate = 'due_date' in b ? normDay(b.due_date) : old.due_date;
  const note = 'note' in b ? str(b.note, 1000) : old.note;

  db.transaction(() => {
    db.prepare(`UPDATE sales SET client_id=?, date=?, due_date=?, total=?, discount=?, note=?, updated_at=? WHERE id=?`)
      .run(client.id, date, dueDate, total, discount, note, now(), old.id);
    // Sana o'zgarsa — sotuv vaqtida qilingan to'lov ham birga ko'chadi
    if (date !== old.date) db.prepare('UPDATE payments SET date=? WHERE sale_id=? AND date=? AND deleted_at IS NULL').run(date, old.id, old.date);
    db.prepare('DELETE FROM sale_items WHERE sale_id=?').run(old.id);
    insertItems(old.id, items);
    if (client.id !== old.client_id) {
      // To'g'ridan-to'g'ri shu sotuvga bog'langan to'lovlar ham yangi mijozga o'tadi
      db.prepare('UPDATE payments SET client_id=? WHERE sale_id=?').run(client.id, old.id);
    }
  })();

  recomputeClient(client.id);
  if (client.id !== old.client_id) recomputeClient(old.client_id);
  // Yagona ombor: tasdiqlangan sotuv tahrirlanuvchi bo'lsa delta sync
  if (old.status === 'confirmed') {
    try {
      const { isSharedEnabled, syncStockDeltaAcrossBranches } = require('../shared_sync');
      if (isSharedEnabled()) {
        // Eski pozitsiyalar: omborga qaytarish (+), yangi pozitsiyalar: ombordan olish (-)
        const oldPcs = new Map(oldItems.filter((i) => i.product_id).map((i) => {
          const bq = i.unit === 'karobka' ? (i.box_qty || 1) : 1;
          return [i.product_id, { pcs: i.qty * bq, name: i.name, sku: i.sku, barcode: i.barcode, unit: i.unit }];
        }));
        const newPcs = new Map(items.filter((i) => i.product_id).map((i) => {
          const bq = i.unit === 'karobka' ? (i.box_qty || 1) : 1;
          return [i.product_id, { pcs: i.qty * bq, name: i.name, sku: i.sku, barcode: i.barcode, unit: i.unit }];
        }));
        const allIds = new Set([...oldPcs.keys(), ...newPcs.keys()]);
        const syncItems = [];
        for (const pid of allIds) {
          const oldQ = oldPcs.get(pid);
          const newQ = newPcs.get(pid);
          const delta = (newQ ? -newQ.pcs : 0) - (oldQ ? -oldQ.pcs : 0);  // eski qaytariladi, yangi olinadi
          if (Math.abs(delta) > 1e-6) {
            const ref = newQ || oldQ;
            syncItems.push({ product_id: pid, name: ref.name, sku: ref.sku, barcode: ref.barcode, unit: ref.unit, deltaPieces: delta, note: `Sotuv ${old.number} tahrirlandi` });
          }
        }
        if (syncItems.length) syncStockDeltaAcrossBranches(req.branch ? req.branch.id : (old.branch_id || 0), syncItems);
      }
    } catch (e) {
      console.warn('[sales PUT] shared_sync xatolik:', e.message);
    }
  }
  audit(req, {
    action: 'update', entity: 'sale', entity_id: old.id, client_id: client.id,
    summary: `Sotuv ${old.number} tahrirlandi: ${fmtMoney(old.total)} → ${fmtMoney(total)}`,
    before: { total: old.total, date: old.date, client_id: old.client_id, items: oldItems },
    after: { total, client_id: client.id, items },
  });
  res.json({ ok: true, summary: old.status === 'confirmed' ? saleSummary(old.id) : null });
});

// Eslatma: sotuv bekor qilinsa / o'chirilsa, unga qilingan to'lov o'chmaydi — mijozning avansi bo'lib qoladi
// (pul haqiqatan kassaga tushgan; qaytarilsa — kassir "Chiqim" qiladi). Bu ataylab shunday.
function assertClientAlive(s) {
  if (db.prepare('SELECT deleted_at FROM clients WHERE id=?').get(s.client_id).deleted_at) throw httpError(400, "Mijoz o'chirilgan — avval mijozni Savatdan tiklang");
}
// Buyurtmadan yaratilgan sotuv: buyurtma boshqa sotuv bilan tasdiqlangan bo'lsa — tiklab bo'lmaydi (ikki marta hisob)
function orderGuard(s) {
  const o = s.order_id && db.prepare('SELECT * FROM orders WHERE id=?').get(s.order_id);
  if (o && o.sale_id && o.sale_id !== s.id) throw httpError(400, `Buyurtma #${o.id} boshqa sotuv bilan tasdiqlangan — bu sotuvni tiklab bo'lmaydi`);
  return o;
}
const relinkOrder = (o, s) => {
  if (o && !o.sale_id) {
    db.prepare("UPDATE orders SET status='confirmed', sale_id=?, updated_at=? WHERE id=?").run(s.id, now(), o.id);
    if (o.order_uuid) {
      try {
        const { onOrderConfirmedAcrossBranches } = require('../shared_sync');
        const { currentBranchId } = require('../context');
        onOrderConfirmedAcrossBranches(currentBranchId(), o.order_uuid, 'Sotuv');
      } catch {}
    }
  }
};

function setStatus(req, status, label) {
  const s = db.prepare('SELECT * FROM sales WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!s) throw httpError(404, 'Sotuv topilmadi');
  if (s.status === status) return s;
  let o = null;
  if (status === 'confirmed') { assertClientAlive(s); o = orderGuard(s); }
  db.transaction(() => {
    db.prepare('UPDATE sales SET status=?, updated_at=? WHERE id=?').run(status, now(), s.id);
    if (status === 'confirmed') relinkOrder(o, s);
    if (status === 'cancelled') bonus.onSaleVoid(s);   // yig'ilgan bonus olinadi, ishlatilgani qaytadi
    else bonus.onSaleRestore(s);
  })();
  recomputeClient(s.client_id);
  audit(req, { action: status === 'cancelled' ? 'cancel' : 'restore', entity: 'sale', entity_id: s.id, client_id: s.client_id, summary: `Sotuv ${s.number} ${label} (${fmtMoney(s.total)})` });
  const { syncStockDeltaAcrossBranches } = require('../shared_sync');
  const saleItems = db.prepare('SELECT i.*, p.name, p.sku, p.barcode FROM sale_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.sale_id=?').all(s.id);
  const syncItems = saleItems.filter((it) => it.product_id).map((it) => {
    const boxQty = it.unit === 'karobka' ? (it.box_qty || 1) : 1;
    const pcs = it.qty * boxQty;
    return {
      product_id: it.product_id,
      name: it.name,
      sku: it.sku,
      barcode: it.barcode,
      unit: it.unit,
      deltaPieces: status === 'cancelled' ? pcs : -pcs,
      note: `Sotuv ${s.number} ${label}`,
    };
  });
  syncStockDeltaAcrossBranches(req.branch ? req.branch.id : (s.branch_id || 0), syncItems);
  return s;
}

router.post('/:id/cancel', need('sales.cancel'), (req, res) => { setStatus(req, 'cancelled', 'bekor qilindi'); res.json({ ok: true }); });
router.post('/:id/uncancel', need('sales.cancel'), (req, res) => { setStatus(req, 'confirmed', 'qayta tiklandi'); res.json({ ok: true }); });

router.delete('/:id', need('sales.delete'), (req, res) => {
  const s = db.prepare('SELECT * FROM sales WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!s) throw httpError(404, 'Sotuv topilmadi');
  db.prepare('UPDATE sales SET deleted_at=? WHERE id=?').run(now(), s.id);
  bonus.onSaleVoid(s);
  recomputeClient(s.client_id);
  audit(req, { action: 'delete', entity: 'sale', entity_id: s.id, client_id: s.client_id, summary: `Sotuv ${s.number} o'chirildi (${fmtMoney(s.total)})`, before: s });
  if (s.status === 'confirmed') {
    const { syncStockDeltaAcrossBranches } = require('../shared_sync');
    const saleItems = db.prepare('SELECT i.*, p.name, p.sku, p.barcode FROM sale_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.sale_id=?').all(s.id);
    const syncItems = saleItems.filter((it) => it.product_id).map((it) => {
      const boxQty = it.unit === 'karobka' ? (it.box_qty || 1) : 1;
      const pcs = it.qty * boxQty;
      return {
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        barcode: it.barcode,
        unit: it.unit,
        deltaPieces: pcs,
        note: `Sotuv ${s.number} o'chirildi`,
      };
    });
    syncStockDeltaAcrossBranches(req.branch ? req.branch.id : (s.branch_id || 0), syncItems);
  }
  res.json({ ok: true });
});

router.post('/:id/restore', need('sales.delete'), (req, res) => {
  const s = db.prepare('SELECT * FROM sales WHERE id=? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!s) throw httpError(404, 'Topilmadi');
  assertClientAlive(s);
  const o = s.status === 'confirmed' ? orderGuard(s) : null;
  db.transaction(() => {
    db.prepare('UPDATE sales SET deleted_at=NULL WHERE id=?').run(s.id);
    if (s.status === 'confirmed') { relinkOrder(o, s); bonus.onSaleRestore(s); }
  })();
  recomputeClient(s.client_id);
  audit(req, { action: 'restore', entity: 'sale', entity_id: s.id, client_id: s.client_id, summary: `Sotuv ${s.number} tiklandi` });
  // Yagona ombor: tasdiqlangan sotuv tiklanuvchi bo'lsa, omborni kamaytirib sync qilamiz
  if (s.status === 'confirmed') {
    const { syncStockDeltaAcrossBranches } = require('../shared_sync');
    const saleItems = db.prepare('SELECT i.*, p.name, p.sku, p.barcode FROM sale_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.sale_id=?').all(s.id);
    const syncItems = saleItems.filter((it) => it.product_id).map((it) => {
      const boxQty = it.unit === 'karobka' ? (it.box_qty || 1) : 1;
      const pcs = it.qty * boxQty;
      return {
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        barcode: it.barcode,
        unit: it.unit,
        deltaPieces: -pcs,  // sotuv tiklanishi = ombor kamayishi
        note: `Sotuv ${s.number} tiklandi`,
      };
    });
    syncStockDeltaAcrossBranches(req.branch ? req.branch.id : (s.branch_id || 0), syncItems);
  }
  res.json({ ok: true });
});

module.exports = { router, createSale, stockWarnings, saleSummary };
