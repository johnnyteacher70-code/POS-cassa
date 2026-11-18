// Akt sverki — o'zaro hisob-kitob dalolatnomasi (ulgurjida B2B mijoz bilan): chop etiladi / PDF
import { ref, reactive, computed, watch, onActivated } from 'vue';
import { get, money, dt, d, back, route, today, qs, clientName, savePdf, t } from '../lib.js';
import { loadSettings, settings } from '../docs.js';

export const ReconciliationPage = {
  setup() {
    const id = route.parts[1];
    const f = reactive({ from: route.query.from || today().slice(0, 4) + '-01-01', to: route.query.to || today() });
    const data = ref(null);
    const load = async () => { await loadSettings(); data.value = await get(`/api/clients/${id}/reconciliation` + qs(f)); };
    watch(() => [f.from, f.to], load);
    onActivated(load);
    const TYPE = { sale: 'Sotuv (nakladnoy)', opening: "Boshlang'ich qarz", payment: "To'lov", refund: 'Pul qaytarildi', return: 'Tovar qaytarildi', bonus: "Bonus bilan to'lov" };
    const pdf = () => savePdf(document.querySelector('.print-area'), `Akt_sverki_${clientName(data.value.client).replace(/\s+/g, '_')}_${f.to}.pdf`);
    const resultText = computed(() => {
      const x = data.value; if (!x) return '';
      const sum = money(Math.abs(x.closing)) + ' ' + t("so'm");
      if (x.closing > 0) return t("{0} holatiga {1}ning {2} oldidagi qarzi {3}.", [d(x.to), clientName(x.client), settings.data.company_name, sum]);
      if (x.closing < 0) return t("{0} holatiga {1}ning {2} oldidagi qarzi (avans) {3}.", [d(x.to), settings.data.company_name, clientName(x.client), sum]);
      return t("{0} holatiga o'zaro qarzdorlik yo'q.", [d(x.to)]);
    });
    const balText = (v) => (v > 0 ? money(v) + ' (' + 'mijoz qarzi' + ')' : v < 0 ? money(-v) + ' (' + 'avans' + ')' : '0');
    return { id, f, data, TYPE, pdf, money, dt, d, back, clientName, settings, balText, resultText };
  },
  template: `
  <div>
    <div class="page-head no-print">
      <a class="back" href="" @click.prevent="back('/clients/' + id)">←</a>
      <h1>{{ $t('Akt sverki') }}</h1>
      <button class="btn primary" onclick="window.print()">🖨 {{ $t('Chop etish') }}</button>
      <button class="btn" @click="pdf" v-if="data">⬇ PDF</button>
    </div>
    <div class="row mb no-print">
      <input type="date" v-model="f.from" style="width:auto"> — <input type="date" v-model="f.to" style="width:auto">
    </div>
    <div class="doc-scroll" v-if="data">
      <div class="doc print-area akt">
        <h1>{{ $t("O'zaro hisob-kitoblarni solishtirish dalolatnomasi") }}</h1>
        <div class="doc-sub">{{d(data.from)}} — {{d(data.to)}}</div>
        <p>{{ $t('Biz, quyida imzo chekuvchilar') }}: <b>{{settings.data.company_name}}</b> {{ $t('va') }} <b>{{clientName(data.client)}}</b>{{ $t(", o'zaro hisob-kitoblar holatini solishtirib, quyidagilarni tasdiqlaymiz") }}:</p>
        <table>
          <thead><tr><th>{{ $t('Sana') }}</th><th>{{ $t('Hujjat') }}</th><th>{{ $t('Debet') }}</th><th>{{ $t('Kredit') }}</th><th>{{ $t('Qoldiq') }}</th></tr></thead>
          <tbody>
            <tr class="b"><td colspan="4">{{ $t('Davr boshidagi qoldiq') }}</td><td class="n">{{balText(data.opening)}}</td></tr>
            <tr v-for="(r,i) in data.rows" :key="i">
              <td class="c">{{dt(r.date, false)}}</td>
              <td>{{ $t(TYPE[r.type]) }}<span v-if="r.doc"> № {{r.doc}}</span></td>
              <td class="n">{{r.debit ? money(r.debit) : ''}}</td><td class="n">{{r.credit ? money(r.credit) : ''}}</td>
              <td class="n">{{money(r.balance)}}</td>
            </tr>
            <tr class="b"><td colspan="2">{{ $t('Davr aylanmasi') }}</td><td class="n">{{money(data.debit)}}</td><td class="n">{{money(data.credit)}}</td><td></td></tr>
            <tr class="b"><td colspan="4">{{ $t('Davr oxiridagi qoldiq') }}</td><td class="n">{{balText(data.closing)}}</td></tr>
          </tbody>
        </table>
        <p class="words"><b>{{ $t('Natija') }}:</b> {{ resultText }}</p>
        <div class="signs">
          <div><b>{{settings.data.company_name}}</b><br>{{ $t('Rahbar') }}: ____________________<br>{{settings.data.director}}<br><span class="small">{{ $t('M.O.') }}</span></div>
          <div><b>{{clientName(data.client)}}</b><br>{{ $t('Rahbar') }}: ____________________<br>{{data.client.contact_name}}<br><span class="small">{{ $t('M.O.') }}</span></div>
        </div>
      </div>
    </div>
  </div>`,
};
