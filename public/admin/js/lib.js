import { reactive } from 'vue';
import { t, translated, i18n } from '/i18n/index.js';
export { t, i18n };

// ---------- Mavzular va Dinamik Ranglar (SaaS Theming) ----------
export const THEME_PRESETS = {
  cherry: { label: 'La Cherry (Pushti / Malina)', color: '#d94680', sidebar: 'linear-gradient(180deg, #831843 0%, #4c0519 100%)', topbar: '#831843' },
  rose: { label: 'Yoqut Qizil', color: '#e11d48', sidebar: 'linear-gradient(180deg, #881337 0%, #4c0519 100%)', topbar: '#881337' },
  indigo: { label: 'Klassik Indigo', color: '#4f46e5', sidebar: 'linear-gradient(180deg, #1e1b4b 0%, #0f0c29 100%)', topbar: '#1e1b4b' },
  emerald: { label: 'Zumrad Yashil', color: '#059669', sidebar: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)', topbar: '#064e3b' },
  sapphire: { label: "Sapfir Ko'k", color: '#2563eb', sidebar: 'linear-gradient(180deg, #1e3a8a 0%, #0f172a 100%)', topbar: '#1e3a8a' },
  amber: { label: 'Tilla / Amber', color: '#d97706', sidebar: 'linear-gradient(180deg, #78350f 0%, #451a03 100%)', topbar: '#78350f' },
  violet: { label: 'Binafsharang (Odoo)', color: '#7c3aed', sidebar: 'linear-gradient(180deg, #4c1d95 0%, #2e1065 100%)', topbar: '#4c1d95' },
  dark: { label: 'Obsidian Qora', color: '#64748b', sidebar: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', topbar: '#1e293b' },
};

export function shade(hex, k) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}

export function applyTheme(opts = {}) {
  if (typeof document === 'undefined') return;
  const presetKey = opts.preset || (typeof localStorage !== 'undefined' && localStorage.getItem('theme_preset')) || 'indigo';
  const preset = THEME_PRESETS[presetKey] || THEME_PRESETS.indigo;
  const color = opts.color || (typeof localStorage !== 'undefined' && localStorage.getItem('theme_color')) || preset.color;
  const mode = opts.mode || (typeof localStorage !== 'undefined' && localStorage.getItem('theme_mode')) || 'light';

  try {
    localStorage.setItem('theme_preset', presetKey);
    localStorage.setItem('theme_color', color);
    localStorage.setItem('theme_mode', mode);
  } catch {}

  const root = document.documentElement;
  root.style.setProperty('--primary', color);
  root.style.setProperty('--primary-2', shade(color, 0.88));
  root.style.setProperty('--gold', shade(color, 0.25));
  root.style.setProperty('--gold-dark', shade(color, -0.15));
  root.style.setProperty('--gold-light', shade(color, 0.85));
  root.style.setProperty('--sidebar-bg', preset.sidebar);
  root.style.setProperty('--topbar-bg', preset.topbar);

  if (mode === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}
try { applyTheme(); } catch {}

// ---------- Toast ----------
export const toasts = reactive([]);
let toastId = 0;
export function toast(text, type = '', opts = {}) {
  // Xabar (server xatolari ham) joriy tilga o'giriladi
  const t2 = { id: ++toastId, text: t(text), type, action: opts.action, actionLabel: opts.actionLabel && t(opts.actionLabel) };
  toasts.push(t2);
  setTimeout(() => {
    const i = toasts.findIndex((x) => x.id === t2.id);
    if (i >= 0) toasts.splice(i, 1);
  }, opts.duration || (type === 'error' ? 6000 : 4500));
}

// ---------- API ----------
// user — filial ichidagi foydalanuvchi (filial tanlanmagan bo'lsa null); owner — biznes egasi; branch — joriy filial
export const session = reactive({ user: null, owner: null, branch: null, needsSetup: false, setupToken: false, checked: false });
export function applyMe(me) {
  session.owner = me && me.owner ? { username: me.username, full_name: me.full_name } : null;
  session.branch = (me && me.branch) || null;
  session.user = me && me.role ? {
    id: me.id, username: me.username, full_name: me.full_name, role: me.role, register_id: me.register_id, is_owner: !!me.owner,
    role_id: me.role_id || null, role_name: me.role_name || '', perms: new Set(me.perms || []),
  } : null;
}
// Ruxsat bormi (server ham har bir amalni tekshiradi — bu faqat interfeysda keraksiz tugmalarni yashirish uchun).
// Bir nechta berilsa — kamida bittasi yetarli.
export function can(...list) {
  const p = session.user && session.user.perms;
  return !!p && (p.has('*') || list.some((x) => p.has(x)));
}
// Filial / foydalanuvchi almashganda sahifa to'liq qayta yuklanadi —
// oldingi filialning keshdagi ma'lumotlari (mahsulotlar, sozlamalar, ochiq sahifalar) qolmasin
export function reloadApp(hash = '#/') {
  location.hash = hash;
  location.reload();
}

// latest: kalit — shu kalitli so'rovlardan faqat eng oxirgisining javobi qabul qilinadi
// (tez yozganda eski javob yangisining ustidan yozib yubormasligi uchun)
const latestSeq = {};
export async function api(method, url, body, { silent = false, latest = '', headers = {} } = {}) {
  const mySeq = latest ? (latestSeq[latest] = (latestSeq[latest] || 0) + 1) : 0;
  const opts = { method, headers: { ...headers } };
  if (body instanceof FormData) opts.body = body;
  else if (body instanceof Blob) { opts.headers['Content-Type'] = 'application/octet-stream'; opts.body = body; }
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    if (!silent) toast("Server bilan aloqa yo'q", 'error');
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (latest && latestSeq[latest] !== mySeq) return new Promise(() => {});   // eskirgan javob — e'tiborsiz
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) { session.user = null; session.owner = null; session.branch = null; }
    if (res.status === 403 && data.code === 'no_branch') { session.user = null; session.branch = null; }
    if (!silent) toast(data.error || 'Xatolik', 'error');
    const err = new Error(data.error || 'Xatolik');
    err.status = res.status;
    throw err;
  }
  return data;
}
export const get = (u, o) => api('GET', u, undefined, o);
export const post = (u, b, o) => api('POST', u, b ?? {}, o);
export const put = (u, b, o) => api('PUT', u, b, o);
export const del = (u, o) => api('DELETE', u, undefined, o);

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
}

// ---------- Router (hash) ----------
export const route = reactive({ path: '/', parts: [], query: {}, full: '/' });
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q] = h.split('?');
  route.full = h;
  route.path = path;
  route.parts = path.split('/').filter(Boolean);
  route.query = Object.fromEntries(new URLSearchParams(q || ''));
}
window.addEventListener('hashchange', parseHash);
parseHash();
export function go(path) { location.hash = '#' + path; }
export function back(fallback = '/') { if (history.length > 1) history.back(); else go(fallback); }

// Sahifalar xotirada saqlanadi (orqaga qaytganda holat o'chmaydi).
// Forma saqlangandan keyin uni toza holatga qaytarish uchun: resetPage()
export const pageVersions = reactive({});
export function resetPage(full = route.full) { pageVersions[full] = (pageVersions[full] || 0) + 1; }

// ---------- Formatlash ----------
export function money(n, withCur = false) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + s + (withCur ? ' ' + t("so'm") : '');
}
export function qtyFmt(n) { return Number.isInteger(+n) ? String(n) : String(+(+n).toFixed(3)); }
export function dt(s, withTime = true) {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}` + (withTime && t ? ' ' + t.slice(0, 5) : '');
}
export function d(s) { return dt(s, false); }
export function nowLocal() {
  const x = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
export function today() { return nowLocal().slice(0, 10); }
export function toInputDt(s) { return s ? s.slice(0, 16).replace(' ', 'T') : ''; }
export function toInputD(s) { return s ? s.slice(0, 10) : ''; }

// 'return' — tovar qaytarish (pul emas): ko'rinadi, lekin to'lov turini tanlash ro'yxatida yo'q (sanalmaydi)
const METHOD_NAMES = { cash: 'Naqd', transfer: 'Perechisleniye', card: 'Karta', other: 'Boshqa' };
Object.defineProperty(METHOD_NAMES, 'return', { value: 'Tovar qaytarish', enumerable: false });
Object.defineProperty(METHOD_NAMES, 'bonus', { value: 'Bonus', enumerable: false });
export const METHODS = translated(METHOD_NAMES);
export const METHOD_ICONS = { return: '↩', bonus: '🎁', cash: '💵', transfer: '🏦', card: '💳', other: '•' };
export const ORDER_STATUS = translated({ new: ['Yangi', 'amber'], confirmed: ['Tasdiqlangan', 'green'], rejected: ['Rad etilgan', 'red'], cancelled: ['Mijoz bekor qildi', 'gray'] });

export function clientName(c) {
  if (!c) return '';
  return c.company_name || c.contact_name || c.phone || '#' + c.id;
}

export function balanceInfo(b) {
  if (b < 0) return { text: t('Qarzdor'), cls: 'neg', badge: 'red' };
  if (b > 0) return { text: t('Avans (biz qarzdormiz)'), cls: 'pos', badge: 'green' };
  return { text: t('Hisob yopiq'), cls: 'muted', badge: 'gray' };
}

export function saleStatus(s) {
  if (s.status === 'cancelled') return [t('Bekor qilingan'), 'gray'];
  if (s.paid_amount >= s.total) return [t("To'langan"), 'green'];
  if (s.paid_amount > 0) return [t('Qisman'), 'amber'];
  return [t("To'lanmagan"), 'red'];
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- Summani so'z bilan (o'zbekcha) ----------
const ONES = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
const SCALES = ['', 'ming', 'million', 'milliard', 'trillion'];
function triple(n) {
  const out = [];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
  if (h) out.push(ONES[h], 'yuz');
  if (t) out.push(TENS[t]);
  if (u) out.push(ONES[u]);
  return out.join(' ');
}
// ---------- Сумма прописью (ruscha) ----------
const RU_U = [['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'], ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']];
const RU_TEEN = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const RU_T = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const RU_H = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const RU_S = [null, ['тысяча', 'тысячи', 'тысяч'], ['миллион', 'миллиона', 'миллионов'], ['миллиард', 'миллиарда', 'миллиардов'], ['триллион', 'триллиона', 'триллионов']];
function ruPlural(n, f) { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b > 1 && b < 5 ? f[1] : f[2]; }
function ruTriple(n, fem) {
  const h = Math.floor(n / 100), r = n % 100, tn = Math.floor(r / 10), u = r % 10;
  const out = [RU_H[h]];
  if (tn === 1) out.push(RU_TEEN[u]); else out.push(RU_T[tn], RU_U[fem ? 1 : 0][u]);
  return out.filter(Boolean).join(' ');
}
function amountInWordsRu(n) {
  if (n === 0) return 'Ноль сумов';
  const parts = [];
  let i = 0, v = n;
  while (v > 0) {
    const tr = v % 1000;
    if (tr) parts.unshift(ruTriple(tr, i === 1) + (RU_S[i] ? ' ' + ruPlural(tr, RU_S[i]) : ''));
    v = Math.floor(v / 1000);
    i++;
  }
  const s = parts.join(' ') + ' ' + ruPlural(n, ['сум', 'сума', 'сумов']);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function amountInWords(n) {
  if (i18n.lang === 'ru') return amountInWordsRu(Math.round(Math.abs(Number(n) || 0)));
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 0) return "Nol so'm";
  const parts = [];
  let i = 0;
  while (n > 0) {
    const tr = n % 1000;
    if (tr) parts.unshift(triple(tr) + (SCALES[i] ? ' ' + SCALES[i] : ''));
    n = Math.floor(n / 1000);
    i++;
  }
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + " so'm";
}

// ---------- PDF (html2pdf) ----------
let html2pdfLoading;
async function makePdf(el, filename) {
  if (!window.html2pdf) {
    html2pdfLoading ||= new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/vendor/html2pdf.js';
      s.onload = ok;
      s.onerror = fail;
      document.head.appendChild(s);
    });
    await html2pdfLoading;
  }
  // Eslatma: html2pdf "worker"i thenable — await qilinmasin, shuning uchun obyekt ichida qaytariladi
  return { w: window.html2pdf().set({
    margin: [12, 11, 12, 11], filename, image: { type: 'jpeg', quality: 0.98 },   // mm: har sahifada hoshiya
    html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], before: '.page-break', avoid: ['tr', '.words', '.bal'] },
  }).from(el) };
}

// Qayerda ochilgan: telefon (sensorli ekran) / kompyuter
export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
export const isMobileDevice = isMobile;
export const isMobileOrTablet = isMobile;

// PDF'ni serverga yuklab vaqtinchalik havola olish
async function uploadPdf(blob, filename) {
  const r = await fetch('/api/docs/pdf?name=' + encodeURIComponent(filename), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: blob });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'PDF yuklanmadi');
  return location.origin + (await r.json()).url;
}

// "PDF tayyor" oynasi. Telefon (iPhone / Android) Ulashish oynasini va yuklab olishni FAQAT
// tugma bosilgan zahoti ochishga ruxsat beradi (user gesture). PDF yaratish 1-3 soniya oladi —
// shu sababli PDF tayyor bo'lgach alohida oyna chiqadi va undagi tugmalar (yangi bosish) ishlaydi.
export const pdfSheet = reactive({ open: false, busy: false, file: null, url: '', filename: '', mode: 'pdf', canShare: false, error: '' });

export async function sheetShare() {
  try {
    if (pdfSheet.file && navigator.share && pdfSheet.canShare) {
      await navigator.share({ files: [pdfSheet.file], title: pdfSheet.filename });
      pdfSheet.open = false;
      return;
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.code === 20)) return; // Foydalanuvchi oynani yopdi
    console.warn('Share xatosi, PDF ochishga o\'tiladi:', e);
  }
  // Agar Ulashish oynasi xatolik bersa — foydalanuvchini to'xtatib qo'ymasdan PDFni ochishga o'tamiz
  sheetOpen();
}
export function sheetDownload() {
  if (pdfSheet.url) {
    const a = document.createElement('a');
    a.href = pdfSheet.url + '?dl=1';
    a.download = pdfSheet.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if (pdfSheet.file) {
    const u = URL.createObjectURL(pdfSheet.file);
    const a = document.createElement('a');
    a.href = u;
    a.download = pdfSheet.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
}
export function sheetOpen() {
  if (pdfSheet.url) {
    window.open(pdfSheet.url, '_blank');
  } else if (pdfSheet.file) {
    const u = URL.createObjectURL(pdfSheet.file);
    window.open(u, '_blank');
  }
}

// Hujjat: mode = 'pdf' (yuklab olish) | 'print' (chop etish).
//   Kompyuter: PDF — oddiy yuklab olish; chop etish — brauzer oynasi (Ctrl+P).
//   Telefon: PDF yaratiladi, serverga yuklanadi (havola) → "PDF tayyor" oynasi:
//     🖨 Chop etish — Ulashish oynasi (PRINT (Canon), Print/AirPrint); ⬇ Yuklab olish; 📄 Ochish.
export async function docAction(el, filename, mode = 'pdf') {
  if (!isMobile()) {
    if (mode === 'print') return window.print();
    el.classList.add('pdf-mode');
    try { return await (await makePdf(el, filename)).w.save(); } finally { el.classList.remove('pdf-mode'); }
  }
  Object.assign(pdfSheet, { open: true, busy: true, file: null, url: '', filename, mode, error: '' });
  try {
    el.classList.add('pdf-mode');
    let blob;
    try { blob = await (await makePdf(el, filename)).w.outputPdf('blob'); } finally { el.classList.remove('pdf-mode'); }
    const file = new File([blob], filename, { type: 'application/pdf' });
    pdfSheet.file = file;
    pdfSheet.canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    pdfSheet.url = await uploadPdf(blob, filename);
  } catch (e) {
    pdfSheet.error = (e && e.message) || 'PDF yaratib bo\'lmadi';
  } finally { pdfSheet.busy = false; }
}
export const savePdf = (el, filename) => docAction(el, filename, 'pdf');

// ---------- Rasm siqish (Client-side compression) ----------
// Tiniqlikni yo'qotmagan holda fayl hajmini sezilarli darajada kichraytiradi (WebP / JPEG 1200px)
export async function compressImageFile(file, maxDim = 1200, quality = 0.82) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  return new Promise((resolve) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w <= maxDim && h <= maxDim && file.size < 120 * 1024) {
        return resolve(file);
      }
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      }
      // WebP formati mavjudligini tekshiramiz — 10 barobar tez va yengil
      const tryWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      const outType = tryWebp ? 'image/webp' : 'image/jpeg';
      const outExt = tryWebp ? '.webp' : '.jpg';
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          const newFile = new File([blob], file.name.replace(/\.[^.]+$/, outExt), {
            type: outType,
            lastModified: Date.now(),
          });
          resolve(newFile);
        },
        outType,
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(file);
    };
    img.src = blobUrl;
  });
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
