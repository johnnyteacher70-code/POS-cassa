import { ref, reactive, watch, onMounted, computed, onActivated } from 'vue';
import { get, post, put, money, dt, session, toast, qs, today, can, METHODS, METHOD_ICONS } from '../lib.js';
import { invalidateStaff } from '../components.js';

function monthStart() { return today().slice(0, 8) + '01'; }

export const StaffPage = {
  setup() {
    const f = reactive({ from: monthStart(), to: today() });
    const report = ref([]);
    const users = ref([]);
    const modal = ref(null);
    const roles = ref([]);
    const isAdmin = computed(() => can('users.manage'));
    const load = async () => {
      report.value = await get('/api/staff/report' + qs(f));
      if (isAdmin.value) [users.value, roles.value] = await Promise.all([get('/api/auth/users'), get('/api/auth/roles')]);
    };
    // Xodimga faqat o'zidagi ruxsatlar doirasidagi rolni berish mumkin (server ham tekshiradi)
    const mine = () => session.user.perms;
    const assignable = (r) => mine().has('*') || r.perms.every((p) => p !== '*' && mine().has(p));
    const roleOptions = computed(() => roles.value.filter(assignable));
    const newUser = () => {
      const def = roleOptions.value.find((r) => r.name === 'Sotuvchi') || roleOptions.value.find((r) => !r.is_system) || roleOptions.value[0];
      modal.value = { username: '', full_name: '', phone: '', role_id: def ? def.id : '', password: '', active: 1, register_id: '' };
    };
    watch(() => [f.from, f.to], load);
    onActivated(load);
    const preset = (k) => {
      if (k === 'today') { f.from = today(); f.to = today(); }
      if (k === 'month') { f.from = monthStart(); f.to = today(); }
      if (k === 'all') { f.from = ''; f.to = ''; }
    };
    const save = async () => {
      const u = modal.value;
      if (u.id) await put('/api/auth/users/' + u.id, u); else await post('/api/auth/users', u);
      if (session.user && u.id === session.user.id) session.user.register_id = +u.register_id || null;
      toast(u.id ? 'Saqlandi' : "Xodim qo'shildi. Endi u o'z login va paroli bilan kira oladi.", 'ok', { duration: 6000 });
      modal.value = null;
      invalidateStaff();
      load();
    };
    const userOf = (id) => users.value.find((u) => u.id === id) || {};
    const totals = computed(() => report.value.reduce((a, r) => ({
      sales: a.sales + r.sales_total, in: a.in + r.in_total, closed: a.closed + r.closed_n, clients: a.clients + (r.clients_n || 0),
    }), { sales: 0, in: 0, closed: 0, clients: 0 }));
    const activeStaffCount = computed(() => report.value.filter((r) => r.active).length);
    return { f, report, users, roles, roleOptions, newUser, modal, isAdmin, load, preset, save, userOf, totals, activeStaffCount, money, dt, METHODS, METHOD_ICONS, session };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Xodimlar (sotuvchilar)") }}</h1>
        <div class="small muted">{{ $t("Filial sotuvchilari, kassa biriktirish va sotuv ko'rsatkichlari") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px">
        <a v-if="$can('roles.manage')" class="btn" href="#/roles">🛡 {{ $t("Rollar va ruxsatlar") }}</a>
        <button v-if="isAdmin" class="btn primary" @click="newUser">＋ {{ $t("Xodim qo'shish") }}</button>
      </div>
    </div>

    <!-- KPI Kartalari -->
    <div class="grid c4 mb">
      <div class="card stat">
        <div class="l">👥 {{ $t("Faol xodimlar") }}</div>
        <div class="v">{{activeStaffCount}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">🧾 {{ $t("Jami sotuvlar") }}</div>
        <div class="v pos">{{money(totals.sales)}}</div>
      </div>
      <div class="card stat">
        <div class="l">💰 {{ $t("Qabul qilingan pul") }}</div>
        <div class="v">{{money(totals.in)}}</div>
      </div>
      <div class="card stat">
        <div class="l">🤝 {{ $t("Yangi mijozlar") }}</div>
        <div class="v">{{totals.clients}} {{ $t("ta") }}</div>
      </div>
    </div>

    <div class="row mb" style="align-items:center;gap:8px">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="preset('today')">{{ $t("Bugun") }}</button>
      <button class="chip" @click="preset('month')">{{ $t("Shu oy") }}</button>
      <button class="chip" @click="preset('all')">{{ $t("Hammasi") }}</button>
    </div>

    <div class="card p0">
      <table class="t rt">
        <thead>
          <tr>
            <th>{{ $t("Xodim") }}</th>
            <th class="num">{{ $t("Sotuvlar") }}</th>
            <th class="num">{{ $t("Sotuv summasi") }}</th>
            <th class="num">{{ $t("Ochiq qarz (u sotgan)") }}</th>
            <th class="num">{{ $t("Qabul qilgan pul") }}</th>
            <th class="num">{{ $t("Yopgan qarzlar") }}</th>
            <th class="num">{{ $t("Buyurtma") }}</th>
            <th class="num">{{ $t("Yangi mijoz") }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in report" :key="r.id" :class="{dim: !r.active}">
            <td class="main-cell">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="width:34px;height:34px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">
                  {{ (r.full_name || r.username || 'X').slice(0, 2).toUpperCase() }}
                </span>
                <div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <b>{{r.full_name || r.username}}</b>
                    <span class="badge" :class="r.role_system ? 'purple' : 'gray'">{{ r.role_name ? $t(r.role_name) : $t("Rolsiz") }}</span>
                    <span class="badge red" v-if="!r.active">{{ $t("bloklangan") }}</span>
                  </div>
                  <div class="small muted">
                    {{ $t("login") }}: <b>@{{r.username}}</b>
                    <span v-if="r.phone"> · 📞 {{r.phone}}</span>
                    <span v-if="r.register_name"> · 📠 {{$t(r.register_name)}}</span>
                  </div>
                </div>
              </div>
            </td>
            <td :data-l="$t('Sotuvlar')" class="num"><a :href="'#/sales?user='+r.id">{{r.sales_n}} {{ $t("ta") }}</a></td>
            <td :data-l="$t('Sotuv summasi')" class="num bold">{{money(r.sales_total)}}</td>
            <td :data-l="$t('Ochiq qarz')" class="num" :class="{neg: r.open_debt}">{{money(r.open_debt)}}</td>
            <td :data-l="$t('Qabul qilgan')" class="num">
              <a :href="'#/payments?user='+r.id" class="pos bold">{{money(r.in_total)}}</a>
              <div class="small muted"><span v-for="(v,k) in r.in_by_method" :key="k" style="margin-left:6px">{{METHOD_ICONS[k]}} {{money(v)}}</span></div>
              <div class="small neg" v-if="r.out_total">{{ $t("qaytargan") }}: {{money(r.out_total)}}</div>
            </td>
            <td :data-l="$t('Yopgan qarzlar')" class="num"><a :href="'#/debts?tab=closed&user='+r.id">{{r.closed_n}} {{ $t("ta") }}</a><div class="small muted" v-if="r.closed_total">{{money(r.closed_total)}}</div></td>
            <td :data-l="$t('Buyurtma')" class="num">{{r.orders_n}}</td>
            <td :data-l="$t('Yangi mijoz')" class="num">{{r.clients_n}}</td>
            <td data-l="" class="right nowrap">
              <a class="btn sm ghost" :href="'#/audit?user='+r.id" :title="$t('Harakatlari')">🕘</a>
              <button v-if="isAdmin" class="btn sm ghost" @click="modal={...userOf(r.id), phone: userOf(r.id).phone || r.phone || '', password:'', register_id: String(userOf(r.id).register_id || ''), role_id: userOf(r.id).role_id || ''}">✎</button>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="report.length > 1">
          <tr>
            <td><b>{{ $t("Jami") }}</b></td>
            <td></td>
            <td class="num pos bold" :data-l="$t('Sotuv')"><b>{{money(totals.sales)}}</b></td>
            <td></td>
            <td class="num pos bold" :data-l="$t('Qabul qilingan')"><b>{{money(totals.in)}}</b></td>
            <td class="num" :data-l="$t('Yopilgan qarz')">{{totals.closed}} {{ $t("ta") }}</td>
            <td></td>
            <td class="num bold">{{totals.clients}} {{ $t("ta") }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="small muted mt">
      {{ $t("Har bir sotuv, to'lov, qarz yopilishi va o'zgarish kim tomonidan qilingani avtomatik yoziladi. Xodim ishdan ketsa uni o'chirmang — «Faol» belgisini olib tashlang: kira olmaydi, lekin tarixi saqlanadi") }}.
    </p>

    <modal v-if="modal" :title="modal.id ? $t('Xodimni tahrirlash') : $t('Yangi xodim')" @close="modal=null">
      <form id="user-form" class="form-grid" @submit.prevent="save">
        <label class="f full"><span>{{ $t("Ism familiya") }}</span><input v-model="modal.full_name" autofocus></label>
        <label class="f"><span>{{ $t("Telefon raqami (hujjatlar va KP uchun)") }}</span><input v-model="modal.phone" placeholder="+998 90 123 45 67"></label>
        <label class="f"><span>{{ $t("Login (kirish uchun)") }}</span><input v-model="modal.username" :disabled="!!modal.id" autocomplete="off" :placeholder="$t('masalan: ali')"></label>
        <label class="f"><span>{{modal.id ? $t("Yangi parol (o'zgartirish uchun)") : $t("Parol")}}</span><input type="text" v-model="modal.password" autocomplete="new-password"></label>
        <label class="f"><span>{{ $t("Kassa") }}</span><register-select v-model="modal.register_id" placeholder="Kassa biriktirilmagan" style="width:100%"/></label>
        <label class="f"><span>{{ $t("Rol") }}</span>
          <select v-model="modal.role_id" required>
            <option value="" disabled>{{ $t("Rolni tanlang") }}</option>
            <option v-for="r in roleOptions" :key="r.id" :value="r.id">{{ $t(r.name) }}{{ r.is_system ? ' — ' + $t("barcha ruxsatlar") : ' (' + r.perms.length + ' ' + $t("ta ruxsat") + ')' }}</option>
            <option v-if="modal.role_id && !roleOptions.some((r) => r.id === modal.role_id)" :value="modal.role_id" disabled>{{ $t(roles.find((r) => r.id === modal.role_id)?.name || '—') }}</option>
          </select>
        </label>
        <label class="check" v-if="modal.id" style="align-self:end"><input type="checkbox" v-model="modal.active" :true-value="1" :false-value="0"> {{ $t("Faol (tizimga kira oladi)") }}</label>
      </form>
      <template #footer><button class="btn" @click="modal=null">{{ $t("Bekor") }}</button><button class="btn primary" form="user-form">{{ $t("Saqlash") }}</button></template>
    </modal>
  </div>`,
};
