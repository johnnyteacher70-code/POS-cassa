// Inventarizatsiya (reviziya): sanash varag'i. Shtrix-kod skaneri bilan: kod o'qilsa — shu mahsulot soni +1.
// "Ko'r-ko'rona sanash": kutilgan qoldiq yashiriladi (sanovchi tizim raqamiga qarab yozib qo'ymasin).
import { ref, reactive, computed, onActivated, watch } from 'vue';
import { get, post, put, money, dt, go, back, route, toast, t, qtyFmt, debounce } from '../lib.js';
import { invalidateProducts } from '../components.js';

export const InventoryPage = {
  setup() {
    const rows = ref([]);
    const cats = ref([]);
    const f = reactive({ category: '', note: '' });
    const load = async () => { [rows.value, cats.value] = await Promise.all([get('/api/inventory'), get('/api/products/categories')]); };
    onActivated(load);
    const start = async () => { const r = await post('/api/inventory', f); toast(t('Inventarizatsiya boshlandi') + ': ' + r.number, 'ok'); go('/inventory/' + r.id); };
    const draft = computed(() => rows.value.find((r) => r.status === 'draft'));
    const ST = { draft: ['jarayonda', 'amber'], done: ['yakunlangan', 'green'], cancelled: ['bekor qilingan', 'gray'] };
    return { rows, cats, f, start, draft, ST, dt, go };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Inventarizatsiya (reviziya)") }}</h1>
        <div class="small muted">{{ $t("Ombor qoldiqlarini solishtirish, sanash va kamomadni tekshirish") }}</div>
      </div>
    </div>
    <div class="card mb" v-if="!draft">
      <h3>{{ $t("Yangi inventarizatsiya") }}</h3>
      <p class="small muted">{{ $t("Tizimdagi qoldiqlar yozib olinadi. Keyin har bir mahsulotni sanab kiritasiz (skaner bilan ham bo'ladi). Yakunlanganda farq omborda avtomatik tuzatiladi va kamomad summasi hisoblanadi.") }}</p>
      <form class="row" @submit.prevent="start">
        <select v-model="f.category" style="width:auto"><option value="">{{ $t("Barcha mahsulotlar") }}</option><option v-for="c in cats" :key="c" :value="c">{{ $t(c) }}</option></select>
        <input v-model="f.note" :placeholder="$t('Izoh')" style="flex:1;min-width:140px">
        <button class="btn primary">▶ {{ $t("Boshlash") }}</button>
      </form>
    </div>
    <div class="card mb" v-else><b>{{ $t("Tugallanmagan inventarizatsiya bor") }}:</b> <a :href="'#/inventory/' + draft.id">{{draft.number}}</a> ({{draft.counted_n}} / {{draft.items_n}})</div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Hujjat") }}</th><th class="num">{{ $t("Sanalgan") }}</th><th>{{ $t("Holati") }}</th></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.id" class="click" @click="go('/inventory/' + r.id)">
          <td class="main-cell"><a :href="'#/inventory/' + r.id"><b>{{r.number}}</b></a><div class="small muted">🕒 {{dt(r.created_at)}} · 👤 {{r.user_name}}<span v-if="r.category"> · 📁 {{ $t(r.category) }}</span><span v-if="r.note"> · {{r.note}}</span></div></td>
          <td :data-l="$t('Sanalgan')" class="num">{{r.counted_n}} / {{r.items_n}} {{ $t("ta") }}</td>
          <td :data-l="$t('Holati')"><span class="badge" :class="ST[r.status][1]">{{ $t(ST[r.status][0]) }}</span></td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Hali inventarizatsiya o'tkazilmagan") }}</div>
    </div>
  </div>`,
};

export const InventoryView = {
  setup() {
    const inv = ref(null);
    const q = ref('');
    const blind = ref(false);
    const onlyDiff = ref(false);
    const dirty = new Set();
    const saving = ref(false);
    const scanEl = ref(null);
    const id = route.parts[1];
    const load = async () => { inv.value = await get('/api/inventory/' + id); };
    onActivated(load);
    const draft = computed(() => inv.value && inv.value.status === 'draft');
    const diff = (i) => (i.counted === null || i.counted === '' || i.counted === undefined ? null : Math.round((+i.counted - (draft.value ? i.current : i.expected)) * 1000) / 1000);
    const list = computed(() => {
      if (!inv.value) return [];
      const s = q.value.trim().toLowerCase();
      return inv.value.items.filter((i) => (!s || `${i.name} ${i.barcode} ${i.sku}`.toLowerCase().includes(s)) && (!onlyDiff.value || (diff(i) !== null && diff(i) !== 0)));
    });
    const stats = computed(() => {
      const it = inv.value ? inv.value.items : [];
      let counted = 0, short = 0, plus = 0;
      for (const i of it) {
        const d = diff(i);
        if (d === null) continue;
        counted++;
        if (d < 0) short += -d * (i.cost || 0); else plus += d * (i.cost || 0);
      }
      return { counted, total: it.length, short: Math.round(short), plus: Math.round(plus) };
    });
    const save = async () => {
      if (!dirty.size) return;
      saving.value = true;
      try {
        const items = inv.value.items.filter((i) => dirty.has(i.product_id)).map((i) => ({ product_id: i.product_id, counted: i.counted }));
        dirty.clear();
        await put('/api/inventory/' + id, { items });
      } finally { saving.value = false; }
    };
    const autosave = debounce(save, 1200);
    const changed = (i) => { dirty.add(i.product_id); autosave(); };
    // Skaner: shtrix-kod (yoki artikul) o'qilsa — o'sha mahsulot +1
    const onScan = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) return;
      const i = inv.value.items.find((x) => (x.barcode && x.barcode.toLowerCase() === s) || (x.sku && x.sku.toLowerCase() === s));
      if (!i) { if (list.value.length === 1) { const x = list.value[0]; x.counted = (+x.counted || 0) + 1; changed(x); q.value = ''; } else toast(t('Topilmadi') + ': ' + s, 'error'); return; }
      i.counted = (+i.counted || 0) + 1; changed(i); q.value = '';
      if (navigator.vibrate) navigator.vibrate(15);
    };
    const finish = async () => {
      await save();
      const s = stats.value;
      if (!confirm(t(`Inventarizatsiya yakunlansinmi?\nSanalgan: ${s.counted} / ${s.total}\nSanalmagan mahsulotlar o'zgarmaydi.`))) return;
      const r = await post(`/api/inventory/${id}/finish`);
      invalidateProducts();
      toast(t('Yakunlandi') + `: ${r.adjusted} ` + t('ta tuzatish') + (r.shortage ? `, ${t('kamomad')} ${money(r.shortage)}` : ''), 'ok', { duration: 8000 });
      load();
    };
    const cancel = async () => { if (!confirm(t('Inventarizatsiya bekor qilinsinmi?'))) return; await post(`/api/inventory/${id}/cancel`); load(); };
    const fillExpected = () => { for (const i of list.value) if (i.counted === null || i.counted === '') { i.counted = Math.max(0, i.current); changed(i); } };
    return { inv, q, blind, onlyDiff, saving, scanEl, draft, diff, list, stats, changed, onScan, finish, cancel, fillExpected, save, back, money, dt, qtyFmt };
  },
  template: `
  <div v-if="inv">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/inventory')">←</a>
      <h1>{{inv.number}} <span class="badge amber" v-if="draft">{{ $t('jarayonda') }}</span><span class="badge green" v-else-if="inv.status==='done'">{{ $t('yakunlangan') }}</span></h1>
      <template v-if="draft">
        <span class="small muted" v-if="saving">{{ $t('saqlanmoqda...') }}</span>
        <button class="btn red" @click="cancel">{{ $t('Bekor qilish') }}</button>
        <button class="btn primary" @click="finish">✓ {{ $t('Yakunlash') }}</button>
      </template>
    </div>
    <div class="grid c4 mb">
      <div class="card stat"><div class="l">{{ $t('Sanalgan') }}</div><div class="v">{{stats.counted}} / {{stats.total}}</div></div>
      <div class="card stat" v-if="$can('products.cost')"><div class="l">{{ $t('Kamomad (tannarxda)') }}</div><div class="v neg">{{money(stats.short)}}</div></div>
      <div class="card stat" v-if="$can('products.cost')"><div class="l">{{ $t('Ortiqcha (tannarxda)') }}</div><div class="v pos">{{money(stats.plus)}}</div></div>
      <div class="card stat"><div class="l">{{ $t('Boshlangan') }}</div><div class="v" style="font-size:15px">{{dt(inv.created_at)}}</div><div class="s" v-if="inv.done_at">{{ $t('yakunlandi') }} {{dt(inv.done_at)}}</div></div>
    </div>
    <div class="row mb">
      <div class="search-big"><input ref="scanEl" v-model="q" @keydown.enter="onScan" :placeholder="$t('Qidirish yoki shtrix-kodni skanerlang (+1)')" autofocus></div>
      <label class="check"><input type="checkbox" v-model="blind"> {{ $t("Ko'r-ko'rona sanash") }}</label>
      <label class="check"><input type="checkbox" v-model="onlyDiff"> {{ $t('Faqat farqlar') }}</label>
      <button class="btn sm" v-if="draft" @click="fillExpected" :title="$t('Sanalmaganlarga tizimdagi qoldiqni yozish')">{{ $t('Qolganini tizimdagidek') }}</button>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th style="width:48px">{{ $t('Rasm') }}</th><th>{{ $t('Mahsulot') }}</th><th class="num" v-if="!blind">{{ $t('Tizimda') }}</th><th class="num" style="width:140px">{{ $t('Sanalgan') }}</th><th class="num" v-if="!blind">{{ $t('Farq') }}</th></tr></thead>
        <tbody><tr v-for="i in list" :key="i.product_id">
          <td class="c" style="width:48px;padding:4px">
            <img v-if="i.image" :src="i.image" class="prod-thumb" loading="lazy" decoding="async" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px">
            <span v-else style="font-size:20px">📦</span>
          </td>
          <td class="main-cell"><b>{{i.name}}</b><div class="small muted">{{[i.category, i.barcode, i.sku].filter(Boolean).join(' · ')}}</div></td>
          <td :data-l="$t('Tizimda')" class="num" v-if="!blind">{{qtyFmt(draft ? i.current : i.expected)}} {{baseName(i)}}</td>
          <td :data-l="$t('Sanalgan')" class="num"><input v-if="draft" type="number" min="0" step="any" v-model.number="i.counted" @input="changed(i)" style="width:110px;text-align:right"><b v-else>{{i.counted === null ? '—' : qtyFmt(i.counted)}}</b></td>
          <td :data-l="$t('Farq')" class="num bold" v-if="!blind" :class="diff(i) < 0 ? 'neg' : diff(i) > 0 ? 'pos' : ''">{{diff(i) === null ? '' : (diff(i) > 0 ? '+' : '') + qtyFmt(diff(i))}}</td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!list.length">{{ $t('Mahsulot topilmadi') }}</div>
    </div>
  </div>`,
};
