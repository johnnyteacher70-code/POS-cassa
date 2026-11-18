// Zaxira nusxa: server ishlayotganda har kuni BACKUP_HOUR (standart 03) da avtomatik; qo'lda: npm run backup
// Har bir nusxa — alohida papka: DATA_DIR/backups/YYYY-MM-DD_HHMM/
//   main.db                 — filiallar ro'yxati, egasi, loginlar
//   branches/<id>/app.db    — har bir filial bazasi
// Oxirgi BACKUP_KEEP ta nusxa saqlanadi (standart 14).
// BACKUP_COPY_DIR berilsa (fleshka, tashqi disk yoki tarmoq papkasi) — har bir nusxa u yerga ham ko'chiriladi:
// kompyuter diski buzilsa ham ma'lumot yo'qolmaydi.
// Rasmlar: DATA_DIR/backups/uploads/<id>/ ga qo'shib boriladi (o'chirilmaydi).
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const COPY_DIR = process.env.BACKUP_COPY_DIR || '';
const SNAP_RE = /^\d{4}-\d{2}-\d{2}_\d{4}/;

const stampNow = () => new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '_').replace(':', '');

// Bitta filial bazasi va rasmlari nusxasi (filialni o'chirishdan oldin ham shu ishlatiladi)
async function backupBranch(id, intoDir) {
  const branchDb = require('./branch_db');
  if (!branchDb.exists(id)) return null;
  const file = path.join(intoDir, 'branches', String(id), 'app.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await branchDb.openBranch(id).backup(file);   // SQLite onlayn nusxa — server to'xtamaydi
  const up = branchDb.uploadsDir(id);
  if (fs.existsSync(up)) fs.cpSync(up, path.join(DIR, 'uploads', String(id)), { recursive: true, force: false });
  return file;
}

async function runBackup(label = '') {
  const main = require('./main_db');
  const snap = path.join(DIR, stampNow() + (label ? '_' + label : ''));
  fs.mkdirSync(snap, { recursive: true });
  await main.backup(path.join(snap, 'main.db'));
  const ids = main.prepare('SELECT id FROM branches ORDER BY id').all().map((r) => r.id);
  for (const id of ids) await backupBranch(id, snap);
  prune(DIR);
  console.log(`[backup] ${snap} (${ids.length} ta filial)`);
  if (COPY_DIR) copyOut(snap);
  try {
    const { syncToPostgres } = require('./backup_pg');
    await syncToPostgres();
  } catch (err) {
    console.warn('[backup] PostgreSQL zaxiralashda ogohlantirish:', err.message);
  }
  return snap;
}

// Eskilarini o'chirish (faqat avtomatik kunlik nusxalar hisoblanadi; filial o'chirishdan oldingi nusxalar qoladi)
function prune(dir) {
  const old = fs.readdirSync(dir).filter((f) => SNAP_RE.test(f) && !f.includes('_ochirish_')).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
}

// Nusxani tashqi papkaga ko'chirish. Papka mavjud bo'lmasa (fleshka ulanmagan) — xato emas, faqat ogohlantirish:
// asosiy nusxa baribir kompyuterda saqlangan.
function copyOut(snap) {
  try {
    if (!fs.existsSync(COPY_DIR)) { console.warn(`[backup] tashqi papka topilmadi (fleshka ulanmaganmi?): ${COPY_DIR}`); return null; }
    // Har doim alohida "dokon-zaxira" papkasiga — tozalashda foydalanuvchining boshqa fayllariga tegilmaydi
    const base = path.join(COPY_DIR, 'dokon-zaxira');
    // Zaxira paroli o'rnatilgan bo'lsa — bitta shifrlangan .dkz fayl (fleshka yo'qolsa ham ma'lumot o'qilmaydi)
    const key = backupKey();
    const dest = path.join(base, path.basename(snap) + (key ? '.dkz' : ''));
    fs.mkdirSync(base, { recursive: true });
    if (key) fs.writeFileSync(dest, require('./backup_crypt').seal(snap, key));
    else fs.cpSync(snap, dest, { recursive: true });
    const up = path.join(DIR, 'uploads');
    if (fs.existsSync(up)) fs.cpSync(up, path.join(base, 'uploads'), { recursive: true, force: false });
    prune(base);
    console.log(`[backup] tashqi nusxa: ${dest}`);
    return dest;
  } catch (e) {
    console.error('[backup] tashqi papkaga ko\'chirib bo\'lmadi:', e.message);
    return null;
  }
}

// Zaxira paroli (egasi panelida o'rnatiladi): { salt, key } yoki null
function backupKey() {
  try {
    const b = require('./business');
    const salt = b.get('backup_salt'), key = b.get('backup_key');
    return salt && key ? { salt, key } : null;
  } catch { return null; }
}

// Kunlik avtomatik nusxa (server ichida)
function scheduleBackups() {
  if (process.env.BACKUP_DISABLED === '1') return;
  const hour = Number(process.env.BACKUP_HOUR ?? 3);
  let lastDay = null;
  const tick = () => {
    const d = new Date();
    const day = d.toLocaleString('sv-SE').slice(0, 10);
    if (d.getHours() >= hour && lastDay !== day) {
      lastDay = day;
      runBackup().catch((e) => console.error('[backup] xato:', e.message));
    }
  };
  // Bugungi nusxa allaqachon bo'lsa — qaytadan olinmaydi
  try {
    const today = new Date().toLocaleString('sv-SE').slice(0, 10);
    if (fs.existsSync(DIR) && fs.readdirSync(DIR).some((f) => f.startsWith(today))) lastDay = today;
  } catch { /* jim */ }
  setInterval(tick, 10 * 60e3).unref();
  tick();
}

module.exports = { runBackup, backupBranch, scheduleBackups, backupKey, BACKUP_DIR: DIR, stampNow };

// Qo'lda ishga tushirish: node server/backup.js
if (require.main === module) {
  require('dotenv').config({ quiet: true });
  runBackup().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
