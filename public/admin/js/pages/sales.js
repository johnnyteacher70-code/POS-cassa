import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import {
  get, post, put, del, money, dt, d, go, back, route, clientName, balanceInfo, saleStatus, debounce, toast, qs,
  METHODS, METHOD_ICONS, nowLocal, toInputDt, toInputD, savePdf, docAction, resetPage, t, session,
} from '../lib.js';
import { newItem, loadProducts, loadRegisters } from '../components.js';
import { SaleDoc, loadSettings, trackStock } from '../docs.js';
import { ReturnModal } from '../returns.js';
import { removeWithUndo } from './clients.js';

export const SalesPage = {
  setup() {
    const f = reactive({ q: '', status: route.query.status || '', from: route.query.from || '', to: route.query.to || '', user_id: route.query.user || '', register_id: route.query.register || '' });
    const data = ref({ rows: [], sum: {} });
    const loading = ref(false);
    const load = async () => {
      loading.value = true;
      try {
        data.value = await get('/api/sales' + qs(f), { latest: 'sales' });
      } finally {
        loading.value = false;
      }
    };
    watch(() => f.q, debounce(load, 250));
    watch(() => [f.status, f.from, f.to, f.user_id, f.register_id], load);
    onActivated(load);
    return { f, data, loading, load, money, dt, d, go, clientName, saleStatus };
  },
  template: `
  <div class="sales-page-wrap">
    <!-- 1. Header -->
    <div class="page-head">
      <div>
        <h1>{{ $t("Sotuvlar (nakladnoylar)") }}</h1>
        <div class="small muted">{{ $t("Filial savdo operatsiyalari va nakladnoylar jurnali") }}</div>
      </div>
      <div class="head-actions">
        <a class="btn" v-if="$can('sales.view')" :href="'/api/reports/export?type=sales&from=' + (f.from || '') + '&to=' + (f.to || '')">📥 {{ $t("Excel") }}</a>
        <a class="btn primary" v-if="$can('sales.create')" href="#/sales/new">＋ {{ $t("Yangi sotuv") }}</a>
      </div>
    </div>

    <!-- 2. KPI Summary Bar (Tanlangan davr xulosasi) -->
    <div class="sales-kpi-bar" v-if="data.sum">
      <div class="sales-kpi-item">
        <span class="kpi-sub">{{ $t("Jami sotuv") }}</span>
        <b class="kpi-num">{{ money(data.sum.total) }} <small>{{ $t("so'm") }}</small></b>
        <span class="kpi-hint">{{ data.rows.length }} {{ $t("ta nakladnoy") }}</span>
      </div>
      <div class="sales-kpi-divider"></div>
      <div class="sales-kpi-item">
        <span class="kpi-sub">{{ $t("To'langan") }}</span>
        <b class="kpi-num pos">{{ money(data.sum.paid) }} <small>{{ $t("so'm") }}</small></b>
        <span class="kpi-hint">Kassaga tushgan</span>
      </div>
      <div class="sales-kpi-divider"></div>
      <div class="sales-kpi-item">
        <span class="kpi-sub">{{ $t("Qarz qoldiq") }}</span>
        <b class="kpi-num" :class="data.sum.total > data.sum.paid ? 'neg' : ''">
          {{ money(data.sum.total - data.sum.paid) }} <small>{{ $t("so'm") }}</small>
        </b>
        <span class="kpi-hint">Undirilishi kerak</span>
      </div>
    </div>

    <!-- 3. Filtrlar va Qidiruv Paneli -->
    <div class="sales-filters-card">
      <div class="sales-filter-row">
        <div class="search-big" style="flex:1;min-width:220px">
          <input v-model="f.q" :placeholder="$t('№, mijoz, telefon yoki summa...')">
        </div>
        <div class="date-pickers-group">
          <input type="date" v-model="f.from" title="Boshlanish sanasi">
          <span class="date-sep">—</span>
          <input type="date" v-model="f.to" title="Tugash sanasi">
        </div>
        <staff-select v-model="f.user_id" style="min-width:140px"/>
        <register-select v-model="f.register_id" style="min-width:140px"/>
      </div>
      <div class="chips sales-chips">
        <button class="chip" :class="{active:f.status===''}" @click="f.status=''">{{ $t("Barchasi") }}</button>
        <button class="chip" :class="{active:f.status==='debt'}" @click="f.status='debt'">{{ $t("Qarzli") }}</button>
        <button class="chip" :class="{active:f.status==='unpaid'}" @click="f.status='unpaid'">{{ $t("To'lanmagan") }}</button>
        <button class="chip" :class="{active:f.status==='partial'}" @click="f.status='partial'">{{ $t("Qisman") }}</button>
        <button class="chip" :class="{active:f.status==='paid'}" @click="f.status='paid'">{{ $t("To'langan") }}</button>
        <button class="chip" :class="{active:f.status==='cancelled'}" @click="f.status='cancelled'">{{ $t("Bekor qilingan") }}</button>
      </div>
    </div>

    <!-- 4. Nakladnoylar Jadvali -->
    <div class="card p0 sales-table-card">
      <table class="t rt">
        <thead>
          <tr>
            <th>№</th>
            <th>{{ $t("Sana") }}</th>
            <th>{{ $t("Mijoz") }}</th>
            <th>{{ $t("Sotuvchi") }}</th>
            <th class="num">{{ $t("Summa") }}</th>
            <th class="num">{{ $t("To'langan") }}</th>
            <th class="num">{{ $t("Qoldiq") }}</th>
            <th>{{ $t("Holat") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data.rows" :key="s.id" class="click sales-row" :class="{dim:s.status==='cancelled'}" @click="go('/sales/'+s.id)">
            <td class="main-cell bold">
              <span class="sale-num-tag">{{s.number}}</span>
              <div v-if="s.register_name" class="shop-badge">🏪 <b>{{s.register_name}}</b></div>
              <div v-else-if="s.branch_name" class="small muted">{{s.branch_name}} <span v-if="s.branch_code">({{s.branch_code}})</span></div>
            </td>
            <td :data-l="$t('Sana')" class="nowrap">{{dt(s.date)}}</td>
            <td :data-l="$t('Mijoz')">
              <div class="bold">{{clientName(s)}}</div>
              <div class="small muted" v-if="s.phone">{{s.phone}}</div>
            </td>
            <td :data-l="$t('Sotuvchi')" class="small">
              <div>{{s.seller_name}}</div>
              <div class="muted" v-if="s.register_name">🏪 {{$t(s.register_name)}}</div>
            </td>
            <td :data-l="$t('Summa')" class="num bold">{{money(s.total)}}</td>
            <td :data-l="$t(&quot;To'langan&quot;)" class="num pos">{{money(s.paid_amount)}}</td>
            <td :data-l="$t('Qoldiq')" class="num" :class="{neg:s.total>s.paid_amount}">
              {{s.status==='confirmed' ? money(s.total-s.paid_amount) : '—'}}
            </td>
            <td :data-l="$t('Holat')"><badge :s="saleStatus(s)"/></td>
          </tr>
        </tbody>
        <tfoot v-if="data.rows.length">
          <tr>
            <td colspan="4"><b>{{ $t("Jami") }}: {{data.rows.length}} {{ $t("ta") }}</b></td>
            <td class="num bold" :data-l="$t('Summa')">{{money(data.sum.total)}}</td>
            <td class="num pos bold" :data-l="$t(&quot;To'langan&quot;)">{{money(data.sum.paid)}}</td>
            <td class="num neg bold" :data-l="$t('Qoldiq')">{{money(data.sum.total - data.sum.paid)}}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div class="empty" v-if="!data.rows.length && !loading">{{ $t("Sotuvlar topilmadi") }}</div>
    </div>
  </div>`,
};

// ---------- Yangi sotuv / tahrirlash ----------
export const SaleForm = {
  setup() {
    const eid = route.parts[2] === 'edit' ? route.parts[1] : null;
    const editId = computed(() => eid);
    const f = reactive({
      client_id: route.query.client ? +route.query.client : null, date: nowLocal(), due_date: '', discount: '', note: '',
      items: [newItem()], pay_amount: '', pay_method: 'cash', quote_id: route.query.quote || null, kind: 'sale', total: '',
      register_id: '',
    });
    const client = ref(null);
    const saving = ref(false);
    const original = ref(null);

    onMounted(async () => {
      await loadProducts(true);
      if (editId.value) {
        const s = await get('/api/sales/' + editId.value);
        original.value = s;
        Object.assign(f, {
          client_id: s.client_id, date: toInputDt(s.date), due_date: toInputD(s.due_date), discount: s.discount || '', note: s.note,
          kind: s.kind, total: s.total, register_id: s.register_id ? String(s.register_id) : '',
          items: s.items.map((i) => ({ product_id: i.product_id, name: i.name, color: i.color || '', sku: i.sku || i.barcode || '', unit: i.unit, qty: i.qty, box_qty: i.box_qty, price: i.price, piece_price: i.piece_price, box_price: i.box_price })),
        });
      } else if (route.query.quote) {
        const q = await get('/api/quotes/' + route.query.quote);
        if (q.client_id) f.client_id = q.client_id;
        f.items = q.items.map((i) => ({ product_id: i.product_id, name: i.name, color: i.color || '', sku: i.sku || i.barcode || '', unit: i.unit, qty: i.qty, box_qty: i.box_qty, price: i.price, piece_price: i.piece_price, box_price: i.box_price }));
        f.note = `KP ${q.number} asosida`;
      }
      if (!f.register_id) {
        if (session.user && session.user.register_id) f.register_id = String(session.user.register_id);
        else loadRegisters().then((l) => { const r = l.find((x) => x.active); if (r && !f.register_id) f.register_id = String(r.id); });
      }
    });

    watch(() => f.client_id, async (id) => {
      client.value = id ? (await get('/api/clients/' + id + '?brief=1', { silent: true })).client : null;
    }, { immediate: true });

    const subtotal = computed(() => f.items.reduce((a, i) => a + Math.round((+i.qty || 0) * (+i.price || 0)), 0));
    const total = computed(() => (f.kind === 'opening' ? +f.total || 0 : Math.max(0, subtotal.value - (+f.discount || 0))));
    // Joriy balans (tahrirlashda bu sotuvsiz)
    const baseBalance = computed(() => {
      if (!client.value) return 0;
      let b = client.value.balance;
      if (original.value && original.value.status === 'confirmed' && original.value.client_id === client.value.id) b += original.value.total;
      return b;
    });
    const payNow = computed(() => (editId.value ? 0 : +f.pay_amount || 0));
    const fromAdvance = computed(() => Math.max(0, Math.min(baseBalance.value, total.value - payNow.value)));
    const after = computed(() => baseBalance.value - total.value + payNow.value);
    const toDebt = computed(() => Math.max(0, total.value - payNow.value - fromAdvance.value));

    const save = async () => {
      const items = f.items.filter((i) => i.name && +i.qty > 0);
      if (f.kind !== 'opening') {
        if (!items.length) return toast("Mahsulot qo'shing", 'error');
        const chk = trackStock() ? await post('/api/sales/check-stock', { items, sale_id: editId.value || 0 }) : { warnings: [] };
        if (chk.warnings.length && !confirm('Omborda yetarli emas:\n' + chk.warnings.join('\n') + '\n\nBaribir saqlansinmi?')) return;
      }
      saving.value = true;
      try {
        const body = { ...f, items, pay_now: payNow.value ? { amount: payNow.value, method: f.pay_method } : null };
        if (editId.value) {
          await put('/api/sales/' + editId.value, body);
          toast('Sotuv yangilandi', 'ok');
          resetPage();
          go('/sales/' + editId.value);
        } else {
          const r = await post('/api/sales', body);
          const s = r.summary;
          let msg = `Sotuv ${r.number} saqlandi: ${money(s.total)} so'm`;
          if (s.from_advance) msg += `\nMijozning ${money(s.balance_before)} avansidan ${money(s.from_advance)} yechildi`;
          if (s.paid_now) msg += `\nTo'landi: ${money(s.paid_now)}`;
          if (s.debt) msg += `\nQarzga yozildi: ${money(s.debt)}`;
          msg += `\nYakuniy balans: ${money(s.balance_after)}`;
          toast(msg, 'ok', { duration: 9000 });
          resetPage();
          go('/sales/' + r.id);
        }
      } finally { saving.value = false; }
    };

    return { editId, f, client, saving, subtotal, total, baseBalance, payNow, fromAdvance, after, toDebt, save, money, back, balanceInfo, METHODS, METHOD_ICONS };
  },
  template: `
  <div>
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/sales')">←</a>
      <h1>{{editId ? $t('Sotuvni tahrirlash') : $t('Yangi sotuv')}}</h1>
    </div>
    <form @submit.prevent="save">
      <div class="card">
        <div class="form-grid">
          <label class="f full"><span>{{ $t('Mijoz') }} *</span><client-picker v-model="f.client_id"/></label>
          <label class="f"><span>{{ $t("Do'kon") }}</span><register-select v-model="f.register_id" :all="false"/></label>
          <label class="f"><span>{{ $t('Sana') }}</span><input type="datetime-local" v-model="f.date"></label>
          <label class="f"><span>{{ $t("To'lov muddati (qarz bo'lsa)") }}</span><input type="date" v-model="f.due_date"></label>
        </div>
      </div>

      <div class="card" v-if="f.kind!=='opening'">
        <h2>{{ $t('Mahsulotlar') }}</h2>
        <items-editor :items="f.items" :level-id="client && client.price_level_id"/>
      </div>
      <div class="card" v-else>
        <label class="f"><span>{{ $t('Qarz summasi') }}</span><money-input v-model="f.total"/></label>
      </div>

      <div class="card">
        <div class="grid c2">
          <div>
            <label class="f mb" v-if="f.kind!=='opening'"><span>{{ $t("Chegirma (so'm)") }}</span><money-input v-model="f.discount"/></label>
            <label class="f mb"><span>{{ $t('Izoh') }}</span><textarea v-model="f.note" rows="2"></textarea></label>
            <div v-if="!editId">
              <span class="small muted" style="display:block;margin-bottom:4px;font-weight:500">{{ $t("Hozir to'lov qilyaptimi? (ixtiyoriy)") }}</span>
              <div class="row">
                <money-input v-model="f.pay_amount" :placeholder="$t(&quot;To'lov summasi&quot;)" style="flex:1;min-width:140px"/>
                <button type="button" class="btn sm" @click="f.pay_amount = Math.max(0, total - Math.max(0, baseBalance))">{{ $t("To'liq") }}</button>
              </div>
              <div class="chips mt" v-if="f.pay_amount">
                <button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active:f.pay_method===k}" @click="f.pay_method=k">{{METHOD_ICONS[k]}} {{l}}</button>
              </div>
            </div>
          </div>
          <div class="totals-box" style="width:100%">
            <div class="tr" v-if="f.kind!=='opening'"><span>{{ $t('Mahsulotlar') }}</span><span>{{money(subtotal)}}</span></div>
            <div class="tr" v-if="+f.discount"><span>{{ $t('Chegirma') }}</span><span>−{{money(f.discount)}}</span></div>
            <div class="tr big"><span>{{ $t('Jami') }}</span><span>{{money(total)}} {{ $t("so'm") }}</span></div>
            <template v-if="client">
              <div class="tr mt"><span>{{ $t('Mijozning joriy balansi') }}</span><b :class="balanceInfo(baseBalance).cls">{{money(baseBalance)}}</b></div>
              <div class="tr" v-if="fromAdvance"><span>{{ $t('Avansdan yechiladi') }}</span><span class="pos">{{money(fromAdvance)}}</span></div>
              <div class="tr" v-if="payNow"><span>{{ $t("Hozir to'lanadi") }}</span><span class="pos">{{money(payNow)}}</span></div>
              <div class="tr" v-if="toDebt"><span>{{ $t('Qarzga yoziladi') }}</span><span class="neg bold">{{money(toDebt)}}</span></div>
              <div class="tr big"><span>{{ $t('Yakuniy balans') }}</span><span :class="balanceInfo(after).cls">{{money(after)}}</span></div>
              <div class="small muted right">{{balanceInfo(after).text}}</div>
            </template>
          </div>
        </div>
      </div>

      <div class="row end mt">
        <button type="button" class="btn" @click="back('/sales')">{{ $t('Bekor') }}</button>
        <button class="btn primary" :disabled="saving || !f.client_id">💾 {{ $t('Saqlash') }}</button>
      </div>
    </form>
  </div>`,
};

// ---------- Sotuv ko'rinishi (nakladnoy) ----------
export const SaleView = {
  components: { SaleDoc, ReturnModal },
  setup() {
    const saleId = route.parts[1];
    const sale = ref(null);
    const showBalance = ref(true);
    const pay = ref(false);
    const ret = ref(false);
    const docEl = ref(null);
    const load = async () => {
      await loadSettings();
      sale.value = await get('/api/sales/' + saleId);
    };
    onActivated(load);
    const cancel = async () => {
      if (!confirm(`Sotuv ${sale.value.number} bekor qilinsinmi? Mijoz balansi qayta hisoblanadi, ombor qaytadi.`)) return;
      await post(`/api/sales/${sale.value.id}/cancel`);
      toast('Bekor qilindi', '', { actionLabel: 'Qaytarish', action: async () => { await post(`/api/sales/${sale.value.id}/uncancel`); load(); } });
      load();
    };
    const uncancel = async () => { await post(`/api/sales/${sale.value.id}/uncancel`); toast('Qayta tiklandi', 'ok'); load(); };
    const remove = () => removeWithUndo('/api/sales/' + sale.value.id, `Sotuv ${sale.value.number}`, () => go('/clients/' + sale.value.client_id));
    const pdf = () => savePdf(document.querySelector('.print-area'), `Nakladnoy_${sale.value.number}.pdf`);
    const print = () => docAction(document.querySelector('.print-area'), `Nakladnoy_${sale.value.number}.pdf`, 'print');
    const cancelReturn = async (r) => {
      if (!confirm(t(`Qaytarish ${r.number} bekor qilinsinmi? Tovar yana ombordan chiqadi, mijoz hisobi qayta hisoblanadi.`))) return;
      await del('/api/returns/' + r.id); toast('Bekor qilindi', 'ok'); load();
    };
    return { sale, showBalance, pay, ret, docEl, load, cancel, uncancel, remove, pdf, print, cancelReturn, money, dt, d, go, back, clientName, saleStatus, METHODS };
  },
  template: `
  <div v-if="sale">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/sales')">←</a>
      <h1>{{sale.number}} <badge :s="saleStatus(sale)"/></h1>
    </div>
    <div class="doc-toolbar">
      <button class="btn primary" @click="print">🖨 {{ $t("Chop etish") }}</button>
      <button class="btn" @click="pdf">⬇ {{ $t("PDF") }}</button>
      <a class="btn" :href="'#/sales/'+sale.id+'/edit'" v-if="$can('sales.edit') && sale.status==='confirmed'">✎ {{ $t("Tahrirlash") }}</a>
      <button class="btn green" v-if="$can('payments.create') && sale.status==='confirmed' && sale.total>sale.paid_amount" @click="pay=true">⬇ {{ $t("To'lov qabul qilish") }}</button>
      <button class="btn" v-if="$can('sales.return') && sale.status==='confirmed' && sale.items.length" @click="ret=true">↩ {{ $t("Qaytarish") }}</button>
      <a class="btn" v-if="$can('clients.view')" :href="'#/clients/'+sale.client_id">👤 {{ $t("Mijoz") }}</a>
      <label class="check small"><input type="checkbox" v-model="showBalance"> {{ $t("Balansni ko'rsatish") }}</label>
      <span class="spacer"></span>
      <template v-if="$can('sales.cancel')">
        <button class="btn red" v-if="sale.status==='confirmed'" @click="cancel">{{ $t("Bekor qilish") }}</button>
        <button class="btn" v-else @click="uncancel">{{ $t("Qayta tiklash") }}</button>
      </template>
      <button class="btn red" v-if="$can('sales.delete')" @click="remove">🗑</button>
    </div>

    <div class="card no-print mb" v-if="sale.status==='confirmed'">
      <div class="row">
        <div><span class="muted">{{ $t("Summa") }}:</span> <b>{{money(sale.total)}}</b></div>
        <div><span class="muted">{{ $t("To'langan") }}:</span> <b class="pos">{{money(sale.paid_amount)}}</b></div>
        <div><span class="muted">{{ $t("Qoldiq") }}:</span> <b :class="{neg: sale.total>sale.paid_amount}">{{money(sale.total - sale.paid_amount)}}</b></div>
        <div v-if="sale.was_debt"><span class="muted">{{ $t("Qarz ochilgan") }}:</span> {{dt(sale.date)}}</div>
        <div v-if="sale.closed_at && sale.was_debt"><span class="muted">{{ $t("Qarz yopilgan") }}:</span> <b class="pos">{{dt(sale.closed_at)}}</b><span v-if="sale.closer"> · {{ $t("yopdi") }}: <b>{{sale.closer.full_name || sale.closer.username}}</b></span></div>
        <div v-if="sale.creator"><span class="muted">{{ $t("Sotuvchi") }}:</span> <b>{{sale.creator.full_name || sale.creator.username}}</b></div>
        <div v-if="sale.register || sale.register_name"><span class="muted">{{ $t("Do'kon") }}:</span> <b class="shop-badge" style="font-size:13px;padding:3px 10px">🏪 {{$t((sale.register && sale.register.name) || sale.register_name)}}</b></div>
      </div>
      <div class="small mt" v-if="sale.allocations.length">
        <span class="muted">{{ $t("To'lovlar") }}:</span>
        <span v-for="a in sale.allocations" :key="a.id" style="margin-right:12px">{{dt(a.payment_date)}} · {{METHODS[a.method]}} · <b>{{money(a.amount)}}</b>{{a.direct_sale===sale.id ? '' : $t(" (avans/umumiy)")}}<span class="muted" v-if="a.user_name"> · {{ $t("qabul qildi") }}: {{$tx(a.user_name)}}</span></span>
      </div>
    </div>

    <div class="card no-print mb" v-if="sale.returns && sale.returns.length">
      <h3>↩ {{ $t("Qaytarishlar") }}</h3>
      <div v-for="r in sale.returns" :key="r.id" class="row small" style="padding:4px 0;border-bottom:1px dashed var(--border)">
        <b>{{r.number}}</b><span class="muted">{{dt(r.date)}}<span v-if="r.user_name"> · {{r.user_name}}</span><span v-if="r.note"> · {{r.note}}</span></span>
        <span class="spacer"></span><b class="neg">−{{money(r.total)}}</b><span v-if="r.refund" class="muted">({{ $t("pul qaytarildi") }}: {{money(r.refund)}})</span>
        <button class="btn sm ghost" v-if="$can('sales.return')" @click="cancelReturn(r)" :title="$t('Bekor qilish')">✕</button>
      </div>
    </div>

    <div class="doc-scroll"><sale-doc :sale="sale" :show-balance="showBalance"/></div>

    <div class="card no-print mt" v-if="sale.audit.length">
      <h3>{{ $t("O'zgarishlar tarixi") }}</h3>
      <div v-for="a in sale.audit" :key="a.at+a.summary" class="small" style="padding:3px 0"><span class="muted">{{dt(a.at)}} · {{$tx(a.user_name)}}:</span> {{$tx(a.summary)}}</div>
    </div>

    <payment-modal v-if="pay" :client-id="sale.client_id" :sale-id="sale.id" :amount="sale.total-sale.paid_amount" @close="pay=false" @saved="load"/>
    <return-modal v-if="ret" :sale-id="sale.id" @close="ret=false" @saved="ret=false; load()"/>
  </div>`,
};
