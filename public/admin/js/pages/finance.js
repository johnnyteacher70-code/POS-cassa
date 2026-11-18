// Xarajatlar va kassa smenalari (Z-hisobot)
import { ref, reactive, computed, watch, onActivated } from 'vue';
import { get, post, del, money, dt, go, back, route, toast, qs, today, nowLocal, t, METHODS, METHOD_ICONS, session } from '../lib.js';
import { loadSettings, settings } from '../docs.js';

const monthStart = () => today().slice(0, 8) + '01';

// ---------- Xarajat qo'shish ----------
export const ExpenseModal = {
  props: { registerId: [String, Number] },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const cats = ref([]);
    const f = reactive({ category_id: '', amount: '', method: 'cash', date: nowLocal(), note: '', register_id: props.registerId || '' });
    get('/api/expense-categories').then((c) => { cats.value = c; });
    const save = async () => { await post('/api/expenses', f); toast('Xarajat saqlandi', 'ok'); emit('saved'); };
    return { cats, f, save, METHODS, METHOD_ICONS };
  },
  template: `
  <modal :title="$t('Yangi xarajat')" @close="$emit('close')">
    <form id="exp-form" class="form-grid" @submit.prevent="save">
      <label class="f full"><span>{{ $t("Kategoriya") }} *</span>
        <div class="chips"><button type="button" v-for="c in cats" :key="c.id" class="chip" :class="{active: f.category_id===c.id}" @click="f.category_id=c.id">{{ $t(c.name) }}</button></div></label>
      <label class="f"><span>{{ $t("Summa") }} *</span><money-input v-model="f.amount" autofocus/></label>
      <label class="f"><span>{{ $t("Sana") }}</span><input type="datetime-local" v-model="f.date"></label>
      <div class="f full chips"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active: f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
      <label class="f"><span>{{ $t("Kassa") }}</span><register-select v-model="f.register_id" placeholder="—" style="width:100%"/></label>
      <label class="f"><span>{{ $t("Izoh") }}</span><input v-model="f.note"></label>
    </form>
    <template #footer><button class="btn" @click="$emit('close')">{{ $t("Bekor") }}</button><button class="btn primary" form="exp-form" :disabled="!f.amount || !f.category_id">{{ $t("Saqlash") }}</button></template>
  </modal>`,
};

export const ExpensesPage = {
  components: { ExpenseModal },
  setup() {
    const f = reactive({ from: monthStart(), to: today(), category_id: '' });
    const data = ref({ rows: [], byCat: [], total: 0 });
    const modal = ref(false);
    const cats = ref([]);
    const newCat = ref('');
    const load = async () => {
      [data.value, cats.value] = await Promise.all([get('/api/expenses' + qs(f)), get('/api/expense-categories')]);
    };
    watch(() => [f.from, f.to, f.category_id], load);
    onActivated(load);
    const remove = async (e) => { if (!confirm(t("Xarajat o'chirilsinmi?"))) return; await del('/api/expenses/' + e.id); load(); };
    const addCat = async () => { if (!newCat.value.trim()) return; await post('/api/expense-categories', { name: newCat.value.trim() }); newCat.value = ''; load(); };
    const removeCat = async (c) => { if (!confirm(t(`"${c.name}" kategoriyasi o'chirilsinmi?`))) return; await del('/api/expense-categories/' + c.id); load(); };
    const max = computed(() => Math.max(1, ...data.value.byCat.map((c) => c.total)));
    return { f, data, modal, cats, newCat, load, remove, addCat, removeCat, max, money, dt, METHODS, METHOD_ICONS, today, monthStart };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Xarajatlar") }}</h1>
        <div class="small muted">{{ $t("Filialning barcha operatsion, ma'muriy va xo'jalik xarajatlari") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px">
        <a class="btn" :href="'/api/reports/export?type=expenses&from=' + f.from + '&to=' + f.to">📥 {{ $t("Excel") }}</a>
        <button class="btn primary" v-if="$can('expenses.create')" @click="modal=true">＋ {{ $t("Xarajat qo'shish") }}</button>
      </div>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="f.from = today(); f.to = today()">{{ $t("Bugun") }}</button>
      <button class="chip" @click="f.from = monthStart(); f.to = today()">{{ $t("Shu oy") }}</button>
      <button class="chip" @click="f.from = ''; f.to = ''">{{ $t("Hammasi") }}</button>
      <select v-model="f.category_id" style="width:auto"><option value="">{{ $t("Barcha kategoriyalar") }}</option><option v-for="c in cats" :key="c.id" :value="c.id">{{ $t(c.name) }}</option></select>
    </div>
    <div class="grid c2 mb">
      <div class="card">
        <div class="stat"><div class="l">📉 {{ $t("Jami xarajat") }}</div><div class="v neg">{{money(data.total)}}</div></div>
        <div v-for="c in data.byCat" :key="c.category" class="bar-row">
          <span class="bl">{{ $t(c.category || '—') }}</span>
          <span class="bt"><span class="bf" :style="{width: (c.total / max * 100) + '%'}"></span></span>
          <b class="bv">{{money(c.total)}}</b>
        </div>
      </div>
      <div class="card" v-if="$can('expenses.delete')">
        <h3 style="margin-top:0">🏷 {{ $t("Kategoriyalar") }}</h3>
        <div class="chips"><span v-for="c in cats" :key="c.id" class="chip">{{ $t(c.name) }} <a href="" @click.prevent="removeCat(c)" style="margin-left:4px">✕</a></span></div>
        <form class="row mt" @submit.prevent="addCat" style="flex-wrap:nowrap"><input v-model="newCat" :placeholder="$t('Yangi kategoriya nomi...')" style="flex:1;min-width:0"><button class="btn primary">＋</button></form>
      </div>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Sana") }}</th><th>{{ $t("Kategoriya") }}</th><th>{{ $t("Izoh") }}</th><th class="num">{{ $t("Summa") }}</th><th></th></tr></thead>
        <tbody><tr v-for="e in data.rows" :key="e.id">
          <td :data-l="$t('Sana')" class="small nowrap">{{dt(e.date)}}</td>
          <td class="main-cell"><b>{{ $t(e.category || '—') }}</b><div class="small muted">{{METHOD_ICONS[e.method]}} {{METHODS[e.method]}}<span v-if="e.register_name"> · {{ $t(e.register_name) }}</span><span v-if="e.user_name"> · {{e.user_name}}</span></div></td>
          <td :data-l="$t('Izoh')" class="small">{{e.note}}</td>
          <td :data-l="$t('Summa')" class="num bold neg">{{money(e.amount)}}</td>
          <td data-l="" class="right"><button class="btn sm ghost" v-if="$can('expenses.delete')" @click="remove(e)">🗑</button></td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!data.rows.length">{{ $t("Xarajat yo'q") }}</div>
    </div>
    <expense-modal v-if="modal" @close="modal=false" @saved="modal=false; load()"/>
  </div>`,
};

// ---------- Z-hisobot (smena hisoboti) ----------
export const ShiftReport = {
  props: { shift: Object },
  setup() { return { money, dt, METHODS, METHOD_ICONS, settings }; },
  computed: {
    r() { return this.shift.report; },
    diff() { return this.shift.closing_cash !== null && this.shift.closing_cash !== undefined ? this.shift.closing_cash - this.shift.expected_cash : null; },
  },
  template: `
  <div class="z-report">
    <div class="center bold">{{settings.data.company_name}}</div>
    <div class="center">{{ shift.closed_at ? $t('Z-hisobot (smena yopildi)') : $t('X-hisobot (joriy smena)') }}</div>
    <div class="rc-hr"></div>
    <div class="tr"><span>{{ $t('Kassa') }}</span><b>{{ $t(shift.register_name || '—') }}</b></div>
    <div class="tr"><span>{{ $t('Kassir') }}</span><span>{{shift.user_name}}</span></div>
    <div class="tr"><span>{{ $t('Ochildi') }}</span><span>{{dt(shift.opened_at)}}</span></div>
    <div class="tr" v-if="shift.closed_at"><span>{{ $t('Yopildi') }}</span><span>{{dt(shift.closed_at)}}</span></div>
    <div class="rc-hr"></div>
    <div class="tr"><span>{{ $t('Sotuvlar') }}</span><b>{{r.sales.n}} · {{money(r.sales.total)}}</b></div>
    <div class="tr" v-if="r.sales.debt"><span>{{ $t('shundan qarzga') }}</span><span>{{money(r.sales.debt)}}</span></div>
    <div class="tr" v-if="r.returns.n"><span>{{ $t('Qaytarishlar') }}</span><span>{{r.returns.n}} · −{{money(r.returns.total)}}</span></div>
    <div class="rc-hr"></div>
    <table class="z-tbl"><thead><tr><th></th><th>{{ $t('Kirim') }}</th><th>{{ $t('Chiqim') }}</th></tr></thead>
      <tbody><tr v-for="(v,k) in r.byMethod" :key="k" v-show="v.in || v.out || v.expense || v.supplier">
        <td>{{METHOD_ICONS[k]}} {{METHODS[k]}}</td><td class="n">{{money(v.in)}}</td><td class="n">{{money(v.out + v.expense + v.supplier)}}</td></tr></tbody></table>
    <div class="small muted" v-if="r.byMethod.cash.expense || r.byMethod.cash.supplier">{{ $t('Naqd chiqim ichida') }}: {{ $t('xarajatlar') }} {{money(r.byMethod.cash.expense)}}<span v-if="r.byMethod.cash.supplier">, {{ $t('yetkazib beruvchilar') }} {{money(r.byMethod.cash.supplier)}}</span></div>
    <div class="rc-hr"></div>
    <div class="tr"><span>{{ $t("Boshlang'ich naqd") }}</span><span>{{money(shift.opening_cash)}}</span></div>
    <div class="tr big"><span>{{ $t("Kassada bo'lishi kerak") }}</span><b>{{money(shift.closed_at ? shift.expected_cash : r.expected)}}</b></div>
    <template v-if="diff !== null">
      <div class="tr"><span>{{ $t('Sanalgan') }}</span><b>{{money(shift.closing_cash)}}</b></div>
      <div class="tr big" :class="diff < 0 ? 'neg' : diff > 0 ? 'pos' : ''"><span>{{ diff < 0 ? $t('Kamomad') : diff > 0 ? $t('Ortiqcha') : $t('Farq') }}</span><b>{{money(Math.abs(diff))}}</b></div>
    </template>
  </div>`,
};

// ---------- Smena paneli (kassada): ochish / yopish ----------
export const ShiftBar = {
  components: { ShiftReport },
  props: { registerId: [String, Number] },
  setup(props) {
    const cur = ref(null);
    const required = ref(false);
    const openM = ref(false);
    const closeM = ref(false);
    const z = ref(null);
    const f = reactive({ opening_cash: '', closing_cash: '', note: '' });
    const load = async () => {
      if (!session.user) return;
      const r = await get('/api/shifts/current' + qs({ register_id: props.registerId || '' }), { silent: true }).catch(() => null);
      cur.value = r ? r.shift : null; required.value = r ? r.required : false;
    };
    watch(() => props.registerId, load, { immediate: true });
    const open = async () => {
      await post('/api/shifts/open', { register_id: props.registerId || null, opening_cash: f.opening_cash || 0 });
      toast('Smena ochildi', 'ok'); openM.value = false; f.opening_cash = ''; load();
    };
    const startClose = async () => { await load(); closeM.value = true; };
    const close = async () => {
      z.value = await post(`/api/shifts/${cur.value.id}/close`, { closing_cash: f.closing_cash, note: f.note });
      closeM.value = false; f.closing_cash = ''; f.note = ''; load();
    };
    const printZ = async () => {
      await loadSettings();
      document.body.classList.add('print-z');
      const style = document.createElement('style');
      style.textContent = `@media print { @page { size: ${settings.data.receipt_width === '58' ? 58 : 80}mm auto; margin: 0; } }`;
      document.head.appendChild(style);
      window.addEventListener('afterprint', () => { document.body.classList.remove('print-z'); style.remove(); }, { once: true });
      window.print();
    };
    return { cur, required, openM, closeM, z, f, open, startClose, close, printZ, load, money, dt };
  },
  template: `
  <div class="shift-bar" v-if="$can('shifts.use')">
    <template v-if="cur">
      <span class="dot green"></span><span class="small">{{ $t('Smena ochiq') }} · {{dt(cur.opened_at)}} · {{cur.user_name}}</span>
      <button class="btn sm" @click="startClose">{{ $t('Smenani yopish') }}</button>
    </template>
    <template v-else>
      <span class="dot" :class="required ? 'red' : 'amber'"></span><span class="small">{{ required ? $t('Sotish uchun smenani oching') : $t('Smena ochilmagan') }}</span>
      <button class="btn sm primary" @click="openM=true">{{ $t('Smenani ochish') }}</button>
    </template>
    <modal v-if="openM" :title="$t('Smenani ochish')" @close="openM=false">
      <form id="sh-open" class="form-grid" @submit.prevent="open">
        <label class="f full"><span>{{ $t("Kassadagi boshlang'ich naqd pul") }}</span><money-input v-model="f.opening_cash" autofocus/></label>
      </form>
      <template #footer><button class="btn" @click="openM=false">{{ $t('Bekor') }}</button><button class="btn primary" form="sh-open">{{ $t('Ochish') }}</button></template>
    </modal>
    <modal v-if="closeM && cur" :title="$t('Smenani yopish')" @close="closeM=false">
      <shift-report :shift="cur"/>
      <form id="sh-close" class="form-grid mt" @submit.prevent="close">
        <label class="f full"><span>{{ $t('Kassadagi naqd pulni sanang va kiriting') }} *</span><money-input v-model="f.closing_cash" autofocus/></label>
        <div class="full" v-if="f.closing_cash !== ''">
          <b :class="+f.closing_cash - cur.report.expected < 0 ? 'neg' : +f.closing_cash - cur.report.expected > 0 ? 'pos' : 'pos'">
            {{ +f.closing_cash === cur.report.expected ? '✓ ' + $t("Farq yo'q") : (+f.closing_cash < cur.report.expected ? $t('Kamomad') : $t('Ortiqcha')) + ': ' + money(Math.abs(+f.closing_cash - cur.report.expected)) }}</b></div>
        <label class="f full"><span>{{ $t('Izoh') }}</span><input v-model="f.note"></label>
      </form>
      <template #footer><button class="btn" @click="closeM=false">{{ $t('Bekor') }}</button><button class="btn primary" form="sh-close" :disabled="f.closing_cash === ''">{{ $t('Yopish va Z-hisobot') }}</button></template>
    </modal>
    <modal v-if="z" :title="$t('Z-hisobot')" @close="z=null">
      <div class="print-z-area"><shift-report :shift="z"/></div>
      <template #footer><button class="btn" @click="z=null">{{ $t('Yopish') }}</button><button class="btn primary" @click="printZ">🖨 {{ $t('Chop etish') }}</button></template>
    </modal>
  </div>`,
};

export const ShiftsPage = {
  setup() {
    const f = reactive({ from: monthStart(), to: today() });
    const rows = ref([]);
    const load = async () => { rows.value = await get('/api/shifts' + qs(f)); };
    watch(() => [f.from, f.to], load);
    onActivated(load);
    const diff = (s) => (s.closed_at ? s.closing_cash - s.expected_cash : null);
    const openCount = computed(() => rows.value.filter((s) => !s.closed_at).length);
    const totalDiff = computed(() => rows.value.reduce((sum, s) => sum + (s.closed_at ? (s.closing_cash - s.expected_cash) : 0), 0));
    return { f, rows, diff, openCount, totalDiff, money, dt, go, today, monthStart };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Kassa smenalari") }}</h1>
        <div class="small muted">{{ $t("Kassirlar ish vaqti, kassa topshirish va Z-hisobotlar tarixi") }}</div>
      </div>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="f.from = today(); f.to = today()">{{ $t("Bugun") }}</button>
      <button class="chip" @click="f.from = monthStart(); f.to = today()">{{ $t("Shu oy") }}</button>
      <button class="chip" @click="f.from = ''; f.to = ''">{{ $t("Hammasi") }}</button>
    </div>

    <div class="grid c3 mb">
      <div class="card stat">
        <div class="l">⏱ {{ $t("Jami smenalar") }}</div>
        <div class="v">{{rows.length}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">🟢 {{ $t("Hozir ochiq smenalar") }}</div>
        <div class="v" :class="openCount > 0 ? 'pos' : ''">{{openCount}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">⚖️ {{ $t("Jami kassa farqi") }}</div>
        <div class="v" :class="totalDiff < 0 ? 'neg' : totalDiff > 0 ? 'pos' : ''">
          {{totalDiff === 0 ? '✓ ' + $t("Farq yo'q") : (totalDiff > 0 ? '+' : '') + money(totalDiff)}}
        </div>
      </div>
    </div>

    <div class="card p0">
      <table class="t rt">
        <thead>
          <tr>
            <th>{{ $t("Smena") }}</th>
            <th>{{ $t("Kassa") }}</th>
            <th class="num">{{ $t("Kutilgan") }}</th>
            <th class="num">{{ $t("Sanalgan") }}</th>
            <th class="num">{{ $t("Kassa farqi") }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in rows" :key="s.id" class="click" @click="go('/shifts/'+s.id)">
            <td class="main-cell">
              <div style="display:flex;align-items:center;gap:6px">
                <b>{{dt(s.opened_at)}}</b>
                <span class="badge green" v-if="!s.closed_at">● {{ $t("ochiq") }}</span>
                <span class="badge gray" v-else>✓ {{ $t("yopilgan") }}</span>
              </div>
              <div class="small muted">👤 {{s.user_name}}<span v-if="s.closed_at"> · 🕒 {{ $t("yopildi") }}: {{dt(s.closed_at)}}</span></div>
            </td>
            <td :data-l="$t('Kassa')">📠 {{ $t(s.register_name || '—') }}</td>
            <td :data-l="$t('Kutilgan')" class="num">{{s.closed_at ? money(s.expected_cash) : '—'}}</td>
            <td :data-l="$t('Sanalgan')" class="num">{{s.closed_at ? money(s.closing_cash) : '—'}}</td>
            <td :data-l="$t('Kassa farqi')" class="num bold">
              <template v-if="!s.closed_at"><span class="badge blue">{{ $t("Jarayonda") }}</span></template>
              <template v-else-if="diff(s) === 0"><span class="badge green">✓ {{ $t("To'g'ri") }}</span></template>
              <template v-else-if="diff(s) < 0"><span class="badge red">−{{money(Math.abs(diff(s)))}} ({{ $t("Kamomad") }})</span></template>
              <template v-else><span class="badge blue">+{{money(diff(s))}} ({{ $t("Ortiqcha") }})</span></template>
            </td>
            <td class="right" data-l=""><span class="small muted">Z-hisobot →</span></td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Smena yo'q") }}</div>
    </div>
  </div>`,
};

export const ShiftView = {
  components: { ShiftReport },
  setup() {
    const s = ref(null);
    onActivated(async () => { await loadSettings(); s.value = await get('/api/shifts/' + route.parts[1]); });
    return { s, back, dt };
  },
  template: `
  <div v-if="s" class="shift-view-wrap">
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px">
        <a class="back" href="" @click.prevent="back('/shifts')" style="font-size:20px;text-decoration:none">←</a>
        <div>
          <h1 style="margin:0">{{ s.closed_at ? $t("Z-Hisobot (Yopilgan smena)") : $t("X-Hisobot (Joriy smena)") }}</h1>
          <div class="small muted">{{dt(s.opened_at)}} · {{ $t(s.register_name || 'Kassa') }} · {{s.user_name}}</div>
        </div>
      </div>
      <button class="btn primary" onclick="window.print()">🖨 {{ $t("Chop etish") }}</button>
    </div>
    <div style="display:flex;justify-content:center;margin-top:20px">
      <div class="card print-area" style="width:100%;max-width:440px;box-shadow:0 4px 16px rgba(0,0,0,0.06);border-radius:12px;padding:20px">
        <shift-report :shift="s"/>
      </div>
    </div>
  </div>`,
};
