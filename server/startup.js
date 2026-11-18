// Bazalar ochilishidan OLDIN bajariladigan ishlar (faqat fayllar bilan — hech qanday baza ochiq emas):
//   1) Zaxiradan tiklash: egasi panelda tanlagan nusxa (DATA_DIR/restore.pending) joriy ma'lumotlar o'rniga qo'yiladi.
//   2) Yangilanishdan oldingi zaxira: dastur versiyasi o'zgargan bo'lsa (yangi versiya o'rnatilgan) — migratsiyalardan
//      oldin barcha bazalar nusxalanadi: backups/<sana>_yangilash_<eski versiya>.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const PENDING = path.join(DATA_DIR, 'restore.pending');
const VERSION_FILE = path.join(DATA_DIR, '.app_version');
const stamp = () => new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '_').replace(':', '');
const SIDE = ['', '-wal', '-shm'];

// Baza fayli va uning WAL/SHM yo'ldoshlari
function copyDb(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  for (const s of SIDE) {
    if (fs.existsSync(from + s)) fs.copyFileSync(from + s, to + s);
    else fs.rmSync(to + s, { force: true });
  }
  return true;
}
const branchIds = (root) => {
  const d = path.join(root, 'branches');
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => /^\d+$/.test(x) && fs.existsSync(path.join(d, x, 'app.db'))) : [];
};

// Butun ma'lumotlar nusxasi (fayl darajasida; bazalar ochilmagan paytda ishonchli)
function fileSnapshot(label) {
  if (!fs.existsSync(path.join(DATA_DIR, 'main.db'))) return null;
  const snap = path.join(BACKUP_DIR, `${stamp()}_${label}`);
  copyDb(path.join(DATA_DIR, 'main.db'), path.join(snap, 'main.db'));
  for (const id of branchIds(DATA_DIR)) copyDb(path.join(DATA_DIR, 'branches', id, 'app.db'), path.join(snap, 'branches', id, 'app.db'));
  return snap;
}

function applyRestore() {
  if (!fs.existsSync(PENDING)) return null;
  const name = fs.readFileSync(PENDING, 'utf8').trim();
  fs.rmSync(PENDING, { force: true });
  const snap = path.join(BACKUP_DIR, path.basename(name));   // faqat backups ichidan
  if (!name || !fs.existsSync(path.join(snap, 'main.db'))) { console.error('[tiklash] nusxa topilmadi:', name); return null; }
  fileSnapshot('tiklashdan_oldin');
  copyDb(path.join(snap, 'main.db'), path.join(DATA_DIR, 'main.db'));
  // Nusxada yo'q filial bazalari (keyin yaratilgan) — joyida qoladi, lekin main.db da ular yo'q bo'ladi
  for (const id of branchIds(snap)) copyDb(path.join(snap, 'branches', id, 'app.db'), path.join(DATA_DIR, 'branches', id, 'app.db'));
  console.log('[tiklash] ma\'lumotlar zaxiradan tiklandi:', path.basename(snap));
  return snap;
}

function preUpgradeBackup() {
  const version = require('../package.json').version;
  const old = fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8').trim() : '';
  if (old !== version) {
    if (old) { const s = fileSnapshot('yangilash_' + old.replace(/[^0-9.]/g, '')); if (s) console.log(`[yangilash] ${old} → ${version}, oldingi holat saqlandi: ${s}`); }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(VERSION_FILE, version);
  }
}

function beforeOpen() {
  applyRestore();
  preUpgradeBackup();
}

module.exports = { beforeOpen, PENDING, BACKUP_DIR };
