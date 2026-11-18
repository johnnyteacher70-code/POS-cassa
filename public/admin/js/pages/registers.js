// Kassalar: har bir kassa bo'yicha hisobot va boshqarish
import { ref, reactive, watch, onActivated, computed } from 'vue';
import { get, post, put, money, session, toast, qs, today, can, METHODS, METHOD_ICONS } from '../lib.js';
import { loadRegisters } from '../components.js';

const monthStart = () => today().slice(0, 8) + '01';

export const RegistersPage = {
  setup() {
    const f = reactive({ from: today(), to: today() });
    const rows = ref([]);
    const modal = ref(null);
    const isAdmin = computed(() => can('registers.manage'));
    const load = async () => { rows.value = await get('/api/registers/report' + qs(f)); };
    watch(() => [f.from, f.to], load);
    onActivated(load);
    const preset = (k) => {
      if (k === 'today') { f.from = today(); f.to = today(); }
      if (k === 'month') { f.from = monthStart(); f.to = today(); }
      if (k === 'all') { f.from = ''; f.to = ''; }
    };
    const totals = computed(() => rows.value.reduce((a, r) => ({
      in: a.in + r.in_total, out: a.out + r.out_total, cash: a.cash + r.cash_net, sales: a.sales + r.sales_total,
    }), { in: 0, out: 0, cash: 0, sales: 0 }));
    const save = async () => {
      const m = modal.value;
      if (m.id) await put('/api/registers/' + m.id, m); else await post('/api/registers', m);
      toast('Saqlandi', 'ok');
      modal.value = null;
      await loadRegisters(true);
      load();
    };
    const link = (path, r) => `#/${path}?register=${r.id}${f.from ? '&from=' + f.from : ''}${f.to ? '&to=' + f.to : ''}`;
    return { f, rows, modal, isAdmin, preset, totals, save, link, money, METHODS, METHOD_ICONS, session };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Kassalar") }}</h1>
        <div class="small muted">{{ $t("Filial kassalari, naqd pul va to'lov turlari balansi") }}</div>
      </div>
      <button v-if="isAdmin" class="btn primary" @click="modal={name:'', note:'', active:1}">＋ {{ $t("Kassa qo'shish") }}</button>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="preset('today')">{{ $t("Bugun") }}</button>
      <button class="chip" @click="preset('month')">{{ $t("Shu oy") }}</button>
      <button class="chip" @click="preset('all')">{{ $t("Hammasi") }}</button>
    </div>

    <div class="grid c4 mb">
      <div class="card stat">
        <div class="l">⬇ {{ $t("Jami kirim") }}</div>
        <div class="v pos">{{money(totals.in)}}</div>
      </div>
      <div class="card stat">
        <div class="l">⬆ {{ $t("Jami chiqim") }}</div>
        <div class="v neg">{{money(totals.out)}}</div>
      </div>
      <div class="card stat">
        <div class="l">💰 {{ $t("Naqd pul qoldig'i") }}</div>
        <div class="v">{{money(totals.cash)}}</div>
      </div>
      <div class="card stat">
        <div class="l">🧾 {{ $t("Sotuvlar aylanmasi") }}</div>
        <div class="v">{{money(totals.sales)}}</div>
      </div>
    </div>

    <div class="grid c3 reg-grid">
      <div v-for="r in rows" :key="r.id || 'none'" class="card reg-card" :class="{dim: !r.active}">
        <div class="reg-card-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="reg-title-wrap" style="display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">📠</span>
            <div>
              <h2 style="margin:0;font-size:18px;font-weight:700">{{ r.name ? $t(r.name) : $t("Kassasiz") }}</h2>
              <div class="small muted">{{ r.staff ? ('👤 ' + r.staff) : (r.id ? $t("Xodim biriktirilmagan") : $t("Kassa belgilanmagan amallar")) }}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="badge" :class="r.active ? 'green' : 'gray'">{{ r.active ? $t("faol") : $t("nofaol") }}</span>
            <button v-if="isAdmin && r.id" class="btn sm ghost" @click="modal={...r}">✎</button>
          </div>
        </div>

        <div class="reg-cash" style="margin-bottom:12px">
          <div class="small muted" style="color:#cbd5e1">{{ $t("Naqd pul qoldig'i (kassada)") }}</div>
          <div class="v" style="font-size:24px;font-weight:700;margin-top:2px">{{money(r.cash_net)}} <small style="font-size:13px;opacity:0.8">{{ $t("so'm") }}</small></div>
        </div>

        <table class="t mt" style="margin-bottom:10px">
          <thead><tr><th>{{ $t("To'lov turi") }}</th><th class="num">{{ $t("Kirim") }}</th><th class="num">{{ $t("Chiqim") }}</th></tr></thead>
          <tbody>
            <tr v-for="(l,k) in METHODS" :key="k" v-show="r.by_method[k]">
              <td>{{METHOD_ICONS[k]}} {{l}}</td>
              <td class="num pos">{{money((r.by_method[k]||{}).in)}}</td>
              <td class="num neg">{{money((r.by_method[k]||{}).out)}}</td>
            </tr>
            <tr v-if="!r.payments_n"><td colspan="3" class="muted center">{{ $t("To'lovlar yo'q") }}</td></tr>
          </tbody>
          <tfoot v-if="r.payments_n"><tr><td><b>{{ $t("Jami") }}</b></td><td class="num pos"><b>{{money(r.in_total)}}</b></td><td class="num neg"><b>{{money(r.out_total)}}</b></td></tr></tfoot>
        </table>

        <div class="row small" style="margin-top:auto;padding-top:8px;border-top:1px dashed var(--border)">
          <span class="muted">{{ $t("Sotuvlar") }}:</span> <b>{{r.sales_n}} {{ $t("ta") }}</b> · <b>{{money(r.sales_total)}} {{ $t("so'm") }}</b>
        </div>
        <div class="row mt" v-if="r.id" style="gap:8px">
          <a class="btn sm" :href="link('payments', r)">💳 {{ $t("To'lovlar") }} →</a>
          <a class="btn sm" :href="link('sales', r)">🧾 {{ $t("Sotuvlar") }} →</a>
        </div>
      </div>
    </div>
    <p class="small muted mt">{{ $t("Har bir xodimga kassa «Xodimlar» bo'limida biriktiriladi. POS'da kassani almashtirish mumkin.") }}</p>

    <modal v-if="modal" :title="modal.id ? $t('Kassani tahrirlash') : $t('Yangi kassa')" @close="modal=null">
      <form id="reg-form" class="form-grid" @submit.prevent="save">
        <label class="f full"><span>{{ $t("Nomi") }}</span><input v-model="modal.name" :placeholder="$t('Masalan: Kassa 4')" autofocus></label>
        <label class="f full"><span>{{ $t("Izoh") }}</span><input v-model="modal.note"></label>
        <label class="check full" v-if="modal.id"><input type="checkbox" v-model="modal.active" :true-value="1" :false-value="0"> {{ $t("Faol") }}</label>
      </form>
      <template #footer><button class="btn" @click="modal=null">{{ $t("Bekor") }}</button><button class="btn primary" form="reg-form">{{ $t("Saqlash") }}</button></template>
    </modal>
  </div>`,
};
