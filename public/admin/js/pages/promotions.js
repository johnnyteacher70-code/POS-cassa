// Aksiyalar: foizli chegirma qoidalari (butun do'kon / kategoriya / mahsulot), muddat va minimal miqdor bilan.
// Kassada avtomatik qo'llanadi; server ham narxni shu qoidaga ko'ra tekshiradi.
import { ref, onActivated } from 'vue';
import { get, post, put, del, toast, t, today } from '../lib.js';
import { ProductAC, loadProducts } from '../components.js';

export const PromotionsPage = {
  components: { ProductAC },
  setup() {
    const rows = ref([]);
    const cats = ref([]);
    const products = ref([]);
    const modal = ref(null);
    const load = async () => {
      [rows.value, cats.value, products.value] = await Promise.all([get('/api/price-levels/promotions'), get('/api/products/categories'), loadProducts()]);
    };
    onActivated(load);
    const open = (p) => {
      const prod = p && p.scope === 'product' ? products.value.find((x) => x.id === +p.target) : null;
      modal.value = p ? { ...p, item: { name: prod ? prod.name : '', product_id: prod ? prod.id : null } }
        : { name: '', percent: 10, scope: 'all', target: '', min_qty: '', date_from: today(), date_to: '', active: 1, item: { name: '', product_id: null } };
    };
    const save = async () => {
      const m = modal.value;
      const body = { ...m, target: m.scope === 'product' ? m.item.product_id : m.target };
      if (m.id) await put('/api/price-levels/promotions/' + m.id, body); else await post('/api/price-levels/promotions', body);
      toast('Saqlandi', 'ok'); modal.value = null; load();
    };
    const remove = async (p) => { if (!confirm(t(`"${p.name}" aksiyasi o'chirilsinmi?`))) return; await del('/api/price-levels/promotions/' + p.id); load(); };
    const live = (p) => p.active && (!p.date_from || p.date_from <= today()) && (!p.date_to || p.date_to >= today());
    const targetName = (p) => (p.scope === 'all' ? t('Barcha mahsulotlar') : p.scope === 'category' ? t('Kategoriya') + ': ' + t(p.target)
      : (products.value.find((x) => x.id === +p.target) || { name: '#' + p.target }).name);
    return { rows, cats, modal, open, save, remove, live, targetName };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Aksiyalar") }}</h1>
        <div class="small muted">{{ $t("Chegirmalar, maxsus aksiyalar va narx qoidalari") }}</div>
      </div>
      <button class="btn primary" @click="open(null)">＋ {{ $t("Yangi aksiya") }}</button>
    </div>
    <p class="small muted mb">{{ $t("Aksiya kassada avtomatik qo'llanadi: mahsulot savatga tushganda narx chegirma bilan qo'yiladi. Bir nechta aksiya to'g'ri kelsa — eng kattasi.") }}</p>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Aksiya") }}</th><th>{{ $t("Nimaga") }}</th><th class="num">{{ $t("Chegirma") }}</th><th>{{ $t("Muddati") }}</th><th></th></tr></thead>
        <tbody><tr v-for="p in rows" :key="p.id" :class="{dim: !live(p)}">
          <td class="main-cell"><b>{{p.name}}</b> <span class="badge" :class="live(p) ? 'green' : 'gray'">{{ live(p) ? $t("amalda") : $t("amalda emas") }}</span><div class="small muted" v-if="p.min_qty">{{ $t("kamida") }} {{p.min_qty}} {{ $t("dona / birlik olinsa") }}</div></td>
          <td :data-l="$t('Nimaga')">{{targetName(p)}}</td>
          <td :data-l="$t('Chegirma')" class="num bold neg">−{{p.percent}}%</td>
          <td :data-l="$t('Muddati')" class="small">{{p.date_from || '…'}} — {{p.date_to || '…'}}</td>
          <td data-l="" class="right nowrap"><button class="btn sm ghost" @click="open(p)">✎</button><button class="btn sm ghost" @click="remove(p)">🗑</button></td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Hali aksiya yo'q") }}</div>
    </div>
    <modal v-if="modal" :title="modal.id ? $t('Aksiyani tahrirlash') : $t('Yangi aksiya')" @close="modal=null">
      <form id="promo-form" class="form-grid" @submit.prevent="save">
        <label class="f full"><span>{{ $t('Nomi') }}</span><input v-model="modal.name" autofocus :placeholder="$t('masalan: Hafta oxiri −10%')"></label>
        <label class="f"><span>{{ $t('Chegirma foizi') }}</span><input type="number" min="0.5" max="99" step="0.5" v-model.number="modal.percent"></label>
        <label class="f"><span>{{ $t('Nimaga') }}</span><select v-model="modal.scope"><option value="all">{{ $t('Barcha mahsulotlar') }}</option><option value="category">{{ $t('Kategoriya') }}</option><option value="product">{{ $t('Bitta mahsulot') }}</option></select></label>
        <label class="f full" v-if="modal.scope==='category'"><span>{{ $t('Kategoriya') }}</span><select v-model="modal.target"><option value="" disabled>—</option><option v-for="c in cats" :key="c" :value="c">{{ $t(c) }}</option></select></label>
        <div class="f full" v-if="modal.scope==='product'"><span>{{ $t('Mahsulot') }}</span><product-a-c :item="modal.item" @pick="p => { modal.item.product_id = p.id; modal.item.name = p.name; }"/></div>
        <label class="f"><span>{{ $t('Boshlanishi') }}</span><input type="date" v-model="modal.date_from"></label>
        <label class="f"><span>{{ $t('Tugashi') }}</span><input type="date" v-model="modal.date_to"></label>
        <label class="f"><span>{{ $t('Minimal miqdor (ixtiyoriy)') }}</span><input type="number" min="0" step="any" v-model.number="modal.min_qty" :placeholder="$t('masalan: 10 dona')"></label>
        <label class="check" style="align-self:end"><input type="checkbox" v-model="modal.active" :true-value="1" :false-value="0"> {{ $t('Faol') }}</label>
      </form>
      <template #footer><button class="btn" @click="modal=null">{{ $t('Bekor') }}</button><button class="btn primary" form="promo-form">{{ $t('Saqlash') }}</button></template>
    </modal>
  </div>`,
};
