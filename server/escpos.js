// ESC/POS — termo-chek printerlari tili (Epson, Xprinter, Rongta, Sunmi ... deyarli hammasi tushunadi).
// Bu yerda faqat baytlar quriladi; yuborish — printer.js.
const iconv = require('iconv-lite');

const ESC = 0x1b, GS = 0x1d;
// Kod sahifasi: lotin (o'zbekcha) har qanday sahifada chiqadi; kirill uchun CP866 (ESC t 17 — ko'p printerlarda)
const CODEPAGES = { cp866: { n: 17, enc: 'cp866' }, cp1251: { n: 46, enc: 'win1251' }, ascii: { n: 0, enc: 'ascii' } };

class Receipt {
  constructor({ width = 48, codepage = 'cp866' } = {}) {
    this.w = width;                       // 80 mm — 48 belgi, 58 mm — 32 belgi (A shrift)
    this.cp = CODEPAGES[codepage] || CODEPAGES.cp866;
    this.parts = [Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x74, this.cp.n])];   // boshlash, kod sahifasi
  }
  raw(bytes) { this.parts.push(Buffer.from(bytes)); return this; }
  // O'zbek lotinidagi ʻ ʼ ‘ ’ — oddiy apostrof (har qanday printer chiqaradi)
  text(s) { this.parts.push(iconv.encode(String(s).replace(/[ʻʼ‘’`]/g, "'").replace(/[«»“”]/g, '"').replace(/[—–]/g, '-').replace(/−/g, '-'), this.cp.enc)); return this; }
  line(s = '') { return this.text(s).raw([0x0a]); }
  align(a) { return this.raw([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  size(w = 1, h = 1) { return this.raw([GS, 0x21, ((w - 1) << 4) | (h - 1)]); }
  hr(ch = '-') { return this.line(ch.repeat(this.w)); }
  // Chap va o'ng ustun bir qatorda (o'ng qism sig'masa — keyingi qatorga)
  pair(left, right, w = this.w) {
    left = String(left); right = String(right);
    if (left.length + right.length + 1 > w) return this.line(left).line(right.padStart(w));
    return this.line(left + ' '.repeat(w - left.length - right.length) + right);
  }
  // Uzun matnni qatorlarga bo'lish
  wrap(s, w = this.w) {
    const words = String(s).split(/\s+/);
    let cur = '';
    for (const word of words) {
      if ((cur + ' ' + word).trim().length > w) { if (cur) this.line(cur); cur = word.length > w ? word.slice(0, w) : word; }
      else cur = (cur + ' ' + word).trim();
    }
    if (cur) this.line(cur);
    return this;
  }
  feed(n = 3) { return this.raw([ESC, 0x64, n]); }
  cut() { return this.raw([GS, 0x56, 0x42, 0x00]); }                 // qisman kesish (qog'ozni surib)
  drawer() { return this.raw([ESC, 0x70, 0x00, 0x19, 0xfa]); }       // pul yashigini ochish (printerning DK porti)
  // QR kod (GS ( k) — chek raqami / havola
  qr(data, size = 6) {
    const d = Buffer.from(String(data), 'utf8');
    const len = d.length + 3;
    return this.raw([GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00])          // model 2
      .raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, size])                          // modul o'lchami
      .raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31])                          // xato tuzatish M
      .raw([GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30]).raw(d)   // ma'lumot
      .raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30]);                         // chop etish
  }
  build() { return Buffer.concat(this.parts); }
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
const q = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);
const METHOD = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", other: 'Boshqa', bonus: 'Bonus' };

// Sotuv cheki. sale — /api/sales/:id dagi ko'rinish (items, payments, client, creator, summary)
function saleReceipt(sale, settings, opts = {}) {
  const r = new Receipt({ width: opts.width === 58 ? 32 : 48, codepage: opts.codepage });
  r.align('center').bold(true).size(2, 2).line(settings.company_name || "Do'kon").size(1, 1).bold(false);
  if (settings.company_address) r.wrap(settings.company_address);
  if (settings.company_phone) r.line('Tel: ' + settings.company_phone);
  if (settings.company_inn) r.line('INN: ' + settings.company_inn);
  r.align('left').hr();
  r.pair('Chek №', sale.number);
  if (sale.branch_name) r.pair('Filial', `${sale.branch_name}${sale.branch_code ? ' (' + sale.branch_code + ')' : ''}`);
  if (settings.manager_contacts) r.wrap(settings.manager_contacts);
  r.pair('Sana', String(sale.date).slice(0, 16));
  if (sale.creator) r.pair('Kassir', sale.creator.full_name || sale.creator.username);
  const walkIn = !sale.client || (/^Chakana xaridor/i.test(sale.client.contact_name || '') && !sale.client.phone);
  if (!walkIn) r.pair('Mijoz', sale.client.company_name || sale.client.contact_name || sale.client.phone);
  r.hr();
  for (const i of sale.items || []) {
    r.wrap(i.name + (i.color ? ` (${i.color})` : ''));
    const unit = i.unit === 'karobka' ? (i.pack_name || 'karobka') : (i.base_unit || 'dona');
    r.pair(`  ${q(i.qty)} ${unit} x ${fmt(i.price)}`, fmt(i.total));
  }
  r.hr();
  if (sale.discount) r.pair('Chegirma', '-' + fmt(sale.discount));
  r.bold(true).size(1, 2).pair('JAMI', fmt(sale.total) + " so'm").size(1, 1).bold(false);
  for (const p of (sale.payments || []).filter((x) => x.direction === 'in' && x.method !== 'return')) r.pair(`To'landi (${METHOD[p.method] || p.method})`, fmt(p.amount));
  if (opts.cash_given && opts.cash_given > 0) {
    r.pair('Berildi (naqd)', fmt(opts.cash_given));
    if (opts.change > 0) r.bold(true).pair('Qaytim', fmt(opts.change)).bold(false);
  }
  if (sale.total > sale.paid_amount) r.bold(true).pair('Qarzga', fmt(sale.total - sale.paid_amount)).bold(false);
  if (!walkIn && sale.summary && sale.summary.balance_after < 0) r.pair('Umumiy qarzingiz', fmt(-sale.summary.balance_after));
  r.hr().align('center');
  if (opts.qr) r.qr(sale.number, 5).line();
  r.wrap(settings.receipt_note || 'Xaridingiz uchun rahmat!').align('left');
  r.feed(opts.feed ?? 4);
  if (opts.cut !== false) r.cut();
  if (opts.drawer) r.drawer();
  return r.build();
}

function testReceipt(settings, opts = {}) {
  const r = new Receipt({ width: opts.width === 58 ? 32 : 48, codepage: opts.codepage });
  r.align('center').bold(true).size(2, 2).line('TEST').size(1, 1).bold(false)
    .line(settings.company_name || "Do'kon boshqaruv").line(new Date().toLocaleString('sv-SE').slice(0, 16)).align('left').hr()
    .line("Lotin: O'zbekiston, g'isht, ch, sh").line('Кирилл: Ташкент, ёлка, щ, ъ').hr()
    .pair('Chap ustun', '12 345 000').pair("Uzun mahsulot nomi juda uzun bo'lsa ham", '999 000').hr('=')
    .align('center').line(`Kenglik: ${r.w} belgi`).qr('dokon-test', 5).line().align('left');
  r.feed(4);
  if (opts.cut !== false) r.cut();
  if (opts.drawer) r.drawer();
  return r.build();
}

module.exports = { Receipt, saleReceipt, testReceipt, CODEPAGES };
