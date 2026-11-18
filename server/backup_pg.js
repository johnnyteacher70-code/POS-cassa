// PostgreSQL Zaxira (Backup / Mirror) tizimi:
// SQLite'dagi barcha ma'lumotlarni PostgreSQL bazasiga to'liq zaxira sifatida to'kib boradi.
// Ishlatish: .env faylida PG_URI=postgres://user:pass@host:5432/dbname
// Qo'lda ishga tushirish: npm run backup:pg
const { Client } = require('pg');
const main = require('./main_db');
const branchDb = require('./branch_db');
const { runInBranch } = require('./context');

function getPgClient() {
  const connectionString = process.env.PG_URI || process.env.DATABASE_URL;
  if (!connectionString) return null;
  const isSsl = connectionString.includes('sslmode=') || !connectionString.includes('localhost');
  return new Client({
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });
}

// Jadvallarni PostgreSQL da yaratish
async function initPgTables(pg) {
  await pg.query(`
    CREATE TABLE IF NOT EXISTS pg_backup_branches (
      id INT PRIMARY KEY,
      slug TEXT,
      name TEXT,
      address TEXT,
      phone TEXT,
      status TEXT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pg_backup_products (
      branch_id INT,
      id INT,
      name TEXT,
      brand TEXT,
      category TEXT,
      barcode TEXT,
      sku TEXT,
      piece_price NUMERIC,
      box_price NUMERIC,
      cost_price NUMERIC,
      stock_pieces NUMERIC,
      unit TEXT,
      active INT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );

    CREATE TABLE IF NOT EXISTS pg_backup_clients (
      branch_id INT,
      id INT,
      type TEXT,
      company_name TEXT,
      contact_name TEXT,
      phone TEXT,
      balance NUMERIC,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );

    CREATE TABLE IF NOT EXISTS pg_backup_sales (
      branch_id INT,
      id INT,
      number TEXT,
      kind TEXT,
      client_id INT,
      date TEXT,
      status TEXT,
      total NUMERIC,
      discount NUMERIC,
      paid_amount NUMERIC,
      branch_code TEXT,
      branch_name TEXT,
      created_at TEXT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );

    CREATE TABLE IF NOT EXISTS pg_backup_sale_items (
      branch_id INT,
      id INT,
      sale_id INT,
      product_id INT,
      name TEXT,
      unit TEXT,
      qty NUMERIC,
      price NUMERIC,
      total NUMERIC,
      cost NUMERIC,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );

    CREATE TABLE IF NOT EXISTS pg_backup_payments (
      branch_id INT,
      id INT,
      client_id INT,
      direction TEXT,
      method TEXT,
      amount NUMERIC,
      date TEXT,
      sale_id INT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );

    CREATE TABLE IF NOT EXISTS pg_backup_expenses (
      branch_id INT,
      id INT,
      category_id INT,
      amount NUMERIC,
      method TEXT,
      date TEXT,
      note TEXT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id, id)
    );
  `);
}

async function syncToPostgres() {
  const pg = getPgClient();
  if (!pg) {
    console.log('[backup:pg] PG_URI yoki DATABASE_URL sozlanmagan — PostgreSQL zaxirasi o\'tkazib yuborildi.');
    return false;
  }

  await pg.connect();
  console.log('[backup:pg] PostgreSQL bazasiga ulandi, zaxiralash boshlandi...');

  try {
    await initPgTables(pg);

    // 1. Filiallarni zaxiralash
    const branches = main.prepare('SELECT id, slug, name, address, phone, status FROM branches').all();
    for (const b of branches) {
      await pg.query(`
        INSERT INTO pg_backup_branches (id, slug, name, address, phone, status, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          phone = EXCLUDED.phone,
          status = EXCLUDED.status,
          synced_at = NOW()
      `, [b.id, b.slug, b.name, b.address, b.phone, b.status]);

      // 2. Har bir filial ma'lumotlarini zaxiralash
      if (!branchDb.exists(b.id)) continue;

      await runInBranch(b.id, async () => {
        const db = require('./db');

        // Products
        const products = db.prepare('SELECT id, name, brand, category, barcode, sku, piece_price, box_price, cost_price, stock_pieces, unit, active FROM products').all();
        for (const p of products) {
          await pg.query(`
            INSERT INTO pg_backup_products (branch_id, id, name, brand, category, barcode, sku, piece_price, box_price, cost_price, stock_pieces, unit, active, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              name = EXCLUDED.name,
              piece_price = EXCLUDED.piece_price,
              cost_price = EXCLUDED.cost_price,
              stock_pieces = EXCLUDED.stock_pieces,
              active = EXCLUDED.active,
              synced_at = NOW()
          `, [b.id, p.id, p.name, p.brand, p.category, p.barcode, p.sku, p.piece_price, p.box_price, p.cost_price, p.stock_pieces, p.unit, p.active]);
        }

        // Clients
        const clients = db.prepare('SELECT id, type, company_name, contact_name, phone, balance FROM clients').all();
        for (const c of clients) {
          await pg.query(`
            INSERT INTO pg_backup_clients (branch_id, id, type, company_name, contact_name, phone, balance, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              company_name = EXCLUDED.company_name,
              contact_name = EXCLUDED.contact_name,
              phone = EXCLUDED.phone,
              balance = EXCLUDED.balance,
              synced_at = NOW()
          `, [b.id, c.id, c.type, c.company_name, c.contact_name, c.phone, c.balance]);
        }

        // Sales
        const sales = db.prepare('SELECT id, number, kind, client_id, date, status, total, discount, paid_amount, branch_code, branch_name, created_at FROM sales').all();
        for (const s of sales) {
          await pg.query(`
            INSERT INTO pg_backup_sales (branch_id, id, number, kind, client_id, date, status, total, discount, paid_amount, branch_code, branch_name, created_at, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              status = EXCLUDED.status,
              total = EXCLUDED.total,
              paid_amount = EXCLUDED.paid_amount,
              synced_at = NOW()
          `, [b.id, s.id, s.number, s.kind, s.client_id, s.date, s.status, s.total, s.discount, s.paid_amount, s.branch_code || '', s.branch_name || '', s.created_at]);
        }

        // Sale items
        const saleItems = db.prepare('SELECT id, sale_id, product_id, name, unit, qty, price, total, cost FROM sale_items').all();
        for (const si of saleItems) {
          await pg.query(`
            INSERT INTO pg_backup_sale_items (branch_id, id, sale_id, product_id, name, unit, qty, price, total, cost, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              qty = EXCLUDED.qty,
              price = EXCLUDED.price,
              total = EXCLUDED.total,
              synced_at = NOW()
          `, [b.id, si.id, si.sale_id, si.product_id, si.name, si.unit, si.qty, si.price, si.total, si.cost || 0]);
        }

        // Payments
        const payments = db.prepare('SELECT id, client_id, direction, method, amount, date, sale_id FROM payments').all();
        for (const py of payments) {
          await pg.query(`
            INSERT INTO pg_backup_payments (branch_id, id, client_id, direction, method, amount, date, sale_id, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              amount = EXCLUDED.amount,
              method = EXCLUDED.method,
              synced_at = NOW()
          `, [b.id, py.id, py.client_id, py.direction, py.method, py.amount, py.date, py.sale_id]);
        }

        // Expenses
        const expenses = db.prepare('SELECT id, category_id, amount, method, date, note FROM expenses WHERE deleted_at IS NULL').all();
        for (const ex of expenses) {
          await pg.query(`
            INSERT INTO pg_backup_expenses (branch_id, id, category_id, amount, method, date, note, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (branch_id, id) DO UPDATE SET
              amount = EXCLUDED.amount,
              method = EXCLUDED.method,
              note = EXCLUDED.note,
              synced_at = NOW()
          `, [b.id, ex.id, ex.category_id, ex.amount, ex.method, ex.date, ex.note]);
        }
      });
    }

    console.log(`[backup:pg] Barcha filiallar PostgreSQL zaxirasiga to'liq sinxronlashtirildi! (${branches.length} ta filial)`);
    return true;
  } finally {
    await pg.end();
  }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  syncToPostgres()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[backup:pg] Xatolik:', e.message);
      process.exit(1);
    });
}

module.exports = { syncToPostgres };
