// Biznes darajasidagi sozlamalar (main.db business jadvali): nomi, shiori, logotip, asosiy rang, soha, litsenziya ...
const main = require('./main_db');

const get = (key, def = '') => { const r = main.prepare('SELECT value FROM business WHERE key=?').get(key); return r && r.value !== null ? r.value : def; };
const set = (key, value) => main.prepare('INSERT INTO business (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value === null ? null : String(value));
const all = () => Object.fromEntries(main.prepare('SELECT key, value FROM business').all().map((r) => [r.key, r.value]));

// Sahifalarga beriladigan brend (hammaga ochiq: login sahifasi va katalogda ham kerak)
function publicBrand() {
  const logo = get('brand_logo') || '';
  return {
    name: get('brand_name') || "Do'kon boshqaruvi",
    tagline: get('brand_tagline') || '',
    color: get('brand_color') || '#4f46e5',
    logo: (logo === '/brand/logo.png') ? '' : logo,
    industry: get('industry'),
  };
}

// Soha → mahsulot formasidagi ixtiyoriy maydonlar (public/admin/js/industries.js bilan bir xil)
const INDUSTRY_FIELDS = {
  general: ['brand'], grocery: ['brand', 'volume'], cosmetics: ['brand', 'volume', 'size', 'audience', 'colors'], household: ['brand', 'volume'],
  building: ['brand', 'size'], clothing: ['brand', 'size', 'audience', 'colors'], pharmacy: ['brand', 'volume'], stationery: ['brand', 'colors'],
  auto: ['brand'], electronics: ['brand', 'colors'],
};

// Yangi filialga biznes sozlamalari: soha, mahsulot maydonlari, savdo turi
function branchDefaults() {
  const out = {};
  const ind = get('industry') || 'cosmetics';
  if (INDUSTRY_FIELDS[ind]) { out.industry = ind; out.product_fields = INDUSTRY_FIELDS[ind].join(','); }
  if (get('sale_mode') === 'retail') { out.receipt_auto = '1'; }
  return out;
}

module.exports = { get, set, all, publicBrand, branchDefaults, INDUSTRY_FIELDS };
