const path = require('path');
const Database = require(path.resolve('node_modules/better-sqlite3'));

const branchDbPath = path.resolve('data/branches/3/app.db');
const mainDbPath = path.resolve('data/main.db');

const db = new Database(branchDbPath);
const main = new Database(mainDbPath);

console.log('--- STARTING DEMO DATA ENRICHMENT FOR LA CHERRY (BRANCH 3) ---');

// Helper for dates
function dayOffset(daysAgo, hour = 11, minute = 30) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hour)}:${pad(minute)}:00`;
}

function dateOnly(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const nowStr = dayOffset(0, 11, 45);

db.transaction(() => {
  // ============================================================
  // 1. AKSIYALAR (PROMOTIONS)
  // ============================================================
  console.log('1. Populating Promotions...');
  const insPromo = db.prepare(`
    INSERT INTO promotions (name, percent, scope, target, min_qty, date_from, date_to, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  
  if (db.prepare('SELECT count(*) as c FROM promotions').get().c === 0) {
    insPromo.run('Yozgi yakuniy chegirmalar -10%', 10.0, 'all', '', 0, '2026-11-01', '2026-12-15', nowStr);
    insPromo.run('2 ta atir xaridiga -15%', 15.0, 'category', 'Atir', 2, '2026-11-01', '2026-12-31', nowStr);
    insPromo.run('CeraVe va La Roche kremlari -8%', 8.0, 'category', 'Yuz parvarishi', 1, '2026-11-05', '2026-11-30', nowStr);
    insPromo.run('VIP mijozlar uchun -12%', 12.0, 'all', '', 0, '2026-11-10', '2026-12-31', nowStr);
    insPromo.run('Sovg\'a to\'plamlariga bayramona -20%', 20.0, 'category', 'Sovg\'a to\'plamlari', 1, '2026-11-15', '2027-01-10', nowStr);
  }

  // ============================================================
  // 2. SHARHLAR (PRODUCT REVIEWS)
  // ============================================================
  console.log('2. Populating Product Reviews...');
  const products = db.prepare('SELECT id, name FROM products WHERE deleted_at IS NULL LIMIT 25').all();
  const clients = db.prepare('SELECT id, coalesce(contact_name, company_name) as name FROM clients WHERE deleted_at IS NULL LIMIT 20').all();
  
  const reviewsData = [
    { rating: 5, text: "Juda yoqdi, ifori 2 kungacha turadi! Hammaga tavsiya qilaman." },
    { rating: 5, text: "Sifati a'lo, original ekan. Qadoqlanishi ham juda chiroyli." },
    { rating: 5, text: "Ikkinchi marta xarid qildim, do'kon xodimlariga kattakon rahmat!" },
    { rating: 4, text: "Ajoyib mahsulot, faqat yetkazib berish 1 kunga kechikdi." },
    { rating: 5, text: "Xotinimga sovg'aga olgandim, juda xursand bo'ldi. Rahmat!" },
    { rating: 4, text: "Yaxshi sifatli, lekin narxi biroz qimmatroq. Biroq arziydi." },
    { rating: 5, text: "Krem terimni yumshoq qildi, alergiyaga moyil terimga ham to'g'ri keldi." },
    { rating: 5, text: "Tom Ford atirlari orasida eng yoqqani shu bo'ldi. Tavsiya qilaman." },
    { rating: 4, text: "Hidi o'rtacha yoqimli, 6-7 soat turar ekan." },
    { rating: 5, text: "Do'konga borib olgandim, qizlar chiroyli qilib paketlab berishdi." }
  ];

  const insReview = db.prepare(`
    INSERT INTO product_reviews (product_id, client_id, rating, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM product_reviews').get().c === 0 && products.length && clients.length) {
    for (let i = 0; i < 25; i++) {
      const p = products[i % products.length];
      const c = clients[i % clients.length];
      const r = reviewsData[i % reviewsData.length];
      const revDate = dayOffset(i * 2 + 1, 14, 20);
      insReview.run(p.id, c.id, r.rating, r.text, revDate, revDate);
    }
  }

  // ============================================================
  // 3. KASSA SMENALARI (SHIFTS)
  // ============================================================
  console.log('3. Populating Cash Shifts...');
  const insShift = db.prepare(`
    INSERT INTO shifts (register_id, user_id, opened_at, opening_cash, closed_at, closed_by, closing_cash, expected_cash, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Close any orphan shift #1
  db.prepare(`
    UPDATE shifts SET closed_at = '2026-10-12 21:00:00', closed_by = 5, closing_cash = 1850000, expected_cash = 1850000, note = 'Birinchi smena yopildi'
    WHERE id = 1 AND closed_at IS NULL
  `).run();

  if (db.prepare('SELECT count(*) as c FROM shifts').get().c <= 1) {
    for (let d = 14; d >= 1; d--) {
      const openTime = dayOffset(d, 8, 45);
      const closeTime = dayOffset(d, 21, 15);
      const openCash = 400000;
      const dailyCashSales = 1200000 + (d * 75000);
      const expectedCash = openCash + dailyCashSales;
      const closingCash = expectedCash; // perfect match
      const cashierId = (d % 2 === 0) ? 2 : 3; // Ali or Vali
      insShift.run(
        1, cashierId, openTime, openCash, closeTime, cashierId, closingCash, expectedCash,
        `Kunlik kassa smenasi muvaffaqiyatli topshirildi. Z-hisobot olingan.`
      );
    }
    // Bugungi faol (ochiq) smena
    insShift.run(1, 4, dayOffset(0, 8, 50), 500000, null, null, null, null, 'Bugungi faol kassa smenasi');
  }

  // ============================================================
  // 4. DAVOMAT VA ISH VAQTI (ATTENDANCE)
  // ============================================================
  console.log('4. Populating Staff Attendance...');
  const insAtt = db.prepare(`
    INSERT INTO attendance (user_id, date, in_at, out_at)
    VALUES (?, ?, ?, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM attendance').get().c <= 1) {
    const staffIds = [2, 3, 4]; // Ali, Vali, Dilnoza
    for (let d = 14; d >= 1; d--) {
      const dt = dateOnly(d);
      for (const uid of staffIds) {
        // Skip occasional Sunday
        if (d % 7 === 0 && uid === 2) continue;
        const inAt = dayOffset(d, 8, 45 + (uid * 2));
        const outAt = dayOffset(d, 20, 30 + (uid * 3));
        insAtt.run(uid, dt, inAt, outAt);
      }
    }
  }

  // ============================================================
  // 5. QO'SHNILAR (PARTNER LOANS)
  // ============================================================
  console.log('5. Populating Partner Store Loans...');
  const insLoan = db.prepare(`
    INSERT INTO partner_loans (partner_name, partner_phone, type, status, total_amount, paid_amount, note, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insLoanItem = db.prepare(`
    INSERT INTO partner_loan_items (loan_id, product_id, name, color, unit, qty_initial, qty_returned_goods, qty_paid_money, price, total)
    VALUES (?, ?, ?, ?, 'dona', ?, ?, ?, ?, ?)
  `);
  const insLoanAct = db.prepare(`
    INSERT INTO partner_loan_actions (loan_id, item_id, action_type, qty, amount, register_id, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM partner_loans').get().c <= 2) {
    // 1) Parfume House (Berilgan tovar)
    const l1 = insLoan.run(
      'Parfume House (12-do\'kon)', '+998 97 712 34 56', 'give', 'partial', 580000, 150000,
      'Qo\'shni do\'konga so\'rov bo\'yicha atirlar berildi', dayOffset(5, 11), dayOffset(5, 11)
    ).lastInsertRowid;
    const it1 = insLoanItem.run(l1, 1, 'Baccarat Rouge 540', 'Original 70ml', 2, 0, 0, 290000, 580000).lastInsertRowid;
    insLoanAct.run(l1, it1, 'pay_money', 0, 150000, 1, 'Qisman naqd pul berdi', dayOffset(3, 16));

    // 2) Beauty Bar Cosm (Olingan tovar)
    const l2 = insLoan.run(
      'Beauty Bar Cosm (08-do\'kon)', '+998 90 980 11 22', 'take', 'open', 340000, 0,
      'Mijoz talabiga ko\'ra CeraVe kremlari olib turildi', dayOffset(3, 15), dayOffset(3, 15)
    ).lastInsertRowid;
    insLoanItem.run(l2, 2, 'CeraVe Namlovchi krem', '52 ml', 2, 0, 0, 170000, 340000);

    // 3) Safiya Parfumeriya (Yopilgan oldi-berdi)
    const l3 = insLoan.run(
      'Safiya Parfumeriya (03-do\'kon)', '+998 93 555 44 33', 'give', 'closed', 450000, 450000,
      'Dior Sauvage atiri berilgan edi, to\'liq hisob-kitob qilindi', dayOffset(8, 12), dayOffset(6, 17)
    ).lastInsertRowid;
    const it3 = insLoanItem.run(l3, 3, 'Dior Sauvage Parfum', '60ml', 1, 0, 1, 450000, 450000).lastInsertRowid;
    insLoanAct.run(l3, it3, 'pay_money', 1, 450000, 1, 'To\'liq pulini to\'lab berdi', dayOffset(6, 17));
  }

  // ============================================================
  // 6. YETKAZIB BERUVCHILAR VA XARIDLAR (SUPPLIERS & PURCHASES)
  // ============================================================
  console.log('6. Populating Suppliers and Purchases...');
  const insSup = db.prepare(`INSERT INTO suppliers (name, phone, created_at, updated_at) VALUES (?, ?, ?, ?)`);
  
  let sDubai = db.prepare("SELECT id FROM suppliers WHERE name LIKE '%Dubai%'").get()?.id;
  if (!sDubai) sDubai = insSup.run('Dubai Perfume & Fragrances FZE', '+998901112233', nowStr, nowStr).lastInsertRowid;
  
  let sLoreal = db.prepare("SELECT id FROM suppliers WHERE name LIKE '%Oreal%'").get()?.id;
  if (!sLoreal) sLoreal = insSup.run("L'Oreal Paris Uzbekistan Distribyutsiya", '+998902223344', nowStr, nowStr).lastInsertRowid;

  let sKorea = db.prepare("SELECT id FROM suppliers WHERE name LIKE '%Koreya%'").get()?.id;
  if (!sKorea) sKorea = insSup.run('Koreya Premium Cosmetics LLC', '+998903334455', nowStr, nowStr).lastInsertRowid;

  const insPO = db.prepare(`
    INSERT INTO purchase_orders (number, supplier_id, date, status, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  const insPOItem = db.prepare(`
    INSERT INTO purchase_order_items (order_id, product_id, unit, qty, price)
    VALUES (?, ?, 'dona', ?, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM purchase_orders').get().c === 0) {
    const po1 = insPO.run('PO-2026-001', sDubai, dateOnly(12), 'received', 'Dubaydan bayram oldi yangi partiya', dayOffset(12, 10)).lastInsertRowid;
    insPOItem.run(po1, 1, 20, 220000);
    insPOItem.run(po1, 2, 15, 180000);

    const po2 = insPO.run('PO-2026-002', sLoreal, dateOnly(5), 'confirmed', 'Loreal kremlari va tonal vositalar buyurtmasi', dayOffset(5, 11)).lastInsertRowid;
    insPOItem.run(po2, 3, 30, 95000);

    const po3 = insPO.run('PO-2026-003', sKorea, dateOnly(1), 'pending', 'Koreys zardoblari va niqoblari partiyasi', dayOffset(1, 14)).lastInsertRowid;
    insPOItem.run(po3, 4, 50, 110000);
  }

  // ============================================================
  // 7. XARAJATLAR (EXPENSES)
  // ============================================================
  console.log('7. Populating November Expenses...');
  const insExp = db.prepare(`
    INSERT INTO expenses (category_id, register_id, amount, date, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  const expData = [
    { cat: 1, amt: 4500000, daysAgo: 17, note: 'Noyabr oyi do\'kon binosi ijara to\'lovi' },
    { cat: 6, amt: 1200000, daysAgo: 14, note: 'Instagram va Telegramda reklama kampaniyasi' },
    { cat: 7, amt: 650000, daysAgo: 10, note: 'Firma logotipli paketlar va sovg\'a lentalari' },
    { cat: 4, amt: 450000, daysAgo: 7, note: 'Kuryerlik va viloyatlarga BTS pochta yetkazish' },
    { cat: 3, amt: 380000, daysAgo: 4, note: 'Elektr energiyasi va kommunal xizmatlar' },
    { cat: 7, amt: 290000, daysAgo: 2, note: 'Do\'kon tozaligi uchun ximikatlar va kantselyariya' },
    { cat: 8, amt: 350000, daysAgo: 1, note: 'Xodimlar uchun tushlik va qahva' }
  ];

  const novExpCount = db.prepare("SELECT count(*) as c FROM expenses WHERE date >= '2026-11-01'").get().c;
  if (novExpCount === 0) {
    for (const e of expData) {
      const dt = dayOffset(e.daysAgo, 15, 0);
      insExp.run(e.cat, 1, e.amt, dt, e.note, dt);
    }
  }

  // ============================================================
  // 8. KATALOG BUYURTMALARI (ORDERS)
  // ============================================================
  console.log('8. Populating Catalog Orders...');
  const insOrd = db.prepare(`
    INSERT INTO orders (client_id, status, total, note, admin_note, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'web', ?, ?)
  `);
  const insOrdItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, unit, qty, box_qty, price, total, color, base_unit, pack_name, sku)
    VALUES (?, ?, ?, 'dona', ?, 1, ?, ?, '', 'dona', 'dona', ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM orders').get().c <= 6 && clients.length && products.length) {
    const ordersToAdd = [
      { cid: clients[0].id, st: 'new', note: 'Chilonzor 9-mavze, 12-uy. Iltimos soat 18:00 dan keyin olib keling', adm: '', daysAgo: 0, items: [{ pid: products[0].id, qty: 1, price: 320000 }] },
      { cid: clients[1].id, st: 'new', note: 'Yunusobod 4-mavze. Qadoqlash sovg\'a formatida bo\'lsin', adm: '', daysAgo: 0, items: [{ pid: products[1].id, qty: 2, price: 210000 }] },
      { cid: clients[2].id, st: 'approved', note: 'Mirzo Ulug\'bek tumani, TTZ. Kuryer yetkazmoqda', adm: 'Kuryer Jahongirga topshirildi', daysAgo: 1, items: [{ pid: products[2].id, qty: 1, price: 450000 }] },
      { cid: clients[3].id, st: 'approved', note: 'Sergeli 7-mavze. Click orqali to\'landi', adm: 'To\'lov tushgan, qadoqlangan', daysAgo: 2, items: [{ pid: products[3].id, qty: 1, price: 280000 }, { pid: products[4].id, qty: 1, price: 150000 }] },
      { cid: clients[4].id, st: 'completed', note: 'Do\'kondan o\'zim olib ketaman', adm: 'Mijoz qabul qilib oldi', daysAgo: 4, items: [{ pid: products[0].id, qty: 2, price: 320000 }] },
      { cid: clients[5].id, st: 'completed', note: 'Yetkazib berildi, mijoz rozi', adm: 'Yetkazildi', daysAgo: 6, items: [{ pid: products[1].id, qty: 1, price: 210000 }] },
      { cid: clients[6].id, st: 'rejected', note: 'Mijoz telefoniga javob bermadi, bekor qilindi', adm: 'Qayta aloqaga chiqmadi', daysAgo: 5, items: [{ pid: products[2].id, qty: 1, price: 450000 }] }
    ];

    for (const o of ordersToAdd) {
      const tot = o.items.reduce((s, it) => s + (it.qty * it.price), 0);
      const dt = dayOffset(o.daysAgo, 16, 20);
      const oid = insOrd.run(o.cid, o.st, tot, o.note, o.adm, dt, dt).lastInsertRowid;
      for (const it of o.items) {
        const prod = products.find(p => p.id === it.pid) || products[0];
        insOrdItem.run(oid, prod.id, prod.name, it.qty, it.price, it.qty * it.price, 'KOS-DEMO');
      }
    }
  }

  // ============================================================
  // 9. TIJORAT TAKLIFLARI (QUOTES - KP)
  // ============================================================
  console.log('9. Populating Commercial Proposals (Quotes)...');
  const insQuote = db.prepare(`
    INSERT INTO quotes (number, client_id, client_name, date, valid_until, total, discount, note, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insQuoteItem = db.prepare(`
    INSERT INTO quote_items (quote_id, product_id, name, unit, qty, price, total)
    VALUES (?, ?, ?, 'dona', ?, ?, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM quotes').get().c <= 6 && clients.length && products.length) {
    const quotesData = [
      { num: 'KP-2026-007', cname: 'Beauty Salon "Zilola"', daysAgo: 3, validDays: 14, items: [{ pid: products[0].id, qty: 10, price: 280000 }, { pid: products[1].id, qty: 15, price: 180000 }] },
      { num: 'KP-2026-008', cname: 'Korporativ 8-Mart Sovg\'alari OOO', daysAgo: 7, validDays: 30, items: [{ pid: products[2].id, qty: 25, price: 390000 }] },
      { num: 'KP-2026-009', cname: 'Pardozchilar Maktabi "Glamour"', daysAgo: 11, validDays: 10, items: [{ pid: products[3].id, qty: 12, price: 130000 }, { pid: products[4].id, qty: 12, price: 110000 }] }
    ];

    for (const q of quotesData) {
      const dt = dateOnly(q.daysAgo);
      const valDt = dateOnly(q.daysAgo - q.validDays);
      const tot = q.items.reduce((s, it) => s + (it.qty * it.price), 0);
      const qid = insQuote.run(q.num, clients[0].id, q.cname, dt, valDt, tot, 5, 'Maxsus chegirma va bepul yetkazish sharti bilan', dayOffset(q.daysAgo), dayOffset(q.daysAgo)).lastInsertRowid;
      for (const it of q.items) {
        const prod = products.find(p => p.id === it.pid) || products[0];
        insQuoteItem.run(qid, prod.id, prod.name, it.qty, it.price, it.qty * it.price);
      }
    }
  }

  // ============================================================
  // 10. BONUS MOVES (LOYALTY SYSTEM)
  // ============================================================
  console.log('10. Populating Bonus Moves...');
  const insBonus = db.prepare(`
    INSERT INTO bonus_moves (client_id, sale_id, amount, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  if (db.prepare('SELECT count(*) as c FROM bonus_moves').get().c === 0 && clients.length) {
    for (let i = 0; i < 10; i++) {
      const c = clients[i % clients.length];
      const isSpend = (i % 3 === 0);
      const amt = isSpend ? -25000 : 35000;
      const note = isSpend ? 'POS kassada xarid uchun bonus ishlatildi' : 'Xariddan keshbek (3%) bonus hisoblandi';
      insBonus.run(c.id, null, amt, note, dayOffset(i * 2 + 1, 15, 30));
    }
  }

  // ============================================================
  // 11. NOYABR OYI REJALI SOTUVLARI (RECENT SALES & GRAPHS)
  // ============================================================
  console.log('11. Populating November Sales and Ledger...');
  const insSale = db.prepare(`
    INSERT INTO sales (number, client_id, register_id, created_by, date, total, status, note, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, 'confirmed', ?, ?, ?)
  `);
  const insSaleItem = db.prepare(`
    INSERT INTO sale_items (sale_id, product_id, name, unit, qty, price, total)
    VALUES (?, ?, ?, 'dona', ?, ?, ?)
  `);
  const insPay = db.prepare(`
    INSERT INTO payments (client_id, sale_id, register_id, direction, amount, method, date, note, created_by, created_at, updated_at)
    VALUES (?, ?, 1, 'in', ?, ?, ?, ?, ?, ?, ?)
  `);

  const novSalesCount = db.prepare("SELECT count(*) as c FROM sales WHERE date >= '2026-11-10'").get().c;
  if (novSalesCount < 10 && products.length && clients.length) {
    // Add sales for past 8 days (from Nov 11 to Nov 18)
    for (let d = 8; d >= 0; d--) {
      const dailySalesCount = 2 + (d % 3); // 2 to 4 sales per day
      for (let s = 1; s <= dailySalesCount; s++) {
        const saleTime = dayOffset(d, 10 + s * 3, 15 + s * 10);
        const client = clients[(d * 3 + s) % clients.length];
        const cashierId = (s % 2 === 0) ? 2 : 3;
        const p1 = products[(d + s) % products.length];
        const p2 = products[(d + s + 3) % products.length];
        const price1 = 150000 + (s * 35000);
        const price2 = 95000 + (s * 20000);
        const total = price1 + price2;

        const saleNum = `S2611-${String(d * 10 + s).padStart(3, '0')}`;
        const saleId = insSale.run(saleNum, client.id, cashierId, saleTime, total, 'Do\'kondan kassa orqali sotuv', saleTime, saleTime).lastInsertRowid;
        
        insSaleItem.run(saleId, p1.id, p1.name, 1, price1, price1);
        insSaleItem.run(saleId, p2.id, p2.name, 1, price2, price2);

        // Payment (Cash, Card, or partial)
        const payMethod = (s === 1) ? 'cash' : (s === 2 ? 'uzcard' : 'humo');
        insPay.run(client.id, saleId, total, payMethod, saleTime, `Sotuv #${saleNum} uchun to'lov`, cashierId, saleTime, saleTime);
      }
    }
  }

})(); // end branch db transaction

// ============================================================
// 12. FILIALLARARO KO'CHIRISH (TRANSFERS IN MAIN.DB)
// ============================================================
console.log('12. Populating Inter-Branch Transfers in main.db...');
main.transaction(() => {
  if (main.prepare('SELECT count(*) as c FROM transfers').get().c === 0) {
    const insTr = main.prepare(`
      INSERT INTO transfers (number, from_branch, to_branch, from_name, to_name, status, note, total_cost, sent_by, sent_at, received_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insTrItem = main.prepare(`
      INSERT INTO transfer_items (transfer_id, src_product_id, dst_product_id, name, data, qty, cost, accepted_qty, damaged_qty, damaged_note)
      VALUES (?, ?, ?, ?, '{}', ?, ?, ?, 0, '')
    `);

    // Transfer 1: Branch 3 -> Branch 4 (Sent, awaiting acceptance)
    const t1 = insTr.run(
      'T2026-0001', 3, 4, 'La Cherry Kosmetika', 'Moda Kiyim', 'sent',
      'Moda filialiga atirlar ko\'rgazmasi uchun jo\'natildi', 1250000,
      'Dilnoza Menejer', dayOffset(2, 11, 20), '', null
    ).lastInsertRowid;
    insTrItem.run(t1, 1, 0, 'Baccarat Rouge 540', 5, 250000, null);

    // Transfer 2: Branch 4 -> Branch 3 (Accepted)
    const t2 = insTr.run(
      'T2026-0002', 4, 3, 'Moda Kiyim', 'La Cherry Kosmetika', 'accepted',
      'Kosmetika sumkachalari va kosmetichkalar partiyasi', 840000,
      'Sardor Menejer', dayOffset(8, 14, 0), 'Ali Sotuvchi', dayOffset(7, 10, 30)
    ).lastInsertRowid;
    insTrItem.run(t2, 2, 0, 'Kompakt kosmetik quti', 12, 70000, 12);

    // Transfer 3: Branch 5 -> Branch 3 (Accepted)
    const t3 = insTr.run(
      'T2026-0003', 5, 3, 'Usta Qurilish Mollari', 'La Cherry Kosmetika', 'accepted',
      'Do\'kon vitrinalari uchun LED profillar va armatura', 450000,
      'Rustam Usta', dayOffset(15, 16, 0), 'Dilnoza Menejer', dayOffset(14, 11, 0)
    ).lastInsertRowid;
    insTrItem.run(t3, 3, 0, 'LED alyuminiy vitrina profili', 10, 45000, 10);
  }
})();

console.log('--- DEMO DATA ENRICHMENT COMPLETED SUCCESSFULLY! ---');
