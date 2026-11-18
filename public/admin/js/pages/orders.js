import { ref, reactive, watch, onMounted, computed, onActivated } from 'vue';
import { get, post, put, money, dt, go, back, route, clientName, balanceInfo, toast, qs, ORDER_STATUS, METHODS, METHOD_ICONS } from '../lib.js';
import { loadProducts } from '../components.js';
import { removeWithUndo } from './clients.js';

export const OrdersPage = {
  setup() {
    const status = ref(route.query.status ?? 'new');
    const data = ref({ rows: [], counts: {} });
    const load = async () => {
      data.value = await get('/api/orders' + qs({ status: status.value }));
    };
    watch(status, load);
    onActivated(load);
    return { status, data, load, money, dt, go, clientName, balanceInfo, ORDER_STATUS };
  },
  template: `
  <div>
    <div class="page-head"><h1>{{ $t('Katalog buyurtmalari') }}</h1></div>
    <div class="chips mb">
      <button class="chip" :class="{active:status==='new'}" @click="status='new'"><i class="dot amber"></i>{{ $t('Yangi') }} <span class="n">{{data.counts.new||0}}</span></button>
      <button class="chip" :class="{active:status==='confirmed'}" @click="status='confirmed'">{{ $t('Tasdiqlangan') }} <span class="n">{{data.counts.confirmed||0}}</span></button>
      <button class="chip" :class="{active:status==='rejected'}" @click="status='rejected'">{{ $t('Rad etilgan') }} <span class="n">{{data.counts.rejected||0}}</span></button>
      <button class="chip" :class="{active:status==='cancelled'}" @click="status='cancelled'">{{ $t('Mijoz bekor qilgan') }} <span class="n">{{data.counts.cancelled||0}}</span></button>
      <button class="chip" :class="{active:status===''}" @click="status=''">{{ $t('Hammasi') }}</button>
    </div>

    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>#</th><th>{{ $t('Vaqt') }}</th><th>{{ $t('Mijoz') }}</th><th>{{ $t('Telefon') }}</th><th class="num">{{ $t('Summa') }}</th><th class="num">{{ $t('Mijoz balansi') }}</th><th>{{ $t('Holat') }}</th></tr></thead>
        <tbody>
          <tr v-for="o in data.rows" :key="o.id" class="click" @click="go('/orders/'+o.id)">
            <td class="main-cell bold">#{{o.id}}</td>
            <td :data-l="$t('Vaqt')" class="nowrap">{{dt(o.created_at)}}</td>
            <td :data-l="$t('Mijoz')">{{clientName(o)}}</td>
            <td :data-l="$t('Telefon')" @click.stop><a :href="'tel:'+o.phone">{{o.phone}}</a></td>
            <td :data-l="$t('Summa')" class="num bold">{{money(o.total)}}</td>
            <td :data-l="$t('Balans')" class="num" :class="balanceInfo(o.balance).cls">{{money(o.balance)}}</td>
            <td :data-l="$t('Holat')"><badge :s="ORDER_STATUS[o.status]"/> <span class="small" v-if="o.sale_number">→ {{o.sale_number}}</span></td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!data.rows.length">{{ $t("Buyurtmalar yo'q") }}</div>
    </div>

  </div>`,
};

export const OrderView = {
  setup() {
    const orderId = route.parts[1];
    const o = ref(null);
    const items = ref([]);
    const editing = ref(false);
    const f = reactive({ admin_note: '', due_date: '', pay_amount: '', pay_method: 'cash' });
    const load = async () => {
      o.value = await get('/api/orders/' + orderId);
      items.value = o.value.items.map((i) => ({ ...i }));
      f.admin_note = o.value.admin_note;
      await loadProducts();
    };
    onActivated(load);
    const total = computed(() => items.value.reduce((a, i) => a + Math.round((+i.qty || 0) * (+i.price || 0)), 0));
    const saveEdit = async () => {
      await put('/api/orders/' + o.value.id, { items: items.value, admin_note: f.admin_note });
      toast('Saqlandi', 'ok');
      editing.value = false;
      load();
    };
    const confirmOrder = async () => {
      const r = await post(`/api/orders/${o.value.id}/confirm`, {
        items: items.value, admin_note: f.admin_note, due_date: f.due_date,
        pay_now: f.pay_amount ? { amount: f.pay_amount, method: f.pay_method } : null,
      });
      const s = r.summary;
      toast(`Tasdiqlandi → ${r.number}` + (s.from_advance ? `\nAvansdan: ${money(s.from_advance)}` : '') + (s.debt ? `\nQarzga: ${money(s.debt)}` : ''), 'ok', { duration: 8000 });
      go('/sales/' + r.id);
    };
    const reject = async () => {
      const reason = prompt('Rad etish sababi (mijozga yuboriladi):', '');
      if (reason === null) return;
      await post(`/api/orders/${o.value.id}/reject`, { reason });
      load();
    };
    const reopen = async () => { await post(`/api/orders/${o.value.id}/reopen`); load(); };
    const remove = () => removeWithUndo('/api/orders/' + o.value.id, `Buyurtma #${o.value.id}`, () => go('/orders'));
    return { o, items, editing, f, total, saveEdit, confirmOrder, reject, reopen, remove, money, dt, back, clientName, balanceInfo, ORDER_STATUS, METHODS, METHOD_ICONS };
  },
  template: `
  <div v-if="o">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/orders')">←</a>
      <h1>{{ $t('Buyurtma #') }}{{o.id}} <badge :s="ORDER_STATUS[o.status]"/></h1>
      <button class="btn red" v-if="$can('orders.delete')" @click="remove">🗑</button>
    </div>
    <div class="grid c3">
      <div class="card">
        <h3>{{ $t('Mijoz') }}</h3>
        <div class="bold" style="font-size:16px"><a :href="'#/clients/'+o.client_id">{{clientName(o.client)}}</a></div>
        <div v-if="o.client.contact_name && o.client.company_name">{{o.client.contact_name}}</div>
        <a v-if="o.client.phone" :href="'tel:'+o.client.phone" class="btn green mt" style="width:100%">📞 {{ $t("Qo'ng'iroq") }}: {{o.client.phone}}</a>
        <div class="result-box mt">
          <div class="tr"><span>{{ $t('Balans') }}</span><b :class="balanceInfo(o.client.balance).cls">{{money(o.client.balance)}}</b></div>
          <div class="small muted">{{balanceInfo(o.client.balance).text}}</div>
        </div>
        <div class="small muted mt">{{ $t('Kelgan') }}: {{dt(o.created_at)}}</div>
        <div class="mt" v-if="o.note"><b>{{ $t('Mijoz izohi') }}:</b> {{$t(o.note)}}</div>
        <div class="mt" v-if="o.sale"><b>{{ $t('Sotuv') }}:</b> <a :href="'#/sales/'+o.sale.id">{{o.sale.number}}</a></div>
      </div>
      <div class="card" style="grid-column: span 2">
        <div class="row mb"><h2 style="margin:0;flex:1">{{ $t('Mahsulotlar') }}</h2>
          <button class="btn sm" v-if="$can('orders.process') && o.status==='new' && !editing" @click="editing=true">✎ {{ $t('Tahrirlash') }}</button>
        </div>
        <items-editor v-if="editing" :items="items"/>
        <table class="t rt" v-else>
          <thead><tr><th>{{ $t('Mahsulot') }}</th><th>{{ $t('Birlik') }}</th><th class="num">{{ $t('Miqdor') }}</th><th class="num">{{ $t('Narx') }}</th><th class="num">{{ $t('Summa') }}</th></tr></thead>
          <tbody>
            <tr v-for="i in items" :key="i.id"><td class="main-cell">{{i.name}}<span v-if="i.color" class="cchip">{{i.color}}</span></td><td :data-l="$t('Birlik')">{{$t(i.unit)}}<span v-if="i.unit==='karobka'" class="muted small"> ({{i.box_qty}} {{ $t('dona') }})</span></td>
              <td :data-l="$t('Miqdor')" class="num">{{i.qty}}</td><td :data-l="$t('Narx')" class="num">{{money(i.price)}}</td><td :data-l="$t('Summa')" class="num">{{money(i.total ?? i.qty*i.price)}}</td></tr>
          </tbody>
        </table>
        <div class="totals-box mt"><div class="tr big"><span>{{ $t('Jami') }}</span><span>{{money(total)}} {{ $t("so'm") }}</span></div></div>

        <template v-if="o.status==='new'">
          <div class="form-grid mt">
            <label class="f full"><span>{{ $t('Admin izohi') }}</span><input v-model="f.admin_note"></label>
            <label class="f"><span>{{ $t("To'lov muddati (qarzga bo'lsa)") }}</span><input type="date" v-model="f.due_date"></label>
            <label class="f"><span>{{ $t("Hozir to'lov (ixtiyoriy)") }}</span><money-input v-model="f.pay_amount"/></label>
            <div class="full chips" v-if="f.pay_amount"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active:f.pay_method===k}" @click="f.pay_method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
          </div>
          <div class="row end mt">
            <button class="btn" v-if="editing" @click="saveEdit">💾 {{ $t("O'zgarishni saqlash") }}</button>
            <button class="btn red" v-if="$can('orders.process')" @click="reject">✕ {{ $t('Rad etish') }}</button>
            <button class="btn green" v-if="$can('orders.process')" @click="confirmOrder">✓ {{ $t('Tasdiqlash → sotuv') }}</button>
          </div>
          <div class="small muted mt right">{{ $t("Tasdiqlansa haqiqiy sotuv bo'ladi: mijoz avansidan yechiladi yoki qarzga yoziladi, ombordan chiqadi") }}.</div>
        </template>
        <div class="row end mt" v-else-if="o.status!=='confirmed' || !o.sale">
          <button class="btn" v-if="$can('orders.delete')" @click="reopen">↺ {{ $t('Qayta ochish') }}</button>
        </div>
        <div v-if="o.admin_note && o.status!=='new'" class="mt"><b>{{ $t('Izoh') }}:</b> {{o.admin_note}}</div>
      </div>
    </div>
    <div class="card mt" v-if="o.audit.length">
      <h3>{{ $t('Tarix') }}</h3>
      <div v-for="a in o.audit" :key="a.at+a.summary" class="small" style="padding:3px 0"><span class="muted">{{dt(a.at)}} · {{$tx(a.user_name)}}:</span> {{$tx(a.summary)}}</div>
    </div>
  </div>`,
};
