import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import { get, post, put, money, dt, d, go, back, route, clientName, debounce, toast, qs, today, toInputD, savePdf, docAction, resetPage } from '../lib.js';
import { newItem, loadProducts } from '../components.js';
import { QuoteDoc, loadSettings } from '../docs.js';
import { removeWithUndo } from './clients.js';

export const QuotesPage = {
  setup() {
    const q = ref('');
    const rows = ref([]);
    const load = async () => { rows.value = await get('/api/quotes' + qs({ q: q.value }), { latest: 'quotes' }); };
    watch(q, debounce(load, 250));
    onActivated(load);
    return { q, rows, money, d, go, clientName };
  },
  template: `
  <div>
    <div class="page-head"><h1>{{ $t('Tijorat takliflari (KP)') }}</h1><a class="btn primary" v-if="$can('quotes.edit')" href="#/quotes/new">＋ {{ $t('Yangi KP') }}</a></div>
    <div class="row mb"><div class="search-big"><input v-model="q" :placeholder="$t('№ yoki mijoz...')"></div></div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>№</th><th>{{ $t('Sana') }}</th><th>{{ $t('Kimga') }}</th><th class="num">{{ $t('Pozitsiya') }}</th><th class="num">{{ $t('Summa') }}</th><th>{{ $t('Sotuv') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="click" @click="go('/quotes/'+r.id)">
            <td class="main-cell bold">{{r.number}}</td><td :data-l="$t('Sana')">{{d(r.date)}}</td>
            <td :data-l="$t('Kimga')">{{r.client_name || clientName(r)}}</td><td :data-l="$t('Pozitsiya')" class="num">{{r.items_count}}</td>
            <td :data-l="$t('Summa')" class="num bold">{{money(r.total)}}</td>
            <td :data-l="$t('Sotuv')"><span v-if="r.sale_number" class="badge green">{{r.sale_number}}</span></td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("KP lar yo'q") }}</div>
    </div>
  </div>`,
};

export const QuoteForm = {
  setup() {
    const eid = route.parts[2] === 'edit' ? route.parts[1] : null;
    const editId = computed(() => eid);
    const f = reactive({
      client_id: route.query.client ? +route.query.client : null, client_name: '', date: today(), valid_until: '', note: '', items: [newItem()],
    });
    const saving = ref(false);
    onMounted(async () => {
      await loadProducts(true);
      if (editId.value) {
        const q = await get('/api/quotes/' + editId.value);
        Object.assign(f, {
          client_id: q.client_id, client_name: q.client_name, date: toInputD(q.date), valid_until: toInputD(q.valid_until), note: q.note,
          items: q.items.map((i) => ({ product_id: i.product_id, name: i.name, color: i.color || '', sku: i.sku || i.barcode || '', unit: i.unit, qty: i.qty, box_qty: i.box_qty, price: i.price, piece_price: i.piece_price, box_price: i.box_price })),
        });
      }
    });
    const onPicked = (c) => { if (c) f.client_name = clientName(c); };
    const total = computed(() => f.items.reduce((a, i) => a + Math.round((+i.qty || 0) * (+i.price || 0)), 0));
    const save = async () => {
      saving.value = true;
      try {
        const body = { ...f, items: f.items.filter((i) => i.name && +i.qty > 0) };
        if (editId.value) { await put('/api/quotes/' + editId.value, body); resetPage(); go('/quotes/' + editId.value); }
        else { const r = await post('/api/quotes', body); resetPage(); go('/quotes/' + r.id); }
        toast('KP saqlandi', 'ok');
      } finally { saving.value = false; }
    };
    return { editId, f, saving, total, save, onPicked, money, back };
  },
  template: `
  <div>
    <div class="page-head"><a class="back" href="" @click.prevent="back('/quotes')">←</a><h1>{{editId ? $t('KP tahrirlash') : $t('Yangi tijorat taklifi')}}</h1></div>
    <form @submit.prevent="save">
      <div class="card">
        <div class="form-grid">
          <label class="f"><span>{{ $t('Mijoz (bazadan)') }}</span><client-picker v-model="f.client_id" @picked="onPicked"/></label>
          <label class="f"><span>{{ $t('Kimga (hujjatda yoziladigan nom)') }}</span><input v-model="f.client_name" :placeholder="$t('Kompaniya nomi')"></label>
          <label class="f"><span>{{ $t('Sana') }}</span><input type="date" v-model="f.date"></label>
          <label class="f"><span>{{ $t('Amal qilish muddati') }}</span><input type="date" v-model="f.valid_until"></label>
        </div>
      </div>
      <div class="card"><h2>{{ $t('Mahsulotlar') }}</h2><items-editor :items="f.items"/></div>
      <div class="card">
        <label class="f"><span>{{ $t('Izoh (hujjatda chiqadi)') }}</span><textarea v-model="f.note" rows="3" :placeholder="$t(&quot;Yetkazib berish, to'lov shartlari...&quot;)"></textarea></label>
        <div class="totals-box mt"><div class="tr big"><span>{{ $t('Umumiy summa') }}</span><span>{{money(total)}} {{ $t("so'm") }}</span></div></div>
      </div>
      <div class="row end mt"><button type="button" class="btn" @click="back('/quotes')">{{ $t('Bekor') }}</button><button class="btn primary" :disabled="saving">💾 {{ $t('Saqlash') }}</button></div>
    </form>
  </div>`,
};

export const QuoteView = {
  components: { QuoteDoc },
  setup() {
    const q = ref(null);
    const quoteId = route.parts[1];
    onActivated(async () => { await loadSettings(); q.value = await get('/api/quotes/' + quoteId); });
    const remove = () => removeWithUndo('/api/quotes/' + q.value.id, `KP ${q.value.number}`, () => go('/quotes'));
    const pdf = () => savePdf(document.querySelector('.print-area'), `KP_${q.value.number}.pdf`);
    const print = () => docAction(document.querySelector('.print-area'), `KP_${q.value.number}.pdf`, 'print');
    return { q, remove, pdf, print, back };
  },
  template: `
  <div v-if="q">
    <div class="page-head"><a class="back" href="" @click.prevent="back('/quotes')">←</a><h1>{{ $t('KP') }} {{q.number}}</h1></div>
    <div class="doc-toolbar">
      <button class="btn primary" @click="print">🖨 {{ $t('Chop etish') }}</button>
      <button class="btn" @click="pdf">⬇ {{ $t('PDF') }}</button>
      <a class="btn" v-if="$can('quotes.edit')" :href="'#/quotes/'+q.id+'/edit'">✎ {{ $t('Tahrirlash') }}</a>
      <a class="btn green" v-if="$can('sales.create') && !q.sale && q.client_id" :href="'#/sales/new?quote='+q.id">🧾 {{ $t('Sotuvga aylantirish') }}</a>
      <a class="btn" v-if="q.sale" :href="'#/sales/'+q.sale.id">{{ $t('Sotuv') }}: {{q.sale.number}}</a>
      <span class="spacer"></span>
      <button class="btn red" v-if="$can('quotes.delete')" @click="remove">🗑</button>
    </div>
    <div class="doc-scroll"><quote-doc :quote="q"/></div>
  </div>`,
};
