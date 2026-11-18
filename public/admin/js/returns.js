// Qaytarish (vozvrat) oynasi: sotuvdagi pozitsiyalardan qaytariladigan miqdor tanlanadi.
// Summa mijoz hisobiga yoziladi (qarzidan ayriladi yoki avansga aylanadi); xohlasa — pul darhol qaytariladi.
import { ref, reactive, computed, onMounted } from 'vue';
import { get, post, money, qtyFmt, toast, t, METHODS, METHOD_ICONS } from './lib.js';
import { invalidateProducts } from './components.js';

export const ReturnModal = {
  props: { saleId: [Number, String], registerId: [Number, String] },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const data = ref(null);
    const qty = reactive({});
    const f = reactive({ refund: '', method: 'cash', note: '' });
    const busy = ref(false);
    onMounted(async () => { data.value = await get('/api/returns/sale/' + props.saleId); });
    // Chegirma ulushi: qaytarish summasi chegirmaga mutanosib (server ham shunday hisoblaydi)
    const k = computed(() => {
      if (!data.value) return 1;
      const sum = data.value.items.reduce((a, i) => a + i.total, 0);
      return sum > 0 ? data.value.sale.total / sum : 1;
    });
    const lineSum = (i) => Math.round((i.total / i.qty) * (+qty[i.id] || 0) * k.value);
    const total = computed(() => (data.value ? data.value.items.reduce((a, i) => a + lineSum(i), 0) : 0));
    const all = () => { for (const i of data.value.items) qty[i.id] = i.left; };
    const save = async () => {
      busy.value = true;
      try {
        const items = data.value.items.filter((i) => +qty[i.id] > 0).map((i) => ({ sale_item_id: i.id, qty: +qty[i.id] }));
        const r = await post('/api/returns', { sale_id: props.saleId, items, note: f.note, register_id: props.registerId || null,
          refund: f.refund ? { amount: f.refund, method: f.method } : null });
        invalidateProducts();
        toast(t('Qaytarish saqlandi') + `: ${r.number}, ${money(r.total)}`, 'ok', { duration: 6000 });
        emit('saved', r);
      } finally { busy.value = false; }
    };
    return { data, qty, f, busy, lineSum, total, all, save, money, qtyFmt, METHODS, METHOD_ICONS };
  },
  template: `
  <modal wide :title="$t('Qaytarish (vozvrat)') + (data ? ' — ' + data.sale.number : '')" @close="$emit('close')">
    <template v-if="data">
      <div class="row mb"><span class="muted small" style="flex:1">{{ $t("Qaytariladigan miqdorni kiriting. Tovar omborga qaytadi, summa mijoz hisobiga yoziladi.") }}</span>
        <button class="btn sm" type="button" @click="all">{{ $t('Hammasini qaytarish') }}</button></div>
      <table class="t">
        <thead><tr><th>{{ $t('Mahsulot') }}</th><th class="num">{{ $t('Sotilgan') }}</th><th class="num">{{ $t('Qaytgan') }}</th><th class="num" style="width:120px">{{ $t('Qaytariladi') }}</th><th class="num">{{ $t('Summa') }}</th></tr></thead>
        <tbody><tr v-for="i in data.items" :key="i.id" :class="{dim: !i.left}">
          <td>{{i.name}}<span v-if="i.color" class="cchip">{{i.color}}</span><div class="small muted">{{money(i.price)}} / {{unitName(i, i.unit)}}</div></td>
          <td class="num">{{qtyFmt(i.qty)}} {{unitName(i, i.unit)}}</td>
          <td class="num">{{i.returned ? qtyFmt(i.returned) : '—'}}</td>
          <td class="num"><input type="number" min="0" :max="i.left" step="any" v-model.number="qty[i.id]" :disabled="!i.left" style="width:100px;text-align:right"></td>
          <td class="num bold">{{money(lineSum(i))}}</td>
        </tr></tbody>
      </table>
      <div class="small muted mt" v-if="data.sale.discount">{{ $t("Sotuvda chegirma bo'lgan — qaytarish summasi chegirmaga mutanosib kamaytirildi") }}</div>
      <div class="form-grid mt">
        <div class="f"><span>{{ $t('Qaytarish summasi') }}</span><div class="calc-box" style="font-size:18px"><b>{{money(total)}}</b></div></div>
        <label class="f"><span>{{ $t('Pulni hozir qaytarish (ixtiyoriy)') }}</span>
          <div class="row" style="flex-wrap:nowrap"><money-input v-model="f.refund" style="flex:1"/><button type="button" class="btn sm" @click="f.refund = total">{{ $t("To'liq") }}</button></div></label>
        <div class="f full chips" v-if="f.refund"><button type="button" v-for="(l,k) in METHODS" :key="k" class="chip" :class="{active: f.method===k}" @click="f.method=k">{{METHOD_ICONS[k]}} {{l}}</button></div>
        <label class="f full"><span>{{ $t('Sabab / izoh') }}</span><input v-model="f.note" :placeholder="$t('Yaroqsiz, mos kelmadi ...')"></label>
      </div>
      <p class="small muted" v-if="total && !f.refund">{{ $t("Pul qaytarilmasa — summa mijozning qarzidan ayriladi (qarzi bo'lmasa, avans bo'lib qoladi)") }}</p>
    </template>
    <template #footer><button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button><button class="btn primary" :disabled="busy || !total" @click="save">↩ {{ $t('Qaytarishni saqlash') }}</button></template>
  </modal>`,
};
