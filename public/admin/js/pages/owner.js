// Biznes egasi: birinchi sozlash va filiallar sahifasi (filial yaratish, tahrirlash, bloklash, kirish)
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { api, get, post, put, dt, session, toast, i18n, reloadApp, applyTheme } from '../lib.js';
import { OwnerSummary, OwnerSales, OwnerStock, OwnerTransfers, CatalogCopy, OwnerSettings, OnboardingWizard, OwnerSecurity } from './owner_dash.js?v=2.2.1';
import { setLang, t } from '/i18n/index.js';

export async function enterBranch(b) {
  await post('/api/owner/enter', { branch_id: b.id });
  reloadApp('#/');
}
export async function leaveBranch() {
  await post('/api/owner/leave');
  reloadApp('#/');
}

// Lotincha qisqa kod nomdan: "Chilonzor filiali" → "chilonzor-filiali"
const LAT = { "o'": 'o', "g'": 'g', 'sh': 'sh', 'ch': 'ch', 'ʻ': '', 'ʼ': '', "'": '' };
function slugify(s) {
  let x = String(s || '').toLowerCase();
  for (const [k, v] of Object.entries(LAT)) x = x.split(k).join(v);
  const cyr = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
  x = [...x].map((c) => (c in cyr ? cyr[c] : c)).join('');
  return x.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
const genPassword = () => String(Math.floor(100000 + Math.random() * 900000));

// ---------- Birinchi ishga tushirish ----------
export const SetupPage = {
  setup() {
    const f = reactive({ full_name: '', username: '', password: '', password2: '', token: '' });
    const busy = ref(false);
    const submit = async () => {
      if (f.password !== f.password2) return toast('Parollar bir xil emas', 'error');
      busy.value = true;
      try { await post('/api/setup', f); reloadApp('#/'); } catch { busy.value = false; }
    };
    return { f, busy, submit, i18n, setLang, session };
  },
  template: `
  <div class="login-wrap">
    <brand-logo variant="full" class="login-logo"/>
    <form class="card" @submit.prevent="submit">
      <div class="lang-sw" style="justify-content:center;margin-bottom:6px">
        <button type="button" :class="{on: i18n.lang==='uz'}" @click="setLang('uz')">O'zbekcha</button>
        <button type="button" :class="{on: i18n.lang==='ru'}" @click="setLang('ru')">Русский</button>
        <button type="button" :class="{on: i18n.lang==='en'}" @click="setLang('en')">English</button>
      </div>
      <h2>{{ $t('Birinchi sozlash') }}</h2>
      <p class="muted small" style="margin-top:0">{{ $t("Biznes egasi akkauntini yarating. Shu akkaunt bilan filiallarni yaratasiz va boshqarasiz.") }}</p>
      <label class="f mb" v-if="session.setupToken"><span>{{ $t('Sozlash kodi') }} <span class="muted">({{ $t("server oynasida ko'rsatilgan") }})</span></span><input v-model="f.token" autocomplete="off" style="letter-spacing:3px;text-transform:uppercase"></label>
      <label class="f mb"><span>{{ $t('Ism familiya') }}</span><input v-model="f.full_name" autofocus></label>
      <label class="f mb"><span>{{ $t('Login') }}</span><input v-model="f.username" autocomplete="username" :placeholder="$t('masalan: ega')"></label>
      <label class="f mb"><span>{{ $t('Parol') }} <span class="muted">({{ $t('kamida 6 belgi') }})</span></span><input type="password" v-model="f.password" autocomplete="new-password"></label>
      <label class="f mb"><span>{{ $t('Parolni takrorlang') }}</span><input type="password" v-model="f.password2" autocomplete="new-password"></label>
      <button class="btn primary" style="width:100%" :disabled="busy">{{ $t('Yaratish va kirish') }}</button>
    </form>
  </div>`,
};

// ---------- Filiallar sahifasi ----------
export const OwnerPage = {
  components: { OwnerSummary, OwnerSales, OwnerStock, OwnerTransfers, CatalogCopy, OwnerSettings, OnboardingWizard, OwnerSecurity },
  setup() {
    const list = ref(null);
    const tab = ref((typeof sessionStorage !== 'undefined' && sessionStorage.getItem('owner_tab')) || 'summary');
    const setTab = (t) => {
      tab.value = t;
      try { sessionStorage.setItem('owner_tab', t); } catch {}
    };
    const catalog = ref(false);
    const onboard = ref(false);
    const load = async () => {
      list.value = await get('/api/owner/branches');
      if (!list.value.length) {
        tab.value = 'branches';
        // Brend hali sozlanmagan bo'lsa — avval biznes ustasi
        const biz = await get('/api/owner/business');
        onboard.value = !biz.industry;
      }
    };
    const onboardDone = () => { location.reload(); };
    onMounted(load);

    // Yaratish / tahrirlash
    const form = ref(null);
    const slugTouched = ref(false);
    const openCreate = () => {
      slugTouched.value = false;
      form.value = { name: '', slug: '', address: '', phone: '', doc_prefix: '', admin: { full_name: '', username: '', password: genPassword() } };
    };
    const openEdit = (b) => { form.value = { id: b.id, name: b.name, slug: b.slug, address: b.address, phone: b.phone, doc_prefix: b.doc_prefix }; };
    const onName = () => { if (!form.value.id && !slugTouched.value) form.value.slug = slugify(form.value.name); };
    const busy = ref(false);
    const save = async () => {
      busy.value = true;
      try {
        if (form.value.id) {
          await put('/api/owner/branches/' + form.value.id, form.value);
          toast('Saqlandi', 'ok');
        } else {
          const a = form.value.admin;
          await post('/api/owner/branches', form.value);
          toast(t('Filial yaratildi. Admin logini: {0}, paroli: {1}', [a.username, a.password]), 'ok', { duration: 15000 });
        }
        form.value = null;
        load();
      } finally { busy.value = false; }
    };

    const setStatus = async (b, status) => {
      if (status === 'blocked' && !confirm(t('"{0}" bloklansinmi? Filial xodimlari tizimdan chiqariladi va kira olmaydi.', [b.name]))) return;
      await post(`/api/owner/branches/${b.id}/status`, { status });
      load();
    };

    // O'chirish: faqat bloklangan filial, nomi qo'lda yoziladi
    const removeBranch = async (b) => {
      const name = prompt(t('"{0}" filialini butunlay o\'chirish uchun uning nomini aynan yozing. O\'chirishdan oldin zaxira nusxa olinadi.', [b.name]));
      if (name === null) return;
      const r = await api('DELETE', '/api/owner/branches/' + b.id, { confirm_name: name });
      toast(t("Filial o'chirildi. Zaxira nusxa: {0}", [r.backup]), 'ok', { duration: 12000 });
      load();
    };

    // Admin parolini tiklash
    const pw = ref(null);
    const openPw = async (b) => {
      const admins = await get(`/api/owner/branches/${b.id}/admins`);
      if (!admins.length) return toast("Bu filialda admin yo'q", 'error');
      pw.value = { branch: b, admins, user_id: admins[0].id, password: genPassword() };
    };
    const savePw = async () => {
      await post(`/api/owner/branches/${pw.value.branch.id}/admin-password`, { user_id: pw.value.user_id, password: pw.value.password });
      const a = pw.value.admins.find((x) => x.id === +pw.value.user_id);
      toast(t('Yangi parol saqlandi. Login: {0}, parol: {1}', [a.username, pw.value.password]), 'ok', { duration: 15000 });
      pw.value = null;
    };

    // Egasining o'z paroli
    const myPw = ref(null);
    const saveMyPw = async () => {
      if (myPw.value.new_password !== myPw.value.new2) return toast('Parollar bir xil emas', 'error');
      await post('/api/auth/password', myPw.value);
      toast("Parol o'zgartirildi", 'ok');
      myPw.value = null;
    };

    const logout = async () => { await post('/api/auth/logout'); reloadApp('#/'); };
    const shopUrl = (b) => location.origin + '/shop/' + b.slug;
    const active = computed(() => (list.value || []).filter((b) => b.status === 'active').length);
    const initials = computed(() => {
      const name = (session.owner && (session.owner.full_name || session.owner.username)) || 'E';
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    });
    const isDark = ref(typeof localStorage !== 'undefined' && localStorage.getItem('theme_mode') === 'dark');
    const toggleDark = () => {
      isDark.value = !isDark.value;
      applyTheme({ mode: isDark.value ? 'dark' : 'light' });
    };

    const menuOpen = ref(false);
    const toggleMenu = (e) => {
      if (e) e.stopPropagation();
      menuOpen.value = !menuOpen.value;
    };
    const closeMenu = () => { menuOpen.value = false; };
    const onDocClick = (e) => {
      if (!e.target.closest('.owner-profile-dropdown')) {
        menuOpen.value = false;
      }
    };
    const mobileSidebarOpen = ref(false);
    const currentTabTitle = computed(() => {
      const titles = {
        summary: t('Umumiy hisobot'),
        sales: t('Barcha sotuvlar'),
        stock: t('Umumiy ombor'),
        branches: t('Filiallar'),
        transfers: t("Ko'chirishlar"),
        settings: t('Sozlamalar'),
        security: t('Xavfsizlik'),
      };
      return titles[tab.value] || t('Biznes boshqaruvi');
    });

    // 3-bosqich: Filiallarni qidirish, filtrlash va tezkor asboblar
    const branchSearch = ref('');
    const branchFilter = ref('all');
    const filteredBranches = computed(() => {
      let res = list.value || [];
      if (branchFilter.value === 'active') res = res.filter((b) => b.status === 'active');
      if (branchFilter.value === 'blocked') res = res.filter((b) => b.status !== 'active');
      if (branchSearch.value.trim()) {
        const q = branchSearch.value.toLowerCase().trim();
        res = res.filter((b) =>
          (b.name && b.name.toLowerCase().includes(q)) ||
          (b.slug && b.slug.toLowerCase().includes(q)) ||
          (b.address && b.address.toLowerCase().includes(q)) ||
          (b.phone && b.phone.includes(q))
        );
      }
      return res;
    });
    const blockedCount = computed(() => (list.value || []).filter((b) => b.status !== 'active').length);
    const copyShopUrl = (b) => {
      try {
        navigator.clipboard.writeText(shopUrl(b));
        toast(t('Katalog havolasi nusxalandi'), 'ok');
      } catch {
        toast(shopUrl(b), 'info');
      }
    };

    onMounted(() => {
      window.addEventListener('click', onDocClick);
    });
    onUnmounted(() => {
      window.removeEventListener('click', onDocClick);
    });

    return {
      list, load, tab, setTab, catalog, onboard, onboardDone, form, slugTouched, openCreate, openEdit, onName, busy, save, setStatus, removeBranch, pw, openPw, savePw, myPw, saveMyPw,
      logout, enterBranch, shopUrl, active, session, dt, i18n, setLang, genPassword, initials, isDark, toggleDark,
      menuOpen, toggleMenu, closeMenu, mobileSidebarOpen, currentTabTitle,
      branchSearch, branchFilter, filteredBranches, blockedCount, copyShopUrl,
    };
  },
  template: `
  <div class="owner-layout">
    <!-- Owner Sidebar (Yon Menyu) -->
    <aside class="owner-sidebar" :class="{ open: mobileSidebarOpen }">
      <div class="owner-sidebar-brand">
        <div class="sidebar-brand-title">
          <span class="sidebar-brand-badge">🏪</span>
          <span class="sidebar-brand-name">{{ $t("Do'kon boshqaruvi") }}</span>
        </div>
        <button type="button" class="owner-sidebar-close" @click="mobileSidebarOpen = false" :title="$t('Yopish')">✕</button>
      </div>

      <div class="owner-sidebar-badge">
        <span>👑 {{ $t('Markaziy Boshqaruv') }}</span>
      </div>

      <nav class="owner-nav" v-if="list && list.length">
        <div class="owner-nav-group">{{ $t('Savdo va Ombor') }}</div>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='summary' }" @click="setTab('summary'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          <span>{{ $t('Umumiy hisobot') }}</span>
        </button>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='sales' }" @click="setTab('sales'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>
          <span>{{ $t('Barcha sotuvlar') }}</span>
        </button>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='stock' }" @click="setTab('stock'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>
          <span>{{ $t('Umumiy ombor') }}</span>
        </button>

        <div class="owner-nav-group">{{ $t("Filiallar Tarmog'i") }}</div>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='branches' }" @click="setTab('branches'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>{{ $t('Filiallar') }}</span>
          <span class="owner-nav-badge">{{ list.length }}</span>
        </button>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='transfers' }" @click="setTab('transfers'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 16-4-4m0 0 4-4m-4 4h18m-4 8 4-4m0 0-4-4m4 4H3"/></svg>
          <span>{{ $t("Ko'chirishlar") }}</span>
        </button>

        <div class="owner-nav-group">{{ $t('Boshqaruv va Xavfsizlik') }}</div>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='settings' }" @click="setTab('settings'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>{{ $t('Sozlamalar') }}</span>
        </button>

        <button type="button" class="owner-nav-item" :class="{ active: tab==='security' }" @click="setTab('security'); mobileSidebarOpen = false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>{{ $t('Xavfsizlik') }}</span>
        </button>
      </nav>

      <div class="owner-sidebar-footer">
        <div class="owner-sidebar-stat">
          <span class="muted small">{{ $t('Faol filiallar') }}</span>
          <span class="bold">{{ active }} / {{ list ? list.length : 0 }}</span>
        </div>
      </div>
    </aside>

    <!-- Mobile Backdrop -->
    <div class="owner-sidebar-backdrop" v-if="mobileSidebarOpen" @click="mobileSidebarOpen = false"></div>

    <!-- Right Side: Content Area -->
    <div class="owner-content">
      <header class="owner-top">
        <div class="owner-top-inner">
          <button type="button" class="owner-menu-toggle" @click="mobileSidebarOpen = true" :title="$t('Menyu')">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          <div class="owner-top-breadcrumb">
            <span class="muted">{{ $t('Boshqaruv') }}</span>
            <span class="sep">/</span>
            <span class="current">{{ currentTabTitle }}</span>
          </div>

          <div class="spacer"></div>

          <div class="owner-header-right">
            <div class="lang-sw">
              <button :class="{on: i18n.lang==='uz'}" @click="setLang('uz')">UZ</button>
              <button :class="{on: i18n.lang==='ru'}" @click="setLang('ru')">RU</button>
              <button :class="{on: i18n.lang==='en'}" @click="setLang('en')">EN</button>
            </div>
            
            <div class="owner-profile-dropdown">
              <button type="button" class="owner-avatar-btn" @click="toggleMenu" :class="{ open: menuOpen }" :title="session.owner.full_name || session.owner.username">
                <span class="owner-avatar">{{ initials }}</span>
                <svg class="owner-avatar-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <div v-if="menuOpen" class="owner-dropdown-menu" @click.stop>
                <div class="owner-dropdown-header">
                  <div class="owner-avatar lg">{{ initials }}</div>
                  <div class="owner-dropdown-info">
                    <div class="owner-dropdown-name">{{ session.owner.full_name || session.owner.username }}</div>
                    <div class="owner-dropdown-role">👑 {{ $t('Biznes Egasi') }}</div>
                    <div class="owner-dropdown-user muted small">@{{ session.owner.username }}</div>
                  </div>
                </div>

                <div class="owner-dropdown-divider"></div>

                <div class="owner-dropdown-items">
                  <button type="button" class="owner-dropdown-item" @click="toggleDark">
                    <div class="item-icon">
                      <svg v-if="isDark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    </div>
                    <div class="item-text">
                      <span class="item-title">{{ isDark ? $t('Yorug rejim') : $t('Tungi rejim') }}</span>
                      <span class="item-sub muted">{{ isDark ? $t("Kunduzgi ko'rinish") : $t("Qorong'i ko'rinish") }}</span>
                    </div>
                    <div class="item-toggle-pill" :class="{ on: isDark }">
                      <div class="toggle-dot"></div>
                    </div>
                  </button>

                  <button type="button" class="owner-dropdown-item" @click="myPw={old_password:'',new_password:'',new2:''}; menuOpen=false">
                    <div class="item-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3"/></svg>
                    </div>
                    <div class="item-text">
                      <span class="item-title">{{ $t('Parolni almashtirish') }}</span>
                      <span class="item-sub muted">{{ $t('Akkaunt xavfsizligi') }}</span>
                    </div>
                  </button>
                </div>

                <div class="owner-dropdown-divider"></div>

                <div class="owner-dropdown-footer">
                  <button type="button" class="owner-dropdown-item danger" @click="logout">
                    <div class="item-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    </div>
                    <div class="item-text">
                      <span class="item-title">{{ $t('Chiqish') }}</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="owner-main">
        <div class="page-head owner-head">
          <div>
            <h1>{{ currentTabTitle }}</h1>
            <p class="muted small" style="margin:4px 0 0" v-if="tab==='summary'">{{ $t("Barcha filiallar bo'yicha tushum, foyda va umumiy balans") }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='sales'">{{ $t('Barcha filiallarning sotuvlar va cheklar tarixi') }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='stock'">{{ $t('Markaziy va filiallar omborlaridagi qoldiqlar') }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='branches'">{{ $t('Filiallar faoliyati, xodimlar va markaziy sozlash') }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='transfers'">{{ $t("Filiallar o'rtasida mahsulot ko'chirish harakatlari") }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='settings'">{{ $t('Kompaniya brendi, rekvizitlar va tizim sozlamalari') }}</p>
            <p class="muted small" style="margin:4px 0 0" v-else-if="tab==='security'">{{ $t('Adminlar va xavfsizlik jurnali') }}</p>
          </div>
          <div class="row" style="gap:10px">
            <button v-if="list && list.length > 1" class="btn" @click="catalog=true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
              {{ $t('Katalogni tarqatish') }}
            </button>
            <button v-if="list && list.length" class="btn primary" @click="openCreate">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ $t('Filial yaratish') }}
            </button>
          </div>
        </div>
      <owner-summary v-if="tab==='summary' && list && list.length" @enter="enterBranch"/>
      <owner-sales v-if="tab==='sales'"/>
      <owner-stock v-if="tab==='stock'"/>
      <owner-transfers v-if="tab==='transfers'"/>
      <owner-security v-if="tab==='security'"/>
      <owner-settings v-if="tab==='settings'" @changed="load(); tab='branches'"/>

      <onboarding-wizard v-if="list && !list.length && onboard" @done="onboardDone"/>
      <div v-else-if="list && !list.length" class="card owner-empty">
        <div class="owner-empty-ico">🏬</div>
        <h2>{{ $t("Hali filial yo'q") }}</h2>
        <p class="muted">{{ $t("Birinchi filialni yarating. Har bir filialning xodimlari, mahsulotlari, sotuvlari va kassasi alohida saqlanadi.") }}</p>
        <button class="btn primary" @click="openCreate">+ {{ $t('Filial yaratish') }}</button>
      </div>

      <!-- 3-bosqich: Filiallar Boshqaruvi va Kartalar Grid -->
      <div v-if="tab==='branches' && list && list.length" class="branches-section">
        <!-- Qidiruv va Filtrlash Paneli (Toolbar) -->
        <div class="branches-toolbar">
          <div class="branches-filter-chips">
            <button type="button" class="branch-filter-btn" :class="{ active: branchFilter==='all' }" @click="branchFilter='all'">
              <span>{{ $t("Barchasi") }}</span>
              <span class="count-pill">{{ list.length }}</span>
            </button>
            <button type="button" class="branch-filter-btn" :class="{ active: branchFilter==='active' }" @click="branchFilter='active'">
              <span class="dot-indicator green"></span>
              <span>{{ $t("Faol") }}</span>
              <span class="count-pill">{{ active }}</span>
            </button>
            <button type="button" class="branch-filter-btn" :class="{ active: branchFilter==='blocked' }" @click="branchFilter='blocked'" v-if="blockedCount > 0">
              <span class="dot-indicator red"></span>
              <span>{{ $t("Bloklangan") }}</span>
              <span class="count-pill">{{ blockedCount }}</span>
            </button>
          </div>

          <div class="branches-search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="branchSearch" placeholder="Filial nomi, manzil yoki telefon..." class="branches-search-input">
            <button v-if="branchSearch" class="clear-search-btn" @click="branchSearch=''" :title="$t('Tozalash')">✕</button>
          </div>
        </div>

        <!-- Filiallar Kartalari Grid -->
        <div class="branch-grid" v-if="filteredBranches.length">
          <div v-for="b in filteredBranches" :key="b.id" class="branch-card" :class="{ 'is-blocked': b.status!=='active' }">
            <!-- Yuqori qism: icon, sarlavha, prefiks va status -->
            <div class="branch-card-header">
              <div class="branch-icon-box" :class="{ blocked: b.status!=='active' }">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>

              <div class="branch-header-info">
                <div class="branch-title-row">
                  <h3 class="branch-title">{{ b.name }}</h3>
                  <span v-if="b.doc_prefix" class="branch-doc-badge">№ {{ b.doc_prefix }}</span>
                </div>
                <div class="branch-slug-row">
                  <span class="branch-slug-text">/shop/{{ b.slug }}</span>
                  <button type="button" class="branch-copy-btn" @click.stop="copyShopUrl(b)" :title="$t('Nusxalash')">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  <a :href="shopUrl(b)" target="_blank" class="branch-open-link" :title="$t('Ochish')">↗</a>
                </div>
              </div>

              <div class="branch-status-wrap">
                <span class="branch-status-badge" :class="b.status==='active' ? 'active' : 'blocked'">
                  <span class="status-pulse-dot"></span>
                  <span>{{ b.status==='active' ? $t('Faol') : $t('Bloklangan') }}</span>
                </span>
              </div>
            </div>

            <!-- Asosiy parametrlar bloki: Manzil, Telefon, Xodimlar, Sana -->
            <div class="branch-meta-card">
              <div class="branch-meta-row" :title="b.address || ''">
                <span class="meta-icon-badge">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <span class="meta-val" :class="{ muted: !b.address }">{{ b.address || $t("Manzil ko'rsatilmagan") }}</span>
              </div>

              <div class="branch-meta-row" :title="b.phone || ''">
                <span class="meta-icon-badge">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </span>
                <span class="meta-val" :class="{ muted: !b.phone }">{{ b.phone || $t("Telefon yo'q") }}</span>
              </div>

              <div class="branch-meta-subgrid">
                <div class="submeta-item">
                  <span class="meta-icon-badge">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </span>
                  <div class="submeta-info">
                    <span class="submeta-label">{{ $t('Xodimlar') }}</span>
                    <span class="submeta-val"><b>{{ b.staff_count || 0 }}</b> {{ $t('nafar') }}</span>
                  </div>
                </div>

                <div class="submeta-item">
                  <span class="meta-icon-badge">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </span>
                  <div class="submeta-info">
                    <span class="submeta-label">{{ $t('Ochilgan') }}</span>
                    <span class="submeta-val">{{ dt(b.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Asosiy Harakat: Filialga Kirish (Primary CTA) -->
            <div class="branch-cta-wrap">
              <button class="branch-enter-action" @click="enterBranch(b)" :disabled="b.status!=='active'">
                <span v-if="b.status==='active'">{{ $t('Filialga kirish') }}</span>
                <span v-else>{{ $t('Filial bloklangan') }}</span>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>

            <!-- Tezkor Boshqaruv Asboblari (Toolbar) -->
            <div class="branch-footer-tools">
              <button type="button" class="branch-tool-btn" @click="openEdit(b)" :title="$t('Tahrirlash')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>{{ $t('Tahrirlash') }}</span>
              </button>

              <button type="button" class="branch-tool-btn" @click="openPw(b)" :title="$t('Admin paroli')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3"/></svg>
                <span>{{ $t('Parol') }}</span>
              </button>

              <button v-if="b.status==='active'" type="button" class="branch-tool-btn warn" @click="setStatus(b, 'blocked')" :title="$t('Bloklash')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                <span>{{ $t('Bloklash') }}</span>
              </button>

              <button v-else type="button" class="branch-tool-btn success" @click="setStatus(b, 'active')" :title="$t('Faollashtirish')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{{ $t('Faollashtirish') }}</span>
              </button>

              <button v-if="b.status!=='active'" type="button" class="branch-tool-btn danger" @click="removeBranch(b)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>{{ $t("O'chirish") }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Qidiruv bo'yicha hech narsa topilmagan holat -->
        <div class="branch-empty-search" v-else>
          <div class="empty-icon">🔍</div>
          <h3>{{ $t("Qidiruv bo'yicha filial topilmadi") }}</h3>
          <p class="muted small">{{ $t("Boshqa so'z bilan qidirib ko'ring yoki filtrni o'zgartiring.") }}</p>
          <button class="btn sm" @click="branchSearch=''; branchFilter='all'">{{ $t("Filtrni tozalash") }}</button>
        </div>
      </div>
    </main>
  </div>

    <modal v-if="form" :title="form.id ? $t('Filialni tahrirlash') : $t('Yangi filial')" @close="form=null">
      <form id="branch-form" class="form-grid" @submit.prevent="save">
        <label class="f full"><span>{{ $t('Filial nomi') }} *</span><input v-model="form.name" @input="onName" autofocus :placeholder="$t('masalan: Chilonzor filiali')"></label>
        <label class="f"><span>{{ $t('Qisqa kod (katalog manzili)') }} *</span>
          <input v-model="form.slug" :disabled="!!form.id" @input="slugTouched=true" placeholder="chilonzor">
          <small class="muted">/shop/{{form.slug || '...'}}</small>
        </label>
        <label class="f"><span>{{ $t('Hujjat prefiksi') }}</span><input v-model="form.doc_prefix" maxlength="6" placeholder="CH" style="text-transform:uppercase"></label>
        <label class="f full"><span>{{ $t('Manzil') }}</span><input v-model="form.address"></label>
        <label class="f"><span>{{ $t('Telefon') }}</span><input v-model="form.phone" inputmode="tel"></label>
        <template v-if="!form.id">
          <h3 class="full" style="margin:10px 0 0">{{ $t('Filial admini') }}</h3>
          <p class="full small muted" style="margin:0">{{ $t("Filialga shu admin kiradi va qolgan xodimlarni o'zi qo'shadi.") }}</p>
          <label class="f full"><span>{{ $t('Ism familiya') }}</span><input v-model="form.admin.full_name"></label>
          <label class="f"><span>{{ $t('Login') }} *</span><input v-model="form.admin.username" autocomplete="off" :placeholder="$t('masalan: chilonzor_admin')"></label>
          <label class="f"><span>{{ $t('Parol') }} *</span>
            <div class="row" style="flex-wrap:nowrap"><input v-model="form.admin.password" autocomplete="off"><button type="button" class="btn" @click="form.admin.password=genPassword()">↻</button></div>
          </label>
        </template>
      </form>
      <template #footer><button class="btn" @click="form=null">{{ $t('Bekor') }}</button><button class="btn primary" form="branch-form" :disabled="busy">{{form.id ? $t('Saqlash') : $t('Yaratish')}}</button></template>
    </modal>

    <modal v-if="pw" :title="$t('Admin parolini tiklash') + ' — ' + pw.branch.name" @close="pw=null">
      <form id="pw-form" class="form-grid" @submit.prevent="savePw">
        <label class="f full"><span>{{ $t('Admin') }}</span>
          <select v-model="pw.user_id"><option v-for="a in pw.admins" :key="a.id" :value="a.id">{{a.full_name || a.username}} ({{a.username}}){{a.active ? '' : ' — ' + $t('bloklangan')}}</option></select>
        </label>
        <label class="f full"><span>{{ $t('Yangi parol') }}</span>
          <div class="row" style="flex-wrap:nowrap"><input v-model="pw.password" autocomplete="off" style="font-size:18px;letter-spacing:2px"><button type="button" class="btn" @click="pw.password=genPassword()">↻</button></div>
        </label>
        <p class="full small muted" style="margin:0">{{ $t('Adminning hozirgi kirishlari yopiladi.') }}</p>
      </form>
      <template #footer><button class="btn" @click="pw=null">{{ $t('Bekor') }}</button><button class="btn primary" form="pw-form">{{ $t('Saqlash') }}</button></template>
    </modal>

    <catalog-copy v-if="catalog" :branches="list" @close="catalog=false"/>

    <modal v-if="myPw" :title="$t('Parolni almashtirish')" @close="myPw=null">
      <form id="mypw-form" class="form-grid" @submit.prevent="saveMyPw">
        <label class="f full"><span>{{ $t('Eski parol') }}</span><input type="password" v-model="myPw.old_password" autocomplete="current-password"></label>
        <label class="f"><span>{{ $t('Yangi parol') }}</span><input type="password" v-model="myPw.new_password" autocomplete="new-password"></label>
        <label class="f"><span>{{ $t('Parolni takrorlang') }}</span><input type="password" v-model="myPw.new2" autocomplete="new-password"></label>
      </form>
      <template #footer><button class="btn" @click="myPw=null">{{ $t('Bekor') }}</button><button class="btn primary" form="mypw-form">{{ $t('Saqlash') }}</button></template>
    </modal>

  </div>`,
};
