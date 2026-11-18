// Amallar jurnalini (audit_log) arxivlash: AUDIT_KEEP_MONTHS (standart 24) oydan eski yozuvlar
// DATA_DIR/archive/audit/<filial>/audit_<dan>_<gacha>.jsonl.gz fayliga chiqariladi va bazadan o'chiriladi —
// baza yillar davomida keraksiz kattalashmaydi, eski tarix esa yo'qolmaydi (gzip + JSON qatorlar, istalgan vositada ochiladi).
// Avval fayl yoziladi, keyin o'chiriladi: to'xtab qolsa ham yozuv yo'qolmaydi (eng yomoni — arxivda takror).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('./db');
const { DATA_DIR } = require('./config');

const KEEP_MONTHS = Math.max(3, Number(process.env.AUDIT_KEEP_MONTHS) || 24);
const ROOT = path.join(DATA_DIR, 'archive', 'audit');

function cutoff(months = KEEP_MONTHS) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toLocaleString('sv-SE').slice(0, 10) + ' 00:00:00';
}

// Joriy filial (runInBranch ichida chaqiriladi)
function archiveAudit(branchId, months = KEEP_MONTHS) {
  const before = cutoff(months);
  const rows = db.prepare('SELECT * FROM audit_log WHERE at < ? ORDER BY id').all(before);
  if (!rows.length) return 0;
  const dir = path.join(ROOT, String(branchId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `audit_${rows[0].at.slice(0, 10)}_${rows[rows.length - 1].at.slice(0, 10)}_${rows[rows.length - 1].id}.jsonl.gz`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  fs.renameSync(tmp, file);
  db.prepare('DELETE FROM audit_log WHERE at < ? AND id <= ?').run(before, rows[rows.length - 1].id);
  console.log(`[arxiv] filial ${branchId}: ${rows.length} ta eski jurnal yozuvi → ${path.relative(DATA_DIR, file)}`);
  return rows.length;
}

// Arxiv fayllari ro'yxati (egasi panelida ko'rsatish uchun)
function listArchives(branchId) {
  const dir = path.join(ROOT, String(branchId));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).sort().map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
}

module.exports = { archiveAudit, listArchives, cutoff, KEEP_MONTHS, ROOT };
