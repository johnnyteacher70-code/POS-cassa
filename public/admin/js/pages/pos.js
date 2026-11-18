// POS (kassa) — bitta ekranda: sotuv, to'lov, mijozlar, qarzlar, buyurtmalar, KP, chop etish.
// Savat holati localStorage da saqlanadi: sahifadan chiqib-qaytganda yoki yangilanganda ham o'chmaydi.
// Har bir narsani bosganda batafsil oyna ochiladi (ichma-ich), "← Orqaga" va telefonning orqaga tugmasi ishlaydi.
import { ref, reactive, computed, watch, shallowRef, onMounted, onActivated, onDeactivated, nextTick } from 'vue';
import {
  get, post, money, qtyFmt, dt, d, go, route, session, clientName, balanceInfo, saleStatus, debounce, toast, qs,
  METHODS, METHOD_ICONS, ORDER_STATUS, today, can, t,
} from '../lib.js';
import { loadProducts, invalidateProducts, loadRegisters } from '../components.js';
import { SaleDoc, QuoteDoc, ReceiptDoc, loadSettings, settings, boxOnly, stockLabel, trackStock } from '../docs.js';
import { baseName, packName, unitName, isFrac } from '../units.js';
import { ReturnModal } from '../returns.js';
import { ShiftBar } from './finance.js';
import { hw, beep, onScan, startCamera, printerCfg, printReceiptHw, openDrawer, autoSerial } from '../hardware.js';

import {
  PANEL_PERMS, STORE_KEY, addProduct, after, applyPromo, balance, bills, blankCart, bonusMax, bonusOn, busy, cartClient, cartEmpty, cashPart, change, clearCart, clientQuery, closeAll, closePanel, completeSale, curUnit, display, displayState, fromAdvance, itemCount, itemUnits, lastAdded, levelId, lineTotal, loadOrderToCart, newOrders, openDisplay, openPanel, park, payNow, pieces, pos, priceOf, printDoc, printJob, printReceipt, printSale, products, promoPct, promoPrice, promos, pushDisplay, refreshStock, reloadClient, reloadProducts, repriceCart, restore, saveQuote, setUnit, stack, subtotal, toDebt, total, unpark, payModalOpen, openPayModal,
} from '../pos/core.js';
import { CameraScan, ClientPanel, ClientsPanel, OrderPanel, OrdersPanel, ParkedPanel, ProductPanel, QuotePanel, ReceiptPanel, SalePanel, Shell, TodayPanel } from '../pos/panels.js?v=2.2.4';
import { CartView, CartPanel } from '../pos/cart.js?v=2.2.4';
export { pos, stack } from '../pos/core.js';

const PANELS = {
  client: ClientPanel, sale: SalePanel, product: ProductPanel, order: OrderPanel, orders: OrdersPanel,
  clients: ClientsPanel, today: TodayPanel, parked: ParkedPanel, receipt: ReceiptPanel, quote: QuotePanel, cart: CartPanel,
};

// ================= POS sahifasi =================
export const PosPage = {
  components: { CartView, SaleDoc, QuoteDoc, ReceiptDoc, ShiftBar, CameraScan },
  setup() {
    const q = ref('');
    const brand = ref('');
    const category = ref('');
    const searchEl = ref(null);
    const wide = ref(window.matchMedia('(min-width: 768px)').matches);
    const mq = window.matchMedia('(min-width: 768px)');
    mq.addEventListener('change', (e) => { wide.value = e.matches; });
    const pay = ref(null);

    const categories = computed(() => [...new Set(products.value.filter((p) => p.active).map((p) => p.category).filter(Boolean))].sort());
    const brands = computed(() => [...new Set(products.value.filter((p) => p.active)
      .filter((p) => !category.value || p.category === category.value).map((p) => p.brand).filter(Boolean))].sort());
    const branch = computed(() => session.branch);
    const filtered = computed(() => {
      const t = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      return products.value.filter((p) => p.active)
        .filter((p) => !category.value || p.category === category.value)
        .filter((p) => !brand.value || p.brand === brand.value)
        .filter((p) => t.every((x) => `${p.name || ''} ${p.category || ''} ${p.brand || ''} ${p.volume || ''} ${p.size || ''} ${(p.colors || []).join(' ')} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(x)));
    });
    const inCart = (p) => {
      const n = pos.cart.items.filter((i) => i.product_id === p.id).reduce((a, i) => a + pieces(i), 0);
      return boxOnly() && n ? +(n / (p.box_qty || 1)).toFixed(2) : n;
    };

    // ---------- Skaner / Qidiruv: shtrix-kod, artikul (ede57), kosmetika kodi + ton ----------
    const findCode = (code) => {
      const c = String(code || '').toLowerCase().trim();
      if (!c) return null;
      // 1. To'g'ridan-to'g'ri shtrix-kod yoki SKU
      const exact = products.value.find((p) => p.barcode && p.barcode.toLowerCase() === c)
        || products.value.find((p) => p.sku && p.sku.toLowerCase() === c);
      if (exact) return { product: exact, color: (exact.colors && exact.colors.length === 1 ? exact.colors[0] : '') };
      // 2. Kosmetika kodi: Masalan ede57-01 yoki ede57/02 (SKU + rang)
      for (const sep of ['-', '/', ' ']) {
        if (c.includes(sep)) {
          const parts = c.split(sep);
          const skuPart = parts[0].trim();
          const colPart = parts.slice(1).join(sep).trim();
          const p = products.value.find((x) => x.sku && x.sku.toLowerCase() === skuPart);
          if (p) {
            const matchColor = (p.colors || []).find((clr) =>
              clr.toLowerCase() === colPart || clr.toLowerCase().replace('#', '') === colPart.replace('#', '')
            );
            return { product: p, color: matchColor || colPart };
          }
        }
      }
      return null;
    };

    // Enter: shtrix-kod yoki artikul (ede57) aniq mos kelsa yoki bitta natija qolsa — savatga.
    const onEnter = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) return;
      if (/\*/.test(s)) { const code = s.split('*').pop().trim(); if (code) { q.value = s.split('*')[0] + '*'; handleScan(code); } return; }
      const match = findCode(s);
      const p = match ? match.product : (filtered.value.length === 1 ? filtered.value[0] : null);
      const color = match ? match.color : '';
      if (p) {
        const finalColor = color || (p.colors && p.colors.length === 1 ? p.colors[0] : '');
        const ok = addProduct(p, match && p.box_qty > 1 && pos.unit === 'karobka' ? 'karobka' : curUnit(), 1, finalColor);
        q.value = '';
        if (ok && navigator.vibrate) navigator.vibrate(15);
      }
      else if (/^\d{6,}$/.test(s)) { toast(t('Shtrix-kod topilmadi') + ': ' + s, 'error'); q.value = ''; }
    };

    // Assortiment (ranglar/hidlar/turlar) bo'yicha ko'p variantli tanlash
    const assortProduct = ref(null);
    const assortCounts = reactive({});
    const openAssort = (p) => {
      assortProduct.value = p;
      for (const k of Object.keys(assortCounts)) delete assortCounts[k];
      for (const c of (p.colors || [])) assortCounts[c] = 0;
    };
    const closeAssort = () => { assortProduct.value = null; };
    const incAssort = (c) => {
      const p = assortProduct.value;
      if (!p) return;
      const avail = Number(p.stock !== undefined ? p.stock : 0);
      const inCart = pos.cart.items.filter(i => i.product_id === p.id).reduce((a, i) => a + (i.unit === 'karobka' ? ((+i.qty || 0) * (i.box_qty || p.box_qty || 1)) : (+i.qty || 0)), 0);
      const unit = curUnit();
      const mult = unit === 'karobka' ? (p.box_qty || 1) : 1;
      if (inCart + (totalAssortQty.value + 1) * mult > avail) {
        toast(`Omborda yetarli emas (mavjud: ${avail} dona)`, 'error');
        return;
      }
      assortCounts[c] = (assortCounts[c] || 0) + 1;
    };
    const decAssort = (c) => { if ((assortCounts[c] || 0) > 0) assortCounts[c]--; };
    const totalAssortQty = computed(() => Object.values(assortCounts).reduce((a, b) => a + (Number(b) || 0), 0));
    const submitAssort = () => {
      const p = assortProduct.value;
      if (!p) return;
      const unit = curUnit();
      let added = 0;
      for (const [c, q] of Object.entries(assortCounts)) {
        const count = Number(q) || 0;
        if (count > 0) {
          const ok = addProduct(p, unit, count, c);
          if (ok) added += count;
        }
      }
      if (added === 0 && p.colors && p.colors.length) {
        const ok = addProduct(p, unit, 1, p.colors[0]);
        if (ok) added++;
      }
      if (added > 0 && navigator.vibrate) navigator.vibrate(15);
      closeAssort();
    };

    // Kosmetika mahsulotini savatga qo'shish
    const tap = (p) => {
      const avail = Number(p.stock !== undefined ? p.stock : 0);
      if (avail <= 0) {
        toast(t(`«${p.name}» omborda tugagan (qoldiq: 0)`), 'error');
        return;
      }
      if (p.colors && p.colors.length > 1) {
        openAssort(p);
      } else {
        const color = (p.colors && p.colors.length === 1) ? p.colors[0] : '';
        const ok = addProduct(p, curUnit(), 1, color);
        if (ok && navigator.vibrate) navigator.vibrate(15);
      }
    };

    // Maxsus rang/ton (vibr) bilan tezkor qo'shish
    const tapWithColor = (p, color) => {
      const ok = addProduct(p, curUnit(), 1, color);
      if (ok && navigator.vibrate) navigator.vibrate(15);
    };

    const refreshOrders = async () => {
      if (document.hidden) return;
      try { newOrders.value = (await get('/api/orders/count', { silent: true })).new || 0; } catch { /* jim */ }
    };
    let timer;

    const handleScan = (code) => {
      if (document.querySelector('.modal-bg:not(.cam-modal)')) return;
      const m = /^(\d+(?:[.,]\d+)?)\*$/.exec(q.value.trim());
      const mult = m ? Number(m[1].replace(',', '.')) : 1;
      let match = findCode(code);
      let p = match ? match.product : null, color = match ? match.color : '', qty = mult, unit = curUnit();
      // Tarozi yorlig'i (EAN-13): 2X + PLU(5) + vazn grammda(5) + nazorat — mahsulot artikuli/shtrix-kodi = PLU
      if (!p && /^2\d{12}$/.test(code)) {
        const plu = String(Number(code.slice(2, 7)));
        const w = Number(code.slice(7, 12)) / 1000;
        p = products.value.find((x) => x.sku && String(Number(x.sku)) === plu) || products.value.find((x) => x.barcode === code.slice(2, 7));
        if (p) { qty = Math.round(w * mult * 1000) / 1000; unit = 'dona'; }
      }
      if (!p) { beep(false); toast(t('Shtrix-kod topilmadi') + ': ' + code, 'error'); return; }
      if (p.box_qty > 1 && p.barcode && p.barcode.toLowerCase() === String(code).toLowerCase() && pos.unit === 'karobka') unit = 'karobka';
      addProduct(p, unit, qty, color || (p.colors && p.colors.length === 1 ? p.colors[0] : ''));
      beep(true);
      if (navigator.vibrate) navigator.vibrate(15);
      q.value = '';
    };
    // Oxirgi pozitsiya: + / − miqdor, Delete — o'chirish (kursor maydonda bo'lmaganda)
    const lastItem = () => pos.cart.items.find((i) => `${i.product_id}:${i.unit}:${i.color || ''}` === lastAdded.value) || pos.cart.items[pos.cart.items.length - 1];
    const onKey = (e) => {
      if (document.querySelector('.modal-bg:not(.pos-pay-modal-wrap)')) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
      if (e.key === 'F2') { e.preventDefault(); searchEl.value && searchEl.value.focus(); }
      if (e.key === 'F4') { e.preventDefault(); const el = document.querySelector('#cash-given-modal input, #cash-given input, #cash-given'); if (el) el.focus(); }
      if (e.key === 'F8') { e.preventDefault(); park(); }
      if (e.key === 'F9') {
        e.preventDefault();
        if (!payModalOpen.value) openPayModal();
        else completeSale();
      }
      if (e.key === 'F10') { e.preventDefault(); drawer(); }
      if (e.key === 'Escape') {
        if (payModalOpen.value) { e.preventDefault(); payModalOpen.value = false; return; }
        if (stack.length) { e.preventDefault(); closePanel(); }
      }
      if (!typing && (e.key === '+' || e.key === '-') && pos.cart.items.length) {
        e.preventDefault(); const it = lastItem(); it.qty = Math.max(1, (+it.qty || 0) + (e.key === '+' ? 1 : -1));
      }
      if (!typing && e.key === 'Delete' && pos.cart.items.length) { e.preventDefault(); const it = lastItem(); pos.cart.items.splice(pos.cart.items.indexOf(it), 1); lastAdded.value = ''; }
    };
    // Pul yashigi va printer holati (kassa tanlanganda)
    const printer = ref({ mode: 'browser' });
    watch(() => pos.register, async (r) => { printer.value = await printerCfg(r, true); }, { immediate: true });
    const drawer = async () => {
      if (!pos.register || printer.value.mode === 'browser') return toast("Bu kassaga chek printeri ulanmagan (Uskunalar bo'limi)", 'error');
      await openDrawer(pos.register); toast('Pul yashigi ochildi', 'ok');
    };
    const camera = ref(false);
    const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
    let offScan = null;
    onMounted(async () => { products.value = await loadProducts(); });
    // Boshqa sahifaga o'tib, brauzer "orqaga" bilan qaytilsa — ochiq oynalar tiklanadi
    let snapshot = [];
    onActivated(() => {
      // Kassa tanlanmagan bo'lsa — xodimning o'z kassasi, u ham bo'lmasa birinchi faol kassa
      if (!pos.register) {
        if (session.user && session.user.register_id) pos.register = String(session.user.register_id);
        else loadRegisters().then((l) => { const r = l.find((x) => x.active); if (r && !pos.register) pos.register = String(r.id); });
      }
      const n = (history.state && history.state.posPanel) || 0;
      if (n && snapshot.length >= n) stack.push(...snapshot.slice(0, n));
      snapshot = [];
      reloadProducts(); reloadClient(); refreshOrders();
      timer = setInterval(refreshOrders, 30000);
      document.addEventListener('keydown', onKey);
      offScan = onScan(handleScan);
      autoSerial();
    });
    onDeactivated(() => { snapshot = stack.splice(0); clearInterval(timer); document.removeEventListener('keydown', onKey); if (offScan) offScan(); });
    watch(() => pos.cart.client_id, (id, old) => { if (id !== old && (!cartClient.value || cartClient.value.id !== id)) reloadClient(); });

    const isLow = (p) => p.min_stock > 0 && p.stock <= p.min_stock && p.stock > 0;
    const clearSearch = () => { q.value = ''; if (searchEl.value) searchEl.value.focus(); };

    return {
      pos, q, brand, brands, category, categories, branch, filtered, searchEl, wide, pay, stack, PANELS, printJob, newOrders, itemCount, total, inCart,
      onEnter, tap, tapWithColor, openPanel, closePanel, money, reloadClient, boxOnly, stockLabel, trackStock, priceOf, baseName, packName, promoPct,
      handleScan, printer, drawer, camera, fullscreen, hw, openDisplay, isLow, clearSearch,
      assortProduct, assortCounts, openAssort, closeAssort, incAssort, decAssort, totalAssortQty, submitAssort,
    };
  },
  template: `
  <div class="pos-wrap">
    <div class="pos-left">
      <!-- 1. Smena va tezkor amallar paneli -->
      <div class="pos-top-bar">
        <shift-bar :register-id="pos.register"/>
        <div class="pos-top-actions">
          <button class="btn sm pos-action-btn" v-if="$can('clients.view')" @click="openPanel('clients')">👥 {{ $t("Mijozlar") }}</button>
          <button class="btn sm pos-action-btn" v-if="$can('orders.view')" @click="openPanel('orders')">
            🛒 {{ $t("Buyurtmalar") }} <span class="badge red sm" v-if="newOrders">{{newOrders}}</span>
          </button>
          <button class="btn sm green pos-action-btn" v-if="$can('payments.create')" @click="pay={direction:'in'}">⬇ {{ $t("Kirim") }}</button>
          <button class="btn sm pos-action-btn" v-if="$can('payments.create')" @click="pay={direction:'out'}">⬆ {{ $t("Chiqim") }}</button>
          <button class="btn sm pos-action-btn" @click="openPanel('today')">🧾 {{ $t("Bugun") }}</button>
          <button class="btn sm pos-action-btn" @click="openPanel('parked')">
            ⏸ {{ $t("Kutishda") }} <span class="badge gray sm" v-if="pos.parked.length">{{pos.parked.length}}</span>
          </button>
          <button class="btn sm pos-action-btn" v-if="printer.mode !== 'browser'" @click="drawer" :title="'F10'">💰 {{ $t("Yashik") }}</button>
          <div class="pos-top-divider"></div>
          <button class="btn sm icon pos-tool-icon" @click="openDisplay" title="Xaridor ekrani">🖥</button>
          <button class="btn sm icon pos-tool-icon" @click="camera=true" title="Kamera bilan skanerlash">📷</button>
          <button class="btn sm icon pos-tool-icon" @click="fullscreen" title="To'liq ekran">⛶</button>
        </div>
      </div>

      <!-- 2. Qidiruv va rejimlar qatori -->
      <div class="pos-search-strip">
        <div class="pos-search-box">
          <span class="pos-search-icon">🔍</span>
          <input ref="searchEl" v-model="q" @keydown.enter="onEnter" :placeholder="$t('Qidirish') + ' (nomi, brend, artikul, shtrix-kod)... [F2]'">
          <button class="pos-search-clear" v-if="q" @click="clearSearch" type="button" title="Tozalash">✕</button>
          <span class="pos-search-kbd" v-else>F2</span>
        </div>
        <div class="unit-toggle pos-unit-toggle" v-if="!boxOnly()" title="Bosganda qaysi birlikda qo'shilsin">
          <button :class="{on:pos.unit==='dona'}" @click="pos.unit='dona'">{{ $t("Donalab") }}</button>
          <button :class="{on:pos.unit==='karobka'}" @click="pos.unit='karobka'">{{ $t("Qadoqlab") }}</button>
        </div>
        <label class="pos-reg-select" title="Sotuv qilinadigan do'kon">
          🏪 <register-select v-model="pos.register" :all="false"/>
        </label>
      </div>

      <!-- 3. Filtr chiplari (Kategoriya va Brendlar) -->
      <div class="pos-filter-strip" v-if="categories.length > 1 || brands.length > 1">
        <div class="pos-chips-scroll" v-if="categories.length > 1">
          <button class="pos-chip-pill" :class="{active:category===''}" @click="category=''">🏷 {{ $t("Barchasi") }}</button>
          <button v-for="c in categories" :key="c" class="pos-chip-pill" :class="{active:category===c}" @click="category=c">{{c}}</button>
        </div>
        <div class="pos-chips-scroll sub-chips" v-if="brands.length > 1 && (category || brands.length < 15)">
          <button class="pos-chip-pill sm" :class="{active:brand===''}" @click="brand=''">{{ $t("Barcha brendlar") }}</button>
          <button v-for="b in brands" :key="b" class="pos-chip-pill sm" :class="{active:brand===b}" @click="brand=b">{{b}}</button>
        </div>
      </div>

      <!-- 4. Mahsulotlar vitrinasi (Grid) -->
      <div class="pos-grid">
        <div v-for="p in filtered" :key="p.id" class="pos-tile" :class="{'pos-out': (p.stock || 0) <= 0}" @click="tap(p)">
          <span class="pos-in-badge" v-if="inCart(p)">✓ {{inCart(p)}}</span>
          <button class="pos-info-btn" @click.stop="openPanel('product',{id:p.id})" :title="$t('Batafsil')">ℹ</button>
          
          <!-- Rasm yoki gradientli brend placeholder -->
          <div class="pos-card-img-wrap">
            <img v-if="p.image" :src="p.image" loading="lazy" decoding="async" @error="$event.target.style.display='none'">
            <div v-if="!p.image" class="pos-card-placeholder">
              <span class="ph-brand">{{ p.brand || p.category || 'LA CHERRY' }}</span>
              <span class="ph-icon">✨</span>
            </div>
            <div class="pos-card-out-overlay" v-if="(p.stock || 0) <= 0">
              <span>{{ $t("TUGAGAN") }}</span>
            </div>
          </div>

          <div class="pos-card-body">
            <!-- Kod & Qadoq ma'lumoti -->
            <div class="pos-card-meta">
              <span class="pos-card-sku">#{{p.sku || p.barcode || p.id}}</span>
              <span class="pos-card-box-hint" v-if="p.box_qty > 1">📦 1 kar = {{p.box_qty}} dona</span>
            </div>

            <!-- Tovar nomi -->
            <div class="pos-card-title" :title="p.name">{{p.name}}</div>

            <!-- Assortiment / Tonlar -->
            <div v-if="p.colors && p.colors.length" class="pos-card-assort-pill" @click.stop="openAssort(p)">
              ✨ {{p.colors.length}} {{ $t("xil rang/ton") }}
            </div>

            <!-- Narx (Hero Pricing) -->
            <div class="pos-card-hero-price">
              <template v-if="pos.unit === 'karobka' && p.box_qty > 1">
                <div class="hero-val">{{money(priceOf(p).box)}} <span class="hero-cur">{{ $t("so'm") }}</span></div>
                <div class="hero-sub">{{ $t("Dona") }}: {{money(priceOf(p).piece)}} {{ $t("so'm") }}</div>
              </template>
              <template v-else>
                <div class="hero-val">{{money(priceOf(p).piece)}} <span class="hero-cur">{{ $t("so'm") }}</span></div>
                <div class="hero-sub" v-if="p.box_qty > 1">{{ $t("Karobka") }}: {{money(priceOf(p).box)}} {{ $t("so'm") }}</div>
              </template>
            </div>

            <!-- Qoldiq (Stock footer) -->
            <div class="pos-card-stock-bar" :class="(p.stock || 0) <= 0 ? 'stock-empty' : (isLow(p) ? 'stock-warning' : 'stock-available')">
              <span v-if="(p.stock || 0) <= 0">🔴 {{ $t("Qoldiq: 0 dona") }}</span>
              <span v-else>
                🟢 <b>{{p.stock || 0}}</b> dona
                <span class="stock-box-num" v-if="p.box_qty > 1 && (p.stock || 0) >= p.box_qty">({{Math.floor(p.stock / p.box_qty)}} kar.)</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div class="empty" v-if="!filtered.length">{{ $t("Mahsulot topilmadi") }}</div>
    </div>

    <aside class="pos-cart card" v-if="wide"><cart-view/></aside>

    <div class="pos-bar" v-if="!wide" @click="openPanel('cart')">
      <span>🛒 {{pos.cart.items.length}} {{ $t('pozitsiya') }} · {{itemCount}} {{ $t('ta') }}</span>
      <b>{{money(total)}} {{ $t("so'm") }} ›</b>
    </div>

    <template v-if="stack.length">
      <div class="pos-drawer-bg" @click="closePanel"></div>
      <div v-for="(s,i) in stack" :key="s.key" v-show="i === stack.length-1" class="pos-drawer">
        <component :is="PANELS[s.type]" v-bind="s.props"/>
      </div>
    </template>

    <camera-scan v-if="camera" @close="camera=false" @code="handleScan"/>
    <payment-modal v-if="pay" :direction="pay.direction" :client-id="pos.cart.client_id" :register-id="pos.register" @close="pay=null" @saved="reloadClient"/>

    <!-- Assortiment tanlash modali -->
    <template v-if="assortProduct">
      <div class="pos-drawer-bg" @click="closeAssort" style="z-index:90"></div>
      <div class="modal-card assort-modal" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100;background:var(--surface);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.3);width:90%;max-width:440px;overflow:hidden;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--surface)">
          <div>
            <div class="bold" style="font-size:16px">{{assortProduct.name}}</div>
            <div class="small muted">{{ $t("Assortiment bo'yicha miqdorlarni belgilang") }}</div>
          </div>
          <button type="button" class="btn sm icon" @click="closeAssort" style="background:transparent;border:0;font-size:18px">✕</button>
        </div>
        <div style="max-height:55vh;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px">
          <div v-for="c in assortProduct.colors" :key="c" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)">
            <span class="bold" style="font-size:14px">{{c}}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" class="btn sm" style="width:34px;height:34px;padding:0;font-size:16px" @click="decAssort(c)">−</button>
              <input type="number" min="0" v-model.number="assortCounts[c]" style="width:50px;text-align:center;padding:5px 4px;font-weight:700;font-size:15px;border-radius:6px;border:1px solid var(--border)">
              <button type="button" class="btn sm primary" style="width:34px;height:34px;padding:0;font-size:16px" @click="incAssort(c)">+</button>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--border);background:var(--surface)">
          <div>
            <div class="small muted">{{ $t('Jami tanlandi') }}:</div>
            <b style="font-size:16px;color:var(--primary)">{{totalAssortQty}} {{ $t('dona') }}</b>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn ghost" @click="closeAssort">{{ $t('Bekor') }}</button>
            <button type="button" class="btn primary bold" @click="submitAssort">🛒 {{ $t("Savatga qo'shish") }} ({{totalAssortQty}})</button>
          </div>
        </div>
      </div>
    </template>

    <teleport to="body">
      <div class="print-portal" v-if="printJob">
        <sale-doc v-if="printJob.kind==='sale'" :sale="printJob.data"/>
        <receipt-doc v-if="printJob.kind==='receipt'" :sale="printJob.data"/>
        <quote-doc v-if="printJob.kind==='quote'" :quote="printJob.data"/>
      </div>
    </teleport>
  </div>`,
};

// CartView barcha oynalarda ishlatiladi
PosPage.components.CartView = CartView;
CartPanel.components.CartView = CartView;

