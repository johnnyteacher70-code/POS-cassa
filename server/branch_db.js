// Filial bazalari: har bir filial — alohida papka va alohida SQLite fayli.
// Ochilgan bazalar xotirada saqlanadi (har so'rovda qayta ochilmaydi).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');
const initBranchSchema = require('./schema');
const { currentBranchId } = require('./context');

const cache = new Map();

function checkId(id) {
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Noto'g'ri filial: ${id}`);
  return id;
}
const branchDir = (id) => path.join(DATA_DIR, 'branches', String(checkId(id)));
const uploadsDir = (id) => path.join(branchDir(id), 'uploads');
const dbFile = (id) => path.join(branchDir(id), 'app.db');

// Joriy so'rov filialining rasmlar papkasi va ular beriladigan manzil: /uploads/<filial ID>/<fayl>
function currentId() {
  const id = currentBranchId();
  if (!id) throw new Error("Filial konteksti yo'q");
  return id;
}
const currentUploadsDir = () => uploadsDir(currentId());
const currentUploadsUrl = () => `/uploads/${currentId()}/`;

function exists(id) {
  return fs.existsSync(dbFile(id));
}

// create: true — faqat yangi filial yaratilganda. Boshqa hollarda mavjud bo'lmagan filial bazasi yaratilmaydi.
function openBranch(id, { create = false } = {}) {
  checkId(id);
  const cached = cache.get(id);
  if (cached) return cached;
  if (!create && !exists(id)) throw new Error(`Filial bazasi topilmadi: ${id}`);
  fs.mkdirSync(uploadsDir(id), { recursive: true });
  const db = new Database(dbFile(id));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');   // WAL bilan xavfsiz va tezroq
  db.pragma('busy_timeout = 10000');   // 10s navbat kutish
  db.pragma('cache_size = -8000');     // ~8 MB kesh (har bir filialga, 1GB RAM serverda xotirani tejaydi)
  db.pragma('temp_store = MEMORY');
  initBranchSchema(db);
  cache.set(id, db);
  return db;
}

function closeBranch(id) {
  const db = cache.get(id);
  if (db) { try { db.close(); } catch { /* jim */ } cache.delete(id); }
}

function closeAll() {
  for (const id of [...cache.keys()]) closeBranch(id);
}

module.exports = { openBranch, closeBranch, closeAll, exists, branchDir, uploadsDir, dbFile, currentUploadsDir, currentUploadsUrl };
