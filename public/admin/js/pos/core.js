// POS holati va amallari: savat, narx (narx turi, aksiya), mijoz, chop etish, panellar steki, xaridor ekrani.
// Savat localStorage da saqlanadi. Komponentlar: pos/panels.js, pos/cart.js, sahifa — pages/pos.js.
import { ref, reactive, computed, watch, shallowRef, onMounted, onActivated, onDeactivated, nextTick } from 'vue';
import {
  get, post, money, qtyFmt, dt, d, go, route, session, clientName, balanceInfo, saleStatus, debounce, toast, qs,
  METHODS, METHOD_ICONS, ORDER_STATUS, today, can, t, docAction, isMobile,
} from '../lib.js';
import { loadProducts, invalidateProducts, loadRegisters } from '../components.js';
import { SaleDoc, QuoteDoc, ReceiptDoc, loadSettings, settings, boxOnly, stockLabel, trackStock } from '../docs.js';
import { baseName, packName, unitName, isFrac } from '../units.js';
import { ReturnModal } from '../returns.js';
import { ShiftBar } from '../pages/finance.js';
import { hw, beep, onScan, startCamera, printerCfg, printReceiptHw, openDrawer, autoSerial } from '../hardware.js';

let productsVersion = null;

// ================= Holat (saqlanadi) =================
export const STORE_KEY = 'pos_v1';
export function blankCart() {
  return { client_id: null, items: [], discount: '', note: '', due_date: '', pay_amount: '', pay_method: 'cash', pay2_amount: '', pay2_method: 'card', split: false, cash_given: '', bonus_pay: '', order_id: null };
}
export function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.cart) return { unit: 'dona', parked: [], register: '', ...s };
  } catch { /* bo'sh */ }
  return { cart: blankCart(), unit: 'dona', parked: [], register: '' };
}
export const pos = reactive(restore());
watch(pos, (v) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* jim */ } }, { deep: true });

export const cartClient = ref(null);
export const products = ref([]);
export const promos = ref([]);   // bugungi aksiyalar
export const newOrders = ref(0);
export const busy = ref(false);

// Ro'yxat keshdan (mahsulot o'zgartirilsa kesh tozalanadi), qoldiqlar esa har safar serverdan — yengil so'rov
export async function refreshStock() {
  try {
    const r = await get('/api/products/stock', { silent: true });
    // Mahsulotlar o'zgargan (boshqa joyda qo'shilgan / tahrirlangan) — ro'yxat to'liq yangilanadi
    if (productsVersion !== null && r.v !== productsVersion) {
      invalidateProducts();
      products.value = await loadProducts(true);
    }
    productsVersion = r.v;
    const m = new Map(r.s);
    for (const p of products.value) if (m.has(p.id)) p.stock = m.get(p.id);
    try {
      const { productStore } = await import('../components.js');
      if (productStore && productStore.list && productStore.list.length) {
        for (const p of productStore.list) if (m.has(p.id)) p.stock = m.get(p.id);
      }
    } catch { /* jim */ }
  } catch { /* jim */ }
}
export async function reloadProducts() {
  products.value = await loadProducts();
  promos.value = await get('/api/price-levels/promotions/active', { silent: true }).catch(() => []);
  await refreshStock();
}
// Aksiya foizi (server bilan bir xil qoida): mahsulot / kategoriya / hammasi, miqdor sharti bilan
export function promoPct(p, pcs = 0) {
  let best = 0;
  for (const a of promos.value) {
    const hit = a.scope === 'all' || (a.scope === 'category' && a.target === (p.category || '')) || (a.scope === 'product' && +a.target === p.id);
    if (hit && pcs >= (a.min_qty || 0) && a.percent > best) best = a.percent;
  }
  return best;
}
export const promoPrice = (price, pct) => (pct > 0 ? Math.round(price * (1 - pct / 100) / 100) * 100 : price);
// Savatdagi miqdor o'zgarsa — aksiya (minimal miqdor sharti) qayta qo'llanadi
export function applyPromo(it) {
  const p = it.product_id && products.value.find((x) => x.id === it.product_id);
  if (!p || !promos.value.length) return;
  const any = promos.value.some((a) => a.scope === 'all' || (a.scope === 'category' && a.target === (p.category || '')) || (a.scope === 'product' && +a.target === p.id));
  if (!any) return;
  const base = it.unit === 'karobka' ? it.box_price : it.piece_price;
  it.promo = promoPct(p, (it.unit === 'karobka' ? (+it.qty || 0) * (it.box_qty || 1) : +it.qty || 0));
  it.price = promoPrice(base, it.promo);
}
export async function reloadClient() {
  const id = pos.cart.client_id;
  const before = levelId();
  cartClient.value = id ? (await get('/api/clients/' + id + '?brief=1', { silent: true }).catch(() => ({ client: null }))).client : null;
  if (levelId() !== before && !pos.cart.order_id) repriceCart();
}

export const lineTotal = (it) => Math.round((+it.qty || 0) * (+it.price || 0));
export const pieces = (it) => (it.unit === 'karobka' ? (+it.qty || 0) * (+it.box_qty || 1) : +it.qty || 0);
export const subtotal = computed(() => pos.cart.items.reduce((a, i) => a + lineTotal(i), 0));
export const total = computed(() => Math.max(0, subtotal.value - (+pos.cart.discount || 0)));
export const balance = computed(() => (cartClient.value ? cartClient.value.balance : 0));
// Aralash to'lov: ikkinchi to'lov turi (masalan, qolganini karta bilan)
export const payNow = computed(() => (+pos.cart.pay_amount || 0) + (pos.cart.split ? +pos.cart.pay2_amount || 0 : 0) + (+pos.cart.bonus_pay || 0));
// Bonus: yoqilgan bo'lsa va mijozda bonus bo'lsa — chekning ko'pi bilan N foizi
export const bonusOn = computed(() => settings.data.bonus_enabled === '1');
export const bonusMax = computed(() => (bonusOn.value && cartClient.value ? Math.max(0, Math.min(Math.floor(cartClient.value.bonus || 0), Math.floor(total.value * (Number(settings.data.bonus_max_pay || 50)) / 100))) : 0));
export const fromAdvance = computed(() => Math.max(0, Math.min(balance.value, total.value - payNow.value)));
export const toDebt = computed(() => Math.max(0, total.value - payNow.value - fromAdvance.value));
export const after = computed(() => balance.value - total.value + payNow.value);
export const itemCount = computed(() => pos.cart.items.reduce((a, i) => a + (+i.qty || 0), 0));

export const clientQuery = ref('');   // mijoz qidiruviga yozilgan matn (tanlanmagan bo'lsa — shu bilan tez yaratiladi)
export const curUnit = () => (boxOnly() ? 'karobka' : pos.unit);
// Mijozning narx turi bo'yicha narx (shu turda narx berilmagan bo'lsa — asosiy narx)
export const levelId = () => (cartClient.value && cartClient.value.price_level_id) || 0;
export function priceOf(p, lvl = levelId()) {
  const lp = lvl && p.prices && p.prices[lvl];
  return lp && lp[0] > 0 ? { piece: lp[0], box: lp[1] || lp[0] * p.box_qty } : { piece: p.piece_price, box: p.box_price };
}
export function addProduct(p, unit = curUnit(), qty = 1, color = '') {
  const pData = products.value.find((x) => x.id === p.id) || p;
  const avail = Number(pData.stock !== undefined ? pData.stock : p.stock || 0);

  if (avail <= 0) {
    toast(`«${p.name}» omborda tugagan (qoldiq: 0)`, 'error');
    return false;
  }

  const inCartPieces = pos.cart.items
    .filter((i) => i.product_id === p.id)
    .reduce((a, i) => a + (i.unit === 'karobka' ? ((+i.qty || 0) * (i.box_qty || p.box_qty || 1)) : (+i.qty || 0)), 0);

  const addingPieces = unit === 'karobka' ? (qty * (p.box_qty || 1)) : qty;

  if (inCartPieces + addingPieces > avail) {
    toast(`«${p.name}» omborda yetarli emas (mavjud: ${avail} dona, savatda: ${inCartPieces} dona)`, 'error');
    return false;
  }

  lastAdded.value = `${p.id}:${unit}:${color}`;
  const ex = pos.cart.items.find((i) => i.product_id === p.id && i.unit === unit && (i.color || '') === color);
  if (ex) { ex.qty = Math.round(((+ex.qty || 0) + qty) * 1000) / 1000; return true; }
  const pr = priceOf(p);
  pos.cart.items.push({
    product_id: p.id, name: [p.name, p.volume, p.size].filter(Boolean).join(' '), color, colors: p.colors || [], image: p.image, unit, qty, box_qty: p.box_qty,
    piece_price: pr.piece, box_price: pr.box, price: unit === 'karobka' ? pr.box : pr.piece,
    unit_code: p.unit || 'dona', pack_name: p.pack_name || 'karobka',
  });
  applyPromo(pos.cart.items[pos.cart.items.length - 1]);
  return true;
}
export function setUnit(it, u) {
  if (u === 'karobka') {
    const p = it.product_id && products.value.find((x) => x.id === it.product_id);
    if (p && trackStock(p)) {
      const avail = Number(p.stock || 0);
      const bq = Number(it.box_qty || 1);
      const otherPieces = pos.cart.items
        .filter((x) => x !== it && x.product_id === it.product_id)
        .reduce((sum, x) => sum + (Number(x.qty || 0) * (x.unit === 'karobka' ? Number(x.box_qty || 1) : 1)), 0);
      if (otherPieces + (Number(it.qty || 1) * bq) > avail) {
        toast(`Omborda karobkada sotish uchun yetarli mahsulot yo'q (mavjud: ${avail} dona)`, 'error');
        return;
      }
    }
  }
  it.unit = u;
  it.price = u === 'karobka' ? it.box_price : it.piece_price;
  applyPromo(it);
}
watch(() => pos.cart.items.map((i) => `${i.product_id}:${i.qty}:${i.unit}`).join('|'), () => { for (const it of pos.cart.items) applyPromo(it); });
// Mijoz (narx turi) almashganda savatdagi narxlar shu turga moslanadi
export function repriceCart() {
  for (const it of pos.cart.items) {
    const p = it.product_id && products.value.find((x) => x.id === it.product_id);
    if (!p) continue;
    const pr = priceOf(p);
    it.piece_price = pr.piece; it.box_price = pr.box; it.price = it.unit === 'karobka' ? pr.box : pr.piece;
    applyPromo(it);
  }
}
// Savat pozitsiyasi uchun birlik nomlari (mahsulotning unit kodi bilan)
export const itemUnits = (it) => ({ unit: it.unit_code || 'dona', pack_name: it.pack_name });
export function cartEmpty() { return !pos.cart.items.length && !pos.cart.client_id; }
export function clearCart() { Object.assign(pos.cart, blankCart()); cartClient.value = null; clientQuery.value = ''; }

export function park() {
  if (cartEmpty()) return;
  pos.parked.unshift({
    at: new Date().toLocaleString('sv-SE').slice(0, 16), client: cartClient.value ? clientName(cartClient.value) : '',
    total: total.value, cart: JSON.parse(JSON.stringify(pos.cart)),
  });
  clearCart();
  toast('Savat kutishga qo\'yildi', 'ok');
}
export function unpark(i) {
  const p = pos.parked[i];
  pos.parked.splice(i, 1);
  if (!cartEmpty()) park();
  Object.assign(pos.cart, blankCart(), p.cart);
  reloadClient();
}

// ================= Xaridor ekrani (ikkinchi monitor): savat holati BroadcastChannel orqali =================
export const display = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pos-display') : null;
export function displayState() {
  const items = pos.cart.items.filter((i) => i.name && +i.qty > 0).map((i) => ({
    name: i.name, qty: qtyFmt(i.qty), unit: unitName(itemUnits(i), i.unit), price: i.price, total: lineTotal(i), promo: i.promo || 0,
  }));
  return {
    mode: items.length ? 'cart' : 'idle', items, total: total.value, discount: +pos.cart.discount || 0,
    client: cartClient.value && cartClient.value.phone ? clientName(cartClient.value) : '',
    paid: payNow.value, given: +pos.cart.cash_given || 0, change: change.value, bonusBalance: cartClient.value ? cartClient.value.bonus || 0 : 0,
    welcome: settings.data.shop_welcome || settings.data.company_name || '',
  };
}
let displayTimer = null;
export const pushDisplay = () => { if (!display) return; clearTimeout(displayTimer); displayTimer = setTimeout(() => display.postMessage(JSON.parse(JSON.stringify(displayState()))), 80); };
if (display) display.onmessage = (e) => { if (e.data && e.data.hello) pushDisplay(); };
watch(() => [pos.cart.items.map((i) => `${i.product_id}:${i.qty}:${i.price}`).join('|'), pos.cart.discount, pos.cart.pay_amount, pos.cart.pay2_amount, pos.cart.cash_given, pos.cart.bonus_pay, cartClient.value && cartClient.value.id], pushDisplay);
export const openDisplay = () => window.open('/display', 'pos-display', 'popup,width=1280,height=800');

// ================= Batafsil oynalar steki (orqaga tugmasi bilan) =================
export const stack = reactive([]);
let panelSeq = 0;
// Panel uchun kerakli ruxsat (yo'q bo'lsa panel ochilmaydi — server baribir rad etardi)
export const PANEL_PERMS = { client: ['clients.view'], clients: ['clients.view'], order: ['orders.view'], orders: ['orders.view'], quote: ['quotes.view'] };
export function openPanel(type, props = {}) {
  if (PANEL_PERMS[type] && !can(...PANEL_PERMS[type])) return;
  stack.push({ type, props, key: ++panelSeq });
  history.pushState({ posPanel: stack.length }, '');
}
export function closePanel() { if (stack.length) history.back(); }
export function closeAll() { if (stack.length) history.go(-stack.length); }
window.addEventListener('popstate', (e) => {
  if (route.parts[0] !== 'pos') return;
  const n = (e.state && e.state.posPanel) || 0;
  while (stack.length > n) stack.pop();
});

// ================= Chop etish (POS ichidan) =================
export const printJob = shallowRef(null);
export async function printDoc(kind, data) {
  await loadSettings();
  printJob.value = { kind, data };
  await nextTick();
  await new Promise((r) => setTimeout(r, 60));
  // Telefon / mobil: PDF → ulashish oynasi (Print, Canon PRINT ...); kompyuter: brauzer chop etish oynasi
  if (kind !== 'receipt' && isMobile()) {
    document.body.classList.add('pdf-render');
    try {
      const el = document.querySelector('.print-portal .print-area');
      const num = data.number || '';
      await docAction(el, `${kind === 'quote' ? 'KP' : 'Nakladnoy'}_${num}.pdf`, 'print');
    } finally {
      document.body.classList.remove('pdf-render');
      printJob.value = null;
    }
    return;
  }
  document.body.classList.add('print-doc');
  // Chek: qog'oz o'lchami lenta kengligida (A4 emas)
  let pageStyle = null;
  if (kind === 'receipt') {
    pageStyle = document.createElement('style');
    pageStyle.textContent = `@media print { @page { size: ${settings.data.receipt_width === '58' ? 58 : 80}mm auto; margin: 0; } }`;
    document.head.appendChild(pageStyle);
  }
  const done = () => { document.body.classList.remove('print-doc'); printJob.value = null; if (pageStyle) pageStyle.remove(); };
  window.addEventListener('afterprint', done, { once: true });
  window.print();
}

export async function printSale(id) { printDoc('sale', await get('/api/sales/' + id)); }
// Chek: kassada chek printeri sozlangan bo'lsa — to'g'ridan-to'g'ri printerga (oynasiz), aks holda brauzer orqali
export async function printReceipt(id, extra = {}) {
  try {
    if (await printReceiptHw(id, pos.register, extra)) { toast('Chek chiqarildi', 'ok'); return; }
  } catch { /* printer xatosi ko'rsatildi — brauzer orqali chop etamiz */ }
  printDoc('receipt', await get('/api/sales/' + id));
}
export const lastAdded = ref('');   // oxirgi qo'shilgan pozitsiya (savatda yorqin ko'rsatiladi)

// ================= Amallar =================
export const payModalOpen = ref(false);
export function openPayModal() {
  const items = pos.cart.items.filter((i) => i.name && +i.qty > 0);
  if (!items.length) return toast(t("Savatga mahsulot qo'shing"), 'error');
  if (!pos.cart.pay_amount) {
    pos.cart.pay_amount = Math.max(0, total.value - Math.max(0, balance.value));
  }
  if (pos.cart.pay_method === 'cash' && !pos.cart.cash_given) {
    pos.cart.cash_given = pos.cart.pay_amount || total.value;
  }
  payModalOpen.value = true;
}

export async function completeSale() {
  if (busy.value) return;                       // ikki marta bosilsa — ikkinchi sotuv yaratilmaydi
  const c = pos.cart;
  const items = c.items.filter((i) => i.name && +i.qty > 0);
  if (!items.length) return toast("Savatga mahsulot qo'shing", 'error');
  const needColor = items.find((i) => i.colors && i.colors.length > 0 && !i.color);
  if (needColor && !confirm(`«${needColor.name}» uchun ton / vibr tanlanmagan. Tanlamasdan sotilsinmi?`)) return;
  busy.value = true;
  try {
    // Mijoz tanlanmagan: qidiruvga yozilgan raqam / ism bilan topiladi yoki yaratiladi; bo'sh bo'lsa — "Chakana xaridor"
    if (!c.client_id) {
      const qr = await post('/api/clients/quick', { query: clientQuery.value });
      if (qr.created && clientQuery.value.trim()) toast(`Yangi mijoz yaratildi: ${clientName(qr.client)}`, 'ok');
      c.client_id = qr.client.id; cartClient.value = qr.client; clientQuery.value = '';
    }
    const chk = trackStock() ? await post('/api/sales/check-stock', { items }) : { warnings: [] };
    if (chk.warnings.length && !confirm('Omborda yetarli emas:\n' + chk.warnings.join('\n') + '\n\nBaribir sotilsinmi?')) return;
    const body = {
      client_id: c.client_id, items, discount: c.discount, note: c.note, due_date: toDebt.value ? c.due_date : '', register_id: pos.register || null,
      pay_now: [{ amount: +c.pay_amount || 0, method: c.pay_method }, ...(c.split ? [{ amount: +c.pay2_amount || 0, method: c.pay2_method }] : []),
        { amount: Math.min(+c.bonus_pay || 0, bonusMax.value), method: 'bonus' }].filter((p) => p.amount > 0),
    };
    const r = c.order_id ? await post(`/api/orders/${c.order_id}/confirm`, body) : await post('/api/sales', body);
    const clientLabel = cartClient.value ? clientName(cartClient.value) : '';
    // Naqd: mijoz bergan pul va qaytim (chekda ham chiqadi)
    const cashPaid = body.pay_now.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
    const cashGiven = +c.cash_given || 0;
    r.cash = { given: cashGiven, change: cashGiven > cashPaid && cashPaid > 0 ? cashGiven - cashPaid : 0, paid: cashPaid };
    clearCart();
    payModalOpen.value = false;
    await refreshStock();
    invalidateProducts();
    if (display) display.postMessage({ mode: 'thanks', change: r.cash.change, bonus: r.bonus ? r.bonus.earned : 0, welcome: settings.data.company_name || '' });
    openPanel('receipt', { result: r, clientLabel });
    const pc = await printerCfg(pos.register);
    if (pc.mode !== 'browser') {
      if (pc.auto) printReceipt(r.id, { cash_given: cashGiven });              // printer: chek + (naqd bo'lsa) pul yashigi
      else if (pc.drawer && cashPaid) openDrawer(pos.register).catch(() => {});
    } else if (settings.data.receipt_auto === '1') printReceipt(r.id);         // brauzer orqali avtomatik chek
  } finally { busy.value = false; }
}

export async function saveQuote() {
  const items = pos.cart.items.filter((i) => i.name && +i.qty > 0);
  if (!items.length) return toast("Savatga mahsulot qo'shing", 'error');
  const r = await post('/api/quotes', {
    client_id: pos.cart.client_id, client_name: cartClient.value ? clientName(cartClient.value) : '',
    items, discount: +pos.cart.discount || 0, register_id: pos.register || null, note: pos.cart.note,
  });
  toast('KP saqlandi', 'ok');
  openPanel('quote', { id: r.id });
}

export function loadOrderToCart(o) {
  if (!cartEmpty() && !confirm('Joriy savat kutishga qo\'yilib, buyurtma yuklansinmi?')) return false;
  if (!cartEmpty()) park();
  Object.assign(pos.cart, blankCart(), {
    client_id: o.client_id, order_id: o.id, note: `Sayt buyurtma #${o.id}${o.note ? ': ' + o.note : ''}`,
    items: o.items.map((i) => {
      const p = products.value.find((x) => x.id === i.product_id) || {};
      return {
        product_id: i.product_id, name: i.name, color: i.color || '', colors: p.colors || [], image: p.image || '', unit: i.unit, qty: i.qty, box_qty: i.box_qty,
        piece_price: p.piece_price ?? (i.unit === 'dona' ? i.price : 0), box_price: p.box_price ?? (i.unit === 'karobka' ? i.price : 0), price: i.price,
        unit_code: p.unit || 'dona', pack_name: p.pack_name || i.pack_name || 'karobka',
      };
    }),
  });
  reloadClient();
  return true;
}

// Naqd to'lov qismi va "mijoz berdi" bo'yicha qaytim; tez tanlash uchun banknotlar
export const cashPart = computed(() => (pos.cart.pay_method === 'cash' ? +pos.cart.pay_amount || 0 : 0) + (pos.cart.split && pos.cart.pay2_method === 'cash' ? +pos.cart.pay2_amount || 0 : 0));
export const change = computed(() => Math.max(0, (+pos.cart.cash_given || 0) - cashPart.value));
export const bills = computed(() => {
  const x = cashPart.value;
  if (!x) return [];
  const out = new Set([x]);
  for (const step of [10000, 50000, 100000, 200000]) out.add(Math.ceil(x / step) * step);
  return [...out].filter((v) => v >= x).sort((a, b) => a - b).slice(0, 5);
});

