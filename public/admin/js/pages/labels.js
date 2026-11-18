// Narx etiketkalari (shtrix-kod bilan): mahsulotlar tanlanadi, har biriga nechta nusxa, etiketka o'lchami — chop etish.
// Shtrix-kodi yo'q mahsulotga ichki kod (EAN-13, "2" bilan boshlanadi) bir tugma bilan beriladi.
import { ref, reactive, computed, onActivated } from 'vue';
import { get, post, money, route, toast, t, back } from '../lib.js';
import { loadProducts, invalidateProducts } from '../components.js';
import { barcodeSvg } from '../barcode.js';
import { loadSettings, settings } from '../docs.js';

const SIZES = { '58x40': [58, 40], '40x30': [40, 30], '30x20': [30, 20] };

export const LabelsPage = {
  setup() {
    const all = ref([]);
    const q = ref('');
    const picked = ref([]);   // { p, n }
    const f = reactive({ size: '58x40', price: 'piece', showName: true, showCompany: false });
    const load = async () => {
      await loadSettings();
      all.value = await loadProducts(true);
      const ids = String(route.query.ids || '').split(',').map(Number).filter(Boolean);
      if (ids.length && !picked.value.length) for (const id of ids) { const p = all.value.find((x) => x.id === id); if (p) picked.value.push({ p, n: 1 }); }
    };
    onActivated(load);
    const found = computed(() => {
      const s = q.value.trim().toLowerCase();
      if (!s) return [];
      return all.value.filter((p) => `${p.name} ${p.brand} ${p.sku} ${p.barcode}`.toLowerCase().includes(s)).slice(0, 12);
    });
    const add = (p) => { const ex = picked.value.find((x) => x.p.id === p.id); if (ex) ex.n++; else picked.value.push({ p, n: 1 }); q.value = ''; };
    const addAll = () => { for (const p of all.value.filter((x) => x.active)) if (!picked.value.some((x) => x.p.id === p.id)) picked.value.push({ p, n: 1 }); };
    const labels = computed(() => picked.value.flatMap((x) => Array.from({ length: Math.max(0, Math.min(500, +x.n || 0)) }, () => x.p)));
    const dims = computed(() => SIZES[f.size]);
    const svg = (p) => barcodeSvg(p.barcode || p.sku || '', { h: dims.value[1] >= 40 ? 12 : 8 });
    // Shtrix-kodi yo'qlarga ichki EAN-13 berish
    const genCodes = async () => {
      const miss = picked.value.filter((x) => !x.p.barcode);
      for (const [k, x] of miss.entries()) {
        const d = ('2' + String(Date.now() + k).slice(-11)).split('').map(Number);
        const sum = d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
        const code = d.join('') + ((10 - (sum % 10)) % 10);
        await post(`/api/products/${x.p.id}/barcode`, { barcode: code });
        x.p.barcode = code;
      }
      invalidateProducts();
      toast(t('Shtrix-kod berildi') + ': ' + miss.length, 'ok');
    };
    const print = () => {
      const style = document.createElement('style');
      style.textContent = `@media print { @page { size: ${dims.value[0]}mm ${dims.value[1]}mm; margin: 0; } }`;
      document.head.appendChild(style);
      document.body.classList.add('print-labels');
      window.addEventListener('afterprint', () => { style.remove(); document.body.classList.remove('print-labels'); }, { once: true });
      window.print();
    };
    const priceOf = (p) => (f.price === 'box' && p.box_qty > 1 ? p.box_price : p.piece_price);
    const missing = computed(() => picked.value.filter((x) => !x.p.barcode && !x.p.sku).length);
    return { q, found, picked, f, add, addAll, labels, dims, svg, genCodes, print, priceOf, missing, money, back, settings, SIZES };
  },
  template: `
  <div>
    <div class="page-head no-print">
      <a class="back" href="" @click.prevent="back('/products')">←</a>
      <h1>{{ $t('Narx etiketkalari') }}</h1>
      <button class="btn primary" :disabled="!labels.length" @click="print">🖨 {{ $t('Chop etish') }} ({{labels.length}})</button>
    </div>
    <div class="grid c2 no-print mb">
      <div class="card">
        <div class="ac"><input v-model="q" :placeholder="$t('Mahsulot qidirish yoki shtrix-kod...')" autofocus>
          <div class="ac-list" v-if="found.length"><div v-for="p in found" :key="p.id" class="ac-item" @mousedown.prevent="add(p)">{{p.name}} <span class="muted small">{{p.barcode}}</span></div></div></div>
        <div class="row mt"><button class="btn sm" @click="addAll">{{ $t('Barcha faol mahsulotlar') }}</button><button class="btn sm ghost" v-if="picked.length" @click="picked=[]">{{ $t('Tozalash') }}</button></div>
        <table class="t mt" v-if="picked.length"><tbody>
          <tr v-for="(x,i) in picked" :key="x.p.id"><td>{{x.p.name}}<div class="small" :class="x.p.barcode ? 'muted' : 'neg'">{{x.p.barcode || $t("shtrix-kod yo'q")}}</div></td>
            <td style="width:90px"><input type="number" min="0" v-model.number="x.n"></td><td style="width:40px"><button class="btn sm ghost" @click="picked.splice(i,1)">✕</button></td></tr>
        </tbody></table>
        <div class="warn-box mt" v-if="picked.some(x => !x.p.barcode)">{{ $t("Ba'zi mahsulotlarda shtrix-kod yo'q") }}
          <button class="btn sm" v-if="$can('products.edit')" @click="genCodes" style="margin-left:8px">{{ $t('Ichki shtrix-kod berish') }}</button></div>
      </div>
      <div class="card form-grid">
        <label class="f"><span>{{ $t("Etiketka o'lchami") }}</span><select v-model="f.size"><option v-for="(v,k) in SIZES" :key="k" :value="k">{{k}} mm</option></select></label>
        <label class="f"><span>{{ $t('Narx') }}</span><select v-model="f.price"><option value="piece">{{ $t('Birlik narxi') }}</option><option value="box">{{ $t('Qadoq narxi') }}</option></select></label>
        <label class="check"><input type="checkbox" v-model="f.showName"> {{ $t('Mahsulot nomi') }}</label>
        <label class="check"><input type="checkbox" v-model="f.showCompany"> {{ $t("Do'kon nomi") }}</label>
        <p class="full small muted">{{ $t("Etiketka printerida qog'oz o'lchamini shu o'lchamga qo'ying. Oddiy printerda ham chiqadi — har biri alohida sahifada.") }}</p>
      </div>
    </div>
    <div class="labels-sheet">
      <div v-for="(p,i) in labels" :key="i" class="label" :style="{width: dims[0] + 'mm', height: dims[1] + 'mm'}">
        <div class="lb-co" v-if="f.showCompany">{{settings.data.company_name}}</div>
        <div class="lb-name" v-if="f.showName">{{p.name}}</div>
        <div class="lb-price">{{money(priceOf(p))}}<small> / {{ f.price === 'box' && p.box_qty > 1 ? packName(p) : baseName(p) }}</small></div>
        <div class="lb-code" v-html="svg(p)"></div>
      </div>
    </div>
  </div>`,
};
