// POS batafsil oynalari (panellar): mijoz, sotuv, mahsulot, buyurtma, bugungi savdo, kutishdagi savatlar, chek, KP, kamera.
import { ref, reactive, computed, watch, shallowRef, onMounted, onActivated, onDeactivated, nextTick } from 'vue';
import {
  get, post, money, qtyFmt, dt, d, go, route, session, clientName, balanceInfo, saleStatus, debounce, toast, qs,
  METHODS, METHOD_ICONS, ORDER_STATUS, today, can, t,
} from '../lib.js';
import { loadProducts, invalidateProducts, loadRegisters } from '../components.js';
import { SaleDoc, QuoteDoc, ReceiptDoc, loadSettings, settings, boxOnly, stockLabel, trackStock } from '../docs.js';
import { baseName, packName, unitName, isFrac } from '../units.js';
import { ReturnModal } from '../returns.js';
import { ShiftBar } from '../pages/finance.js';
import { hw, beep, onScan, startCamera, printerCfg, printReceiptHw, openDrawer, autoSerial, decodeBarcodeFromImage } from '../hardware.js';

import {
  PANEL_PERMS, STORE_KEY, addProduct, after, applyPromo, balance, bills, blankCart, bonusMax, bonusOn, busy, cartClient, cartEmpty, cashPart, change, clearCart, clientQuery, closeAll, closePanel, completeSale, curUnit, display, displayState, fromAdvance, itemCount, itemUnits, lastAdded, levelId, lineTotal, loadOrderToCart, newOrders, openDisplay, openPanel, park, payNow, pieces, pos, priceOf, printDoc, printJob, printReceipt, printSale, products, promoPct, promoPrice, promos, pushDisplay, refreshStock, reloadClient, reloadProducts, repriceCart, restore, saveQuote, setUnit, stack, subtotal, toDebt, total, unpark,
} from './core.js';

// ================= Oyna komponentlari =================
export const Shell = {
  props: { title: String, sub: String },
  setup() { return { closePanel, closeAll, stack }; },
  template: `
  <div class="ph">
    <button class="btn" @click="closePanel">← {{ $t('Orqaga') }}</button>
    <div class="pt"><div class="bold">{{title}}</div><div class="small muted" v-if="sub">{{sub}}</div></div>
    <button class="btn ghost icon" v-if="stack.length>1" @click="closeAll" :title="$t('Hammasini yopish')">✕</button>
  </div>
  <div class="pb"><slot/></div>`,
};

export const ClientPanel = {
  components: { Shell },
  props: { id: [Number, String] },
  setup(props) {
    const data = ref(null);
    const tab = ref('debts');
    const pay = ref(null);
    const load = async () => { data.value = await get('/api/clients/' + props.id); };
    onMounted(load);
    const open = computed(() => (data.value ? data.value.sales.filter((s) => s.status === 'confirmed' && s.total > s.paid_amount) : []));
    const closed = computed(() => (data.value ? data.value.sales.filter((s) => s.status === 'confirmed' && s.was_debt && s.closed_at) : []));
    const choose = () => {
      if (pos.cart.order_id) return toast("Buyurtma yuklangan — mijozni o'zgartirib bo'lmaydi", 'error');
      pos.cart.client_id = +props.id; reloadClient(); closeAll();
    };
    const onPaid = () => { load(); if (+pos.cart.client_id === +props.id) reloadClient(); };
    return { data, tab, pay, open, closed, choose, onPaid, openPanel, go, money, dt, d, clientName, balanceInfo, saleStatus, METHODS, ORDER_STATUS, pos };
  },
  template: `
  <shell :title="data ? clientName(data.client) : $t('Mijoz')" :sub="data ? data.client.phone : ''">
    <template v-if="data">
      <div class="result-box mb">
        <div class="small muted">{{ $t('Balans') }}</div>
        <div class="balance-big" :class="balanceInfo(data.client.balance).cls">{{money(data.client.balance)}} {{ $t("so'm") }}</div>
        <div class="small muted">{{balanceInfo(data.client.balance).text}}</div>
        <div class="row mt small">
          <span>{{ $t('Jami olgan') }}: <b>{{money(data.stats.total_sales)}}</b></span>
          <span>{{ $t("To'lagan") }}: <b>{{money(data.stats.total_in - data.stats.total_out)}}</b></span>
        </div>
      </div>
      <div class="row mb">
        <button class="btn primary" v-if="+pos.cart.client_id !== +id" @click="choose">🛒 {{ $t('Savatga tanlash') }}</button>
        <button class="btn green" @click="pay={direction:'in'}">⬇ {{ $t('Kirim') }}</button>
        <button class="btn" @click="pay={direction:'out'}">⬆ {{ $t('Chiqim') }}</button>
        <a v-if="data.client.phone" class="btn" :href="'tel:'+data.client.phone">📞</a>
        <button class="btn" @click="go('/clients/'+id)">{{ $t("To'liq karta ↗") }}</button>
      </div>
      <dl class="info-list small mb">
        <template v-if="data.client.company_name && data.client.contact_name"><dt>{{ $t("Mas'ul") }}</dt><dd>{{data.client.contact_name}}</dd></template>
        <template v-if="data.client.inn"><dt>{{ $t('INN') }}</dt><dd>{{data.client.inn}}</dd></template>
        <template v-if="data.client.address"><dt>{{ $t('Manzil') }}</dt><dd>{{data.client.address}}</dd></template>
      </dl>
      <div class="tabs">
        <button :class="{active:tab==='debts'}" @click="tab='debts'">{{ $t('Ochiq qarzlar (') }}{{open.length}})</button>
        <button :class="{active:tab==='history'}" @click="tab='history'">{{ $t('Tarix') }}</button>
        <button :class="{active:tab==='closed'}" @click="tab='closed'">{{ $t('Yopilgan (') }}{{closed.length}})</button>
        <button :class="{active:tab==='orders'}" @click="tab='orders'">{{ $t('Buyurtmalar (') }}{{data.orders.length}})</button>
      </div>
      <div v-if="tab==='debts'">
        <div v-for="s in open" :key="s.id" class="pos-li" @click="openPanel('sale',{id:s.id})">
          <div class="grow"><b>{{s.number}}</b> <span class="small muted">{{dt(s.date)}}</span>
            <div class="small muted">{{ $t('Summa') }} {{money(s.total)}} · {{ $t("to'langan") }} {{money(s.paid_amount)}}<span v-if="s.due_date"> · {{ $t('muddat') }} {{d(s.due_date)}}</span></div></div>
          <b class="neg nowrap">{{money(s.total - s.paid_amount)}}</b>
          <button class="btn sm green" @click.stop="pay={direction:'in', saleId:s.id, amount:s.total-s.paid_amount}">{{ $t("To'lash") }}</button>
        </div>
        <div class="empty" v-if="!open.length">{{ $t("Ochiq qarz yo'q") }}</div>
      </div>
      <div v-if="tab==='history'">
        <div v-for="e in data.timeline" :key="e.type+e.id" class="pos-li" @click="e.type==='sale'||e.type==='opening' ? openPanel('sale',{id:e.id}) : null">
          <div class="grow">
            <div>{{e.type==='payment_in' ? $t('⬇ Kirim') : e.type==='payment_out' ? $t('⬆ Chiqim') : '🧾 ' + (e.number || $t('Sotuv'))}}<span class="muted small" v-if="e.method"> · {{METHODS[e.method]}}</span></div>
            <div class="small muted">{{dt(e.date)}}<span v-if="e.user_name"> · {{e.user_name}}</span><span v-if="e.sale_number"> · → {{e.sale_number}}</span></div>
          </div>
          <div class="right"><b :class="e.amount>0 ? 'pos' : 'neg'">{{e.amount>0?'+':''}}{{money(e.amount)}}</b><div class="small" :class="balanceInfo(e.balance).cls">{{money(e.balance)}}</div></div>
        </div>
        <div class="empty" v-if="!data.timeline.length">{{ $t("Tarix bo'sh") }}</div>
      </div>
      <div v-if="tab==='closed'">
        <div v-for="s in closed" :key="s.id" class="pos-li" @click="openPanel('sale',{id:s.id})">
          <div class="grow"><b>{{s.number}}</b><div class="small muted">{{ $t('olingan') }} {{dt(s.date)}} → {{ $t('yopilgan') }} {{dt(s.closed_at)}}<span v-if="s.closer_name"> · {{s.closer_name}}</span></div></div>
          <b>{{money(s.total)}}</b>
        </div>
        <div class="empty" v-if="!closed.length">{{ $t("Yo'q") }}</div>
      </div>
      <div v-if="tab==='orders'">
        <div v-for="o in data.orders" :key="o.id" class="pos-li" @click="openPanel('order',{id:o.id})">
          <div class="grow"><b>#{{o.id}}</b> <span class="small muted">{{dt(o.created_at)}}</span></div>
          <badge :s="ORDER_STATUS[o.status]"/><b>{{money(o.total)}}</b>
        </div>
        <div class="empty" v-if="!data.orders.length">{{ $t("Yo'q") }}</div>
      </div>
    </template>
    <payment-modal v-if="pay" :client-id="+id" :direction="pay.direction" :sale-id="pay.saleId" :amount="pay.amount" :register-id="pos.register" @close="pay=null" @saved="onPaid"/>
  </shell>`,
};

export const SalePanel = {
  components: { Shell, ReturnModal },
  props: { id: [Number, String] },
  setup(props) {
    const s = ref(null);
    const pay = ref(false);
    const ret = ref(false);
    const load = async () => { s.value = await get('/api/sales/' + props.id); };
    onMounted(load);
    const onPaid = () => { load(); reloadClient(); };
    const onReturned = () => { ret.value = false; load(); reloadClient(); refreshStock(); };
    return { s, pay, ret, onPaid, onReturned, pos, openPanel, printSale, printReceipt, go, money, qtyFmt, dt, clientName, saleStatus, METHODS };
  },
  template: `
  <shell :title="s ? s.number : $t('Sotuv')" :sub="s ? dt(s.date) : ''">
    <template v-if="s">
      <div class="row mb">
        <badge :s="saleStatus(s)"/>
        <span class="spacer"></span>
        <button class="btn primary" @click="printReceipt(s.id)">🧾 {{ $t('Chek') }}</button>
        <button class="btn" @click="printSale(s.id)">🖨 {{ $t('Nakladnoy') }}</button>
        <button class="btn green" v-if="$can('payments.create') && s.status==='confirmed' && s.total>s.paid_amount" @click="pay=true">⬇ {{ $t("To'lov") }}</button>
        <button class="btn" v-if="$can('sales.return') && s.status==='confirmed' && s.items.length" @click="ret=true">↩ {{ $t('Qaytarish') }}</button>
        <button class="btn" @click="go('/sales/'+s.id)">{{ $t("To'liq ↗") }}</button>
      </div>
      <div class="pos-li" @click="openPanel('client',{id:s.client_id})">
        <div class="grow"><div class="small muted">{{ $t('Mijoz') }}</div><b>{{clientName(s.client)}}</b></div><span class="muted">›</span>
      </div>
      <div class="result-box mt mb">
        <div class="tr"><span>{{ $t('Summa') }}</span><b>{{money(s.total)}}</b></div>
        <div class="tr"><span>{{ $t("To'langan") }}</span><b class="pos">{{money(s.paid_amount)}}</b></div>
        <div class="tr" v-if="s.status==='confirmed'"><span>{{ $t('Qoldiq (qarz)') }}</span><b :class="{neg: s.total>s.paid_amount}">{{money(s.total - s.paid_amount)}}</b></div>
        <div class="tr" v-if="s.due_date"><span>{{ $t("To'lov muddati") }}</span><span>{{dt(s.due_date, false)}}</span></div>
        <div class="tr" v-if="s.creator"><span>{{ $t('Sotuvchi') }}</span><span>{{s.creator.full_name || s.creator.username}}</span></div>
        <div class="tr" v-if="s.register || s.register_name"><span>{{ $t("Do'kon") }}</span><b class="pos">🏪 {{$t((s.register && s.register.name) || s.register_name)}}</b></div>
        <div class="tr" v-if="s.closed_at && s.was_debt"><span>{{ $t('Qarz yopilgan') }}</span><span class="pos">{{dt(s.closed_at)}}{{s.closer ? ' · ' + (s.closer.full_name || s.closer.username) : ''}}</span></div>
      </div>
      <h3>{{ $t('Mahsulotlar') }}</h3>
      <div v-for="i in s.items" :key="i.id" class="pos-li" @click="i.product_id && openPanel('product',{id:i.product_id})">
        <div class="grow">{{i.name}}<span v-if="i.color" class="cchip">{{i.color}}</span><div class="small muted">{{qtyFmt(i.qty)}} {{unitName(i, i.unit)}}<span v-if="i.unit==='karobka'"> × {{i.box_qty}} {{baseName(i)}}</span> · {{money(i.price)}}</div></div>
        <b>{{money(i.total)}}</b>
      </div>
      <div class="small muted" v-if="s.discount">{{ $t('Chegirma: −') }}{{money(s.discount)}}</div>
      <template v-if="s.allocations.length">
        <h3 class="mt">{{ $t("To'lovlar") }}</h3>
        <div v-for="a in s.allocations" :key="a.id" class="pos-li">
          <div class="grow">{{METHODS[a.method]}} <span class="small muted">· {{dt(a.payment_date)}}{{a.user_name ? ' · ' + $tx(a.user_name) : ''}}{{a.direct_sale===s.id ? '' : $t(' · avans/umumiy')}}</span></div>
          <b class="pos">{{money(a.amount)}}</b>
        </div>
      </template>
      <div class="small muted mt" v-if="s.note">{{ $t('Izoh') }}: {{$t(s.note)}}</div>
    </template>
    <payment-modal v-if="pay" :client-id="s.client_id" :sale-id="s.id" :amount="s.total-s.paid_amount" :register-id="pos.register" @close="pay=false" @saved="onPaid"/>
    <return-modal v-if="ret" :sale-id="s.id" :register-id="pos.register" @close="ret=false" @saved="onReturned"/>
  </shell>`,
};

export const ProductPanel = {
  components: { Shell },
  props: { id: [Number, String] },
  setup(props) {
    const p = ref(null);
    const branchStocks = ref([]);
    const f = reactive({ unit: curUnit(), qty: 1, color: '' });
    onMounted(async () => {
      p.value = await get('/api/products/' + props.id);
      get('/api/products/' + props.id + '/branches-stock', { silent: true }).then((bs) => { branchStocks.value = bs || []; }).catch(() => {});
    });
    const add = () => {
      const q = +f.qty || 0;
      addProduct(p.value, f.unit, q > 0 ? (isFrac(p.value) && f.unit === 'dona' ? q : Math.max(1, Math.round(q))) : 1, f.color); toast("Savatga qo'shildi", 'ok'); closePanel();
    };
    const pr = computed(() => (p.value ? priceOf(p.value) : { piece: 0, box: 0 }));
    return { p, branchStocks, f, add, pr, openPanel, go, money, dt, clientName, boxOnly, stockLabel, trackStock, baseName, packName, unitName, isFrac };
  },
  template: `
  <shell :title="p ? p.name : $t('Mahsulot')" :sub="p ? [p.brand, p.volume, p.size].filter(Boolean).join(' · ') : ''">
    <template v-if="p">
      <img v-if="p.image" :src="p.image" @error="$event.target.remove()" style="width:100%;max-height:340px;object-fit:contain;border-radius:12px;background:#ffffff;border:1px solid var(--border);padding:8px;box-sizing:border-box">
      <div class="grid c2 mt">
        <div class="result-box" v-if="!boxOnly()"><div class="small muted">{{ $t('Narxi') }} / {{baseName(p)}}</div><b style="font-size:18px">{{money(pr.piece)}}</b></div>
        <div class="result-box" v-if="p.box_qty > 1 || boxOnly()"><div class="small muted">{{packName(p)}} ({{p.box_qty}} {{baseName(p)}})</div><b style="font-size:18px">{{money(pr.box)}}</b></div>
      </div>
      <div class="result-box mt">
        <div class="tr"><span>{{ $t('Kodi') }}</span><b class="badge gray">#{{p.sku || p.barcode || p.id}}</b></div>
        <div class="tr"><span>{{ $t('Karobkada dona') }}</span><b>{{p.box_qty || 1}} {{baseName(p)}}</b></div>
        <div class="tr"><span>{{ $t('Qoldiq (Astatka)') }}</span><b :class="{neg:p.stock<=0}">{{p.stock || 0}} {{baseName(p)}} <span class="muted" v-if="p.box_qty > 1 && p.stock >= p.box_qty">({{Math.floor(p.stock / p.box_qty)}} kar.)</span></b></div>
      </div>
      <div class="result-box mt" v-if="branchStocks && branchStocks.length > 1">
        <div class="small bold mb" style="color:var(--primary)">🏪 {{ $t("Barcha do'konlar qoldig'i:") }}</div>
        <div v-for="bs in branchStocks" :key="bs.branch_id" class="tr">
          <span>{{bs.branch_name}} <span class="badge sm" v-if="bs.is_current">{{ $t("Bu do'kon") }}</span></span>
          <b :class="bs.stock > 0 ? 'pos' : 'neg'">{{bs.stock}} {{baseName(p)}}</b>
        </div>
      </div>
      <div class="mt" v-if="p.colors.length">
        <div class="small muted">{{ $t('Rangni tanlang') }}</div>
        <div class="chips mt"><button v-for="c in p.colors" :key="c" class="chip" :class="{active: f.color===c}" @click="f.color=c">{{c}}</button></div>
      </div>
      <div class="row mt">
        <div class="unit-toggle" v-if="!boxOnly() && p.box_qty > 1"><button :class="{on:f.unit==='dona'}" @click="f.unit='dona'">{{baseName(p)}}</button><button :class="{on:f.unit==='karobka'}" @click="f.unit='karobka'">{{packName(p)}}</button></div>
        <div class="stepper"><button class="btn" @click="f.qty=Math.max(1,f.qty-1)">−</button><input type="number" v-model.number="f.qty" min="0" :step="isFrac(p) ? 'any' : 1" inputmode="decimal" style="width:80px;text-align:center"><button class="btn" @click="f.qty++">+</button></div>
        <button class="btn primary" style="flex:1" @click="add">🛒 {{ $t('Savatga') }}</button>
      </div>
      <div class="small muted mt" v-if="p.description">{{p.description}}</div>
      <h3 class="mt">{{ $t("So'nggi sotuvlar") }}</h3>
      <div v-for="s in p.sales.slice(0,30)" :key="s.id+'-'+s.qty+s.unit" class="pos-li" @click="openPanel('sale',{id:s.id})">
        <div class="grow">{{s.number}} · {{clientName(s)}}<div class="small muted">{{dt(s.date)}} · {{s.qty}} {{unitName(p, s.unit)}}</div></div><b>{{money(s.total)}}</b>
      </div>
      <div class="empty" v-if="!p.sales.length">{{ $t('Hali sotilmagan') }}</div>
      <button class="btn mt" @click="go('/products/'+id)">{{ $t("To'liq sahifa (ombor kirimi) ↗") }}</button>
    </template>
  </shell>`,
};

export const OrderPanel = {
  components: { Shell },
  props: { id: [Number, String] },
  setup(props) {
    const o = ref(null);
    const load = async () => { o.value = await get('/api/orders/' + props.id); };
    onMounted(load);
    const toCart = () => { if (loadOrderToCart(o.value)) { toast('Buyurtma savatga yuklandi — tekshirib, "Sotuvni yakunlash" ni bosing', 'ok', { duration: 6000 }); closeAll(); } };
    const reject = async () => {
      const reason = prompt('Rad etish sababi (mijozga yuboriladi):', '');
      if (reason === null) return;
      await post(`/api/orders/${o.value.id}/reject`, { reason });
      load();
    };
    return { o, toCart, reject, openPanel, money, dt, clientName, balanceInfo, ORDER_STATUS };
  },
  template: `
  <shell :title="o ? $t('Buyurtma #') + o.id : $t('Buyurtma')" :sub="o ? dt(o.created_at) : ''">
    <template v-if="o">
      <div class="row mb"><badge :s="ORDER_STATUS[o.status]"/><span class="spacer"></span>
        <a v-if="o.client.phone" class="btn green" :href="'tel:'+o.client.phone">📞 {{o.client.phone}}</a></div>
      <div class="pos-li" @click="openPanel('client',{id:o.client_id})">
        <div class="grow"><div class="small muted">{{ $t('Mijoz') }}</div><b>{{clientName(o.client)}}</b>
          <div class="small" :class="balanceInfo(o.client.balance).cls">{{ $t('balans') }} {{money(o.client.balance)}}</div></div><span class="muted">›</span>
      </div>
      <h3 class="mt">{{ $t('Mahsulotlar') }}</h3>
      <div v-for="i in o.items" :key="i.id" class="pos-li" @click="i.product_id && openPanel('product',{id:i.product_id})">
        <div class="grow">{{i.name}}<span v-if="i.color" class="cchip">{{i.color}}</span><div class="small muted">{{i.qty}} {{unitName(i, i.unit)}} × {{money(i.price)}}</div></div><b>{{money(i.total)}}</b>
      </div>
      <div class="totals-box mt"><div class="tr big"><span>{{ $t('Jami') }}</span><span>{{money(o.total)}}</span></div></div>
      <div class="mt" v-if="o.note"><b>{{ $t('Mijoz izohi') }}:</b> {{$t(o.note)}}</div>
      <div class="row mt" v-if="o.status==='new'">
        <button class="btn red" @click="reject">✕ {{ $t('Rad etish') }}</button>
        <button class="btn primary" style="flex:1" @click="toCart">🛒 {{ $t('Savatga yuklash va tasdiqlash') }}</button>
      </div>
      <div class="mt" v-if="o.sale"><button class="btn" @click="openPanel('sale',{id:o.sale.id})">{{ $t('Sotuv') }}: {{o.sale.number}} ›</button></div>
    </template>
  </shell>`,
};

export const OrdersPanel = {
  components: { Shell },
  setup() {
    const rows = ref([]);
    const status = ref('new');
    const load = async () => { rows.value = (await get('/api/orders' + qs({ status: status.value }))).rows; };
    onMounted(load);
    watch(status, load);
    return { rows, status, openPanel, money, dt, clientName, ORDER_STATUS };
  },
  template: `
  <shell :title="$t('Katalog buyurtmalari')">
    <div class="chips mb">
      <button class="chip" :class="{active:status==='new'}" @click="status='new'">{{ $t('Yangi') }}</button>
      <button class="chip" :class="{active:status==='confirmed'}" @click="status='confirmed'">{{ $t('Tasdiqlangan') }}</button>
      <button class="chip" :class="{active:status===''}" @click="status=''">{{ $t('Hammasi') }}</button>
    </div>
    <div v-for="o in rows" :key="o.id" class="pos-li" @click="openPanel('order',{id:o.id})">
      <div class="grow"><b>#{{o.id}} · {{clientName(o)}}</b><div class="small muted">{{dt(o.created_at)}} · {{o.items_count}} {{ $t('pozitsiya') }}</div></div>
      <div class="right"><b>{{money(o.total)}}</b><div><badge :s="ORDER_STATUS[o.status]"/></div></div>
    </div>
    <div class="empty" v-if="!rows.length">{{ $t("Buyurtmalar yo'q") }}</div>
  </shell>`,
};

export const ClientsPanel = {
  components: { Shell },
  setup() {
    const q = ref('');
    const filter = ref('all');
    const rows = ref([]);
    const showNew = ref(false);
    const load = async () => { rows.value = (await get('/api/clients' + qs({ q: q.value, filter: filter.value, limit: 100 }), { latest: 'pos-clients' })).rows; };
    onMounted(load);
    watch(q, debounce(load, 250));
    watch(filter, load);
    const created = (id) => { showNew.value = false; openPanel('client', { id }); };
    return { q, filter, rows, showNew, created, openPanel, money, clientName, balanceInfo };
  },
  template: `
  <shell :title="$t('Mijozlar')">
    <div class="row mb">
      <div class="search-big"><input v-model="q" :placeholder="$t('Ism, kompaniya, telefon, INN, summa...')" autofocus></div>
      <button class="btn primary" @click="showNew=true">＋ {{ $t('Yangi') }}</button>
    </div>
    <div class="chips mb">
      <button class="chip" :class="{active:filter==='all'}" @click="filter='all'">{{ $t('Hammasi') }}</button>
      <button class="chip" :class="{active:filter==='debtors'}" @click="filter='debtors'"><i class="dot red"></i>{{ $t('Qarzdorlar') }}</button>
      <button class="chip" :class="{active:filter==='advance'}" @click="filter='advance'"><i class="dot green"></i>{{ $t('Avansi borlar') }}</button>
    </div>
    <div v-for="c in rows" :key="c.id" class="pos-li" @click="openPanel('client',{id:c.id})">
      <div class="grow"><b>{{clientName(c)}}</b><div class="small muted">{{c.phone}}{{c.open_debts ? ' · ' + c.open_debts + $t(' ta ochiq qarz') : ''}}</div></div>
      <b class="nowrap" :class="balanceInfo(c.balance).cls">{{money(c.balance)}}</b><span class="muted">›</span>
    </div>
    <div class="empty" v-if="!rows.length">{{ $t('Topilmadi') }}</div>
    <client-modal v-if="showNew" :initial="{company_name: q}" @close="showNew=false" @saved="created"/>
  </shell>`,
};

export const TodayPanel = {
  components: { Shell },
  setup() {
    const mine = ref(false);
    const onlyReg = ref(!!pos.register);
    const sales = ref({ rows: [], sum: {} });
    const pays = ref({ rows: [], sums: [] });
    const load = async () => {
      const f = { from: today(), to: today(), user_id: mine.value ? session.user.id : '', register_id: onlyReg.value ? pos.register : '' };
      sales.value = await get('/api/sales' + qs(f));
      if (can('payments.view')) pays.value = await get('/api/payments' + qs(f));
    };
    onMounted(load);
    watch([mine, onlyReg], load);
    const byMethod = computed(() => {
      const m = {};
      for (const s of pays.value.sums) m[s.method] = (m[s.method] || 0) + (s.direction === 'in' ? s.total : -s.total);
      return m;
    });
    return { mine, onlyReg, pos, sales, pays, byMethod, openPanel, money, dt, clientName, saleStatus, METHODS, METHOD_ICONS };
  },
  template: `
  <shell :title="$t('Bugun')">
    <div class="row mb">
      <label class="check"><input type="checkbox" v-model="onlyReg" :disabled="!pos.register"> {{ $t('Faqat shu kassa') }}</label>
      <label class="check"><input type="checkbox" v-model="mine"> {{ $t('Faqat mening amallarim') }}</label>
    </div>
    <div class="grid c2 mb">
      <div class="result-box"><div class="small muted">{{ $t('Sotuv (') }}{{sales.rows.filter(r=>r.status==='confirmed').length}} {{ $t('ta') }})</div><b style="font-size:18px">{{money(sales.sum.total)}}</b></div>
      <div class="result-box"><div class="small muted">{{ $t('Kassa (kirim − chiqim)') }}</div><b style="font-size:18px" class="pos">{{money(Object.values(byMethod).reduce((a,b)=>a+b,0))}}</b>
        <div class="small"><span v-for="(v,k) in byMethod" :key="k" style="margin-right:8px">{{METHOD_ICONS[k]}} {{money(v)}}</span></div></div>
    </div>
    <h3>{{ $t('Sotuvlar') }}</h3>
    <div v-for="s in sales.rows" :key="s.id" class="pos-li" :class="{dim: s.status==='cancelled'}" @click="openPanel('sale',{id:s.id})">
      <div class="grow"><b>{{s.number}}</b> · {{clientName(s)}}<div class="small muted">{{dt(s.date)}} · {{s.seller_name}}</div></div>
      <div class="right"><b>{{money(s.total)}}</b><div><badge :s="saleStatus(s)"/></div></div>
    </div>
    <div class="empty" v-if="!sales.rows.length">{{ $t("Bugun sotuv yo'q") }}</div>
    <h3 class="mt">{{ $t("To'lovlar") }}</h3>
    <div v-for="p in pays.rows" :key="p.id" class="pos-li" @click="openPanel('client',{id:p.client_id})">
      <div class="grow">{{p.direction==='in' ? '⬇' : '⬆'}} {{clientName(p)}}<div class="small muted">{{dt(p.date)}} · {{METHODS[p.method]}} · {{p.user_name}}</div></div>
      <b :class="p.direction==='in' ? 'pos' : 'neg'">{{money(p.amount)}}</b>
    </div>
    <div class="empty" v-if="!pays.rows.length">{{ $t("Bugun to'lov yo'q") }}</div>
  </shell>`,
};

export const ParkedPanel = {
  components: { Shell },
  setup() {
    const restoreCart = (i) => { unpark(i); closeAll(); };
    return { pos, restoreCart, money };
  },
  template: `
  <shell :title="$t('Kutishdagi savatlar')">
    <div v-for="(p,i) in pos.parked" :key="p.at+i" class="pos-li">
      <div class="grow"><b>{{p.client || $t('Mijoz tanlanmagan')}}</b><div class="small muted">{{p.at.replace($t('T'),' ')}} · {{p.cart.items.length}} {{ $t('pozitsiya') }}</div></div>
      <b>{{money(p.total)}}</b>
      <button class="btn sm primary" @click="restoreCart(i)">{{ $t('Qaytarish') }}</button>
      <button class="btn sm ghost" @click="pos.parked.splice(i,1)">🗑</button>
    </div>
    <div class="empty" v-if="!pos.parked.length">{{ $t("Kutishda savat yo'q") }}</div>
  </shell>`,
};

export const ReceiptPanel = {
  components: { Shell },
  props: { result: Object, clientLabel: String },
  setup() { return { printSale, printReceipt, openPanel, closeAll, money }; },
  template: `
  <shell :title="$t('Sotuv yakunlandi')">
    <div class="center" style="font-size:54px">✅</div>
    <h2 class="center">{{result.number}}</h2>
    <div class="center muted mb">{{clientLabel}}</div>
    <div class="result-box">
      <div class="tr"><span>{{ $t('Summa') }}</span><b>{{money(result.summary.total)}}</b></div>
      <div class="tr"><span>{{ $t('Oldingi balans') }}</span><span>{{money(result.summary.balance_before)}}</span></div>
      <div class="tr" v-if="result.summary.from_advance"><span>{{ $t('Avansdan yechildi') }}</span><b class="pos">{{money(result.summary.from_advance)}}</b></div>
      <div class="tr" v-if="result.summary.paid_now"><span>{{ $t("To'landi") }}</span><b class="pos">{{money(result.summary.paid_now)}}</b></div>
      <div class="tr" v-if="result.summary.debt"><span>{{ $t('Qarzga yozildi') }}</span><b class="neg">{{money(result.summary.debt)}}</b></div>
      <div class="tr big"><span>{{ $t('Yakuniy balans') }}</span><b>{{money(result.summary.balance_after)}}</b></div>
    </div>
    <div class="change-box mt" v-if="result.cash && result.cash.change"><span>{{ $t('Qaytim') }}</span><b>{{money(result.cash.change)}}</b></div>
    <div class="small mt" v-if="result.bonus && (result.bonus.earned || result.bonus.used)">🎁 <span v-if="result.bonus.used">{{ $t('Bonus ishlatildi') }}: {{money(result.bonus.used)}}. </span><span v-if="result.bonus.earned" class="pos">{{ $t("Bonus yig'ildi") }}: +{{money(result.bonus.earned)}}</span></div>
    <div class="small neg mt" v-for="w in result.warnings || []" :key="w">⚠ {{w}}</div>
    <div class="row mt">
      <button class="btn primary" style="flex:1" @click="printReceipt(result.id, { cash_given: result.cash ? result.cash.given : 0 })">🧾 {{ $t('Chek') }}</button>
      <button class="btn" style="flex:1" @click="printSale(result.id)">🖨 {{ $t('Nakladnoy chop etish') }}</button>
      <button class="btn" @click="openPanel('sale',{id:result.id})">{{ $t('Batafsil') }} ›</button>
    </div>
    <button class="btn green mt" style="width:100%;padding:14px" @click="closeAll">＋ {{ $t('Yangi sotuv') }}</button>
  </shell>`,
};

export const QuotePanel = {
  components: { Shell, QuoteDoc },
  props: { id: [Number, String] },
  setup(props) {
    const q = ref(null);
    onMounted(async () => { await loadSettings(); q.value = await get('/api/quotes/' + props.id); });
    return { q, printDoc, go };
  },
  template: `
  <shell :title="q ? $t('KP ') + q.number : $t('KP')">
    <template v-if="q">
      <div class="row mb">
        <button class="btn primary" @click="printDoc('quote', q)">🖨 {{ $t('Chop etish') }}</button>
        <button class="btn" @click="go('/quotes/'+q.id)">{{ $t("To'liq (PDF, tahrirlash) ↗") }}</button>
      </div>
      <div class="doc-scroll" style="zoom:.55"><quote-doc :quote="q"/></div>
    </template>
  </shell>`,
};

// ================= Kamera bilan skanerlash =================
export const CameraScan = {
  emits: ['close', 'code'],
  setup(_p, { emit }) {
    const video = ref(null);
    const fileInput = ref(null);
    const err = ref('');
    const busy = ref(false);
    const found = ref([]);
    let stop = null;
    onMounted(async () => {
      try { stop = await startCamera(video.value, (code) => { found.value.unshift(code); emit('code', code); }); }
      catch (e) { err.value = t("Kamerani ochib bo'lmadi") + ': ' + (e.message || e); }
    });
    const close = () => { if (stop) stop(); emit('close'); };
    const triggerPhoto = () => { if (fileInput.value) fileInput.value.click(); };
    const onPhoto = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      busy.value = true;
      try {
        const code = await decodeBarcodeFromImage(file);
        if (code) {
          found.value.unshift(code);
          emit('code', code);
        } else {
          err.value = t("Rasmdan shtrix-kod aniqlanmadi");
        }
      } catch (e) {
        err.value = (e.message || e);
      } finally {
        busy.value = false;
        if (e.target) e.target.value = '';
      }
    };
    return { video, fileInput, err, busy, found, close, triggerPhoto, onPhoto };
  },
  template: `
  <div class="modal-bg cam-modal" @mousedown.self="close">
    <div class="modal">
      <div class="mh"><h2>📷 {{ $t('Kamera bilan skanerlash') }}</h2><button class="btn ghost icon" @click="close">✕</button></div>
      <div class="mb">
        <video ref="video" playsinline muted style="width:100%;border-radius:10px;background:#000;max-height:50vh"></video>
        <input ref="fileInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onPhoto">
        <div class="row mt" style="justify-content:center">
          <button type="button" class="btn sm primary" :disabled="busy" @click="triggerPhoto">📸 {{ busy ? $t("O'qilmoqda...") : $t("Rasmga olish / Yuklash") }}</button>
        </div>
        <div class="neg small mt" v-if="err">{{err}}</div>
        <div class="small muted mt">{{ $t("Shtrix-kodni kameraga tuting yoki rasmga oling — o'qilgan har bir kod savatga tushadi") }}</div>
        <div class="small mt" v-for="(c,i) in found.slice(0,5)" :key="i">✓ {{c}}</div>
      </div>
      <div class="mf"><button class="btn primary" @click="close">{{ $t('Tayyor') }}</button></div>
    </div>
  </div>`,
};

