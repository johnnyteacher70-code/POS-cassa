import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import {
  api, get, post, del, money, dt, d, go, back, route, clientName, balanceInfo, saleStatus, debounce, toast,
  METHODS, METHOD_ICONS, ORDER_STATUS, nowLocal,
} from '../lib.js';
import { translated, t, i18n } from '/i18n/index.js';

// ---------- Mijozlarni Excel'dan import (boshqa dasturdan o'tish) ----------
const ClientImport = {
  emits: ['close', 'done'],
  setup(_p, { emit }) {
    const file = ref(null);
    const preview = ref(null);
    const busy = ref(false);
    const send = (commit) => { const fd = new FormData(); fd.append('file', file.value); return api('POST', '/api/import/clients' + (commit ? '?commit=1' : ''), fd); };
    const onFile = async (e) => {
      file.value = e.target.files[0] || null;
      preview.value = null;
      if (!file.value) return;
      busy.value = true;
      try { preview.value = await send(false); } finally { busy.value = false; }
    };
    const commit = async () => {
      busy.value = true;
      try {
        const r = await send(true);
        toast(`${t('Import tugadi')}: ${r.created} ${t('ta yangi')}, ${r.updated} ${t('ta yangilandi')}`, 'ok', { duration: 7000 });
        emit('done');
      } finally { busy.value = false; }
    };
    const ACT = translated({ create: ['Yangi', 'green'], update: ['Yangilanadi', 'blue'], error: ['Xato', 'red'] });
    return { preview, busy, onFile, commit, ACT, money, i18n };
  },
  template: `
  <modal :title="$t(&quot;Mijozlarni Excel'dan import qilish&quot;)" wide @close="$emit('close')">
    <div class="result-box mb small">
      1) <a :href="'/api/import/clients/template?lang=' + i18n.lang">{{ $t('Shablonni yuklab oling') }}</a> {{ $t("yoki eski dasturdan mijozlar ro'yxatini Excel'ga chiqaring (ism, telefon, qarz ustunlari o'zi taniladi).") }}<br>
      {{ $t("2) Faylni tanlang — avval natija ko'rsatiladi, keyin tasdiqlaysiz. Bazada bor mijoz (telefon yoki INN bo'yicha) takrorlanmaydi.") }}
    </div>
    <input type="file" accept=".xlsx" @change="onFile">
    <div v-if="busy" class="muted mt">⏳ {{ $t("O'qilmoqda") }}...</div>
    <template v-if="preview">
      <div class="row mt">
        <span class="badge green">{{ $t('Yangi') }}: {{preview.summary.create}}</span>
        <span class="badge blue">{{ $t('Yangilanadi') }}: {{preview.summary.update}}</span>
        <span class="badge red" v-if="preview.summary.error">{{ $t('Xato') }}: {{preview.summary.error}}</span>
        <span class="badge gray" v-if="preview.summary.debt">{{ $t("Boshlang'ich qarz") }}: {{money(preview.summary.debt)}}</span>
        <span class="badge gray" v-if="preview.summary.advance">{{ $t('Avans') }}: {{money(preview.summary.advance)}}</span>
      </div>
      <div class="table-wrap mt" style="max-height:50vh;overflow:auto">
        <table class="t">
          <thead><tr><th>{{ $t('Qator') }}</th><th>{{ $t('Holat') }}</th><th>{{ $t('Mijoz') }}</th><th>{{ $t('Telefon') }}</th><th class="num">{{ $t('Qarzi') }}</th><th class="num">{{ $t('Avans') }}</th><th>{{ $t('Izoh') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in preview.rows" :key="r.row">
              <td class="muted">{{r.row}}</td>
              <td><span class="badge" :class="ACT[r.action][1]">{{ACT[r.action][0]}}</span></td>
              <td>{{r.company_name || r.contact_name}}<div class="small muted" v-if="r.company_name && r.contact_name">{{r.contact_name}}</div></td>
              <td>{{r.phone}}</td>
              <td class="num neg">{{r.debt ? money(r.debt) : ''}}</td>
              <td class="num pos">{{r.advance ? money(r.advance) : ''}}</td>
              <td class="small"><span class="neg">{{r.errors.map(e => $t(e)).join('; ')}}</span> <span class="amber-t">{{r.notes.map(e => $t(e)).join('; ')}}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button>
      <button class="btn primary" :disabled="busy || !preview || !(preview.summary.create + preview.summary.update)" @click="commit">
        ✓ {{ $t('Import qilish') }} ({{preview ? preview.summary.create + preview.summary.update : 0}})
      </button>
    </template>
  </modal>`,
};

// O'chirish + "Qaytarish" tugmali toast
export async function removeWithUndo(url, label, after) {
  if (!confirm(`${label} — o'chirilsinmi?`)) return false;
  await del(url);
  toast(`${label} o'chirildi`, '', {
    actionLabel: 'Qaytarish',
    action: async () => { await post(url + '/restore'); toast('Tiklandi', 'ok'); after && after(); },
    duration: 8000,
  });
  after && after();
  return true;
}

export const ClientsPage = {
  components: { ClientImport },
  setup() {
    const importing = ref(false);
    const q = ref(route.query.q || '');
    const filter = ref(route.query.filter || 'all');
    const type = ref('');
    const registerId = ref(route.query.register || '');
    const data = ref({ rows: [], count: 0, totals: {} });
    const loading = ref(false);
    const showNew = ref(false);
    const payFor = ref(null);

    const load = async () => {
      loading.value = true;
      try {
        const p = new URLSearchParams({ q: q.value, filter: filter.value, type: type.value });
        if (registerId.value) p.set('register_id', registerId.value);
        data.value = await get('/api/clients?' + p, { latest: 'clients' });
      } finally { loading.value = false; }
    };
    const loadDeb = debounce(load, 250);
    watch(q, loadDeb);
    watch([filter, type, registerId], load);
    onActivated(load);

    return { q, filter, type, registerId, data, loading, load, showNew, payFor, importing, money, dt, d, clientName, balanceInfo, go };
  },
  template: `
  <div class="clients-page-wrap">
    <!-- 1. Header -->
    <div class="page-head">
      <div>
        <h1>{{ $t("Mijozlar") }}</h1>
        <div class="small muted">{{ $t("Ulgurji va chakana mijozlar bazasi, balans va hisob-kitoblar") }}</div>
      </div>
      <div class="head-actions">
        <button class="btn green" v-if="$can('clients.create')" @click="importing=true">📥 {{ $t("Excel import") }}</button>
        <button class="btn primary" v-if="$can('clients.create')" @click="showNew=true">＋ {{ $t("Yangi mijoz") }}</button>
      </div>
    </div>

    <!-- 2. KPI Summary Bar (Mijozlar balansi) -->
    <div class="clients-kpi-bar" v-if="data.totals">
      <div class="clients-kpi-item" style="cursor:pointer" @click="filter='debtors'">
        <span class="kpi-sub">{{ $t("Bizga qarzdorlar") }}</span>
        <b class="kpi-num neg">{{ money(data.totals.receivable) }} <small>{{ $t("so'm") }}</small></b>
        <span class="kpi-hint">{{ data.totals.debtors || 0 }} {{ $t("ta mijoz qarzda") }}</span>
      </div>
      <div class="clients-kpi-divider"></div>
      <div class="clients-kpi-item" style="cursor:pointer" @click="filter='advance'">
        <span class="kpi-sub">{{ $t("Biz qarzdormiz (avans)") }}</span>
        <b class="kpi-num pos">{{ money(data.totals.payable) }} <small>{{ $t("so'm") }}</small></b>
        <span class="kpi-hint">{{ data.totals.advance || 0 }} {{ $t("ta mijoz avansda") }}</span>
      </div>
      <div class="clients-kpi-divider"></div>
      <div class="clients-kpi-item" style="cursor:pointer" @click="filter='all'">
        <span class="kpi-sub">{{ $t("Jami mijozlar") }}</span>
        <b class="kpi-num">{{ data.count || data.rows.length }}</b>
        <span class="kpi-hint">Faol ro'yxatda</span>
      </div>
    </div>

    <!-- 3. Filtrlar va Qidiruv Paneli -->
    <div class="clients-filters-card">
      <div class="clients-filter-row">
        <div class="search-big" style="flex:1;min-width:240px">
          <input v-model="q" @keydown.enter="load" :placeholder="$t('Qidirish: kompaniya, ism, telefon, INN yoki qarz summasi...')" autofocus>
        </div>
        <select v-model="type" style="min-width:130px">
          <option value="">{{ $t("B2B + B2C") }}</option>
          <option value="b2b">{{ $t("B2B (Ulgurji)") }}</option>
          <option value="b2c">{{ $t("B2C (Chakana)") }}</option>
        </select>
        <register-select v-model="registerId" style="min-width:140px"/>
      </div>
      <div class="chips clients-chips">
        <button class="chip" :class="{active:filter==='all'}" @click="filter='all'">{{ $t("Barchasi") }}</button>
        <button class="chip" :class="{active:filter==='debtors'}" @click="filter='debtors'">
          <i class="dot red"></i>{{ $t("Qarzdorlar") }}
        </button>
        <button class="chip" :class="{active:filter==='advance'}" @click="filter='advance'">
          <i class="dot green"></i>{{ $t("Biz qarzdormiz (avans)") }}
        </button>
        <button class="chip" :class="{active:filter==='zero'}" @click="filter='zero'">{{ $t("Hisobi yopiq") }}</button>
      </div>
    </div>

    <!-- 4. Mijozlar Jadvali -->
    <div class="card p0 clients-table-card">
      <table class="t rt">
        <thead>
          <tr>
            <th>{{ $t("Mijoz") }}</th>
            <th>{{ $t("Telefon") }}</th>
            <th>{{ $t("INN") }}</th>
            <th>{{ $t("Ochiq qarzlar") }}</th>
            <th class="num">{{ $t("Balans") }}</th>
            <th>{{ $t("Oxirgi harakat") }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in data.rows" :key="c.id" class="click client-row" @click="go('/clients/'+c.id)">
            <td class="main-cell">
              <div class="client-name-cell">
                <div class="client-avatar-badge">{{ (c.contact_name || c.company_name || 'M').slice(0, 2).toUpperCase() }}</div>
                <div>
                  <div class="bold">
                    {{ clientName(c) }}
                    <span class="badge gray sm" v-if="c.type==='b2c'">{{ $t("B2C") }}</span>
                    <span class="badge purple sm" v-else>{{ $t("B2B") }}</span>
                    <span v-if="c.register_name" class="shop-badge" style="font-size:11px;margin-left:4px">🏪 {{c.register_name}}</span>
                  </div>
                  <div class="small muted" v-if="c.company_name && c.contact_name">{{c.contact_name}}</div>
                </div>
              </div>
            </td>
            <td :data-l="$t('Telefon')" class="nowrap">{{c.phone || '—'}}</td>
            <td :data-l="$t('INN')">{{c.inn || '—'}}</td>
            <td :data-l="$t('Ochiq qarzlar')">
              <span v-if="c.open_debts" class="neg bold">{{c.open_debts}} {{ $t("ta") }} · {{d(c.oldest_debt)}} {{ $t("dan") }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td :data-l="$t('Balans')" class="num">
              <b :class="balanceInfo(c.balance).cls">{{money(c.balance)}}</b>
              <div class="small muted">{{c.balance<0 ? $t("qarzdor") : c.balance>0 ? $t("avans") : ''}}</div>
            </td>
            <td :data-l="$t('Oxirgi harakat')" class="small muted nowrap">{{dt(c.last_activity)}}</td>
            <td data-l="" class="right" @click.stop>
              <button class="btn sm green" v-if="$can('payments.create')" @click="payFor=c.id">＋ {{ $t("Kirim") }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!data.rows.length && !loading">{{q ? $t("Hech narsa topilmadi") : $t("Mijozlar yo'q")}}</div>
    </div>
    <div class="small muted mt" v-if="data.count > data.rows.length">
      {{ $t("Ko'rsatildi") }} {{data.rows.length}} / {{data.count}}. {{ $t("Aniqroq qidiring") }}.
    </div>

    <client-modal v-if="showNew" @close="showNew=false" @saved="id => { showNew=false; go('/clients/'+id) }"/>
    <client-import v-if="importing" @close="importing=false" @done="importing=false; load()"/>
    <payment-modal v-if="payFor" :client-id="payFor" @close="payFor=null" @saved="load"/>
  </div>`,
};

const EVENT_LABEL = translated({
  sale: ['Sotuv', '🧾'], opening: ["Boshlang'ich qarz", '📌'], payment_in: ['Kirim', '⬇'], payment_out: ['Chiqim', '⬆'],
});

export const ClientView = {
  setup() {
    const clientId = route.parts[1];
    const id = computed(() => clientId);
    const data = ref(null);
    const tab = ref(route.query.tab || 'history');
    const edit = ref(false);
    const pay = ref(null);           // {direction, saleId, payment}
    const debtModal = ref(false);
    const debtForm = reactive({ total: '', date: nowLocal(), due_date: '', note: '' });

    const load = async () => { data.value = await get('/api/clients/' + id.value); };
    onActivated(load);

    const openDebts = computed(() => (data.value ? data.value.sales.filter((s) => s.status === 'confirmed' && s.total > s.paid_amount) : []));
    const closedDebts = computed(() => (data.value ? data.value.sales.filter((s) => s.status === 'confirmed' && s.was_debt && s.closed_at) : []));

    const removeClient = () => removeWithUndo('/api/clients/' + id.value, clientName(data.value.client), () => go('/clients'));
    const removePayment = (p) => removeWithUndo('/api/payments/' + p.id, `To'lov ${money(p.amount)}`, load);
    const removeSale = (s) => removeWithUndo('/api/sales/' + s.id, `Sotuv ${s.number}`, load);
    // ---- Katalog (sayt) paroli: login — mijoz telefoni ----
    const pw = reactive({ open: false, value: '', busy: false });
    const genPw = () => { pw.value = String(Math.floor(100000 + Math.random() * 900000)); };
    const openPw = () => {
      if (!data.value.client.phone) return toast('Avval mijozga telefon raqam kiriting', 'error');
      Object.assign(pw, { open: true, value: '' });
      genPw();
    };
    const savePw = async () => {
      if (String(pw.value).trim().length < 4) return toast('Parol kamida 4 belgi', 'error');
      pw.busy = true;
      try {
        await post(`/api/clients/${id.value}/shop-password`, { password: String(pw.value).trim() });
        toast(t('Parol saqlandi. Login: {0}', [data.value.client.phone]), 'ok', { duration: 9000 });
        pw.open = false;
        load();
      } finally { pw.busy = false; }
    };
    const removePw = async () => {
      if (!confirm("Mijozning katalog paroli o'chirilsinmi? U saytga kira olmay qoladi.")) return;
      await post(`/api/clients/${id.value}/shop-password`, { password: '' });
      toast("Parol o'chirildi", 'ok');
      pw.open = false;
      load();
    };

    const saveDebt = async () => {
      const r = await post('/api/sales', { kind: 'opening', client_id: +id.value, ...debtForm });
      toast(`Qarz yozildi: ${r.number}`, 'ok');
      debtModal.value = false;
      Object.assign(debtForm, { total: '', date: nowLocal(), due_date: '', note: '' });
      load();
    };

    const nowS = new Date().toLocaleString('sv-SE').slice(0, 19);
    return {
      nowS, pw, genPw, openPw, savePw, removePw, id, data, tab, edit, pay, load, openDebts, closedDebts, removeClient, removePayment, removeSale,
      debtModal, debtForm, saveDebt, money, dt, d, go, back, clientName, balanceInfo, saleStatus, METHODS, METHOD_ICONS, ORDER_STATUS, EVENT_LABEL,
    };
  },
  template: `
  <div v-if="data" class="client-view-wrap">
    <div class="page-head">
      <a class="back" href="#/clients">←</a>
      <h1>
        {{clientName(data.client)}}
        <span class="badge gray" v-if="data.client.type==='b2c'">{{ $t("B2C") }}</span>
        <span class="badge purple" v-else>{{ $t("B2B") }}</span>
        <span class="badge green" v-if="data.client.price_level">💼 {{ $t(data.client.price_level) }}</span>
        <span class="badge amber" v-if="data.client.bonus">🎁 {{money(data.client.bonus)}}</span>
      </h1>
      <button class="btn" v-if="$can('clients.edit')" @click="edit=true">✎ {{ $t("Tahrirlash") }}</button>
      <button class="btn red" v-if="$can('clients.delete')" @click="removeClient">{{ $t("O'chirish") }}</button>
    </div>

    <div class="grid c4 mb">
      <div class="card stat">
        <div class="l">{{ $t("Balans") }}</div>
        <div class="v" :class="balanceInfo(data.client.balance).cls">{{money(data.client.balance)}}</div>
        <div class="s">{{balanceInfo(data.client.balance).text}}</div>
      </div>
      <div class="card stat">
        <div class="l">{{ $t("Ochiq qarz") }}</div>
        <div class="v neg">{{money(data.stats.open_debt)}}</div>
        <div class="s">{{openDebts.length}} {{ $t("ta hujjat") }}</div>
      </div>
      <div class="card stat">
        <div class="l">{{ $t("Jami olgan") }}</div>
        <div class="v">{{money(data.stats.total_sales)}}</div>
        <div class="s">{{data.sales.filter(s=>s.status==='confirmed').length}} {{ $t("ta sotuv") }}</div>
      </div>
      <div class="card stat">
        <div class="l">{{ $t("Jami to'lagan") }}</div>
        <div class="v">{{money(data.stats.total_in - data.stats.total_out)}}</div>
        <div class="s" v-if="data.stats.total_out">{{ $t("qaytarilgan") }}: {{money(data.stats.total_out)}}</div>
      </div>
    </div>

    <div class="row mb">
      <a class="btn primary" v-if="$can('sales.create')" :href="'#/sales/new?client='+id">🧾 {{ $t("Yangi sotuv") }}</a>
      <button class="btn green" v-if="$can('payments.create')" @click="pay={direction:'in'}">⬇ {{ $t("Kirim (to'lov)") }}</button>
      <button class="btn" v-if="$can('payments.create')" @click="pay={direction:'out'}">⬆ {{ $t("Chiqim (qaytarish)") }}</button>
      <a class="btn" v-if="$can('quotes.edit')" :href="'#/quotes/new?client='+id">📄 {{ $t("KP") }}</a>
      <a class="btn" :href="'#/clients/' + id + '/akt'">📑 {{ $t("Akt sverki") }}</a>
      <button class="btn" v-if="$can('clients.edit')" @click="debtModal=true">📌 {{ $t("Qarz yozish") }}</button>
    </div>

    <div class="grid client-grid">
      <div class="card">
        <h3>{{ $t("Ma'lumotlar") }}</h3>
        <dl class="info-list">
          <template v-if="data.client.company_name"><dt>{{ $t("Kompaniya") }}</dt><dd>{{data.client.company_name}}</dd></template>
          <template v-if="data.client.contact_name"><dt>{{ $t("Mas'ul shaxs") }}</dt><dd>{{data.client.contact_name}}</dd></template>
          <template v-if="data.client.phone"><dt>{{ $t("Telefon") }}</dt><dd><a :href="'tel:'+data.client.phone">{{data.client.phone}}</a></dd></template>
          <template v-if="data.client.phone2"><dt>{{ $t("Telefon 2") }}</dt><dd><a :href="'tel:'+data.client.phone2">{{data.client.phone2}}</a></dd></template>
          <template v-if="data.client.inn"><dt>{{ $t("INN") }}</dt><dd>{{data.client.inn}}</dd></template>
          <template v-if="data.client.account_no"><dt>{{ $t("Hisob raqami") }}</dt><dd>{{data.client.account_no}}</dd></template>
          <template v-if="data.client.bank"><dt>{{ $t("Bank / MFO") }}</dt><dd>{{data.client.bank}} {{data.client.mfo}}</dd></template>
          <template v-if="data.client.address"><dt>{{ $t("Manzil") }}</dt><dd>{{data.client.address}}</dd></template>
          <template v-if="data.client.note"><dt>{{ $t("Izoh") }}</dt><dd>{{$t(data.client.note)}}</dd></template>
          <dt>{{ $t("Katalog (sayt)") }}</dt>
          <dd>
            <span :class="data.client.has_shop_password ? 'pos' : 'muted'">{{data.client.has_shop_password ? $t("parol berilgan") : $t("parol yo'q")}}</span>
            · <a href="" class="small" v-if="$can('clients.shop_password')" @click.prevent="openPw">{{data.client.has_shop_password ? $t("almashtirish") : $t("parol berish")}}</a>
            <div class="small muted" v-if="data.client.phone">{{ $t("Login") }}: {{data.client.phone}}</div>
          </dd>
          <dt>{{ $t("Qo'shilgan") }}</dt><dd>{{dt(data.client.created_at)}}</dd>
        </dl>
      </div>

      <div class="card p0">
        <div class="tabs" style="padding:0 8px;margin:0">
          <button :class="{active:tab==='history'}" @click="tab='history'">{{ $t("Tarix") }}</button>
          <button :class="{active:tab==='sales'}" @click="tab='sales'">{{ $t("Sotuvlar (") }}{{data.sales.length}})</button>
          <button :class="{active:tab==='payments'}" @click="tab='payments'">{{ $t("To'lovlar (") }}{{data.payments.length}})</button>
          <button :class="{active:tab==='debts'}" @click="tab='debts'">{{ $t("Qarzlar (") }}{{openDebts.length}})</button>
          <button :class="{active:tab==='orders'}" @click="tab='orders'">{{ $t("Buyurtmalar (") }}{{data.orders.length}})</button>
          <button :class="{active:tab==='quotes'}" @click="tab='quotes'">{{ $t("KP (") }}{{data.quotes.length}})</button>
          <button v-if="data.returns && data.returns.length" :class="{active:tab==='returns'}" @click="tab='returns'">↩ {{ $t("Qaytarishlar") }} ({{data.returns.length}})</button>
          <button :class="{active:tab==='audit'}" @click="tab='audit'">{{ $t("O'zgarishlar") }}</button>
        </div>

        <!-- Tranzaksiyalar tarixi -->
        <table class="t rt" v-if="tab==='history'">
          <thead><tr><th>{{ $t("Sana") }}</th><th>{{ $t("Harakat") }}</th><th>{{ $t("Hujjat / izoh") }}</th><th>{{ $t("Xodim") }}</th><th class="num">{{ $t("Summa") }}</th><th class="num">{{ $t("Balans") }}</th></tr></thead>
          <tbody>
            <tr v-for="e in data.timeline" :key="e.type+e.id" class="click" @click="e.type==='sale'||e.type==='opening' ? go('/sales/'+e.id) : null">
              <td :data-l="$t('Sana')" class="nowrap">{{dt(e.date)}}</td>
              <td :data-l="$t('Harakat')" class="nowrap">{{EVENT_LABEL[e.type][1]}} {{EVENT_LABEL[e.type][0]}}<span v-if="e.method" class="muted"> · {{METHODS[e.method]}}</span></td>
              <td :data-l="$t('Hujjat')">{{e.number || (e.sale_number ? '→ '+e.sale_number : '')}} <span class="muted small">{{$t(e.note)}}</span></td>
              <td :data-l="$t('Xodim')" class="small">{{e.user_name}}</td>
              <td :data-l="$t('Summa')" class="num timeline-amt" :class="e.amount>0 ? 'pos' : 'neg'">{{e.amount>0?'+':''}}{{money(e.amount)}}</td>
              <td :data-l="$t('Balans')" class="num" :class="balanceInfo(e.balance).cls">{{money(e.balance)}}</td>
            </tr>
          </tbody>
        </table>

        <table class="t rt" v-if="tab==='sales'">
          <thead><tr><th>№</th><th>{{ $t("Sana") }}</th><th>{{ $t("Sotuvchi") }}</th><th class="num">{{ $t("Summa") }}</th><th class="num">{{ $t("To'langan") }}</th><th class="num">{{ $t("Qoldiq") }}</th><th>{{ $t("Holat") }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in data.sales" :key="s.id" class="click" :class="{dim:s.status==='cancelled'}" @click="go('/sales/'+s.id)">
              <td class="main-cell bold">{{s.number}}</td>
              <td :data-l="$t('Sana')" class="nowrap">{{dt(s.date)}}</td>
              <td :data-l="$t('Sotuvchi')" class="small">{{s.seller_name}}</td>
              <td :data-l="$t('Summa')" class="num">{{money(s.total)}}</td>
              <td :data-l="$t(&quot;To'langan&quot;)" class="num">{{money(s.paid_amount)}}</td>
              <td :data-l="$t('Qoldiq')" class="num" :class="{neg: s.total>s.paid_amount && s.status==='confirmed'}">{{s.status==='confirmed' ? money(s.total-s.paid_amount) : '—'}}</td>
              <td :data-l="$t('Holat')"><badge :s="saleStatus(s)"/><div class="small muted" v-if="s.closed_at && s.was_debt">{{ $t("yopildi") }} {{d(s.closed_at)}}{{s.closer_name ? ' · '+s.closer_name : ''}}</div></td>
              <td data-l="" class="right nowrap" @click.stop>
                <button v-if="$can('payments.create') && s.status==='confirmed' && s.total>s.paid_amount" class="btn sm" @click="pay={direction:'in', saleId:s.id, amount:s.total-s.paid_amount}">{{ $t("To'lash") }}</button>
              </td>
            </tr>
          </tbody>
        </table>

        <table class="t rt" v-if="tab==='payments'">
          <thead><tr><th>{{ $t("Sana") }}</th><th>{{ $t("Turi") }}</th><th class="num">{{ $t("Summa") }}</th><th>{{ $t("Qayerga ketdi") }}</th><th>{{ $t("Qabul qildi") }}</th><th>{{ $t("Izoh") }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in data.payments" :key="p.id">
              <td :data-l="$t('Sana')" class="nowrap">{{dt(p.date)}}</td>
              <td :data-l="$t('Turi')" class="nowrap">{{p.direction==='in' ? $t("⬇ Kirim") : $t("⬆ Chiqim")}} · {{METHOD_ICONS[p.method]}} {{METHODS[p.method]}}</td>
              <td :data-l="$t('Summa')" class="num bold" :class="p.direction==='in' ? 'pos' : 'neg'">{{money(p.amount)}}</td>
              <td :data-l="$t('Qayerga')" class="small">
                <div v-for="a in p.allocations" :key="a.id"><a :href="'#/sales/'+a.sale_id">{{a.sale_number}}</a> — {{money(a.amount)}}</div>
                <div v-if="p.direction==='in' && p.amount > p.allocations.reduce((x,a)=>x+a.amount,0)" class="pos">{{ $t("avans") }}: {{money(p.amount - p.allocations.reduce((x,a)=>x+a.amount,0))}}</div>
                <div v-if="p.sale_number" class="muted">{{ $t("mijoz ko'rsatdi") }}: {{p.sale_number}}</div>
              </td>
              <td :data-l="$t('Qabul qildi')" class="small">{{p.user_name}}</td>
              <td :data-l="$t('Izoh')" class="small muted">{{$t(p.note)}}</td>
              <td data-l="" class="right nowrap">
                <button class="btn sm ghost" v-if="$can('payments.edit')" @click="pay={payment:p}">✎</button>
                <button class="btn sm ghost" v-if="$can('payments.delete')" @click="removePayment(p)">🗑</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="tab==='debts'" style="padding:12px">
          <h3>{{ $t("Ochiq qarzlar") }}</h3>
          <table class="t rt">
            <thead><tr><th>{{ $t("Hujjat") }}</th><th>{{ $t("Qarz olingan sana") }}</th><th>{{ $t("Muddat") }}</th><th class="num">{{ $t("Summa") }}</th><th class="num">{{ $t("Qoldiq") }}</th></tr></thead>
            <tbody>
              <tr v-for="s in openDebts" :key="s.id" class="click" @click="go('/sales/'+s.id)">
                <td class="main-cell bold">{{s.number}}</td>
                <td :data-l="$t('Olingan')">{{dt(s.date)}}</td>
                <td :data-l="$t('Muddat')"><span v-if="s.due_date" :class="{neg: s.due_date < nowS}">{{d(s.due_date)}}</span><span v-else class="muted">—</span></td>
                <td :data-l="$t('Summa')" class="num">{{money(s.total)}}</td>
                <td :data-l="$t('Qoldiq')" class="num neg bold">{{money(s.total-s.paid_amount)}}</td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-if="!openDebts.length">{{ $t("Ochiq qarz yo'q") }}</div>
          <h3 class="mt">{{ $t("Yopilgan qarzlar") }}</h3>
          <table class="t rt">
            <thead><tr><th>{{ $t("Hujjat") }}</th><th>{{ $t("Qarz olingan") }}</th><th>{{ $t("Yopilgan") }}</th><th>{{ $t("Yopgan xodim") }}</th><th class="num">{{ $t("Summa") }}</th></tr></thead>
            <tbody>
              <tr v-for="s in closedDebts" :key="s.id" class="click" @click="go('/sales/'+s.id)">
                <td class="main-cell bold">{{s.number}}</td>
                <td :data-l="$t('Olingan')">{{dt(s.date)}}</td>
                <td :data-l="$t('Yopilgan')" class="pos">{{dt(s.closed_at)}}</td>
                <td :data-l="$t('Yopgan xodim')" class="small">{{s.closer_name}}</td>
                <td :data-l="$t('Summa')" class="num">{{money(s.total)}}</td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-if="!closedDebts.length">{{ $t("Yopilgan qarzlar yo'q") }}</div>
        </div>

        <table class="t rt" v-if="tab==='orders'">
          <thead><tr><th>#</th><th>{{ $t("Sana") }}</th><th class="num">{{ $t("Summa") }}</th><th>{{ $t("Holat") }}</th></tr></thead>
          <tbody>
            <tr v-for="o in data.orders" :key="o.id" class="click" @click="go('/orders/'+o.id)">
              <td class="main-cell bold">#{{o.id}}</td><td :data-l="$t('Sana')">{{dt(o.created_at)}}</td>
              <td :data-l="$t('Summa')" class="num">{{money(o.total)}}</td><td :data-l="$t('Holat')"><badge :s="ORDER_STATUS[o.status]"/></td>
            </tr>
          </tbody>
        </table>

        <table class="t rt" v-if="tab==='quotes'">
          <thead><tr><th>№</th><th>{{ $t("Sana") }}</th><th class="num">{{ $t("Summa") }}</th></tr></thead>
          <tbody>
            <tr v-for="q in data.quotes" :key="q.id" class="click" @click="go('/quotes/'+q.id)">
              <td class="main-cell bold">{{q.number}}</td><td :data-l="$t('Sana')">{{d(q.date)}}</td><td :data-l="$t('Summa')" class="num">{{money(q.total)}}</td>
            </tr>
          </tbody>
        </table>

        <table class="t rt" v-if="tab==='audit'">
          <thead><tr><th>{{ $t("Vaqt") }}</th><th>{{ $t("Kim") }}</th><th>{{ $t("Nima bo'ldi") }}</th></tr></thead>
          <tbody>
            <tr v-for="a in data.audit" :key="a.id">
              <td :data-l="$t('Vaqt')" class="nowrap small">{{dt(a.at)}}</td><td :data-l="$t('Kim')" class="small">{{$tx(a.user_name)}}</td><td data-l="">{{$tx(a.summary)}}</td>
            </tr>
          </tbody>
        </table>

        <div class="small muted" style="padding:10px 14px" v-if="data.truncated">{{ $t("Oxirgi 500 ta yozuv ko'rsatilgan (ochiq qarzlar — hammasi). Eskilarini Sotuvlar va To'lovlar bo'limida mijoz bo'yicha filtrlang.") }}</div>
        <table class="t rt" v-if="tab==='returns'">
          <tbody><tr v-for="r in data.returns" :key="r.id" class="click" @click="go('/sales/'+r.sale_id)">
            <td class="main-cell"><b>{{r.number}}</b> · <a :href="'#/sales/'+r.sale_id">{{r.sale_number}}</a><div class="small muted">{{dt(r.date)}}<span v-if="r.note"> · {{r.note}}</span></div></td>
            <td :data-l="$t('Summa')" class="num neg bold">−{{money(r.total)}}</td>
            <td :data-l="$t('Pul qaytarildi')" class="num small">{{ r.refund ? money(r.refund) : '—' }}</td>
          </tr></tbody>
        </table>
        <div class="empty" v-if="(tab==='history' && !data.timeline.length) || (tab==='sales' && !data.sales.length) || (tab==='payments' && !data.payments.length) || (tab==='orders' && !data.orders.length) || (tab==='quotes' && !data.quotes.length)">{{ $t("Hozircha bo'sh") }}</div>
      </div>
    </div>

    <client-modal v-if="edit" :client="data.client" @close="edit=false" @saved="edit=false; load()"/>
    <payment-modal v-if="pay" :client-id="+id" :direction="pay.direction" :sale-id="pay.saleId" :amount="pay.amount" :payment="pay.payment" @close="pay=null" @saved="load"/>
    <modal v-if="pw.open" :title="$t('Katalog (sayt) paroli')" @close="pw.open=false">
      <p class="muted" style="margin-top:0">{{ $t('Mijoz saytga telefon raqami va shu parol bilan kiradi.') }} {{ $t('Login') }}: <b>{{data.client.phone}}</b></p>
      <form id="pw-form" @submit.prevent="savePw">
        <label class="f"><span>{{ $t('Yangi parol') }}</span>
          <div class="row" style="flex-wrap:nowrap">
            <input v-model="pw.value" autocomplete="off" style="font-size:18px;letter-spacing:2px">
            <button type="button" class="btn" @click="genPw">↻ {{ $t('Yaratish') }}</button>
          </div>
        </label>
      </form>
      <template #footer>
        <button v-if="data.client.has_shop_password" type="button" class="btn red" style="margin-right:auto" @click="removePw">{{ $t("Parolni o'chirish") }}</button>
        <button class="btn" @click="pw.open=false">{{ $t('Bekor') }}</button>
        <button class="btn primary" form="pw-form" :disabled="pw.busy">{{ $t('Saqlash') }}</button>
      </template>
    </modal>
    <modal v-if="debtModal" :title="$t('Qarz yozish (tovarsiz / eski qarz)')" @close="debtModal=false">
      <form id="debt-form" class="form-grid" @submit.prevent="saveDebt">
        <label class="f"><span>{{ $t('Summa') }} *</span><money-input v-model="debtForm.total" autofocus/></label>
        <label class="f"><span>{{ $t('Sana') }}</span><input type="datetime-local" v-model="debtForm.date"></label>
        <label class="f"><span>{{ $t("To'lov muddati") }}</span><input type="date" v-model="debtForm.due_date"></label>
        <label class="f full"><span>{{ $t('Izoh') }}</span><input v-model="debtForm.note" :placeholder="$t(&quot;Masalan: eski daftar bo'yicha qarz&quot;)"></label>
      </form>
      <template #footer><button class="btn" @click="debtModal=false">{{ $t('Bekor') }}</button><button class="btn primary" form="debt-form" :disabled="!debtForm.total">{{ $t('Saqlash') }}</button></template>
    </modal>
  </div>`,
};
