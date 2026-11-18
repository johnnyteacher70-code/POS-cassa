// Shtrix-kod SVG (tashqi kutubxonasiz): 13 xonali to'g'ri EAN-13 bo'lsa — EAN-13, aks holda — Code 128 (B to'plami).
// Do'kon skanerlari ikkalasini ham o'qiydi.

const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232',
  '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113',
  '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123',
  '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221',
  '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241',
  '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311',
  '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

// Code 128B: kenglik naqshlari ketma-ketligi (bar, bo'sh joy, bar ...)
function code128(text) {
  const codes = [104];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    codes.push(c >= 32 && c <= 126 ? c - 32 : 0);
  }
  let sum = 104;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106);
  const widths = [];
  for (const c of codes) for (const w of C128[c]) widths.push(+w);
  return widths;
}

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function eanValid(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

// EAN-13: modullar qatori ('1' — qora)
function ean13(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  const par = EAN_PARITY[d[0]];
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]];
  return bits + '101';
}

// SVG satri. h — balandlik (mm), text — ostida raqam ko'rsatilsinmi
export function barcodeSvg(value, { h = 12, text = true } = {}) {
  const v = String(value || '').trim();
  if (!v) return '';
  let rects = '';
  let x = 10;   // chap bo'sh maydon (quiet zone)
  if (eanValid(v)) {
    const bits = ean13(v);
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') rects += `<rect x="${x + i}" y="0" width="1" height="${h * 4}"/>`;
    x += bits.length;
  } else {
    let black = true;
    for (const w of code128(v)) { if (black) rects += `<rect x="${x}" y="0" width="${w}" height="${h * 4}"/>`; x += w; black = !black; }
  }
  const W = x + 10;
  const H = h * 4 + (text ? 12 : 0);
  const label = text ? `<text x="${W / 2}" y="${h * 4 + 10}" font-size="10" text-anchor="middle" font-family="monospace">${v.replace(/[<&>]/g, '')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:auto;display:block" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g>${label}</svg>`;
}
