// Qo'shnilar va hamkor do'konlar bilan tovar va pul oldi-berdisi (Tovar qarzdorligi & Barter)
import { ref, reactive, computed, onActivated } from 'vue';
import { get, post, del, money, dt, toast, t } from '../lib.js';
import { Modal, MoneyInput, RegisterSelect, ItemsEditor, invalidateProducts } from '../components.js';

export const PartnerLoansPage = {
  components: { Modal, MoneyInput, RegisterSelect, ItemsEditor },
  setup() {
    const loans = ref([]);
    const partners = ref([]);
    const stats = ref({
      given_qty: 0,
      given_sum: 0,
      taken_qty: 0,
      taken_sum: 0,
      active_partners: 0,
      open_give_count: 0,
      open_take_count: 0,
      closed_count: 0,
      total_count: 0,
    });
    const tab = ref('give'); // 'give', 'take', 'closed', 'all'
    const q = ref('');
    const partnerFilter = ref('');
    const loading = ref(false);

    // Modallar
    const newModal = ref(false);
    const returnModal = ref(null); // { loan, item, qty, note }
    const payModal = ref(null);    // { loan, item, qty, amount, register_id, method, note }
    const aktModal = ref(null);    // { partner_name, loading, data }

    const load = async () => {
      loading.value = true;
      try {
        const query = new URLSearchParams();
        if (tab.value === 'give') { query.set('type', 'give'); query.set('status', 'open'); }
        else if (tab.value === 'take') { query.set('type', 'take'); query.set('status', 'open'); }
        else if (tab.value === 'closed') { query.set('status', 'closed'); }
        if (partnerFilter.value) query.set('partner', partnerFilter.value);
        if (q.value) query.set('q', q.value);

        const res = await get('/api/partners?' + query.toString());
        loans.value = res.loans || [];
        partners.value = res.partners || [];
        if (res.stats) stats.value = res.stats;
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    };

    onActivated(load);

    const filteredLoans = computed(() => loans.value);

    // 1. Yangi oldi-berdi formasi
    const newForm = reactive({
      partner_name: '',
      partner_phone: '',
      type: 'give',
      note: '',
      items: [{ product_id: null, name: '', color: '', unit: 'dona', qty: 1, price: 0 }],
    });

    const openNew = (defaultType = 'give') => {
      newForm.type = defaultType;
      newForm.partner_name = '';
      newForm.partner_phone = '';
      newForm.note = '';
      newForm.items = [{ product_id: null, name: '', color: '', unit: 'dona', qty: 1, price: 0 }];
      newModal.value = true;
    };

    const submitNew = async () => {
      if (!newForm.partner_name.trim()) return toast(t("Qo'shni do'kon nomini kiriting"), 'error');
      const validItems = newForm.items.filter((i) => i.product_id && Number(i.qty) > 0);
      if (!validItems.length) return toast(t("Kamida bitta mahsulot kiriting"), 'error');

      try {
        await post('/api/partners', {
          partner_name: newForm.partner_name.trim(),
          partner_phone: newForm.partner_phone.trim(),
          type: newForm.type,
          note: newForm.note.trim(),
          items: validItems.map((i) => ({
            product_id: i.product_id,
            color: i.color || '',
            unit: i.unit || 'dona',
            qty: Number(i.qty),
            price: Number(i.price || 0),
          })),
        });
        invalidateProducts();
        toast(t("Oldi-berdi saqlandi!"), 'ok');
        newModal.value = false;
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    // 2. Joyiga joy tovar qaytarish
    const openReturn = (loan, it) => {
      returnModal.value = {
        loan,
        item: it,
        qty: it.qty_left,
        note: '',
      };
    };

    const submitReturn = async () => {
      const m = returnModal.value;
      if (!m || !m.qty || m.qty <= 0) return toast(t("Miqdorni to'g'ri kiriting"), 'error');
      try {
        await post(`/api/partners/${m.loan.id}/return-goods`, {
          item_id: m.item.id,
          qty: Number(m.qty),
          note: m.note,
        });
        invalidateProducts();
        toast(t("Tovar omborga qaytarildi (joyiga joy)!"), 'ok');
        returnModal.value = null;
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    // 3. Tovar puli to'landi
    const openPay = (loan, it) => {
      payModal.value = {
        loan,
        item: it,
        qty: it.qty_left,
        amount: Math.round(it.qty_left * (it.price || 0)),
        register_id: null,
        method: 'cash',
        note: '',
      };
    };

    const onPayQtyChange = () => {
      const m = payModal.value;
      if (m && m.item) {
        m.amount = Math.round(Number(m.qty || 0) * (m.item.price || 0));
      }
    };

    const submitPay = async () => {
      const m = payModal.value;
      if (!m || !m.qty || m.qty <= 0) return toast(t("Miqdorni kiriting"), 'error');
      try {
        await post(`/api/partners/${m.loan.id}/pay-money`, {
          item_id: m.item.id,
          qty: Number(m.qty),
          amount: Number(m.amount || 0),
          register_id: m.register_id,
          method: m.method,
          note: m.note,
        });
        toast(t("To'lov qabul qilindi va qarz yopildi!"), 'ok');
        payModal.value = null;
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    // 4. Akt-sverka
    const openAkt = async (partnerName) => {
      aktModal.value = { partner_name: partnerName, loading: true, data: null };
      try {
        const data = await get('/api/partners/akt/' + encodeURIComponent(partnerName));
        aktModal.value.data = data;
      } catch (e) {
        toast(e.message, 'error');
        aktModal.value = null;
      } finally {
        if (aktModal.value) aktModal.value.loading = false;
      }
    };

    // 5. Bekor qilish / O'chirish
    const removeLoan = async (loan) => {
      if (!confirm(t("#{0} raqamli oldi-berdi bekor qilinsinmi? (Ombor qoldiqlari orqaga qaytadi)", [loan.id]))) return;
      try {
        await del('/api/partners/' + loan.id);
        invalidateProducts();
        toast(t("Bekor qilindi!"), 'ok');
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    const statusText = (s) => (s === 'closed' ? ("✓ To'liq yopildi") : (s === 'partial' ? ("⏳ Qisman yopilgan") : ("● Ochiq")));
    const newModalTitle = computed(() => (newForm.type === 'give' ? "🤝 Qo'shniga tovar berish (omborimizdan)" : "📥 Qo'shnidan tovar olish (bizning qarzimiz)"));
    const aktModalTitle = computed(() => (aktModal.value ? ("📄 Solishtirish dalolatnomasi (Akt-sverka): " + aktModal.value.partner_name) : ''));

    const aktTotals = computed(() => {
      if (!aktModal.value || !aktModal.value.data || !aktModal.value.data.items) {
        return { initial: 0, returned: 0, paid: 0, left: 0, sum: 0 };
      }
      const items = aktModal.value.data.items;
      return items.reduce((acc, it) => {
        acc.initial += Number(it.qty_initial || 0);
        acc.returned += Number(it.qty_returned_goods || 0);
        acc.paid += Number(it.qty_paid_money || 0);
        const lft = Math.max(0, Number(it.qty_initial || 0) - Number(it.qty_returned_goods || 0) - Number(it.qty_paid_money || 0));
        acc.left += lft;
        acc.sum += Math.round(lft * (Number(it.price) || 0));
        return acc;
      }, { initial: 0, returned: 0, paid: 0, left: 0, sum: 0 });
    });

    return {
      loans, partners, stats, tab, q, partnerFilter, loading, load, filteredLoans,
      newModal, newForm, openNew, submitNew, newModalTitle,
      returnModal, openReturn, submitReturn,
      payModal, openPay, onPayQtyChange, submitPay,
      aktModal, openAkt, aktModalTitle, aktTotals, removeLoan, money, dt, statusText,
    };
  },
  template: `
  <div class="partner-loans-wrap">
    <!-- Tepa qism -->
    <div class="partner-header">
      <div class="partner-header-title">
        <h1><span>🤝</span> {{ $t("Qo'shnilar bilan oldi-berdi") }}</h1>
        <p class="muted small" style="margin:4px 0 0">
          {{ $t("Hamkor do'konlar bilan tovar almashinuvi, joyiga joy tovar qaytarish yoki pul bilan yopish") }}
        </p>
      </div>
      <div class="partner-header-actions">
        <button type="button" class="btn btn-partner-give" @click="openNew('give')">
          <span>＋</span> <span>🤝 {{ $t("Qo'shniga berish") }}</span>
        </button>
        <button type="button" class="btn btn-partner-take" @click="openNew('take')">
          <span>＋</span> <span>📥 {{ $t("Qo'shnidan olish") }}</span>
        </button>
      </div>
    </div>

    <!-- Statistika kartochkalari -->
    <div class="partner-stats-grid">
      <div class="partner-stat-card stat-give">
        <div class="partner-stat-top">
          <span class="partner-stat-label">🔴 {{ $t("Qo'shnilardagi tovarlarimiz (kutilmoqda)") }}</span>
          <div class="partner-stat-icon">📤</div>
        </div>
        <div class="partner-stat-val">{{stats.given_qty}} <small style="font-size:14px;font-weight:600">{{ $t("dona") }}</small></div>
        <div class="partner-stat-sub">💰 {{money(stats.given_sum)}} {{ $t("so'm ekvivalenti") }}</div>
      </div>

      <div class="partner-stat-card stat-take">
        <div class="partner-stat-top">
          <span class="partner-stat-label">🟢 {{ $t("Qo'shnilardan olingan (bizning qarzimiz)") }}</span>
          <div class="partner-stat-icon">📥</div>
        </div>
        <div class="partner-stat-val">{{stats.taken_qty}} <small style="font-size:14px;font-weight:600">{{ $t("dona") }}</small></div>
        <div class="partner-stat-sub">💰 {{money(stats.taken_sum)}} {{ $t("so'm ekvivalenti") }}</div>
      </div>

      <div class="partner-stat-card stat-active">
        <div class="partner-stat-top">
          <span class="partner-stat-label">👥 {{ $t("Faol qo'shnilar va hamkorlar") }}</span>
          <div class="partner-stat-icon">🏪</div>
        </div>
        <div class="partner-stat-val">{{stats.active_partners}} <small style="font-size:14px;font-weight:600">{{ $t("ta do'kon") }}</small></div>
        <div class="partner-stat-sub">{{ $t("Ochiq hisob-kitoblar") }}</div>
      </div>
    </div>

    <!-- Filtrlash va qidiruv paneli -->
    <div class="partner-toolbar">
      <div class="partner-tabs" role="tablist">
        <button type="button" class="partner-tab-btn tab-give" :class="{active: tab==='give'}" @click="tab='give'; load()" role="tab" :aria-selected="tab==='give'">
          <span class="partner-tab-icon">🤝</span>
          <span class="partner-tab-text">{{ $t("Qo'shniga berilganlar") }}</span>
          <span v-if="stats.open_give_count !== undefined" class="partner-tab-count">{{ stats.open_give_count }}</span>
        </button>
        <button type="button" class="partner-tab-btn tab-take" :class="{active: tab==='take'}" @click="tab='take'; load()" role="tab" :aria-selected="tab==='take'">
          <span class="partner-tab-icon">📥</span>
          <span class="partner-tab-text">{{ $t("Qo'shnidan olinganlar") }}</span>
          <span v-if="stats.open_take_count !== undefined" class="partner-tab-count">{{ stats.open_take_count }}</span>
        </button>
        <button type="button" class="partner-tab-btn tab-closed" :class="{active: tab==='closed'}" @click="tab='closed'; load()" role="tab" :aria-selected="tab==='closed'">
          <span class="partner-tab-icon">✓</span>
          <span class="partner-tab-text">{{ $t("Yopilganlar tarixi") }}</span>
          <span v-if="stats.closed_count !== undefined" class="partner-tab-count">{{ stats.closed_count }}</span>
        </button>
        <button type="button" class="partner-tab-btn tab-all" :class="{active: tab==='all'}" @click="tab='all'; load()" role="tab" :aria-selected="tab==='all'">
          <span class="partner-tab-icon">📋</span>
          <span class="partner-tab-text">{{ $t("Barchasi") }}</span>
          <span v-if="stats.total_count !== undefined" class="partner-tab-count">{{ stats.total_count }}</span>
        </button>
      </div>

      <div class="row" style="gap:8px;flex:1;max-width:480px;min-width:240px;justify-content:flex-end">
        <select v-if="partners.length" v-model="partnerFilter" @change="load" style="width:auto;min-width:160px;max-width:200px;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600">
          <option value="">👥 {{ $t("Barcha do'konlar") }}</option>
          <option v-for="p in partners" :key="p.partner_name" :value="p.partner_name">
            {{p.partner_name}}
          </option>
        </select>
        <div class="search-big" style="flex:1;min-width:160px">
          <input v-model="q" @keydown.enter="load" :placeholder="$t(&quot;Qo'shni nomi, tovar...&quot;)">
        </div>
        <button type="button" class="btn primary sm" @click="load" :title="$t('Qidirish')">🔍</button>
      </div>
    </div>

    <!-- Hujjatlar ro'yxati -->
    <div v-if="loading" class="empty">⏳ {{ $t("Yuklanmoqda...") }}</div>
    <div v-else-if="!filteredLoans.length" class="card empty" style="border-radius:16px;padding:40px 20px">
      <div style="font-size:48px;margin-bottom:10px">🤝</div>
      <h3 style="margin-bottom:6px">{{ $t("Hozircha ochiq oldi-berdilar yo'q") }}</h3>
      <p class="muted" style="max-width:440px;margin:0 auto 16px">{{ $t("Qo'shni do'konga tovar berganda yoki olganda shu yerda qayd etib boring. Tovar joyiga qaytishi yoki pulini to'lashini oson boshqarasiz.") }}</p>
      <button type="button" class="btn btn-partner-give" @click="openNew('give')">＋ {{ $t("Yangi oldi-berdi ochish") }}</button>
    </div>

    <div v-else style="display:flex;flex-direction:column;gap:16px">
      <div v-for="l in filteredLoans" :key="l.id" class="partner-loan-card" :class="l.type==='give' ? 'type-give' : 'type-take'">
        
        <!-- Hujjat sarlavhasi -->
        <div class="loan-card-header">
          <div>
            <div class="loan-card-partner">
              <span class="loan-card-badge" :class="l.type==='give' ? 'loan-badge-give' : 'loan-badge-take'">
                <span>{{ l.type === 'give' ? '🤝' : '📥' }}</span>
                <span>{{ l.type === 'give' ? $t("Qo'shniga berildi") : $t("Qo'shnidan olindi") }}</span>
              </span>
              <span class="loan-card-name">🏪 {{l.partner_name}}</span>
              <span v-if="l.partner_phone" class="loan-card-phone">📞 {{l.partner_phone}}</span>
            </div>
            <div class="loan-card-meta">
              <span><b>#{{l.id}}</b></span>
              <span>·</span>
              <span>📅 {{dt(l.created_at)}}</span>
              <span v-if="l.created_by_name">· 👤 {{l.created_by_name}}</span>
              <span v-if="l.note" class="loan-note-pill">📝 «{{l.note}}»</span>
            </div>
          </div>

          <div class="loan-card-actions">
            <span class="badge" :class="{green: l.status==='closed', amber: l.status==='partial', blue: l.status==='open'}" style="font-size:12px;padding:4px 10px">
              {{ statusText(l.status) }}
            </span>
            <button type="button" class="btn-loan-akt" @click="openAkt(l.partner_name)">
              <span>📄</span> <span>{{ $t("Akt-sverka") }}</span>
            </button>
            <button type="button" class="btn-loan-del" v-if="l.status==='open'" @click="removeLoan(l)" :title="$t('Bekor qilish')">
              🗑
            </button>
          </div>
        </div>

        <!-- Tovarlar jadvali -->
        <div style="overflow-x:auto">
          <table class="t sm rt">
            <thead>
              <tr>
                <th>{{ $t("Mahsulot") }}</th>
                <th>{{ $t("Variant / Assortiment") }}</th>
                <th class="num">{{ $t("Dastlabki") }}</th>
                <th class="num">{{ $t("Joyiga qaytdi") }}</th>
                <th class="num">{{ $t("Puli to'landi") }}</th>
                <th class="num bold">{{ $t("Qolgan qarz") }}</th>
                <th class="num">{{ $t("Narxi") }}</th>
                <th class="num">{{ $t("Summasi") }}</th>
                <th class="right" v-if="l.status !== 'closed'">{{ $t("Qarzni yopish") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in l.items" :key="it.id" :style="it.is_closed ? 'opacity:.65' : ''">
                <td class="bold">{{it.name}}</td>
                <td>
                  <span v-if="it.color" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;font-size:11.5px;font-weight:600">
                    🎨 {{it.color}}
                  </span>
                  <span v-else class="muted small">—</span>
                </td>
                <td class="num">{{it.qty_initial}} {{it.unit}}</td>
                <td class="num">
                  <span class="pos bold" v-if="it.qty_returned_goods">✓ {{it.qty_returned_goods}} {{it.unit}}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="num">
                  <span class="pos bold" v-if="it.qty_paid_money">💵 {{it.qty_paid_money}} {{it.unit}}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="num bold" :style="it.qty_left > 0 ? (l.type === 'give' ? 'color:#dc2626;font-size:14px' : 'color:#059669;font-size:14px') : 'color:#64748b'">
                  {{it.qty_left}} {{it.unit}}
                </td>
                <td class="num">{{money(it.price)}} {{ $t("so'm") }}</td>
                <td class="num bold">{{money(it.sum_left)}} {{ $t("so'm") }}</td>
                <td class="right" v-if="l.status !== 'closed'">
                  <div class="loan-row-actions" v-if="it.qty_left > 0">
                    <button type="button" class="btn-action-return" @click="openReturn(l, it)" :title="$t(&quot;Qo'shni xuddi shu tovarni olib kelib berdi (omborga kiradi)&quot;)">
                      <span>📦</span> <span>{{ $t("Joyiga tovar") }}</span>
                    </button>
                    <button type="button" class="btn-action-pay" @click="openPay(l, it)" :title="$t(&quot;Qo'shni tovar pulini to'ladi (kassaga kiradi)&quot;)">
                      <span>💵</span> <span>{{ $t("Pulini berdi") }}</span>
                    </button>
                  </div>
                  <span v-else class="badge green sm">✓ {{ $t("Yopildi") }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL 1: YANGI OLDI-BERDI OCHISH -->
    <modal v-if="newModal" wide :title="newModalTitle" @close="newModal=false">
      <form @submit.prevent="submitNew">
        <div class="type-select-grid">
          <div class="type-select-card" :class="{'selected-give': newForm.type==='give'}" @click="newForm.type='give'">
            <div class="type-select-title">
              <span>🤝</span> <span>{{ $t("Qo'shniga tovar berish") }}</span>
            </div>
            <div class="type-select-desc">
              {{ $t("Bizning ombordan tovar chiqadi. Qo'shni do'kon bizdan qarzdor bo'ladi.") }}
            </div>
          </div>
          <div class="type-select-card" :class="{'selected-take': newForm.type==='take'}" @click="newForm.type='take'">
            <div class="type-select-title">
              <span>📥</span> <span>{{ $t("Qo'shnidan tovar olish") }}</span>
            </div>
            <div class="type-select-desc">
              {{ $t("Qo'shnidan tovar omborimizga kiradi. Biz qo'shniga qarzdor bo'lamiz.") }}
            </div>
          </div>
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <label class="f">
            <span class="bold">{{ $t("Qo'shni do'kon nomi / egasi") }} *</span>
            <input v-model="newForm.partner_name" list="partners-datalist" :placeholder="$t(&quot;Masalan: Baxtiyor 14-do'kon&quot;)" required>
            <datalist id="partners-datalist">
              <option v-for="p in partners" :key="p.partner_name" :value="p.partner_name"/>
            </datalist>
          </label>
          <label class="f">
            <span>{{ $t("Telefon raqami (ixtiyoriy)") }}</span>
            <input v-model="newForm.partner_phone" placeholder="+998 90 123 45 67">
          </label>
          <label class="f full">
            <span>{{ $t("Izoh / Sabab") }}</span>
            <input v-model="newForm.note" :placeholder="$t('Eslatma yoki kelishuv...')">
          </label>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:10px">
          <b style="display:block;margin-bottom:8px">📦 {{ $t("Tovarlar ro'yxati") }}</b>
          <items-editor :items="newForm.items"/>
        </div>

        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
          <button type="button" class="btn ghost" @click="newModal=false">{{ $t("Bekor") }}</button>
          <button type="submit" class="btn primary bold" style="padding:9px 18px">✓ {{ $t("Rasmiylashtirish va omborga kiritish") }}</button>
        </div>
      </form>
    </modal>

    <!-- MODAL 2: JOYIGA JOY TOVAR QAYTARISH -->
    <modal v-if="returnModal" :title="$t('📦 Joyiga joy tovar qaytarish')" @close="returnModal=null">
      <form @submit.prevent="submitReturn">
        <div style="background:var(--surface-2);padding:14px;border-radius:12px;margin-bottom:14px;border:1px solid var(--border)">
          <div class="bold" style="font-size:16px">{{returnModal.item.name}}</div>
          <div v-if="returnModal.item.color" class="small muted" style="margin-top:2px">
            {{ $t("Variant / Assortiment") }}: <b style="color:var(--text)">🎨 {{returnModal.item.color}}</b>
          </div>
          <div style="margin-top:8px;font-size:13.5px">
            {{ $t("Kutilayotgan qoldiq qarz") }}: <b style="color:var(--primary);font-size:15px">{{returnModal.item.qty_left}} {{returnModal.item.unit}}</b>
          </div>
        </div>

        <label class="f" style="margin-bottom:12px">
          <span class="bold">{{ $t("Hozir qaytarilgan tovar miqdori") }} ({{returnModal.item.unit}}) *</span>
          <div class="row" style="gap:8px;align-items:center;margin-top:4px">
            <button type="button" class="btn sm" style="width:38px;height:38px;font-size:18px;font-weight:bold" @click="returnModal.qty = Math.max(1, returnModal.qty - 1)">−</button>
            <input type="number" step="any" min="0.001" :max="returnModal.item.qty_left" v-model.number="returnModal.qty" style="max-width:130px;text-align:center;font-size:18px;font-weight:700" required>
            <button type="button" class="btn sm" style="width:38px;height:38px;font-size:18px;font-weight:bold" @click="returnModal.qty = Math.min(returnModal.item.qty_left, returnModal.qty + 1)">+</button>
            <button type="button" class="btn sm ghost" style="border:1px dashed var(--border);border-radius:8px;font-weight:600" @click="returnModal.qty = returnModal.item.qty_left">⚡ {{ $t("Barchasi") }} ({{returnModal.item.qty_left}})</button>
          </div>
          <div class="small muted" style="margin-top:6px;background:var(--surface-2);padding:8px 10px;border-radius:8px;border:1px solid var(--border)">
            ℹ️ {{ $t("Ushbu tovar to'g'ridan-to'g'ri omboringizga qayta kirim bo'ladi. Kassaga pul aralashmaydi.") }}
          </div>
        </label>

        <label class="f" style="margin-bottom:16px">
          <span>{{ $t("Izoh") }}</span>
          <input v-model="returnModal.note" :placeholder="$t('Holati yaxshi, yangi partiyadan...')">
        </label>

        <div class="row" style="justify-content:flex-end;gap:8px">
          <button type="button" class="btn ghost" @click="returnModal=null">{{ $t("Bekor") }}</button>
          <button type="submit" class="btn green bold" style="padding:9px 18px">✓ {{ $t("Omborga qabul qilish") }}</button>
        </div>
      </form>
    </modal>

    <!-- MODAL 3: PUL BILAN YOPISH -->
    <modal v-if="payModal" :title="$t('💵 Tovar pulini qabul qilish')" @close="payModal=null">
      <form @submit.prevent="submitPay">
        <div style="background:var(--surface-2);padding:14px;border-radius:12px;margin-bottom:14px;border:1px solid var(--border)">
          <div class="bold" style="font-size:16px">{{payModal.item.name}}</div>
          <div v-if="payModal.item.color" class="small muted" style="margin-top:2px">
            {{ $t("Variant / Assortiment") }}: <b style="color:var(--text)">🎨 {{payModal.item.color}}</b>
          </div>
          <div style="margin-top:8px;font-size:13.5px">
            {{ $t("Dona narxi") }}: <b>{{money(payModal.item.price)}} {{ $t("so'm") }}</b> · 
            {{ $t("Kutilayotgan qarz") }}: <b style="color:var(--primary);font-size:15px">{{payModal.item.qty_left}} {{payModal.item.unit}} ({{money(payModal.item.sum_left)}} {{ $t("so'm") }})</b>
          </div>
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <label class="f">
            <span class="bold">{{ $t("Puli to'lanayotgan dona") }} *</span>
            <input type="number" step="any" min="0.001" :max="payModal.item.qty_left" v-model.number="payModal.qty" @input="onPayQtyChange" required>
          </label>
          <label class="f">
            <span class="bold">{{ $t("Jami to'lanadigan summa") }} ({{ $t("so'm") }}) *</span>
            <money-input v-model="payModal.amount"/>
          </label>
          <label class="f">
            <span>{{ $t("Qaysi kassaga tushadi") }}</span>
            <register-select v-model="payModal.register_id" :all="false"/>
          </label>
          <label class="f">
            <span>{{ $t("To'lov turi") }}</span>
            <select v-model="payModal.method">
              <option value="cash">💵 {{ $t("Naqd pul") }}</option>
              <option value="card">💳 {{ $t("Plastik karta") }}</option>
              <option value="transfer">🏦 {{ $t("O'tkazma") }}</option>
            </select>
          </label>
        </div>

        <label class="f" style="margin-bottom:16px">
          <span>{{ $t("Izoh") }}</span>
          <input v-model="payModal.note" :placeholder="$t('Sotib pulini berdi...')">
        </label>

        <div class="row" style="justify-content:flex-end;gap:8px">
          <button type="button" class="btn ghost" @click="payModal=null">{{ $t("Bekor") }}</button>
          <button type="submit" class="btn primary bold" style="padding:9px 18px">✓ {{ $t("Kassaga qabul qilish") }}</button>
        </div>
      </form>
    </modal>

    <!-- MODAL 4: AKT-SVERKA (SOLISHTIRISH DALOLATNOMASI) -->
    <modal v-if="aktModal" wide :title="aktModalTitle" @close="aktModal=null">
      <div v-if="aktModal.loading" class="empty">⏳ {{ $t("Yuklanmoqda...") }}</div>
      <div v-else-if="aktModal.data">
        <div style="background:var(--surface-2);padding:16px;border-radius:12px;margin-bottom:16px;border:1px solid var(--border)">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:20px;font-weight:700">🏪 {{aktModal.data.partner_name}}</div>
              <div class="muted small" v-if="aktModal.data.partner_phone" style="margin-top:2px">📞 {{aktModal.data.partner_phone}}</div>
            </div>
            <div style="text-align:right">
              <span class="muted small">{{ $t("Solishtirish sanasi") }}:</span>
              <div><b>{{dt(new Date().toISOString())}}</b></div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px dashed var(--border)">
            <div style="flex:1;min-width:120px">
              <div class="small muted">{{ $t("Jami olingan tovar") }}:</div>
              <b style="font-size:15px">{{aktTotals.initial}} {{ $t("dona") }}</b>
            </div>
            <div style="flex:1;min-width:120px">
              <div class="small muted">{{ $t("Joyiga qaytarilgan") }}:</div>
              <b style="font-size:15px;color:#059669">✓ {{aktTotals.returned}} {{ $t("dona") }}</b>
            </div>
            <div style="flex:1;min-width:120px">
              <div class="small muted">{{ $t("Puli to'langan") }}:</div>
              <b style="font-size:15px;color:#4f46e5">💵 {{aktTotals.paid}} {{ $t("dona") }}</b>
            </div>
            <div style="flex:1;min-width:140px">
              <div class="small muted">{{ $t("Hozirgi qoldiq qarz") }}:</div>
              <b style="font-size:16px;color:#dc2626">{{aktTotals.left}} {{ $t("dona") }} ({{money(aktTotals.sum)}} {{ $t("so'm") }})</b>
            </div>
          </div>
        </div>

        <table class="t sm rt">
          <thead>
            <tr>
              <th>{{ $t("Hujjat") }}</th>
              <th>{{ $t("Mahsulot") }}</th>
              <th>{{ $t("Variant") }}</th>
              <th class="num">{{ $t("Dastlabki") }}</th>
              <th class="num">{{ $t("Qaytarilgan tovar") }}</th>
              <th class="num">{{ $t("To'langan pul") }}</th>
              <th class="num bold">{{ $t("Qoldiq qarz") }}</th>
              <th class="num">{{ $t("Narx") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in aktModal.data.items" :key="it.id">
              <td><span class="badge sm gray">#{{it.loan_id}}</span></td>
              <td class="bold">{{it.name}}</td>
              <td><span v-if="it.color" class="chip active sm" style="font-size:11px">🎨 {{it.color}}</span><span v-else class="muted">—</span></td>
              <td class="num">{{it.qty_initial}} {{it.unit}}</td>
              <td class="num"><span class="pos bold" v-if="it.qty_returned_goods">✓ {{it.qty_returned_goods}} {{it.unit}}</span><span v-else>—</span></td>
              <td class="num"><span class="pos bold" v-if="it.qty_paid_money">💵 {{it.qty_paid_money}} {{it.unit}}</span><span v-else>—</span></td>
              <td class="num bold" :style="it.qty_left > 0 ? 'color:#dc2626' : 'color:#059669'">{{it.qty_left}} {{it.unit}}</td>
              <td class="num">{{money(it.price)}} {{ $t("so'm") }}</td>
            </tr>
          </tbody>
        </table>

        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
          <button type="button" class="btn ghost" @click="aktModal=null">{{ $t("Yopish") }}</button>
          <button type="button" class="btn primary bold" onclick="window.print()">🖨 {{ $t("Chop etish (Print)") }}</button>
        </div>
      </div>
    </modal>
  </div>`,
};
