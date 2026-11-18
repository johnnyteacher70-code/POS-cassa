// POS savati: mijoz, pozitsiyalar, chegirma, to'lov (aralash, bonus, naqd → qaytim), yakunlash.
import { ref, reactive, computed, watch, shallowRef, onMounted, onActivated, onDeactivated, nextTick } from 'vue';
import {
  get, post, money, qtyFmt, dt, d, go, route, session, clientName, balanceInfo, saleStatus, debounce, toast, qs,
  METHODS, METHOD_ICONS, ORDER_STATUS, today, can, t,
} from '../lib.js';
import { loadProducts, invalidateProducts, loadRegisters } from '../components.js';
import { SaleDoc, QuoteDoc, ReceiptDoc, loadSettings, settings, boxOnly, stockLabel, trackStock } from '../docs.js';
import { baseName, packName, unitName, isFrac } from '../units.js';
import { ReturnModal } from '../returns.js';
import { ShiftBar } from '../pages/finance.js';
import { hw, beep, onScan, startCamera, printerCfg, printReceiptHw, openDrawer, autoSerial } from '../hardware.js';

import {
  PANEL_PERMS, STORE_KEY, addProduct, after, applyPromo, balance, bills, blankCart, bonusMax, bonusOn, busy, cartClient, cartEmpty, cashPart, change, clearCart, clientQuery, closeAll, closePanel, completeSale, curUnit, display, displayState, fromAdvance, itemCount, itemUnits, lastAdded, levelId, lineTotal, loadOrderToCart, newOrders, openDisplay, openPanel, park, payNow, pieces, pos, priceOf, printDoc, printJob, printReceipt, printSale, products, promoPct, promoPrice, promos, pushDisplay, refreshStock, reloadClient, reloadProducts, repriceCart, restore, saveQuote, setUnit, stack, subtotal, toDebt, total, unpark, payModalOpen, openPayModal,
} from './core.js';
import { Shell } from './panels.js';

// ================= Savat =================

export const CartView = {
  setup() {
    const pickClient = (c) => { cartClient.value = c; clientQuery.value = ''; };
    const detachOrder = () => { pos.cart.order_id = null; };
    const askClear = () => { if (confirm('Savat tozalansinmi?')) clearCart(); };
    const frac = (it) => isFrac(itemUnits(it)) && it.unit !== 'karobka';
    const decQty = (it) => {
      const f = frac(it);
      const step = f ? 0.1 : 1;
      const min = f ? 0.001 : 1;
      it.qty = Math.max(min, Math.round(((+it.qty || 1) - step) * 1000) / 1000);
    };
    const incQty = (it) => {
      const p = it.product_id && products.value.find((x) => x.id === it.product_id);
      const avail = p ? Number(p.stock || 0) : Infinity;
      const bq = Number(it.box_qty || 1);
      const mult = it.unit === 'karobka' ? bq : 1;
      const f = frac(it);
      const step = f ? 0.1 : 1;
      const nextQty = Math.round(((+it.qty || 0) + step) * 1000) / 1000;

      if (p && trackStock(p)) {
        const otherPieces = pos.cart.items
          .filter((x) => x !== it && x.product_id === it.product_id)
          .reduce((sum, x) => sum + (Number(x.qty || 0) * (x.unit === 'karobka' ? Number(x.box_qty || 1) : 1)), 0);
        if (otherPieces + (nextQty * mult) > avail) {
          toast(t("Omborda yetarli mahsulot yo'q (mavjud: {n})", { n: avail }), 'error');
          return;
        }
      }
      it.qty = nextQty;
    };
    const validateQty = (it) => {
      const p = it.product_id && products.value.find((x) => x.id === it.product_id);
      const avail = p ? Number(p.stock || 0) : Infinity;
      const bq = Number(it.box_qty || 1);
      const mult = it.unit === 'karobka' ? bq : 1;
      const f = frac(it);
      const min = f ? 0.001 : 1;
      let q = Math.max(min, Number(it.qty) || min);

      if (p && trackStock(p)) {
        const otherPieces = pos.cart.items
          .filter((x) => x !== it && x.product_id === it.product_id)
          .reduce((sum, x) => sum + (Number(x.qty || 0) * (x.unit === 'karobka' ? Number(x.box_qty || 1) : 1)), 0);
        const remAvail = Math.max(0, avail - otherPieces);
        const maxQty = mult > 1 ? Math.floor(remAvail / mult) : remAvail;
        if (q > maxQty) {
          q = Math.max(min, maxQty);
          toast(t("Omborda yetarli mahsulot yo'q (mavjud: {n})", { n: avail }), 'error');
        }
      }
      it.qty = Math.round(q * 1000) / 1000;
    };
    const usdRate = computed(() => Number(settings.data && settings.data.usd_rate) || 0);
    const usdTotal = computed(() => (settings.data && settings.data.usd_enabled === '1' && usdRate.value > 0 ? (total.value / usdRate.value).toFixed(2) : null));

    const roundRem = computed(() => {
      const s = subtotal.value;
      if (s <= 1000) return 0;
      const rem10k = s % 10000;
      if (rem10k > 0) return rem10k;
      const rem50k = s % 50000;
      if (rem50k > 0) return rem50k;
      return 0;
    });
    const applyPercentDisc = (pct) => {
      if (!subtotal.value) return;
      const d = Math.round((subtotal.value * pct) / 100);
      pos.cart.discount = d > 0 ? d : '';
    };
    const applyFixedDisc = (val) => {
      if (!subtotal.value) return;
      pos.cart.discount = Math.min(subtotal.value, Math.max(0, (+pos.cart.discount || 0) + val));
    };
    const setExactDisc = (val) => {
      pos.cart.discount = Math.min(subtotal.value, Math.max(0, val));
    };

    watch(() => pos.cart.discount, (newD, oldD) => {
      const prevExpected = Math.max(0, subtotal.value - (+oldD || 0) - Math.max(0, balance.value));
      if (!pos.cart.pay_amount || +pos.cart.pay_amount === prevExpected) {
        pos.cart.pay_amount = Math.max(0, total.value - Math.max(0, balance.value));
      }
    });

    const lendToPartner = async () => {
      if (!pos.cart.items.length) return;
      const name = prompt(t("Qo'shni do'kon nomi yoki sotuvchi (masalan: Baxtiyor 14-do'kon):"));
      if (!name || !name.trim()) return;
      try {
        busy.value = true;
        await post('/api/partners', {
          partner_name: name.trim(),
          type: 'give',
          items: pos.cart.items.map((it) => ({
            product_id: it.product_id,
            name: it.name,
            color: it.color || '',
            unit: it.unit || 'dona',
            qty: it.qty,
            price: it.price,
          })),
          note: "POS savatidan qo'shniga berildi",
        });
        toast(t("Tovarlar qo'shniga muvaffaqiyatli berildi!"), 'ok');
        clearCart();
        await reloadProducts();
      } catch (e) {
        toast(e.message || t('Xatolik yuz berdi'), 'err');
      } finally {
        busy.value = false;
      }
    };
    const clientModalOpen = ref(false);
    const onClientPicked = (c) => { pickClient(c); clientModalOpen.value = false; };
    const completeSaleFromModal = async () => { await completeSale(); };

    return {
      clientQuery, pos, cartClient, subtotal, total, balance, payNow, fromAdvance, toDebt, after, busy, lineTotal, pieces,
      setUnit, completeSale, saveQuote, park, askClear, pickClient, detachOrder, openPanel, money, qtyFmt, boxOnly, baseName, packName, unitName, itemUnits,
      clientName, balanceInfo, METHODS, METHOD_ICONS, cashPart, change, bills, lastAdded, bonusMax, decQty, incQty, validateQty, usdTotal, lendToPartner,
      roundRem, applyPercentDisc, applyFixedDisc, setExactDisc,
      clientModalOpen, onClientPicked, payModalOpen, openPayModal, completeSaleFromModal,
    };
  },
  template: `
  <div class="pos-cart-in">
    <!-- 1. Mijoz qismi (Dropdown / Modal ko'rinishi) -->
    <div class="pos-sec pos-sec-client-compact">
      <div class="pos-client-dropdown-btn" :class="{selected: cartClient}" @click="clientModalOpen = true" :title="$t('Mijozni tanlash yoki almashtirish')">
        <div class="pos-cl-btn-left">
          <span class="pos-cl-avatar" :class="{active: cartClient}">
            {{ cartClient ? (cartClient.name || 'M').slice(0, 2).toUpperCase() : '👤' }}
          </span>
          <div class="pos-cl-text">
            <span class="pos-cl-label">{{ $t("Mijoz") }}:</span>
            <span class="pos-cl-val">{{ cartClient ? clientName(cartClient) : $t("Chakana xaridor") }}</span>
          </div>
        </div>
        <div class="pos-cl-btn-right">
          <span v-if="cartClient" class="badge sm" :class="balanceInfo(cartClient.balance).cls" style="margin-right:2px">
            {{ money(cartClient.balance) }}
          </span>
          <button v-if="cartClient" type="button" class="btn icon sm ghost pos-cl-del" @click.stop="pos.cart.client_id=null; cartClient=null" :title="$t('Chakana xaridorga qaytarish')">✕</button>
          <span v-else class="pos-cl-arrow">▾</span>
        </div>
      </div>
    </div>

    <!-- 2. Tovarlar ro'yxati (keng, erkin scroll) -->
    <div class="pos-sec pos-sec-items-main">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>{{ $t("Savat") }} <span class="badge gray sm" v-if="pos.cart.items.length">{{pos.cart.items.length}}</span></b>
        <button class="btn sm ghost" v-if="pos.cart.items.length" @click="askClear">🗑 {{ $t("Tozalash") }}</button>
      </div>

      <div class="pos-cart-items-scroll" v-if="pos.cart.items.length">
        <div v-for="(it,i) in pos.cart.items" :key="i" class="pos-line" :class="{flash: lastAdded === it.product_id + ':' + it.unit + ':' + (it.color || '')}">
          <div class="pos-line-head">
            <div class="pos-line-title-wrap" @click="it.product_id && openPanel('product',{id:it.product_id})">
              <div class="pos-line-name">{{it.name}}</div>
              <select v-if="(it.colors && it.colors.length) || it.color" v-model="it.color" class="pos-line-color-sel" :class="{need: !it.color}" @click.stop>
                <option value="">🎨 {{ $t("Rang/Ton tanlang") }}</option>
                <option v-for="c in (it.colors && it.colors.length ? it.colors : [it.color])" :key="c" :value="c">{{c}}</option>
              </select>
              <div class="pos-line-promo" v-if="it.promo">🏷 {{ $t("Aksiya") }} −{{it.promo}}%</div>
              <div class="pos-line-meta">
                <template v-if="it.unit==='karobka'">
                  {{packName(itemUnits(it))}}: {{it.box_qty}} {{baseName(itemUnits(it))}} · {{ $t("jami") }} {{qtyFmt(pieces(it))}} {{baseName(itemUnits(it))}}
                </template>
                <template v-else>{{qtyFmt(pieces(it))}} {{baseName(itemUnits(it))}}</template>
              </div>
            </div>
            <b class="pos-line-total">{{money(lineTotal(it))}}</b>
            <button class="btn icon sm ghost pos-line-del" @click="pos.cart.items.splice(i,1)" title="O'chirish">✕</button>
          </div>

          <div class="pos-line-controls">
            <div class="unit-toggle sm" v-if="(!boxOnly() || it.unit!=='karobka') && (it.box_qty > 1 || it.unit==='karobka')">
              <button :class="{on:it.unit==='dona'}" @click="setUnit(it,'dona')">{{baseName(itemUnits(it))}}</button>
              <button :class="{on:it.unit==='karobka'}" @click="setUnit(it,'karobka')">{{packName(itemUnits(it))}}</button>
            </div>
            <span class="small muted" v-else>{{unitName(itemUnits(it), it.unit)}}:</span>
            <div class="stepper">
              <button class="btn sm" @click="decQty(it)">−</button>
              <input type="number" min="0" step="any" v-model.number="it.qty" @change="validateQty(it)" inputmode="decimal">
              <button class="btn sm" @click="incQty(it)">+</button>
            </div>
            <money-input v-if="$can('sales.price')" v-model="it.price" style="min-width:0;flex:1" title="Narx"/>
            <b v-else class="pos-line-unit-price" title="Narx">{{money(it.price)}}</b>
          </div>
        </div>
      </div>

      <div class="pos-cart-empty" v-else>
        <div class="pos-cart-empty-icon">🛒</div>
        <div class="pos-cart-empty-title">{{ $t("Savat bo'sh") }}</div>
        <div class="pos-cart-empty-desc">{{ $t("Mahsulotni tanlang yoki skanerdan o'tkazing") }}</div>
      </div>
    </div>

    <!-- 3. Savat pastki paneli (Jami summa va To'lov tugmasi) -->
    <div class="pos-cart-footer" v-if="pos.cart.items.length">
      <div class="pos-footer-totals">
        <div class="footer-row-sub">
          <span>{{pos.cart.items.length}} {{ $t("ta tovar") }} · {{itemCount}} {{ $t("dona") }}</span>
          <span v-if="+pos.cart.discount" class="neg">🎁 −{{money(pos.cart.discount)}}</span>
        </div>
        <div class="footer-row-total">
          <span class="total-lbl">{{ $t("Jami to'lov") }}:</span>
          <b class="total-val">{{money(total)}} <small class="total-cur">{{ $t("so'm") }}</small></b>
        </div>
      </div>

      <!-- Katta To'lovga o'tish tugmasi -->
      <button class="btn green pos-pay-btn" :disabled="busy || !pos.cart.items.length" @click="openPayModal">
        <span>💳 {{ $t("To'lovga o'tish") }}</span>
        <span class="pos-pay-kbd">F9 ›</span>
      </button>

      <div class="pos-footer-secondary-btns">
        <button class="btn sm ghost" style="flex:1" @click="park">⏸ {{ $t("Kutishga") }}</button>
        <button class="btn sm ghost" style="flex:1" v-if="$can('quotes.edit')" @click="saveQuote">📄 {{ $t("KP") }}</button>
        <button class="btn sm ghost" style="flex:1" v-if="$can('partners.manage', 'pos.use')" @click="lendToPartner" title="Qo'shni do'konga tovar berish">🤝 {{ $t("Qo'shniga") }}</button>
      </div>
    </div>

    <!-- Mijoz tanlash modali -->
    <modal v-if="clientModalOpen" title="Mijoz tanlash" @close="clientModalOpen=false">
      <div class="pos-client-modal-wrap">
        <div class="pos-cl-modal-desc">
          {{ $t("Mijozni nomi, telefoni yoki INN orqali qidiring:") }}
        </div>
        <client-picker v-model="pos.cart.client_id" quick @picked="onClientPicked" @query="v => clientQuery = v"/>
        <div class="pos-cl-modal-quick-actions">
          <button type="button" class="btn ghost" @click="pos.cart.client_id=null; cartClient=null; clientModalOpen=false">
            👤 {{ $t("Chakana xaridor (Anonim)") }}
          </button>
          <button type="button" class="btn primary" @click="clientModalOpen=false">
            ✓ {{ $t("Yopish") }}
          </button>
        </div>
      </div>
    </modal>

    <!-- 💰 TO'LOV MODALI (Two-Step Checkout) -->
    <modal v-if="payModalOpen" title="To'lovni qabul qilish" wide @close="payModalOpen=false">
      <div class="pos-pay-sheet">
        <!-- Hero Box: Jami summa va mijoz -->
        <div class="pay-sheet-hero">
          <div class="pay-hero-left">
            <span class="pay-hero-lbl">{{ $t("To'lanadigan jami summa") }}</span>
            <div class="pay-hero-sum">{{money(total)}} <span class="cur">{{ $t("so'm") }}</span></div>
            <div v-if="usdTotal" class="pay-hero-usd">≈ \${{usdTotal}}</div>
          </div>
          <div class="pay-hero-right" v-if="cartClient">
            <div class="pay-client-badge">
              <span class="cl-icon">👤</span>
              <div>
                <div class="cl-name">{{clientName(cartClient)}}</div>
                <div class="cl-bal" :class="balanceInfo(balance).cls">Balans: {{money(balance)}}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="pay-sheet-body">
          <!-- 1. To'lov usullari kartochkalari -->
          <div class="pay-methods-selector">
            <label class="small bold mb block">{{ $t("To'lov usuli") }}</label>
            <div class="pay-methods-pills">
              <button v-for="(l,k) in METHODS" :key="k" type="button" class="pay-method-pill" :class="{active:pos.cart.pay_method===k}" @click="pos.cart.pay_method=k">
                <span class="pill-ico">{{METHOD_ICONS[k]}}</span>
                <span class="pill-txt">{{l}}</span>
              </button>
              <button type="button" class="pay-method-pill split-pill" :class="{active:pos.cart.split}" @click="pos.cart.split = !pos.cart.split; pos.cart.pay2_method = pos.cart.pay2_method || 'card'">
                <span class="pill-ico">½</span>
                <span class="pill-txt">{{ $t("Aralash (Split)") }}</span>
              </button>
            </div>
          </div>

          <!-- 2. Naqd to'lov: Berilgan pul, Qaytim va Kupyuralar -->
          <div class="pay-cash-block" v-if="pos.cart.pay_method === 'cash'">
            <div class="row" style="align-items:flex-end;gap:12px">
              <div style="flex:1">
                <label class="small bold mb block">{{ $t("Mijoz bergan pul") }} <span class="kbd">F4</span></label>
                <money-input id="cash-given-modal" v-model="pos.cart.cash_given" placeholder="Summani kiriting..." autofocus/>
              </div>
              <div class="pay-bills-flex">
                <button v-for="b in bills" :key="b" type="button" class="pay-bill-btn" @click="pos.cart.cash_given = b">
                  {{money(b)}}
                </button>
              </div>
            </div>

            <!-- Qaytim yoki Yetmayapti ko'rinishi -->
            <div class="pay-change-card" v-if="change > 0">
              <span class="change-icon">🎉</span>
              <div>
                <span class="change-label">{{ $t("Qaytim beriladi") }}:</span>
                <b class="change-amount">{{money(change)}} {{ $t("so'm") }}</b>
              </div>
            </div>
            <div class="pay-shortage-card" v-else-if="+pos.cart.cash_given && +pos.cart.cash_given < cashPart">
              <span>⚠️ {{ $t("Yetmayapti") }}:</span>
              <b>{{money(cashPart - pos.cart.cash_given)}} {{ $t("so'm") }}</b>
            </div>
          </div>

          <!-- 3. Aralash to'lov (Split) bo'lsa -->
          <div class="pay-split-block" v-if="pos.cart.split">
            <div class="small bold mb">{{ $t("Ikkinchi to'lov turi") }}</div>
            <div class="chips mb">
              <button v-for="(l,k) in METHODS" :key="k" type="button" class="chip" :class="{active:pos.cart.pay2_method===k}" @click="pos.cart.pay2_method=k">
                {{METHOD_ICONS[k]}} {{l}}
              </button>
            </div>
            <div class="row">
              <money-input v-model="pos.cart.pay2_amount" style="flex:1" placeholder="Ikkinchi to'lov summasi"/>
              <button type="button" class="btn sm" @click="pos.cart.pay2_amount = Math.max(0, total - Math.max(0, balance) - (+pos.cart.pay_amount || 0))">{{ $t("Qolgani") }}</button>
            </div>
          </div>

          <!-- 4. Nasiya (Qarz) muddati va Izoh -->
          <div class="pay-debt-block" v-if="toDebt">
            <div class="form-grid" style="grid-template-columns:1fr 1fr">
              <label class="f"><span>{{ $t("Qarz muddati") }}</span><input type="date" v-model="pos.cart.due_date"></label>
              <label class="f"><span>{{ $t("Izoh") }}</span><input v-model="pos.cart.note" placeholder="Eslatma yoki sabab..."></label>
            </div>
          </div>

          <!-- 5. Chegirma va Yaxlitlash -->
          <div class="pay-discount-block" v-if="$can('sales.discount')">
            <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
              <span class="small bold">🎁 {{ $t("Chegirma / O'tib berish") }}</span>
              <button v-if="roundRem > 0" type="button" class="btn sm ghost round-btn" @click="setExactDisc(roundRem)">
                ✂️ Qoldiqni yaxlitlash (−{{money(roundRem)}})
              </button>
              <button v-if="+pos.cart.discount" type="button" class="btn sm ghost neg-btn" @click="pos.cart.discount=''">
                ✕ {{ $t("Chegirmani bekor qilish") }}
              </button>
            </div>
            <div class="row" style="gap:8px;align-items:center">
              <money-input v-model="pos.cart.discount" placeholder="O'tib berilgan summa..." style="flex:1"/>
              <div class="chips" style="gap:4px">
                <button type="button" class="chip" @click="applyPercentDisc(3)">−3%</button>
                <button type="button" class="chip" @click="applyPercentDisc(5)">−5%</button>
                <button type="button" class="chip" @click="applyPercentDisc(10)">−10%</button>
                <button type="button" class="chip" @click="applyFixedDisc(10000)">+10k</button>
                <button type="button" class="chip" @click="applyFixedDisc(20000)">+20k</button>
                <button type="button" class="chip" @click="applyFixedDisc(50000)">+50k</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Pastki amallar: Bekor qilish va Sotuvni yakunlash -->
        <div class="pay-sheet-actions">
          <button type="button" class="btn ghost lg" @click="payModalOpen=false">
            ✕ {{ $t("Bekor qilish") }}
          </button>
          <button type="button" class="btn green lg pay-final-btn" :disabled="busy" @click="completeSaleFromModal">
            <span class="spin" v-if="busy"></span>
            <span v-else>✓ {{ $t("Sotuvni yakunlash") }} [Enter]</span>
          </button>
        </div>
      </div>
    </modal>
  </div>`,
};

export const CartPanel = {
  components: { Shell, CartView },
  template: `<shell title="Savat"><cart-view/></shell>`,
};

