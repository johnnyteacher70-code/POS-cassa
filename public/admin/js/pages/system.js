import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import { get, post, put, del, money, dt, go, route, session, debounce, toast, qs, clientName, METHODS, i18n, reloadApp, can, t, THEME_PRESETS, applyTheme } from '../lib.js';
import { translated, setLang } from '/i18n/index.js';
import { loadSettings } from '../docs.js';
import { INDUSTRIES, OPTIONAL_FIELDS, industryOf } from '../industries.js';
import { invalidateProducts } from '../components.js';

// Narx turlari (chakana, ulgurji, VIP ...): mahsulotda har bir tur uchun alohida narx, mijozga tur biriktiriladi
const PriceLevels = {
  setup() {
    const rows = ref([]);
    const name = ref('');
    const load = async () => { rows.value = await get('/api/price-levels'); };
    onMounted(load);
    const add = async () => { if (!name.value.trim()) return; await post('/api/price-levels', { name: name.value.trim() }); name.value = ''; invalidateProducts(); load(); };
    const rename = async (l) => { const n = prompt(t('Yangi nom'), l.name); if (!n || n === l.name) return; await put('/api/price-levels/' + l.id, { name: n }); load(); };
    const remove = async (l) => {
      if (!confirm(t(`"${l.name}" narx turi o'chirilsinmi? Mijozlar asosiy narxga o'tadi, mahsulotlardagi shu turdagi narxlar o'chadi.`))) return;
      await del('/api/price-levels/' + l.id); invalidateProducts(); load();
    };
    return { rows, name, add, rename, remove };
  },
  template: `
  <div class="card">
    <h2>{{ $t('Narx turlari') }}</h2>
    <p class="small muted">{{ $t("Masalan: Chakana, Ulgurji, VIP, Diler. Mahsulot formasida har bir tur uchun narx yoziladi, mijoz kartasida esa uning narx turi tanlanadi — kassada narx o'zi qo'yiladi. Narx turi tanlanmagan mijozga — asosiy narx.") }}</p>
    <div v-for="l in rows" :key="l.id" class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <b style="flex:1">{{ $t(l.name) }}</b><span class="small muted">{{l.clients}} {{ $t('mijoz') }} · {{l.products}} {{ $t('mahsulot') }}</span>
      <template v-if="$can('prices.manage')"><button class="btn sm ghost" @click="rename(l)">✎</button><button class="btn sm ghost" @click="remove(l)">🗑</button></template>
    </div>
    <div class="empty small" v-if="!rows.length" style="padding:12px">{{ $t("Hali narx turi yo'q — hamma mijozga asosiy narx") }}</div>
    <form class="row mt" v-if="$can('prices.manage')" @submit.prevent="add" style="flex-wrap:nowrap">
      <input v-model="name" :placeholder="$t('Yangi narx turi: Ulgurji')" maxlength="40" style="flex:1;min-width:0"><button class="btn primary">＋</button>
    </form>
  </div>`,
};

const ENTITY = translated({
  client: 'Mijoz', sale: 'Sotuv', payment: "To'lov", product: 'Mahsulot', stock: 'Ombor', quote: 'KP', order: 'Buyurtma',
  opening: "Boshlang'ich qoldiq", settings: 'Sozlamalar', user: 'Foydalanuvchi',
});
const ACTION = translated({ create: ['Yaratildi', 'green'], update: ['Tahrir', 'blue'], delete: ["O'chirildi", 'red'], restore: ['Tiklandi', 'purple'], cancel: ['Bekor', 'amber'], confirm: ['Tasdiq', 'green'], reject: ['Rad', 'red'] });

export const AuditPage = {
  setup() {
    const f = reactive({ q: '', entity: '', from: '', to: '', user_id: route.query.user || '' });
    const rows = ref([]);
    const open = ref(null);
    const load = async () => { rows.value = await get('/api/audit' + qs({ ...f, limit: 500 }), { latest: 'audit' }); };
    watch(() => f.q, debounce(load, 300));
    watch(() => [f.entity, f.from, f.to, f.user_id], load);
    onActivated(load);
    const pretty = (j) => { try { return JSON.stringify(JSON.parse(j), null, 2); } catch { return j; } };
    return { f, rows, open, ENTITY, ACTION, dt, pretty };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Harakatlar tarixi") }}</h1>
        <div class="small muted">{{ $t("Tizimda bajarilgan barcha amallar, o'zgarishlar va hodisalar jurnali") }}</div>
      </div>
    </div>
    <div class="row mb" style="align-items:center;gap:8px">
      <div class="search-big" style="flex:1;min-width:200px"><input v-model="f.q" :placeholder="$t('Qidirish...')"></div>
      <select v-model="f.entity" style="width:auto"><option value="">{{ $t("Barchasi") }}</option><option v-for="(l,k) in ENTITY" :key="k" :value="k">{{l}}</option></select>
      <input type="date" v-model="f.from" style="width:auto"><input type="date" v-model="f.to" style="width:auto">
      <staff-select v-model="f.user_id"/>
    </div>
    <div class="card p0">
      <table class="t rt">
        <thead><tr><th>{{ $t("Vaqt") }}</th><th>{{ $t("Kim") }}</th><th>{{ $t("Bo'lim") }}</th><th>{{ $t("Amal") }}</th><th>{{ $t("Tafsilot") }}</th></tr></thead>
        <tbody>
          <template v-for="a in rows" :key="a.id">
            <tr class="click" @click="open = open===a.id ? null : a.id">
              <td :data-l="$t('Vaqt')" class="nowrap small">🕒 {{dt(a.at)}}</td>
              <td :data-l="$t('Kim')" class="small">👤 {{$tx(a.user_name)}}</td>
              <td :data-l="$t(&quot;Bo'lim&quot;)"><span class="badge gray">{{ENTITY[a.entity] || a.entity}}</span></td>
              <td :data-l="$t('Amal')"><span class="badge" :class="(ACTION[a.action]||[])[1] || 'gray'">{{(ACTION[a.action]||[a.action])[0]}}</span></td>
              <td data-l="" class="main-cell">{{$tx(a.summary)}} <a v-if="a.client_id" :href="'#/clients/'+a.client_id" @click.stop class="small">{{ $t("mijoz") }} →</a></td>
            </tr>
            <tr v-if="open===a.id && (a.before_json || a.after_json)">
              <td colspan="5" data-l="">
                <div class="grid c2 small" style="background:var(--surface-2);padding:12px;border-radius:8px;margin:6px 0">
                  <div v-if="a.before_json"><b>{{ $t("Oldin") }}:</b><pre style="white-space:pre-wrap;margin:4px 0;background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border)">{{pretty(a.before_json)}}</pre></div>
                  <div v-if="a.after_json"><b>{{ $t("Keyin") }}:</b><pre style="white-space:pre-wrap;margin:4px 0;background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border)">{{pretty(a.after_json)}}</pre></div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div class="empty" v-if="!rows.length">{{ $t("Harakatlar tarixi bo'sh") }}</div>
    </div>
  </div>`,
};

export const TrashPage = {
  setup() {
    const data = ref(null);
    const load = async () => { data.value = await get('/api/trash'); };
    onActivated(load);
    const restore = async (url) => { await post(url + '/restore'); toast('Tiklandi', 'ok'); load(); };
    return { data, restore, money, dt, clientName, METHODS };
  },
  template: `
  <div v-if="data">
    <div class="page-head">
      <div>
        <h1>{{ $t("Savat (o'chirilganlar)") }}</h1>
        <div class="small muted">{{ $t("O'chirilgan ma'lumotlarni xavfsiz tiklash markazi") }}</div>
      </div>
    </div>
    <p class="muted small mb">{{ $t("Bu yerdagi hamma narsani bir tugma bilan qayta tiklash mumkin. Tiklanganda mijoz balansi va ombor qoldig'i avtomatik qayta hisoblanadi.") }}</p>
    <div class="card p0 mb" v-for="sec in [
      {k:'clients', t:'Mijozlar', url:'/api/clients/', label:r=>clientName(r), sub:r=>'balans '+money(r.balance)},
      {k:'sales', t:'Sotuvlar', url:'/api/sales/', label:r=>r.number+' · '+clientName(r), sub:r=>money(r.total)+' · '+dt(r.date)},
      {k:'payments', t:'To\\'lovlar', url:'/api/payments/', label:r=>(r.direction==='in'?'Kirim ':'Chiqim ')+money(r.amount)+' · '+METHODS[r.method], sub:r=>clientName(r)+' · '+dt(r.date)},
      {k:'orders', t:'Buyurtmalar', url:'/api/orders/', label:r=>'#'+r.id+' · '+clientName(r), sub:r=>money(r.total)},
      {k:'quotes', t:'KP', url:'/api/quotes/', label:r=>r.number+' · '+r.client_name, sub:r=>money(r.total)},
      {k:'products', t:'Mahsulotlar', url:'/api/products/', label:r=>r.name+' '+r.volume, sub:r=>''},
      {k:'stock', t:'Ombor harakatlari', url:'/api/products/stock/', label:r=>r.name+': '+r.qty_pieces+' dona', sub:r=>r.note},
    ]" :key="sec.k" v-show="data[sec.k].length">
      <div style="padding:12px 16px 0"><h3>{{sec.t}} ({{data[sec.k].length}})</h3></div>
      <table class="t rt"><tbody>
        <tr v-for="r in data[sec.k]" :key="r.id">
          <td class="main-cell">{{sec.label(r)}}<div class="small muted">{{sec.sub(r)}}</div></td>
          <td :data-l="$t(&quot;O'chirilgan&quot;)" class="small muted nowrap">{{dt(r.deleted_at)}}</td>
          <td data-l="" class="right"><button class="btn sm" @click="restore(sec.url + r.id)">↺ {{ $t("Tiklash") }}</button></td>
        </tr>
      </tbody></table>
    </div>
    <div class="empty card" v-if="!Object.values(data).some(x=>x.length)">{{ $t("Savat bo'sh") }}</div>
  </div>`,
};

export const SettingsPage = {
  components: { PriceLevels },
  setup() {
    const activeTab = ref('theme');
    const s = ref(null);
    const fields = ref(new Set());
    const pw = reactive({ old_password: '', new_password: '' });
    const usdRate = ref('');

    onActivated(async () => {
      s.value = { ...(await loadSettings(true)) };
      fields.value = new Set(String(s.value.product_fields || '').split(',').filter(Boolean));
      usdRate.value = s.value.usd_rate || '';
    });

    watch(s, (v) => { if (v && v.usd_rate) usdRate.value = v.usd_rate; });

    const setPreset = (k) => {
      if (!s.value) return;
      s.value.theme_preset = k;
      const p = THEME_PRESETS[k];
      if (p) s.value.theme_color = p.color;
      applyTheme({ preset: s.value.theme_preset, color: s.value.theme_color, mode: s.value.theme_mode });
    };

    const onColorInput = (e) => {
      if (!s.value) return;
      s.value.theme_color = e.target.value;
      applyTheme({ preset: s.value.theme_preset, color: s.value.theme_color, mode: s.value.theme_mode });
    };

    const toggleThemeMode = () => {
      if (!s.value) return;
      s.value.theme_mode = s.value.theme_mode === 'dark' ? 'light' : 'dark';
      applyTheme({ preset: s.value.theme_preset, color: s.value.theme_color, mode: s.value.theme_mode });
    };

    const reprice = async () => {
      const r = await post('/api/products/reprice-usd', { rate: usdRate.value });
      s.value.usd_rate = String(r.rate);
      await loadSettings(true);
      invalidateProducts();
      toast(t('Kurs saqlandi, narxlar yangilandi') + ': ' + r.updated, 'ok');
    };

    const toggleField = (k) => {
      const f = new Set(fields.value);
      if (f.has(k)) f.delete(k); else f.add(k);
      fields.value = f;
    };

    const pickIndustry = () => {
      fields.value = new Set(industryOf(s.value.industry).fields);
    };

    const save = async () => {
      s.value.product_fields = [...fields.value].join(',');
      await put('/api/settings', s.value);
      await loadSettings(true);
      applyTheme({ preset: s.value.theme_preset, color: s.value.theme_color, mode: s.value.theme_mode });
      toast(t('Sozlamalar saqlandi'), 'ok');
    };

    const changePw = async () => {
      await post('/api/auth/password', pw);
      pw.old_password = '';
      pw.new_password = '';
      toast(t("Parol o'zgartirildi"), 'ok');
    };

    const shopUrl = computed(() => location.origin + '/shop/' + (session.branch ? session.branch.slug : ''));

    const MODULES = [
      { key: 'module_pos', icon: '🛒', name: 'Kassa (POS)', desc: 'Tezkor kassa oynasi, shtrix-kod orqali qidiruv va chek chiqarish' },
      { key: 'module_debts', icon: '📑', name: 'Nasiya va Mijozlar', desc: 'Mijozlar balansi, qarz muddatlari, grafiklar va to‘lovlar tarixi' },
      { key: 'module_catalog', icon: '🌐', name: 'Onlayn Do‘kon / Katalog', desc: 'Mijozlar uchun veb-katalog va onlayn buyurtmalar qabuli' },
      { key: 'module_quotes', icon: '📄', name: 'Tijorat Taklifi (KP)', desc: 'Mijozlar uchun rasmiy tijorat taklifi va shartnoma blanki' },
      { key: 'module_purchases', icon: '🚚', name: 'Ta‘minotchilar va Xaridlar', desc: 'Tovar qabul qilish, ta‘minotchi qarzdorligi va tannarx hisobi' },
      { key: 'module_transfers', icon: '🔁', name: 'Filiallararo Ko‘chirish', desc: 'Filiallar o‘rtasida tovar almashinuvi va tranzit nazorati' },
      { key: 'module_inventory', icon: '📦', name: 'Inventarizatsiya', desc: 'Omborni to‘liq yoki qisman qayta sanash va tafovutlar hisobi' },
      { key: 'module_expenses', icon: '📉', name: 'Xarajatlar va Moliya', desc: 'Operatsion xarajatlar turlari va sof foyda hisoboti' },
      { key: 'module_shifts', icon: '⏱', name: 'Kassa Smenalari', desc: 'Kassirlarning ish smenasi, kassa ochish va topshirish' },
      { key: 'module_payroll', icon: '👥', name: 'Xodimlar va Oylik', desc: 'Sotuvchilar oyligi, savdodan foiz (KPI) va hisobotlar' },
      { key: 'module_discounts', icon: '🏷', name: 'Aksiyalar va Chegirmalar', desc: 'Mahsulotlar yoki toifalarga vaqtinchalik narx tushirish' },
      { key: 'module_bonus', icon: '🎁', name: 'Bonus (Loyallik)', desc: 'Mijozlarga xariddan keshbek berish va bonus bilan to‘lash' },
    ];

    const toggleModule = (k) => {
      if (!s.value) return;
      s.value[k] = s.value[k] === '0' ? '1' : '0';
    };

    return {
      activeTab, s, pw, save, changePw, session, dt, money, shopUrl, fields, toggleField, pickIndustry,
      INDUSTRIES, OPTIONAL_FIELDS, usdRate, reprice, THEME_PRESETS, setPreset, onColorInput,
      toggleThemeMode, MODULES, toggleModule
    };
  },
  template: `
  <div v-if="s">
    <div class="page-head">
      <div>
        <h1>{{ $t('Sozlamalar') }}</h1>
        <p class="muted" style="margin:4px 0 0">{{ $t('Filial va tizim parametrlarini o‘zingizga moslashtiring') }}</p>
      </div>
      <div v-if="$can('settings.edit')">
        <button class="btn primary" @click="save">💾 {{ $t('Barchasini saqlash') }}</button>
      </div>
    </div>

    <!-- Odoo uslubidagi tablar -->
    <div class="tabs">
      <button :class="{active: activeTab==='theme'}" @click="activeTab='theme'">🎨 {{ $t('Dizayn va Mavzu') }}</button>
      <button :class="{active: activeTab==='currency'}" @click="activeTab='currency'">💵 {{ $t('Valyuta va Narxlar') }}</button>
      <button :class="{active: activeTab==='modules'}" @click="activeTab='modules'">🧩 {{ $t('Modullar (Ilovalar)') }}</button>
      <button :class="{active: activeTab==='governance'}" @click="activeTab='governance'">⚖️ {{ $t('Savdo va Ombor Qoidalari') }}</button>
      <button :class="{active: activeTab==='company'}" @click="activeTab='company'">🏢 {{ $t('Kompaniya va Hujjatlar') }}</button>
      <button :class="{active: activeTab==='security'}" @click="activeTab='security'">🔐 {{ $t('Xavfsizlik va Narx turlari') }}</button>
    </div>

    <!-- TAB 1: Dizayn va Ranglar -->
    <div v-show="activeTab==='theme'" class="grid c2">
      <div class="card">
        <h2>🎨 {{ $t('Mavzu andosasi (Presetlar)') }}</h2>
        <p class="small muted">{{ $t('Odoo va zamonaviy SaaS dasturlari kabi o‘zingiz yoqtirgan korporativ rangni tanlang:') }}</p>
        <div class="theme-grid">
          <div v-for="(p, k) in THEME_PRESETS" :key="k" class="theme-box" :class="{active: s.theme_preset===k}" @click="setPreset(k)">
            <div class="theme-dot" :style="{background: p.color}">{{ s.theme_preset===k ? '✓' : '' }}</div>
            <div style="font-size:13px">{{ $t(p.label) }}</div>
          </div>
        </div>

        <h2 style="margin-top:20px">🖌 {{ $t('Ixtiyoriy rang tanlash (Hex Picker)') }}</h2>
        <p class="small muted">{{ $t('Brendingizga mos istalgan maxsus rangni tanlang:') }}</p>
        <div class="row mt" style="align-items:center;gap:12px">
          <input type="color" :value="s.theme_color || '#4f46e5'" @input="onColorInput" style="width:50px;height:42px;padding:2px;cursor:pointer;border-radius:8px">
          <input type="text" v-model="s.theme_color" @input="onColorInput" placeholder="#4f46e5" style="width:140px;font-family:monospace;font-size:15px">
          <button class="btn ghost sm" @click="setPreset('indigo')">↺ {{ $t('Standart rang') }}</button>
        </div>

        <h2 style="margin-top:20px">🌓 {{ $t('Mavzu rejimi (Theme Mode)') }}</h2>
        <div class="row mt" style="gap:10px">
          <button type="button" class="btn" :class="{primary: s.theme_mode!=='dark'}" @click="s.theme_mode='light'; toggleThemeMode()">☀️ {{ $t('Yorug‘ rejim (Light)') }}</button>
          <button type="button" class="btn" :class="{primary: s.theme_mode==='dark'}" @click="s.theme_mode='dark'; toggleThemeMode()">🌙 {{ $t('Qorong‘u rejim (Dark)') }}</button>
        </div>
      </div>

      <div class="card">
        <h2>👁 {{ $t('Jonli ko‘rinish (Real-time Preview)') }}</h2>
        <p class="small muted">{{ $t('Tanlangan ranglar tugmalar, belgilar va menyuda qanday ko‘rinishi:') }}</p>
        
        <div style="padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)" class="mt">
          <div class="row mb" style="justify-content:space-between">
            <b>{{ s.company_name || 'Do‘kon boshqaruv' }}</b>
            <span class="badge" style="background:var(--primary);color:#fff">Faol rejim</span>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn primary sm">Asosiy tugma</button>
            <button class="btn sm ghost">Bekor qilish</button>
          </div>
          <div class="mt" style="font-size:12px;color:var(--muted)">
            {{ $t('Rang kiritilishi bilan butun dastur darhol yangilanadi va brauzerda eslab qolinadi.') }}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: Valyuta va Narxlar -->
    <div v-show="activeTab==='currency'" class="grid c2">
      <div class="card">
        <h2>💵 {{ $t('Dollar va So‘mda sotuv') }}</h2>
        <p class="small muted">{{ $t('Mahsulotlarni dollarda kiritib, kurs bo‘yicha avtomatik so‘mga aylantirish:') }}</p>
        
        <form class="form-grid" @submit.prevent="save">
          <label class="f full"><span>{{ $t('Dollarda narxlarni yuritish') }}</span>
            <select v-model="s.usd_enabled">
              <option value="">{{ $t('O‘chiq — faqat so‘mda ishlash') }}</option>
              <option value="1">{{ $t('Yoqilgan — mahsulotda dollar narxi bo‘ladi') }}</option>
            </select>
          </label>

          <template v-if="s.usd_enabled==='1'">
            <div class="f full">
              <span>{{ $t('Dollar kursi (1 $ = ... so‘m)') }}</span>
              <div class="row" style="flex-wrap:nowrap">
                <input type="number" step="0.01" v-model="usdRate" style="flex:1;min-width:0" placeholder="12800">
                <button type="button" class="btn sm primary" v-if="$can('products.edit')" @click="reprice">⚡ {{ $t('Narxlarni yangilash') }}</button>
              </div>
              <span class="small muted mt" style="display:block">{{ $t('Tugmani bosganda barcha dollarli tovarlarning so‘mdagi narxlari yangi kurs bo‘yicha qayta hisoblanadi.') }}</span>
            </div>

            <label class="f full"><span>{{ $t('Narxlar ko‘rinishi (Displey formati)') }}</span>
              <select v-model="s.usd_display_mode">
                <option value="uzs">{{ $t('Faqat so‘mda (masalan: 128 000 so‘m)') }}</option>
                <option value="both">{{ $t('Ikkalasi ham (masalan: 128 000 so‘m ~ $10.00)') }}</option>
                <option value="usd">{{ $t('Faqat dollarda (masalan: $10.00)') }}</option>
              </select>
            </label>

            <label class="f full"><span>{{ $t('Kassada (POS) dollar qabul qilish') }}</span>
              <select v-model="s.allow_usd_payment">
                <option value="0">{{ $t('Faqat so‘m qabul qilinadi') }}</option>
                <option value="1">{{ $t('Dollar ham naqd kassa orqali qabul qilinishi mumkin') }}</option>
              </select>
            </label>
          </template>

          <label class="f full"><span>{{ $t('So‘mga aylantirishda yaxlitlash qoidasi') }}</span>
            <select v-model="s.currency_rounding">
              <option value="1">{{ $t('1 so‘mgacha (aniq hisob-kitob)') }}</option>
              <option value="100">{{ $t('100 so‘mgacha (masalan: 12 300 so‘m)') }}</option>
              <option value="500">{{ $t('500 so‘mgacha (masalan: 12 500 so‘m)') }}</option>
              <option value="1000">{{ $t('1 000 so‘mgacha (masalan: 13 000 so‘m)') }}</option>
            </select>
          </label>
        </form>
      </div>

      <div class="card">
        <h2>ℹ️ {{ $t('Valyuta siyosati') }}</h2>
        <p class="muted small">{{ $t('Dollar kursi o‘zgarganda mahsulotlar tannarxi va sotuv narxi kurs bo‘yicha avtomatik o‘zgarishi mumkin.') }}</p>
        <div style="background:var(--surface-2);padding:14px;border-radius:10px;font-size:13px;line-height:1.6">
          <div>🔹 <b>{{ $t('Asosiy valyuta:') }}</b> {{ $t('O‘zbekiston so‘mi (UZS)') }}</div>
          <div>🔹 <b>{{ $t('Joriy kurs:') }}</b> 1 USD = {{ money(s.usd_rate || 0) }} {{ $t("so'm") }}</div>
          <div>🔹 <b>{{ $t('Yaxlitlash:') }}</b> {{ s.currency_rounding || '100' }} {{ $t("so'm") }}</div>
        </div>
      </div>
    </div>

    <!-- TAB 3: Odoo uslubidagi Modullar (Apps) -->
    <div v-show="activeTab==='modules'">
      <div class="card mb">
        <h2>🧩 {{ $t('Filial modullari (Odoo uslubidagi ilovalar)') }}</h2>
        <p class="muted">{{ $t('Sizning biznesingizga qaysi bo‘limlar kerak bo‘lsa, faqat o‘shalarni yoqing. O‘chirilgan bo‘limlar menyudan yashiriladi va tizim maksimal darajada yengil ishlaydi:') }}</p>
        
        <div class="module-grid">
          <div v-for="m in MODULES" :key="m.key" class="module-card" :class="{on: s[m.key]!=='0'}">
            <div class="module-top">
              <div class="row" style="gap:10px">
                <span class="module-icon">{{m.icon}}</span>
                <div class="module-info">
                  <h3>{{ $t(m.name) }}</h3>
                </div>
              </div>
              <label class="ui-switch">
                <input type="checkbox" :checked="s[m.key]!=='0'" @change="toggleModule(m.key)">
                <span class="slider"></span>
              </label>
            </div>
            <p class="module-desc">{{ $t(m.desc) }}</p>
            <div class="mt" style="font-size:11px;font-weight:600" :style="{color: s[m.key]!=='0' ? 'var(--green)' : 'var(--muted)'}">
              {{ s[m.key]!=='0' ? '● ' + $t('Faol (Yoqilgan)') : '○ ' + $t('O‘chirilgan') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: Savdo va Ombor Qoidalari (Governance) -->
    <div v-show="activeTab==='governance'" class="grid c2">
      <div class="card">
        <h2>⚖️ {{ $t('Ombor va Savdo Qoidalari') }}</h2>
        <form class="form-grid" @submit.prevent="save">
          <label class="f full"><span>{{ $t('Manfiy qoldiqqa sotish nazorati') }}</span>
            <select v-model="s.allow_negative_stock">
              <option value="0">🛑 {{ $t('Taqiqlansin (Qoldiq yetarli bo‘lmasa sotib bo‘lmaydi)') }}</option>
              <option value="1">⚠️ {{ $t('Ruxsat berilsin (Manfiy qoldiqqa ketishi mumkin)') }}</option>
            </select>
          </label>

          <label class="f full"><span>{{ $t('Oylikda mahsulot qaytarishlarini chegirish') }}</span>
            <select v-model="s.payroll_deduct_returns">
              <option value="1">✅ {{ $t('Chegirilsin (Qaytarilgan tovardan nohaq oylik yozilmasin)') }}</option>
              <option value="0">❌ {{ $t('Chegirilmasin (Faqat umumiy savdodan hisoblansin)') }}</option>
            </select>
          </label>

          <label class="f full"><span>{{ $t('Kassa smenasi talabi') }}</span>
            <select v-model="s.require_shift">
              <option value="">{{ $t('Ixtiyoriy — smenasiz ham sotish mumkin') }}</option>
              <option value="1">{{ $t('Majburiy — smena ochilmasdan sotuv bloklanadi') }}</option>
            </select>
          </label>

          <label class="f full"><span>{{ $t('Kassada (POS) va sotuvda birlik bilan sotish') }}</span>
            <select v-model="s.pos_pieces">
              <option value="1">{{ $t('Ruxsat — birlik va qadoq') }}</option>
              <option value="0">{{ $t('Faqat qadoq (karobka, qop ...)') }}</option>
            </select>
          </label>

          <label class="f full"><span>{{ $t('Ombor qoldig‘ini hisoblash') }}</span>
            <select v-model="s.track_stock">
              <option value="1">{{ $t('Hisoblansin va ko‘rsatilsin') }}</option>
              <option value="0">{{ $t('Ko‘rsatilmasin (hamma mahsulot bor deb hisoblanadi)') }}</option>
            </select>
          </label>

          <label class="f full"><span>{{ $t('Yaroqlilik muddatini hisobga olish') }}</span>
            <select v-model="s.track_expiry">
              <option value="">{{ $t('Yo‘q') }}</option>
              <option value="1">{{ $t('Ha — xaridda partiya muddati kiritiladi') }}</option>
            </select>
          </label>
        </form>
      </div>

      <div>
        <div class="card mb">
          <h2>🎁 {{ $t('Bonus (Loyallik tizimi)') }}</h2>
          <form class="form-grid" @submit.prevent="save">
            <label class="f full"><span>{{ $t('Bonus tizimi') }}</span>
              <select v-model="s.bonus_enabled">
                <option value="">{{ $t('O‘chiq') }}</option>
                <option value="1">{{ $t('Yoqilgan') }}</option>
              </select>
            </label>
            <template v-if="s.bonus_enabled==='1'">
              <label class="f"><span>{{ $t('Har xariddan bonus (%)') }}</span><input type="number" min="0" max="50" step="0.5" v-model="s.bonus_percent" placeholder="2"></label>
              <label class="f"><span>{{ $t('Chekning necha foizini bonusda to‘lash mumkin') }}</span><input type="number" min="0" max="100" v-model="s.bonus_max_pay" placeholder="50"></label>
            </template>
          </form>
        </div>

        <div class="card">
          <h2>🧾 {{ $t('Kassa cheki') }}</h2>
          <form class="form-grid" @submit.prevent="save">
            <label class="f"><span>{{ $t('Chek lentasi kengligi') }}</span>
              <select v-model="s.receipt_width"><option value="">80 mm</option><option value="80">80 mm</option><option value="58">58 mm</option></select>
            </label>
            <label class="f"><span>{{ $t('Sotuvdan keyin chek') }}</span>
              <select v-model="s.receipt_auto"><option value="">{{ $t('Tugma bosilganda') }}</option><option value="1">{{ $t('Avtomatik chop etilsin') }}</option></select>
            </label>
            <label class="f full"><span>{{ $t('Chek pastidagi matn') }}</span>
              <input v-model="s.receipt_note" :placeholder="$t('Xaridingiz uchun rahmat!')">
            </label>
          </form>
        </div>
      </div>
    </div>

    <!-- TAB 5: Kompaniya va Soha -->
    <div v-show="activeTab==='company'" class="grid c2">
      <div class="card">
        <h2>🏢 {{ $t('Kompaniya rekvizitlari') }}</h2>
        <form class="form-grid" @submit.prevent="save">
          <label class="f full"><span>{{ $t('Kompaniya nomi') }}</span><input v-model="s.company_name"></label>
          <label class="f full"><span>{{ $t('Manzil') }}</span><input v-model="s.company_address"></label>
          <label class="f"><span>{{ $t('Telefon') }}</span><input v-model="s.company_phone"></label>
          <label class="f"><span>{{ $t('INN') }}</span><input v-model="s.company_inn"></label>
          <label class="f"><span>{{ $t('Hisob raqami') }}</span><input v-model="s.company_account"></label>
          <label class="f"><span>{{ $t('Bank') }}</span><input v-model="s.company_bank"></label>
          <label class="f"><span>{{ $t('MFO') }}</span><input v-model="s.company_mfo"></label>
          <label class="f"><span>{{ $t('Rahbar (imzo uchun)') }}</span><input v-model="s.director"></label>
          <label class="f full"><span>{{ $t('Menejer kontaktlari (hujjatlar va chekda)') }}</span><textarea v-model="s.manager_contacts" rows="2" placeholder="Oybek: +998 90 955 04 80&#10;Isfandiyor: +998 90 925 85 56"></textarea></label>
          <label class="f full"><span>{{ $t('Nakladnoy pastidagi matn') }}</span><textarea v-model="s.invoice_note" rows="2"></textarea></label>
          <label class="f full"><span>{{ $t('KP pastidagi matn (shartlar)') }}</span><textarea v-model="s.kp_note" rows="2"></textarea></label>
        </form>
      </div>

      <div>
        <div class="card mb">
          <h2>🏬 {{ $t('Soha va mahsulot maydonlari') }}</h2>
          <label class="f full mb"><span>{{ $t('Biznes sohasi') }}</span>
            <select v-model="s.industry" @change="pickIndustry">
              <option value="">—</option>
              <option v-for="(v,k) in INDUSTRIES" :key="k" :value="k">{{v.icon}} {{ $t(v.label) }}</option>
            </select>
          </label>
          <div class="f full"><span class="small muted">{{ $t('Mahsulot formasida ko‘rinadigan qo‘shimcha maydonlar:') }}</span>
            <div class="chips mt"><label v-for="(l,k) in OPTIONAL_FIELDS" :key="k" class="chip" :class="{active: fields.has(k)}" style="cursor:pointer">
              <input type="checkbox" :checked="fields.has(k)" @change="toggleField(k)" style="display:none">{{ fields.has(k) ? '✓ ' : '' }}{{ $t(l) }}</label></div>
          </div>
        </div>

        <div class="card">
          <h2>🌐 {{ $t('Katalog (Onlayn Do‘kon)') }}</h2>
          <form class="form-grid" @submit.prevent="save">
            <label class="f full"><span>{{ $t('Katalog nomi') }}</span><input v-model="s.shop_title"></label>
            <label class="f full"><span>{{ $t('Salomlashish matni') }}</span><input v-model="s.shop_welcome"></label>
            <label class="f full"><span>{{ $t('Katalogda sotuv birligi') }}</span>
              <select v-model="s.sell_unit">
                <option value="piece">{{ $t('Dona (optom narx — donaga)') }}</option>
                <option value="box">{{ $t('Faqat karobka') }}</option>
                <option value="both">{{ $t('Dona va karobka') }}</option>
              </select>
            </label>
            <div class="full small muted">
              {{ $t('Katalog havolasi') }}: <a :href="shopUrl" target="_blank">{{shopUrl}}</a>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- TAB 6: Xavfsizlik va Narx turlari -->
    <div v-show="activeTab==='security'" class="grid c2">
      <div>
        <div class="card mb">
          <h2>🔐 {{ $t('Parolni almashtirish') }}</h2>
          <form class="form-grid" @submit.prevent="changePw">
            <label class="f"><span>{{ $t('Eski parol') }}</span><input type="password" v-model="pw.old_password" autocomplete="current-password"></label>
            <label class="f"><span>{{ $t('Yangi parol') }}</span><input type="password" v-model="pw.new_password" autocomplete="new-password"></label>
            <div class="full right"><button class="btn primary">{{ $t('O‘zgartirish') }}</button></div>
          </form>
        </div>

        <div class="card">
          <h2>👥 {{ $t('Xodimlar va Huquqlar') }}</h2>
          <p class="muted">{{ $t('Sotuvchilarni qo‘shish, login/parol berish va ularning oylik hisobotlari:') }}</p>
          <a class="btn" href="#/staff">🧑‍💼 {{ $t('Xodimlar bo‘limiga o‘tish') }}</a>
        </div>
      </div>

      <div>
        <price-levels/>
      </div>
    </div>
  </div>`,
};

export const LoginPage = {
  setup() {
    const f = reactive({ username: '', password: '' });
    const busy = ref(false);
    const ticket = ref('');
    const code = ref('');
    const showPw = ref(false);
    const errorMsg = ref('');
    const rememberMe = ref(true);

    onMounted(() => {
      try {
        const saved = localStorage.getItem('saved_login');
        if (saved) f.username = saved;
      } catch {}
    });

    const submit = async () => {
      busy.value = true;
      errorMsg.value = '';
      try {
        const r = await post('/api/auth/login', f);
        if (r.need_2fa) { ticket.value = r.ticket; busy.value = false; return; }   // ikki bosqichli kirish
        if (rememberMe.value) {
          try { localStorage.setItem('saved_login', f.username); } catch {}
        } else {
          try { localStorage.removeItem('saved_login'); } catch {}
        }
        reloadApp();
      } catch (err) {
        busy.value = false;
        errorMsg.value = err.message || t("Login yoki parol noto'g'ri");
      }
    };
    const submit2 = async () => {
      busy.value = true;
      errorMsg.value = '';
      try { await post('/api/auth/2fa', { ticket: ticket.value, code: code.value }); reloadApp(); }
      catch (e) {
        busy.value = false;
        code.value = '';
        if (e.status === 401 && /qaytadan/.test(e.message)) ticket.value = '';
        errorMsg.value = e.message || t("Tasdiqlash kodi noto'g'ri");
      }
    };
    return { f, busy, submit, submit2, ticket, code, showPw, errorMsg, rememberMe, i18n, setLang };
  },
  template: `
  <div class="login-wrap">
    <brand-logo variant="full" class="login-logo"/>
    <form class="card" v-if="ticket" @submit.prevent="submit2">
      <h2>🔐 {{ $t('Tasdiqlash kodi') }}</h2>
      <p class="muted small" style="text-align:center;margin-bottom:14px">{{ $t('Telefoningizdagi autentifikator ilovasidagi 6 xonali kodni kiriting') }}</p>
      <div v-if="errorMsg" class="login-alert neg mb">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{{ errorMsg }}</span>
      </div>
      <label class="f mb"><input v-model="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus style="font-size:24px;letter-spacing:8px;text-align:center"></label>
      <button class="btn primary" style="width:100%" :disabled="busy || code.length < 6">
        <span v-if="busy">⏳ {{ $t('Tekshirilmoqda...') }}</span>
        <span v-else>{{ $t('Kirish') }}</span>
      </button>
      <div style="text-align:center;margin-top:12px">
        <a href="" class="small muted" @click.prevent="ticket=''; errorMsg=''">← {{ $t('Orqaga') }}</a>
      </div>
    </form>
    <form class="card" v-else @submit.prevent="submit">
      <div class="lang-sw" style="justify-content:center;margin-bottom:12px">
        <button type="button" :class="{on: i18n.lang==='uz'}" @click="setLang('uz')">O'zbekcha</button>
        <button type="button" :class="{on: i18n.lang==='ru'}" @click="setLang('ru')">Русский</button>
        <button type="button" :class="{on: i18n.lang==='en'}" @click="setLang('en')">English</button>
      </div>
      <h2>{{ $t('Boshqaruv paneliga kirish') }}</h2>
      <div v-if="errorMsg" class="login-alert neg mb">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{{ errorMsg }}</span>
      </div>
      <label class="f mb">
        <span>{{ $t('Login') }}</span>
        <input v-model="f.username" autocomplete="username" autofocus :placeholder="$t('Loginingizni kiriting')">
      </label>
      <label class="f mb">
        <span>{{ $t('Parol') }}</span>
        <div class="input-with-action">
          <input :type="showPw ? 'text' : 'password'" v-model="f.password" autocomplete="current-password" :placeholder="$t('Parolingizni kiriting')">
          <button type="button" class="btn-input-action" @click="showPw = !showPw" :title="showPw ? $t('Yashirish') : $t(&quot;Ko'rsatish&quot;)" tabindex="-1">
            <svg v-if="showPw" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </label>
      <div class="row mb" style="justify-content:space-between;margin-top:-4px">
        <label class="check small">
          <input type="checkbox" v-model="rememberMe">
          <span>{{ $t('Eslab qolish') }}</span>
        </label>
      </div>
      <button class="btn primary" style="width:100%" :disabled="busy">
        <span v-if="busy">⏳ {{ $t('Kirilmoqda...') }}</span>
        <span v-else>{{ $t('Kirish') }}</span>
      </button>
    </form>
    <div class="login-foot">Do'kon boshqaruv · {{ new Date().getFullYear() }}</div>
  </div>`,
};
