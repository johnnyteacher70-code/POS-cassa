// Logo: La Cherry rasmiy brend logotipi.
// Fayl: kasmetika_2 dagi 'la cherry.jpg ' asosida moslangan PNG formatlar.
// variant: 'full' — to'liq gerb (login va xaridor ekrani), 'h' — gorizontal (sidebar, shop, hujjatlar), 'mark' — kvadrat belgi (topbar, favicon)
// tone: 'silver' — to'q fonda (oq/kumush rang), 'print' — oq qog'ozda (to'q siyoh rang, chop etish uchun)

export const BRAND_NAME = "LA CHERRY";
const B = (typeof window !== 'undefined' && window.__BRAND) || {};
export const brand = {
  name: B.name || 'LA CHERRY',
  tagline: B.tagline || (B.name && B.name !== 'LA CHERRY' ? '' : 'PARFUM & COSMETICS'),
  logo: B.logo || '/brand/logo.png',
  color: B.color || '#d94680'
};
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rangni biroz to'qlashtirish/ochish (gradient ikkinchi uchi uchun)
function shade(hex, k) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}

// Asosiy rang butun interfeysga (tugmalar, havolalar)
if (typeof document !== 'undefined' && brand.color && shade(brand.color, 0)) {
  const st = document.createElement('style');
  st.textContent = `:root{--primary:${brand.color};--gold-dark:${shade(brand.color, -0.15)};--gold:${shade(brand.color, 0.25)};--primary-2:${shade(brand.color, 0.85)};--gold-light:${shade(brand.color, 0.85)}}
  .btn.primary{background:${brand.color}!important;border-color:${brand.color}!important}`;
  document.head.appendChild(st);
}

let seq = 0;

// Belgi: La Cherry rasmiy nishoni (mark.png / mark_print.png)
function mark(id, x = 0, y = 0, size = 64, tone = 'silver') {
  const isPrint = tone === 'print';
  const markImg = isPrint ? '/brand/mark_print.png' : (brand.logo && brand.logo !== '/brand/logo.png' ? brand.logo : '/brand/mark.png');
  return `<image href="${esc(markImg)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

const SANS = "'Inter Variable', Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

export function logoSvg(variant = 'h', tone = 'silver') {
  const id = 'brand-g' + ++seq;
  const isPrint = tone === 'print';
  const isColor = tone === 'color';
  const main = isColor ? '#831843' : isPrint ? '#1E1B4B' : '#FFFFFF';
  const sub = isColor ? '#be185d' : isPrint ? '#831843' : '#FDA4AF';
  const label = `role="img" aria-label="${esc(brand.name)}"`;
  const name = esc(brand.name), tag = esc((brand.tagline || 'PARFUM & COSMETICS').toUpperCase());

  // 1) Faqat belgi (mark): 64x64 yoki 512x512 kvadrat (topbar)
  if (variant === 'mark') {
    const markImg = isPrint ? '/brand/mark_print.png' : (brand.logo && brand.logo !== '/brand/logo.png' ? brand.logo : '/brand/mark.png');
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" ${label}>
      <title>${name}</title>
      <image href="${esc(markImg)}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>
    </svg>`;
  }

  // 2) To'liq / vertikal logo (full): Kirish sahifasi va Xaridor ekrani
  if (variant === 'full') {
    const isCustom = brand.logo && brand.logo !== '/brand/logo.png' && brand.logo !== '/brand-assets/logo.png';
    if (isCustom || (brand.name && brand.name !== 'LA CHERRY')) {
      return `<svg viewBox="0 0 240 145" xmlns="http://www.w3.org/2000/svg" ${label}>
        <title>${name}</title>
        <image href="${esc(brand.logo || '/brand/logo.png')}" x="10" y="0" width="220" height="95" preserveAspectRatio="xMidYMid meet"/>
        <text x="120" y="118" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="22" letter-spacing="2" fill="${main}">${name}</text>
        <text x="120" y="136" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="10.5" letter-spacing="4" fill="${sub}">${tag}</text>
      </svg>`;
    }
    const logoImg = isPrint ? '/brand/logo_print.png' : (brand.logo || '/brand/logo.png');
    return `<svg viewBox="0 0 621 377" xmlns="http://www.w3.org/2000/svg" ${label}>
      <title>${name}</title>
      <image href="${esc(logoImg)}" x="0" y="0" width="621" height="377" preserveAspectRatio="xMidYMid meet"/>
    </svg>`;
  }

  // 3) Gorizontal logo (h): Sidebar, Topbar, Shop va Hujjatlar
  const isCustom = brand.logo && brand.logo !== '/brand/logo.png' && brand.logo !== '/brand-assets/logo.png';
  if (isCustom || (brand.name && brand.name !== 'LA CHERRY')) {
    return `<svg viewBox="0 0 220 56" xmlns="http://www.w3.org/2000/svg" ${label}>
      <title>${name}</title>
      <image href="${esc(brand.logo || '/brand/logo.png')}" x="0" y="4" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>
      <text x="56" y="31" font-family="${SANS}" font-weight="800" font-size="${name.length > 14 ? 17 : 19}" letter-spacing="1.2" fill="${main}">${name}</text>
      <text x="57" y="47" font-family="${SANS}" font-weight="600" font-size="9" letter-spacing="${tag.length > 12 ? 1.5 : 3.5}" fill="${sub}">${tag}</text>
    </svg>`;
  }

  // Rasmiy La Cherry: haqiqiy la cherry rasmining o'zi
  const logoImg = isPrint ? '/brand/logo_print.png' : (brand.logo || '/brand/logo.png');
  return `<svg viewBox="0 0 621 377" xmlns="http://www.w3.org/2000/svg" ${label}>
    <title>${name}</title>
    <image href="${esc(logoImg)}" x="0" y="0" width="621" height="377" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;
}

// Vue komponenti (admin panel)
export const BrandLogo = {
  props: { variant: { type: String, default: 'h' }, tone: { type: String, default: 'silver' } },
  computed: { html() { return logoSvg(this.variant, this.tone); } },
  template: `<span class="brand-logo" :class="'bl-' + variant" v-html="html"></span>`,
};
