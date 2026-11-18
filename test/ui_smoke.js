// Brauzer testi (headless Chrome): sahifalarda JS xatosi va Vue ogohlantirishi yo'qligi + asosiy oqimlar.
// Ishga tushirish: node ui_smoke.js <baseURL (demo bilan)> <freshURL (bo'sh baza)>
//   freshURL: birinchi sozlash → filial yaratish → filialga kirish → qaytish → xodim login formasi
//   baseURL:  egasi va filial admini sifatida barcha sahifalar, katalog
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [B, FRESH] = process.argv.slice(2);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => fs.existsSync(p));
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PAGES = ['/', '/pos', '/clients', '/clients/1', '/debts', '/sales', '/sales/1', '/payments', '/registers', '/orders', '/orders/1',
  '/quotes', '/products', '/products/1', '/reviews', '/staff', '/roles', '/audit', '/trash', '/settings', '/suppliers', '/purchases', '/purchases/new', '/labels?ids=1,2', '/expenses', '/shifts', '/inventory', '/reports', '/transfers', '/transfers/new', '/promotions', '/hardware', '/clients/1/akt', '/purchase-orders', '/purchase-orders/new', '/payroll', '/partner-loans'];

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const handlers = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else handlers.forEach((h) => h(d));
  };
  return {
    send: (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (h) => handlers.push(h),
    close: () => ws.close(),
  };
}

let pass = 0, fail = 0;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-smoke-'));
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1280,900', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
    }
    const c = await cdp(target.webSocketDebuggerUrl);
    let errors = [];
    c.on((d) => {
      if (d.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) {
        errors.push(d.params.type.toUpperCase() + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      }
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon|fonts\.g/.test(d.params.entry.url || '')) {
        errors.push('LOG: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
      }
    });
    await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable'); await c.send('Network.enable');
    const js = async (expr) => {
      const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result.exceptionDetails) throw new Error('JS: ' + expr.slice(0, 80) + ' → ' + r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    const check = (name, cond = true, extra = '') => {
      const real = errors.filter((e) => !/Failed to load resource.*(401|403|404)|example\.invalid|navigator\.vibrate/.test(e));
      if (!cond) real.push('Shart bajarilmadi' + (extra ? ': ' + extra : ''));
      if (real.length) { fail++; console.log(`✗ ${name}\n    ` + real.join('\n    ')); } else pass++;
      errors = [];
    };
    const go = async (url, wait = 1800) => { await c.send('Page.navigate', { url }); await sleep(wait); };
    const text = () => js('document.body.innerText');
    // Vue v-model uchun: qiymat yoziladi va input hodisasi chiqariladi
    const fill = (sel, val) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('topilmadi: ${sel}'); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const clickText = (txt, scope = 'button, a') => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => b.innerText.includes(${JSON.stringify(txt)}) && b.offsetParent); if (!el) throw new Error('tugma topilmadi: ${txt}'); el.click(); })()`);
    const clearCookies = () => c.send('Network.clearBrowserCookies');

    // O'z-o'zini tekshirish: xato yig'uvchi ishlayaptimi
    await js(`console.error('selfcheck')`); await sleep(200);
    if (!errors.length) { console.log('✗ xato yig\'uvchi ishlamayapti'); fail++; } else pass++;
    errors = [];

    // ================= Toza baza: birinchi sozlashdan filialga kirishgacha =================
    if (FRESH) {
      await go(FRESH + '/');
      check('setup sahifasi ochildi', (await text()).includes('Birinchi sozlash'));
      const inputs = 'form input';
      await js(`[...document.querySelectorAll('${inputs}')].length`);
      await fill('form input:nth-of-type(1)', '');
      await js(`(() => { const i = document.querySelectorAll('form input'); const v = ['Test Egasi', 'egasi', 'parol123', 'parol123']; i.forEach((el, k) => { el.value = v[k]; el.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
      await clickText('Yaratish va kirish');
      await sleep(2500);
      const t0 = await text();
      check('setup → biznes ustasi (soha tanlash)', t0.includes('Xush kelibsiz') && (await js(`document.querySelectorAll('.ind-card').length`)) >= 8, t0.slice(0, 200));
      await fill('.onboard input[maxlength="40"]', 'Sinov Savdo');
      await js(`[...document.querySelectorAll('.ind-card')].find((b) => b.innerText.includes('Oziq-ovqat')).click()`); await sleep(200);
      await clickText('Davom etish'); await sleep(2500);
      const t1 = await text();
      check('ustadan keyin: brend nomi va bo\'sh filiallar', t1.includes("Hali filial yo'q") && t1.includes('Test Egasi') && (await js(`document.querySelector('.owner-top svg').outerHTML.includes('Sinov Savdo')`)), t1.slice(0, 200));

      await clickText('Filial yaratish');
      await sleep(500);
      await fill('.modal input[placeholder="masalan: Chilonzor filiali"]', 'Chilonzor filiali');
      const slug = await js(`document.querySelector('.modal input[placeholder="chilonzor"]').value`);
      check('nomdan qisqa kod avtomatik', slug === 'chilonzor-filiali', slug);
      await fill('.modal input[placeholder="masalan: chilonzor_admin"]', 'chil_admin');
      await js(`(() => { const el = [...document.querySelectorAll('.modal input')].find((i) => /^\\d{6}$/.test(i.value)); el.value = 'chil123'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await clickText('Yaratish', '.modal .mf button');
      await sleep(1500);
      const t2 = await text();
      check('filial yaratildi, kartochka chiqdi', t2.includes('Chilonzor filiali') && t2.includes('/shop/chilonzor-filiali') && !t2.includes("Hali filial yo'q"), t2.slice(0, 300));

      await clickText('Kirish');
      await sleep(2500);
      const t3 = await text();
      check('egasi filialga kirdi: filial nomi va qaytish tugmasi', t3.includes('Chilonzor filiali') && t3.includes('Filiallarga qaytish') && t3.includes('Bosh sahifa'), t3.slice(0, 300));
      await js(`location.hash = '#/staff'`); await sleep(1200);
      check('filial ichida xodimlar sahifasi', (await text()).includes('chil_admin'));

      await clickText('Filiallarga qaytish');
      await sleep(2500);
      check('filiallar sahifasiga qaytdi', (await text()).includes('Filial yaratish'));

      // Filial admini login formasi orqali
      await clearCookies();
      await go(FRESH + '/');
      check('login sahifasi', (await text()).includes('Boshqaruv paneliga kirish'));
      await js(`(() => { const i = document.querySelectorAll('form input'); const v = ['chil_admin', 'chil123']; i.forEach((el, k) => { el.value = v[k]; el.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
      await clickText('Kirish', 'form button');
      await sleep(2500);
      const t4 = await text();
      check('filial admini login → o\'z filiali, qaytish tugmasi yo\'q', t4.includes('Chilonzor filiali') && t4.includes('Bosh sahifa') && !t4.includes('Filiallarga qaytish'), t4.slice(0, 300));
      await clearCookies();
    }

    // ================= Demo baza: filial admini — barcha sahifalar =================
    await go(B + '/');
    await js(`(() => { const i = document.querySelectorAll('form input'); const v = ['admin', 'admin123']; i.forEach((el, k) => { el.value = v[k]; el.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
    await clickText('Kirish', 'form button');
    await sleep(2500);
    check('A admini kirdi', (await text()).includes('A filial'));
    for (const p of ADMIN_PAGES) {
      await js(`location.hash = '#${p}'`);
      await sleep(900);
      const len = await js(`(document.querySelector('main') || document.body).innerText.length`);
      check('admin ' + p, len > 0);
    }

    // ================= POS: mahsulot bosiladi → sotuv yakunlanadi → chek; qoldiq kamayadi =================
    const stockSum = () => js(`fetch('/api/products/stock').then((r) => r.json()).then((d) => d.s.reduce((a, x) => a + x[1], 0))`);
    await js(`location.hash = '#/pos'`); await sleep(1500);
    const before = await stockSum();
    await js(`document.querySelector('.pos-tile').click()`); await sleep(500);
    await js(`document.querySelector('.pos-go').click()`); await sleep(2500);
    const after = await stockSum();
    check('POS sotuv: chek chiqdi, qoldiq kamaydi', (await text()).includes('Nakladnoy chop etish') && after < before, [before, after]);

    // ================= Skaner (klaviatura-emulyatsiya): kursor boshqa maydonda bo'lsa ham savatga tushadi =================
    await js(`location.hash = '#/pos'`); await sleep(1500);
    await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Yangi sotuv') && x.offsetParent); if (b) b.click(); })()`); await sleep(800);
    const code = await js(`fetch('/api/products').then((r) => r.json()).then((l) => (l.find((p) => p.barcode && p.active) || {}).barcode)`);
    const cartBefore = await js(`document.querySelectorAll('.pos-line').length`);
    await js(`(document.querySelector('.pos-cart .ac input') || document.querySelector('.pos-cart input')).focus()`);
    for (const ch of code) {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(600);
    const cartAfter = await js(`document.querySelectorAll('.pos-line').length`);
    const leaked = await js(`(document.querySelector('.pos-cart .ac input') || document.querySelector('.pos-cart input')).value`);
    check('skaner: kod savatga tushdi, mijoz maydonida qolmadi', !!code && cartAfter === cartBefore + 1 && !leaked.includes(code), { code, cartBefore, cartAfter, leaked });
    // Sekin yozish (odam) skaner deb hisoblanmaydi
    await js(`document.querySelector('.search-big input').focus()`);
    for (const ch of '12345') { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(150); }
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(400);
    check('skaner: sekin yozilgan matn skaner emas', (await js(`document.querySelectorAll('.pos-line').length`)) === cartAfter);
    await js(`(() => { const el = document.querySelector('.search-big input'); el.value=''; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    // Naqd: mijoz berdi → qaytim
    await clickText('liq', '.pos-cart button'); await sleep(200);
    await js(`(() => { const el = document.querySelector('#cash-given input') || document.querySelector('#cash-given'); el.value = '9999999'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    check('naqd: qaytim ko\'rsatildi', (await text()).includes('Qaytim'));
    await js(`(() => { const b = [...document.querySelectorAll('.pos-cart button')].find((x) => x.innerText.includes('Tozalash')); if (b) { window.confirm = () => true; b.click(); } })()`); await sleep(300);

    // ================= PWA: manifest va service worker =================
    check('PWA: manifest', await js(`fetch('/manifest.webmanifest').then((r) => r.json()).then((m) => !!m.name && m.display === 'standalone')`));
    check('PWA: service worker ro\'yxatdan o\'tdi', await js(`new Promise((r) => setTimeout(() => navigator.serviceWorker.getRegistration().then((g) => r(!!g)), 1500))`));

    // ================= Telefon ekrani: kassa savati alohida oynada =================
    await c.send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: true });
    await js(`location.hash = '#/pos'`); await sleep(1200);
    await js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Yangi sotuv') && x.offsetParent); if (b) b.click(); })()`); await sleep(600);
    await js(`document.querySelector('.pos-tile').click()`); await sleep(300);
    await js(`document.querySelector('.pos-bar').click()`); await sleep(700);
    check('telefon: savat oynasi ochiladi va to\'la', await js(`!!document.querySelector('.pos-cart-in') && document.querySelectorAll('.pos-line').length > 0`));
    await c.send('Emulation.clearDeviceMetricsOverride');
    await js(`history.back()`); await sleep(500);

    // ================= Xaridor ekrani (ikkinchi monitor) =================
    await go(B + '/display', 1500);
    check('xaridor ekrani: kutish holati', (await text()).includes('Xush kelibsiz'));
    await js(`new BroadcastChannel('pos-display').postMessage({ mode: 'cart', items: [{ name: 'Sinov mahsulot', qty: '2', unit: 'dona', price: 15000, total: 30000, promo: 10 }], total: 30000, paid: 50000, given: 50000, change: 20000 })`);
    await sleep(400);
    const dtx = await text();
    check('xaridor ekrani: savat, jami, qaytim', dtx.includes('Sinov mahsulot') && dtx.includes('30 000') && dtx.includes('Qaytim') && dtx.includes('20 000'), dtx.slice(0, 200));
    await go(B + '/', 1500);

    // ================= Qaytarish oynasi (sotuv sahifasidan) =================
    await js(`location.hash = '#/sales/1'`); await sleep(1200);
    await clickText('Qaytarish', '.doc-toolbar button'); await sleep(900);
    check('qaytarish oynasi: pozitsiyalar', await js(`document.querySelectorAll('.modal table tbody tr').length > 0`));
    await clickText('Bekor', '.modal .mf button'); await sleep(300);

    // ================= Mahsulot formasi: birlik, qadoq, shtrix-kod =================
    await js(`location.hash = '#/products'`); await sleep(1000);
    await clickText('Yangi mahsulot'); await sleep(600);
    check('mahsulot formasi: birlik va shtrix-kod maydonlari', await js(`!!document.querySelector('.modal select') && [...document.querySelectorAll('.modal .f span')].some((e) => e.innerText.includes('Shtrix-kod'))`));
    await clickText('Bekor', '.modal .mf button'); await sleep(300);

    // ================= Etiketka: shtrix-kod SVG chizildi =================
    await js(`location.hash = '#/labels?ids=1,2,3'`); await sleep(1300);
    check('etiketkalar: 3 ta, shtrix-kod chizilgan', await js(`document.querySelectorAll('.label').length === 3 && document.querySelectorAll('.label svg rect').length > 30`));

    // ================= Rollar: yangi rol shablondan, solishtirish jadvali =================
    await js(`location.hash = '#/roles'`); await sleep(1200);
    const rt = await text();
    check('rollar sahifasi: tayyor rollar', ['Administrator', 'Sotuvchi', 'Kassir', 'Omborchi'].every((n) => rt.includes(n)), rt.slice(0, 300));
    await clickText('Yangi rol'); await sleep(500);
    await fill('.modal input[placeholder="masalan: Katta kassir"]', 'UI test roli');
    await clickText('Omborchi', '.modal .chip'); await sleep(200);
    const picked = await js(`document.querySelectorAll('.modal .check.perm input:checked').length`);
    check('shablon ruxsatlarni belgiladi', picked === 12, picked);
    await clickText('Saqlash', '.modal .mf button'); await sleep(1200);
    check('yangi rol kartochkasi', (await text()).includes('UI test roli'));
    await clickText('Solishtirish jadvali', '.tabs button'); await sleep(500);
    check('solishtirish jadvali', await js(`document.querySelectorAll('table.matrix tbody tr').length > 30`));

    // ================= Kassir (cheklangan rol): faqat ruxsat berilgan bo'limlar =================
    await clearCookies();
    await go(B + '/');
    await js(`(() => { const i = document.querySelectorAll('form input'); const v = ['vali', '1234']; i.forEach((el, k) => { el.value = v[k]; el.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
    await clickText('Kirish', 'form button');
    await sleep(2500);
    const navText = await js(`document.querySelector('.sidebar nav').innerText`);
    check('kassir: POS ochildi, menyu cheklangan', (await js('location.hash')) === '#/pos' && navText.includes('POS') && !navText.includes('Bosh sahifa') && !navText.includes('Mijozlar') && !navText.includes('Harakatlar tarixi'), navText);
    await js(`document.querySelector('.pos-tile').click()`); await sleep(500);
    const posText = await text();
    check('kassir: chegirma va "Qarzga" yo\'q', !posText.includes('Chegirma') && !/\bQarzga\b/.test(posText.replace('Qarzga yoziladi', '')), posText.slice(0, 200));
    await js(`location.hash = '#/audit'`); await sleep(900);
    check('kassir: ruxsatsiz bo\'lim — qulf', (await text()).includes("ruxsatingiz yo'q"));

    // ================= Egasi: filiallar sahifasi va filial ichida =================
    await clearCookies();
    await go(B + '/');
    await js(`(() => { const i = document.querySelectorAll('form input'); const v = ['owner', 'owner123']; i.forEach((el, k) => { el.value = v[k]; el.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
    await clickText('Kirish', 'form button');
    await sleep(2500);
    const o1 = await text();
    check('egasi: filiallar kartochkalari', o1.includes('A filial') && o1.includes('B filial'), o1.slice(0, 300));
    check('egasi: umumiy hisobot', o1.includes('Sof foyda') && o1.includes('Filiallar solishtiruvi'), o1.slice(0, 300));
    await clickText('Sozlamalar', '.tabs button');
    let os1 = '';
    for (let i = 0; i < 20; i++) { await sleep(300); os1 = await text(); if (os1.includes("Parol o'rnatish") && await js(`!!document.querySelector('.qr-box svg')`)) break; }
    check('egasi sozlamalari: brend, litsenziya, zaxira, tarmoq QR', os1.includes('Litsenziya') && os1.includes('Zaxira nusxalar') && os1.includes('Brend') && os1.includes("Parol o'rnatish") && (await js(`!!document.querySelector('.qr-box svg')`)), os1.slice(Math.max(0, os1.indexOf('Zaxira nusxalar') - 50), os1.indexOf('Zaxira nusxalar') + 500));
    await clickText('Filiallar', '.tabs button'); await sleep(500);
    await clickText('Tahrirlash'); await sleep(400);
    check('tahrirlash oynasi (qisqa kod o\'zgarmaydi)', await js(`document.querySelector('.modal input[placeholder="chilonzor"]').disabled`));
    await clickText('Bekor', '.modal button'); await sleep(300);
    await clickText('Admin paroli'); await sleep(800);
    check('admin paroli oynasi', (await text()).includes('Admin parolini tiklash'));
    await clickText('Bekor', '.modal button'); await sleep(300);

    // ================= Katalog =================
    await go(B + '/shop/filial-a', 2500);
    check('katalog /shop/filial-a');
    await js(`[...document.querySelectorAll('nav.tabs button')].forEach((b, i) => setTimeout(() => b.click(), i * 400))`);
    await sleep(2500);
    check('katalog tablar');
    c.close();
  } finally {
    chrome.kill();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(`\nBRAUZER: ${pass} o'tdi, ${fail} xato`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('BRAUZER TESTI YIQILDI:', e.message); process.exit(1); });
