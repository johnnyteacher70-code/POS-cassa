// Filiallararo yagona ombor va umumiy mahsulotlar sinxronizatsiyasi
// Sozlama (business.shared_warehouse === '1') yoqilganda:
// 1. Mahsulotlar katalogi barcha filiallarga avtomatik sinxronlanadi (qo'shish, o'zgartirish, o'chirish)
// 2. Sklad astatkasi (qoldig'i) ikkisida / barcha faol filiallarda bitta (yagona) bo'ladi:
//    bitta filialda sotuv yoki kirim bo'lganda boshqa filiallarning omboridan ham avtomatik mos miqdorda kamayadi/oshadi.
// 3. Sotuvlar va moliya har bir filialda alohida hisob-kitob bo'ladi.
const fs = require('fs');
const path = require('path');
const business = require('./business');
const branches = require('./branches');
const { runInBranch } = require('./context');
const { openBranch, uploadsDir } = require('./branch_db');
const { now, str, normPhone } = require('./util');

function isSharedEnabled() {
  return business.get('shared_warehouse') === '1';
}

const PRODUCT_COLS = [
  'name', 'brand', 'volume', 'sku', 'piece_price', 'box_price', 'box_qty',
  'description', 'image', 'in_shop', 'active', 'category', 'size', 'audience',
  'unit', 'pack_name', 'barcode', 'cost_price', 'min_stock', 'usd_price', 'mxik', 'cost_usd',
];

// Mahsulotni maqsadli filialdan qidirish:
// 1) Barcode bo'yicha (eng aniq)
// 2) Nomi va o'lchov birligi bo'yicha
// 3) Sku bo'yicha (faqat barcode to'qnashuvi bo'lmasa)
function findProductInDb(db, p, includeDeleted = false) {
  const delSql = includeDeleted ? '' : ' AND deleted_at IS NULL';
  if (p.barcode && String(p.barcode).trim()) {
    const r = db.prepare(`SELECT * FROM products WHERE barcode=?${delSql}`).get(String(p.barcode).trim());
    if (r) return r;
  }
  if (p.name && String(p.name).trim()) {
    const r = db.prepare(`SELECT * FROM products WHERE lower(name)=lower(?) AND unit=?${delSql}`).get(String(p.name).trim(), p.unit || 'dona');
    if (r) return r;
  }
  if (p.sku && String(p.sku).trim()) {
    const r = db.prepare(`SELECT * FROM products WHERE sku=? AND sku<>''${delSql}`).get(String(p.sku).trim());
    if (r && (!p.barcode || !r.barcode || p.barcode === r.barcode)) return r;
  }
  return null;
}

// Rasmni manba filialidan nishon filialiga nusxalash
function copyProductImage(imgUrl, fromBranchId, toBranchId) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const m = /^\/uploads\/(\d+)\/([A-Za-z0-9._-]+)$/.exec(imgUrl);
  if (!m) return imgUrl;
  const srcFile = path.join(uploadsDir(fromBranchId), m[2]);
  const destDir = uploadsDir(toBranchId);
  const destFile = path.join(destDir, m[2]);
  try {
    fs.mkdirSync(destDir, { recursive: true });
    if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
      fs.copyFileSync(srcFile, destFile);
    }
    return `/uploads/${toBranchId}/${m[2]}`;
  } catch {
    return imgUrl;
  }
}

// Mahsulot ranglari (assortiment) va narx turlarini manbadan nishonga nusxalash
function copyProductColorsAndPrices(srcDb, destDb, srcProductId, destProductId) {
  if (!srcDb || !destDb || !srcProductId || !destProductId) return;
  try {
    const colors = srcDb.prepare('SELECT name, sort FROM product_colors WHERE product_id=? ORDER BY sort, id').all(srcProductId);
    if (colors && colors.length) {
      destDb.prepare('DELETE FROM product_colors WHERE product_id=?').run(destProductId);
      const insCol = destDb.prepare('INSERT INTO product_colors (product_id, name, sort) VALUES (?,?,?)');
      for (const c of colors) insCol.run(destProductId, c.name, c.sort);
    }
  } catch {}
  try {
    const prices = srcDb.prepare('SELECT kind, name, price, box_price FROM product_prices WHERE product_id=?').all(srcProductId);
    if (prices && prices.length) {
      destDb.prepare('DELETE FROM product_prices WHERE product_id=?').run(destProductId);
      const insPr = destDb.prepare('INSERT INTO product_prices (product_id, kind, name, price, box_price) VALUES (?,?,?,?,?)');
      for (const pr of prices) insPr.run(destProductId, pr.kind, pr.name, pr.price, pr.box_price);
    }
  } catch {}
}

// Bitta mahsulot o'zgarganda (qo'shilganda / yangilanganda / o'chirilganda) barcha boshqa filiallarga nusxalash
function syncProductAcrossBranches(sourceBranchId, productRow, { isDelete = false, syncStock = true } = {}) {
  if (!isSharedEnabled()) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== sourceBranchId);
  if (!allB.length) return;

  setImmediate(() => {
    const t = now();
    for (const b of allB) {
      try {
        runInBranch(b.id, () => {
          const db = openBranch(b.id);
          let existing = findProductInDb(db, productRow, false);
          if (!existing) existing = findProductInDb(db, productRow, true);

          if (isDelete) {
            if (existing) {
              db.prepare('UPDATE products SET deleted_at=?, updated_at=? WHERE id=?').run(t, t, existing.id);
            }
            return;
          }

          const img = copyProductImage(productRow.image, sourceBranchId, b.id);
          const vals = {};
          for (const c of PRODUCT_COLS) vals[c] = productRow[c] !== undefined ? productRow[c] : null;
          vals.image = img;
          vals.updated_at = t;
          let targetProductId = null;

          if (existing) {
            targetProductId = existing.id;
            const sets = PRODUCT_COLS.map((c) => `${c}=@${c}`).join(', ') + ', updated_at=@updated_at';
            const restoreSql = existing.deleted_at && !productRow.deleted_at ? ', deleted_at=NULL' : '';
            db.prepare(`UPDATE products SET ${sets}${restoreSql} WHERE id=@_id`).run({ ...vals, _id: existing.id });

            if (syncStock && productRow.stock_pieces !== undefined) {
              const curStock = Number(existing.stock_pieces || 0);
              const targetStock = Number(productRow.stock_pieces || 0);
              const diff = Math.round((targetStock - curStock) * 1000) / 1000;
              if (Math.abs(diff) > 1e-4) {
                db.prepare('INSERT INTO stock_moves (product_id, qty_pieces, date, note, cost, created_by, created_at) VALUES (?,?,?,?,?,1,?)')
                  .run(existing.id, diff, t, "Umumiy ombor sinxronizatsiyasi", productRow.cost_price || 0, t);
              }
            }
          } else {
            vals.created_at = t;
            const cols = [...PRODUCT_COLS, 'created_at', 'updated_at'];
            const ins = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
            targetProductId = ins.run(vals).lastInsertRowid;
            const initialStock = Number(productRow.stock_pieces || 0);
            if (syncStock && initialStock > 0) {
              db.prepare('INSERT INTO stock_moves (product_id, qty_pieces, date, note, cost, created_by, created_at) VALUES (?,?,?,?,?,1,?)')
                .run(targetProductId, initialStock, t, "Boshlang'ich ombor qoldig'i", productRow.cost_price || 0, t);
            }
          }

          if (targetProductId && productRow.id && sourceBranchId) {
            try {
              const srcDb = openBranch(sourceBranchId);
              copyProductColorsAndPrices(srcDb, db, productRow.id, targetProductId);
            } catch {}
          }
        });
      } catch (e) {
        console.warn(`[shared_sync] Mahsulotni filial ${b.id} ga sinxron qilishda xatolik:`, e.message);
      }
    }
  });
}

// Sotuv / qaytarish / bekor qilishda qoldiq (astatka) o'zgarishini barcha filiallarga tarqatish
// items: [{ product_id, sku, barcode, name, unit, deltaPieces, note }]
// deltaPieces: sotuvda manfiy (-20), bekor/qaytarishda musbat (+20)
function syncStockDeltaAcrossBranches(sourceBranchId, items) {
  if (!isSharedEnabled() || !items || !items.length) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== sourceBranchId);
  if (!allB.length) return;

  setImmediate(() => {
    const t = now();
    for (const b of allB) {
      try {
        runInBranch(b.id, () => {
          const db = openBranch(b.id);
          db.transaction(() => {
            for (const it of items) {
              const targetP = findProductInDb(db, it, false);
              if (!targetP) continue;
              const delta = Number(it.deltaPieces || 0);
              if (!delta) continue;
              db.prepare('INSERT INTO stock_moves (product_id, qty_pieces, date, note, cost, created_by, created_at) VALUES (?,?,?,?,?,1,?)')
                .run(targetP.id, delta, t, it.note || "Filiallararo umumiy ombor harakati", targetP.cost_price || 0, t);
            }
          })();
        });
      } catch (e) {
        console.warn(`[shared_sync] Qoldiqni filial ${b.id} ga sinxron qilishda xatolik:`, e.message);
      }
    }
  });
}

// Barcha filiallarning katalogi va ombor qoldiqlarini bir-biri bilan 100% to'liq tenglashtirish (startup va importda)
// Har bir tovarning qoldig'i (astatka) ikkisida / barcha faol filiallarda BITTA bo'ladi.
function syncAllBranchesCatalogAndStock() {
  if (!isSharedEnabled()) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active');
  if (allB.length < 2) return;

  const t = now();
  // 1. Barcha filiallarning mahsulotlarini yig'amiz
  // Eng to'liq mahsulot ma'lumoti va haqiqiy ombor qoldig'ini (stock_pieces > 0) aniqlaymiz
  const catalogMap = new Map();
  for (const b of allB) {
    runInBranch(b.id, () => {
      const db = openBranch(b.id);
      const rows = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL').all();
      for (const p of rows) {
        const key = p.barcode && p.barcode.trim()
          ? `b:${p.barcode.trim()}`
          : (p.name && p.name.trim() ? `n:${String(p.name).trim().toLowerCase()}:${p.unit || 'dona'}` : `s:${String(p.sku || '').trim()}`);

        if (!catalogMap.has(key)) {
          catalogMap.set(key, { ...p, _sourceBranchId: b.id });
        } else {
          const prev = catalogMap.get(key);
          const prevStock = Number(prev.stock_pieces || 0);
          const currStock = Number(p.stock_pieces || 0);

          // Qoldig'i bor yoki kattaroq bo'lganini / yangiroq versiyasini tanlaymiz
          const takeCurrent = (currStock > 0 && prevStock <= 0) ||
            (currStock > prevStock) ||
            (currStock === prevStock && String(p.updated_at || '') > String(prev.updated_at || ''));

          if (takeCurrent) {
            catalogMap.set(key, { ...p, _sourceBranchId: b.id });
          } else if (prevStock <= 0 && currStock <= 0 && Number(p.piece_price || 0) > Number(prev.piece_price || 0)) {
            catalogMap.set(key, { ...p, _sourceBranchId: b.id });
          }
        }
      }
    });
  }

  // 2. Har bir filialga mahsulotlarni to'liq kiritamiz va ombor qoldiqlarini 100% tenglashtiramiz
  for (const b of allB) {
    runInBranch(b.id, () => {
      const db = openBranch(b.id);
      db.transaction(() => {
        for (const [, p] of catalogMap.entries()) {
          let ex = findProductInDb(db, p, false);
          if (!ex) ex = findProductInDb(db, p, true);

          const img = copyProductImage(p.image, p._sourceBranchId, b.id);
          const vals = {};
          for (const c of PRODUCT_COLS) vals[c] = p[c] !== undefined ? p[c] : null;
          vals.image = img;
          vals.updated_at = t;
          const targetStock = Math.max(0, Number(p.stock_pieces || 0));
          let targetProductId = null;

          if (!ex) {
            // Yangi tovar — to'liq qo'shamiz
            vals.created_at = t;
            const cols = [...PRODUCT_COLS, 'created_at', 'updated_at'];
            const ins = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
            targetProductId = ins.run(vals).lastInsertRowid;
            if (targetStock > 0) {
              db.prepare('INSERT INTO stock_moves (product_id, qty_pieces, date, note, cost, created_by, created_at) VALUES (?,?,?,?,?,1,?)')
                .run(targetProductId, targetStock, t, "Boshlang'ich ombor qoldig'i", p.cost_price || 0, t);
            }
          } else {
            // Bor tovar — ma'lumotlarini to'liq yangilaymiz (tovarlar bitta ko'rinishi uchun).
            // Eslatma: mavjud ombor qoldig'i (ex.stock_pieces) qayta yozilmaydi — filialdagi haqiqiy sotuvlar saqlansin.
            targetProductId = ex.id;
            const sets = PRODUCT_COLS.map((c) => `${c}=@${c}`).join(', ') + ', updated_at=@updated_at';
            const restoreSql = ex.deleted_at && !p.deleted_at ? ', deleted_at=NULL' : '';
            db.prepare(`UPDATE products SET ${sets}${restoreSql} WHERE id=@_id`).run({ ...vals, _id: ex.id });
          }

          // Ranglar va narxlarni ham manba filialdan nusxalaymiz
          if (p._sourceBranchId && p._sourceBranchId !== b.id && targetProductId) {
            try {
              const srcDb = openBranch(p._sourceBranchId);
              copyProductColorsAndPrices(srcDb, db, p.id, targetProductId);
            } catch {}
          }
        }
      })();
    });
  }
}

// Katalogdan tushgan yangi buyurtmani barcha faol do'konlar (filiallar)ga yuborish
function syncNewOrderAcrossBranches({ sourceBranchId, orderUuid, client, items, total, note, source }) {
  if (!orderUuid) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== sourceBranchId);
  const t = now();
  const phoneNorm = normPhone(client.phone || client.phone2 || '');

  for (const b of allB) {
    try {
      runInBranch(b.id, () => {
        const destDb = openBranch(b.id);

        // 1. Mijozni qidirish yoki alohida buxgalteriya/hisob uchun yangidan yaratish
        let destClient = null;
        if (phoneNorm) {
          destClient = destDb.prepare("SELECT * FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?)").get(phoneNorm, phoneNorm);
        }
        if (!destClient) {
          const insC = destDb.prepare(`
            INSERT INTO clients (
              type, contact_name, company_name, phone, phone2, address, note, self_registered, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?)
          `);
          const cid = insC.run(
            client.type || 'b2c',
            client.contact_name || client.name || 'Mijoz',
            client.company_name || '',
            phoneNorm || client.phone || '',
            client.phone2 || '',
            client.address || '',
            client.note ? `${client.note} (Katalog)` : 'Katalog buyurtmasi',
            t,
            t
          ).lastInsertRowid;
          destClient = destDb.prepare('SELECT * FROM clients WHERE id=?').get(cid);
        }
        if (!destClient) return;

        // 2. Buyurtma allaqachon mavjud emasligini tekshirish
        const existingOrder = destDb.prepare("SELECT id FROM orders WHERE order_uuid=?").get(orderUuid);
        if (existingOrder) return;

        // 3. Nishon filialda buyurtma va tovarlarni saqlash
        destDb.transaction(() => {
          const insOrder = destDb.prepare(`
            INSERT INTO orders (client_id, order_uuid, status, total, note, source, created_at, updated_at)
            VALUES (?, ?, 'new', ?, ?, ?, ?, ?)
          `);
          const newOrderId = insOrder.run(destClient.id, orderUuid, total, str(note, 1000), source || 'web', t, t).lastInsertRowid;

          const insItem = destDb.prepare(`
            INSERT INTO order_items (order_id, product_id, name, color, unit, qty, box_qty, price, total, base_unit, pack_name, sku)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const it of items) {
            const pMatch = findProductInDb(destDb, it, false);
            const pid = pMatch ? pMatch.id : null;
            insItem.run(
              newOrderId,
              pid,
              it.name,
              it.color || '',
              it.unit || 'dona',
              it.qty,
              it.box_qty || 1,
              it.price,
              it.total,
              it.base_unit || '',
              it.pack_name || '',
              it.sku || (pMatch ? pMatch.sku : '') || ''
            );
          }

          try {
            destDb.prepare(`
              INSERT INTO audit_log (at, user_name, action, entity, entity_id, client_id, summary)
              VALUES (?, 'Katalog (Umumiy)', 'create', 'order', ?, ?, ?)
            `).run(t, newOrderId, destClient.id, `Yangi buyurtma #${newOrderId}: ${total} so'm (Ikkala do'konga kelib tushdi)`);
          } catch {}
        })();
      });
    } catch (e) {
      console.error(`[shared_sync] syncNewOrderAcrossBranches error in branch ${b.id}:`, e.message);
    }
  }
}

// Qaysi do'kon buyurtmani tasdiqlasa, nargi (boshqa) do'konlardan olib tashlash (korinmasin va faqat tasdiqlagan do'konda qolsin)
function onOrderConfirmedAcrossBranches(sourceBranchId, orderUuid, confirmedByInfo = '') {
  if (!orderUuid) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== sourceBranchId);
  const t = now();
  const sourceName = branches.getBranch(sourceBranchId)?.name || `Filial #${sourceBranchId}`;

  for (const b of allB) {
    try {
      runInBranch(b.id, () => {
        const destDb = openBranch(b.id);
        const order = destDb.prepare("SELECT * FROM orders WHERE order_uuid=? AND deleted_at IS NULL").get(orderUuid);
        if (!order) return;

        // Boshqa do'konda qabul qilindi — bu do'kondan olib tashlaymiz
        destDb.prepare(`
          UPDATE orders SET
            status='cancelled',
            admin_note=COALESCE(NULLIF(admin_note, '') || ' | ', '') || ?,
            deleted_at=?,
            updated_at=?
          WHERE id=?
        `).run(`Boshqa do'konda qabul qilindi (${sourceName})`, t, t, order.id);

        try {
          destDb.prepare(`
            INSERT INTO audit_log (at, user_name, action, entity, entity_id, client_id, summary)
            VALUES (?, 'Tizim', 'cancel', 'order', ?, ?, ?)
          `).run(t, order.id, order.client_id, `Buyurtma #${order.id} ${sourceName} tomonidan qabul qilingani sababli ro'yxatdan olib tashlandi`);
        } catch {}
      });
    } catch (e) {
      console.error(`[shared_sync] onOrderConfirmedAcrossBranches error in branch ${b.id}:`, e.message);
    }
  }
}

// Agar mijoz saytda buyurtmani bekor qilsa
function onOrderCancelledAcrossBranches(sourceBranchId, orderUuid) {
  if (!orderUuid) return;
  const allB = branches.allBranches().filter((b) => b.status === 'active' && b.id !== sourceBranchId);
  const t = now();

  for (const b of allB) {
    try {
      runInBranch(b.id, () => {
        const destDb = openBranch(b.id);
        destDb.prepare(`
          UPDATE orders SET status='cancelled', updated_at=?
          WHERE order_uuid=? AND status='new' AND deleted_at IS NULL
        `).run(t, orderUuid);
      });
    } catch (e) {
      console.error(`[shared_sync] onOrderCancelledAcrossBranches error in branch ${b.id}:`, e.message);
    }
  }
}

module.exports = {
  isSharedEnabled,
  findProductInDb,
  syncProductAcrossBranches,
  syncStockDeltaAcrossBranches,
  syncAllBranchesCatalogAndStock,
  syncNewOrderAcrossBranches,
  onOrderConfirmedAcrossBranches,
  onOrderCancelledAcrossBranches,
};
