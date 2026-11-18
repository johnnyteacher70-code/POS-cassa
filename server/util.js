const db = require('./db');

function pad(n) { return String(n).padStart(2, '0'); }

// Mahalliy vaqt (TZ=Asia/Tashkent) 'YYYY-MM-DD HH:MM:SS'
function now() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// '2026-10-01T14:30' / '2026-10-01' -> '2026-10-01 14:30:00'
function normDate(v, fallback = now()) {
  if (!v) return fallback;
  let s = String(v).trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += ' ' + now().slice(11);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s += ':00';
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) throw httpError(400, "Sana noto'g'ri: " + v);
  // Mavjud bo'lmagan sanalar (31-fevral, 25:61) rad etiladi
  const [y, mo, d, h, mi, se] = s.split(/[- :]/).map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, se);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt.getHours() !== h || dt.getMinutes() !== mi || y < 2000 || y > 2100) {
    throw httpError(400, "Sana noto'g'ri: " + v);
  }
  return s;
}

// Muddat sanalari: faqat kun berilsa — kun oxiri
function normDay(v) {
  if (!v) return null;
  const s = String(v).trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 23:59:59';
  return normDate(s);
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }

// Telefonni +998XXXXXXXXX ko'rinishiga keltirish
function normPhone(s) {
  const d = digits(s);
  if (!d) return '';
  if (d.length === 9) return '+998' + d;
  // Eski yozuv: "8 90 123 45 67" yoki "0 90 ..." — 10 raqam, boshida 8/0
  if (d.length === 10 && (d[0] === '8' || d[0] === '0')) return '+998' + d.slice(1);
  if (d.length === 12 && d.startsWith('998')) return '+' + d;
  // "+998" ikki marta yozilgan ("+998 +998 90 ...") yoki boshida ortiqcha raqam — oxirgi 9 raqam olinadi
  if (d.length > 12 && d.startsWith('998')) return '+998' + d.slice(-9);
  return (String(s).trim().startsWith('+') ? '+' : '') + d;
}

// O'zbekiston mobil raqami: +998 va 9 raqam
function isUzPhone(p) { return /^\+998\d{9}$/.test(p); }

function int(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Math.round(Number(String(v).replace(/[\s,]/g, '')));
  return Number.isFinite(n) ? n : def;
}

function num(v, def = 0) {
  let s = String(v ?? '').trim();
  if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');   // "1,5" — o'nlik kasr (minglik ajratuvchi emas)
  const n = Number(s.replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : def;
}

function str(v, max = 2000) { return String(v ?? '').trim().slice(0, max); }

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function fmtMoney(n) {
  return (Math.round(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

// Kirill -> lotin, apostroflarni birxillashtirish (qidiruv uchun)
const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};
function normText(s) {
  return String(s || '').toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? c)
    .replace(/[ʻʼ'`‘’"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Chegaralangan Levenshtein: masofa max dan oshishi aniq bo'lsa — darhol max+1 qaytaradi (qidiruvda tezlik uchun)
const lvRow = new Int32Array(64);
function levenshteinMax(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length || !b.length || b.length >= 63) return Math.min(levenshtein(a, b), max + 1);
  for (let j = 0; j <= b.length; j++) lvRow[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = lvRow[0];
    lvRow[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const up = lvRow[j];
      const v = Math.min(up + 1, lvRow[j - 1] + 1, diag + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      diag = up;
      lvRow[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return Math.min(lvRow[b.length], max + 1);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Jurnalga parol / xesh hech qachon yozilmaydi (jurnalni sotuvchilar ham ko'rishi mumkin edi)
const SECRET_KEY = /pass|hash|token/i;
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, scrub(x)]));
  return v;
}

// Audit yozuvi
function audit(req, { action, entity, entity_id = null, client_id = null, summary = '', before = null, after = null }) {
  const u = req && req.user;
  before = scrub(before); after = scrub(after);
  db.prepare(`INSERT INTO audit_log (at,user_id,user_name,action,entity,entity_id,client_id,summary,before_json,after_json)
              VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    now(), u ? u.id : null, u ? (u.full_name || u.username) : (req && req.actorName) || 'tizim',
    action, entity, entity_id, client_id, summary,
    before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null,
  );
}

// Amal qaysi kassada: so'rovda ko'rsatilgani (faol bo'lsa) yoki xodimning o'z kassasi
function registerFor(req, wanted) {
  const id = int(wanted);
  if (id && db.prepare('SELECT 1 FROM registers WHERE id=? AND active=1').get(id)) return id;
  if (req && req.user && req.user.id) {
    const u = db.prepare('SELECT register_id FROM users WHERE id=?').get(req.user.id);
    if (u && u.register_id) return u.register_id;
  }
  return null;
}

// Urinishlar cheklagichi: oyna ichida max tadan oshsa — bloklanadi. Xotira chegaralangan, eskilar tozalanadi.
const limiters = [];
function limiter(max, windowMs) {
  const map = new Map();
  const l = {
    blocked(key) { const f = map.get(key); return !!f && f.n >= max && Date.now() - f.at < windowMs; },
    hit(key) {
      const f = map.get(key);
      if (!f || Date.now() - f.at > windowMs) {
        // Xotira chegarasi: eskirgan yoki bloklanmagan yozuvlar o'chiriladi — bloklangani hech qachon (aks holda
        // ko'p soxta so'rov bilan bloklangan loginni "ozod qilish" mumkin bo'lardi)
        if (map.size >= 50000) {
          const t = Date.now();
          for (const [k, x] of map) { if (map.size < 45000) break; if (t - x.at > windowMs || x.n < max) map.delete(k); }
        }
        map.set(key, { n: 1, at: Date.now() });
      } else f.n++;
    },
    reset(key) { map.delete(key); },
    prune() { const t = Date.now(); for (const [k, f] of map) if (t - f.at > windowMs) map.delete(k); },
  };
  limiters.push(l);
  return l;
}
setInterval(() => limiters.forEach((l) => l.prune()), 5 * 60e3).unref();

function getSetting(key, def = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
}

// Filialning hujjat prefiksi (masalan "CH" → CH-N2026-0001). Prefiks egasi tomonidan filial sozlamasida beriladi.
function currentBranchInfo() {
  const id = require('./context').currentBranchId();
  if (!id) return { id: null, code: '', name: '' };
  try {
    const r = require('./main_db').prepare('SELECT id, slug, name, doc_prefix FROM branches WHERE id=?').get(id);
    if (!r) return { id, code: `B${id}`, name: '' };
    const code = (r.doc_prefix || r.slug || `B${r.id}`).toUpperCase();
    return { id: r.id, code, name: r.name, slug: r.slug, doc_prefix: r.doc_prefix || '' };
  } catch {
    return { id, code: `B${id}`, name: '' };
  }
}

function branchDocPrefix() {
  const b = currentBranchInfo();
  return b && b.doc_prefix ? b.doc_prefix + '-' : '';
}

function nextNumber(table, prefix) {
  const year = new Date().getFullYear();
  prefix = branchDocPrefix() + prefix;
  const like = `${prefix}${year}-%`;
  const row = db.prepare(`SELECT number FROM ${table} WHERE number LIKE ? ORDER BY id DESC LIMIT 1`).get(like);
  const n = row ? parseInt(row.number.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${year}-${String(n).padStart(4, '0')}`;
}

// Katalogda (sayt) qanday sotiladi: 'piece' — dona (optom narx donaga), 'box' — faqat karobka, 'both' — ikkalasi
function sellUnit() {
  const v = getSetting('sell_unit', 'piece');
  return ['piece', 'box', 'both'].includes(v) ? v : 'piece';
}

module.exports = {
  sellUnit, currentBranchInfo,
  now, normDate, normDay, digits, normPhone, isUzPhone, int, num, str, httpError, fmtMoney, normText, levenshtein, levenshteinMax,
  audit, getSetting, nextNumber, registerFor, limiter,
};
