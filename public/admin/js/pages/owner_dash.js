// Egasi paneli: barcha filiallar bo'yicha umumiy hisobot, filiallar orasidagi ko'chirishlar, katalogni tarqatish
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { get, post, api, del, money, dt, today, qs, toast, t, reloadApp } from '../lib.js';
import { INDUSTRIES } from '../industries.js';

const monthStart = () => today().slice(0, 8) + '01';

export const OwnerSummary = {
  emits: ['enter'],
  setup() {
    const f = reactive({ from: monthStart(), to: today() });
    const data = ref(null);
    const metric = ref('revenue');
    const load = async () => { data.value = await get('/api/owner/summary' + qs(f)); };
    watch(() => [f.from, f.to], load);
    onMounted(load);
    const METRICS = { revenue: 'Sof tushum', gross: 'Yalpi foyda', net_profit: 'Sof foyda', debt: 'Mijozlar qarzi', stock_value: 'Ombor qiymati' };
    const max = computed(() => (data.value ? Math.max(1, ...data.value.rows.map((r) => Math.abs(r[metric.value]))) : 1));
    const setRange = (k) => {
      if (k === 'today') { f.from = today(); f.to = today(); }
      if (k === 'month') { f.from = monthStart(); f.to = today(); }
      if (k === 'year') { f.from = today().slice(0, 4) + '-01-01'; f.to = today(); }
    };
    return { f, data, metric, METRICS, max, setRange, money, today, monthStart };
  },
  template: `
  <div v-if="data">
    <div class="owner-filter-bar mb">
      <div class="date-range-box">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <input type="date" v-model="f.from" class="date-input">
        <span class="date-sep">—</span>
        <input type="date" v-model="f.to" class="date-input">
      </div>
      <div class="quick-ranges">
        <button type="button" class="chip" :class="{active: f.from===today() && f.to===today()}" @click="setRange('today')">{{ $t('Bugun') }}</button>
        <button type="button" class="chip" :class="{active: f.from===monthStart() && f.to===today()}" @click="setRange('month')">{{ $t('Shu oy') }}</button>
        <button type="button" class="chip" :class="{active: f.from===today().slice(0,4)+'-01-01' && f.to===today()}" @click="setRange('year')">{{ $t('Shu yil') }}</button>
      </div>
    </div>
    <div class="grid c4 mb">
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t('Bugungi savdo (hamma filial)') }}</div>
          <span class="stat-icon-badge blue">📈</span>
        </div>
        <div class="v">{{money(data.total.today)}}</div>
        <div class="s">{{data.total.today_n}} {{ $t('ta sotuv amalga oshirildi') }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t('Sof tushum') }}</div>
          <span class="stat-icon-badge green">💰</span>
        </div>
        <div class="v">{{money(data.total.revenue)}}</div>
        <div class="s">{{data.total.sales}} {{ $t('ta jami sotuv') }}</div>
      </div>
      <div class="card stat stat-kpi hero">
        <div class="stat-top">
          <div class="l">{{ $t('Sof foyda') }}</div>
          <span class="stat-icon-badge purple">💎</span>
        </div>
        <div class="v" :class="data.total.net_profit >= 0 ? 'pos' : 'neg'">{{money(data.total.net_profit)}}</div>
        <div class="s">{{ $t('yalpi') }} {{money(data.total.gross)}} − {{ $t('xarajat') }} {{money(data.total.expenses)}}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t('Mijozlar qarzi') }}</div>
          <span class="stat-icon-badge red">📑</span>
        </div>
        <div class="v neg">{{money(data.total.debt)}}</div>
        <div class="s">{{data.total.debtors}} {{ $t('ta qarzdor mijoz') }}</div>
      </div>
    </div>
    <div class="grid c3 mb">
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t('Ombor qiymati (tannarxda)') }}</div>
          <span class="stat-icon-badge amber">📦</span>
        </div>
        <div class="v">{{money(data.total.stock_value)}}</div>
        <div class="s" v-if="data.total.stock_pieces">{{data.total.stock_pieces}} {{ $t('dona tovar mavjud') }} ({{data.total.stock_boxes}} {{ $t('kar') }})</div>
      </div>
      <div class="card stat alert-stat">
        <div class="l alert-header">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ $t('Tugagan va kam qolganlar') }}
        </div>
        <div class="v alert-val">{{data.total.out_of_stock || 0}} <span class="alert-unit">{{ $t('ta tugadi') }}</span></div>
        <div class="s alert-sub">⚠️ {{data.total.low_stock || 0}} {{ $t('ta tovar kam qolgan') }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Yo'ldagi tovar (ko'chirish)") }}</div>
          <span class="stat-icon-badge blue">🚚</span>
        </div>
        <div class="v">{{money(data.transit.value)}}</div>
        <div class="s">{{data.transit.n}} {{ $t('ta hujjat') }} · {{data.total.open_shifts}} {{ $t('ochiq smena') }}</div>
      </div>
    </div>
    <div class="card mb">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">{{ $t('Filiallar solishtiruvi') }}</h3>
        <div class="chips"><button v-for="(l,k) in METRICS" :key="k" class="chip" :class="{active: metric===k}" @click="metric=k">{{ $t(l) }}</button></div></div>
      <div class="mt">
        <div v-for="r in data.rows" :key="r.id" class="bar-row br-wide">
          <span class="bl"><b>{{r.name}}</b><span class="badge red" v-if="r.status!=='active'" style="margin-left:6px">{{ $t('bloklangan') }}</span></span>
          <span class="bt"><span class="bf" :class="{negf: r[metric] < 0}" :style="{width: (Math.abs(r[metric]) / max * 100) + '%'}"></span></span>
          <b class="bv">{{money(r[metric])}}</b>
        </div>
      </div>
    </div>
    <div class="card p0 mb">
      <table class="t rt">
        <thead><tr><th>{{ $t('Filial') }}</th><th class="num">{{ $t('Bugun') }}</th><th class="num">{{ $t('Tushum') }}</th><th class="num">{{ $t('Sof foyda') }}</th><th class="num">{{ $t('Qarz') }}</th><th class="num">{{ $t('Ombor') }}</th><th></th></tr></thead>
        <tbody><tr v-for="r in data.rows" :key="r.id" class="click-row" :class="{blocked: r.status!=='active'}" @click="r.status==='active' && $emit('enter', r)">
          <td class="main-cell branch-summary-cell">
            <div class="branch-summary-title">
              <span class="branch-summary-icon">🏬</span>
              <b>{{r.name}}</b>
            </div>
            <div class="branch-summary-badges">
              <span class="bs-badge sales">🛍️ {{r.sales}} {{ $t("sotuv") }}</span>
              <span v-if="r.open_shifts" class="bs-badge shift">🟢 {{r.open_shifts}} {{ $t("smena") }}</span>
              <span v-if="r.out_of_stock" class="bs-badge out-stock">🔴 {{r.out_of_stock}} {{ $t("tugagan") }}</span>
              <span v-if="r.low_stock" class="bs-badge low-stock">⚠️ {{r.low_stock}} {{ $t("kam qolgan") }}</span>
            </div>
          </td>
          <td :data-l="$t('Bugun')" class="num">{{money(r.today)}}</td>
          <td :data-l="$t('Tushum')" class="num bold">{{money(r.revenue)}}</td>
          <td :data-l="$t('Sof foyda')" class="num" :class="r.net_profit >= 0 ? 'pos' : 'neg'">{{money(r.net_profit)}}</td>
          <td :data-l="$t('Qarz')" class="num neg">{{money(r.debt)}}</td>
          <td :data-l="$t('Ombor')" class="num">{{money(r.stock_value)}}</td>
          <td data-l="" class="right"><button class="btn sm" v-if="r.status==='active'" @click="$emit('enter', r)">{{ $t('Kirish') }} →</button></td>
        </tr></tbody>
        <tfoot v-if="data.rows.length > 1"><tr><td>{{ $t('Jami') }}</td><td class="num">{{money(data.total.today)}}</td><td class="num">{{money(data.total.revenue)}}</td><td class="num">{{money(data.total.net_profit)}}</td><td class="num">{{money(data.total.debt)}}</td><td class="num">{{money(data.total.stock_value)}}</td><td></td></tr></tfoot>
      </table>
    </div>

    <!-- Top-10 eng ko'p sotilgan mahsulotlar (Tartibli & Vizual Progress) -->
    <div class="card p0 mb" v-if="data.top_products && data.top_products.length">
      <div class="card-head-bar" style="padding:16px 20px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">🏆</span>
          <div>
            <h3 style="margin:0;font-size:16px">{{ $t("Eng ko'p sotilgan tovarlar (Top-10)") }}</h3>
            <span class="small muted">{{ $t("Tanlangan oraliq bo'yicha filiallar jami savdolari") }}</span>
          </div>
        </div>
      </div>
      <table class="t rt top-products-table">
        <thead>
          <tr>
            <th style="width:50px;text-align:center">#</th>
            <th>{{ $t("Mahsulot nomi va kodi") }}</th>
            <th class="num">{{ $t("Sotilgan miqdor") }}</th>
            <th class="num">{{ $t("O'rtacha narxi") }}</th>
            <th class="num">{{ $t("Jami tushum") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(tp, idx) in data.top_products" :key="tp.name">
            <td style="text-align:center">
              <span class="rank-badge" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
            </td>
            <td>
              <div class="top-product-name-row">
                <span class="product-icon-sq">📦</span>
                <div>
                  <div class="bold" style="font-size:14px">{{ tp.name }}</div>
                  <span v-if="tp.sku" class="sku-pill">#{{ tp.sku }}</span>
                </div>
              </div>
            </td>
            <td class="num">
              <div class="qty-cell">
                <span class="bold pos">{{ tp.qty }} {{ $t("dona") }}</span>
                <div class="mini-bar-track">
                  <div class="mini-bar-fill" :style="{ width: (tp.qty / data.top_products[0].qty * 100) + '%' }"></div>
                </div>
              </div>
            </td>
            <td class="num muted small">
              ~{{ money(Math.round(tp.revenue / (tp.qty || 1))) }}
            </td>
            <td class="num bold" style="font-size:14.5px">
              {{ money(tp.revenue) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`,
};

export const OwnerTransfers = {
  setup() {
    const rows = ref([]);
    const loading = ref(false);
    const filter = ref('all');
    const search = ref('');
    const detailTransfer = ref(null);
    const loadingDetail = ref(false);

    const load = async () => {
      loading.value = true;
      try {
        rows.value = await get('/api/owner/transfers');
      } finally {
        loading.value = false;
      }
    };

    onMounted(load);

    const viewTransfer = async (t) => {
      loadingDetail.value = true;
      try {
        const full = await get('/api/owner/transfers/' + t.id);
        detailTransfer.value = full;
      } catch {
        detailTransfer.value = t;
      } finally {
        loadingDetail.value = false;
      }
    };

    const filteredRows = computed(() => {
      let list = rows.value || [];
      if (filter.value !== 'all') {
        list = list.filter((r) => r.status === filter.value);
      }
      if (search.value.trim()) {
        const q = search.value.toLowerCase().trim();
        list = list.filter((r) =>
          (r.number && r.number.toLowerCase().includes(q)) ||
          (r.from_name && r.from_name.toLowerCase().includes(q)) ||
          (r.to_name && r.to_name.toLowerCase().includes(q)) ||
          (r.sent_by && r.sent_by.toLowerCase().includes(q)) ||
          (r.received_by && r.received_by.toLowerCase().includes(q))
        );
      }
      return list;
    });

    const transitTotal = computed(() => {
      return (rows.value || []).filter((r) => r.status === 'sent').reduce((sum, r) => sum + (r.total_cost || 0), 0);
    });

    const ST = {
      sent: ["yo'lda", 'amber', '🚚'],
      received: ['qabul qilindi', 'green', '✅'],
      cancelled: ['bekor qilindi', 'gray', '⚪'],
    };

    return { rows, filteredRows, filter, search, detailTransfer, viewTransfer, loadingDetail, transitTotal, ST, money, dt, loading, load };
  },
  template: `
  <div class="owner-transfers-section">
    <!-- Toolbar: Filtrlash va Qidiruv -->
    <div class="card transfers-toolbar-card mb">
      <div class="transfers-toolbar-top">
        <div class="chips" style="margin:0">
          <button type="button" class="chip" :class="{active: filter==='all'}" @click="filter='all'">
            {{ $t("Barchasi") }} ({{rows.length}})
          </button>
          <button type="button" class="chip" :class="{active: filter==='sent'}" @click="filter='sent'">
            🚚 {{ $t("Yo'lda") }} ({{rows.filter(r => r.status === 'sent').length}})
          </button>
          <button type="button" class="chip" :class="{active: filter==='received'}" @click="filter='received'">
            ✅ {{ $t("Qabul qilindi") }} ({{rows.filter(r => r.status === 'received').length}})
          </button>
          <button type="button" class="chip" :class="{active: filter==='cancelled'}" @click="filter='cancelled'">
            ⚪ {{ $t("Bekor qilindi") }} ({{rows.filter(r => r.status === 'cancelled').length}})
          </button>
        </div>

        <div class="transfers-search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" placeholder="Hujjat #, filial yoki xodim..." class="transfers-search-input">
          <button type="button" v-if="search" class="transfers-search-clear" @click="search=''">✕</button>
        </div>
      </div>
    </div>

    <!-- 3 ta KPI Statistikasi -->
    <div class="grid c3 mb transfers-kpi-grid">
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Yo'ldagi tovarlar qiymati") }}</div>
          <span class="stat-icon-badge amber">🚚</span>
        </div>
        <div class="v">{{money(Math.round(transitTotal))}}</div>
        <div class="s">{{rows.filter(r => r.status === 'sent').length}} {{ $t("ta hujjat hozirda yo'lda") }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Jami ko'chirishlar") }}</div>
          <span class="stat-icon-badge blue">📦</span>
        </div>
        <div class="v">{{rows.length}}</div>
        <div class="s">{{ $t("barcha filiallararo operatsiyalar") }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Yetib borgan / qabul qilingan") }}</div>
          <span class="stat-icon-badge green">✅</span>
        </div>
        <div class="v pos">{{rows.filter(r => r.status === 'received').length}}</div>
        <div class="s">{{ $t("muvaffaqiyatli qabul qilingan") }}</div>
      </div>
    </div>

    <!-- Ko'chirishlar Asosiy Jadvali -->
    <div class="card p0 mb">
      <table class="t rt transfers-table">
        <thead>
          <tr>
            <th style="width:140px">{{ $t("Hujjat #") }}</th>
            <th>{{ $t("Yo'nalish (Qayerdan ➔ Qayerga)") }}</th>
            <th style="width:120px">{{ $t("Tarkibi") }}</th>
            <th class="num" style="width:130px">{{ $t("Tannarxda") }}</th>
            <th style="width:170px">{{ $t("Holati") }}</th>
            <th style="width:80px;text-align:center">{{ $t("Amal") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRows" :key="r.id" class="transfer-row">
            <td class="transfer-doc-cell">
              <b class="doc-number">#{{r.number}}</b>
              <div class="small muted">{{dt(r.sent_at)}}</div>
              <div class="small muted" v-if="r.sent_by">👤 {{r.sent_by}}</div>
            </td>
            <td>
              <div class="transfer-route-box">
                <span class="route-badge from">🏬 {{r.from_name}}</span>
                <span class="route-arrow">➔</span>
                <span class="route-badge to">🏬 {{r.to_name}}</span>
              </div>
            </td>
            <td>
              <span class="items-count-pill">📦 {{r.items_n}} {{ $t("ta tovar") }}</span>
            </td>
            <td class="num">
              <b class="transfer-cost-num">{{money(Math.round(r.total_cost))}}</b>
            </td>
            <td>
              <div class="transfer-status-cell">
                <span class="badge" :class="ST[r.status][1]">
                  {{ ST[r.status][2] }} {{ $t(ST[r.status][0]) }}
                </span>
                <div class="small muted mt-xs" v-if="r.received_at">
                  <span>{{dt(r.received_at)}}</span>
                  <span v-if="r.received_by"> · {{r.received_by}}</span>
                </div>
              </div>
            </td>
            <td style="text-align:center">
              <button type="button" class="btn sm ghost" @click="viewTransfer(r)" title="Batafsil ko'rish">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>{{ $t("Ko'rish") }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!filteredRows.length && !loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">🚚</span>
        {{ $t("Filiallar orasida ko'chirish hujjati topilmadi") }}
      </div>
      <div class="empty" v-if="loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">⏳</span>
        {{ $t("Ko'chirishlar yuklanmoqda...") }}
      </div>
    </div>

    <!-- Ko'chirish hujjati batafsil modali -->
    <div class="modal-bg" v-if="detailTransfer" @click.self="detailTransfer=null">
      <div class="modal card transfer-detail-modal" style="max-width:680px">
        <div class="modal-header-row">
          <div class="modal-title-group">
            <div class="modal-receipt-badge">#{{ detailTransfer.number }}</div>
            <div>
              <h3 class="modal-title" style="margin:0;font-size:18px">{{ $t("Ko'chirish hujjati") }}</h3>
              <div class="modal-subtitle small muted" style="margin-top:2px">
                <span>📅 {{ dt(detailTransfer.sent_at) }}</span>
                <span> · </span>
                <span class="badge" :class="ST[detailTransfer.status][1]">{{ $t(ST[detailTransfer.status][0]) }}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn ghost icon" @click="detailTransfer=null">✕</button>
        </div>

        <!-- 4 ta xulosa paneli -->
        <div class="detail-summary-grid mb">
          <div class="summary-box">
            <span class="sb-label">{{ $t("Jo'natuvchi filial") }}</span>
            <b class="sb-val">🏬 {{ detailTransfer.from_name }}</b>
            <div class="sb-sub" v-if="detailTransfer.sent_by">👤 {{ detailTransfer.sent_by }}</div>
          </div>
          <div class="summary-box">
            <span class="sb-label">{{ $t("Qabul qiluvchi filial") }}</span>
            <b class="sb-val">🏬 {{ detailTransfer.to_name }}</b>
            <div class="sb-sub" v-if="detailTransfer.received_by">👤 {{ detailTransfer.received_by }}</div>
          </div>
          <div class="summary-box">
            <span class="sb-label">{{ $t("Tovarlar soni") }}</span>
            <b class="sb-val">📦 {{ detailTransfer.items_n || (detailTransfer.items || []).length }} {{ $t("ta mahsulot") }}</b>
            <div class="sb-sub" v-if="detailTransfer.note">{{ detailTransfer.note }}</div>
          </div>
          <div class="summary-box highlight">
            <span class="sb-label">{{ $t("Jami tannarx") }}</span>
            <b class="sb-val pos" style="font-size:18px">{{ money(Math.round(detailTransfer.total_cost)) }}</b>
          </div>
        </div>

        <!-- Tovar pozitsiyalari jadvali -->
        <div class="modal-products-wrap mb" v-if="detailTransfer.items && detailTransfer.items.length">
          <div class="modal-section-title" style="margin-bottom:8px;font-weight:600">
            <span>📦 {{ $t("Ko'chirilayotgan tovarlar ro'yxati") }}</span>
          </div>
          <table class="t rt detail-items-table">
            <thead>
              <tr>
                <th style="width:36px;text-align:center">#</th>
                <th>{{ $t("Mahsulot nomi") }}</th>
                <th class="num">{{ $t("Miqdori") }}</th>
                <th class="num">{{ $t("Tannarxi") }}</th>
                <th class="num">{{ $t("Jami") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in detailTransfer.items" :key="it.id || i">
                <td style="text-align:center" class="muted small">{{ i + 1 }}</td>
                <td><b>{{ it.name }}</b></td>
                <td class="num"><b>{{ it.qty }}</b> <span class="muted small">{{ $t("dona") }}</span></td>
                <td class="num muted small">{{ money(Math.round(it.cost || 0)) }}</td>
                <td class="num bold">{{ money(Math.round((it.cost || 0) * it.qty)) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><b>{{ $t("Jami") }}</b></td>
                <td class="num"><b>{{ detailTransfer.items.reduce((s, it) => s + (it.qty || 0), 0) }}</b></td>
                <td></td>
                <td class="num bold pos">{{ money(Math.round(detailTransfer.total_cost)) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="row" style="justify-content:flex-end;gap:10px;margin-top:16px">
          <button type="button" class="btn primary" @click="detailTransfer=null">{{ $t("Yopish") }}</button>
        </div>
      </div>
    </div>
  </div>`,
};

// Katalogni tarqatish: bitta filial mahsulotlari boshqalariga
export const CatalogCopy = {
  props: { branches: Array },
  emits: ['close'],
  setup(props, { emit }) {
    const f = reactive({ from_branch: props.branches[0] ? props.branches[0].id : '', to: new Set(), mode: 'missing' });
    const busy = ref(false);
    const result = ref(null);
    const toggle = (id) => { const s = new Set(f.to); if (s.has(id)) s.delete(id); else s.add(id); f.to = s; };
    const targets = computed(() => (props.branches || []).filter(x => x.id !== f.from_branch));
    const toggleAll = () => {
      if (f.to.size === targets.value.length) {
        f.to = new Set();
      } else {
        f.to = new Set(targets.value.map(x => x.id));
      }
    };
    const run = async () => {
      busy.value = true;
      try {
        result.value = (await post('/api/owner/catalog/copy', { from_branch: f.from_branch, to_branches: [...f.to], mode: f.mode })).results;
        toast("Katalog muvaffaqiyatli tarqatildi", 'ok');
      } finally {
        busy.value = false;
      }
    };
    return { f, busy, result, toggle, toggleAll, targets, run };
  },
  template: `
  <modal :title="$t('Katalogni filiallarga tarqatish')" @close="$emit('close')">
    <div class="catalog-copy-modal">
      <p class="small muted mb">{{ $t("Tanlangan filialdagi faol mahsulotlar boshqa filiallarga ko'chiriladi (shtrix-kod, artikul yoki nom bo'yicha moslanadi). Qoldiq ko'chirilmaydi — u faqat «Ko'chirish» hujjati bilan o'tadi.") }}</p>
      
      <div class="form-grid">
        <label class="f full">
          <span>{{ $t("Qaysi filialdan (Manba)") }}</span>
          <select v-model="f.from_branch" class="branch-select">
            <option v-for="b in branches" :key="b.id" :value="b.id">🏬 {{b.name}}</option>
          </select>
        </label>
        
        <div class="f full">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
            <span>{{ $t("Qaysi filiallarga tarqatiladi") }} ({{f.to.size}} / {{targets.length}})</span>
            <button type="button" class="btn sm ghost" @click="toggleAll">
              {{ f.to.size === targets.length ? $t("Barchasini bekor qilish") : $t("Barchasini tanlash") }}
            </button>
          </div>
          <div class="chips target-branches-chips">
            <button type="button" v-for="b in targets" :key="b.id" class="chip" :class="{active: f.to.has(b.id)}" @click="toggle(b.id)">
              {{ f.to.has(b.id) ? '✓ ' : '+ ' }}🏬 {{b.name}}
            </button>
          </div>
        </div>

        <div class="f full">
          <span>{{ $t("Tarqatish rejimi") }}</span>
          <div class="copy-modes-grid mt-xs">
            <label class="copy-mode-card" :class="{active: f.mode==='missing'}">
              <input type="radio" v-model="f.mode" value="missing" style="display:none">
              <div class="cm-title">✨ {{ $t("Faqat yangi tovarlarni qo'shish") }}</div>
              <div class="cm-desc small muted">{{ $t("Faqat filialda mavjud bo'lmagan tovarlar qo'shiladi, borlariga tegilmaydi.") }}</div>
            </label>
            <label class="copy-mode-card" :class="{active: f.mode==='prices'}">
              <input type="radio" v-model="f.mode" value="prices" style="display:none">
              <div class="cm-title">⚡ {{ $t("Yangi tovarlar + narxlarni bir xil qilish") }}</div>
              <div class="cm-desc small muted">{{ $t("Yangi tovarlar qo'shiladi va mavjud tovarlarning narxi ham manbadagidek yangilanadi.") }}</div>
            </label>
          </div>
        </div>
      </div>

      <div v-if="result" class="copy-result-box mt">
        <div class="bold mb-xs">🎉 {{ $t("Tarqatish natijalari:") }}</div>
        <div v-for="r in result" :key="r.branch_id" class="result-branch-line">
          <span>🏬 <b>{{r.name}}</b>:</span>
          <span class="badge green sm">+{{r.added}} {{ $t("ta yangi") }}</span>
          <span v-if="r.updated" class="badge blue sm">{{r.updated}} {{ $t("ta narx yangilandi") }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t("Yopish") }}</button>
      <button class="btn primary" :disabled="busy || !f.to.size" @click="run">
        {{ busy ? $t("Tarqatilmoqda...") : $t("Tarqatish") }}
      </button>
    </template>
  </modal>`,
};

// ---------- Egasi sozlamalari: brend, litsenziya, zaxira, tarmoq, demo ----------

export const OwnerSettings = {
  emits: ['changed'],
  setup(_p, { emit }) {
    const biz = ref(null);
    const lic = ref(null);
    const backups = ref(null);
    const net = ref(null);
    const key = ref('');
    const busy = ref('');
    const load = async () => {
      [biz.value, lic.value, backups.value, net.value] = await Promise.all([
        get('/api/owner/business'), get('/api/owner/license'), get('/api/owner/backups'), get('/api/owner/network'),
      ]);
      if (!biz.value.color) biz.value.color = '#4f46e5';
    };
    onMounted(load);
    const saveBiz = async () => {
      await api('PUT', '/api/owner/business', {
        name: biz.value.name, tagline: biz.value.tagline, color: biz.value.color,
        industry: biz.value.industry, sale_mode: biz.value.sale_mode,
        shared_warehouse: biz.value.shared_warehouse ? 1 : 0,
      });
      toast("Saqlandi — brend yangilanishi uchun sahifa qayta yuklanadi", 'ok');
      setTimeout(() => location.reload(), 900);
    };
    const onLogo = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('logo', f);
      await api('POST', '/api/owner/business/logo', fd);
      toast('Logotip yuklandi', 'ok'); setTimeout(() => location.reload(), 700);
    };
    const removeLogo = async () => { await del('/api/owner/business/logo'); location.reload(); };
    const installKey = async () => { lic.value = { ...(await post('/api/owner/license', { key: key.value })), branches_used: lic.value.branches_used }; key.value = ''; toast("Litsenziya o'rnatildi", 'ok'); };
    const backupNow = async () => { busy.value = 'backup'; try { const r = await post('/api/owner/backups'); toast(t('Zaxira olindi') + ': ' + r.name, 'ok'); backups.value = await get('/api/owner/backups'); } finally { busy.value = ''; } };
    const restore = async (b) => {
      const c = prompt(t(`Diqqat! Barcha ma'lumotlar ${b.date} holatiga qaytariladi (hozirgi holat alohida saqlab qo'yiladi). Davom etish uchun TIKLASH deb yozing:`));
      if (c === null) return;
      await post('/api/owner/backups/restore', { name: b.name, confirm: c.trim().toUpperCase() });
      toast('Tiklanmoqda — server qayta ishga tushadi...', 'ok', { duration: 10000 });
      busy.value = 'restore';
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try { if ((await fetch('/healthz')).ok && i > 1) { reloadApp('#/'); return; } } catch { /* hali */ }
      }
      busy.value = '';
      toast("Server qayta ishga tushmadi — dasturni qo'lda qayta ishga tushiring", 'error', { duration: 15000 });
    };
    const demo = async () => {
      if (!confirm(t("Demo filial yaratilsinmi? Unga namuna mahsulotlar, mijozlar va sotuvlar qo'shiladi (1–2 daqiqa).")) ) return;
      busy.value = 'demo';
      try {
        const r = await post('/api/owner/demo', { industry: demoInd.value });
        toast(t('Demo filial tayyor. Admin: {0}, parol: {1}', [r.admin, r.password]), 'ok', { duration: 15000 });
        emit('changed');
      } finally { busy.value = ''; }
    };
    // Shifrlangan zaxira: parol, yuklab olish (.dkz), fayldan qo'shish
    const setBackupPw = async (off = false) => {
      let pw = '';
      if (!off) {
        pw = prompt(t("Zaxira paroli (kamida 8 belgi). Fleshkaga yoziladigan va yuklab olinadigan nusxalar shu parol bilan shifrlanadi. Parolni yozib qo'ying — yo'qolsa shifrlangan nusxani ochib bo'lmaydi:"));
        if (!pw) return;
        if (prompt(t('Parolni qayta kiriting:')) !== pw) { toast(t('Parollar mos emas'), 'error'); return; }
      } else if (!confirm(t("Zaxira paroli o'chirilsinmi? Tashqi nusxalar shifrsiz yoziladi."))) return;
      await post('/api/owner/backups/password', { password: pw });
      backups.value = await get('/api/owner/backups');
      toast(off ? t("Parol o'chirildi") : t('Zaxira paroli o\'rnatildi'), 'ok');
    };
    const uploadBackup = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const pw = prompt(t('Shu zaxira faylining paroli:'));
      if (pw === null) return;
      busy.value = 'upload';
      try {
        const r = await api('POST', '/api/owner/backups/upload', f, { headers: { 'X-Backup-Password': encodeURIComponent(pw) } });
        backups.value = await get('/api/owner/backups');
        toast(t("Zaxira ro'yxatga qo'shildi — endi «Tiklash» ni bosing") + ': ' + r.name, 'ok', { duration: 8000 });
      } finally { busy.value = ''; }
    };
    const demoInd = ref('cosmetics');
    const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
    return { biz, lic, backups, net, key, busy, saveBiz, onLogo, removeLogo, installKey, backupNow, restore, demo, size, setBackupPw, uploadBackup, INDUSTRIES, dt, demoInd };
  },
  template: `
  <div class="grid c2" v-if="biz && lic">
    <div>
      <div class="card mb">
        <h3>🎨 {{ $t("Brend (sizning do'koningiz nomi va logotipi)") }}</h3>
        <form class="form-grid" @submit.prevent="saveBiz">
          <label class="f"><span>{{ $t('Nomi') }}</span><input v-model="biz.name" maxlength="40" placeholder="Do'kon"></label>
          <label class="f"><span>{{ $t('Shior / ikkinchi qator') }}</span><input v-model="biz.tagline" maxlength="30" :placeholder="$t('BOSHQARUV')"></label>
          <label class="f"><span>{{ $t('Asosiy rang') }}</span><div class="row" style="flex-wrap:nowrap"><input type="color" v-model="biz.color" style="width:56px;padding:2px"><input v-model="biz.color" maxlength="7" style="flex:1;min-width:0"></div></label>
          <div class="f"><span>{{ $t('Logotip') }}</span>
            <div class="row" style="flex-wrap:nowrap"><img v-if="biz.logo" :src="biz.logo" style="width:40px;height:40px;object-fit:contain;border-radius:8px;background:var(--surface-2)">
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="onLogo" style="flex:1;min-width:0"><button type="button" class="btn sm ghost" v-if="biz.logo" @click="removeLogo">✕</button></div></div>
          <label class="f"><span>{{ $t('Biznes sohasi') }}</span><select v-model="biz.industry"><option value="">—</option><option v-for="(v,k) in INDUSTRIES" :key="k" :value="k">{{v.icon}} {{ $t(v.label) }}</option></select></label>
          <label class="f"><span>{{ $t('Savdo turi') }}</span><select v-model="biz.sale_mode"><option value="mixed">{{ $t('Chakana va ulgurji') }}</option><option value="retail">{{ $t('Chakana') }}</option><option value="wholesale">{{ $t('Ulgurji') }}</option></select></label>
          <label class="f full" style="flex-direction:row;align-items:center;gap:10px;margin-top:6px">
            <input type="checkbox" v-model="biz.shared_warehouse" style="width:18px;height:18px">
            <div>
              <b>🏪 {{ $t("Yagona ombor va umumiy mahsulotlar (Do'kon 1, Do'kon 2...)") }}</b>
              <div class="small muted">{{ $t("Barcha do'konlar (filiallar) uchun mahsulotlar katalogi va ombor qoldig'i (astatka) 100% yagona bo'ladi. Birida sotilsa, umumiy ombordan kamayadi.") }}</div>
            </div>
          </label>
          <p class="full small muted" style="margin:0">{{ $t("Soha va savdo turi yangi ochiladigan filiallarga qo'llanadi (mahsulot maydonlari, chek). Mavjud filiallarda — har birining Sozlamalarida.") }}</p>
          <div class="full right"><button class="btn primary">{{ $t('Saqlash') }}</button></div>
        </form>
      </div>
      <div class="card mb">
        <h3>🔑 {{ $t('Litsenziya') }}</h3>
        <div v-if="lic.mode==='licensed'">
          <div class="tr"><b>{{lic.business}}</b> <span class="badge" :class="lic.expired ? 'red' : 'green'">{{ lic.expired ? $t('muddati tugagan') : $t('faol') }}</span></div>
          <div class="small muted">{{ $t('Filiallar') }}: {{lic.branches_used}} / {{lic.branches}} · {{ $t('Muddati') }}: {{ lic.expires || $t('cheksiz') }}</div>
        </div>
        <div v-else>
          <span class="badge" :class="lic.expired ? 'red' : 'amber'">{{ $t('Sinov rejimi') }}</span>
          <span class="small muted"> {{ lic.expired ? $t('muddati tugagan') : lic.days_left + ' ' + $t('kun qoldi') }} · {{ $t('filiallar') }} {{lic.branches_used}} / {{lic.branches}}</span>
          <p class="small muted">{{ $t("Sinov muddati tugasa ham mavjud filiallarda savdo to'xtamaydi — faqat yangi filial ochib bo'lmaydi.") }}</p>
        </div>
        <form class="row mt" @submit.prevent="installKey" style="flex-wrap:nowrap"><input v-model="key" :placeholder="$t('Litsenziya kalitini kiriting')" style="flex:1;min-width:0;font-family:monospace;font-size:12px"><button class="btn" :disabled="!key.trim()">{{ $t("O'rnatish") }}</button></form>
      </div>
      <div class="card">
        <h3>🧪 {{ $t('Demo filial') }}</h3>
        <p class="small muted">{{ $t("Taqdimot yoki xodimlarni o'qitish uchun: namuna mahsulotlar, mijozlar, sotuvlar, xarid va xarajatlar bilan alohida filial. Haqiqiy ma'lumotlarga aralashmaydi; keyin bloklab o'chirish mumkin.") }}</p>
        <select v-model="demoInd" style="width:auto;margin-right:6px"><option value="cosmetics">💄 {{ $t('Kosmetika va parfyumeriya') }}</option><option v-for="(v,k) in INDUSTRIES" :key="k" v-show="k !== 'cosmetics'" :value="k">{{v.icon}} {{ $t(v.label) }}</option></select>
        <button class="btn" :disabled="busy==='demo'" @click="demo">{{ busy==='demo' ? $t('Tayyorlanmoqda...') : '＋ ' + $t('Demo filial yaratish') }}</button>
      </div>
    </div>
    <div>
      <div class="card mb" v-if="net">
        <h3>🌐 {{ $t('Boshqa qurilmalardan ulanish') }}</h3>
        <p class="small muted">{{ $t("Do'kondagi boshqa kompyuter, planshet yoki telefon shu Wi-Fi / tarmoqqa ulangan bo'lsa — brauzerda shu manzilni oching yoki QR kodni skanerlang:") }}</p>
        <div class="row" style="align-items:flex-start">
          <div class="qr-box" v-if="net.qr" v-html="net.qr"></div>
          <div><div v-for="u in net.urls" :key="u"><b style="font-size:16px">{{u}}</b></div><div class="small muted" v-if="!net.urls.length">{{ $t('Tarmoq topilmadi — faqat shu kompyuterda') }}: {{net.local}}</div></div>
        </div>
      </div>
      <div class="card" v-if="backups">
        <div class="row" style="justify-content:space-between"><h3 style="margin:0">💾 {{ $t('Zaxira nusxalar') }}</h3>
          <button class="btn sm primary" :disabled="busy==='backup'" @click="backupNow">{{ $t('Hozir zaxira olish') }}</button></div>
        <p class="small muted">{{ $t("Har kuni avtomatik olinadi. Kompyuter buzilsa yoki xato o'chirilsa — tanlangan kunga qaytarish mumkin.") }}
          <span v-if="backups.copy_dir"><br>{{ $t('Tashqi nusxa') }}: {{backups.copy_dir}}</span><span v-else><br>⚠ {{ $t("Tashqi diskka nusxa sozlanmagan (.env: BACKUP_COPY_DIR)") }}</span></p>
        <div class="row small mb">
          <span v-if="backups.encrypted" class="badge green">🔒 {{ $t('Tashqi nusxalar shifrlangan') }}</span>
          <span v-else class="badge amber">⚠ {{ $t("Zaxira paroli yo'q — fleshkadagi nusxani istalgan kishi o'qiy oladi") }}</span>
          <button class="btn sm" @click="setBackupPw(false)">{{ backups.encrypted ? $t("Parolni o'zgartirish") : $t("Parol o'rnatish") }}</button>
          <button class="btn sm ghost" v-if="backups.encrypted" @click="setBackupPw(true)">{{ $t("O'chirish") }}</button>
          <span class="spacer"></span>
          <label class="btn sm" :class="{disabled: !!busy}">📂 {{ $t('Fayldan (.dkz)') }}<input type="file" accept=".dkz" hidden @change="uploadBackup"></label>
        </div>
        <div class="backup-list">
          <div v-for="b in backups.rows" :key="b.name" class="row small" style="padding:5px 0;border-bottom:1px dashed var(--border)">
            <b>{{b.date}}</b><span class="muted">{{ $t(b.label || 'kunlik') }} · {{b.branches}} {{ $t('filial') }} · {{size(b.size)}}</span><span class="spacer"></span>
            <a class="btn sm" v-if="backups.encrypted" :href="'/api/owner/backups/' + encodeURIComponent(b.name) + '/download'" :title="$t('Shifrlangan nusxani yuklab olish')">⬇ .dkz</a>
            <button class="btn sm" :disabled="!!busy" @click="restore(b)">↺ {{ $t('Tiklash') }}</button>
          </div>
          <div class="empty small" v-if="!backups.rows.length">{{ $t("Hali zaxira yo'q") }}</div>
        </div>
      </div>
    </div>
  </div>`,
};

// ---------- Birinchi sozlash ustasi: biznes nomi, soha, savdo turi → keyin birinchi filial ----------
export const OnboardingWizard = {
  emits: ['done'],
  setup(_p, { emit }) {
    const f = reactive({ name: '', industry: '', sale_mode: 'mixed', color: '#4f46e5' });
    const save = async () => {
      await api('PUT', '/api/owner/business', f);
      emit('done');
    };
    return { f, save, INDUSTRIES };
  },
  template: `
  <div class="card onboard">
    <h2>👋 {{ $t('Xush kelibsiz! Biznesingizni sozlaylik') }}</h2>
    <p class="muted">{{ $t("Bu 1 daqiqa: nom, soha va savdo turi. Keyin birinchi filialni yaratasiz. Hammasini keyinroq Sozlamalarda o'zgartirish mumkin.") }}</p>
    <form @submit.prevent="save">
      <label class="f mb"><span>{{ $t("Biznes (do'kon) nomi") }}</span><input v-model="f.name" maxlength="40" placeholder="masalan: Baraka Savdo" autofocus></label>
      <div class="f mb"><span>{{ $t('Qaysi sohada ishlaysiz?') }}</span>
        <div class="ind-grid"><button type="button" v-for="(v,k) in INDUSTRIES" :key="k" class="ind-card" :class="{on: f.industry===k}" @click="f.industry=k"><span class="ii">{{v.icon}}</span>{{ $t(v.label) }}</button></div></div>
      <div class="f mb"><span>{{ $t('Savdo turi') }}</span>
        <div class="chips"><button type="button" class="chip" :class="{active: f.sale_mode==='retail'}" @click="f.sale_mode='retail'">🛍 {{ $t('Chakana') }}</button>
          <button type="button" class="chip" :class="{active: f.sale_mode==='wholesale'}" @click="f.sale_mode='wholesale'">📦 {{ $t('Ulgurji') }}</button>
          <button type="button" class="chip" :class="{active: f.sale_mode==='mixed'}" @click="f.sale_mode='mixed'">🔁 {{ $t('Chakana va ulgurji') }}</button></div></div>
      <label class="f mb"><span>{{ $t('Asosiy rang') }}</span><input type="color" v-model="f.color" style="width:64px;padding:2px"></label>
      <button class="btn primary" :disabled="!f.industry">{{ $t('Davom etish') }} →</button>
    </form>
  </div>`,
};

// ---------- Xavfsizlik: ikki bosqichli kirish va faol kirishlar ----------
export const OwnerSecurity = {
  setup() {
    const sec = ref(null);
    const setup = ref(null);
    const code = ref('');
    const off = reactive({ open: false, password: '', code: '' });
    const sessions = ref([]);
    const load = async () => { [sec.value, sessions.value] = await Promise.all([get('/api/owner/security'), get('/api/owner/sessions')]); };
    onMounted(load);
    const start = async () => { setup.value = await post('/api/owner/2fa/setup'); code.value = ''; };
    const enable = async () => { await post('/api/owner/2fa/enable', { code: code.value }); toast("Ikki bosqichli kirish yoqildi", 'ok'); setup.value = null; load(); };
    const disable = async () => { await post('/api/owner/2fa/disable', { password: off.password, code: off.code }); toast("O'chirildi", 'ok'); off.open = false; off.password = ''; off.code = ''; load(); };
    const revoke = async (s) => { if (!confirm(t("Bu kirish yopilsinmi? Qurilma tizimdan chiqariladi."))) return; await del('/api/owner/sessions/' + s.id); load(); };
    const device = (ua) => (/Android/i.test(ua) ? '📱 Android' : /iPhone|iPad/i.test(ua) ? '📱 iPhone/iPad' : /Windows/i.test(ua) ? '💻 Windows' : /Mac OS/i.test(ua) ? '💻 Mac' : /Linux/i.test(ua) ? '💻 Linux' : '🖥');
    const copySecret = () => {
      if (!setup.value || !setup.value.secret) return;
      navigator.clipboard.writeText(setup.value.secret);
      toast("Kalit nusxalandi", 'ok');
    };
    return { sec, setup, code, off, sessions, start, enable, disable, revoke, device, dt, copySecret };
  },
  template: `
  <div class="grid c2 owner-security-grid" v-if="sec">
    <!-- 2FA Kartasi -->
    <div class="card security-card">
      <div class="security-card-header mb">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">🔐</span>
          <div>
            <h3 style="margin:0;font-size:16px">{{ $t("Ikki bosqichli kirish (2FA)") }}</h3>
            <span class="small muted">{{ $t("Google Authenticator yoki Microsoft Authenticator bilan himoyalash") }}</span>
          </div>
        </div>
        <span class="badge" :class="sec.totp ? 'green' : 'amber'">
          {{ sec.totp ? '✓ ' + $t("Himoyalangan") : '⚠️ ' + $t("Yoqilmagan") }}
        </span>
      </div>

      <p class="small muted mb">{{ $t("Parol o'g'irlansa ham begona kira olmaydi: kirishda telefon ilovasi bergan 6 xonali kod talab qilinadi. Internet shart emas.") }}</p>

      <template v-if="sec.totp">
        <div class="active-2fa-box mb">
          <div class="badge-dot-row">
            <span class="pulsing-green-dot"></span>
            <b>{{ $t("2FA himoyasi faol va hisobingiz xavfsiz holatda") }}</b>
          </div>
          <div class="small muted mt-xs">{{ $t("Har gal kirishda 6 xonali bir martalik kod so'raladi.") }}</div>
        </div>
        <div v-if="!off.open">
          <button type="button" class="btn sm danger-outline" @click="off.open=true">{{ $t("2FA ni o'chirish") }}</button>
        </div>
        <form class="form-grid mt p-sm border-box" v-else @submit.prevent="disable">
          <div class="bold small mb-xs">{{ $t("2FA ni o'chirish uchun tasdiqlang:") }}</div>
          <label class="f"><span>{{ $t("Parol") }}</span><input type="password" v-model="off.password" required></label>
          <label class="f"><span>{{ $t("Ilovadagi 6 xonali kod") }}</span><input v-model="off.code" inputmode="numeric" maxlength="6" required></label>
          <div class="full row" style="justify-content:flex-end;gap:8px">
            <button type="button" class="btn sm ghost" @click="off.open=false">{{ $t("Bekor qilish") }}</button>
            <button type="submit" class="btn sm red">{{ $t("O'chirish") }}</button>
          </div>
        </form>
      </template>

      <template v-else>
        <button type="button" class="btn primary" v-if="!setup" @click="start">
          <span>🛡️</span> {{ $t("2FA himoyasini yoqish") }}
        </button>
        <div v-else class="setup-2fa-container">
          <div class="step-guide mb">
            <b>1-qadam:</b> {{ $t("Telefon ilovasida «+» bosib, quyidagi QR kodni skanerlang:") }}
          </div>
          <div class="qr-box-wrap mb">
            <div class="qr-box" v-html="setup.qr"></div>
          </div>
          <div class="secret-manual-box mb">
            <span class="small muted">{{ $t("Yoki kalitni qo'lda kiriting:") }}</span>
            <div class="secret-code-row">
              <code>{{setup.secret}}</code>
              <button type="button" class="btn sm ghost" @click="copySecret" title="Nusxalash">📋</button>
            </div>
          </div>
          <div class="step-guide mb-xs">
            <b>2-qadam:</b> {{ $t("Ilovada chiqqan 6 xonali kodni kiriting:") }}
          </div>
          <form class="row" @submit.prevent="enable" style="flex-wrap:nowrap;gap:8px">
            <input v-model="code" inputmode="numeric" maxlength="6" placeholder="Masalan: 123456" class="code-verify-input" style="flex:1;min-width:0;letter-spacing:4px;font-size:16px;text-align:center">
            <button type="submit" class="btn primary" :disabled="code.length < 6">{{ $t("Tasdiqlash") }}</button>
          </form>
        </div>
      </template>
    </div>

    <!-- Faol Sessiyalar Kartasi -->
    <div class="card p0 security-card">
      <div class="card-head-bar" style="padding:16px 20px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">💻</span>
          <div>
            <h3 style="margin:0;font-size:16px">{{ $t("Faol kirishlar va qurilmalar") }}</h3>
            <span class="small muted">{{ $t("Tanimagan qurilmani yoping — u darhol tizimdan chiqariladi") }}</span>
          </div>
        </div>
      </div>
      <table class="t rt sessions-table">
        <tbody>
          <tr v-for="s in sessions" :key="s.id" class="session-row">
            <td class="main-cell">
              <div class="session-device-meta">
                <span class="session-device-name bold">{{device(s.ua)}}</span>
                <span class="badge purple sm" v-if="s.kind==='owner'">{{ $t("egasi") }}</span>
                <span class="badge green sm" v-if="s.current">✓ {{ $t("shu qurilma") }}</span>
              </div>
              <div class="session-sub-info small muted mt-xs">
                <span>👤 {{s.who}}</span>
                <span v-if="s.ip"> · 🌐 {{s.ip}}</span>
                <span v-if="s.branch"> · 🏬 {{s.branch}}</span>
                <span> · 📅 {{dt(s.created_at)}}</span>
              </div>
            </td>
            <td class="right" style="width:110px">
              <button type="button" class="btn sm danger-outline" v-if="!s.current" @click="revoke(s)">
                <span>✕</span> {{ $t("Chiqarish") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`,
};

// ================= Barcha filiallar bo'yicha yagona sotuvlar (Barcha do'konlar sotuvlari bir joyda) =================
export const OwnerSales = {
  setup() {
    const f = reactive({ branch_id: '', from: monthStart(), to: today(), q: '' });
    const data = ref({ rows: [], branches: [], total_count: 0, total_revenue: 0 });
    const loading = ref(false);
    const detailSale = ref(null);

    const load = async () => {
      loading.value = true;
      try {
        data.value = await get('/api/owner/sales' + qs(f));
      } finally {
        loading.value = false;
      }
    };

    const avgBasket = computed(() => {
      if (!data.value || !data.value.total_count) return 0;
      return Math.round(data.value.total_revenue / data.value.total_count);
    });

    const clearSearch = () => {
      f.q = '';
      load();
    };

    watch(() => [f.branch_id, f.from, f.to], load);
    onMounted(load);

    const setRange = (k) => {
      if (k === 'today') { f.from = today(); f.to = today(); }
      if (k === 'month') { f.from = monthStart(); f.to = today(); }
      if (k === 'year') { f.from = today().slice(0, 4) + '-01-01'; f.to = today(); }
    };

    return { f, data, loading, load, setRange, clearSearch, money, dt, detailSale, avgBasket, today, monthStart };
  },
  template: `
  <div class="owner-sales-section">
    <!-- Yuqori qidiruv va filtrlash paneli -->
    <div class="card sales-toolbar-card mb">
      <div class="sales-toolbar-top">
        <div class="chips" style="margin:0">
          <button type="button" class="chip" :class="{active: !f.branch_id}" @click="f.branch_id=''">
            🏬 {{ $t("Barcha filiallar") }}
          </button>
          <button type="button" v-for="b in data.branches" :key="b.id" class="chip" :class="{active: +f.branch_id === b.id}" @click="f.branch_id = String(b.id)">
            🏬 {{b.name}}
          </button>
        </div>
        <div class="sales-toolbar-dates">
          <div class="date-range-box">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input type="date" v-model="f.from" class="date-input">
            <span class="date-sep">—</span>
            <input type="date" v-model="f.to" class="date-input">
          </div>
          <div class="quick-ranges">
            <button type="button" class="chip" :class="{active: f.from===today() && f.to===today()}" @click="setRange('today')">{{ $t("Bugun") }}</button>
            <button type="button" class="chip" :class="{active: f.from===monthStart() && f.to===today()}" @click="setRange('month')">{{ $t("Shu oy") }}</button>
            <button type="button" class="chip" :class="{active: f.from===today().slice(0,4)+'-01-01' && f.to===today()}" @click="setRange('year')">{{ $t("Shu yil") }}</button>
          </div>
        </div>
      </div>

      <div class="sales-search-bar mt">
        <div class="sales-search-input-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="f.q" @keydown.enter="load" placeholder="Chek raqami, mijoz nomi, telefon, tovar nomi yoki kodi (#ede57)..." class="sales-search-input">
          <button type="button" v-if="f.q" class="sales-search-clear" @click="clearSearch" title="Tozalash">✕</button>
        </div>
        <button type="button" class="btn primary sales-search-btn" @click="load">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>{{ $t("Qidirish") }}</span>
        </button>
      </div>
    </div>

    <!-- Statistika kartochkalari -->
    <div class="grid c3 mb sales-kpi-grid">
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Jami tushum (savdo)") }}</div>
          <span class="stat-icon-badge green">💰</span>
        </div>
        <div class="v pos">{{money(data.total_revenue)}}</div>
        <div class="s">{{f.branch_id ? (data.branches.find(b=>b.id===+f.branch_id)||{}).name : $t("Barcha filiallar bo'yicha")}}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Jami cheklar soni") }}</div>
          <span class="stat-icon-badge blue">🧾</span>
        </div>
        <div class="v">{{data.total_count}}</div>
        <div class="s">{{ $t("amalga oshirilgan savdolar") }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("O'rtacha chek") }}</div>
          <span class="stat-icon-badge purple">📊</span>
        </div>
        <div class="v" style="font-size:22px">{{money(avgBasket)}}</div>
        <div class="s">{{ $t("bitta savdoning o'rtacha qiymati") }}</div>
      </div>
    </div>

    <!-- Sotuvlar asosiy jadvali -->
    <div class="card p0 mb">
      <table class="t rt sales-main-table">
        <thead>
          <tr>
            <th style="width:130px">{{ $t("Hujjat #") }}</th>
            <th style="width:160px">{{ $t("Filial / Do'kon") }}</th>
            <th style="width:200px">{{ $t("Mijoz") }}</th>
            <th>{{ $t("Sotilgan tovarlar") }}</th>
            <th style="width:140px">{{ $t("Kassir") }}</th>
            <th class="num" style="width:150px">{{ $t("Summa") }}</th>
            <th style="width:80px;text-align:center">{{ $t("Amal") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data.rows" :key="s.branch_id + '-' + s.id" class="sale-row">
            <td class="sale-doc-cell">
              <b class="doc-number">#{{s.number}}</b>
              <div class="small muted doc-date">{{dt(s.date)}}</div>
            </td>
            <td>
              <div class="branch-tag-pill">
                <span class="branch-icon">🏬</span>
                <span class="bold branch-name-text">{{s.branch_name}}</span>
                <span v-if="s.branch_code" class="branch-code-tag">{{s.branch_code}}</span>
              </div>
            </td>
            <td>
              <div class="customer-info-cell">
                <template v-if="s.company_name || s.contact_name">
                  <div class="customer-main-name">
                    <span class="customer-icon">👤</span>
                    <span class="bold">{{ s.company_name || s.contact_name }}</span>
                  </div>
                  <div v-if="s.company_name && s.contact_name && s.company_name !== s.contact_name" class="customer-sub-name small muted">
                    {{ s.contact_name }}
                  </div>
                  <div v-if="s.phone" class="customer-phone-sub">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span>{{ s.phone }}</span>
                  </div>
                </template>
                <template v-else>
                  <span class="retail-pill">
                    <span>🛍️</span> {{ $t("Chakana xaridor") }}
                  </span>
                </template>
              </div>
            </td>
            <td>
              <div class="sale-items-compact">
                <div v-for="(it, idx) in (s.items || []).slice(0, 2)" :key="idx" class="compact-item-row">
                  <div class="item-name-part">
                    <span v-if="it.sku" class="sku-mini">#{{ it.sku }}</span>
                    <span class="item-title" :title="it.name">{{ it.name }}</span>
                    <span v-if="it.color" class="color-mini">{{ it.color }}</span>
                  </div>
                  <div class="item-qty-tag">
                    <b>{{ it.qty }}</b> {{ it.unit || 'dona' }}
                  </div>
                </div>
                <div v-if="(s.items || []).length > 2" class="more-items-row">
                  <button type="button" class="more-items-pill" @click.stop="detailSale = s">
                    +{{ s.items.length - 2 }} {{ $t("ta boshqa tovar...") }}
                  </button>
                </div>
              </div>
            </td>
            <td>
              <div class="cashier-cell">
                <span class="cashier-avatar">{{ (s.creator_name || s.creator_username || 'X').charAt(0).toUpperCase() }}</span>
                <span class="cashier-name">{{ s.creator_name || s.creator_username || '—' }}</span>
              </div>
            </td>
            <td class="num">
              <div class="sale-total-cell">
                <div class="bold pos sale-total-amount">{{ money(s.total) }}</div>
                <div v-if="s.methods && s.methods.length" class="pay-methods-list">
                  <span v-for="m in s.methods" :key="m" class="pay-tag" :class="'pay-' + m">
                    {{ m === 'cash' ? $t("Naqd") : m === 'card' ? $t("Karta") : m === 'debt' ? $t("Nasiya") : m }}
                  </span>
                </div>
              </div>
            </td>
            <td style="text-align:center">
              <button type="button" class="btn sm ghost" @click="detailSale = s" :title="$t('Chek')">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>{{ $t("Chek") }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!data.rows.length && !loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">🧾</span>
        {{ $t("Ko'rsatilgan oraliqda sotuvlar topilmadi") }}
      </div>
      <div class="empty" v-if="loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">⏳</span>
        {{ $t("Sotuvlar yuklanmoqda...") }}
      </div>
    </div>

    <!-- Chek batafsil oynasi -->
    <div class="modal-bg" v-if="detailSale" @click.self="detailSale=null">
      <div class="modal card sale-detail-modal" style="max-width:680px">
        <div class="modal-header-row">
          <div class="modal-title-group">
            <div class="modal-receipt-badge">#{{ detailSale.number }}</div>
            <div>
              <h3 class="modal-title" style="margin:0;font-size:18px">{{ $t("Savdo cheki") }}</h3>
              <div class="modal-subtitle small muted" style="display:flex;gap:8px;align-items:center;margin-top:2px">
                <span>🏬 <b>{{ detailSale.branch_name }}</b></span>
                <span>·</span>
                <span>📅 {{ dt(detailSale.date) }}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn ghost icon" @click="detailSale=null">✕</button>
        </div>

        <!-- 4 ta xulosa bloki -->
        <div class="detail-summary-grid mb">
          <div class="summary-box">
            <span class="sb-label">{{ $t("Filial / Do'kon") }}</span>
            <b class="sb-val">🏬 {{ detailSale.branch_name }}</b>
          </div>
          <div class="summary-box">
            <span class="sb-label">{{ $t("Kassir / Xodim") }}</span>
            <b class="sb-val">👤 {{ detailSale.creator_name || detailSale.creator_username || '—' }}</b>
          </div>
          <div class="summary-box">
            <span class="sb-label">{{ $t("Mijoz") }}</span>
            <b class="sb-val">{{ detailSale.company_name || detailSale.contact_name || $t("Chakana xaridor") }}</b>
            <div v-if="detailSale.phone" class="sb-sub">📞 {{ detailSale.phone }}</div>
          </div>
          <div class="summary-box highlight">
            <span class="sb-label">{{ $t("Jami summa") }}</span>
            <b class="sb-val pos" style="font-size:18px">{{ money(detailSale.total) }}</b>
          </div>
        </div>

        <!-- Sotilgan tovarlar jadvali -->
        <div class="modal-products-wrap mb">
          <div class="modal-section-title" style="margin-bottom:8px;font-weight:600">
            <span>📦 {{ $t("Sotilgan tovarlar") }}</span>
            <span class="small muted" style="margin-left:6px">({{ (detailSale.items || []).length }} {{ $t("ta mahsulot") }})</span>
          </div>
          <table class="t rt detail-items-table">
            <thead>
              <tr>
                <th style="width:36px;text-align:center">#</th>
                <th>{{ $t("Mahsulot nomi") }}</th>
                <th>{{ $t("Rang / Xususiyat") }}</th>
                <th class="num">{{ $t("Miqdor") }}</th>
                <th class="num">{{ $t("Narxi") }}</th>
                <th class="num">{{ $t("Jami") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in detailSale.items" :key="i">
                <td style="text-align:center" class="muted small">{{ i + 1 }}</td>
                <td>
                  <span v-if="it.sku" class="sku-mini">#{{ it.sku }}</span>
                  <b style="margin-left:4px">{{ it.name }}</b>
                </td>
                <td>
                  <span v-if="it.color" class="color-mini">{{ it.color }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="num"><b>{{ it.qty }}</b> <span class="muted small">{{ it.unit || 'dona' }}</span></td>
                <td class="num muted small">{{ money(it.price) }}</td>
                <td class="num bold">{{ money(it.total) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3"><b>{{ $t("Jami to'lov") }}</b></td>
                <td class="num"><b>{{ (detailSale.items || []).reduce((s, it) => s + (it.qty || 0), 0) }}</b></td>
                <td></td>
                <td class="num bold pos" style="font-size:16px">{{ money(detailSale.total) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="row" style="justify-content:flex-end;gap:10px;margin-top:16px">
          <button type="button" class="btn primary" @click="detailSale=null">{{ $t("Yopish") }}</button>
        </div>
      </div>
    </div>
  </div>`,
};

// ================= Barcha filiallar / skladlar bo'yicha umumiy ombor (Umumiy Sklad) =================
export const OwnerStock = {
  setup() {
    const f = reactive({ branch_id: '', q: '', low: false });
    const data = ref({ rows: [], branches: [], total_products: 0, total_pieces: 0 });
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try {
        data.value = await get('/api/owner/stock' + qs({ branch_id: f.branch_id, q: f.q, low: f.low ? '1' : '0' }));
      } finally {
        loading.value = false;
      }
    };

    const formatBoxes = (st, bq) => {
      if (!bq || bq <= 1 || !st) return '';
      const b = Math.floor(st / bq);
      const r = st % bq;
      if (b > 0 && r > 0) return `${b} ${t('kar')} + ${r} ${t('dona')}`;
      if (b > 0) return `${b} ${t('karobka')}`;
      return `${r} ${t('dona')}`;
    };

    const clearSearch = () => {
      f.q = '';
      load();
    };

    watch(() => [f.branch_id, f.low], load);
    onMounted(load);

    return { f, data, loading, load, clearSearch, money, formatBoxes };
  },
  template: `
  <div class="owner-stock-section">
    <!-- Toolbar: Omborlar filtri va qidiruv -->
    <div class="card stock-toolbar-card mb">
      <div class="stock-toolbar-top">
        <div class="chips" style="margin:0">
          <button type="button" class="chip" :class="{active: !f.branch_id}" @click="f.branch_id=''">
            🏬 {{ $t("Barcha omborlar (Jami)") }}
          </button>
          <button type="button" v-for="b in data.branches" :key="b.id" class="chip" :class="{active: +f.branch_id === b.id}" @click="f.branch_id = String(b.id)">
            🏬 {{b.name}}
          </button>
        </div>
        <label class="check-chip" :class="{active: f.low}">
          <input type="checkbox" v-model="f.low" style="display:none">
          <span class="check-chip-icon">⚠️</span>
          <span class="check-chip-text">{{ $t("Faqat kam qolgan yoki tugaganlar") }}</span>
        </label>
      </div>

      <div class="stock-search-bar mt">
        <div class="stock-search-input-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="f.q" @keydown.enter="load" placeholder="Tovar nomi, artikul (#SKU), brend yoki shtrix-kod..." class="stock-search-input">
          <button type="button" v-if="f.q" class="stock-search-clear" @click="clearSearch" title="Tozalash">✕</button>
        </div>
        <button type="button" class="btn primary stock-search-btn" @click="load">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>{{ $t("Qidirish") }}</span>
        </button>
      </div>
    </div>

    <!-- 3 ta KPI Statistikasi -->
    <div class="grid c3 mb stock-kpi-grid">
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Jami tovar modellari (SKU)") }}</div>
          <span class="stat-icon-badge blue">📦</span>
        </div>
        <div class="v">{{data.total_products}} <span class="stat-unit" style="font-size:14px;color:var(--muted)">{{ $t("xil") }}</span></div>
        <div class="s">{{ $t("katalogdagi faol mahsulotlar") }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Jami ombordagi qoldiq") }}</div>
          <span class="stat-icon-badge green">📊</span>
        </div>
        <div class="v pos">{{data.total_pieces}} <span class="stat-unit" style="font-size:14px;color:var(--muted)">{{ $t("dona") }}</span></div>
        <div class="s">{{ $t("barcha filiallar omborlarida") }}</div>
      </div>
      <div class="card stat stat-kpi">
        <div class="stat-top">
          <div class="l">{{ $t("Skladlar va filiallar") }}</div>
          <span class="stat-icon-badge purple">🏬</span>
        </div>
        <div class="v">{{data.branches.length}} <span class="stat-unit" style="font-size:14px;color:var(--muted)">{{ $t("ta do'kon") }}</span></div>
        <div class="s">{{ $t("yagona tarmoqdagi omborlar") }}</div>
      </div>
    </div>

    <!-- Ombor Jadvali -->
    <div class="card p0 mb stock-table-card">
      <div class="table-scroll-wrap">
        <table class="t rt owner-stock-table">
          <thead>
            <tr>
              <th style="width:46px;text-align:center">{{ $t("Rasm") }}</th>
              <th style="min-width:200px">{{ $t("Mahsulot nomi va kodi") }}</th>
              <th style="min-width:110px">{{ $t("Brend") }}</th>
              <th style="min-width:130px">{{ $t("Ranglar / Model") }}</th>
              <th class="num" style="min-width:110px">{{ $t("Sotuv narxi") }}</th>
              <!-- Har bir filial ustuni -->
              <th v-for="b in data.branches" :key="b.id" class="num branch-stock-th" :class="{selected: f.branch_id && +f.branch_id === b.id}">
                <div class="th-branch-box">
                  <span class="th-branch-icon">🏬</span>
                  <span>{{b.name}}</span>
                </div>
              </th>
              <th class="num total-stock-th" style="min-width:140px">
                <b>{{ $t("JAMI QOLDIQ") }}</b>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in data.rows" :key="p.sku || p.name" class="stock-row" :class="{'stock-row-out': p.total_stock <= 0, 'stock-row-low': p.min_stock > 0 && p.total_stock > 0 && p.total_stock <= p.min_stock}">
              <td style="text-align:center">
                <div class="stock-prod-thumb">
                  <img v-if="p.image" :src="p.image" loading="lazy" decoding="async" class="prod-img" @error="$event.target.style.display='none'">
                  <span class="prod-img-fallback">📦</span>
                </div>
              </td>
              <td>
                <div class="stock-prod-meta">
                  <div class="stock-prod-name bold">{{p.name}}</div>
                  <div class="stock-prod-sub small muted">
                    <span v-if="p.sku" class="sku-mini">#{{p.sku}}</span>
                    <span v-if="[p.volume, p.size].filter(Boolean).length">{{[p.volume, p.size].filter(Boolean).join(' · ')}}</span>
                  </div>
                </div>
              </td>
              <td>
                <span v-if="p.brand" class="brand-tag">{{p.brand}}</span>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <div class="stock-colors-wrap" v-if="p.colors && p.colors.length">
                  <span v-for="c in p.colors.slice(0, 3)" :key="c" class="color-mini">{{c}}</span>
                  <span v-if="p.colors.length > 3" class="color-more">+{{p.colors.length - 3}}</span>
                </div>
                <span v-else class="muted">—</span>
              </td>
              <td class="num">
                <b class="price-val">{{money(p.piece_price)}}</b>
              </td>
              <!-- Har bir filial ustuni -->
              <td v-for="b in data.branches" :key="b.id" class="num branch-stock-td" :class="{selected: f.branch_id && +f.branch_id === b.id}">
                <div class="branch-stock-val">
                  <span :class="(p.stocks[b.id] || 0) > 0 ? 'stock-val-pos' : 'stock-val-zero'">
                    {{p.stocks[b.id] || 0}}
                  </span>
                  <div class="stock-box-sub small muted" v-if="p.box_qty > 1 && (p.stocks[b.id] || 0) > 0">
                    {{formatBoxes(p.stocks[b.id], p.box_qty)}}
                  </div>
                </div>
              </td>
              <!-- Jami qoldiq ustuni -->
              <td class="num total-stock-td">
                <div class="total-stock-cell">
                  <b class="total-stock-num" :class="p.total_stock > 0 ? 'pos' : 'neg'">
                    {{p.total_stock}}
                  </b>
                  <div class="total-box-sub small muted" v-if="p.box_qty > 1 && p.total_stock > 0">
                    {{formatBoxes(p.total_stock, p.box_qty)}}
                  </div>
                  <div class="total-stock-badge-wrap">
                    <span v-if="p.total_stock <= 0" class="badge red sm bold">🔴 {{ $t("Tugagan") }}</span>
                    <span v-else-if="p.min_stock > 0 && p.total_stock <= p.min_stock" class="badge amber sm bold">⚠️ {{ $t("Kam qolgan") }}</span>
                    <span v-else class="badge green sm">✓ {{ $t("Yetarli") }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" v-if="!data.rows.length && !loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">📦</span>
        {{ $t("Omborda tovarlar topilmadi") }}
      </div>
      <div class="empty" v-if="loading">
        <span style="font-size:32px;display:block;margin-bottom:8px">⏳</span>
        {{ $t("Ombor ma'lumotlari yuklanmoqda...") }}
      </div>
    </div>
  </div>`,
};
