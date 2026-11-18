// Xodimlar oyligi va ish vaqti: oy bo'yicha hisob, oylik sozlamasi, to'lash ("Ish haqi" xarajati)
import { ref, reactive, watch, onActivated, onMounted } from 'vue';
import { get, post, put, del, money, dt, toast, t, today, METHODS, METHOD_ICONS, session } from '../lib.js';

// Menyudagi "Keldim / Ketdim" (xodimning o'zi uchun)
export const AttendanceButton = {
  setup() {
    const open = ref(null);
    const owner = ref(false);
    const load = async () => { if (!session.user || session.user.is_owner) { owner.value = true; return; } const r = await get('/api/attendance/me', { silent: true }).catch(() => ({ open: null })); open.value = r.open; };
    onMounted(load);
    const check = async (action) => { await post('/api/attendance/check', { action }); toast(action === 'in' ? 'Ish boshlandi' : 'Ish tugadi', 'ok'); load(); };
    return { open, owner, check, dt };
  },
  template: `
  <div class="sidebar-att-box" v-if="!owner">
    <div v-if="open" class="sidebar-att-card is-in">
      <div class="sidebar-att-info">
        <span class="sidebar-att-dot green"></span>
        <span class="sidebar-att-status">{{ $t('Ishda') }}</span>
        <span class="sidebar-att-time">{{ open.in_at.slice(11, 16) }}</span>
      </div>
      <button type="button" class="sidebar-att-btn out" @click.prevent="check('out')" :title="$t('Ishni yakunlash')">
        {{ $t('Ketdim') }}
      </button>
    </div>
    <div v-else class="sidebar-att-card is-out" @click="check('in')">
      <div class="sidebar-att-info">
        <span class="sidebar-att-dot"></span>
        <span class="sidebar-att-status">🕘 {{ $t('Ishni boshlash') }}</span>
      </div>
      <button type="button" class="sidebar-att-btn in" @click.stop.prevent="check('in')">
        {{ $t('Keldim') }}
      </button>
    </div>
  </div>`,
};

export const PayrollPage = {
  setup() {
    const month = ref(today().slice(0, 7));
    const data = ref({ rows: [] });
    const settingsM = ref(null);
    const payM = ref(null);
    const details = ref(null);
    const att = ref([]);
    const load = async () => {
      [data.value, att.value] = await Promise.all([get('/api/payroll?month=' + month.value), get('/api/attendance?month=' + month.value)]);
    };
    watch(month, load);
    onActivated(load);
    const saveSettings = async () => {
      const m = settingsM.value;
      await put('/api/payroll/settings/' + m.id, m); toast('Saqlandi', 'ok'); settingsM.value = null; load();
    };
    const openPay = (r) => { payM.value = { user_id: r.id, name: r.full_name || r.username, fixed_part: r.fixed_part, percent_part: r.percent_part, adjustment: 0, method: 'cash', note: '' }; };
    const pay = async () => {
      const m = payM.value;
      await post('/api/payroll/pay', { ...m, month: month.value }); toast("Oylik to'landi va xarajatga yozildi", 'ok'); payM.value = null; load();
    };
    const cancelPay = async (r) => {
      if (!confirm(t("To'lov bekor qilinsinmi? Xarajat ham o'chiriladi."))) return;
      await del('/api/payroll/' + r.paid.id); load();
    };
    const attOf = (id) => (att.value.find((a) => a.id === id) || { rows: [] }).rows;
    const totalComputed = () => data.value.rows.filter((r) => r.active).reduce((a, r) => a + (r.paid ? r.paid.total : r.computed), 0);
    return { month, data, settingsM, payM, details, saveSettings, openPay, pay, cancelPay, attOf, totalComputed, money, dt, METHODS, METHOD_ICONS };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Oylik va ish vaqti") }}</h1>
        <div class="small muted">{{ $t("Xodimlarning davomati, oylik maosh va KPI bonuslari hisob-kitobi") }}</div>
      </div>
      <input type="month" v-model="month" style="width:auto">
    </div>
    <div class="grid c3 mb">
      <div class="card stat"><div class="l">💼 {{ $t("Jami oylik (hisoblangan)") }}</div><div class="v">{{money(totalComputed())}}</div></div>
      <div class="card stat"><div class="l">✅ {{ $t("To'langan") }}</div><div class="v pos">{{money(data.rows.filter(r => r.paid).reduce((a, r) => a + r.paid.total, 0))}}</div></div>
      <div class="card stat"><div class="l">👥 {{ $t("Faol xodimlar") }}</div><div class="v">{{data.rows.filter(r => r.active).length}} {{ $t("ta") }}</div></div>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t('Xodim') }}</th><th class="num">{{ $t('Ish kunlari') }}</th><th class="num">{{ $t('Sotuvi') }}</th><th>{{ $t('Oylik sharti') }}</th><th class="num">{{ $t('Hisoblandi') }}</th><th></th></tr></thead>
        <tbody>
          <template v-for="r in data.rows" :key="r.id">
          <tr :class="{dim: !r.active}">
            <td class="main-cell"><b>{{r.full_name || r.username}}</b><div class="small muted">{{ $t(r.role_name || '') }}</div></td>
            <td :data-l="$t('Ish kunlari')" class="num"><a href="" @click.prevent="details = details === r.id ? null : r.id">{{r.days}} {{ $t('kun') }} · {{r.hours}} {{ $t('soat') }}</a></td>
            <td :data-l="$t('Sotuvi')" class="num">{{money(r.revenue)}}<div class="small muted">{{ $t('foyda') }} {{money(r.profit)}}</div></td>
            <td :data-l="$t('Oylik sharti')" class="small">{{money(r.salary_fixed)}}<span v-if="r.salary_percent"> + {{r.salary_percent}}% {{ r.salary_base === 'profit' ? $t('foydadan') : $t('sotuvdan') }}</span>
              <button class="btn sm ghost" @click="settingsM = { ...r }">⚙</button></td>
            <td :data-l="$t('Hisoblandi')" class="num bold">{{money(r.paid ? r.paid.total : r.computed)}}<div class="small pos" v-if="r.paid">✓ {{ $t("to'langan") }} {{dt(r.paid.created_at, false)}}</div></td>
            <td data-l="" class="right nowrap">
              <button class="btn sm primary" v-if="!r.paid && r.active" @click="openPay(r)">💸 {{ $t("To'lash") }}</button>
              <button class="btn sm ghost" v-if="r.paid" @click="cancelPay(r)" :title="$t('Bekor qilish')">✕</button>
            </td>
          </tr>
          <tr v-if="details === r.id"><td colspan="6" class="small" style="background:var(--surface-2)">
            <div v-for="a in attOf(r.id)" :key="a.in_at">{{a.date}}: {{a.in_at.slice(11, 16)}} — {{ a.out_at ? a.out_at.slice(11, 16) : $t('ochiq') }}</div>
            <div class="muted" v-if="!attOf(r.id).length">{{ $t('Bu oyda ish vaqti belgilanmagan') }}</div>
          </td></tr>
          </template>
        </tbody>
      </table>
    </div>
    <p class="small muted mt">{{ $t("Xodim har kuni menyudagi «Keldim» / «Ketdim» tugmasini bosadi — ish kunlari va soatlari shu yerda ko'rinadi. To'langan oylik «Ish haqi» xarajati bo'lib foyda hisobotiga kiradi.") }}</p>

    <modal v-if="settingsM" :title="$t('Oylik sharti') + ': ' + (settingsM.full_name || settingsM.username)" @close="settingsM=null">
      <form id="sal-form" class="form-grid" @submit.prevent="saveSettings">
        <label class="f"><span>{{ $t('Belgilangan oylik') }}</span><money-input v-model="settingsM.salary_fixed"/></label>
        <label class="f"><span>{{ $t('Foiz') }} (%)</span><input type="number" min="0" max="100" step="0.1" v-model.number="settingsM.salary_percent"></label>
        <label class="f full"><span>{{ $t('Foiz nimadan') }}</span><select v-model="settingsM.salary_base"><option value="sales">{{ $t("O'z sotuvi summasidan") }}</option><option value="profit">{{ $t("O'z sotuvi foydasidan") }}</option></select></label>
      </form>
      <template #footer><button class="btn" @click="settingsM=null">{{ $t('Bekor') }}</button><button class="btn primary" form="sal-form">{{ $t('Saqlash') }}</button></template>
    </modal>
    <modal v-if="payM" :title="$t(&quot;Oylik to'lash&quot;) + ': ' + payM.name" @close="payM=null">
      <form id="pay-form" class="form-grid" @submit.prevent="pay">
        <label class="f"><span>{{ $t('Belgilangan') }}</span><money-input v-model="payM.fixed_part"/></label>
        <label class="f"><span>{{ $t('Foiz qismi') }}</span><money-input v-model="payM.percent_part"/></label>
        <label class="f"><span>{{ $t('Bonus (+) yoki jarima (−)') }}</span><input type="number" step="1000" v-model.number="payM.adjustment"></label>
        <div class="f"><span>{{ $t('Jami') }}</span><div class="calc-box" style="font-size:18px"><b>{{money((+payM.fixed_part || 0) + (+payM.percent_part || 0) + (+payM.adjustment || 0))}}</b></div></div>
        <div class="f full chips"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active: payM.method===k}" @click="payM.method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
        <label class="f full"><span>{{ $t('Izoh') }}</span><input v-model="payM.note"></label>
      </form>
      <template #footer><button class="btn" @click="payM=null">{{ $t('Bekor') }}</button><button class="btn primary" form="pay-form">💸 {{ $t("To'lash") }}</button></template>
    </modal>
  </div>`,
};
