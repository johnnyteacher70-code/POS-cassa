import { createApp, computed, ref, shallowRef, onMounted, watch, nextTick } from 'vue';
import { route, session, toasts, get, post, pageVersions, t, i18n, applyMe, reloadApp, can, pdfSheet, sheetShare, sheetDownload, sheetOpen } from './lib.js';
import { setLang, tx } from '/i18n/index.js';
import { Modal, MoneyInput, ClientPicker, ClientModal, ItemsEditor, PaymentModal, Badge, StaffSelect, RegisterSelect, BarcodeScannerModal } from './components.js';
import { RegistersPage } from './pages/registers.js?v=2.3.2';
import { ReviewsPage } from './pages/reviews.js?v=2.3.2';
import { StaffPage } from './pages/staff.js?v=2.3.2';
import { RolesPage } from './pages/roles.js?v=2.3.2';
import { LabelsPage } from './pages/labels.js';
import { ExpensesPage, ShiftsPage, ShiftView } from './pages/finance.js?v=2.3.2';
import { InventoryPage, InventoryView } from './pages/inventory.js?v=2.3.2';
import { ReportsPage } from './pages/reports.js';
import { TransfersPage, TransferForm, TransferView } from './pages/transfers.js?v=2.3.2';
import { PromotionsPage } from './pages/promotions.js?v=2.3.2';
import { HardwarePage } from './pages/hardware.js';
import { ReconciliationPage } from './pages/reconciliation.js';
import { PayrollPage, AttendanceButton } from './pages/payroll.js?v=2.3.2';
import { SuppliersPage, SupplierView, PurchasesPage, PurchaseForm, PurchaseView, PurchaseOrdersPage, PurchaseOrderForm, PurchaseOrderView } from './pages/suppliers.js?v=2.3.2';
import { PosPage } from './pages/pos.js?v=2.3.2';
import { loadSettings, moduleOn } from './docs.js';
import { baseName, packName, unitName, isFrac } from './units.js';
import { BrandLogo } from '/brand/brand.js';
import { ICONS } from '/brand/icons.js?v=2.3.8';
import { ClientsPage, ClientView } from './pages/clients.js?v=2.3.2';
import { SalesPage, SaleForm, SaleView } from './pages/sales.js?v=2.3.2';
import { PaymentsPage, DebtsPage, DashboardPage } from './pages/money.js?v=2.3.2';
import { OrdersPage, OrderView } from './pages/orders.js';
import { QuotesPage, QuoteForm, QuoteView } from './pages/quotes.js';
import { ProductsPage, ProductView } from './pages/products.js?v=2.3.2';
import { PartnerLoansPage } from './pages/partners.js';
import { AuditPage, TrashPage, SettingsPage, LoginPage } from './pages/system.js?v=2.3.2';
import { OwnerPage, SetupPage, leaveBranch } from './pages/owner.js?v=2.2.1';

const NAV = [
  // perm: bo'limni ko'rish uchun kerak bo'ladigan ruxsatlardan biri (yo'q bo'lsa — hammaga); group — menyudagi bo'lim; module — Odoo uslubidagi ilova kaliti
  { path: '/pos', label: 'POS (kassa)', ico: 'pos', perm: ['pos.use'], group: 'Savdo', module: 'pos' },
  { path: '/', label: 'Bosh sahifa', ico: 'home', perm: ['dashboard.view'], group: 'Savdo' },
  { path: '/sales', label: 'Sotuvlar', ico: 'sales', perm: ['sales.view', 'sales.create', 'pos.use'], group: 'Savdo' },
  { path: '/partner-loans', label: "Qo'shnilar (oldi-berdi)", ico: 'partners', perm: ['partners.view', 'pos.use', 'sales.view'], group: 'Savdo' },
  { path: '/clients', label: 'Mijozlar', ico: 'clients', perm: ['clients.view'], group: 'Savdo' },
  { path: '/debts', label: 'Qarzdorlik', ico: 'debts', perm: ['debts.view'], group: 'Savdo', module: 'debts' },
  { path: '/orders', label: 'Katalog buyurtmalari', ico: 'orders', badge: 'orders', perm: ['orders.view'], group: 'Savdo', module: 'catalog' },
  { path: '/quotes', label: 'Tijorat takliflari', ico: 'quotes', perm: ['quotes.view'], group: 'Savdo', module: 'quotes' },
  { path: '/payments', label: "To'lovlar (kassa)", ico: 'payments', perm: ['payments.view'], group: 'Pul' },
  { path: '/registers', label: 'Kassalar', ico: 'register', perm: ['registers.view', 'registers.manage'], group: 'Pul' },
  { path: '/shifts', label: 'Kassa smenalari', ico: 'register', perm: ['shifts.view', 'shifts.use'], group: 'Pul', module: 'shifts' },
  { path: '/expenses', label: 'Xarajatlar', ico: 'debts', perm: ['expenses.view'], group: 'Pul', module: 'expenses' },
  { path: '/payroll', label: 'Oylik va ish vaqti', ico: 'staff', perm: ['payroll.manage'], group: 'Pul', module: 'payroll' },
  { path: '/reports', label: 'Hisobotlar (foyda)', ico: 'reports', perm: ['reports.view'], group: 'Pul' },
  { path: '/products', label: 'Mahsulotlar', ico: 'products', group: 'Ombor' },
  { path: '/promotions', label: 'Aksiyalar', ico: 'quotes', perm: ['promotions.manage'], group: 'Ombor', module: 'promotions' },
  { path: '/purchases', label: 'Xaridlar (kirim)', ico: 'purchases', perm: ['suppliers.view', 'purchases.create'], group: 'Ombor', module: 'purchases' },
  { path: '/purchase-orders', label: 'Buyurtmalar (zakaz)', ico: 'orders', perm: ['purchases.create', 'suppliers.view'], group: 'Ombor', module: 'purchases' },
  { path: '/suppliers', label: 'Yetkazib beruvchilar', ico: 'suppliers', perm: ['suppliers.view'], group: 'Ombor', module: 'purchases' },
  { path: '/inventory', label: 'Inventarizatsiya', ico: 'products', perm: ['inventory.manage'], group: 'Ombor', module: 'inventory' },
  { path: '/transfers', label: "Filiallararo ko'chirish", ico: 'transfers', badge: 'transfers', perm: ['transfers.send', 'transfers.receive'], group: 'Ombor', module: 'transfers' },
  { path: '/staff', label: 'Xodimlar', ico: 'staff', group: 'Tizim' },
  { path: '/hardware', label: 'Uskunalar (printer, skaner)', ico: 'pos', perm: ['registers.manage'], group: 'Tizim' },
  { path: '/roles', label: 'Rollar va ruxsatlar', ico: 'roles', perm: ['roles.manage'], group: 'Tizim' },
  { path: '/reviews', label: 'Sharhlar', ico: 'reviews', perm: ['reviews.manage'], group: 'Tizim', module: 'reviews' },
  { path: '/audit', label: 'Harakatlar tarixi', ico: 'audit', perm: ['audit.view'], group: 'Tizim' },
  { path: '/trash', label: 'Savat', ico: 'trash', perm: ['trash.view'], group: 'Tizim' },
  { path: '/settings', label: 'Sozlamalar', ico: 'settings', group: 'Tizim' },
];

const allowed = (n) => (!n.perm || can(...n.perm)) && (!n.module || moduleOn(n.module));
// Ruxsat berilgan birinchi bo'lim (bosh sahifa ruxsati bo'lmasa — shu ochiladi)
const homePath = () => (NAV.find(allowed) || NAV[NAV.length - 1]).path;

function resolve() {
  const [a, b, c] = route.parts;
  const n = NAV.find((x) => x.path === '/' + (a || ''));
  if (n && !allowed(n)) return NoAccessPage;
  if (!a) return DashboardPage;
  if (a === 'roles') return RolesPage;
  if (a === 'labels') return LabelsPage;
  if (a === 'expenses') return ExpensesPage;
  if (a === 'shifts') return b ? ShiftView : ShiftsPage;
  if (a === 'inventory') return b ? InventoryView : InventoryPage;
  if (a === 'reports') return ReportsPage;
  if (a === 'promotions') return PromotionsPage;
  if (a === 'hardware') return HardwarePage;
  if (a === 'payroll') return PayrollPage;
  if (a === 'transfers') return b === 'new' ? TransferForm : b ? TransferView : TransfersPage;
  if (a === 'suppliers') return b ? SupplierView : SuppliersPage;
  if (a === 'purchase-orders') return b === 'new' ? PurchaseOrderForm : b ? PurchaseOrderView : PurchaseOrdersPage;
  if (a === 'purchases') return b === 'new' ? PurchaseForm : b ? PurchaseView : PurchasesPage;
  if (a === 'clients') return c === 'akt' ? ReconciliationPage : b ? ClientView : ClientsPage;
  if (a === 'sales') return b === 'new' || c === 'edit' ? SaleForm : b ? SaleView : SalesPage;
  if (a === 'quotes') return b === 'new' || c === 'edit' ? QuoteForm : b ? QuoteView : QuotesPage;
  if (a === 'orders') return b ? OrderView : OrdersPage;
  if (a === 'products') return b ? ProductView : ProductsPage;
  if (a === 'payments') return PaymentsPage;
  if (a === 'debts') return DebtsPage;
  if (a === 'partner-loans' || a === 'partners') return PartnerLoansPage;
  if (a === 'audit') return AuditPage;
  if (a === 'trash') return TrashPage;
  if (a === 'settings') return SettingsPage;
  if (a === 'staff') return StaffPage;
  if (a === 'pos') return PosPage;
  if (a === 'registers') return RegistersPage;
  if (a === 'reviews') return ReviewsPage;
  return DashboardPage;
}

// Ruxsat yo'q bo'limga to'g'ridan-to'g'ri havola bilan kirilganda
const NoAccessPage = {
  setup() { return { home: () => { location.hash = '#' + homePath(); } }; },
  template: `<div class="card empty"><h2>🔒 {{ $t("Bu bo'limga ruxsatingiz yo'q") }}</h2>
    <p class="muted">{{ $t("Ruxsat kerak bo'lsa — administratorga murojaat qiling") }}</p>
    <button class="btn primary" @click="home">{{ $t('Asosiy sahifaga') }}</button></div>`,
};

const App = {
  components: { LoginPage, OwnerPage, SetupPage, AttendanceButton },
  setup() {
    const menuOpen = ref(false);
    const badges = ref({ orders: 0, transfers: 0 });
    // Sahifa kaliti faqat navigatsiyada hisoblanadi (resetPage keyingi kirishda kuchga kiradi)
    const keyFor = () => route.full + '#' + (pageVersions[route.full] || 0);
    const page = shallowRef(resolve());
    const pageKey = ref(keyFor());
    // Orqaga qaytganda scroll joyi tiklanadi
    const scrolls = new Map();
    watch(() => route.full, () => {
      scrolls.set(pageKey.value, window.scrollY);
      page.value = resolve();
      pageKey.value = keyFor();
      const y = scrolls.get(pageKey.value) || 0;
      nextTick(() => setTimeout(() => window.scrollTo(0, y), 30));
    });
    const current = computed(() => {
      const top = '/' + (route.parts[0] || '');
      return NAV.find((n) => n.path === top) || NAV[0];
    });

    const refreshBadges = async () => {
      if (!session.user || document.hidden) return;   // tab yashirin bo'lsa so'ralmaydi
      if (can('transfers.receive')) get('/api/transfers/incoming-count', { silent: true }).then((d) => { badges.value.transfers = d.n; }).catch(() => {});
      if (!can('orders.view')) return;
      try {
        const d = await get('/api/orders/count', { silent: true });
        const prev = badges.value.orders;
        badges.value.orders = d.new || 0;
        if (badges.value.orders > prev && prev !== 0) document.title = `(${badges.value.orders}) ` + t('Yangi buyurtma!');
      } catch { /* jim */ }
    };

    onMounted(async () => {
      try { const st = await get('/api/setup', { silent: true }); session.needsSetup = st.needed; session.setupToken = !!st.token_required; } catch { /* jim */ }
      if (!session.needsSetup) { try { applyMe(await get('/api/auth/me', { silent: true })); } catch { applyMe(null); } }
      session.checked = true;
      // Bosh sahifa ruxsati bo'lmasa (masalan, kassir) — ruxsat berilgan birinchi bo'lim ochiladi
      if (session.user && !route.parts.length && homePath() !== '/') location.hash = '#' + homePath();
      refreshBadges();
      setInterval(refreshBadges, 30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
    });
    watch(() => route.path, () => { menuOpen.value = false; refreshBadges(); document.title = t("Do'kon boshqaruv"); });
    watch(() => session.user, (u, old) => {
      page.value = resolve();   // ruxsatlar yuklangach sahifa qayta tanlanadi
      if (u) { refreshBadges(); loadSettings(true).catch(() => {}); }
      if (u && !old && !route.parts.length && homePath() !== '/') location.hash = '#' + homePath();
    });

    // Yangi versiya: server yangilansa (deploy) — sahifani yangilash taklif qilinadi
    const newVersion = ref(false);
    let myVersion = null;
    const checkVersion = async () => {
      try {
        const v = (await (await fetch('/healthz', { cache: 'no-store' })).json()).version;
        if (myVersion === null) myVersion = v;
        else if (v && v !== myVersion) newVersion.value = true;
      } catch { /* jim */ }
    };
    checkVersion();
    setInterval(checkVersion, 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

    const logout = async () => { await post('/api/auth/logout'); reloadApp(); };
    const isActive = (n) => (n.path === '/' ? route.parts.length === 0 : route.path.startsWith(n.path));
    const toggleLang = () => setLang(i18n.lang === 'uz' ? 'ru' : (i18n.lang === 'ru' ? 'en' : 'uz'));
    watch(() => i18n.lang, () => { document.title = t("Do'kon boshqaruv"); });
    const roleLabel = computed(() => (session.user && session.user.is_owner ? t('egasi') : session.user ? t(session.user.role_name || '—') : ''));
    // Faqat ruxsati bor bo'limlar ko'rsatiladi (server ham tekshiradi)
    const nav = computed(() => (session.user ? NAV.filter(allowed) : []));
    const isPos = computed(() => Boolean(route && route.parts && route.parts[0] === 'pos'));

    const GROUP_META = {
      'Savdo': { label: 'Savdo', icon: '🛒' },
      'Pul': { label: 'Pul', icon: '💳' },
      'Ombor': { label: 'Ombor', icon: '📦' },
      'Tizim': { label: 'Tizim', icon: '⚙️' }
    };

    const navSearch = ref('');

    const getSavedGroups = () => {
      try {
        const s = localStorage.getItem('sidebar_groups');
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    };

    const openGroups = ref(getSavedGroups() || {
      'Savdo': true,
      'Pul': false,
      'Ombor': false,
      'Tizim': false
    });

    const saveGroups = () => {
      try { localStorage.setItem('sidebar_groups', JSON.stringify(openGroups.value)); } catch {}
    };

    const toggleGroup = (grpKey) => {
      openGroups.value[grpKey] = !openGroups.value[grpKey];
      saveGroups();
    };

    const allGroupsOpen = computed(() => {
      return ['Savdo', 'Pul', 'Ombor', 'Tizim'].every((k) => openGroups.value[k]);
    });

    const toggleAllGroups = () => {
      const target = !allGroupsOpen.value;
      openGroups.value = { Savdo: target, Pul: target, Ombor: target, Tizim: target };
      saveGroups();
    };

    // Sahifa o'zgarganda faol bo'limning guruhini avtomatik ochish
    watch(() => route.path, () => {
      const active = NAV.find(isActive);
      if (active && active.group) {
        if (!openGroups.value[active.group]) {
          openGroups.value[active.group] = true;
          saveGroups();
        }
      }
    }, { immediate: true });

    const navGroups = computed(() => {
      if (!session.user) return [];
      const allowedNav = NAV.filter(allowed);
      const q = (navSearch.value || '').trim().toLowerCase();
      
      const groupKeys = ['Savdo', 'Pul', 'Ombor', 'Tizim'];
      return groupKeys.map((key) => {
        const meta = GROUP_META[key] || { label: key, icon: '📁' };
        let items = allowedNav.filter((n) => n.group === key);
        if (q) {
          items = items.filter((n) => t(n.label).toLowerCase().includes(q) || n.path.toLowerCase().includes(q));
        }
        const hasActive = items.some(isActive);
        const badgeCount = items.reduce((sum, n) => sum + (n.badge && badges.value[n.badge] ? Number(badges.value[n.badge]) : 0), 0);
        const isOpen = q ? items.length > 0 : Boolean(openGroups.value[key]);
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          items,
          count: items.length,
          hasActive,
          badgeCount,
          isOpen
        };
      }).filter((g) => g.items.length > 0);
    });

    const userInitial = computed(() => {
      const name = session.user?.full_name || session.user?.username || 'U';
      return name.slice(0, 2).toUpperCase();
    });

    return { ICONS, NAV, nav, navGroups, navSearch, openGroups, toggleGroup, allGroupsOpen, toggleAllGroups, userInitial, session, toasts, menuOpen, badges, page, pageKey, current, logout, isActive, i18n, setLang, toggleLang, leaveBranch, roleLabel, pdfSheet, sheetShare, sheetDownload, sheetOpen, newVersion, reloadApp, route, isPos };
  },
  template: `
  <div class="new-version" v-if="newVersion">✨ {{ $t('Dasturning yangi versiyasi chiqdi') }} <button class="btn sm" @click="reloadApp">↻ {{ $t('Yangilash') }}</button></div>
  <template v-if="session.checked">
    <setup-page v-if="session.needsSetup"/>
    <login-page v-else-if="!session.user && !session.owner"/>
    <owner-page v-else-if="!session.user"/>
    <div class="layout" v-else>
      <div class="backdrop" v-if="menuOpen" @click="menuOpen=false"></div>
      <aside class="sidebar" :class="{open: menuOpen}">
        <div class="sidebar-brand-box">
          <div class="sidebar-brand-row">
            <brand-logo variant="h" class="sidebar-logo"/>
            <button type="button" class="sidebar-close-btn" @click="menuOpen=false" :title="$t('Yopish')">✕</button>
          </div>
          <div class="sidebar-branch-pill" v-if="session.branch">
            <span class="sidebar-branch-dot"></span>
            <span class="sidebar-branch-name">{{session.branch.name}}</span>
          </div>
          <a v-if="session.owner" href="" class="sidebar-back-link" @click.prevent="leaveBranch">← {{ $t('Filiallarga qaytish') }}</a>
        </div>

        <div class="sidebar-search-box">
          <span class="sidebar-search-icon">🔍</span>
          <input type="text" v-model="navSearch" class="sidebar-search-input" :placeholder="$t('Menyudan qidirish...')" />
          <button v-if="navSearch" type="button" class="sidebar-search-clear" @click="navSearch=''">✕</button>
          <button v-else type="button" class="sidebar-expand-toggle" @click="toggleAllGroups" :title="allGroupsOpen ? $t('Barchasini yopish') : $t('Barchasini ochish')">
            {{ allGroupsOpen ? '▲' : '▼' }}
          </button>
        </div>

        <nav class="sidebar-nav">
          <div v-for="g in navGroups" :key="g.key" class="sidebar-group-card" :class="{ 'is-open': g.isOpen, 'has-active': g.hasActive }">
            <button type="button" class="sidebar-group-btn" :class="{ 'has-active': g.hasActive }" @click="toggleGroup(g.key)">
              <div class="sidebar-group-title">
                <span class="sidebar-group-icon">{{ g.icon }}</span>
                <span class="sidebar-group-label">{{ $t(g.label) }}</span>
              </div>
              <div class="sidebar-group-meta">
                <span class="sidebar-group-badge" v-if="g.badgeCount">{{ g.badgeCount }}</span>
                <span class="sidebar-group-chevron" :class="{ open: g.isOpen }">›</span>
              </div>
            </button>
            <div class="sidebar-subnav" v-show="g.isOpen">
              <a v-for="n in g.items" :key="n.path" :href="'#'+n.path" class="sidebar-link" :class="{ active: isActive(n) }" @click="menuOpen=false">
                <span class="ico" v-html="ICONS[n.ico]"></span>
                <span class="sidebar-link-text">{{ $t(n.label) }}</span>
                <span class="badge" v-if="n.badge && badges[n.badge]">{{ badges[n.badge] }}</span>
              </a>
            </div>
          </div>
          <div v-if="navGroups.length === 0" class="sidebar-empty-search">
            {{ $t('Topilmadi') }}
          </div>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user-card">
            <div class="sidebar-user-avatar">{{ userInitial }}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name" :title="session.user.full_name || session.user.username">{{ session.user.full_name || session.user.username }}</div>
              <div class="sidebar-user-role">{{ roleLabel }}</div>
            </div>
          </div>
          <div class="sidebar-attendance-wrap">
            <attendance-button/>
          </div>
          <div class="sidebar-footer-actions">
            <div class="sidebar-lang-toggle">
              <button :class="{ on: i18n.lang==='uz' }" @click="setLang('uz')">UZ</button>
              <button :class="{ on: i18n.lang==='ru' }" @click="setLang('ru')">RU</button>
              <button :class="{ on: i18n.lang==='en' }" @click="setLang('en')">EN</button>
            </div>
            <button class="sidebar-logout-btn" @click="logout" :title="$t('Chiqish')">
              <span>🚪</span> {{ $t('Chiqish') }}
            </button>
          </div>
        </div>
      </aside>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="topbar-menu-btn" @click="menuOpen=true" :title="$t('Menyu')" aria-label="Menyu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div class="topbar-breadcrumb">
              <span class="topbar-branch" v-if="session.branch" :title="session.branch.name">
                <span class="topbar-branch-dot"></span>
                <span class="topbar-branch-name">{{ session.branch.name }}</span>
              </span>
              <span class="topbar-sep" v-if="session.branch">/</span>
              <span class="topbar-current">
                <span class="topbar-ico" v-if="current && current.ico" v-html="ICONS[current.ico]"></span>
                <span class="topbar-title">{{ $t(current.label) }}</span>
              </span>
            </div>
          </div>
          <div class="topbar-right">
            <a href="#/pos" v-if="!isPos && $can('pos.use')" class="topbar-pos-btn" :title="$t('POS kassa ochish')">
              <span class="topbar-pos-ico">🛒</span>
              <span class="topbar-pos-text">{{ $t('POS kassa') }}</span>
            </a>
            <a href="#/" v-if="isPos" class="topbar-dash-btn" :title="$t('Bosh sahifaga qaytish')">
              <span class="topbar-dash-ico">📊</span>
              <span class="topbar-dash-text">{{ $t('Bosh sahifa') }}</span>
            </a>
            <a href="#/orders" v-if="badges.orders" class="topbar-alert-btn orders-alert" :title="$t('Katalog buyurtmalari')">
              <span class="topbar-alert-icon">🛒</span>
              <span class="topbar-alert-count">{{ badges.orders }}</span>
            </a>
            <a href="#/transfers" v-if="badges.transfers" class="topbar-alert-btn transfers-alert" :title="$t('Filiallararo ko\\'chirish')">
              <span class="topbar-alert-icon">📦</span>
              <span class="topbar-alert-count">{{ badges.transfers }}</span>
            </a>
          </div>
        </header>
        <main class="main">
          <keep-alive :max="15"><component :is="page" :key="pageKey"/></keep-alive>
        </main>
      </div>
    </div>
    <!-- PDF tayyor: telefon va mobil uchun (tugmalar — yangi bosish, iPhone bloklamaydi) -->
    <div class="pdf-sheet-bg" v-if="pdfSheet.open" @click.self="!pdfSheet.busy && (pdfSheet.open=false)">
      <div class="pdf-sheet">
        <div class="ps-head"><b>📄 {{pdfSheet.filename}}</b><button class="btn ghost sm" @click="pdfSheet.open=false">✕</button></div>
        <div v-if="pdfSheet.busy" class="ps-wait"><span class="spin"></span> {{ $t('PDF tayyorlanmoqda...') }}</div>
        <div v-else-if="pdfSheet.error && !pdfSheet.url" class="neg">{{ $t(pdfSheet.error) }}</div>
        <template v-else>
          <template v-if="pdfSheet.mode === 'print'">
            <button v-if="pdfSheet.canShare" class="btn primary ps-big" @click="sheetShare">🖨 {{ $t('Chop etish / Ulashish') }}<small>{{ $t('PRINT (Canon), Print, Fayllar...') }}</small></button>
            <button v-if="!pdfSheet.canShare" class="btn primary ps-big" @click="sheetOpen">🖨 {{ $t('PDFni ochish va chop etish') }}<small>{{ $t('Ochilgan sahifada: Ulashish ⬆ → PRINT (Canon)') }}</small></button>
            <button class="btn ps-big" @click="sheetDownload">⬇ {{ $t('Telefonga yuklab olish') }}</button>
            <button v-if="pdfSheet.canShare" class="btn ghost" @click="sheetOpen">📄 {{ $t('PDFni ochish') }}</button>
          </template>
          <template v-else>
            <button class="btn primary ps-big" @click="sheetDownload">⬇ {{ $t('Telefonga yuklab olish') }}</button>
            <button class="btn ps-big" @click="sheetOpen">📄 {{ $t('PDFni ochish') }}</button>
            <button v-if="pdfSheet.canShare" class="btn ghost" @click="sheetShare">🖨 {{ $t('Chop etish / Ulashish') }}</button>
          </template>
          <div class="small neg" v-if="pdfSheet.error">{{ $t(pdfSheet.error) }}</div>
          <div class="small muted">{{ $t("Canon ro'yxatda bo'lmasa: Ulashish oynasida «Ещё / More» → PRINT ni yoqing (bir marta).") }}</div>
        </template>
      </div>
    </div>
    <div class="toasts">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{t.text}}<span v-if="t.action" class="act" @click="t.action(); toasts.splice(toasts.indexOf(t),1)">{{t.actionLabel}}</span></div>
    </div>
  </template>`,
};

// Brauzerning tasdiqlash oynalari ham joriy tilda
const nativeConfirm = window.confirm.bind(window);
const nativePrompt = window.prompt.bind(window);
window.confirm = (m) => nativeConfirm(t(m));
window.prompt = (m, d) => nativePrompt(t(m), d);

const app = createApp(App);
app.config.globalProperties.$t = t;
app.config.globalProperties.$tx = tx;
app.config.globalProperties.$can = can;
app.config.globalProperties.$route = route;
app.config.globalProperties.route = route;
// Birlik nomlari hamma shablonlarda: baseName(mahsulot|pozitsiya), packName(...), unitName(x, 'dona'|'karobka')
Object.assign(app.config.globalProperties, { baseName, packName, unitName, isFrac });
app.component('Modal', Modal);
app.component('MoneyInput', MoneyInput);
app.component('ClientPicker', ClientPicker);
app.component('ClientModal', ClientModal);
app.component('ItemsEditor', ItemsEditor);
app.component('PaymentModal', PaymentModal);
app.component('Badge', Badge);
app.component('BrandLogo', BrandLogo);
app.component('StaffSelect', StaffSelect);
app.component('RegisterSelect', RegisterSelect);
app.component('BarcodeScannerModal', BarcodeScannerModal);
app.mount('#app');

// Ilova sifatida o'rnatish va internetsiz ochilish (xavfsiz kontekstda: localhost yoki https)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
