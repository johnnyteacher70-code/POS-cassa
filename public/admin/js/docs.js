import { reactive } from 'vue';
import { get, money, qtyFmt, dt, d, amountInWords, clientName, t, applyTheme } from './lib.js';
import { baseName, packName, unitName } from './units.js';

export const settings = reactive({ loaded: false, data: {} });
// Kassa va sotuvda dona bilan sotish: sozlama "pos_pieces" ('1' — ruxsat, standart; '0' — faqat karobka).
// (Katalogdagi "faqat karobka" — alohida sozlama "sell_unit", u server tomonida.)
export const boxOnly = () => settings.data.pos_pieces === '0';
// Ombor qoldig'ini ko'rsatish / tekshirish (standart: o'chiq — Sozlamalarda yoqiladi)
export const trackStock = () => settings.data.track_stock === '1';
// Mahsulotning ixtiyoriy maydoni yoqilganmi (brend, hajm, o'lcham, kimlar uchun, ranglar) — Sozlamalarda tanlanadi
export const fieldOn = (k) => String(settings.data.product_fields ?? 'brand,volume,size,audience,colors').split(',').includes(k);
// Modul yoqilganmi (Odoo uslubidagi ilovalar: pos, debts, catalog, quotes, purchases, transfers, inventory, expenses, shifts, payroll, promotions, bonus, reviews)
export const moduleOn = (m) => settings.data['module_' + m] !== '0';
// Valyutani ko'rsatish rejimi: 'uzs' (so'm), 'both' (so'm + dollar), 'usd' (dollar)
export const usdDisplay = () => settings.data.usd_display_mode || 'uzs';
// Ombor qoldig'i qadoqda: "12 karobka (+3 dona)", "4 qop (+12,5 kg)"; p — mahsulot (birlik nomlari uchun)
export function stockLabel(pieces, boxQty, p = null) {
  const bq = Math.max(1, +boxQty || 1);
  const n = (v) => qtyFmt(Math.round(v * 1000) / 1000);
  if (bq === 1) return `${n(pieces)} ` + baseName(p);
  const boxes = Math.trunc(pieces / bq), rest = pieces - boxes * bq;
  return `${boxes} ` + packName(p) + (Math.abs(rest) > 1e-9 ? ` (+${n(rest)} ` + baseName(p) + ')' : '');
}

export async function loadSettings(force = false) {
  if (!settings.loaded || force) {
    settings.data = await get('/api/settings');
    settings.loaded = true;
    if (settings.data.theme_preset || settings.data.theme_color || settings.data.theme_mode) {
      applyTheme({ preset: settings.data.theme_preset, color: settings.data.theme_color, mode: settings.data.theme_mode });
    }
  }
  return settings.data;
}

const CompanyHead = {
  props: { s: Object },
  template: `
  <div class="head-row">
    <div>
      <brand-logo variant="h" tone="color" class="doc-logo"/>
      <div class="co" v-if="s.company_name && s.company_name !== 'LA CHERRY'">{{s.company_name}}</div>
      <div v-if="s.company_address">{{s.company_address}}</div>
      <div v-if="s.company_phone">{{ $t('Tel') }}: {{s.company_phone}}</div>
    </div>
    <div style="text-align:right">
      <div v-if="s.company_inn">{{ $t('INN') }}: {{s.company_inn}}</div>
      <div v-if="s.company_account">{{ $t('H/r') }}: {{s.company_account}}</div>
      <div v-if="s.company_bank">{{s.company_bank}}<span v-if="s.company_mfo">, {{ $t('MFO') }} {{s.company_mfo}}</span></div>
    </div>
  </div>`,
};

function balText(v) {
  if (v < 0) return `${money(-v)} (` + t('qarz') + ')';
  if (v > 0) return `${money(v)} (` + t('avans') + ')';
  return '0';
}

// ---------- Nakladnoy (yuk xati) ----------
export const SaleDoc = {
  components: { CompanyHead },
  props: { sale: Object, showBalance: { type: Boolean, default: true } },
  setup() { return { settings, money, qtyFmt, dt, d, amountInWords, clientName, balText, boxOnly, baseName }; },
  methods: { pcs(i) { return i.unit === 'karobka' ? i.qty * (i.box_qty || 1) : i.qty; } },
  computed: {
    // Hujjatda dona qatori bo'lmasa (yoki faqat karobka rejimi) — "Birlik" ustuni kerak emas
    unitCol() { return !boxOnly() || this.sale.items.some((i) => i.unit !== 'karobka'); },
    pieces() { return this.sale.items.reduce((a, i) => a + (i.unit === 'karobka' ? i.qty * i.box_qty : i.qty), 0); },
    // Jami miqdor faqat barcha pozitsiyalar bir xil birlikda bo'lsa (kg + dona qo'shilmaydi)
    oneUnit() { const u = new Set(this.sale.items.map((i) => baseName(i))); return u.size === 1 ? [...u][0] : ''; },
    subtotal() { return this.sale.items.reduce((a, i) => a + i.total, 0); },
    sum() { return this.sale.summary; },
    after() { return this.sum ? this.sum.balance_before - this.sale.total + this.sum.paid_now : 0; },
  },
  template: `
  <div class="doc print-area">
    <company-head :s="settings.data"/>
    <h1>{{sale.kind==='opening' ? $t("Qarz dalolatnomasi") : $t('Yuk xati (nakladnoy)')}} № {{sale.number}}</h1>
    <div v-if="sale.register_name || (sale.register && sale.register.name) || sale.branch_name" style="font-size:13.5px; font-weight:700; color:#4c1d95; margin:-2px 0 6px 0">
      🏪 {{ $t("Do'kon") }}: {{sale.register_name || (sale.register && sale.register.name) || sale.branch_name}}
    </div>
    <div class="doc-sub">{{ $t('Sana') }}: {{dt(sale.date)}}<span v-if="sale.due_date"> · {{ $t("To'lov muddati") }}: {{d(sale.due_date)}}</span></div>

    <div class="parties">
      <div class="p"><b class="h">{{ $t('Yetkazib beruvchi') }}</b>
        <div><b>{{settings.data.company_name || 'LA CHERRY'}}</b> <span v-if="sale.branch_name">({{sale.branch_name}})</span></div>
        <div v-if="sale.register_name || (sale.register && sale.register.name)">🏪 <b>{{ $t("Kassa / Do'kon") }}:</b> {{sale.register_name || sale.register.name}}</div>
        <div v-if="sale.creator">👤 <b>{{ $t("Mas'ul sotuvchi") }}:</b> {{sale.creator.full_name || sale.creator.username}}<span v-if="sale.creator.phone"> (📞 {{sale.creator.phone}})</span><span v-else-if="settings.data.company_phone"> (📞 {{settings.data.company_phone}})</span></div>
        <div v-if="settings.data.company_inn">{{ $t('INN') }}: {{settings.data.company_inn}}</div>
        <div v-if="settings.data.company_phone && (!sale.creator || !sale.creator.phone)">{{ $t('Tel') }}: {{settings.data.company_phone}}</div>
        <div v-if="settings.data.manager_contacts" style="margin-top:6px; padding:4px 8px; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:4px; font-size:12px; line-height:1.5">
          <div style="font-weight:bold; color:#1f2937">{{ $t("Mas'ul menejerlar") }}:</div>
          <div style="white-space:pre-line">{{settings.data.manager_contacts}}</div>
        </div>
      </div>
      <div class="p"><b class="h">{{ $t('Qabul qiluvchi') }}</b>
        <div><b>{{clientName(sale.client)}}</b></div>
        <div v-if="sale.client.inn">{{ $t('INN') }}: {{sale.client.inn}}</div>
        <div v-if="sale.client.company_name && sale.client.contact_name">{{ $t("Mas'ul") }}: {{sale.client.contact_name}}</div>
        <div v-if="sale.client.phone">{{ $t('Tel') }}: {{sale.client.phone}}</div>
        <div v-if="sale.client.address">{{sale.client.address}}</div>
        <div v-if="sale.client.account_no">{{ $t('H/r') }}: {{sale.client.account_no}}<span v-if="sale.client.bank">, {{sale.client.bank}}</span><span v-if="sale.client.mfo">, {{ $t('MFO') }} {{sale.client.mfo}}</span></div>
      </div>
    </div>

    <table v-if="sale.items.length">
      <thead><tr>
        <th style="width:28px">№</th><th style="width:68px">{{ $t('Rasm') }}</th><th>{{ $t('Mahsulot nomi') }}</th><th style="width:80px">{{ $t('Kodi') }}</th><th>{{ $t('Miqdor') }}</th><th>{{ $t('Narxi') }}</th><th>{{ $t('Summa') }}</th>
      </tr></thead>
      <!-- Nakladnoy: birlik, karobkada, jami dona ko'rsatilmaydi — miqdor donada, narx donaga -->
      <tbody>
        <tr v-for="(i,k) in sale.items" :key="i.id">
          <td class="c">{{k+1}}</td>
          <td class="c doc-img-cell">
            <img v-if="i.image" :src="i.image" class="doc-prod-img" alt="">
            <span v-else class="doc-no-img">—</span>
          </td>
          <td>
            <div style="font-weight:700;font-size:13px;line-height:1.3">{{i.name}}</div>
            <div v-if="i.color" class="doc-assort-badge" style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:1px 7px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;font-size:11.5px;font-weight:700;color:#0f172a">
              <span>🎨</span> <span>{{i.color}}</span>
            </div>
          </td>
          <td class="c" style="font-family:monospace;font-size:11px;font-weight:600">{{i.sku || i.barcode || '—'}}</td>
          <td class="c">{{qtyFmt(pcs(i))}} {{baseName(i)}}</td>
          <td class="n">{{money(pcs(i) ? Math.round(i.total / pcs(i)) : i.price)}}</td><td class="n">{{money(i.total)}}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr><td colspan="4" style="text-align:right">{{ $t('Jami') }}:</td><td class="c"><template v-if="oneUnit">{{qtyFmt(pieces)}} {{oneUnit}}</template></td><td></td><td class="n">{{money(subtotal)}}</td></tr>
        <tr v-if="sale.discount"><td colspan="6" style="text-align:right">{{ $t('Chegirma') }}:</td><td class="n">−{{money(sale.discount)}}</td></tr>
        <tr v-if="sale.discount"><td colspan="6" style="text-align:right">{{ $t("To'lov uchun jami") }}:</td><td class="n">{{money(sale.total)}}</td></tr>
      </tfoot>
    </table>
    <table v-else><tbody><tr><td>{{sale.note || $t("Boshlang'ich qarz")}}</td><td class="n" style="width:30%"><b>{{money(sale.total)}}</b></td></tr></tbody></table>

    <div class="words"><b>{{ $t('Jami summa') }}:</b> {{money(sale.total)}} {{ $t("so'm (") }}{{amountInWords(sale.total)}})</div>

    <table class="bal" v-if="showBalance && sum">
      <tbody>
        <tr><td>{{ $t('Oldingi qoldiq') }}</td><td class="n">{{balText(sum.balance_before)}}</td></tr>
        <tr><td>{{ $t("Ushbu hujjat bo'yicha") }}</td><td class="n">{{money(sale.total)}}</td></tr>
        <tr v-if="sum.paid_now"><td>{{ $t("To'landi") }}</td><td class="n">{{money(sum.paid_now)}}</td></tr>
        <tr><td><b>{{ $t('Yakuniy qoldiq') }}</b></td><td class="n"><b>{{balText(after)}}</b></td></tr>
      </tbody>
    </table>

    <div class="note" v-if="sale.note && sale.items.length">{{ $t('Izoh') }}: {{$t(sale.note)}}</div>
    <div class="note" v-if="settings.data.invoice_note">{{settings.data.invoice_note}}</div>

    <div class="signs">
      <div>
        {{ $t('Topshirdi (sotuvchi): ____________________') }}<br>
        <b>{{sale.creator ? (sale.creator.full_name || sale.creator.username) : settings.data.director}}</b>
        <span v-if="sale.creator && sale.creator.phone"> &nbsp;(📞 {{sale.creator.phone}})</span>
        <span v-else-if="settings.data.company_phone"> &nbsp;(📞 {{settings.data.company_phone}})</span>
      </div>
      <div>{{ $t('Qabul qildi: ____________________') }}<br>{{sale.client.contact_name}}</div>
    </div>
  </div>`,
};

// ---------- Tijorat taklifi (KP) ----------
export const QuoteDoc = {
  components: { CompanyHead },
  props: { quote: Object },
  setup() { return { settings, money, qtyFmt, dt, d, amountInWords, boxOnly, baseName }; },
  computed: { unitCol() { return !boxOnly() || this.quote.items.some((i) => i.unit !== 'karobka'); } },
  // KP: birlik, karobkada, karobka narxi ko'rsatilmaydi — miqdor donada, narx donaga
  methods: { pcs(i) { return i.unit === 'karobka' ? i.qty * (i.box_qty || 1) : i.qty; } },
  template: `
  <div class="doc print-area">
    <company-head :s="settings.data"/>
    <h1>KP № {{quote.number}}</h1>
    <div class="doc-sub">{{ $t('Sana') }}: {{d(quote.date)}}</div>

    <div class="parties" style="margin-bottom:10px">
      <div class="p">
        <b class="h">{{ $t('Yetkazib beruvchi') }}</b>
        <div><b>{{settings.data.company_name || 'LA CHERRY'}}</b> <span v-if="quote.branch_name">({{quote.branch_name}})</span></div>
        <div v-if="quote.register_name">🏪 <b>{{ $t("Kassa / Do'kon") }}:</b> {{quote.register_name}}</div>
        <div v-if="quote.creator">👤 <b>{{ $t("Mas'ul sotuvchi / Menejer") }}:</b> {{quote.creator.full_name || quote.creator.username}}</div>
        <div>📞 <b>{{ $t('Aloqa uchun') }}:</b> {{quote.creator && quote.creator.phone ? quote.creator.phone : (settings.data.company_phone || '—')}}</div>
      </div>
      <div class="p">
        <b class="h">{{ $t('Buyurtmachi (Mijoz)') }}</b>
        <div><b>{{quote.client_name || $t('Hurmatli mijoz')}}</b></div>
        <div v-if="quote.client && quote.client.inn">{{ $t('INN') }}: {{quote.client.inn}}</div>
        <div v-if="quote.client && quote.client.phone">{{ $t('Tel') }}: {{quote.client.phone}}</div>
        <div v-if="quote.valid_until">⏳ <b>{{ $t('Amal qilish muddati') }}:</b> {{d(quote.valid_until)}}</div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th style="width:32px">№</th>
        <th style="width:68px">{{ $t('Rasm') }}</th>
        <th>{{ $t('Nomi') }}</th>
        <th style="width:85px">{{ $t('Kodi') }}</th>
        <th style="width:75px">{{ $t('Dona') }}</th>
        <th style="width:105px">{{ $t('Dona narxi') }}</th>
        <th style="width:115px">{{ $t('Summasi') }}</th>
      </tr></thead>
      <tbody>
        <tr v-for="(i,k) in quote.items" :key="i.id">
          <td class="c">{{k+1}}</td>
          <td class="c doc-img-cell">
            <img v-if="i.image" :src="i.image" class="doc-prod-img" alt="">
            <span v-else class="doc-no-img">—</span>
          </td>
          <td>
            <div style="font-weight:700;font-size:13px;line-height:1.3">{{i.name}}</div>
            <div v-if="i.color" class="doc-assort-badge" style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:1px 7px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;font-size:11.5px;font-weight:700;color:#0f172a">
              <span>🎨</span> <span>{{i.color}}</span>
            </div>
          </td>
          <td class="c" style="font-family:monospace;font-size:11px;font-weight:600">{{i.sku || i.barcode || '—'}}</td>
          <td class="c">{{qtyFmt(pcs(i))}}</td>
          <td class="n">{{money(pcs(i) ? Math.round(i.total / pcs(i)) : 0)}}</td>
          <td class="n">{{money(i.total)}}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr v-if="quote.discount">
          <td colspan="6" style="text-align:right">{{ $t('Mahsulotlar jami') }}:</td>
          <td class="n">{{money((quote.subtotal || quote.total) + (quote.discount || 0))}}</td>
        </tr>
        <tr v-if="quote.discount" style="color:#dc2626;font-weight:700">
          <td colspan="6" style="text-align:right">🎁 {{ $t("Chegirma (o'tib berildi)") }}:</td>
          <td class="n">−{{money(quote.discount)}}</td>
        </tr>
        <tr>
          <td colspan="6" style="text-align:right;font-weight:700">{{ $t("To'lov uchun jami") }}:</td>
          <td class="n" style="font-weight:700">{{money(quote.total)}}</td>
        </tr>
      </tfoot>
    </table>
    <div class="words"><b>{{ $t('Jami summa') }}:</b> {{money(quote.total)}} {{ $t("so'm (") }}{{amountInWords(quote.total)}})</div>
    <div class="note" v-if="quote.note">{{quote.note}}</div>
    <div class="note" v-if="settings.data.kp_note">{{settings.data.kp_note}}</div>
    <div class="signs">
      <div>
        {{ $t("Tuzuvchi (mas'ul sotuvchi): ____________________") }}<br>
        <b>{{quote.creator ? (quote.creator.full_name || quote.creator.username) : (settings.data.director || 'Rahbar')}}</b>
        <span v-if="quote.creator && quote.creator.phone"> &nbsp;(📞 {{quote.creator.phone}})</span>
        <span v-else-if="settings.data.company_phone"> &nbsp;(📞 {{settings.data.company_phone}})</span>
      </div>
      <div style="font-size:12px; text-align:right">
        <template v-if="settings.data.manager_contacts">
          <div><b>{{ $t("Aloqa va mas'ul menejerlar") }}:</b></div>
          <div style="white-space:pre-line">{{settings.data.manager_contacts}}</div>
        </template>
        <div v-if="settings.data.company_phone">{{ $t("Do'kon tel") }}: {{settings.data.company_phone}}</div>
      </div>
    </div>
  </div>`,
};

// ---------- Termo-chek (58 / 80 mm) — kassa printeri uchun ----------
export const ReceiptDoc = {
  props: { sale: Object },
  setup() { return { settings, money, qtyFmt, dt, clientName, baseName, unitName }; },
  computed: {
    width() { return settings.data.receipt_width === '58' ? 58 : 80; },
    walkIn() { return !this.sale.client || /^Chakana xaridor/i.test(this.sale.client.contact_name || '') && !this.sale.client.phone; },
    paid() { return (this.sale.payments || []).filter((p) => p.direction === 'in' && p.method !== 'return'); },
  },
  template: `
  <div class="receipt" :style="{width: width + 'mm'}">
    <div class="rc-c" style="margin-bottom:6px"><img src="/brand/logo_print.png" onerror="this.src='/brand/logo.png'" style="max-width:120px;height:auto;display:block;margin:0 auto 4px" alt="LA CHERRY"></div>
    <div class="rc-c rc-b" v-if="settings.data.company_name && settings.data.company_name !== 'LA CHERRY'" style="font-size:1.18em;letter-spacing:1px">{{settings.data.company_name}}</div>
    <div class="rc-c" v-if="sale.register_name || (sale.register && sale.register.name)" style="font-weight:700;font-size:1.08em;margin:3px 0;letter-spacing:0.5px">🏪 {{sale.register_name || (sale.register && sale.register.name)}}</div>
    <div class="rc-c" v-else-if="sale.branch_name" style="font-weight:600">{{sale.branch_name}} <span v-if="sale.branch_code">({{sale.branch_code}})</span></div>
    <div class="rc-c" v-if="settings.data.company_address">{{settings.data.company_address}}</div>
    <div class="rc-c" v-if="settings.data.company_phone">{{ $t('Tel') }}: {{settings.data.company_phone}}</div>
    <div class="rc-c" v-if="settings.data.manager_contacts" style="font-size:0.85em;margin-top:2px;font-weight:600;white-space:pre-line">{{settings.data.manager_contacts}}</div>
    <div class="rc-c" v-if="settings.data.company_inn">{{ $t('INN') }}: {{settings.data.company_inn}}</div>
    <div class="rc-hr"></div>
    <div class="rc-row"><span>{{ $t('Chek') }} №</span><b>{{sale.number}}</b></div>
    <div class="rc-row" v-if="sale.register_name || (sale.register && sale.register.name)"><span>{{ $t("Do'kon") }}</span><b>{{sale.register_name || (sale.register && sale.register.name)}}</b></div>
    <div class="rc-row"><span>{{ $t('Sana') }}</span><span>{{dt(sale.date)}}</span></div>
    <div class="rc-row" v-if="sale.creator"><span>{{ $t('Kassir') }}</span><span><b>{{sale.creator.full_name || sale.creator.username}}</b><span v-if="sale.creator.phone"> ({{sale.creator.phone}})</span></span></div>
    <div class="rc-row" v-if="!walkIn"><span>{{ $t('Mijoz') }}</span><span>{{clientName(sale.client)}}</span></div>
    <div class="rc-hr"></div>
    <div v-for="i in sale.items" :key="i.id" class="rc-item">
      <div><b>{{i.name}}</b><span v-if="i.color" style="font-weight:700"> [🎨 {{i.color}}]</span></div>
      <div class="rc-row"><span>{{qtyFmt(i.qty)}} {{unitName(i, i.unit)}} × {{money(i.price)}}</span><b>{{money(i.total)}}</b></div>
    </div>
    <div class="rc-hr"></div>
    <div class="rc-row" v-if="sale.discount" style="color:#b91c1c"><span>🎁 {{ $t("Chegirma (o'tib berildi)") }}</span><span>−{{money(sale.discount)}}</span></div>
    <div class="rc-row rc-b" style="font-size:1.25em"><span>{{ $t('JAMI') }}</span><span>{{money(sale.total)}}</span></div>
    <div class="rc-row" v-for="p in paid" :key="p.id"><span>{{ $t("To'landi") }} ({{ $t(p.method === 'cash' ? 'Naqd' : p.method === 'card' ? 'Karta' : p.method === 'transfer' ? 'Perechisleniye' : p.method === 'bonus' ? 'Bonus' : 'Boshqa') }})</span><span>{{money(p.amount)}}</span></div>
    <div class="rc-row" v-if="sale.total > sale.paid_amount"><span>{{ $t('Qarzga') }}</span><b>{{money(sale.total - sale.paid_amount)}}</b></div>
    <div class="rc-row" v-if="sale.summary && !walkIn && sale.summary.balance_after < 0"><span>{{ $t('Umumiy qarzingiz') }}</span><span>{{money(-sale.summary.balance_after)}}</span></div>
    <div class="rc-hr"></div>
    <div class="rc-c">{{settings.data.receipt_note || $t('Xaridingiz uchun rahmat!')}}</div>
  </div>`,
};
