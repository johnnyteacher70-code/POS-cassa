import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue';
import { get, post, put, money, qtyFmt, dt, clientName, debounce, METHODS, METHOD_ICONS, nowLocal, toInputDt, toast, balanceInfo, session, t } from './lib.js';
import { boxOnly, stockLabel, trackStock } from './docs.js';
import { startCamera, decodeBarcodeFromImage, beep } from './hardware.js';

// ---------- Modal ----------
export const Modal = {
  props: { title: String, wide: Boolean },
  emits: ['close'],
  setup(_p, { emit }) {
    const onKey = (e) => { if (e.key === 'Escape') emit('close'); };
    const on = () => { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; };
    const off = () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    onMounted(on); onActivated(on);
    onBeforeUnmount(off); onDeactivated(off);
    return {};
  },
  template: `
  <div class="modal-bg" @mousedown.self="$emit('close')">
    <div class="modal" :class="{wide}">
      <div class="mh"><h2>{{title}}</h2><button class="btn ghost icon" @click="$emit('close')">✕</button></div>
      <div class="mb"><slot/></div>
      <div class="mf" v-if="$slots.footer"><slot name="footer"/></div>
    </div>
  </div>`,
};

// ---------- Summa kiritish (bo'sh joy bilan formatlanadi) ----------
export const MoneyInput = {
  props: { modelValue: [Number, String], placeholder: String, autofocus: Boolean },
  emits: ['update:modelValue', 'enter'],
  setup(props, { emit }) {
    const el = ref(null);
    const text = ref('');
    const fmt = (v) => (v === '' || v === null || v === undefined ? '' : String(Math.round(+v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
    watch(() => props.modelValue, (v) => {
      if (Number(String(text.value).replace(/\s/g, '')) !== Number(v) || text.value === '') text.value = fmt(v);
    }, { immediate: true });
    const onInput = (e) => {
      const digits = e.target.value.replace(/\D/g, '');
      text.value = fmt(digits === '' ? '' : digits);
      emit('update:modelValue', digits === '' ? '' : Number(digits));
    };
    onMounted(() => { if (props.autofocus) nextTick(() => el.value && el.value.focus()); });
    return { el, text, onInput };
  },
  template: `<input ref="el" inputmode="numeric" :value="text" @input="onInput" :placeholder="placeholder || '0'" @keydown.enter="$emit('enter')" autocomplete="off">`,
};

// ---------- Mijoz tanlash (qidiruv bilan) ----------
export const ClientPicker = {
  props: { modelValue: [Number, String, null], initialName: String, allowCreate: { type: Boolean, default: true }, quick: Boolean },
  emits: ['update:modelValue', 'picked', 'query'],
  components: { },
  setup(props, { emit }) {
    const q = ref('');
    const list = ref([]);
    const open = ref(false);
    const hl = ref(0);
    const selected = ref(null);
    const showCreate = ref(false);

    let resultQ = null;
    const fetchNow = async () => {
      const qq = q.value;
      const r = await get('/api/clients?limit=12&q=' + encodeURIComponent(qq), { silent: true, latest: 'client-picker' });
      list.value = r.rows;
      hl.value = 0;
      resultQ = qq;
      autoPhone(qq);
      autoOther(qq);
    };
    // Boshqa uzunlikdagi raqam (masalan xorijiy, 11 raqam): yozish to'xtagach (1.2 s) va bazada topilmasa — o'zi yaratiladi
    let otherT = null;
    const autoOther = (qq) => {
      clearTimeout(otherT);
      const t = String(qq || '').trim();
      if (!props.quick || fullPhone(t) || !/^[+\d\s()\-.]+$/.test(t) || t.replace(/\D/g, '').length < 7) return;
      otherT = setTimeout(() => { if (q.value === qq && !list.value.length && !autoBusy) quickCreate(); }, 1200);
    };
    // POS: to'liq telefon raqami yozilsa — bazada bo'lsa o'zi tanlanadi, bo'lmasa o'zi yaratiladi (tugma bosish shart emas)
    const fullPhone = (t) => {
      t = String(t || '').trim();
      if (!/^[+\d\s()\-.]+$/.test(t)) return null;
      let d = t.replace(/\D/g, '');
      if (d.length > 9 && d.startsWith('998')) d = d.slice(-9);
      return d.length === 9 ? '+998' + d : null;
    };
    let autoBusy = false;
    const autoPhone = async (qq) => {
      const ph = props.quick && fullPhone(qq);
      if (!ph || autoBusy || q.value !== qq) return;
      const exact = list.value.find((c) => c.phone === ph || c.phone2 === ph);
      if (exact) return pick(exact);
      autoBusy = true;
      try { await quickCreate(); } finally { autoBusy = false; }
    };
    const load = debounce(fetchNow, 200);

    watch(() => props.modelValue, async (id) => {
      if (!id) { selected.value = null; return; }
      if (selected.value && selected.value.id === +id) return;
      try { selected.value = (await get('/api/clients/' + id + '?brief=1', { silent: true })).client; } catch { selected.value = null; }
    }, { immediate: true });

    const pick = (c) => {
      selected.value = c;
      open.value = false;
      q.value = '';
      emit('update:modelValue', c.id);
      emit('picked', c);
    };
    const clear = () => { selected.value = null; emit('update:modelValue', null); emit('picked', null); };
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { hl.value = Math.min(hl.value + 1, list.value.length - 1); e.preventDefault(); }
      if (e.key === 'ArrowUp') { hl.value = Math.max(hl.value - 1, 0); e.preventDefault(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        // Natija hali kelmagan bo'lsa — kutib, keyin birinchisini tanlaymiz
        // Topilmasa va "tez yaratish" yoqilgan bo'lsa — yozilgan raqam / ism bilan yangi mijoz
        const go = () => { if (list.value[hl.value]) pick(list.value[hl.value]); else if (props.quick && q.value.trim()) quickCreate(); };
        if (resultQ !== q.value) fetchNow().then(go); else go();
      }
    };
    const onFocus = () => { open.value = true; load(); };
    watch(q, (v) => emit('query', v));
    // Telefon ko'rinishi: istalgan yozuvdan +998 XX XXX XX XX (9 raqam bo'lsa)
    const quickLabel = computed(() => {
      const t = q.value.trim();
      if (!/^[+\d\s()\-.]+$/.test(t)) return t;
      let d = t.replace(/\D/g, '');
      if (d.length > 9 && d.startsWith('998')) d = d.slice(-9);
      return d.length === 9 ? `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : t;
    });
    const quickCreate = async () => {
      const r = await post('/api/clients/quick', { query: q.value });
      if (r.created) toast(`Yangi mijoz yaratildi: ${clientName(r.client)}`, 'ok');
      pick(r.client);
    };
    const onBlur = () => setTimeout(() => { open.value = false; }, 180);
    const created = async (id) => {
      showCreate.value = false;
      const c = (await get('/api/clients/' + id + '?brief=1')).client;
      pick(c);
    };
    return { q, list, open, hl, selected, load, pick, clear, onKey, onFocus, onBlur, money, clientName, balanceInfo, showCreate, created, quickLabel, quickCreate, fullPhone };
  },
  template: `
  <div>
    <div v-if="selected" class="row" style="border:1px solid var(--border);border-radius:8px;padding:7px 10px;background:var(--surface-2)">
      <div style="flex:1;min-width:0">
        <div class="bold">{{clientName(selected)}}</div>
        <div class="small muted">{{selected.contact_name && selected.company_name ? selected.contact_name + ' · ' : ''}}{{selected.phone}}
          · <span :class="balanceInfo(selected.balance).cls">{{money(selected.balance)}}</span></div>
      </div>
      <button type="button" class="btn sm ghost" @click="clear">{{ $t("O'zgartirish") }}</button>
    </div>
    <div v-else class="ac">
      <input v-model="q" @input="open=true; load()" @focus="onFocus" @blur="onBlur" @keydown="onKey"
        :placeholder="$t('Mijoz: nomi, telefon, INN...')" autocomplete="off">
      <div class="ac-list" v-if="open && (list.length || allowCreate || (quick && q.trim()))">
        <div v-if="quick && q.trim() && !list.length && !fullPhone(q)" class="ac-item hl" style="color:var(--primary);font-weight:600" @mousedown.prevent="quickCreate">＋ {{ $t('Yangi mijoz') }}: {{quickLabel}} <span class="small muted" style="margin-left:auto">Enter</span></div>
        <div v-for="(c,i) in list" :key="c.id" class="ac-item" :class="{hl: i===hl}" @mousedown.prevent="pick(c)">
          <div style="flex:1;min-width:0">
            <div>{{clientName(c)}} <span class="badge gray" v-if="c.type==='b2c'">{{ $t('B2C') }}</span></div>
            <div class="sub">{{c.contact_name && c.company_name ? c.contact_name+' · ' : ''}}{{c.phone}}{{c.inn ? $t(' · INN ')+c.inn : ''}}</div>
          </div>
          <div class="small nowrap" :class="balanceInfo(c.balance).cls">{{money(c.balance)}}</div>
        </div>
        <div v-if="allowCreate" class="ac-item" style="color:var(--primary)" @mousedown.prevent="showCreate=true">＋ {{ $t("Yangi mijoz qo'shish") }}</div>
      </div>
    </div>
    <client-modal v-if="showCreate" :initial="{company_name: q}" @close="showCreate=false" @saved="created"/>
  </div>`,
};

// ---------- Mijoz qo'shish / tahrirlash ----------
export const ClientModal = {
  components: { Modal, MoneyInput },
  props: { client: Object, initial: Object },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const f = reactive({
      type: 'b2b', company_name: '', inn: '', contact_name: '', phone: '', phone2: '', account_no: '', bank: '', mfo: '',
      address: '', note: '', opening_balance: '', opening_dir: 'debt', price_level_id: '',
      register_id: props.client ? (props.client.register_id ? String(props.client.register_id) : '') : (session.user && session.user.register_id ? String(session.user.register_id) : ''),
      ...(props.initial || {}), ...(props.client || {}),
    });
    if (f.price_level_id === null) f.price_level_id = '';
    const levels = ref([]);
    get('/api/price-levels', { silent: true }).then((l) => { levels.value = l; }).catch(() => {});
    const saving = ref(false);
    const save = async () => {
      saving.value = true;
      try {
        const body = { ...f };
        if (!props.client && f.opening_balance) body.opening_balance = f.opening_dir === 'debt' ? -f.opening_balance : +f.opening_balance;
        else delete body.opening_balance;
        const r = props.client ? await put('/api/clients/' + props.client.id, body) : await post('/api/clients', body);
        for (const w of r.warnings || []) toast('⚠️ ' + w);
        toast(props.client ? 'Saqlandi' : "Mijoz qo'shildi", 'ok');
        emit('saved', props.client ? props.client.id : r.id);
      } finally { saving.value = false; }
    };
    return { f, save, saving, levels };
  },
  template: `
  <modal :title="client ? $t('Mijozni tahrirlash') : $t('Yangi mijoz')" @close="$emit('close')">
    <form @submit.prevent="save" id="client-form" class="form-grid">
      <div class="full chips">
        <button type="button" class="chip" :class="{active:f.type==='b2b'}" @click="f.type='b2b'">{{ $t('B2B (kompaniya)') }}</button>
        <button type="button" class="chip" :class="{active:f.type==='b2c'}" @click="f.type='b2c'">{{ $t('B2C (jismoniy shaxs)') }}</button>
      </div>
      <label class="f full" v-if="f.type==='b2b'"><span>{{ $t('Kompaniya nomi') }} *</span><input v-model="f.company_name" autofocus></label>
      <label class="f" v-if="f.type==='b2b'"><span>{{ $t('INN') }}</span><input v-model="f.inn" inputmode="numeric" maxlength="14"></label>
      <label class="f" :class="{full: f.type!=='b2b'}"><span>{{f.type==='b2b' ? $t("Mas'ul shaxs (ism familiya)") : $t('Ism familiya *')}}</span><input v-model="f.contact_name"></label>
      <label class="f"><span>{{ $t('Telefon') }}</span><input v-model="f.phone" inputmode="tel" placeholder="+998 90 123 45 67"></label>
      <label class="f"><span>{{ $t("Qo'shimcha telefon") }}</span><input v-model="f.phone2" inputmode="tel"></label>
      <template v-if="f.type==='b2b'">
        <label class="f"><span>{{ $t('Hisob raqami (h/r)') }}</span><input v-model="f.account_no" inputmode="numeric"></label>
        <label class="f"><span>{{ $t('Bank') }}</span><input v-model="f.bank"></label>
        <label class="f"><span>{{ $t('MFO') }}</span><input v-model="f.mfo" inputmode="numeric"></label>
      </template>
      <label class="f" :class="{full: f.type!=='b2b'}"><span>{{ $t('Manzil') }}</span><input v-model="f.address"></label>
      <label class="f full" v-if="levels.length"><span>{{ $t('Narx turi') }}</span>
        <select v-model="f.price_level_id"><option value="">{{ $t('Asosiy narx') }}</option><option v-for="l in levels" :key="l.id" :value="l.id">{{ $t(l.name) }}</option></select></label>
      <label class="f full"><span>{{ $t("Tegishli do'kon") }}</span>
        <register-select v-model="f.register_id" placeholder="Barcha do'konlar uchun umumiy"/></label>
      <label class="f full"><span>{{ $t('Izoh') }}</span><textarea v-model="f.note" rows="2"></textarea></label>
      <div class="full" v-if="!client && $can('clients.edit')">
        <label class="f"><span>{{ $t("Boshlang'ich qoldiq (ixtiyoriy — eski hisobdan o'tkazish)") }}</span></label>
        <div class="row">
          <select v-model="f.opening_dir" style="width:auto">
            <option value="debt">{{ $t('Mijoz bizga qarzdor') }}</option>
            <option value="advance">{{ $t('Mijozning avansi bor') }}</option>
          </select>
          <money-input v-model="f.opening_balance" style="flex:1"/>
        </div>
      </div>
    </form>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button>
      <button class="btn primary" form="client-form" :disabled="saving">{{ $t('Saqlash') }}</button>
    </template>
  </modal>`,
};

// ---------- Mahsulotlar keshi ----------
const productStore = reactive({ list: [], loaded: false, loading: null });
export async function loadProducts(force = false) {
  if (productStore.loaded && !force) return productStore.list;
  productStore.loading ||= get('/api/products').then((r) => { productStore.list = r; productStore.loaded = true; productStore.loading = null; return r; });
  return productStore.loading;
}
export function invalidateProducts() { productStore.loaded = false; }

export const ProductAC = {
  props: { item: Object },
  emits: ['pick'],
  setup(props, { emit }) {
    const open = ref(false);
    const hl = ref(0);
    const norm = (s) => String(s || '').toLowerCase();
    const filtered = computed(() => {
      const t = norm(props.item.name).split(/\s+/).filter(Boolean);
      return productStore.list.filter((p) => p.active)
        .filter((p) => !t.length || t.every((x) => norm(`${p.name} ${p.category || ''} ${p.brand} ${p.volume} ${p.sku} ${p.barcode || ''}`).includes(x)))
        .slice(0, 15);
    });
    const pick = (p) => { open.value = false; emit('pick', p); };
    const onKey = (e) => {
      if (!open.value) return;
      if (e.key === 'ArrowDown') { hl.value = Math.min(hl.value + 1, filtered.value.length - 1); e.preventDefault(); }
      if (e.key === 'ArrowUp') { hl.value = Math.max(hl.value - 1, 0); e.preventDefault(); }
      if (e.key === 'Enter' && filtered.value[hl.value]) { pick(filtered.value[hl.value]); e.preventDefault(); }
    };
    onMounted(() => loadProducts());
    return { open, hl, filtered, pick, onKey, money, boxOnly, stockLabel, trackStock, onBlur: () => setTimeout(() => (open.value = false), 180) };
  },
  template: `
  <div class="ac">
    <input v-model="item.name" @focus="open=true" @input="open=true; hl=0; item.product_id=null" @blur="onBlur" @keydown="onKey" :placeholder="$t('Mahsulot nomi...')" autocomplete="off">
    <div class="ac-list" v-if="open && filtered.length">
      <div v-for="(p,i) in filtered" :key="p.id" class="ac-item" :class="{hl:i===hl}" @mousedown.prevent="pick(p)">
        <img v-if="p.image" :src="p.image" class="prod-thumb" loading="lazy" decoding="async" style="width:32px;height:32px"><span v-else class="prod-thumb" style="width:32px;height:32px">📦</span>
        <div style="flex:1;min-width:0">
          <div>{{p.name}} <span class="muted">{{p.volume}}</span></div>
          <div class="sub" v-if="boxOnly()">{{packName(p)}} ({{p.box_qty}} {{baseName(p)}}): {{money(p.box_price)}}</div>
          <div class="sub" v-else>{{baseName(p)}}: {{money(p.piece_price)}}<template v-if="p.box_qty > 1"> · {{packName(p)}} ({{p.box_qty}} {{baseName(p)}}): {{money(p.box_price)}}</template></div>
        </div>
        <span v-if="trackStock()" class="small nowrap" :class="p.stock>0 ? 'pos' : 'neg'">{{stockLabel(p.stock, p.box_qty, p)}}</span>
      </div>
    </div>
  </div>`,
};

// ---------- Pozitsiyalar muharriri (dona / karobka) ----------
export function newItem() {
  return { product_id: null, name: '', color: '', sku: '', unit: 'karobka', qty: 1, box_qty: 1, piece_price: 0, box_price: 0, price: 0 };
}
export const ItemsEditor = {
  components: { ProductAC, MoneyInput },
  // levelId: mijozning narx turi (tanlangan mahsulot narxi shu turdan olinadi)
  props: { items: Array, levelId: [Number, String] },
  setup(props) {
    const setUnit = (it, u) => {
      it.unit = u;
      it.price = u === 'karobka' ? it.box_price : it.piece_price;
    };
    const pick = (it, p) => {
      if (trackStock() && (p.stock || 0) <= 0) {
        toast(`«${p.name}» omborda tugagan (qoldiq: 0)`, 'error');
      }
      it.product_id = p.id;
      it.name = [p.name, p.volume, p.size].filter(Boolean).join(' ');
      it.color = '';
      it.sku = p.sku || p.barcode || '';
      it.box_qty = p.box_qty;
      const lp = props.levelId && p.prices && p.prices[props.levelId];
      it.piece_price = lp && lp[0] > 0 ? lp[0] : p.piece_price;
      it.box_price = lp && lp[0] > 0 ? (lp[1] || lp[0] * p.box_qty) : p.box_price;
      if (p.box_qty <= 1) it.unit = 'dona';
      it.price = it.unit === 'karobka' ? it.box_price : it.piece_price;
    };
    const lineTotal = (it) => Math.round((+it.qty || 0) * (+it.price || 0));
    const pieces = (it) => (it.unit === 'karobka' ? (+it.qty || 0) * (+it.box_qty || 1) : +it.qty || 0);
    const add = () => props.items.push(newItem());
    const remove = (i) => props.items.splice(i, 1);
    const onPrice = (it, v) => {
      it.price = v;
      if (it.unit === 'karobka') it.box_price = v; else it.piece_price = v;
    };
    // Mahsulot ranglari (mahsulotlar ro'yxatidan)
    const prodOf = (it) => (it.product_id && productStore.list.find((x) => x.id === it.product_id)) || null;
    const colorsFor = (it) => { const p = prodOf(it); return (p && p.colors) || []; };
    // Birlik nomlari: mahsulotniki, mahsulot topilmasa — hujjatda saqlangani
    const un = (it) => { const p = prodOf(it); return p ? { unit: p.unit, pack_name: p.pack_name } : it; };
    onMounted(() => loadProducts());
    return { setUnit, pick, lineTotal, pieces, add, remove, money, qtyFmt, onPrice, boxOnly, colorsFor, un };
  },
  template: `
  <div class="items-ed">
    <div class="it hdr"><div>{{ $t('Mahsulot') }}</div><div>{{ $t('Birlik') }}</div><div>{{ $t('Miqdor') }}</div><div>{{ $t('Qadoqda') }}</div><div>{{ $t('Narx (birlik)') }}</div><div class="right">{{ $t('Summa') }}</div><div></div></div>
    <div class="it" v-for="(it,i) in items" :key="i">
      <div class="prod"><div class="mini-l">{{ $t('Mahsulot') }}</div><product-a-c :item="it" @pick="p => pick(it,p)"/>
        <select v-if="colorsFor(it).length || it.color" v-model="it.color" class="color-sel" :class="{need: !it.color}">
          <option value="">🎨 {{ $t('Assortiment / Rangni tanlang') }}</option>
          <option v-for="c in (colorsFor(it).includes(it.color) || !it.color ? colorsFor(it) : [it.color, ...colorsFor(it)])" :key="c" :value="c">{{c}}</option>
        </select></div>
      <div><div class="mini-l">{{ $t('Birlik') }}</div>
        <div v-if="boxOnly() && it.unit==='karobka'" class="unit-fixed">{{packName(un(it))}}</div>
        <div v-else class="unit-toggle"><button type="button" :class="{on:it.unit==='dona'}" @click="setUnit(it,'dona')">{{baseName(un(it))}}</button><button type="button" :class="{on:it.unit==='karobka'}" @click="setUnit(it,'karobka')">{{packName(un(it))}}</button></div>
      </div>
      <div><div class="mini-l">{{ $t('Miqdor') }}</div><input type="number" min="0" step="any" v-model.number="it.qty" inputmode="decimal"></div>
      <div><div class="mini-l">{{ $t('Qadoqda') }} ({{baseName(un(it))}})</div><input type="number" min="1" v-model.number="it.box_qty" :disabled="it.unit!=='karobka'" inputmode="numeric"></div>
      <div><div class="mini-l">{{ $t('Narx') }} ({{unitName(un(it), it.unit)}})</div><money-input :model-value="it.price" @update:model-value="v => onPrice(it,v)"/></div>
      <div class="tot">{{money(lineTotal(it))}}</div>
      <div><button type="button" class="btn ghost icon" :title="$t(&quot;O'chirish&quot;)" @click="remove(i)">✕</button></div>
      <div class="sub" v-if="it.name">
        {{ $t('Jami') }} {{qtyFmt(pieces(it))}} {{baseName(un(it))}}
        <template v-if="it.piece_price && !boxOnly()"> · {{baseName(un(it))}}: {{money(it.piece_price)}}</template>
        <template v-if="it.box_price && it.box_qty > 1"> · {{packName(un(it))}}: {{money(it.box_price)}}</template>
      </div>
    </div>
    <button type="button" class="btn mt" @click="add">＋ {{ $t("Mahsulot qo'shish") }}</button>
  </div>`,
};

// ---------- To'lov (kirim / chiqim) ----------
export const PaymentModal = {
  components: { Modal, MoneyInput, ClientPicker },
  props: { payment: Object, clientId: [Number, String], saleId: [Number, String], direction: String, amount: Number, registerId: [Number, String] },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const p = props.payment;
    const f = reactive({
      register_id: String((p && p.register_id) || props.registerId || (session.user && session.user.register_id) || ''),
      client_id: p ? p.client_id : props.clientId || null,
      direction: p ? p.direction : props.direction || 'in',
      method: p ? p.method : 'cash',
      amount: p ? p.amount : props.amount || '',
      date: p ? toInputDt(p.date) : nowLocal(),
      sale_id: p ? p.sale_id || '' : props.saleId || '',
      note: p ? p.note : '',
    });
    const openSales = ref([]);
    const client = ref(null);
    const saving = ref(false);
    const result = ref(null);

    watch(() => f.client_id, async (id, oldId) => {
      openSales.value = [];
      client.value = null;
      if (oldId !== undefined && oldId !== id) f.sale_id = '';   // mijoz almashsa — eski sotuv tanlovi tozalanadi
      if (!id) return;
      const r = await get(`/api/clients/${id}?brief=1&sale_id=${+f.sale_id || 0}`, { silent: true });
      client.value = r.client;
      openSales.value = r.open_sales;
    }, { immediate: true });

    const save = async () => {
      saving.value = true;
      try {
        const body = { ...f, sale_id: f.direction === 'in' ? f.sale_id || null : null };
        const r = p ? await put('/api/payments/' + p.id, body) : await post('/api/payments', body);
        result.value = r;
        emit('saved', r);
        let msg = p ? "To'lov yangilandi" : f.direction === 'in' ? `Kirim qabul qilindi: ${money(f.amount)} so'm` : `Chiqim: ${money(f.amount)} so'm`;
        if (r.allocations && r.allocations.length) msg += '\nYopildi: ' + r.allocations.map((a) => `${a.number} — ${money(a.amount)}`).join(', ');
        if (r.unallocated) msg += `\nAvans sifatida qoldi: ${money(r.unallocated)}`;
        msg += `\nMijoz balansi: ${money(r.balance_after)}`;
        toast(msg, 'ok', { duration: 7000 });
        emit('close');
      } finally { saving.value = false; }
    };
    return { f, openSales, client, save, saving, money, dt, METHODS, METHOD_ICONS, balanceInfo, result };
  },
  template: `
  <modal :title="payment ? $t(&quot;To'lovni tahrirlash&quot;) : (f.direction==='in' ? $t('Kirim (mijozdan pul)') : $t('Chiqim (mijozga qaytarish)'))" @close="$emit('close')">
    <form id="pay-form" @submit.prevent="save" class="form-grid">
      <div class="full chips">
        <button type="button" class="chip" :class="{active:f.direction==='in'}" @click="f.direction='in'">⬇ {{ $t("Kirim (mijoz to'ladi)") }}</button>
        <button type="button" class="chip" :class="{active:f.direction==='out'}" @click="f.direction='out'">⬆ {{ $t("Chiqim (pul qaytarildi)") }}</button>
      </div>
      <label class="f full"><span>{{ $t("Mijoz") }} *</span><client-picker v-model="f.client_id"/></label>
      <div class="full result-box" v-if="client">
        <div class="tr"><span>{{ $t("Hozirgi balans") }}</span><b :class="balanceInfo(client.balance).cls">{{money(client.balance)}} {{ $t("so'm") }}</b></div>
        <div class="small muted">{{balanceInfo(client.balance).text}}</div>
      </div>
      <div class="full">
        <span class="small muted" style="display:block;margin-bottom:4px;font-weight:500">{{ $t("To'lov turi") }}</span>
        <div class="chips">
          <button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active:f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button>
        </div>
      </div>
      <label class="f"><span>{{ $t("Summa (so'm)") }} *</span><money-input v-model="f.amount" autofocus/></label>
      <label class="f"><span>{{ $t("Sana") }}</span><input type="datetime-local" v-model="f.date"></label>
      <label class="f full" v-if="f.direction==='in'">
        <span>{{ $t("Qaysi sotuv uchun? (mijoz aytsa)") }}</span>
        <select v-model="f.sale_id">
          <option value="">{{ $t("Umumiy hisobga — avval eski qarzlar yopiladi, ortgani avans") }}</option>
          <option v-for="s in openSales" :key="s.id" :value="s.id">{{s.number}} · {{dt(s.date,false)}} · {{ $t("qoldiq") }} {{money(s.total - s.paid_amount)}} / {{money(s.total)}}</option>
        </select>
      </label>
      <label class="f"><span>{{ $t("Kassa") }}</span><register-select v-model="f.register_id" :all="false" style="width:100%"/></label>
      <label class="f"><span>{{ $t("Izoh") }}</span><input v-model="f.note"></label>
    </form>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t("Bekor") }}</button>
      <button class="btn primary" form="pay-form" :disabled="saving || !f.amount || !f.client_id">{{ $t("Saqlash") }}</button>
    </template>
  </modal>`,
};

// ---------- Kichik yordamchilar ----------
export const Badge = {
  props: { s: Array },
  template: `<span class="badge" :class="s[1]">{{$t(s[0])}}</span>`,
};

export const DocActions = {
  props: { pdfName: String },
  emits: ['pdf'],
  template: `
    <button class="btn primary" @click="print()">🖨 {{ $t('Chop etish (Ctrl+P)') }}</button>
    <button class="btn" @click="$emit('pdf')">⬇ {{ $t('PDF yuklab olish') }}</button>`,
  methods: { print() { window.print(); } },
};

// ---------- Kassalar ----------
export const registerStore = reactive({ list: [], loaded: false });
export async function loadRegisters(force = false) {
  if (!registerStore.loaded || force) { registerStore.list = await get('/api/registers', { silent: true }); registerStore.loaded = true; }
  return registerStore.list;
}
export const RegisterSelect = {
  props: { modelValue: [String, Number, null], placeholder: { type: String, default: 'Barcha do\'konlar' }, all: { type: Boolean, default: true } },
  emits: ['update:modelValue'],
  setup() { onMounted(() => loadRegisters()); return { registerStore }; },
  template: `
  <select :value="modelValue || ''" @change="$emit('update:modelValue', $event.target.value)" style="width:auto">
    <option v-if="all" value="">🏪 {{$t(placeholder)}}</option>
    <option v-for="r in registerStore.list.filter(x => x.active || String(x.id) === String(modelValue))" :key="r.id" :value="String(r.id)">🏪 {{$t(r.name)}}</option>
  </select>`,
};

// ---------- Xodim tanlash (filtrlar uchun) ----------
const staffStore = reactive({ list: [], loaded: false });
export function invalidateStaff() { staffStore.loaded = false; }
export const StaffSelect = {
  props: { modelValue: [String, Number], placeholder: { type: String, default: 'Barcha xodimlar' } },
  emits: ['update:modelValue'],
  setup() {
    onMounted(async () => {
      if (!staffStore.loaded) { staffStore.list = await get('/api/staff/list', { silent: true }); staffStore.loaded = true; }
    });
    return { staffStore };
  },
  template: `
  <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)" style="width:auto">
    <option value="">👤 {{$t(placeholder)}}</option>
    <option v-for="u in staffStore.list" :key="u.id" :value="String(u.id)">{{u.name}}{{u.active ? '' : $t(' (nofaol)')}}</option>
  </select>`,
};

// ---------- Kamera va Rasm orqali Shtrix-kod / OCR Skaneri ----------
export const BarcodeScannerModal = {
  props: { title: { type: String, default: 'Shtrix-kod skaneri' } },
  emits: ['close', 'code'],
  setup(_p, { emit }) {
    const video = ref(null);
    const fileInput = ref(null);
    const err = ref('');
    const busy = ref(false);
    let stop = null;

    onMounted(async () => {
      try {
        stop = await startCamera(video.value, (code) => {
          beep(true);
          emit('code', code);
          close();
        });
      } catch (e) {
        err.value = t("Jonli kamera ochilmadi. Quyidagi «Rasmga olish» tugmasi orqali rasmga tushirib o'qishingiz mumkin.");
      }
    });

    const close = () => {
      if (stop) { stop(); stop = null; }
      emit('close');
    };

    const triggerPhoto = () => {
      if (fileInput.value) fileInput.value.click();
    };

    const onFileChange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      busy.value = true;
      err.value = '';
      try {
        const code = await decodeBarcodeFromImage(file);
        if (code) {
          beep(true);
          emit('code', code);
          close();
        } else {
          err.value = t("Rasmdan shtrix-kod aniqlanmadi. Iltimos, shtrix-kodni yaqinroq va tiniqroq rasmga oling.");
        }
      } catch (e) {
        err.value = t("Xatolik:") + ' ' + (e.message || e);
      } finally {
        busy.value = false;
        if (e.target) e.target.value = '';
      }
    };

    onBeforeUnmount(() => {
      if (stop) { stop(); stop = null; }
    });

    return { video, fileInput, err, busy, close, triggerPhoto, onFileChange };
  },
  template: `
  <div class="modal-bg cam-modal" @mousedown.self="close">
    <div class="modal" style="max-width:440px">
      <div class="mh">
        <h2>📷 {{ $t(title) }}</h2>
        <button class="btn ghost icon" @click="close">✕</button>
      </div>
      <div class="mb">
        <div style="position:relative;background:#000;border-radius:12px;overflow:hidden;min-height:200px;display:flex;align-items:center;justify-content:center">
          <video ref="video" playsinline muted style="width:100%;max-height:40vh;display:block"></video>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:75%;height:100px;border:2px dashed #4ade80;border-radius:10px;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,0.35)"></div>
        </div>
        
        <input ref="fileInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onFileChange">

        <div class="row mt" style="justify-content:center;gap:10px">
          <button type="button" class="btn primary sm" :disabled="busy" @click="triggerPhoto">
            📸 {{ busy ? $t("O'qilmoqda...") : $t("Rasmga olish / Yuklash") }}
          </button>
        </div>

        <div class="neg small mt" v-if="err" style="text-align:center">{{ err }}</div>
        <div class="small muted mt" style="text-align:center;line-height:1.4">
          {{ $t("Kamerani tovar shtrix-kodiga qarating yoki «Rasmga olish» tugmasi orqali rasmga tushiring. Tovar kodi avtomatik o'qib olinadi.") }}
        </div>
      </div>
      <div class="mf" style="justify-content:flex-end">
        <button class="btn ghost" @click="close">{{ $t('Bekor qilish') }}</button>
      </div>
    </div>
  </div>`,
};
