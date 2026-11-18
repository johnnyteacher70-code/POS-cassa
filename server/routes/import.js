// Mahsulotlarni Excel orqali import / eksport (rasmlari bilan)
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { canonical, mergeCaseVariants, parseAudience, parseColors, colorsOf, setColors, colorMap } = require('../colors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const db = require('../db');
const { need, can, canAny } = require('./auth');
const { now, str, int, normText, httpError, audit, getSetting } = require('../util');
const { stockMap } = require('../ledger');

const router = express.Router();
const { currentUploadsDir, currentUploadsUrl } = require('../branch_db');
const { keepContext } = require('../context');
const { fetchLimited } = require('../safe_fetch');
const { optimizeImageBuffer, saveOptimizedImage } = require('../image_util');
const { DATA_DIR } = require('../config');

// Vaqtinchalik import fayllari saqlanadigan papka
const IMPORT_TMP_DIR = path.join(DATA_DIR, 'tmp_import');
try { fs.mkdirSync(IMPORT_TMP_DIR, { recursive: true }); } catch { /* jim */ }

// Eskirgan vaqtinchalik import fayllarni tozalash (1 soatdan oshgan)
function cleanupOldImportFiles() {
  try {
    const nowTs = Date.now();
    for (const f of fs.readdirSync(IMPORT_TMP_DIR)) {
      const p = path.join(IMPORT_TMP_DIR, f);
      const st = fs.statSync(p);
      if (nowTs - st.mtimeMs > 3600 * 1000) fs.rmSync(p, { force: true });
    }
  } catch { /* jim */ }
}
cleanupOldImportFiles();
setInterval(cleanupOldImportFiles, 30 * 60 * 1000).unref();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMPORT_TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.xlsx';
    cb(null, `import_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

// Katta hajmdagi Excel fayllar (rasmli mahsulotlar 100-250 MB) uchun diskka yoziladi
const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB gacha ruxsat
});

// Ustunlar: kalit, sarlavha (uz/ru), sarlavhani tanish uchun so'zlar (kirill avtomatik lotinga o'giriladi)
const COLUMNS = [
  { key: 'name', uz: 'Nomi', ru: 'Название', match: ['nomi', 'nom', 'mahsulot', 'name', 'nazvanie', 'naimenovanie'], width: 34 },
  { key: 'brand', uz: 'Brend', ru: 'Бренд', match: ['brend', 'brand'], width: 16 },
  { key: 'category', uz: 'Kategoriya', ru: 'Категория', match: ['kategoriya', 'kategoria', 'kategoriyasi', 'turi', 'turlari', 'bo\'lim', 'bolim', 'category', 'categories', 'razdel', 'gruppa', 'guruhi', 'gruppasi'], width: 18 },
  { key: 'volume', uz: 'Hajmi', ru: 'Объём', match: ['hajm', 'obem', 'obyom', 'volume', 'ml'], width: 10 },
  { key: 'audience', uz: 'Kimlar uchun', ru: 'Для кого', match: ['kimlar uchun', 'kim uchun', 'kimlar', 'jinsi', 'jins', 'dlya kogo', 'gender'], width: 16 },
  { key: 'size', uz: "O'lcham", ru: 'Размер', match: ['olcham', 'olchami', 'razmer', 'size'], width: 10 },
  { key: 'colors', uz: 'Rang (vergul bilan)', ru: 'Цвета (через запятую)', match: ['rang', 'rangi', 'ranglar', 'tsvet', 'cvet', 'svet', 'color', 'colour'], width: 22 },
  { key: 'box_qty', uz: 'Karobkada (dona)', ru: 'В коробке (шт)', match: ['karobkada dona', 'karobkada', 'karobkadagi', 'kar dona', 'box qty', 'v korobke', 'kol vo'], width: 14 },
  { key: 'image', uz: 'Rasm', ru: 'Фото', match: ['rasmi', 'rasm', 'foto', 'image', 'surat', 'photo'], width: 16 },
  { key: 'piece_price', uz: 'Dona narxi', ru: 'Цена за штуку', match: ['sotuv narxi', 'sotuv narx', 'dona narx', 'narx dona', 'narxi dona', 'narx', 'price', 'sena za sht', 'sena sht', 'sena'], width: 14 },
  { key: 'description', uz: 'Tavsif', ru: 'Описание', match: ['tavsif', 'izoh', 'description', 'opisanie'], width: 30 },
  // Quyidagilar shablonda yo'q, lekin faylda bo'lsa o'qiladi
  { key: 'box_price', uz: 'Karobka narxi', ru: 'Цена коробки', match: ['karobka narx', 'narx karobka', 'box price', 'sena korobki', 'sena za korobku'], width: 15 },
  { key: 'sku', uz: 'Artikul', ru: 'Артикул', match: ['kodi', 'kod', 'artikul', 'sku', 'code'], width: 14 },
  { key: 'stock_in_box', uz: 'Kirim / Qoldiq (karobka)', ru: 'Приход / Остаток (коробок)', match: ['kirim karobka', 'prixod korob', 'qoldiq karobka', 'astatka karobka', 'ostatka karobka', 'ostatok korob', 'astatka kar', 'ostatok kor', 'astatka korobka'], width: 14 },
  { key: 'stock_in', uz: 'Kirim / Qoldiq (dona)', ru: 'Приход / Остаток (шт)', match: ['kirim dona', 'kirim', 'keldi', 'prixod', 'astatka', 'ostatka', 'ostatok', 'qoldiq', 'qoldiq dona', 'astatka dona', 'ostatka dona', 'ostatok sht', 'ostatok shtuk', 'astatka sht', 'ostatoq'], width: 14 },
  { key: 'in_shop', uz: "Katalogda (ha/yo'q)", ru: 'В каталоге (да/нет)', match: ['katalog'], width: 12 },
  // Universal savdo maydonlari
  { key: 'barcode', uz: 'Shtrix-kod', ru: 'Штрихкод', match: ['shtrix', 'shtrixkod', 'barcode', 'shtrix kod', 'ean'], width: 16 },
  { key: 'unit', uz: "O'lchov birligi (dona, kg, litr, metr)", ru: 'Ед. изм. (шт, кг, л, м)', match: ['olchov', 'birligi', 'ed izm', 'edinitsa', 'unit'], width: 14 },
  { key: 'pack_name', uz: 'Qadoq nomi (karobka, qop, blok)', ru: 'Упаковка (коробка, мешок, блок)', match: ['qadoq', 'upakovka', 'pack'], width: 16 },
  { key: 'cost_price', uz: 'Tannarx (kelish narxi)', ru: 'Себестоимость (закупочная)', match: ['tannarx', 'kelish narx', 'sebestoimost', 'zakupochn', 'cost'], width: 14 },
  { key: 'min_stock', uz: 'Minimal qoldiq', ru: 'Мин. остаток', match: ['minimal', 'min qoldiq', 'min ostatok'], width: 12 },
  { key: 'mxik', uz: 'MXIK (IKPU)', ru: 'ИКПУ (МХИК)', match: ['mxik', 'ikpu'], width: 20 },
];
// O'lchov birligi matni → kod (o'zbekcha / ruscha / qisqa yozuvlar)
const UNIT_WORDS = { dona: 'dona', sht: 'dona', korobochka: 'quti', l_: 'l', shtuka: 'dona', pcs: 'dona', kg: 'kg', kilogramm: 'kg', g: 'g', gr: 'g', gramm: 'g', l: 'l', litr: 'l', ml: 'ml',
  m: 'm', metr: 'm', m2: 'm2', 'm²': 'm2', kvm: 'm2', pachka: 'pachka', quti: 'quti', juft: 'juft', para: 'juft', komplekt: 'komplekt', nabor: 'komplekt' };
const unitCode = (v) => { const t = normText(v).replace(/[.\s]/g, ''); return t ? UNIT_WORDS[t] || null : null; };
const numF = (v) => { if (typeof v === 'number') return v; const n = Number(cellText(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
// Shablon / eksport ustunlari: Nomi, Shtrix-kod, Artikul, Brend, Kategoriya, Birlik, Qadoq, Karobkada (dona), Rasm, Dona narxi, Tannarx, Minimal qoldiq, ...
const TEMPLATE_KEYS = ['name', 'barcode', 'sku', 'brand', 'category', 'unit', 'pack_name', 'box_qty', 'image', 'piece_price', 'cost_price', 'min_stock', 'audience', 'volume', 'size', 'colors', 'description'];
// Narx turlari ustunlari: "Narx: Ulgurji" / "Цена: Опт"
const levelCols = () => db.prepare('SELECT id, name FROM price_levels WHERE deleted_at IS NULL ORDER BY id').all();
function templateColumns() { return TEMPLATE_KEYS.map((k) => COLUMNS.find((c) => c.key === k)); }


function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    if (v.hyperlink) return v.hyperlink;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.error) return '';
    return '';
  }
  return String(v).trim();
}

function cleanBarcode(v) {
  const s = cellText(v).trim();
  if (!s) return '';
  // Faqat raqam va probellardan iborat bo'lsa (masalan: 478 000 005) — probellarni olib tashlaymiz
  if (/^[\d\s]+$/.test(s)) return s.replace(/\s+/g, '').slice(0, 64);
  // Matnli kodlar bo'lsa ("JIGAR PADVODKA", "ALOY PILINK", "042Z1") — probellari bilan saqlanadi
  return s.slice(0, 64);
}

// Raqam: "320 000", "320.000", "320,000", "1.450.000" — ming ajratkichlari; "12,5" / "12.50" — kasr
function money(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  let s = cellText(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');       // faqat ming ajratkichlari
  else s = s.replace(/[.,](?=.*[.,])/g, '').replace(',', '.');               // oxirgisi — kasr belgisi
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : null;
}

function yesNo(v) {
  const t = normText(cellText(v));
  if (!t) return null;
  return ['yoq', 'no', 'net', '0', 'false'].includes(t) ? 0 : 1;
}

// Sarlavha qatorini topish va ustunlarni aniqlash
function mapHeader(ws) {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map = {};
    const levels = levelCols();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const raw = cellText(cell.value);
      const lm = /^(narx|цена|narxi)\s*[:\-]\s*(.+)$/i.exec(raw);
      const lvl = lm && levels.find((l) => l.name.toLowerCase() === lm[2].trim().toLowerCase());
      if (lvl) { map['lvl:' + lvl.id] = col; return; }
      const h = normText(raw);
      if (!h) return;
      // Eng uzun mos keladigan so'z ustun bo'yicha g'olib (masalan "karobka narxi" vs "dona")
      let best = null;
      for (const c of COLUMNS) {
        for (const m of c.match) {
          if (h.includes(m) && (!best || m.length > best.len)) best = { key: c.key, len: m.length };
        }
      }
      if (best && !map[best.key]) map[best.key] = col;
    });
    if (map.name) return { headerRow: r, map };
  }
  throw httpError(400, "Sarlavha qatori topilmadi. Birinchi qatorda \"Nomi\" ustuni bo'lishi kerak (shablonni yuklab oling).");
}

// --- Rasmlar: 1) katak ustidagi (floating) rasmlar ---
function floatingImages(wb, ws, imageCol, { skipBuffers = false } = {}) {
  const out = new Map(); // row(1-based) -> {buffer, ext}
  for (const img of ws.getImages()) {
    const tl = img.range && img.range.tl;
    if (!tl) continue;
    const col = (tl.nativeCol ?? Math.floor(tl.col)) + 1;
    const row = (tl.nativeRow ?? Math.floor(tl.row)) + 1 + ((tl.nativeRowOff || 0) > 120000 ? 1 : 0);
    if (imageCol && Math.abs(col - imageCol) > 1) continue; // boshqa ustundagi rasm (logo va h.k.)
    if (skipBuffers) {
      if (!out.has(row)) out.set(row, { ext: 'png' });
    } else {
      const media = wb.getImage(Number(img.imageId));
      if (media && media.buffer && !out.has(row)) out.set(row, { buffer: media.buffer, ext: media.extension || 'png' });
    }
  }
  return out;
}

// --- Rasmlar: 2) Excel 365 "Place in cell" (rasm katak ichida) ---
const attr = (s, name) => { const m = s.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
const blocks = (xml, tag) => xml ? [...xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>|<${tag}[^>]*/>`, 'g'))].map((m) => m[0]) : [];

async function inCellImages(zipOrBuffer, sheetIndex, { skipBuffers = false } = {}) {
  const out = new Map();
  let zip = zipOrBuffer;
  if (!zip || !zip.file) {
    try { zip = await JSZip.loadAsync(zipOrBuffer); } catch { return out; }
  }
  if (!zip) return out;
  const read = async (p) => (zip.file(p) ? zip.file(p).async('string') : null);
  const rvXml = await read('xl/richData/rdrichvalue.xml');
  if (!rvXml) return out;

  // Varaq faylini topish
  const wbXml = await read('xl/workbook.xml');
  const wbRels = await read('xl/_rels/workbook.xml.rels');
  const sheets = blocks(wbXml, 'sheet');
  const rid = sheets[sheetIndex] && (attr(sheets[sheetIndex], 'r:id'));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  for (const rel of blocks(wbRels, 'Relationship')) {
    if (attr(rel, 'Id') === rid) sheetPath = 'xl/' + attr(rel, 'Target').replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheetXml = await read(sheetPath);
  if (!sheetXml) return out;

  // vm -> rich value index
  const meta = await read('xl/metadata.xml');
  const futureIdx = [];
  const fm = meta && meta.match(/<futureMetadata[^>]*name="XLRICHVALUE"[\s\S]*?<\/futureMetadata>/);
  if (fm) for (const bk of blocks(fm[0], 'bk')) { const m = bk.match(/rvb[^>]*\bi="(\d+)"/); futureIdx.push(m ? +m[1] : null); }
  const valueMeta = [];
  const vmBlock = meta && meta.match(/<valueMetadata[\s\S]*?<\/valueMetadata>/);
  if (vmBlock) for (const bk of blocks(vmBlock[0], 'bk')) { const m = bk.match(/<rc[^>]*\bv="(\d+)"/); valueMeta.push(m ? +m[1] : null); }
  const vmToRv = (vm) => {
    const v = valueMeta[vm - 1];
    if (v !== undefined && v !== null && futureIdx[v] !== undefined && futureIdx[v] !== null) return futureIdx[v];
    return vm - 1;
  };

  // Rich value -> rasm rel index
  const structXml = await read('xl/richData/rdrichvaluestructure.xml');
  const structKeyPos = blocks(structXml, 's').map((s) => {
    const keys = [...s.matchAll(/<k[^>]*\bn="([^"]*)"/g)].map((m) => m[1]);
    const i = keys.indexOf('_rvRel:LocalImageIdentifier');
    return i >= 0 ? i : 0;
  });
  const rvs = blocks(rvXml, 'rv').map((rv) => {
    const s = +(attr(rv, 's') || 0);
    const vals = [...rv.matchAll(/<v[^>]*>([^<]*)<\/v>/g)].map((m) => m[1]);
    return +vals[structKeyPos[s] ?? 0];
  });

  // rel index -> media fayl
  const relXml = await read('xl/richData/richValueRel.xml');
  const relRels = await read('xl/richData/_rels/richValueRel.xml.rels');
  const relIds = [...(relXml || '').matchAll(/<rel[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const targets = {};
  for (const rel of blocks(relRels, 'Relationship')) targets[attr(rel, 'Id')] = attr(rel, 'Target');

  for (const c of sheetXml.matchAll(/<c\b[^>]*\bvm="(\d+)"[^>]*>/g)) {
    const ref = attr(c[0], 'r');
    if (!ref) continue;
    const row = +ref.replace(/^[A-Z]+/, '');
    const col = ref.replace(/\d+$/, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
    const relIdx = rvs[vmToRv(+c[1])];
    const target = targets[relIds[relIdx]];
    if (!target) continue;
    const file = zip.file('xl/' + target.replace(/^\.\.\//, '').replace(/^\/?xl\//, ''));
    if (!file) continue;
    if (skipBuffers) {
      if (!out.has(row)) out.set(row, { ext: path.extname(target).slice(1) || 'png', col });
    } else {
      const buf = await file.async('nodebuffer');
      if (!out.has(row)) out.set(row, { buffer: buf, ext: path.extname(target).slice(1) || 'png', col });
    }
  }
  return out;
}

function productKey(p) {
  return p.sku ? 'sku:' + normText(p.sku) : 'nv:' + normText(p.name) + '|' + normText(p.volume);
}

// Zip-bomba himoyasi: kichik .xlsx fayl ochilganda gigabaytlarga yoyilib, server xotirasini to'ldirmasin
const MAX_UNZIPPED = 1024 * 1024 * 1024; // 1 GB (katta rasmli .xlsx fayllar uchun)
async function getZip(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { return null; }   // .xlsx emas — keyin ExcelJS xato beradi
  let total = 0;
  for (const f of Object.values(zip.files)) total += (f._data && f._data.uncompressedSize) || 0;
  if (total > MAX_UNZIPPED) throw httpError(400, "Fayl ichidagi ma'lumot juda katta (1 GB dan ortiq)");
  return zip;
}

async function parse(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const zip = await getZip(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    if (typeof input === 'string') await wb.xlsx.readFile(input);
    else await wb.xlsx.load(buffer);
  } catch {
    throw httpError(400, "Faylni o'qib bo'lmadi. .xlsx formatida saqlang (Excel → Save As → Excel Workbook).");
  }
  const sheetIndex = Math.max(0, wb.worksheets.findIndex((w) => /mahsulot|tovar/.test(normText(w.name))));
  const ws = wb.worksheets[sheetIndex];
  if (!ws) throw httpError(400, "Faylda varaq yo'q");
  const { headerRow, map } = mapHeader(ws);
  const floating = floatingImages(wb, ws, map.image);
  const inCell = await inCellImages(zip || buffer, sheetIndex);

  const existing = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL').all();
  const byKey = new Map();
  const byBarcode = new Map();
  for (const p of existing) {
    // Nomi bir xil mahsulotlar ko'p (taroq, krem ...) — shuning uchun ARTIKUL yoki SHTRIX-KOD bo'yicha moslanadi
    if (p.sku) byKey.set(productKey(p), p);
    if (p.barcode) byBarcode.set(p.barcode, p);
  }
  const lvlKeys = Object.keys(map).filter((k) => k.startsWith('lvl:'));

  const rows = [];
  const seen = new Set();
  // Fayl ichida ham bir xil kategoriya / brend bitta yozilishda
  const canon = { category: new Map(), brand: new Map() };
  const one = (f, v) => { const c = canonical(f, v); if (!c) return c; const k = c.toLowerCase(); if (!canon[f].has(k)) canon[f].set(k, c); return canon[f].get(k); };
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k) => (map[k] ? row.getCell(map[k]).value : null);
    const name = cellText(get('name'));
    const anyValue = COLUMNS.some((c) => map[c.key] && cellText(get(c.key)));
    if (!name && !anyValue && !floating.has(r) && !inCell.has(r)) continue;

    const item = {
      row: r, name, brand: one('brand', cellText(get('brand'))), category: one('category', cellText(get('category'))), size: cellText(get('size')), audience: parseAudience(cellText(get('audience'))), colors: parseColors(cellText(get('colors'))), volume: cellText(get('volume')), sku: cellText(get('sku')).trim().slice(0, 50),
      piece_price: money(get('piece_price')), box_qty: money(get('box_qty')), box_price: money(get('box_price')),
      stock_in: money(get('stock_in')), stock_in_box: money(get('stock_in_box')), description: cellText(get('description')), in_shop: yesNo(get('in_shop')),
      barcode: cleanBarcode(get('barcode')), unit: null, pack_name: cellText(get('pack_name')).slice(0, 30),
      cost_price: money(get('cost_price')), min_stock: numF(get('min_stock')), mxik: cellText(get('mxik')).replace(/\D/g, '').slice(0, 20),
      prices: Object.fromEntries(lvlKeys.map((k) => [k.slice(4), money(row.getCell(map[k]).value)]).filter(([, v]) => v !== null && v > 0)),
      image_url: '', errors: [],
    };
    if (item.sku && !item.barcode) item.barcode = item.sku;
    if (item.barcode && !item.sku) item.sku = item.barcode;
    const unitRaw = cellText(get('unit'));
    const imgRaw = get('image');
    const imgFormula = imgRaw && typeof imgRaw === 'object' && imgRaw.formula ? String(imgRaw.formula) : '';
    const fm = imgFormula.match(/IMAGE\(\s*"(https?:\/\/[^"]+)"/i);
    const imgText = fm ? fm[1] : cellText(imgRaw);
    if (/^https?:\/\//i.test(imgText)) item.image_url = imgText;
    const img = inCell.get(r) || floating.get(r);
    if (img) {
      const ext = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(String(img.ext).toLowerCase()) ? String(img.ext).toLowerCase() : 'png';
      img.path = currentUploadsUrl() + crypto.createHash('sha1').update(img.buffer).digest('hex').slice(0, 24) + '.' + ext;
    }
    item.image = img || null;
    item.has_image = !!(img || item.image_url);

    // Hech narsa majburiy emas: kamchiliklar xato emas — tuzatiladi va "izoh"da ko'rsatiladi
    item.notes = [];
    if (unitRaw) { item.unit = unitCode(unitRaw); if (!item.unit) item.notes.push(`noma'lum birlik "${unitRaw}" — dona`); }
    if (item.cost_price !== null && item.cost_price < 0) item.cost_price = null;
    if (item.min_stock !== null && item.min_stock < 0) item.min_stock = null;
    if (!name) {
      item.name = [item.brand, item.category, item.volume, item.size].filter(Boolean).join(' ') || `Mahsulot (${r}-qator)`;
      item.notes.push("nomi yo'q — avtomatik nom");
    }
    if (item.box_qty !== null && item.box_qty < 1) { item.box_qty = null; item.notes.push('karobkadagi dona noto\'g\'ri — 1 deb olindi'); }
    for (const k of ['piece_price', 'box_price']) if (item[k] !== null && item[k] < 0) { item[k] = null; item.notes.push('manfiy narx — olib tashlandi'); }
    // Manfiy kirim omborni jimgina kamaytirib yuborardi — olib tashlanadi (hisobdan chiqarish qo'lda qilinadi)
    for (const k of ['stock_in', 'stock_in_box']) if (item[k] && item[k] < 0) { item[k] = null; item.notes.push('manfiy kirim — olib tashlandi'); }
    
    // Artikul va shtrix-kod boricha qabul qilinadi — takrorlangan bo'lsa ham o'chirilmaydi
    let key = item.sku ? productKey(item) : null;
    const isDupInFile = (key && seen.has(key)) || (item.barcode && seen.has('bc:' + item.barcode));
    if (key) seen.add(key);
    if (item.barcode) seen.add('bc:' + item.barcode);

    // Agar fayl ichida avvalroq shu artikul/shtrix-kod kelgan bo'lsa — yangi alohida mahsulot sifatida yaratiladi (lekin artikul va shtrix-kod saqlanadi!)
    const ex = isDupInFile ? null : ((key ? byKey.get(key) : null) || (item.barcode ? byBarcode.get(item.barcode) : null) || null);
    // Kirim karobkada berilgan bo'lsa — donaga o'giriladi (ombor ichkarida donada yuritiladi)
    const boxQtyEff = item.box_qty ?? (ex ? ex.box_qty : 1);
    if (item.stock_in_box) item.stock_in = (item.stock_in || 0) + item.stock_in_box * boxQtyEff;
    item.stock_in_boxes = item.stock_in ? +(item.stock_in / boxQtyEff).toFixed(2) : 0;
    // Optom narx donaga: karobka narxi = dona narxi × karobkadagi dona.
    // Faylda faqat karobka narxi bo'lsa — dona narxi undan hisoblanadi.
    if (item.piece_price !== null) item.box_price = item.piece_price * boxQtyEff;
    else if (item.box_price !== null) item.piece_price = Math.round(item.box_price / boxQtyEff);
    item.existing_id = ex ? ex.id : null;
    item.action = item.errors.length ? 'error' : ex ? 'update' : 'create';
    if (ex && !item.errors.length) {
      const ch = [];
      if (item.piece_price !== null && item.piece_price !== ex.piece_price) ch.push(`dona narxi ${ex.piece_price} → ${item.piece_price}`);
      if (item.box_price !== null && item.box_price !== ex.box_price) ch.push(`karobka narxi ${ex.box_price} → ${item.box_price}`);
      if (item.box_qty !== null && item.box_qty !== ex.box_qty) ch.push(`karobkada ${ex.box_qty} → ${item.box_qty}`);
      if (item.brand && item.brand !== ex.brand) ch.push('brend');
      if (item.category && item.category !== ex.category) ch.push('kategoriya');
      if (item.size && item.size !== ex.size) ch.push("o'lcham");
      if (item.audience && item.audience !== ex.audience) ch.push('kimlar uchun');
      if (item.colors.length && item.colors.join(', ') !== colorsOf(ex.id).join(', ')) ch.push('ranglar');
      if (item.description && item.description !== ex.description) ch.push('tavsif');
      if ((img && img.path !== ex.image) || (item.image_url && item.image_url !== ex.image)) ch.push('rasm');
      if (item.in_shop !== null && item.in_shop !== ex.in_shop) ch.push(item.in_shop ? 'katalogga qo\'shiladi' : 'katalogdan olinadi');
      if (item.barcode && item.barcode !== ex.barcode) ch.push('shtrix-kod');
      if (item.unit && item.unit !== ex.unit) ch.push(`birlik ${ex.unit} → ${item.unit}`);
      if (item.pack_name && item.pack_name !== ex.pack_name) ch.push('qadoq nomi');
      if (item.cost_price !== null && item.cost_price !== Math.round(ex.cost_price)) ch.push(`tannarx ${Math.round(ex.cost_price)} → ${item.cost_price}`);
      if (item.min_stock !== null && item.min_stock !== ex.min_stock) ch.push('minimal qoldiq');
      if (item.mxik && item.mxik !== ex.mxik) ch.push('MXIK');
      if (Object.keys(item.prices).length) ch.push('narx turlari');
      item.changes = ch;
    }
    rows.push(item);
  }
  return rows;
}

// Rasm mazmuni bo'yicha nomlanadi: bir xil rasm qayta yuklansa yangi fayl yaratilmaydi
function saveImage(img, written) {
  const file = path.join(currentUploadsDir(), path.basename(img.path));
  if (!fs.existsSync(file)) { fs.writeFileSync(file, img.buffer); written.push(file); }
  return img.path;
}

// Havoladagi rasmni serverga yuklab olish (tashqi sayt rasmni o'chirsa ham katalogda qoladi).
// Faqat haqiqiy rasm (JPEG/PNG/GIF/WEBP), 8 MB gacha; bo'lmasa — havola o'zicha qoladi.
function imageExt(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.slice(0, 4).toString() === 'GIF8') return 'gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
async function downloadImage(url) {
  try {
    const buf = await fetchLimited(url);   // ichki tarmoq manzillari, ortiqcha hajm va cheksiz redirect rad etiladi
    const ext = buf && imageExt(buf);
    if (!ext) return null;
    return { buffer: buf, ext, path: currentUploadsUrl() + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 24) + '.' + ext };
  } catch { return null; }
}

// Import: ?commit=1 bo'lmasa — faqat oldindan ko'rish
router.post('/products', need('products.import'), keepContext(upload.single('file')), async (req, res) => {
  const isCommit = req.query.commit === '1';
  const token = (req.query.token || (req.body && req.body.token) || '').trim();

  let targetPath = null;
  let originalName = 'fayl.xlsx';
  let isTempSession = false;

  if (req.file) {
    targetPath = req.file.path;
    originalName = req.file.originalname || originalName;
  } else if (isCommit && token && /^[a-zA-Z0-9_-]+$/.test(token)) {
    const candidate = path.join(IMPORT_TMP_DIR, `${token}.xlsx`);
    if (fs.existsSync(candidate)) {
      targetPath = candidate;
      isTempSession = true;
      const metaPath = path.join(IMPORT_TMP_DIR, `${token}.meta`);
      if (fs.existsSync(metaPath)) {
        try { originalName = fs.readFileSync(metaPath, 'utf8').trim() || originalName; } catch {}
      }
    } else {
      throw httpError(400, "Import sessiyasi eskirgan yoki topilmadi. Faylni qayta yuklang.");
    }
  }

  if (!targetPath) throw httpError(400, 'Excel faylni tanlang');

  try {
    if (!isCommit) {
      // 1. Oldindan ko'rish (preview)
      const sessionToken = crypto.randomBytes(16).toString('hex');
      const sessionFile = path.join(IMPORT_TMP_DIR, `${sessionToken}.xlsx`);
      const sessionMeta = path.join(IMPORT_TMP_DIR, `${sessionToken}.meta`);

      try {
        fs.renameSync(targetPath, sessionFile);
      } catch {
        fs.copyFileSync(targetPath, sessionFile);
        try { fs.rmSync(targetPath, { force: true }); } catch {}
      }
      fs.writeFileSync(sessionMeta, originalName, 'utf8');

      const rows = await parse(sessionFile);
      const summary = {
        total: rows.length, create: rows.filter((r) => r.action === 'create').length,
        update: rows.filter((r) => r.action === 'update').length, error: rows.filter((r) => r.action === 'error').length,
        images: rows.filter((r) => r.has_image).length, stock_in: rows.reduce((a, r) => a + (r.action !== 'error' && r.stock_in > 0 ? r.stock_in : 0), 0),
      };
      const view = rows.map(({ image, ...r }) => r);
      return res.json({ token: sessionToken, summary, rows: view });
    }

    // 2. Tasdiqlash va bazaga saqlash (commit)
    const rows = await parse(targetPath);
    const summary = {
      total: rows.length, create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length, error: rows.filter((r) => r.action === 'error').length,
      images: rows.filter((r) => r.has_image).length, stock_in: rows.reduce((a, r) => a + (r.action !== 'error' && r.stock_in > 0 ? r.stock_in : 0), 0),
    };

    // Havoladagi rasmlar (4 tadan parallel)
    const toFetch = rows.filter((r) => r.action !== 'error' && !r.image && r.image_url);
    for (let i = 0; i < toFetch.length; i += 4) {
      await Promise.all(toFetch.slice(i, i + 4).map(async (r) => { const img = await downloadImage(r.image_url); if (img) r.image = img; }));
    }

    const written = [];
    // Barcha rasmlarni (Excel ichidagi va havoladagi) tiniqligini saqlab, kompressiya qilib saqlash
    // Takroriy rasmlarni keshlaymiz — bir xil rasm ko'p marta kelsa sharp qayta ishlamaydi
    const toOptimize = rows.filter((r) => r.action !== 'error' && r.image && r.image.buffer);
    const optCache = new Map();
    for (let i = 0; i < toOptimize.length; i += 4) {
      await Promise.all(toOptimize.slice(i, i + 4).map(async (r) => {
        const hash = crypto.createHash('sha1').update(r.image.buffer).digest('hex');
        if (optCache.has(hash)) {
          r.image_saved_url = optCache.get(hash);
          return;
        }
        try {
          const saved = await saveOptimizedImage(r.image.buffer, currentUploadsDir(), currentUploadsUrl(), written);
          r.image_saved_url = saved.path;
          optCache.set(hash, saved.path);
        } catch {
          const savedPath = saveImage(r.image, written);
          r.image_saved_url = savedPath;
          optCache.set(hash, savedPath);
        }
      }));
    }

    const t = now();
    const ins = db.prepare(`INSERT INTO products (name,brand,category,size,audience,volume,sku,piece_price,box_price,box_qty,description,image,in_shop,active,
        barcode,unit,pack_name,cost_price,min_stock,mxik,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`);
    const withCost = can(req, 'products.cost');
    const setPrice = db.prepare(`INSERT INTO product_prices (product_id,level_id,piece_price,box_price) VALUES (?,?,?,?)
      ON CONFLICT(product_id, level_id) DO UPDATE SET piece_price=excluded.piece_price, box_price=excluded.box_price`);
    // Shtrix-kod boricha saqlanadi
    const saveBarcode = (code) => (code ? String(code).trim().slice(0, 64) : '');
    const move = db.prepare('INSERT INTO stock_moves (product_id,qty_pieces,date,note,cost,created_by,created_at) VALUES (?,?,?,?,?,?,?)');
    let created = 0, updated = 0, stock = 0;
    try {
      db.transaction(() => {
        for (const r of rows) {
          if (r.action === 'error') continue;
          let image = r.image_saved_url || r.image_url || '';
          if (!image && r.image) image = saveImage(r.image, written);
          let id = r.existing_id;
          if (r.action === 'create') {
            const boxQty = r.box_qty || 1;
            const piece = r.piece_price || 0;
            id = ins.run(r.name, r.brand, r.category, r.size, r.audience, r.volume, r.sku, piece, r.box_price ?? piece * boxQty, boxQty, r.description, image,
              r.in_shop ?? 1, saveBarcode(r.barcode), r.unit || 'dona', r.pack_name || 'karobka', withCost ? r.cost_price || 0 : 0, r.min_stock || 0, r.mxik, t, t).lastInsertRowid;
            created++;
          } else {
            const ex = db.prepare('SELECT * FROM products WHERE id=?').get(id);
            const boxQty = r.box_qty ?? ex.box_qty;
            db.prepare(`UPDATE products SET brand=?, category=?, size=?, audience=?, sku=?, piece_price=?, box_qty=?, box_price=?, description=?, image=?, in_shop=?, updated_at=? WHERE id=?`).run(
              r.brand || ex.brand, r.category || ex.category, r.size || ex.size, r.audience || ex.audience, r.sku || ex.sku, r.piece_price ?? ex.piece_price, boxQty,
              r.box_price ?? ex.box_price,
              r.description || ex.description, image || ex.image, r.in_shop ?? ex.in_shop, t, id);
            db.prepare('UPDATE products SET barcode=?, unit=?, pack_name=?, min_stock=?, mxik=? WHERE id=?').run(
              r.barcode !== undefined && r.barcode !== null && r.barcode !== '' ? saveBarcode(r.barcode) : ex.barcode, r.unit || ex.unit, r.pack_name || ex.pack_name,
              r.min_stock ?? ex.min_stock, r.mxik || ex.mxik, id);
            if (withCost && r.cost_price !== null) db.prepare('UPDATE products SET cost_price=? WHERE id=?').run(r.cost_price, id);
            updated++;
          }
          if (r.colors.length) setColors(id, r.colors);
          const bq = db.prepare('SELECT box_qty FROM products WHERE id=?').get(id).box_qty;
          for (const [lvl, price] of Object.entries(r.prices)) setPrice.run(id, Number(lvl), price, price * bq);
          if (r.stock_in) {
            move.run(id, r.stock_in, t, `Excel import (${originalName})`, r.cost_price || 0, req.user.id, t);
            stock += r.stock_in;
          }
        }
      })();
    } catch (e) {
      for (const f of written) fs.rmSync(f, { force: true });
      throw e;
    }
    mergeCaseVariants();
    audit(req, { action: 'create', entity: 'product', summary: `Excel import: ${created} ta yangi, ${updated} ta yangilandi, omborga +${stock} dona (${originalName})` });
    const { isSharedEnabled, syncAllBranchesCatalogAndStock } = require('../shared_sync');
    if (isSharedEnabled()) {
      try { syncAllBranchesCatalogAndStock(); } catch (e) { console.warn('[import shared_sync]', e.message); }
    }
    res.json({ ok: true, summary, created, updated, stock });
  } finally {
    if (isCommit) {
      if (targetPath && fs.existsSync(targetPath)) {
        try { fs.rmSync(targetPath, { force: true }); } catch {}
      }
      if (token) {
        const metaPath = path.join(IMPORT_TMP_DIR, `${token}.meta`);
        if (fs.existsSync(metaPath)) {
          try { fs.rmSync(metaPath, { force: true }); } catch {}
        }
      }
    }
  }
});

function styleSheet(ws, cols, ru) {
  ws.columns = cols.map((c) => ({ header: ru ? c.ru : c.uz, key: c.key, width: c.width }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
  h.alignment = { vertical: 'middle', wrapText: true };
  h.height = 32;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const c of cols) if (['piece_price', 'box_price', 'cost_price'].includes(c.key) || c.key.startsWith('lvl')) ws.getColumn(c.key).numFmt = '#,##0';
}

const HELP = {
  uz: [
    "MAHSULOTLARNI EXCEL ORQALI QO'SHISH",
    '',
    '1. "Mahsulotlar" varag\'ida har bir qator — bitta mahsulot. 2-qatordan boshlab yozing. Misollar — "Namuna" varag\'ida.',
    '2. Ustunlar: Nomi, Brend, Kategoriya, Hajmi, O\'lcham, Rang, Karobkada (dona), Rasm, Dona narxi, Tavsif. Hech qaysi ustun majburiy emas (nomi bo\'lmasa — avtomatik nom beriladi).',
    '   O\'LCHAM (S, M, L, XL ...) — har o\'lcham ALOHIDA qatorda (alohida mahsulot). RANG — bitta katakda vergul bilan: Qizil, Ko\'k, Qora',
    '   (mijoz katalogda rangni tanlaydi, buyurtmada tanlangan rang saqlanadi).',
    '   KIMLAR UCHUN (ixtiyoriy): Erkaklar uchun / Ayollar uchun / Uniseks / Bolalar uchun — katalogda filtr bo\'ladi.',
    '3. "Dona narxi" — bitta donaning OPTOM narxi. "Karobkada (dona)" — bitta karobkada nechta dona.',
    '   Karobka narxi avtomatik hisoblanadi: dona narxi × karobkadagi dona (masalan 27 000 × 24 = 648 000).',
    '4. "Kategoriya" — katalogdagi bo\'lim: Atir, Yuz parvarishi, Soch parvarishi, Makiyaj, Gigiyena ... (o\'zingiz yozasiz).',
    '5. RASM: "Rasm" katagiga rasmni qo\'ying (Excel: Insert → Pictures → "Place in Cell"; yoki katak ustiga),',
    '   yoki rasm havolasini (https://...) yozing — dastur rasmni serverga yuklab oladi.',
    '6. Har bir qator — ALOHIDA mahsulot (nomi bir xil bo\'lsa ham). Mavjud mahsulotni yangilash uchun — admin panelda tahrirlang.',
    '7. Yuklagandan keyin dastur avval natijani ko\'rsatadi (nechta yangi, nechta yangilanadi, xatolar), keyin tasdiqlaysiz.',
    '8. SHTRIX-KOD yoki ARTIKUL bo\'yicha bazadagi mahsulot topilsa — u yangilanadi (narx, tannarx, birlik ...), aks holda yangi mahsulot qo\'shiladi.',
    "9. O'LCHOV BIRLIGI: dona, kg, g, litr, ml, metr, m2, pachka, quti, juft, komplekt. QADOQ NOMI: karobka, qop, blok ... (Karobkada = qadoqda nechta birlik).",
    '10. "Narx: Ulgurji" kabi ustunlar — narx turlari bo\'yicha narx (narx turlari Sozlamalarda yaratiladi). Bo\'sh qolsa — asosiy narx.',
  ],
  ru: [
    'ДОБАВЛЕНИЕ ТОВАРОВ ЧЕРЕЗ EXCEL',
    '',
    '1. На листе «Товары» каждая строка — один товар. Заполняйте со 2-й строки. Примеры — на листе «Образец».',
    '2. Столбцы: Название, Бренд, Категория, Объём, Размер, Цвета, В коробке (шт), Фото, Цена за штуку, Описание. Ни один столбец не обязателен (без названия — название ставится автоматически).',
    '   РАЗМЕР (S, M, L, XL ...) — каждый размер ОТДЕЛЬНОЙ строкой. ЦВЕТА — в одной ячейке через запятую: Красный, Синий, Чёрный',
    '   (клиент выбирает цвет в каталоге, выбранный цвет сохраняется в заказе).',
    '   ДЛЯ КОГО (необязательно): Мужской / Женский / Унисекс / Детский — фильтр в каталоге.',
    '3. «Цена за штуку» — ОПТОВАЯ цена одной штуки. «В коробке (шт)» — сколько штук в коробке.',
    '   Цена коробки считается автоматически: цена за штуку × штук в коробке (например 27 000 × 24 = 648 000).',
    '4. «Категория» — раздел каталога: Парфюм, Уход за лицом, Уход за волосами, Макияж, Гигиена ... (пишете сами).',
    '5. ФОТО: вставьте картинку в ячейку «Фото» (Excel: Вставка → Рисунки → «Поместить в ячейку»; или поверх ячейки),',
    '   или укажите ссылку на фото (https://...) — программа скачает его на сервер.',
    '6. Каждая строка — ОТДЕЛЬНЫЙ товар (даже с одинаковым названием). Изменить существующий товар — в админ-панели.',
    '7. После загрузки программа сначала покажет результат (сколько новых, сколько обновится, ошибки), затем вы подтверждаете.',
    '8. Если товар найден по ШТРИХКОДУ или АРТИКУЛУ — он обновляется (цена, себестоимость, единица ...), иначе добавляется новый.',
    '9. ЕД. ИЗМ.: шт, кг, г, л, мл, м, м2, пачка, коробочка, пара, комплект. УПАКОВКА: коробка, мешок, блок ... («В коробке» = сколько единиц в упаковке).',
    '10. Столбцы «Цена: Опт» и т.п. — цены по типам цен (создаются в Настройках). Пусто — базовая цена.',
  ],
};

// Bo'sh shablon (?lang=ru — ruscha)
router.get('/products/template', need('products.import'), async (req, res) => {
  const ru = req.query.lang === 'ru';
  const cols = [...templateColumns(), ...levelCols().map((l) => ({ key: 'lvl' + l.id, uz: 'Narx: ' + l.name, ru: 'Цена: ' + l.name, width: 14 }))];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ru ? 'Товары' : 'Mahsulotlar');
  styleSheet(ws, cols, ru);
  const colNo = (k) => cols.findIndex((c) => c.key === k) + 1;
  for (let r = 2; r <= 500; r++) {
    ws.getRow(r).height = 60;
    for (const k of ['piece_price', 'box_qty']) {
      ws.getCell(r, colNo(k)).dataValidation = {
        type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true,
        errorTitle: ru ? 'Ошибка' : 'Xato', error: ru ? 'Введите только число' : 'Faqat raqam kiriting',
      };
    }
  }

  // Namuna alohida varaqda — asosiy varaqqa aralashib import bo'lib ketmasligi uchun
  const ex = wb.addWorksheet(ru ? 'Образец' : 'Namuna');
  styleSheet(ex, cols, ru);
  const img = ru ? '(фото)' : '(rasm)';
  ex.addRow({ name: ru ? 'Расчёска' : 'Taroq', brand: 'Premium', category: ru ? 'Аксессуары' : 'Aksessuarlar', audience: ru ? 'Женский' : 'Ayollar uchun', volume: '', size: 'XL', colors: ru ? 'Красный, Синий, Чёрный' : "Qizil, Ko'k, Qora", box_qty: 50, image: img, piece_price: 18000, description: '' });
  ex.addRow({ name: ru ? 'Nivea спрей женский' : 'Nivea sprey ayollar uchun', brand: 'Nivea', category: ru ? 'Гигиена' : 'Gigiyena', volume: '150 ml', box_qty: 24, image: img, piece_price: 27000, description: '' });
  ex.addRow({ name: 'CeraVe namlovchi krem', brand: 'CeraVe', category: ru ? 'Уход за лицом' : 'Yuz parvarishi', volume: '50 ml', box_qty: 12, image: img, piece_price: 210000, description: ru ? 'Для сухой кожи' : 'Quruq teri uchun' });
  ex.addRow({ name: 'Lattafa Asad', brand: 'Lattafa', category: ru ? 'Парфюм' : 'Atir', audience: ru ? 'Мужской' : 'Erkaklar uchun', volume: '100 ml', box_qty: 12, image: 'https://...', piece_price: 320000, description: '' });

  const help = wb.addWorksheet(ru ? 'Инструкция' : "Ko'rsatma");
  help.getColumn(1).width = 115;
  HELP[ru ? 'ru' : 'uz'].forEach((t, i) => { help.getCell(i + 1, 1).value = t; if (i === 0) help.getCell(1, 1).font = { bold: true, size: 14 }; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${ru ? 'tovary_shablon' : 'mahsulotlar_shablon'}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// Mavjud mahsulotlarni eksport (narxlarni ommaviy o'zgartirib qayta import qilish yoki tanlanganlarni yuklash uchun)
router.all('/products/export', need('products.export'), async (req, res) => {
  const ru = (req.query.lang || (req.body && req.body.lang)) === 'ru';
  const box = false;
  const showCost = can(req, 'products.cost');
  const levels = levelCols();
  const cols = [...templateColumns().filter((c) => showCost || c.key !== 'cost_price'), COLUMNS.find((c) => c.key === 'mxik'),
    ...levels.map((l) => ({ key: 'lvl' + l.id, uz: 'Narx: ' + l.name, ru: 'Цена: ' + l.name, width: 14 }))];
  const prices = new Map();
  for (const r of db.prepare('SELECT product_id, level_id, piece_price FROM product_prices').all()) prices.set(r.product_id + ':' + r.level_id, r.piece_price);
  const unitName = { dona: ru ? 'шт' : 'dona', kg: 'kg', g: 'g', l: ru ? 'л' : 'litr', ml: 'ml', m: ru ? 'м' : 'metr', m2: 'm2', pachka: 'pachka', quti: 'quti', juft: 'juft', komplekt: 'komplekt' };
  const stock = stockMap();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ru ? 'Товары' : 'Mahsulotlar');
  styleSheet(ws, cols, ru);
  const extraCol = cols.length + 1;
  const imgCol = cols.findIndex((c) => c.key === 'image');
  ws.getCell(1, extraCol).value = ru ? (box ? 'Остаток (коробок) — не импортируется' : 'Остаток (шт) — не импортируется')
    : (box ? 'Hozirgi qoldiq (karobka) — import qilinmaydi' : 'Hozirgi qoldiq (dona) — import qilinmaydi');
  ws.getColumn(extraCol).width = 24;

  const idsParam = req.query.ids || (req.body && req.body.ids);
  let rawIds = [];
  if (Array.isArray(idsParam)) {
    rawIds = idsParam.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  } else if (typeof idsParam === 'string' && idsParam.trim()) {
    rawIds = idsParam.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  }

  let products;
  if (rawIds.length > 0) {
    const ph = rawIds.map(() => '?').join(',');
    products = db.prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND id IN (${ph}) ORDER BY name`).all(...rawIds);
  } else {
    products = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all();
  }
  const colorsAll = colorMap();
  for (const p of products) {
    const row = ws.addRow({
      name: p.name, brand: p.brand, category: p.category, size: p.size, audience: (ru ? { men: 'Мужской', women: 'Женский', unisex: 'Унисекс', kids: 'Детский' } : { men: 'Erkaklar uchun', women: 'Ayollar uchun', unisex: 'Uniseks', kids: 'Bolalar uchun' })[p.audience] || '', colors: (colorsAll.get(p.id) || []).join(', '), volume: p.volume, sku: p.sku, piece_price: p.piece_price, box_qty: p.box_qty,
      box_price: p.box_price, stock_in: '', stock_in_box: '', description: p.description,
      in_shop: p.in_shop ? (ru ? 'да' : 'ha') : (ru ? 'нет' : "yo'q"), image: '',
      barcode: p.barcode, unit: unitName[p.unit] || p.unit, pack_name: p.pack_name, cost_price: showCost ? Math.round(p.cost_price) || '' : undefined,
      min_stock: p.min_stock || '', mxik: p.mxik,
      ...Object.fromEntries(levels.map((l) => [`lvl${l.id}`, prices.get(p.id + ':' + l.id) || ''])),
    });
    const st = stock.get(p.id) || 0;
    row.getCell(extraCol).value = box ? +(st / (p.box_qty || 1)).toFixed(2) : st;
    if (p.image) {
      const file = path.join(currentUploadsDir(), path.basename(p.image));
      const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
      if (p.image.startsWith(currentUploadsUrl()) && fs.existsSync(file) && ['jpeg', 'png', 'gif', 'webp', 'jpg'].includes(ext)) {
        const imgId = wb.addImage({ buffer: fs.readFileSync(file), extension: ext });
        ws.addImage(imgId, { tl: { col: imgCol + 0.1, row: row.number - 1 + 0.1 }, ext: { width: 70, height: 70 }, editAs: 'oneCell' });
      } else if (/^https?:/.test(p.image)) {
        row.getCell('image').value = p.image;
      }
      row.height = 60;
    }
  }
  const filePrefix = rawIds.length > 0 ? (ru ? 'tanlangan_tovary' : 'tanlangan_mahsulotlar') : (ru ? 'tovary' : 'mahsulotlar');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}_${now().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});


// ================= Mijozlar (boshqa dasturdan o'tish: ro'yxat + qarz / avans qoldig'i) =================
const CLIENT_COLUMNS = [
  { key: 'company_name', uz: 'Kompaniya (do\'kon) nomi', ru: 'Компания (магазин)', match: ['kompaniya', 'firma', 'tashkilot', 'dokon', 'kompaniya nomi', 'kompaniya', 'company', 'organizatsiya', 'magazin'], width: 26 },
  { key: 'contact_name', uz: 'Ism-familiya', ru: 'ФИО', match: ['ism', 'familiya', 'fio', 'mijoz', 'klient', 'kontakt', 'name', 'imya'], width: 24 },
  { key: 'phone', uz: 'Telefon', ru: 'Телефон', match: ['telefon', 'tel', 'phone', 'raqam', 'nomer'], width: 16 },
  { key: 'phone2', uz: 'Telefon 2', ru: 'Телефон 2', match: ['telefon 2', 'tel 2', 'qoshimcha tel', 'phone 2', 'telefon2'], width: 16 },
  { key: 'inn', uz: 'INN (STIR)', ru: 'ИНН', match: ['inn', 'stir'], width: 12 },
  { key: 'address', uz: 'Manzil', ru: 'Адрес', match: ['manzil', 'adres', 'address'], width: 28 },
  { key: 'note', uz: 'Izoh', ru: 'Примечание', match: ['izoh', 'primechanie', 'note', 'komment'], width: 24 },
  { key: 'price_level', uz: 'Narx turi', ru: 'Тип цены', match: ['narx turi', 'tip seni', 'tip seny', 'tip tseny', 'price level'], width: 14 },
  { key: 'debt', uz: 'Qarzi', ru: 'Долг', match: ['qarz', 'qarzi', 'dolg', 'debt'], width: 16 },
  { key: 'advance', uz: 'Avans', ru: 'Аванс', match: ['avans', 'advance', 'predoplata'], width: 16 },
];

function mapClientHeader(ws) {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const map = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const h = normText(cellText(cell.value));
      if (!h) return;
      let best = null;
      for (const c of CLIENT_COLUMNS) for (const m of c.match) if (h.includes(m) && (!best || m.length > best.len)) best = { key: c.key, len: m.length };
      if (best && !map[best.key]) map[best.key] = col;
    });
    if (map.company_name || map.contact_name || map.phone) return { headerRow: r, map };
  }
  throw httpError(400, "Sarlavha qatori topilmadi. \"Ism-familiya\", \"Kompaniya\" yoki \"Telefon\" ustuni bo'lishi kerak (shablonni yuklab oling).");
}

async function parseClients(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw httpError(400, "Faylni o'qib bo'lmadi — .xlsx formatida saqlang"); }
  const ws = wb.worksheets.find((w) => w.state !== 'hidden' && w.rowCount > 0);
  if (!ws) throw httpError(400, "Faylda ma'lumot yo'q");
  const { headerRow, map } = mapClientHeader(ws);
  const levels = db.prepare('SELECT id, name FROM price_levels WHERE deleted_at IS NULL').all();
  const byPhone = db.prepare("SELECT id, company_name, contact_name FROM clients WHERE deleted_at IS NULL AND (phone=? OR phone2=?) AND ?<>''");
  const byInn = db.prepare("SELECT id, company_name, contact_name FROM clients WHERE deleted_at IS NULL AND inn=? AND ?<>''");
  const { normPhone, digits } = require('../util');
  const seen = new Map();
  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const val = (k) => (map[k] ? row.getCell(map[k]).value : null);
    const txt = (k, n = 300) => cellText(val(k)).slice(0, n);
    const c = {
      row: r, company_name: txt('company_name'), contact_name: txt('contact_name'), phone: normPhone(txt('phone')), phone2: normPhone(txt('phone2')),
      inn: digits(txt('inn')), address: txt('address', 500), note: txt('note', 500), price_level: txt('price_level'),
      debt: Math.max(0, money(val('debt')) || 0), advance: Math.max(0, money(val('advance')) || 0), errors: [], notes: [],
    };
    if (!c.company_name && !c.contact_name && !c.phone) continue;   // bo'sh qator
    // Qarz ustunida manfiy son = avans (ba'zi dasturlar balansni shunday chiqaradi)
    const rawDebt = money(val('debt'));
    if (rawDebt < 0 && !c.advance) { c.advance = -rawDebt; c.debt = 0; }
    if (!c.company_name && !c.contact_name) c.contact_name = c.phone;
    c.price_level_id = null;
    if (c.price_level) {
      const l = levels.find((x) => x.name.toLowerCase() === c.price_level.toLowerCase());
      if (l) c.price_level_id = l.id; else c.notes.push(`Narx turi topilmadi: ${c.price_level}`);
    }
    const key = c.phone || (c.inn && 'inn:' + c.inn);
    if (key && seen.has(key)) { c.action = 'error'; c.errors.push(`Takror: ${seen.get(key)}-qatorda shu telefon / INN bor`); rows.push(c); continue; }
    if (key) seen.set(key, r);
    const ex = byPhone.get(c.phone, c.phone, c.phone) || byInn.get(c.inn, c.inn);
    if (ex) {
      c.action = 'update'; c.existing_id = ex.id;
      if (c.debt || c.advance) c.notes.push("Mijoz bazada bor — qarz / avans qo'shilmaydi (ikki marta yozilmasin)");
    } else c.action = 'create';
    rows.push(c);
  }
  return rows;
}

const clientUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.post('/clients', need('clients.create'), keepContext(clientUpload.single('file')), async (req, res) => {
  if (!req.file) throw httpError(400, 'Excel faylni tanlang');
  const rows = await parseClients(req.file.buffer);
  const withBalance = can(req, 'clients.edit');
  if (!withBalance) for (const r of rows) if (r.action === 'create' && (r.debt || r.advance)) r.notes.push("Qarz / avans yozish uchun «Mijozni tahrirlash» ruxsati kerak");
  const summary = {
    total: rows.length, create: rows.filter((r) => r.action === 'create').length, update: rows.filter((r) => r.action === 'update').length,
    error: rows.filter((r) => r.action === 'error').length,
    debt: withBalance ? rows.filter((r) => r.action === 'create').reduce((a, r) => a + r.debt, 0) : 0,
    advance: withBalance ? rows.filter((r) => r.action === 'create').reduce((a, r) => a + r.advance, 0) : 0,
  };
  if (req.query.commit !== '1') return res.json({ summary, rows });

  const { nextNumber } = require('../util');
  const { recomputeClient } = require('../ledger');
  const t = now();
  const ins = db.prepare(`INSERT INTO clients (type,company_name,contact_name,phone,phone2,inn,address,note,price_level_id,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const upd = db.prepare(`UPDATE clients SET company_name=COALESCE(NULLIF(?,''),company_name), contact_name=COALESCE(NULLIF(?,''),contact_name),
    phone2=COALESCE(NULLIF(?,''),phone2), inn=COALESCE(NULLIF(?,''),inn), address=COALESCE(NULLIF(?,''),address), note=COALESCE(NULLIF(?,''),note),
    price_level_id=COALESCE(?,price_level_id), updated_at=? WHERE id=?`);
  const debt = db.prepare(`INSERT INTO sales (number,kind,client_id,date,status,total,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const adv = db.prepare(`INSERT INTO payments (client_id,direction,method,amount,date,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const touched = [];
  let created = 0, updated = 0;
  db.transaction(() => {
    for (const r of rows) {
      if (r.action === 'create') {
        const id = Number(ins.run(r.company_name ? 'b2b' : 'b2c', r.company_name, r.contact_name, r.phone, r.phone2, r.inn, r.address, r.note, r.price_level_id, req.user.id, t, t).lastInsertRowid);
        if (withBalance && r.debt) debt.run(nextNumber('sales', 'Q'), 'opening', id, t, 'confirmed', r.debt, "Boshlang'ich qarz (Excel import)", req.user.id, t, t);
        if (withBalance && r.advance) adv.run(id, 'in', 'other', r.advance, t, "Boshlang'ich qoldiq (avans, Excel import)", req.user.id, t, t);
        if (withBalance && (r.debt || r.advance)) touched.push(id);
        created++;
      } else if (r.action === 'update') {
        upd.run(r.company_name, r.contact_name === r.phone ? '' : r.contact_name, r.phone2, r.inn, r.address, r.note, r.price_level_id, t, r.existing_id);
        updated++;
      }
    }
  })();
  for (const id of touched) recomputeClient(id);
  audit(req, { action: 'create', entity: 'client', summary: `Mijozlar Excel import: ${created} ta yangi, ${updated} ta yangilandi${summary.debt ? `, boshlang'ich qarz ${require('../util').fmtMoney(summary.debt)}` : ''} (${req.file.originalname})` });
  res.json({ summary, created, updated });
});

router.get('/clients/template', need('clients.create'), async (req, res) => {
  const ru = req.query.lang === 'ru';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ru ? 'Клиенты' : 'Mijozlar');
  styleSheet(ws, CLIENT_COLUMNS, ru);
  for (const k of ['debt', 'advance']) ws.getColumn(k).numFmt = '#,##0';
  ws.getColumn('phone').numFmt = '@'; ws.getColumn('phone2').numFmt = '@'; ws.getColumn('inn').numFmt = '@';
  ws.addRow({ company_name: ru ? 'ООО «Пример»' : '«Namuna» MChJ', contact_name: ru ? 'Алиев Вали' : 'Valiyev Ali', phone: '+998 90 123 45 67', address: ru ? 'Ташкент, Чиланзар' : 'Toshkent, Chilonzor', debt: 1500000 });
  ws.addRow({ contact_name: ru ? 'Каримова Нигора' : 'Karimova Nigora', phone: '93 555 11 22', advance: 200000, note: ru ? 'Постоянный клиент' : 'Doimiy mijoz' });
  const help = wb.addWorksheet(ru ? 'Инструкция' : "Ko'rsatma");
  help.getColumn(1).width = 110;
  (ru ? [
    'ИМПОРТ КЛИЕНТОВ',
    'Обязательно: ФИО или название компании (или хотя бы телефон).',
    'Телефон можно писать в любом виде: 90 123 45 67, 8 90 ..., +998 90 ... — приводится к +998XXXXXXXXX.',
    'Долг — сколько клиент должен вам; Аванс — сколько вы должны клиенту. Отрицательное число в колонке «Долг» считается авансом.',
    'Если клиент с таким телефоном / ИНН уже есть — заполняются только пустые поля, долг повторно не добавляется.',
    'Перед загрузкой показывается предпросмотр — ничего не записывается, пока вы не подтвердите.',
  ] : [
    "MIJOZLARNI IMPORT QILISH",
    "Majburiy: ism-familiya yoki kompaniya nomi (hech bo'lmasa telefon).",
    "Telefonni istalgan ko'rinishda yozish mumkin: 90 123 45 67, 8 90 ..., +998 90 ... — +998XXXXXXXXX ko'rinishiga keltiriladi.",
    "Qarzi — mijoz sizga qancha qarz; Avans — siz mijozga qancha qarzsiz. «Qarzi» ustunidagi manfiy son avans deb olinadi.",
    "Shu telefon / INN bilan mijoz bazada bo'lsa — faqat bo'sh maydonlari to'ldiriladi, qarz qayta qo'shilmaydi.",
    "Yuklashdan oldin natija ko'rsatiladi — tasdiqlamaguningizcha hech narsa yozilmaydi.",
  ]).forEach((t, i) => { help.getCell(i + 1, 1).value = t; if (i === 0) help.getCell(1, 1).font = { bold: true, size: 14 }; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${ru ? 'klienty_shablon' : 'mijozlar_shablon'}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = { router, parse, parseClients };
