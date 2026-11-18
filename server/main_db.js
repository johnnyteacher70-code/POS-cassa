// Markaziy baza (main.db): filiallarning O'Z ma'lumotlari bu yerda saqlanmaydi.
//   owners   — biznes egasi akkaunti(lar)i
//   branches — filiallar ro'yxati
//   logins   — filial xodimlari loginlarining indeksi: login → qaysi filial (kirishda filialni topish uchun)
//   sessions — kirish sessiyalari (egasi yoki filial xodimi)
//   transfers — filiallar orasida tovar ko'chirish hujjatlari (ikki filialga tegishli — shuning uchun markazda)
//   business — biznes darajasidagi sozlamalar (nomi, logotip, rang, litsenziya ...)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const main = new Database(path.join(DATA_DIR, 'main.db'));
main.pragma('journal_mode = WAL');
main.pragma('foreign_keys = ON');
main.pragma('synchronous = NORMAL');
main.pragma('busy_timeout = 10000');

main.exec(`
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,         -- o'chirilgan filial ID si hech qachon qayta berilmaydi
  slug TEXT UNIQUE NOT NULL,                    -- katalog manzili uchun: /shop/<slug>
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  doc_prefix TEXT NOT NULL DEFAULT '',          -- hujjat raqami prefiksi (masalan CH)
  status TEXT NOT NULL DEFAULT 'active',        -- active | blocked
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logins (
  username TEXT PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_logins_user ON logins(branch_id, user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('owner', 'staff')),
  owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,       -- kind=owner
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,    -- staff: o'z filiali; owner: hozir kirgan filiali (bo'sh bo'lishi mumkin)
  user_id INTEGER,                                                -- kind=staff: filial bazasidagi users.id
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(branch_id, user_id);

-- Filiallar orasida ko'chirish: jo'natilganda manbadan chiqim, qabul qilinganda qabul qiluvchiga kirim.
-- Filial o'chirilsa ham tarix qoladi (shuning uchun branches ga FK yo'q, nomlar ham yoziladi).
CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,
  from_branch INTEGER NOT NULL,
  to_branch INTEGER NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  to_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent',          -- sent (yo'lda) | received | cancelled
  note TEXT NOT NULL DEFAULT '',
  total_cost REAL NOT NULL DEFAULT 0,
  sent_by TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL,
  received_by TEXT NOT NULL DEFAULT '',
  received_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_branch, status);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_branch, status);
CREATE TABLE IF NOT EXISTS transfer_items (
  id INTEGER PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  src_product_id INTEGER NOT NULL,
  dst_product_id INTEGER,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',              -- mahsulot kartochkasi (qabul qiluvchida topilmasa — shundan yaratiladi)
  qty REAL NOT NULL,                            -- asosiy birlikda
  cost REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_transfer_items ON transfer_items(transfer_id);

CREATE TABLE IF NOT EXISTS business (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Migratsiyalar: egasi uchun ikki bosqichli kirish (TOTP), sessiyada qurilma va IP (faol kirishlar ro'yxati uchun)
const addCol = (t, c, d) => { if (!main.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) main.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
addCol('owners', 'totp_secret', 'TEXT');
addCol('sessions', 'ip', "TEXT NOT NULL DEFAULT ''");
addCol('sessions', 'ua', "TEXT NOT NULL DEFAULT ''");
addCol('transfer_items', 'accepted_qty', 'REAL');
addCol('transfer_items', 'damaged_qty', 'REAL NOT NULL DEFAULT 0');
addCol('transfer_items', 'damaged_note', "TEXT NOT NULL DEFAULT ''");

// Ishchi muhitda (testlardan tashqari) yagona ombor va filiallararo katalog sukut bo'yicha yoqiladi
if (!DATA_DIR.startsWith('/tmp')) {
  main.prepare("INSERT INTO business (key, value) VALUES ('shared_warehouse', '1') ON CONFLICT(key) DO NOTHING").run();
}

module.exports = main;
