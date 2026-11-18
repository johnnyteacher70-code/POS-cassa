// Logo: Do'kon boshqaruvi rasmiy brend logotipi va yozuvi
export const BRAND_NAME = "Do'kon boshqaruvi";
const B = (typeof window !== 'undefined' && window.__BRAND) || {};
export const brand = {
  name: B.name || "Do'kon boshqaruvi",
  tagline: B.tagline || "",
  logo: (B.logo && B.logo !== '/brand/logo.png') ? B.logo : '',
  color: B.color || '#4f46e5'
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

const SANS = "'Inter Variable', Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

export function logoSvg(variant = 'h', tone = 'silver') {
  const id = 'brand-g' + ++seq;
  const isPrint = tone === 'print';
  const isColor = tone === 'color';
  const main = isColor ? '#0f172a' : isPrint ? '#1e1b4b' : '#ffffff';
  const sub = isColor ? '#475569' : isPrint ? '#64748b' : '#c7d2fe';
  const label = `role="img" aria-label="${esc(brand.name)}"`;
  const name = esc(brand.name);
  const tag = esc(brand.tagline || (isPrint ? "Do'kon boshqaruvi" : ''));

  // 1) Faqat belgi (mark): 64x64 kvadrat
  if (variant === 'mark') {
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" ${label}>
      <title>${name}</title>
      <rect width="64" height="64" rx="16" fill="url(#bg-mark-${id})"/>
      <defs>
        <linearGradient id="bg-mark-${id}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6366f1"/>
          <stop offset="1" stop-color="#4338ca"/>
        </linearGradient>
      </defs>
      <text x="32" y="43" text-anchor="middle" font-size="34">🏪</text>
    </svg>`;
  }

  // 2) To'liq / vertikal logo (full): Kirish sahifasi va Egasi paneli
  if (variant === 'full') {
    return `<svg viewBox="0 0 260 120" xmlns="http://www.w3.org/2000/svg" ${label}>
      <title>${name}</title>
      <rect x="98" y="4" width="64" height="64" rx="18" fill="url(#bg-full-${id})" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <defs>
        <linearGradient id="bg-full-${id}" x1="98" y1="4" x2="162" y2="68" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6366f1"/>
          <stop offset="1" stop-color="#3730a3"/>
        </linearGradient>
      </defs>
      <text x="130" y="48" text-anchor="middle" font-size="34">🏪</text>
      <text x="130" y="94" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="20" letter-spacing="-0.3" fill="${main}">${name}</text>
      <text x="130" y="112" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="10.5" letter-spacing="1" fill="${sub}">SAVDO VA KASSA TIZIMI</text>
    </svg>`;
  }

  // 3) Gorizontal logo (h): Sidebar, Topbar, Shop va Hujjatlar
  return `<svg viewBox="0 0 240 50" xmlns="http://www.w3.org/2000/svg" ${label}>
    <title>${name}</title>
    <rect x="2" y="6" width="38" height="38" rx="10" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>
    <text x="21" y="32" text-anchor="middle" font-size="22">🏪</text>
    <text x="48" y="32" font-family="${SANS}" font-weight="800" font-size="17" letter-spacing="-0.3" fill="${main}">${name}</text>
  </svg>`;
}

// Vue komponenti (admin panel)
export const BrandLogo = {
  props: { variant: { type: String, default: 'h' }, tone: { type: String, default: 'silver' } },
  computed: { html() { return logoSvg(this.variant, this.tone); } },
  template: `<span class="brand-logo" :class="'bl-' + variant" v-html="html"></span>`,
};
