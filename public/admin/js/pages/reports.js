// Hisobotlar: foyda va zarar, mahsulotlar (ABC), xodimlar, ombor qiymati
import { ref, reactive, computed, watch, onActivated } from 'vue';
import { get, post, toast, t, money, dt, go, today, qs, qtyFmt, METHODS, METHOD_ICONS, i18n } from '../lib.js';

const monthStart = () => today().slice(0, 8) + '01';

// Kunlik tushum: bitta qator (ustunlar), ustiga olib borilganda — tushum, tannarx, foyda
const DayChart = {
  props: { days: Array },
  setup(props) {
    const hover = ref(null);
    const max = computed(() => Math.max(1, ...props.days.map((d) => d.revenue)));
    const ticks = computed(() => [1, 0.5, 0].map((k) => ({ k, v: Math.round(max.value * k) })));
    return { hover, max, ticks, money };
  },
  template: `
  <div class="day-chart" @mouseleave="hover=null">
    <div class="dc-axis"><span v-for="t in ticks" :key="t.k" :style="{bottom: (t.k*100)+'%'}">{{money(t.v)}}</span></div>
    <div class="dc-plot">
      <div class="dc-grid" v-for="t in ticks" :key="t.k" :style="{bottom: (t.k*100)+'%'}"></div>
      <div class="dc-bars">
        <div v-for="d in days" :key="d.day" class="dc-col" @mouseenter="hover=d" :class="{on: hover===d}">
          <div class="dc-bar" :style="{height: Math.max(1, d.revenue / max * 100) + '%'}"></div>
        </div>
      </div>
      <div class="dc-tip" v-if="hover"><b>{{hover.day}}</b><div>{{ $t('Tushum') }}: {{money(hover.revenue)}} ({{hover.n}})</div><div>{{ $t('Tannarx') }}: {{money(hover.cogs)}}</div><div>{{ $t('Yalpi foyda') }}: <b>{{money(hover.profit)}}</b></div></div>
    </div>
    <div class="dc-x"><span>{{days[0] && days[0].day}}</span><span>{{days.length > 1 ? days[days.length-1].day : ''}}</span></div>
  </div>`,
};

export const ReportsPage = {
  components: { DayChart },
  setup() {
    const f = reactive({ from: monthStart(), to: today() });
    const tab = ref('profit');
    const profit = ref(null);
    const products = ref(null);
    const staff = ref([]);
    const stock = ref(null);
    const expiry = ref([]);
    const abc = ref('');
    const load = async () => {
      if (tab.value === 'profit') profit.value = await get('/api/reports/profit' + qs(f));
      if (tab.value === 'products') products.value = await get('/api/reports/products' + qs(f));
      if (tab.value === 'staff') staff.value = await get('/api/reports/staff' + qs(f));
      if (tab.value === 'stock') [stock.value, expiry.value] = await Promise.all([get('/api/reports/stock'), get('/api/reports/expiry?days=60')]);
    };
    watch(() => [f.from, f.to, tab.value], load);
    onActivated(load);
    const setRange = (k) => {
      const d = new Date();
      if (k === 'today') { f.from = today(); f.to = today(); }
      if (k === 'month') { f.from = monthStart(); f.to = today(); }
      if (k === 'prev') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0);
        f.from = p.toLocaleString('sv-SE').slice(0, 10); f.to = e.toLocaleString('sv-SE').slice(0, 10); }
      if (k === 'year') { f.from = today().slice(0, 4) + '-01-01'; f.to = today(); }
    };
    const cashIn = computed(() => (profit.value ? profit.value.cash.pays.filter((p) => p.direction === 'in') : []));
    const prodRows = computed(() => (products.value ? products.value.rows.filter((r) => !abc.value || r.abc === abc.value) : []));
    const abcCount = (k) => (products.value ? products.value.rows.filter((r) => r.abc === k).length : 0);
    const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
    const writeOff = async (e) => {
      if (!confirm(`${e.name}: ${qtyFmt(e.qty)} — ${t("muddati o'tgan qoldiq hisobdan chiqarilsinmi?")}`)) return;
      await post(`/api/products/expiry/${e.id}/writeoff`);
      toast(t('Hisobdan chiqarildi'), 'ok');
      load();
    };
    return { i18n, f, tab, profit, products, staff, stock, expiry, abc, writeOff, setRange, cashIn, prodRows, abcCount, pct, money, qtyFmt, go, METHODS, METHOD_ICONS };
  },
  template: `
  <div>
    <div class="page-head"><h1>{{ $t('Hisobotlar') }}</h1>
      <a class="btn" :href="'/api/reports/export?type=' + tab + '&from=' + f.from + '&to=' + f.to + '&lang=' + i18n.lang">📥 {{ $t('Excel') }}</a></div>
    <div class="tabs">
      <button :class="{active: tab==='profit'}" @click="tab='profit'">{{ $t('Foyda va zarar') }}</button>
      <button :class="{active: tab==='products'}" @click="tab='products'">{{ $t('Mahsulotlar (ABC)') }}</button>
      <button :class="{active: tab==='staff'}" @click="tab='staff'">{{ $t('Xodimlar') }}</button>
      <button :class="{active: tab==='stock'}" @click="tab='stock'">{{ $t('Ombor qiymati') }}</button>
    </div>
    <div class="row mb" v-if="tab!=='stock'">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="setRange('today')">{{ $t('Bugun') }}</button>
      <button class="chip" @click="setRange('month')">{{ $t('Shu oy') }}</button>
      <button class="chip" @click="setRange('prev')">{{ $t("O'tgan oy") }}</button>
      <button class="chip" @click="setRange('year')">{{ $t('Shu yil') }}</button>
    </div>

    <template v-if="tab==='profit' && profit">
      <div class="grid c4 mb">
        <div class="card stat"><div class="l">{{ $t('Sof tushum') }}</div><div class="v">{{money(profit.net_revenue)}}</div><div class="s">{{profit.sales}} {{ $t('ta sotuv') }}<span v-if="profit.returns"> · {{ $t('qaytarish') }} −{{money(profit.returns)}}</span></div></div>
        <div class="card stat"><div class="l">{{ $t('Yalpi foyda') }}</div><div class="v" :class="profit.gross >= 0 ? 'pos' : 'neg'">{{money(profit.gross)}}</div><div class="s">{{ $t('marja') }} {{profit.margin}}%</div></div>
        <div class="card stat"><div class="l">{{ $t('Xarajatlar') }}</div><div class="v neg">{{money(profit.expenses)}}</div><div class="s"><a href="#/expenses">{{ $t('Batafsil') }} →</a></div></div>
        <div class="card stat hero"><div class="l">{{ $t('Sof foyda') }}</div><div class="v" :class="profit.net_profit >= 0 ? 'pos' : 'neg'">{{money(profit.net_profit)}}</div><div class="s">{{ $t('tushumning') }} {{pct(profit.net_profit, profit.net_revenue)}}%</div></div>
      </div>
      <div class="warn-box mb" v-if="profit.no_cost_items">⚠ {{profit.no_cost_items}} {{ $t("ta sotilgan pozitsiyada tannarx yo'q — foyda oshib ko'rinadi. Mahsulotlarga tannarx kiriting (xarid yoki mahsulot formasi orqali).") }}</div>
      <div class="grid c2 mb">
        <div class="card">
          <h3>{{ $t('Kunlik tushum') }}</h3>
          <day-chart v-if="profit.days.length" :days="profit.days"/>
          <div class="empty" v-else>{{ $t("Bu davrda sotuv yo'q") }}</div>
        </div>
        <div class="card">
          <h3>{{ $t('Foyda va zarar hisoboti') }}</h3>
          <table class="t pl">
            <tbody>
              <tr><td>{{ $t('Sotuvlar (tushum)') }}</td><td class="num">{{money(profit.revenue)}}</td></tr>
              <tr v-if="profit.discount"><td class="muted small">&nbsp;&nbsp;{{ $t('shundan chegirmalar') }}</td><td class="num muted small">{{money(profit.discount)}}</td></tr>
              <tr v-if="profit.returns"><td>− {{ $t('Qaytarishlar') }}</td><td class="num">{{money(profit.returns)}}</td></tr>
              <tr class="b"><td>{{ $t('Sof tushum') }}</td><td class="num">{{money(profit.net_revenue)}}</td></tr>
              <tr><td>− {{ $t('Sotilgan tovar tannarxi') }}</td><td class="num">{{money(profit.cogs)}}</td></tr>
              <tr class="b"><td>{{ $t('Yalpi foyda') }}</td><td class="num">{{money(profit.gross)}}</td></tr>
              <tr v-for="e in profit.expenses_by_cat" :key="e.category"><td>− {{ $t(e.category) }}</td><td class="num">{{money(e.total)}}</td></tr>
              <tr class="b big"><td>{{ $t('Sof foyda') }}</td><td class="num" :class="profit.net_profit >= 0 ? 'pos' : 'neg'">{{money(profit.net_profit)}}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card mb">
        <h3>{{ $t('Pul oqimi') }}</h3>
        <div class="grid c4">
          <div v-for="p in cashIn" :key="p.method" class="stat"><div class="l">{{METHOD_ICONS[p.method]}} {{ $t('Kirim') }}: {{METHODS[p.method]}}</div><div class="v pos" style="font-size:18px">{{money(p.total)}}</div></div>
          <div class="stat"><div class="l">{{ $t('Xaridlar') }} ({{profit.cash.purchases_n}})</div><div class="v" style="font-size:18px">{{money(profit.cash.purchases)}}</div></div>
          <div class="stat"><div class="l">{{ $t("Yetkazib beruvchilarga to'langan") }}</div><div class="v neg" style="font-size:18px">{{money(profit.cash.supplier_paid)}}</div></div>
        </div>
      </div>
    </template>

    <template v-if="tab==='products' && products">
      <div class="chips mb">
        <button class="chip" :class="{active: !abc}" @click="abc=''">{{ $t('Hammasi') }} · {{products.rows.length}}</button>
        <button class="chip" :class="{active: abc==='A'}" @click="abc='A'">A · {{abcCount('A')}} <span class="muted small">({{ $t('tushumning 80%') }})</span></button>
        <button class="chip" :class="{active: abc==='B'}" @click="abc='B'">B · {{abcCount('B')}}</button>
        <button class="chip" :class="{active: abc==='C'}" @click="abc='C'">C · {{abcCount('C')}}</button>
      </div>
      <div class="card p0 mb">
        <table class="t rt">
          <thead><tr><th>{{ $t('Mahsulot') }}</th><th class="num">{{ $t('Sotildi') }}</th><th class="num">{{ $t('Tushum') }}</th><th class="num">{{ $t('Foyda') }}</th><th class="num">{{ $t('Ulush') }}</th></tr></thead>
          <tbody><tr v-for="r in prodRows" :key="r.id" class="click" @click="go('/products/'+r.id)">
            <td class="main-cell"><span class="badge" :class="r.abc==='A' ? 'purple' : r.abc==='B' ? 'blue' : 'gray'">{{r.abc}}</span> <b>{{r.name}}</b><div class="small muted">{{r.category}}</div></td>
            <td :data-l="$t('Sotildi')" class="num">{{qtyFmt(Math.round(r.qty * 1000) / 1000)}} {{baseName(r)}}</td>
            <td :data-l="$t('Tushum')" class="num bold">{{money(r.revenue)}}</td>
            <td :data-l="$t('Foyda')" class="num" :class="r.profit >= 0 ? 'pos' : 'neg'">{{money(r.profit)}}<div class="small muted">{{pct(r.profit, r.revenue)}}%</div><div v-if="!r.cogs" class="small" style="color:#d97706">⚠️ {{ $t('tannarxsiz') }}</div></td>
            <td :data-l="$t('Ulush')" class="num">{{pct(r.revenue, products.total)}}%</td>
          </tr></tbody>
        </table>
        <div class="empty" v-if="!prodRows.length">{{ $t("Bu davrda sotuv yo'q") }}</div>
      </div>
      <div class="card" v-if="products.dead.length">
        <h3>💤 {{ $t('Bu davrda sotilmagan (omborda turgan) tovarlar') }}</h3>
        <div v-for="d in products.dead" :key="d.id" class="row small" style="padding:3px 0"><a :href="'#/products/'+d.id" style="flex:1">{{d.name}}</a><span class="muted">{{qtyFmt(d.stock)}}</span><b v-if="$can('products.cost')">{{money(Math.round(d.stock * d.cost_price))}}</b></div>
      </div>
    </template>

    <div class="card p0" v-if="tab==='staff'">
      <table class="t rt">
        <thead><tr><th>{{ $t('Xodim') }}</th><th class="num">{{ $t('Sotuvlar') }}</th><th class="num">{{ $t('Tushum') }}</th><th class="num">{{ $t("O'rtacha chek") }}</th><th class="num">{{ $t('Yalpi foyda') }}</th></tr></thead>
        <tbody><tr v-for="s in staff" :key="s.id">
          <td class="main-cell"><b>{{s.name}}</b></td>
          <td :data-l="$t('Sotuvlar')" class="num">{{s.n}}</td>
          <td :data-l="$t('Tushum')" class="num bold">{{money(s.revenue)}}</td>
          <td :data-l="$t(&quot;O'rtacha chek&quot;)" class="num">{{money(s.avg)}}</td>
          <td :data-l="$t('Yalpi foyda')" class="num pos">{{money(s.profit)}}</td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!staff.length">{{ $t("Bu davrda sotuv yo'q") }}</div>
    </div>

    <template v-if="tab==='stock' && stock">
      <div class="grid c4 mb">
        <div class="card stat"><div class="l">{{ $t('Ombor qiymati (tannarxda)') }}</div><div class="v">{{money(stock.cost_value)}}</div></div>
        <div class="card stat"><div class="l">{{ $t('Sotuv narxida') }}</div><div class="v">{{money(stock.sale_value)}}</div><div class="s">{{ $t('kutilgan ustama') }} {{money(stock.sale_value - stock.cost_value)}}</div></div>
        <div class="card stat"><div class="l">{{ $t('Tugagan') }}</div><div class="v neg">{{stock.out_n}}</div><div class="s">{{stock.n}} {{ $t('ta faol mahsulotdan') }}</div></div>
        <div class="card stat"><div class="l">{{ $t('Kam qolgan') }}</div><div class="v" :class="{neg: stock.low_n}">{{stock.low_n}}</div><div class="s"><a href="#/products?low=1">{{ $t("Ro'yxat") }} →</a></div></div>
      </div>
      <div class="warn-box mb" v-if="stock.no_cost_n">⚠ {{stock.no_cost_n}} {{ $t("ta mahsulotda tannarx yo'q — ombor qiymati to'liq emas") }}</div>
      <div class="card p0 mb" v-if="expiry.length">
        <div style="padding:14px 16px 0"><h3>⏳ {{ $t("Yaroqlilik muddati yaqin (60 kun) yoki o'tgan") }}</h3></div>
        <table class="t rt"><tbody><tr v-for="e in expiry" :key="e.id" class="click" @click="go('/products/'+e.product_id)">
          <td class="main-cell"><b>{{e.name}}</b><div class="small muted">{{ $t('kirim') }} {{e.date.slice(0,10)}} · {{ $t('kelgan') }} {{qtyFmt(e.received)}}</div></td>
          <td :data-l="$t('Qoldiq')" class="num">{{qtyFmt(e.qty)}} {{baseName(e)}}<div class="small muted" v-if="e.value">{{money(e.value)}}</div></td>
          <td :data-l="$t('Muddati')" class="num bold" :class="e.expired ? 'neg' : ''">{{e.expires_at}}<div class="small" v-if="e.expired">{{ $t("muddati o'tgan") }}</div></td>
          <td class="num" style="width:1%"><button v-if="e.expired && $can('products.stock')" class="btn sm danger" @click.stop="writeOff(e)">{{ $t('Hisobdan chiqarish') }}</button></td>
        </tr></tbody></table>
      </div>
      <div class="card p0" v-if="stock.low.length">
        <div style="padding:14px 16px 0"><h3>{{ $t('Buyurtma qilish kerak') }}</h3></div>
        <table class="t rt"><tbody><tr v-for="p in stock.low" :key="p.id" class="click" @click="go('/products/'+p.id)">
          <td class="main-cell"><b>{{p.name}}</b></td>
          <td :data-l="$t('Qoldiq')" class="num neg">{{qtyFmt(p.stock)}} {{baseName(p)}}</td>
          <td :data-l="$t('Minimal')" class="num muted">min {{qtyFmt(p.min_stock)}}</td>
        </tr></tbody></table>
      </div>
    </template>
  </div>`,
};
