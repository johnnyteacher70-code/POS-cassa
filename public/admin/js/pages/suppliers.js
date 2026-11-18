// Yetkazib beruvchilar va xarid (kirim hujjati): tovar keldi → omborga kirim, tannarx yangilanadi, yetkazib beruvchiga qarz
import { ref, reactive, computed, onActivated, watch } from 'vue';
import { get, post, put, del, money, dt, go, back, route, toast, qs, today, nowLocal, qtyFmt, t, METHODS, METHOD_ICONS, resetPage } from '../lib.js';
import { ProductAC, invalidateProducts } from '../components.js';
import { settings, loadSettings } from '../docs.js';
import { ProductModal } from './products.js';

// ---------- Yetkazib beruvchi formasi ----------
const SupplierModal = {
  props: { supplier: Object },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const f = reactive({ name: '', contact_name: '', phone: '', inn: '', address: '', note: '', ...(props.supplier || {}) });
    const save = async () => {
      const r = props.supplier ? await put('/api/suppliers/' + props.supplier.id, f) : await post('/api/suppliers', f);
      toast('Saqlandi', 'ok');
      emit('saved', props.supplier ? props.supplier.id : r.id);
    };
    return { f, save };
  },
  template: `
  <modal :title="supplier ? $t('Yetkazib beruvchini tahrirlash') : $t('Yangi yetkazib beruvchi')" @close="$emit('close')">
    <form id="sup-form" class="form-grid" @submit.prevent="save">
      <label class="f full"><span>{{ $t('Nomi') }} *</span><input v-model="f.name" autofocus :placeholder="$t('Kompaniya yoki shaxs')"></label>
      <label class="f"><span>{{ $t("Mas'ul shaxs") }}</span><input v-model="f.contact_name"></label>
      <label class="f"><span>{{ $t('Telefon') }}</span><input v-model="f.phone" inputmode="tel" placeholder="+998 90 123 45 67"></label>
      <label class="f"><span>{{ $t('INN') }}</span><input v-model="f.inn" inputmode="numeric"></label>
      <label class="f"><span>{{ $t('Manzil') }}</span><input v-model="f.address"></label>
      <label class="f full"><span>{{ $t('Izoh') }}</span><textarea v-model="f.note" rows="2"></textarea></label>
    </form>
    <template #footer><button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button><button class="btn primary" form="sup-form">{{ $t('Saqlash') }}</button></template>
  </modal>`,
};

// ---------- Yetkazib beruvchiga to'lov ----------
const SupplierPayModal = {
  props: { supplier: Object, purchaseId: Number, amount: Number },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const f = reactive({ amount: props.amount || '', method: 'cash', date: nowLocal(), note: '' });
    const save = async () => {
      await post(`/api/suppliers/${props.supplier.id}/payments`, { ...f, purchase_id: props.purchaseId || null });
      toast("To'lov saqlandi", 'ok');
      emit('saved');
    };
    return { f, save, METHODS, METHOD_ICONS, money };
  },
  template: `
  <modal :title="$t(&quot;Yetkazib beruvchiga to'lov&quot;) + ': ' + supplier.name" @close="$emit('close')">
    <form id="sp-form" class="form-grid" @submit.prevent="save">
      <label class="f full"><span>{{ $t('Summa') }}</span><money-input v-model="f.amount" autofocus/></label>
      <div class="f full chips"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active: f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
      <label class="f"><span>{{ $t('Sana') }}</span><input type="datetime-local" v-model="f.date"></label>
      <label class="f"><span>{{ $t('Izoh') }}</span><input v-model="f.note"></label>
      <div class="full small muted" v-if="supplier.debt">{{ $t('Joriy qarzimiz') }}: <b>{{money(supplier.debt)}}</b></div>
    </form>
    <template #footer><button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button><button class="btn primary" form="sp-form" :disabled="!f.amount">{{ $t('Saqlash') }}</button></template>
  </modal>`,
};

export const SuppliersPage = {
  components: { SupplierModal },
  setup() {
    const rows = ref([]);
    const q = ref('');
    const modal = ref(false);
    const load = async () => { rows.value = await get('/api/suppliers'); };
    onActivated(load);
    const filtered = computed(() => {
      const s = q.value.toLowerCase();
      return rows.value.filter((r) => !s || `${r.name} ${r.contact_name} ${r.phone} ${r.inn}`.toLowerCase().includes(s));
    });
    const totalDebt = computed(() => rows.value.reduce((a, r) => a + Math.max(0, r.debt), 0));
    return { rows, q, modal, load, filtered, totalDebt, money, dt, go };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Yetkazib beruvchilar") }}</h1>
        <div class="small muted">{{ $t("Hamkor ta'minotchilar, xaridlar tarixi va qarz hisob-kitoblari") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px">
        <a class="btn green" v-if="$can('purchases.create')" href="#/purchases/new">📥 {{ $t("Yangi xarid (kirim)") }}</a>
        <button class="btn primary" v-if="$can('suppliers.edit')" @click="modal=true">＋ {{ $t("Yetkazib beruvchi") }}</button>
      </div>
    </div>
    <div class="grid c3 mb">
      <div class="card stat"><div class="l">🚚 {{ $t("Yetkazib beruvchilar") }}</div><div class="v">{{rows.length}} {{ $t("ta") }}</div></div>
      <div class="card stat"><div class="l">🔴 {{ $t("Bizning qarzimiz (jami)") }}</div><div class="v" :class="{neg: totalDebt}">{{money(totalDebt)}}</div></div>
      <div class="card stat"><div class="l">🧾 {{ $t("Xaridlar") }}</div><div class="v"><a href="#/purchases">{{ $t("Ro'yxat") }} →</a></div></div>
    </div>
    <div class="row mb"><div class="search-big" style="flex:1"><input v-model="q" :placeholder="$t(&quot;Nomi, telefon, INN bo'yicha qidirish...&quot;)"></div></div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Yetkazib beruvchi") }}</th><th class="num">{{ $t("Xaridlar") }}</th><th>{{ $t("Oxirgi xarid") }}</th><th class="num">{{ $t("Bizning qarzimiz") }}</th></tr></thead>
        <tbody>
          <tr v-for="s in filtered" :key="s.id" class="click" @click="go('/suppliers/'+s.id)">
            <td class="main-cell"><b>{{s.name}}</b><div class="small muted">{{[s.contact_name, s.phone, s.inn && ('INN ' + s.inn)].filter(Boolean).join(' · ')}}</div></td>
            <td :data-l="$t('Xaridlar')" class="num">{{s.purchases_n}} {{ $t("ta") }}</td>
            <td :data-l="$t('Oxirgi xarid')" class="small">{{s.last_date ? dt(s.last_date, false) : '—'}}</td>
            <td :data-l="$t('Qarz')" class="num bold" :class="s.debt > 0 ? 'neg' : s.debt < 0 ? 'pos' : ''">{{money(s.debt)}}</td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!filtered.length">{{ $t("Yetkazib beruvchi yo'q") }}</div>
    </div>
    <supplier-modal v-if="modal" @close="modal=false" @saved="id => { modal=false; go('/suppliers/'+id) }"/>
  </div>`,
};

export const SupplierView = {
  components: { SupplierModal, SupplierPayModal },
  setup() {
    const s = ref(null);
    const edit = ref(false);
    const pay = ref(null);
    const id = route.parts[1];
    const load = async () => { s.value = await get('/api/suppliers/' + id); };
    onActivated(load);
    const remove = async () => {
      if (!confirm(t('Yetkazib beruvchi o\'chirilsinmi?'))) return;
      await del('/api/suppliers/' + id); toast("O'chirildi", 'ok'); go('/suppliers');
    };
    const removePay = async (p) => {
      if (!confirm(t("To'lov o'chirilsinmi?"))) return;
      await del('/api/supplier-payments/' + p.id); load();
    };
    return { s, edit, pay, load, remove, removePay, money, dt, back, go, METHODS, METHOD_ICONS };
  },
  template: `
  <div v-if="s">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/suppliers')">←</a>
      <h1>{{s.name}}</h1>
      <button class="btn" v-if="$can('suppliers.edit')" @click="edit=true">✎ {{ $t('Tahrirlash') }}</button>
      <button class="btn red" v-if="$can('suppliers.edit')" @click="remove">🗑</button>
    </div>
    <div class="grid c3 mb">
      <div class="card stat"><div class="l">{{ $t('Bizning qarzimiz') }}</div><div class="v" :class="s.debt > 0 ? 'neg' : ''">{{money(s.debt)}}</div>
        <div class="s" v-if="s.debt < 0">{{ $t('Yetkazib beruvchida avansimiz bor') }}</div></div>
      <div class="card stat"><div class="l">{{ $t('Xaridlar') }}</div><div class="v">{{s.purchases.filter(p => p.status==='confirmed').length}}</div></div>
      <div class="card stat"><div class="l">{{ $t('Aloqa') }}</div><div class="v" style="font-size:16px">{{s.phone || '—'}}</div><div class="s">{{s.contact_name}}</div></div>
    </div>
    <div class="row mb">
      <a class="btn green" v-if="$can('purchases.create')" :href="'#/purchases/new?supplier=' + s.id">📥 {{ $t('Yangi xarid') }}</a>
      <button class="btn primary" v-if="$can('suppliers.pay')" @click="pay={amount: Math.max(0, s.debt)}">💸 {{ $t("To'lov qilish") }}</button>
    </div>
    <div class="grid c2">
      <div class="card p0">
        <div style="padding:14px 16px 0"><h2>{{ $t('Xaridlar') }}</h2></div>
        <table class="t rt"><tbody>
          <tr v-for="p in s.purchases" :key="p.id" class="click" :class="{dim: p.status!=='confirmed'}" @click="go('/purchases/'+p.id)">
            <td class="main-cell"><a :href="'#/purchases/'+p.id">{{p.number}}</a> <span class="badge gray" v-if="p.status!=='confirmed'">{{ $t('bekor qilingan') }}</span><div class="small muted">{{dt(p.date)}}</div></td>
            <td :data-l="$t('Summa')" class="num bold">{{money(p.total)}}</td>
          </tr>
        </tbody></table>
        <div class="empty" v-if="!s.purchases.length">{{ $t("Xarid yo'q") }}</div>
      </div>
      <div class="card p0">
        <div style="padding:14px 16px 0"><h2>{{ $t("To'lovlar") }}</h2></div>
        <table class="t rt"><tbody>
          <tr v-for="p in s.payments" :key="p.id">
            <td class="main-cell">{{METHOD_ICONS[p.method]}} {{METHODS[p.method]}}<div class="small muted">{{dt(p.date)}}<span v-if="p.purchase_number"> · {{p.purchase_number}}</span><span v-if="p.user_name"> · {{p.user_name}}</span><span v-if="p.note"> · {{p.note}}</span></div></td>
            <td :data-l="$t('Summa')" class="num bold">{{money(p.amount)}}</td>
            <td data-l="" class="right"><button class="btn sm ghost" v-if="$can('suppliers.pay')" @click="removePay(p)">🗑</button></td>
          </tr>
        </tbody></table>
        <div class="empty" v-if="!s.payments.length">{{ $t("To'lov yo'q") }}</div>
      </div>
    </div>
    <supplier-modal v-if="edit" :supplier="s" @close="edit=false" @saved="edit=false; load()"/>
    <supplier-pay-modal v-if="pay" :supplier="s" :amount="pay.amount" @close="pay=null" @saved="pay=null; load()"/>
  </div>`,
};

export const PurchasesPage = {
  setup() {
    const f = reactive({ from: '', to: '', supplier_id: route.query.supplier || '' });
    const data = ref({ rows: [], sum: {} });
    const load = async () => { data.value = await get('/api/purchases' + qs(f)); };
    watch(() => [f.from, f.to], load);
    onActivated(load);
    return { f, data, money, dt, go, today };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Xaridlar (kirim hujjatlari)") }}</h1>
        <div class="small muted">{{ $t("Omborga tovar qabul qilish va tannarx qaydnomalari") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px">
        <a class="btn" href="#/suppliers">🚚 {{ $t("Yetkazib beruvchilar") }}</a>
        <a class="btn green" v-if="$can('purchases.create')" href="#/purchases/new">📥 {{ $t("Yangi xarid") }}</a>
      </div>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
      <button class="chip" @click="f.from = today(); f.to = today()">{{ $t("Bugun") }}</button>
      <button class="chip" @click="f.from = today().slice(0, 8) + '01'; f.to = today()">{{ $t("Shu oy") }}</button>
      <button class="chip" @click="f.from = ''; f.to = ''">{{ $t("Hammasi") }}</button>
      <span class="spacer"></span>
      <span class="badge gray"><b>{{ $t("Jami") }}: {{money(data.sum.total)}} ({{data.sum.n}} {{ $t("ta") }})</b></span>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Hujjat") }}</th><th>{{ $t("Yetkazib beruvchi") }}</th><th class="num">{{ $t("Mahsulotlar") }}</th><th class="num">{{ $t("Summa") }}</th></tr></thead>
        <tbody>
          <tr v-for="p in data.rows" :key="p.id" class="click" :class="{dim: p.status!=='confirmed'}" @click="go('/purchases/'+p.id)">
            <td class="main-cell"><a :href="'#/purchases/'+p.id"><b>{{p.number}}</b></a> <span class="badge gray" v-if="p.status!=='confirmed'">{{ $t("bekor qilingan") }}</span><div class="small muted">🕒 {{dt(p.date)}}<span v-if="p.user_name"> · 👤 {{p.user_name}}</span></div></td>
            <td :data-l="$t('Yetkazib beruvchi')">🚚 {{p.supplier_name}}</td>
            <td :data-l="$t('Mahsulotlar')" class="num">{{p.items_n}} {{ $t("ta") }}</td>
            <td :data-l="$t('Summa')" class="num bold" style="font-size:15px">{{money(p.total)}}</td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!data.rows.length">{{ $t("Xarid yo'q") }}</div>
    </div>
  </div>`,
};

// ---------- Yangi xarid ----------
const blankLine = () => ({ product_id: null, name: '', unit: 'dona', qty: 1, price: '', box_qty: 1, unit_code: 'dona', pack_name: 'karobka', cost: 0 });
export const PurchaseForm = {
  components: { ProductAC, SupplierModal, ProductModal },
  setup() {
    const suppliers = ref([]);
    const f = reactive({ supplier_id: route.query.supplier ? +route.query.supplier : '', date: nowLocal(), note: '', items: [blankLine()], paid: '', method: 'cash' });
    const newSup = ref(false);
    const saving = ref(false);
    const scanModal = ref(false);
    const showNewProd = ref(false);
    const newProdBarcode = ref('');

    const loadSup = async () => { suppliers.value = await get('/api/suppliers'); await loadSettings(); };
    onActivated(loadSup);
    const expiry = computed(() => settings.data.track_expiry === '1');
    // Mahsulot tanlanganda — oxirgi tannarx taklif qilinadi (qadoq bo'lsa qadoqda)
    const pick = (it, p) => {
      Object.assign(it, { product_id: p.id, name: p.name, box_qty: p.box_qty, unit_code: p.unit, pack_name: p.pack_name, cost: p.cost_price || 0 });
      it.unit = p.box_qty > 1 ? 'karobka' : 'dona';
      it.price = p.cost_price ? Math.round(it.unit === 'karobka' ? p.cost_price * p.box_qty : p.cost_price) : '';
      if (f.items[f.items.length - 1] === it) f.items.push(blankLine());
    };
    const setUnit = (it, u) => {
      if (it.unit === u) return;
      const per = it.unit === 'karobka' ? (+it.price || 0) / it.box_qty : (+it.price || 0);
      it.unit = u;
      if (per) it.price = Math.round(u === 'karobka' ? per * it.box_qty : per);
    };

    const onBarcodeScanned = async (code) => {
      scanModal.value = false;
      const prods = await get('/api/products?q=' + encodeURIComponent(code));
      const found = (prods || []).find((p) => (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) || (p.sku && p.sku.toLowerCase() === code.toLowerCase())) || (prods && prods[0]);
      if (found) {
        let target = f.items.find((i) => !i.product_id);
        if (!target) {
          target = blankLine();
          f.items.push(target);
        }
        pick(target, found);
        toast(t('Mahsulot qo‘shildi') + ': ' + found.name, 'ok');
      } else {
        if (confirm(t('Bu shtrix-kodli mahsulot bazada topilmadi') + ' (' + code + '). ' + t('Yangi mahsulot sifatida qo‘shilsinmi?'))) {
          newProdBarcode.value = code;
          showNewProd.value = true;
        }
      }
    };

    const onNewProdSaved = async (id) => {
      showNewProd.value = false;
      const p = await get('/api/products/' + id);
      if (p) {
        let target = f.items.find((i) => !i.product_id);
        if (!target) {
          target = blankLine();
          f.items.push(target);
        }
        pick(target, p);
      }
    };

    const lines = computed(() => f.items.filter((i) => i.product_id && +i.qty > 0));
    const lineTotal = (i) => Math.round((+i.qty || 0) * (+i.price || 0));
    const total = computed(() => lines.value.reduce((a, i) => a + lineTotal(i), 0));
    const sup = computed(() => suppliers.value.find((s) => s.id === +f.supplier_id));
    const save = async () => {
      saving.value = true;
      try {
        const r = await post('/api/purchases', {
          supplier_id: f.supplier_id, date: f.date, note: f.note,
          items: lines.value.map((i) => ({ product_id: i.product_id, unit: i.unit, qty: i.qty, price: i.price, expires_at: i.expires_at || '' })),
          paid: f.paid ? { amount: f.paid, method: f.method } : null,
        });
        invalidateProducts();
        toast(t('Xarid saqlandi, tovar omborga kirim qilindi') + ': ' + r.number, 'ok');
        resetPage();
        go('/purchases/' + r.id);
      } finally { saving.value = false; }
    };
    const onSupSaved = async (id) => { newSup.value = false; await loadSup(); f.supplier_id = id; };
    return {
      suppliers, f, newSup, saving, pick, setUnit, lines, lineTotal, total, sup, save, onSupSaved, back,
      money, METHODS, METHOD_ICONS, expiry, scanModal, showNewProd, newProdBarcode, onBarcodeScanned, onNewProdSaved
    };
  },
  template: `
  <div>
    <div class="page-head"><a class="back" href="" @click.prevent="back('/purchases')">←</a><h1>{{ $t('Yangi xarid (kirim hujjati)') }}</h1></div>
    <form @submit.prevent="save">
      <div class="card mb">
        <div class="form-grid c3">
          <label class="f"><span>{{ $t('Yetkazib beruvchi') }} *</span>
            <div class="row" style="flex-wrap:nowrap"><select v-model="f.supplier_id" required style="flex:1;min-width:0"><option value="" disabled>{{ $t('Tanlang') }}</option><option v-for="s in suppliers" :key="s.id" :value="s.id">{{s.name}}</option></select>
            <button type="button" class="btn sm" v-if="$can('suppliers.edit')" @click="newSup=true" :title="$t('Yangi yetkazib beruvchi')">＋</button></div></label>
          <label class="f"><span>{{ $t('Sana') }}</span><input type="datetime-local" v-model="f.date"></label>
          <label class="f"><span>{{ $t('Izoh (hujjat raqami va h.k.)') }}</span><input v-model="f.note"></label>
        </div>
      </div>
      <div class="card mb">
        <div class="row mb" style="justify-content:space-between;align-items:center">
          <h2 style="margin:0">{{ $t('Mahsulotlar') }}</h2>
          <button type="button" class="btn sm" @click="scanModal=true">📷 {{ $t('Kamera / Skaner bilan qo‘shish') }}</button>
        </div>
        <div class="items-ed">
          <div class="it hdr pur"><div>{{ $t('Mahsulot') }}</div><div>{{ $t('Birlik') }}</div><div>{{ $t('Miqdor') }}</div><div>{{ $t('Kirim narxi') }}</div><div class="right">{{ $t('Summa') }}</div><div></div></div>
          <div class="it pur" v-for="(it,i) in f.items" :key="i">
            <div class="prod"><div class="mini-l">{{ $t('Mahsulot') }}</div><product-a-c :item="it" @pick="p => pick(it,p)"/></div>
            <div><div class="mini-l">{{ $t('Birlik') }}</div>
              <div class="unit-toggle" v-if="it.box_qty > 1"><button type="button" :class="{on:it.unit==='dona'}" @click="setUnit(it,'dona')">{{baseName({unit: it.unit_code})}}</button><button type="button" :class="{on:it.unit==='karobka'}" @click="setUnit(it,'karobka')">{{packName(it)}} ({{it.box_qty}})</button></div>
              <div v-else class="unit-fixed">{{baseName({unit: it.unit_code})}}</div></div>
            <div><div class="mini-l">{{ $t('Miqdor') }}</div><input type="number" min="0" step="any" v-model.number="it.qty" inputmode="decimal"></div>
            <div><div class="mini-l">{{ $t('Kirim narxi') }}</div><money-input v-model="it.price"/></div>
            <div class="tot">{{money(lineTotal(it))}}</div>
            <div><button type="button" class="btn ghost icon" v-if="f.items.length > 1" @click="f.items.splice(i,1)">✕</button></div>
            <div class="sub" v-if="expiry && it.product_id"><label>{{ $t('Yaroqlilik muddati') }}: <input type="date" v-model="it.expires_at" style="width:auto;display:inline-block"></label></div>
          </div>
        </div>
        <button type="button" class="btn mt" @click="f.items.push({product_id:null,name:'',unit:'dona',qty:1,price:'',box_qty:1,unit_code:'dona',pack_name:'karobka'})">＋ {{ $t("Qator qo'shish") }}</button>
      </div>
      <div class="card mb">
        <div class="form-grid c3">
          <div class="f"><span>{{ $t('Jami summa') }}</span><div class="calc-box" style="font-size:20px"><b>{{money(total)}}</b></div></div>
          <label class="f" v-if="$can('suppliers.pay')"><span>{{ $t("Hozir to'landi (ixtiyoriy)") }}</span><money-input v-model="f.paid"/></label>
          <div class="f chips" v-if="$can('suppliers.pay') && f.paid" style="align-self:end"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active:f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
        </div>
        <p class="small muted" v-if="sup && sup.debt">{{ $t('Bu yetkazib beruvchiga hozirgi qarzimiz') }}: {{money(sup.debt)}}</p>
      </div>
      <div class="row end"><button type="button" class="btn" @click="back('/purchases')">{{ $t('Bekor') }}</button><button class="btn primary" :disabled="saving || !f.supplier_id || !lines.length">💾 {{ $t('Saqlash va omborga kirim') }}</button></div>
    </form>
    <supplier-modal v-if="newSup" @close="newSup=false" @saved="onSupSaved"/>
    <barcode-scanner-modal v-if="scanModal" @code="onBarcodeScanned" @close="scanModal=false"/>
    <product-modal v-if="showNewProd" :product="{barcode: newProdBarcode}" @close="showNewProd=false" @saved="onNewProdSaved"/>
  </div>`,
};

export const PurchaseView = {
  setup() {
    const p = ref(null);
    const id = route.parts[1];
    const load = async () => { p.value = await get('/api/purchases/' + id); };
    onActivated(load);
    const cancel = async () => {
      if (!confirm(t('Xarid bekor qilinsinmi? Omborga kirgan tovar qaytarib chiqariladi.'))) return;
      await post(`/api/purchases/${id}/cancel`); invalidateProducts(); toast('Bekor qilindi', 'ok'); load();
    };
    return { p, cancel, money, dt, back, qtyFmt, METHODS };
  },
  template: `
  <div v-if="p">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/purchases')">←</a>
      <h1>{{ $t('Xarid') }} {{p.number}} <span class="badge gray" v-if="p.status!=='confirmed'">{{ $t('bekor qilingan') }}</span></h1>
      <button class="btn" onclick="window.print()">🖨 {{ $t('Chop etish') }}</button>
      <button class="btn red" v-if="$can('purchases.delete') && p.status==='confirmed'" @click="cancel">{{ $t('Bekor qilish') }}</button>
    </div>
    <div class="card mb print-area">
      <div class="grid c3">
        <div><div class="small muted">{{ $t('Yetkazib beruvchi') }}</div><a :href="'#/suppliers/' + p.supplier_id"><b>{{p.supplier_name}}</b></a><div class="small muted">{{p.supplier_phone}}</div></div>
        <div><div class="small muted">{{ $t('Sana') }}</div><b>{{dt(p.date)}}</b><div class="small muted" v-if="p.user_name">{{p.user_name}}</div></div>
        <div><div class="small muted">{{ $t("To'langan") }}</div><b>{{money(p.paid)}}</b> / {{money(p.total)}}</div>
      </div>
      <table class="t mt">
        <thead><tr><th>№</th><th style="width:48px">{{ $t('Rasm') }}</th><th>{{ $t('Mahsulot') }}</th><th class="num">{{ $t('Miqdor') }}</th><th class="num">{{ $t('Narxi') }}</th><th class="num">{{ $t('Summa') }}</th></tr></thead>
        <tbody><tr v-for="(i,k) in p.items" :key="i.id">
          <td>{{k+1}}</td>
          <td class="c" style="width:48px;padding:4px">
            <img v-if="i.image" :src="i.image" class="prod-thumb" loading="lazy" decoding="async" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px">
            <span v-else style="font-size:20px">📦</span>
          </td>
          <td><a :href="'#/products/' + i.product_id"><b>{{i.name}}</b></a></td>
          <td class="num">{{qtyFmt(i.qty)}} {{unitName(i, i.unit)}}<div class="small muted" v-if="i.unit==='karobka'">= {{qtyFmt(i.qty * i.box_qty)}} {{baseName(i)}}</div></td>
          <td class="num">{{money(Math.round(i.price))}}</td><td class="num bold">{{money(i.total)}}</td>
        </tr></tbody>
        <tfoot><tr><td colspan="5" class="right">{{ $t('Jami') }}:</td><td class="num"><b>{{money(p.total)}}</b></td></tr></tfoot>
      </table>
      <div class="small muted mt" v-if="p.note">{{ $t('Izoh') }}: {{p.note}}</div>
    </div>
  </div>`,
};

// ================= Yetkazib beruvchiga buyurtma (zakaz) =================
const PO_ST = { draft: ['qoralama', 'gray'], sent: ['yuborildi', 'blue'], received: ['qabul qilindi', 'green'], cancelled: ['bekor qilindi', 'gray'] };

export const PurchaseOrdersPage = {
  setup() {
    const rows = ref([]);
    const load = async () => { rows.value = await get('/api/purchase-orders'); };
    onActivated(load);
    return { rows, PO_ST, money, dt, go };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Buyurtmalar (zakaz)") }}</h1>
        <div class="small muted">{{ $t("Yetkazib beruvchilarga tovar buyurtma qilish va kirimga aylantirish") }}</div>
      </div>
      <div class="head-actions">
        <a class="btn primary" v-if="$can('purchases.create')" href="#/purchase-orders/new">＋ {{ $t("Yangi buyurtma") }}</a>
      </div>
    </div>
    <p class="small muted mb">{{ $t("Yetkazib beruvchiga buyurtma: kam qolgan tovarlardan avtomatik to'ldiriladi, chop etib yuboriladi. Tovar kelganda «Qabul qilish» — xarid hujjati va omborga kirim o'zi yaratiladi.") }}</p>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Buyurtma") }}</th><th>{{ $t("Yetkazib beruvchi") }}</th><th class="num">{{ $t("Summa") }}</th><th>{{ $t("Holati") }}</th></tr></thead>
        <tbody><tr v-for="o in rows" :key="o.id" class="click" @click="go('/purchase-orders/'+o.id)">
          <td class="main-cell"><a :href="'#/purchase-orders/'+o.id"><b>{{o.number}}</b></a><div class="small muted">🕒 {{dt(o.date)}} · 📦 {{o.items_n}} {{ $t("ta mahsulot") }}</div></td>
          <td :data-l="$t('Yetkazib beruvchi')">🚚 {{o.supplier_name}}</td>
          <td :data-l="$t('Summa')" class="num bold">{{money(Math.round(o.total))}}</td>
          <td :data-l="$t('Holati')"><span class="badge" :class="PO_ST[o.status][1]">{{ $t(PO_ST[o.status][0]) }}</span><div class="small muted" v-if="o.purchase_number">→ {{o.purchase_number}}</div></td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Buyurtma yo'q") }}</div>
    </div>
  </div>`,
};

export const PurchaseOrderForm = {
  components: { ProductAC },
  setup() {
    const suppliers = ref([]);
    const f = reactive({ supplier_id: route.query.supplier ? +route.query.supplier : '', note: '', items: [blankLine()] });
    const saving = ref(false);
    onActivated(async () => { suppliers.value = await get('/api/suppliers'); });
    const pick = (it, p) => {
      Object.assign(it, { product_id: p.id, name: p.name, box_qty: p.box_qty, unit_code: p.unit, pack_name: p.pack_name });
      it.unit = p.box_qty > 1 ? 'karobka' : 'dona';
      it.price = p.cost_price ? Math.round(it.unit === 'karobka' ? p.cost_price * p.box_qty : p.cost_price) : '';
      if (f.items[f.items.length - 1] === it) f.items.push(blankLine());
    };
    const fillLow = async () => {
      const s = await get('/api/purchase-orders/suggest');
      if (!s.length) return toast("Kam qolgan tovar yo'q (mahsulotlarda minimal qoldiq belgilang)");
      const have = new Set(f.items.filter((i) => i.product_id).map((i) => i.product_id));
      f.items = [...f.items.filter((i) => i.product_id), ...s.filter((x) => !have.has(x.product_id)), blankLine()];
      toast(t('Kam qolgan tovarlar qo\'shildi') + ': ' + s.length, 'ok');
    };
    const lines = computed(() => f.items.filter((i) => i.product_id && +i.qty > 0));
    const total = computed(() => lines.value.reduce((a, i) => a + Math.round((+i.qty || 0) * (+i.price || 0)), 0));
    const save = async () => {
      saving.value = true;
      try {
        const r = await post('/api/purchase-orders', { supplier_id: f.supplier_id, note: f.note, items: lines.value.map((i) => ({ product_id: i.product_id, unit: i.unit, qty: i.qty, price: i.price })) });
        toast(t('Buyurtma yaratildi') + ': ' + r.number, 'ok'); resetPage(); go('/purchase-orders/' + r.id);
      } finally { saving.value = false; }
    };
    return { suppliers, f, saving, pick, fillLow, lines, total, save, back, money };
  },
  template: `
  <div>
    <div class="page-head"><a class="back" href="" @click.prevent="back('/purchase-orders')">←</a><h1>{{ $t('Yangi buyurtma (zakaz)') }}</h1>
      <button class="btn" @click="fillLow">⚠ {{ $t("Kam qolganlardan to'ldirish") }}</button></div>
    <form @submit.prevent="save">
      <div class="card mb form-grid">
        <label class="f"><span>{{ $t('Yetkazib beruvchi') }} *</span><select v-model="f.supplier_id" required><option value="" disabled>{{ $t('Tanlang') }}</option><option v-for="s in suppliers" :key="s.id" :value="s.id">{{s.name}}</option></select></label>
        <label class="f"><span>{{ $t('Izoh') }}</span><input v-model="f.note" :placeholder="$t('Yetkazish sanasi, shartlar ...')"></label>
      </div>
      <div class="card mb">
        <div class="items-ed">
          <div class="it hdr pur"><div>{{ $t('Mahsulot') }}</div><div>{{ $t('Birlik') }}</div><div>{{ $t('Miqdor') }}</div><div>{{ $t('Kutilgan narx') }}</div><div class="right">{{ $t('Summa') }}</div><div></div></div>
          <div class="it pur" v-for="(it,i) in f.items" :key="i">
            <div class="prod"><div class="mini-l">{{ $t('Mahsulot') }}</div><product-a-c :item="it" @pick="p => pick(it,p)"/>
              <div class="small muted" v-if="it.min_stock">{{ $t('qoldiq') }} {{it.stock}} / min {{it.min_stock}}</div></div>
            <div><div class="mini-l">{{ $t('Birlik') }}</div>
              <div class="unit-toggle" v-if="it.box_qty > 1"><button type="button" :class="{on:it.unit==='dona'}" @click="it.unit='dona'">{{baseName({unit: it.unit_code})}}</button><button type="button" :class="{on:it.unit==='karobka'}" @click="it.unit='karobka'">{{packName(it)}} ({{it.box_qty}})</button></div>
              <div v-else class="unit-fixed">{{baseName({unit: it.unit_code})}}</div></div>
            <div><div class="mini-l">{{ $t('Miqdor') }}</div><input type="number" min="0" step="any" v-model.number="it.qty"></div>
            <div><div class="mini-l">{{ $t('Kutilgan narx') }}</div><money-input v-model="it.price"/></div>
            <div class="tot">{{money(Math.round((+it.qty || 0) * (+it.price || 0)))}}</div>
            <div><button type="button" class="btn ghost icon" v-if="f.items.length > 1" @click="f.items.splice(i,1)">✕</button></div>
          </div>
        </div>
        <div class="row mt"><b>{{ $t('Jami') }}: {{money(total)}}</b></div>
      </div>
      <div class="row end"><button type="button" class="btn" @click="back('/purchase-orders')">{{ $t('Bekor') }}</button><button class="btn primary" :disabled="saving || !f.supplier_id || !lines.length">💾 {{ $t('Saqlash') }}</button></div>
    </form>
  </div>`,
};

export const PurchaseOrderView = {
  setup() {
    const o = ref(null);
    const id = route.parts[1];
    const load = async () => { o.value = await get('/api/purchase-orders/' + id); };
    onActivated(load);
    const setStatus = async (status) => {
      if (status === 'cancelled' && !confirm(t('Buyurtma bekor qilinsinmi?'))) return;
      await post(`/api/purchase-orders/${id}/status`, { status }); load();
    };
    const receive = async () => {
      if (!confirm(t('Tovar keldimi? Pastdagi miqdor va narxlar bilan xarid hujjati yaratiladi va omborga kirim qilinadi.'))) return;
      const r = await post(`/api/purchase-orders/${id}/receive`, { items: o.value.items.map((i) => ({ product_id: i.product_id, unit: i.unit, qty: i.qty, price: i.price })) });
      invalidateProducts(); toast(t('Qabul qilindi') + ' → ' + r.number, 'ok'); go('/purchases/' + r.id);
    };
    const total = () => (o.value ? o.value.items.reduce((a, i) => a + Math.round((+i.qty || 0) * (+i.price || 0)), 0) : 0);
    const open = () => o.value && ['draft', 'sent'].includes(o.value.status);
    return { o, setStatus, receive, total, open, PO_ST, money, dt, back, qtyFmt };
  },
  template: `
  <div v-if="o">
    <div class="page-head no-print">
      <a class="back" href="" @click.prevent="back('/purchase-orders')">←</a>
      <h1>{{ $t('Buyurtma') }} {{o.number}} <span class="badge" :class="PO_ST[o.status][1]">{{ $t(PO_ST[o.status][0]) }}</span></h1>
      <button class="btn" onclick="window.print()">🖨 {{ $t('Chop etish') }}</button>
      <button class="btn" v-if="o.status==='draft'" @click="setStatus('sent')">📤 {{ $t('Yuborildi deb belgilash') }}</button>
      <button class="btn green" v-if="open() && $can('purchases.create')" @click="receive">📦 {{ $t('Tovar keldi — qabul qilish') }}</button>
      <button class="btn red" v-if="open()" @click="setStatus('cancelled')">{{ $t('Bekor qilish') }}</button>
    </div>
    <div class="card print-area">
      <h2>{{ $t('Buyurtma (zakaz)') }} № {{o.number}}</h2>
      <div class="grid c3 mb">
        <div><div class="small muted">{{ $t('Yetkazib beruvchi') }}</div><b>{{o.supplier_name}}</b><div class="small muted">{{o.supplier_contact}} {{o.supplier_phone}}</div></div>
        <div><div class="small muted">{{ $t('Sana') }}</div><b>{{dt(o.date)}}</b></div>
        <div v-if="o.purchase_number"><div class="small muted">{{ $t('Xarid') }}</div><a :href="'#/purchases/' + o.purchase_id"><b>{{o.purchase_number}}</b></a></div>
      </div>
      <table class="t">
        <thead><tr><th>№</th><th>{{ $t('Mahsulot') }}</th><th class="num">{{ $t('Miqdor') }}</th><th class="num">{{ $t('Narxi') }}</th><th class="num">{{ $t('Summa') }}</th></tr></thead>
        <tbody><tr v-for="(i,k) in o.items" :key="i.id"><td>{{k+1}}</td><td>{{i.name}}</td>
          <td class="num"><input v-if="open()" class="no-print-input" type="number" min="0" step="any" v-model.number="i.qty" style="width:90px;text-align:right"><span :class="{'print-only': open()}">{{qtyFmt(i.qty)}}</span> {{unitName(i, i.unit)}}</td>
          <td class="num"><money-input v-if="open()" v-model="i.price" style="width:120px"/><span :class="{'print-only': open()}">{{money(Math.round(i.price))}}</span></td>
          <td class="num bold">{{money(Math.round((+i.qty || 0) * (+i.price || 0)))}}</td></tr></tbody>
        <tfoot><tr><td colspan="4" class="right">{{ $t('Jami') }}:</td><td class="num"><b>{{money(total())}}</b></td></tr></tfoot>
      </table>
      <div class="small muted mt" v-if="o.note">{{ $t('Izoh') }}: {{o.note}}</div>
    </div>
  </div>`,
};
