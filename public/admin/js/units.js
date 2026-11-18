// O'lchov birliklari (server/units.js bilan bir xil). Ichki qiymatlar: 'dona' — asosiy birlik, 'karobka' — qadoq.
// Ko'rsatishda mahsulot (yoki hujjat pozitsiyasi)ning o'z nomlari ishlatiladi: kg, litr, metr ... / karobka, qop, blok ...
import { t } from './lib.js';

export const UNITS = {
  dona: { label: 'dona', frac: false },
  kg: { label: 'kg', frac: true },
  g: { label: 'g', frac: true },
  l: { label: 'litr', frac: true },
  ml: { label: 'ml', frac: true },
  m: { label: 'metr', frac: true },
  m2: { label: 'm²', frac: true },
  pachka: { label: 'pachka', frac: false },
  quti: { label: 'quti', frac: false },
  juft: { label: 'juft', frac: false },
  komplekt: { label: 'komplekt', frac: false },
};
export const PACK_HINTS = ['karobka', 'qop', 'blok', 'yashik', 'pachka', 'rulon', 'paket', 'upakovka'];

// x — mahsulot (unit kodi bilan) yoki hujjat pozitsiyasi (base_unit nomi bilan)
export const baseName = (x) => t((x && (x.base_unit || (UNITS[x.unit] && x.unit !== 'karobka' ? UNITS[x.unit].label : ''))) || 'dona');
export const packName = (x) => t((x && x.pack_name) || 'karobka');
export const unitName = (x, unit) => (unit === 'karobka' ? packName(x) : baseName(x));
// Kasr miqdor (kg, litr, metr) mumkinmi
export const isFrac = (p) => !!(p && UNITS[p.unit] && UNITS[p.unit].frac);
