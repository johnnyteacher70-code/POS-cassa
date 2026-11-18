// Filiallar orasida tovar ko'chirish: jo'natish (manba) → yo'lda → qabul qilish (qabul qiluvchi filial)
import { ref, reactive, computed, onActivated } from 'vue';
import { get, post, money, dt, go, back, route, toast, t, qtyFmt, resetPage, session } from '../lib.js';
import { ProductAC, invalidateProducts } from '../components.js';

const ST = { sent: ["yo'lda", 'amber'], received: ['qabul qilindi', 'green'], cancelled: ['bekor qilindi', 'gray'] };

export const TransfersPage = {
  setup() {
    const rows = ref([]);
    const load = async () => { rows.value = await get('/api/transfers'); };
    onActivated(load);
    const incoming = computed(() => rows.value.filter((r) => r.dir === 'in' && r.status === 'sent'));
    return { rows, incoming, ST, money, dt, go };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Filiallararo ko'chirish") }}</h1>
        <div class="small muted">{{ $t("Filiallar o'rtasida tovarlarni jo'natish va qabul qilish") }}</div>
      </div>
      <a class="btn primary" v-if="$can('transfers.send')" href="#/transfers/new">🚚 {{ $t("Tovar jo'natish") }}</a>
    </div>
    <div class="warn-box mb" v-if="incoming.length && $can('transfers.receive')">📦 {{ $t("Qabul qilinishi kutilayotgan tovar bor") }}: <b>{{incoming.length}}</b> {{ $t("ta hujjat") }}</div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Hujjat") }}</th><th>{{ $t("Yo'nalish") }}</th><th class="num">{{ $t("Mahsulotlar") }}</th><th>{{ $t("Holati") }}</th></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.id" class="click" @click="go('/transfers/'+r.id)">
          <td class="main-cell"><a :href="'#/transfers/'+r.id"><b>{{r.number}}</b></a><div class="small muted">🕒 {{dt(r.sent_at)}} · 👤 {{r.sent_by}}</div></td>
          <td :data-l="$t(&quot;Yo'nalish&quot;)"><span v-if="r.dir==='out'">⬆ {{ $t("jo'natildi") }} → <b>{{r.to_name}}</b></span><span v-else>⬇ {{ $t("keldi") }} ← <b>{{r.from_name}}</b></span></td>
          <td :data-l="$t('Mahsulotlar')" class="num">{{r.items_n}} {{ $t("ta") }}</td>
          <td :data-l="$t('Holati')"><span class="badge" :class="ST[r.status][1]">{{ $t(ST[r.status][0]) }}</span></td>
        </tr></tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Hali ko'chirish bo'lmagan") }}</div>
    </div>
  </div>`,
};

export const TransferForm = {
  components: { ProductAC },
  setup() {
    const targets = ref([]);
    const f = reactive({ to_branch_id: '', note: '', items: [{ product_id: null, name: '', unit: 'dona', qty: 1 }] });
    const saving = ref(false);
    onActivated(async () => { targets.value = await get('/api/transfers/branches'); if (targets.value.length === 1) f.to_branch_id = targets.value[0].id; });
    const pick = (it, p) => {
      Object.assign(it, { product_id: p.id, name: p.name, box_qty: p.box_qty, unit_code: p.unit, pack_name: p.pack_name, stock: p.stock, unit: 'dona' });
      if (f.items[f.items.length - 1] === it) f.items.push({ product_id: null, name: '', unit: 'dona', qty: 1 });
    };
    const lines = computed(() => f.items.filter((i) => i.product_id && +i.qty > 0));
    const pcs = (i) => (i.unit === 'karobka' ? (+i.qty || 0) * (i.box_qty || 1) : +i.qty || 0);
    const save = async () => {
      saving.value = true;
      try {
        const r = await post('/api/transfers', { to_branch_id: f.to_branch_id, note: f.note, items: lines.value.map((i) => ({ product_id: i.product_id, unit: i.unit, qty: i.qty })) });
        invalidateProducts();
        toast(t("Jo'natildi") + ': ' + r.number, 'ok');
        resetPage();
        go('/transfers/' + r.id);
      } finally { saving.value = false; }
    };
    return { targets, f, saving, pick, lines, pcs, save, back, qtyFmt, session };
  },
  template: `
  <div>
    <div class="page-head"><a class="back" href="" @click.prevent="back('/transfers')">←</a><h1>{{ $t("Boshqa filialga tovar jo'natish") }}</h1></div>
    <form @submit.prevent="save">
      <div class="card mb form-grid">
        <label class="f"><span>{{ $t('Qayerdan') }}</span><input :value="session.branch && session.branch.name" disabled></label>
        <label class="f"><span>{{ $t('Qayerga') }} *</span><select v-model="f.to_branch_id" required><option value="" disabled>{{ $t('Filialni tanlang') }}</option><option v-for="b in targets" :key="b.id" :value="b.id">{{b.name}}</option></select></label>
        <label class="f full"><span>{{ $t('Izoh') }}</span><input v-model="f.note" :placeholder="$t('Haydovchi, mashina raqami ...')"></label>
      </div>
      <div class="card mb">
        <div class="items-ed">
          <div class="it hdr pur"><div>{{ $t('Mahsulot') }}</div><div>{{ $t('Birlik') }}</div><div>{{ $t('Miqdor') }}</div><div>{{ $t('Omborda') }}</div><div></div><div></div></div>
          <div class="it pur" v-for="(it,i) in f.items" :key="i">
            <div class="prod"><div class="mini-l">{{ $t('Mahsulot') }}</div><product-a-c :item="it" @pick="p => pick(it,p)"/></div>
            <div><div class="mini-l">{{ $t('Birlik') }}</div>
              <div class="unit-toggle" v-if="it.box_qty > 1"><button type="button" :class="{on:it.unit==='dona'}" @click="it.unit='dona'">{{baseName({unit: it.unit_code})}}</button><button type="button" :class="{on:it.unit==='karobka'}" @click="it.unit='karobka'">{{packName(it)}} ({{it.box_qty}})</button></div>
              <div v-else class="unit-fixed">{{baseName({unit: it.unit_code})}}</div></div>
            <div><div class="mini-l">{{ $t('Miqdor') }}</div><input type="number" min="0" step="any" v-model.number="it.qty"></div>
            <div class="small" :class="it.product_id && pcs(it) > it.stock ? 'neg' : 'muted'" style="padding:9px 0">{{ it.product_id ? qtyFmt(it.stock) + ' ' + baseName({unit: it.unit_code}) : '' }}</div>
            <div></div>
            <div><button type="button" class="btn ghost icon" v-if="f.items.length > 1" @click="f.items.splice(i,1)">✕</button></div>
          </div>
        </div>
      </div>
      <div class="row end"><button type="button" class="btn" @click="back('/transfers')">{{ $t('Bekor') }}</button><button class="btn primary" :disabled="saving || !f.to_branch_id || !lines.length">🚚 {{ $t("Jo'natish") }}</button></div>
    </form>
  </div>`,
};

export const TransferView = {
  setup() {
    const tr = ref(null);
    const id = route.parts[1];
    const load = async () => { tr.value = await get('/api/transfers/' + id); };
    onActivated(load);
    const receive = async () => {
      if (!confirm(t('Tovarni qabul qilasizmi? Hammasi omborga kirim qilinadi.'))) return;
      const r = await post(`/api/transfers/${id}/receive`);
      invalidateProducts();
      toast(t('Qabul qilindi') + (r.created ? `, ${r.created} ` + t('ta yangi mahsulot yaratildi') : ''), 'ok', { duration: 7000 });
      load();
    };
    const cancel = async () => {
      if (!confirm(t("Jo'natma bekor qilinsinmi? Tovar omboringizga qaytadi."))) return;
      await post(`/api/transfers/${id}/cancel`); invalidateProducts(); load();
    };
    return { tr, receive, cancel, ST, money, dt, back, qtyFmt };
  },
  template: `
  <div v-if="tr">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/transfers')">←</a>
      <h1>{{tr.number}} <span class="badge" :class="ST[tr.status][1]">{{ $t(ST[tr.status][0]) }}</span></h1>
      <button class="btn green" v-if="tr.dir==='in' && tr.status==='sent' && $can('transfers.receive')" @click="receive">📦 {{ $t('Qabul qilish') }}</button>
      <button class="btn red" v-if="tr.dir==='out' && tr.status==='sent' && $can('transfers.send')" @click="cancel">{{ $t('Bekor qilish') }}</button>
      <button class="btn" onclick="window.print()">🖨</button>
    </div>
    <div class="card print-area">
      <div class="grid c3">
        <div><div class="small muted">{{ $t('Qayerdan') }}</div><b>{{tr.from_name}}</b><div class="small muted">{{dt(tr.sent_at)}} · {{tr.sent_by}}</div></div>
        <div><div class="small muted">{{ $t('Qayerga') }}</div><b>{{tr.to_name}}</b><div class="small muted" v-if="tr.received_at">{{dt(tr.received_at)}} · {{tr.received_by}}</div></div>
        <div v-if="$can('products.cost')"><div class="small muted">{{ $t('Tannarxda') }}</div><b>{{money(Math.round(tr.total_cost))}}</b></div>
      </div>
      <table class="t mt">
        <thead><tr><th>№</th><th>{{ $t('Mahsulot') }}</th><th>{{ $t('Shtrix-kod') }}</th><th class="num">{{ $t('Miqdor') }}</th></tr></thead>
        <tbody><tr v-for="(i,k) in tr.items" :key="i.id"><td>{{k+1}}</td><td>{{i.name}}</td><td class="small muted">{{i.barcode}}</td><td class="num bold">{{qtyFmt(i.qty)}} {{baseName(i)}}</td></tr></tbody>
      </table>
      <div class="small muted mt" v-if="tr.note">{{ $t('Izoh') }}: {{tr.note}}</div>
    </div>
  </div>`,
};
