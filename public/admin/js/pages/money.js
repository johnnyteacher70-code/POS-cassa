import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import { get, post, money, dt, d, go, route, clientName, balanceInfo, debounce, qs, METHODS, METHOD_ICONS, today, toast, i18n, session } from '../lib.js';
import { removeWithUndo } from './clients.js';

// ---------- To'lovlar (kassa) ----------
export const PaymentsPage = {
  setup() {
    const f = reactive({ q: '', direction: '', method: '', from: route.query.from || '', to: route.query.to || '', user_id: route.query.user || '', register_id: route.query.register || '' });
    const data = ref({ rows: [], sums: [] });
    const modal = ref(null);
    const load = async () => { data.value = await get('/api/payments' + qs(f), { latest: 'payments' }); };
    watch(() => f.q, debounce(load, 250));
    watch(() => [f.direction, f.method, f.from, f.to, f.user_id, f.register_id], load);
    onActivated(load);
    const totals = computed(() => {
      const t = { in: 0, out: 0, byMethod: {} };
      for (const s of data.value.sums) {
        t[s.direction] += s.total;
        t.byMethod[s.method] ||= { in: 0, out: 0 };
        t.byMethod[s.method][s.direction] += s.total;
      }
      return t;
    });
    const setToday = () => { f.from = today(); f.to = today(); };
    const remove = (p) => removeWithUndo('/api/payments/' + p.id, `To'lov ${money(p.amount)}`, load);
    return { f, data, modal, load, totals, setToday, remove, money, dt, go, clientName, METHODS, METHOD_ICONS };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("To'lovlar (kassa)") }}</h1>
        <div class="small muted">{{ $t("Mijozlardan qabul qilingan kirimlar va qaytarilgan chiqim orderlari") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px">
        <button class="btn green" v-if="$can('payments.create')" @click="modal={direction:'in'}">⬇ {{ $t("Kirim qabul qilish") }}</button>
        <button class="btn" v-if="$can('payments.create')" @click="modal={direction:'out'}">⬆ {{ $t("Chiqim berish") }}</button>
      </div>
    </div>
    <div class="grid c4 mb">
      <div class="card stat"><div class="l">⬇ {{ $t("Jami kirim") }}</div><div class="v pos">{{money(totals.in)}}</div></div>
      <div class="card stat"><div class="l">⬆ {{ $t("Jami chiqim") }}</div><div class="v neg">{{money(totals.out)}}</div></div>
      <div class="card stat" v-for="(l,k) in METHODS" :key="k" v-show="totals.byMethod[k]">
        <div class="l">{{METHOD_ICONS[k]}} {{l}}</div><div class="v">{{money((totals.byMethod[k]||{}).in - (totals.byMethod[k]||{}).out)}}</div>
      </div>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <div class="search-big" style="flex:1;min-width:200px"><input v-model="f.q" :placeholder="$t('Mijoz, telefon, summa, izoh...')"></div>
      <input type="date" v-model="f.from" style="width:auto"><input type="date" v-model="f.to" style="width:auto">
      <button class="btn sm" @click="setToday">{{ $t("Bugun") }}</button>
      <staff-select v-model="f.user_id"/>
      <register-select v-model="f.register_id"/>
    </div>
    <div class="chips mb" style="align-items:center;gap:6px">
      <button class="chip" :class="{active:f.direction===''}" @click="f.direction=''">{{ $t("Hammasi") }}</button>
      <button class="chip" :class="{active:f.direction==='in'}" @click="f.direction='in'">⬇ {{ $t("Kirim") }}</button>
      <button class="chip" :class="{active:f.direction==='out'}" @click="f.direction='out'">⬆ {{ $t("Chiqim") }}</button>
      <span style="width:12px"></span>
      <button class="chip" :class="{active:f.method===''}" @click="f.method=''">{{ $t("Barcha turlar") }}</button>
      <button v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active:f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Sana") }}</th><th>{{ $t("Mijoz") }}</th><th>{{ $t("Turi") }}</th><th class="num">{{ $t("Summa") }}</th><th>{{ $t("Sotuv") }}</th><th>{{ $t("Izoh") }}</th><th>{{ $t("Qabul qildi") }}</th><th>{{ $t("Kassa") }}</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in data.rows" :key="p.id">
            <td :data-l="$t('Sana')" class="nowrap small">{{dt(p.date)}}</td>
            <td class="main-cell"><a :href="'#/clients/'+p.client_id"><b>{{clientName(p)}}</b></a></td>
            <td :data-l="$t('Turi')" class="nowrap">
              <span class="badge sm" :class="p.direction==='in' ? 'green' : 'red'" style="margin-right:4px">{{p.direction==='in' ? '⬇ ' + $t("Kirim") : '⬆ ' + $t("Chiqim")}}</span>
              <span class="small">{{METHOD_ICONS[p.method]}} {{METHODS[p.method]}}</span>
            </td>
            <td :data-l="$t('Summa')" class="num bold" :class="p.direction==='in' ? 'pos' : 'neg'">{{p.direction==='in' ? '+' : '−'}}{{money(p.amount)}}</td>
            <td :data-l="$t('Sotuv')"><a v-if="p.sale_id" :href="'#/sales/'+p.sale_id" class="badge gray sm">{{p.sale_number}}</a><span v-else class="muted small">{{ $t("umumiy") }}</span></td>
            <td :data-l="$t('Izoh')" class="small muted">{{$t(p.note)}}</td>
            <td :data-l="$t('Qabul qildi')" class="small">👤 {{p.user_name}}</td>
            <td :data-l="$t('Kassa')" class="small">{{p.register_name ? ('📠 ' + $t(p.register_name)) : '—'}}</td>
            <td data-l="" class="right nowrap">
              <button class="btn sm ghost" v-if="$can('payments.edit')" @click="modal={payment:p}">✎</button>
              <button class="btn sm ghost" v-if="$can('payments.delete')" @click="remove(p)">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!data.rows.length">{{ $t("To'lovlar yo'q") }}</div>
    </div>
    <payment-modal v-if="modal" :direction="modal.direction" :payment="modal.payment" @close="modal=null" @saved="load"/>
  </div>`,
};

// ---------- Qarzlar ----------
export const DebtsPage = {
  setup() {
    const tab = ref(route.query.tab || 'open');
    const f = reactive({ q: '', from: '', to: '', overdue: '', user_id: route.query.user || '' });
    const data = ref({ rows: [], sum: {} });
    const clients = ref({ rows: [], totals: {} });
    const pay = ref(null);
    const reminders = ref([]);
    const remDays = ref(30);
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try {
        if (tab.value === 'reminders') {
          reminders.value = await get('/api/debts/reminders?days=' + remDays.value);
          return;
        }
        if (tab.value === 'open' || tab.value === 'closed') {
          data.value = await get('/api/debts' + qs({ tab: tab.value, ...f }), { latest: 'debts' });
        } else {
          clients.value = await get('/api/clients' + qs({ filter: tab.value, q: f.q }), { latest: 'debts-clients' });
        }
      } finally {
        loading.value = false;
      }
    };
    watch(() => f.q, debounce(load, 250));
    watch(() => [tab.value, f.from, f.to, f.overdue, f.user_id, remDays.value], load);
    const remText = (r) => (i18n.lang === 'ru' ? r.text_ru : r.text_uz);
    const copy = async (r) => {
      try { await navigator.clipboard.writeText(remText(r)); toast(t('Matn nusxalandi — messenjer yoki SMS ga joylang'), 'ok'); }
      catch { toast(t("Nusxalab bo'lmadi — matnni belgilab nusxalang"), 'error'); }
    };
    const reminded = async (r, how) => { await post(`/api/clients/${r.id}/reminded`, { how }); r.reminded_at = new Date().toLocaleString('sv-SE').slice(0, 19); toast(t('Belgilandi'), 'ok'); };
    onActivated(load);
    const nowS = new Date().toLocaleString('sv-SE').slice(0, 19);
    return { tab, f, data, clients, pay, loading, load, money, dt, d, go, clientName, balanceInfo, nowS, reminders, remDays, remText, copy, reminded };
  },
  template: `
  <div class="debts-page-wrap">
    <!-- 1. Header -->
    <div class="page-head">
      <div>
        <h1>{{ $t("Qarzdorlik nazorati") }}</h1>
        <div class="small muted">{{ $t("Mijozlar bilan qarz hisob-kitoblari va eslatmalar") }}</div>
      </div>
      <div class="head-actions">
        <a class="btn" href="/api/reports/export?type=debts">📥 {{ $t("Qarzdorlar (Excel)") }}</a>
      </div>
    </div>

    <!-- 2. Navigatsiya Tablari -->
    <div class="tabs debts-tabs">
      <button :class="{active:tab==='open'}" @click="tab='open'">{{ $t("Ochiq qarzlar (hujjatlar)") }}</button>
      <button :class="{active:tab==='closed'}" @click="tab='closed'">{{ $t("Yopilgan qarzlar") }}</button>
      <button :class="{active:tab==='debtors'}" @click="tab='debtors'">{{ $t("Qarzdor mijozlar") }}</button>
      <button :class="{active:tab==='advance'}" @click="tab='advance'">{{ $t("Biz qarzdormiz (avanslar)") }}</button>
      <button :class="{active:tab==='reminders'}" @click="tab='reminders'">🔔 {{ $t("Eslatmalar") }}</button>
    </div>

    <!-- 3. Eslatmalar Bo'limi -->
    <template v-if="tab==='reminders'">
      <div class="row mb no-print" style="align-items:center;gap:10px">
        <span class="small muted">{{ $t("Muddati o'tgan yoki shuncha kundan eski qarzlar:") }}</span>
        <select v-model.number="remDays" style="width:auto">
          <option :value="7">7 {{ $t("kun") }}</option>
          <option :value="15">15 {{ $t("kun") }}</option>
          <option :value="30">30 {{ $t("kun") }}</option>
          <option :value="60">60 {{ $t("kun") }}</option>
        </select>
        <span class="spacer"></span>
        <button class="btn" onclick="window.print()">🖨 {{ $t("Ro'yxatni chop etish") }}</button>
      </div>
      <div class="card p0 print-area debts-table-card">
        <table class="t rt">
          <thead>
            <tr>
              <th>{{ $t("Mijoz") }}</th>
              <th class="num">{{ $t("Muddati o'tgan") }}</th>
              <th class="num">{{ $t("Jami qarz") }}</th>
              <th>{{ $t("Eslatma matni") }}</th>
              <th class="no-print"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reminders" :key="r.id">
              <td class="main-cell">
                <a :href="'#/clients/' + r.id"><b>{{clientName(r)}}</b></a>
                <div class="small"><a v-if="r.phone" :href="'tel:' + r.phone">📞 {{r.phone}}</a></div>
                <div class="small muted">{{ $t("eng eskisi") }}: {{d(r.oldest)}}<span v-if="r.reminded_at"> · {{ $t("eslatilgan") }}: {{dt(r.reminded_at)}}</span></div>
              </td>
              <td :data-l="$t(&quot;Muddati o'tgan&quot;)" class="num neg bold">{{money(r.overdue)}}</td>
              <td :data-l="$t('Jami qarz')" class="num bold">{{money(-r.balance)}}</td>
              <td :data-l="$t('Matn')" class="small" style="max-width:380px">{{remText(r)}}</td>
              <td data-l="" class="right nowrap no-print">
                <button class="btn sm" @click="copy(r)" :title="$t('Matnni nusxalash')">📋 {{ $t("Nusxalash") }}</button>
                <button class="btn sm" @click="reminded(r, 'xabar')">✓ {{ $t("Eslatildi") }}</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-if="!reminders.length && !loading">{{ $t("Muddati o'tgan qarz yo'q 🎉") }}</div>
      </div>
    </template>

    <!-- 4. Ochiq / Yopilgan Qarzlar yoki Mijozlar Ro'yxati -->
    <template v-else>
      <div class="row mb debts-filters-row">
        <div class="search-big" style="flex:1;min-width:240px">
          <input v-model="f.q" :placeholder="$t('Mijoz, INN, telefon, hujjat № yoki summa...')">
        </div>
        <template v-if="tab==='open' || tab==='closed'">
          <div class="date-pickers-group">
            <input type="date" v-model="f.from" :title="tab==='open' ? $t('Qarz olingan sanadan') : $t('Yopilgan sanadan')">
            <span class="date-sep">—</span>
            <input type="date" v-model="f.to">
          </div>
          <label class="check" v-if="tab==='open'" style="white-space:nowrap">
            <input type="checkbox" v-model="f.overdue" true-value="1" false-value="">
            <span>{{ $t("Faqat muddati o'tgan") }}</span>
          </label>
          <staff-select v-model="f.user_id" :placeholder="tab==='open' ? $t('Sotuvchi: hammasi') : $t('Yopgan xodim: hammasi')" style="min-width:140px"/>
        </template>
      </div>

      <!-- Ochiq / Yopilgan Qarz Hujjatlari -->
      <div class="card p0 debts-table-card" v-if="tab==='open' || tab==='closed'">
        <table class="t rt">
          <thead>
            <tr>
              <th>{{ $t("Hujjat") }}</th>
              <th>{{ $t("Mijoz") }}</th>
              <th>{{ $t("Qarz olingan") }}</th>
              <th v-if="tab==='open'">{{ $t("Muddat") }}</th>
              <th v-else>{{ $t("Yopilgan") }}</th>
              <th>{{tab==='open' ? $t("Sotuvchi") : $t("Yopgan xodim")}}</th>
              <th class="num">{{ $t("Kun") }}</th>
              <th class="num">{{ $t("Summa") }}</th>
              <th class="num" v-if="tab==='open'">{{ $t("To'langan") }}</th>
              <th class="num" v-if="tab==='open'">{{ $t("Qoldiq") }}</th>
              <th v-if="tab==='open'"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.rows" :key="r.id" class="click" @click="go('/sales/'+r.id)">
              <td class="main-cell bold">{{r.number}}</td>
              <td :data-l="$t('Mijoz')" @click.stop>
                <a :href="'#/clients/'+r.client_id"><b>{{clientName(r)}}</b></a>
                <div class="small muted" v-if="r.phone">{{r.phone}}</div>
              </td>
              <td :data-l="$t('Olingan')" class="nowrap">{{dt(r.date)}}</td>
              <td :data-l="$t('Muddat')" class="nowrap" v-if="tab==='open'">
                <span v-if="r.due_date" :class="{neg: r.due_date < nowS, bold: r.due_date < nowS}">
                  {{d(r.due_date)}} <small v-if="r.due_date < nowS">⚠️</small>
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td :data-l="$t('Yopilgan')" class="nowrap pos" v-else>{{dt(r.closed_at)}}</td>
              <td :data-l="tab==='open' ? $t('Sotuvchi') : $t('Yopgan xodim')" class="small">
                {{tab==='open' ? r.seller_name : r.closer_name}}
              </td>
              <td :data-l="$t('Kun')" class="num">{{r.days}}</td>
              <td :data-l="$t('Summa')" class="num">{{money(r.total)}}</td>
              <td :data-l="$t(&quot;To'langan&quot;)" class="num pos" v-if="tab==='open'">{{money(r.paid_amount)}}</td>
              <td :data-l="$t('Qoldiq')" class="num neg bold" v-if="tab==='open'">{{money(r.rest)}}</td>
              <td data-l="" v-if="tab==='open'" @click.stop class="right">
                <button class="btn sm green" v-if="$can('payments.create')" @click="pay=r">{{ $t("To'lash") }}</button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="data.rows.length">
            <tr>
              <td colspan="6"><b>{{ $t("Jami") }}: {{data.rows.length}} {{ $t("ta") }}</b></td>
              <td class="num bold" :data-l="$t('Summa')">{{money(data.sum.total)}}</td>
              <td class="num pos bold" :data-l="$t(&quot;To'langan&quot;)" v-if="tab==='open'">{{money(data.sum.paid)}}</td>
              <td class="num neg bold" :data-l="$t('Qoldiq')" v-if="tab==='open'">{{money(data.sum.rest)}}</td>
              <td v-if="tab==='open'"></td>
            </tr>
          </tfoot>
        </table>
        <div class="empty" v-if="!data.rows.length && !loading">{{ $t("Hech narsa yo'q") }}</div>
      </div>

      <!-- Qarzdor Mijozlar yoki Avansdagilar -->
      <div v-else-if="tab==='debtors' || tab==='advance'">
        <div class="card stat mb" style="max-width:340px">
          <div class="l">{{tab==='debtors' ? $t("Jami bizga qarz") : $t("Jami biz qarzdormiz")}}</div>
          <div class="v" :class="tab==='debtors' ? 'neg' : 'pos'">
            {{money(tab==='debtors' ? clients.totals.receivable : clients.totals.payable)}}
          </div>
        </div>
        <div class="card p0 debts-table-card">
          <table class="t rt">
            <thead>
              <tr>
                <th>{{ $t("Mijoz") }}</th>
                <th>{{ $t("Telefon") }}</th>
                <th>{{ $t("Ochiq hujjatlar") }}</th>
                <th class="num">{{ $t("Balans") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in clients.rows" :key="c.id" class="click" @click="go('/clients/'+c.id)">
                <td class="main-cell bold">
                  {{clientName(c)}}
                  <div class="small muted" v-if="c.company_name && c.contact_name">{{c.contact_name}}</div>
                </td>
                <td :data-l="$t('Telefon')">{{c.phone || '—'}}</td>
                <td :data-l="$t('Ochiq')">
                  {{c.open_debts ? c.open_debts + $t(" ta, ") + d(c.oldest_debt) + $t(" dan") : '—'}}
                </td>
                <td :data-l="$t('Balans')" class="num bold" :class="balanceInfo(c.balance).cls">{{money(c.balance)}}</td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-if="!clients.rows.length && !loading">{{ $t("Hech kim yo'q") }}</div>
        </div>
      </div>
    </template>

    <payment-modal v-if="pay" :client-id="pay.client_id" :sale-id="pay.id" :amount="pay.rest" @close="pay=null" @saved="load"/>
  </div>`,
};

// ---------- Bosh sahifa ----------
export const DashboardPage = {
  setup() {
    const data = ref(null);
    const loading = ref(false);
    const pay = ref(false);
    const load = async () => {
      if (!session.branch) return;
      loading.value = true;
      try {
        data.value = await get('/api/dashboard');
      } catch {
        /* ignore if branch reset */
      } finally {
        loading.value = false;
      }
    };
    onActivated(load);

    const greeting = computed(() => {
      const h = new Date().getHours();
      if (h < 11) return "Xayrli tong";
      if (h < 18) return "Xayrli kun";
      return "Xayrli kech";
    });

    const todayFmt = computed(() => {
      const cur = new Date();
      return cur.toLocaleDateString(i18n.lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
    });

    const sumPay = (rows, dir) => (rows || []).filter((r) => r.direction === dir).reduce((a, r) => a + r.total, 0);

    return { data, loading, pay, load, sumPay, money, dt, d, go, clientName, METHODS, METHOD_ICONS, session, greeting, todayFmt };
  },
  template: `
  <div class="dash-wrap">
    <!-- 1. Header & Welcome Bar -->
    <div class="dash-head">
      <div class="dash-head-left">
        <h1 class="dash-title">{{ $t("Bosh sahifa") }}</h1>
        <div class="dash-subtitle">
          <span class="dash-branch-badge" v-if="session.branch">📍 {{ session.branch.name }}</span>
          <span class="dash-date-text">{{ greeting }} · {{ todayFmt }}</span>
        </div>
      </div>
      <div class="dash-head-actions">
        <a class="btn primary" v-if="$can('sales.create')" href="#/sales/new">
          <span>🧾 {{ $t("Yangi sotuv") }}</span>
        </a>
        <a class="btn pos-btn" v-if="$can('pos.use')" href="#/pos">
          <span>🛒 {{ $t("POS Kassa") }}</span>
        </a>
        <button class="btn green" v-if="$can('payments.create')" @click="pay=true">
          <span>⬇ {{ $t("Kirim") }}</span>
        </button>
        <button class="btn ghost icon" @click="load" :class="{spin: loading}" :title="$t('Yangilash')">
          ↻
        </button>
      </div>
    </div>

    <!-- Yuklanish indikatori (Skeleton) -->
    <div v-if="loading && !data" class="dash-skeleton">
      <div class="dash-skeleton-grid">
        <div v-for="n in 4" :key="n" class="skeleton-card"></div>
      </div>
    </div>

    <template v-else-if="data">
      <!-- 2. Yangi Buyurtmalar Ogohlantirishi -->
      <a href="#/orders" v-if="data.new_orders" class="dash-notice-banner">
        <div class="notice-left">
          <span class="notice-icon">🛒</span>
          <div>
            <b>{{ data.new_orders }} {{ $t("ta yangi buyurtma") }}</b>
            <div class="notice-sub">{{ $t("Katalog orqali yangi tushgan buyurtmalarni ko'rish") }}</div>
          </div>
        </div>
        <span class="notice-arrow">→</span>
      </a>

      <!-- 3. Jonli ochiq smenalar (Active Shifts) -->
      <div class="dash-shifts-card" v-if="data.open_shifts && data.open_shifts.length">
        <div class="shifts-card-title">
          <span class="pulse-dot"></span>
          <b>{{ $t("Jonli ochiq smenalar") }} ({{ data.open_shifts.length }}):</b>
        </div>
        <div class="shifts-chips-list">
          <a v-for="s in data.open_shifts" :key="s.id" :href="'#/shifts/' + s.id" class="shift-chip">
            <span class="shift-reg">🏪 {{ s.register_name || 'Kassa' }}</span>
            <span class="shift-divider">•</span>
            <span class="shift-user">👤 {{ s.user_name }}</span>
            <span class="shift-time">{{ dt(s.opened_at) }}</span>
          </a>
        </div>
      </div>

      <!-- 4. Hero KPI Grid (4 ta asosiy kartalar) -->
      <div class="dash-kpi-grid">
        <!-- 4.1 Bugungi Savdo & Kirim -->
        <div class="kpi-card hero-sales">
          <div class="kpi-card-header">
            <span class="kpi-icon sales-ico">💳</span>
            <span class="kpi-badge today">{{ $t("Bugun") }}</span>
          </div>
          <div class="kpi-label">{{ $t("Bugungi sotuv") }}</div>
          <div class="kpi-value">{{ money(data.today.sales.total) }} <span class="kpi-cur">{{ $t("so'm") }}</span></div>
          <div class="kpi-meta">
            <span>{{ data.today.sales.n }} {{ $t("ta chek") }}</span>
            <span class="kpi-meta-dot">•</span>
            <span class="pos">Kirim: {{ money(sumPay(data.today.payments, 'in')) }}</span>
          </div>
          <div class="kpi-payment-pills" v-if="data.today.payments && data.today.payments.length">
            <span v-for="p in data.today.payments.filter(x => x.direction === 'in')" :key="p.method" class="pay-pill">
              {{ METHOD_ICONS[p.method] }} {{ money(p.total) }}
            </span>
          </div>
        </div>

        <!-- 4.2 Sof Foyda (Bugun & Shu oy) -->
        <a v-if="data.profit" href="#/reports" class="kpi-card hero-profit">
          <div class="kpi-card-header">
            <span class="kpi-icon profit-ico">📈</span>
            <span class="kpi-badge" :class="data.profit.today.net >= 0 ? 'pos' : 'neg'">
              {{ data.profit.today.net >= 0 ? '▲ Foyda' : '▼ Zarar' }}
            </span>
          </div>
          <div class="kpi-label">{{ $t("Bugungi sof foyda") }}</div>
          <div class="kpi-value" :class="data.profit.today.net >= 0 ? 'pos' : 'neg'">
            {{ money(data.profit.today.net) }} <span class="kpi-cur">{{ $t("so'm") }}</span>
          </div>
          <div class="kpi-meta">
            <span>{{ $t("Yalpi") }}: {{ money(data.profit.today.gross) }}</span>
            <span v-if="data.profit.today.expenses" class="kpi-meta-dot">•</span>
            <span v-if="data.profit.today.expenses" class="neg">Xarajat: {{ money(data.profit.today.expenses) }}</span>
          </div>
          <div class="kpi-footer-sub">
            <span>{{ $t("Shu oy sof") }}:</span>
            <b :class="data.profit.month.net >= 0 ? 'pos' : 'neg'">{{ money(data.profit.month.net) }} {{ $t("so'm") }}</b>
          </div>
        </a>

        <!-- 4.3 Bizga Qarzdorlar (Debtors) -->
        <a href="#/debts?tab=debtors" class="kpi-card hero-debt">
          <div class="kpi-card-header">
            <span class="kpi-icon debt-ico">👥</span>
            <span class="kpi-badge neg">{{ data.totals.debtors }} {{ $t("ta mijoz") }}</span>
          </div>
          <div class="kpi-label">{{ $t("Bizga qarzdorlar") }}</div>
          <div class="kpi-value neg">{{ money(data.totals.receivable) }} <span class="kpi-cur">{{ $t("so'm") }}</span></div>
          <div class="kpi-meta">
            <span>Haqimiz bo'lgan jami qarz</span>
          </div>
          <div class="kpi-footer-sub" v-if="data.totals.payable">
            <span class="pos">Avanslar (biz qarzdormiz):</span>
            <b>{{ money(data.totals.payable) }}</b>
          </div>
        </a>

        <!-- 4.4 Ombor va Yetkazuvchilar -->
        <a href="#/products?low=1" class="kpi-card hero-stock">
          <div class="kpi-card-header">
            <span class="kpi-icon stock-ico">📦</span>
            <span class="kpi-badge warning" v-if="data.low_stock || data.out_of_stock">Diqqat</span>
            <span class="kpi-badge pos" v-else>Normal</span>
          </div>
          <div class="kpi-label">{{ $t("Kam qolgan tovarlar") }}</div>
          <div class="kpi-value" :class="{neg: data.low_stock > 0}">
            {{ data.low_stock }} <span class="kpi-cur">{{ $t("xil tovar") }}</span>
          </div>
          <div class="kpi-meta">
            <span class="neg" v-if="data.out_of_stock">Tugagan: {{ data.out_of_stock }} xil</span>
            <span v-else class="pos">Tugagan tovarlar yo'q</span>
          </div>
          <div class="kpi-footer-sub" v-if="data.supplier_debt > 0">
            <span class="neg">Yetkazuvchiga qarz:</span>
            <b>{{ money(data.supplier_debt) }}</b>
          </div>
        </a>
      </div>

      <!-- 5. Oylik Xulosa Satri (Monthly Summary Strip) -->
      <div class="dash-month-bar">
        <div class="dash-month-item">
          <div class="m-lbl">{{ $t("Shu oy sotuv") }}</div>
          <div class="m-val">{{ money(data.month.sales.total) }} <small class="m-cur">{{ $t("so'm") }}</small></div>
          <div class="m-sub">{{ data.month.sales.n }} {{ $t("ta sotuv") }}</div>
        </div>
        <div class="dash-month-divider"></div>
        <div class="dash-month-item">
          <div class="m-lbl">{{ $t("Shu oy kirim") }}</div>
          <div class="m-val pos">{{ money(sumPay(data.month.payments, 'in')) }} <small class="m-cur">{{ $t("so'm") }}</small></div>
          <div class="m-sub">Kassaga tushgan</div>
        </div>
        <div class="dash-month-divider"></div>
        <div class="dash-month-item">
          <div class="m-lbl">{{ $t("Shu oy chiqim") }}</div>
          <div class="m-val neg">{{ money(sumPay(data.month.payments, 'out')) }} <small class="m-cur">{{ $t("so'm") }}</small></div>
          <div class="m-sub">Xarajat & qaytarish</div>
        </div>
        <div class="dash-month-divider"></div>
        <div class="dash-month-item">
          <div class="m-lbl">{{ $t("Jami mijozlar") }}</div>
          <div class="m-val">{{ data.totals.clients }}</div>
          <div class="m-sub">Faol ro'yxatda</div>
        </div>
      </div>

      <!-- 6. 2-Ustunli Analitika (Top Qarzdorlar & Muddati O'tgan Qarzlar) -->
      <div class="dash-tables-grid">
        <!-- 6.1 Eng Katta Qarzdorlar -->
        <div class="dash-card-table">
          <div class="table-card-head">
            <div class="table-head-title">
              <span class="head-ico">🔴</span>
              <h3>{{ $t("Eng katta qarzdorlar") }}</h3>
            </div>
            <a href="#/debts?tab=debtors" class="table-head-link">{{ $t("Barchasi") }} →</a>
          </div>
          <div class="table-responsive" v-if="data.top_debtors && data.top_debtors.length">
            <table class="dash-table">
              <tbody>
                <tr v-for="c in data.top_debtors" :key="c.id" class="click-row" @click="go('/clients/' + c.id)">
                  <td class="cell-avatar">
                    <div class="table-avatar">{{ (c.contact_name || c.company_name || 'M').slice(0, 2).toUpperCase() }}</div>
                  </td>
                  <td class="cell-info">
                    <div class="client-row-name">{{ clientName(c) }}</div>
                    <div class="client-row-phone" v-if="c.phone">{{ c.phone }}</div>
                  </td>
                  <td class="cell-amount neg">
                    <span class="debt-tag">{{ money(-c.balance) }} {{ $t("so'm") }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="dash-empty-state" v-else>
            <div class="empty-icon">🎉</div>
            <div class="empty-title">{{ $t("Qarzdorlik mavjud emas") }}</div>
            <div class="empty-desc">{{ $t("Barcha mijozlar o'z vaqtida hisob-kitob qilgan") }}</div>
          </div>
        </div>

        <!-- 6.2 Muddati O'tgan Qarzlar -->
        <div class="dash-card-table">
          <div class="table-card-head">
            <div class="table-head-title">
              <span class="head-ico">⏳</span>
              <h3>{{ $t("Muddati o'tgan qarzlar") }}</h3>
            </div>
            <a href="#/debts" class="table-head-link">{{ $t("Barchasi") }} →</a>
          </div>
          <div class="table-responsive" v-if="data.overdue && data.overdue.length">
            <table class="dash-table">
              <tbody>
                <tr v-for="s in data.overdue" :key="s.id" class="click-row" @click="go('/sales/' + s.id)">
                  <td class="cell-avatar">
                    <div class="table-avatar invoice">#</div>
                  </td>
                  <td class="cell-info">
                    <div class="client-row-name">{{ s.number }} · {{ clientName(s) }}</div>
                    <div class="client-row-phone overdue-date">
                      <span>{{ $t("Muddat") }}: {{ d(s.due_date) }}</span>
                    </div>
                  </td>
                  <td class="cell-amount neg">
                    <span class="debt-tag overdue">{{ money(s.total - s.paid_amount) }} {{ $t("so'm") }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="dash-empty-state" v-else>
            <div class="empty-icon">✓</div>
            <div class="empty-title">{{ $t("Muddati o'tgan qarzlar yo'q") }}</div>
            <div class="empty-desc">{{ $t("Barcha to'lovlar belgilangan muddat ichida") }}</div>
          </div>
        </div>
      </div>

      <!-- 7. So'nggi Harakatlar (Audit Timeline) -->
      <div class="dash-activity-card" v-if="data.recent && data.recent.length">
        <div class="activity-card-head">
          <div class="table-head-title">
            <span class="head-ico">🕒</span>
            <h3>{{ $t("So'nggi harakatlar") }}</h3>
          </div>
          <a href="#/audit" class="table-head-link">{{ $t("Barcha tarix") }} →</a>
        </div>
        <div class="activity-timeline">
          <div v-for="a in data.recent" :key="a.id" class="activity-item">
            <div class="activity-dot"></div>
            <div class="activity-content">
              <div class="activity-top">
                <span class="activity-user">{{ $tx(a.user_name) }}</span>
                <span class="activity-time">{{ dt(a.at) }}</span>
              </div>
              <div class="activity-desc">
                <a v-if="a.client_id" :href="'#/clients/' + a.client_id" class="activity-link">{{ $tx(a.summary) }}</a>
                <span v-else>{{ $tx(a.summary) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- To'lov Modali (Tezkor Kirim) -->
      <payment-modal v-if="pay" direction="in" @close="pay=false" @saved="load"/>
    </template>
  </div>`,
};
