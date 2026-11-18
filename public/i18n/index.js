// Uch til: o'zbekcha (asosiy, kalitlar), ruscha va inglizcha (English).
// t('Mijozlar') -> 'Клиенты' / 'Clients';  t('{0} ta mijoz', [5])
import { reactive } from 'vue';
import RU, { PATTERNS as RU_PATTERNS, PHRASES as RU_PHRASES } from './ru.js';
import EN, { PATTERNS as EN_PATTERNS, PHRASES as EN_PHRASES } from './en.js';

function initial() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ru' || saved === 'uz' || saved === 'en') return saved;
  } catch { /* jim */ }
  const code = navigator.language || '';
  return /^ru/i.test(code) ? 'ru' : 'uz';
}

export const i18n = reactive({ lang: initial() });
if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang;

export function setLang(l) {
  i18n.lang = (l === 'ru' || l === 'en') ? l : 'uz';
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang;
  try { localStorage.setItem('lang', i18n.lang); } catch { /* jim */ }
}

const NORM_APOS = /[\u2018\u2019\u02BB\u02BC`]/g;
const norm = (s) => (typeof s === 'string' ? s.replace(NORM_APOS, "'") : s);

function translate(core) {
  const dict = i18n.lang === 'ru' ? RU : (i18n.lang === 'en' ? EN : null);
  if (!dict) return core;
  const patterns = i18n.lang === 'ru' ? RU_PATTERNS : EN_PATTERNS;

  if (core in dict) return dict[core];
  const n = norm(core);
  if (n in dict) return dict[n];
  // Bosh/oxiridagi belgilarsiz (emoji, ":", "...", qavs) qidirish
  const m = core.match(/^([^A-Za-zʻʼ\u2018\u20190-9]*)(.*?)([\s:;.,!?…·—→›»*(−+]*)$/s);
  if (m && m[2] !== core) {
    if (m[2] in dict) return m[1] + dict[m[2]] + m[3];
    const n2 = norm(m[2]);
    if (n2 in dict) return m[1] + dict[n2] + m[3];
  }
  for (const [re, fn] of patterns) {
    const m = core.match(re);
    if (m) return fn(...m.slice(1));
    const mn = n.match(re);
    if (mn) return fn(...mn.slice(1));
  }
  return core;
}

export function t(s, params) {
  if (s === null || s === undefined) return '';
  let out = String(s);
  if ((i18n.lang === 'ru' || i18n.lang === 'en') && out.trim()) {
    // Bosh/oxirdagi bo'sh joylar saqlanadi, ko'p qatorli matnda har bir qator alohida
    out = out.split('\n').map((line) => {
      const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return m[1] + translate(m[2]) + m[3];
    }).join('\n');
  }
  if (params) out = out.replace(/\{(\w+)\}/g, (all, k) => (params[k] !== undefined ? params[k] : all));
  return out;
}

// Obyekt qiymatlarini til bo'yicha qaytaradigan proksi (METHODS, ORDER_STATUS kabi lug'atlar uchun)
export function translated(obj) {
  return new Proxy(obj, {
    get(o, k) {
      const v = o[k];
      if (typeof k !== 'string') return v;
      if (typeof v === 'string') return t(v);
      if (Array.isArray(v) && typeof v[0] === 'string') return [t(v[0]), ...v.slice(1)];
      return v;
    },
  });
}

export const isRu = () => i18n.lang === 'ru';
export const isEn = () => i18n.lang === 'en';

// Tarix yozuvlari (server o'zbekcha yozadi): iboralarni so'z chegarasi bo'yicha almashtirish
const W = "A-Za-zʻʼ'\\u2018\\u2019\\u02BB\\u02BC";
const PHRASE_RE_RU = RU_PHRASES.map(([uz, ru]) => [new RegExp(`(^|[^${W}])${uz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${W}])`, 'g'), ru]);
const PHRASE_RE_EN = EN_PHRASES.map(([uz, en]) => [new RegExp(`(^|[^${W}])${uz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${W}])`, 'g'), en]);

export function tx(s) {
  if (!s || (i18n.lang !== 'ru' && i18n.lang !== 'en')) return s || '';
  const list = i18n.lang === 'ru' ? PHRASE_RE_RU : PHRASE_RE_EN;
  let out = String(s);
  for (const [re, rep] of list) out = out.replace(re, (m, pre) => pre + rep);
  return out;
}

// "5 ta sharh" / "5 отзывов" / "5 reviews" — sonli so'z
export function nReviews(n) {
  if (i18n.lang === 'en') return `${n} review${n === 1 ? '' : 's'}`;
  if (i18n.lang === 'ru') {
    const a = n % 10, b = n % 100;
    const w = a === 1 && b !== 11 ? 'отзыв' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'отзыва' : 'отзывов';
    return `${n} ${w}`;
  }
  return `${n} ta sharh`;
}
