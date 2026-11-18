// Uskunalar: chek printeri (har bir kassaga), pul yashigi, shtrix-kod skaneri (klaviatura / COM / kamera)
import { ref, reactive, onActivated, onDeactivated, watch } from 'vue';
import { get, put, post, toast, t } from '../lib.js';
import { loadRegisters } from '../components.js';
import { hw, saveHw, beep, onScan, serialSupported, connectSerial, startCamera, resetPrinterCache } from '../hardware.js';

const MODES = {
  browser: { icon: '🌐', label: 'Brauzer orqali', hint: "Har qanday printer (Windows/Linux'da o'rnatilgan bo'lsa). Chop etish oynasi chiqadi; oynasiz chiqarish uchun kassani «kassa.bat» bilan oching (Chrome --kiosk-printing)." },
  network: { icon: '📡', label: 'Tarmoq printeri (IP)', hint: "Wi-Fi yoki LAN kabelli chek printeri. Printerdan o'z sozlama chekini chiqaring (odatda FEED tugmasini bosib yoqiladi) — unda IP manzil yozilgan. Port odatda 9100." },
  system: { icon: '🖥', label: "Kompyuterga o'rnatilgan printer", hint: "USB orqali ulangan va drayveri o'rnatilgan printer. Windows: printer xususiyatlarida «Общий доступ / Sharing» ni yoqing va shu nomni tanlang. Linux/Mac: CUPS printer nomi." },
  device: { icon: '🔌', label: 'USB qurilma (to\'g\'ridan-to\'g\'ri)', hint: "Linux: drayversiz USB printer — /dev/usb/lp0. Serial/COM printer — /dev/ttyUSB0 yoki COM3." },
};

export const HardwarePage = {
  setup() {
    const regs = ref([]);
    const rid = ref('');
    const f = ref(null);
    const devices = ref({ printers: [], devices: [], platform: '' });
    const busy = ref('');
    const scans = ref([]);
    const camOn = ref(false);
    const video = ref(null);
    let stopCam = null, off = null;

    const loadCfg = async () => { if (rid.value) f.value = await get('/api/hardware/printer/' + rid.value); };
    onActivated(async () => {
      regs.value = (await loadRegisters(true)).filter((r) => r.active);
      if (!rid.value && regs.value[0]) rid.value = regs.value[0].id;
      await loadCfg();
      devices.value = await get('/api/hardware/devices').catch(() => devices.value);
      off = onScan((code, src) => { beep(true); scans.value.unshift({ code, src, at: new Date().toLocaleTimeString('ru-RU') }); scans.value = scans.value.slice(0, 8); });
    });
    onDeactivated(() => { if (off) off(); if (stopCam) { stopCam(); stopCam = null; camOn.value = false; } });
    watch(rid, loadCfg);

    const save = async () => {
      busy.value = 'save';
      try { f.value = await put('/api/hardware/printer/' + rid.value, f.value); resetPrinterCache(); toast('Saqlandi', 'ok'); } finally { busy.value = ''; }
    };
    const test = async (drawer = false) => {
      await save();
      busy.value = 'test';
      try { await post('/api/hardware/test/' + rid.value, { drawer }); toast(drawer ? "Test cheki va pul yashigi buyrug'i yuborildi" : 'Test cheki yuborildi', 'ok'); } finally { busy.value = ''; }
    };
    const drawerOpen = async () => { await save(); await post('/api/hardware/drawer/' + rid.value); toast('Pul yashigi ochildi', 'ok'); };
    const serial = async () => { try { await connectSerial(); toast('Skaner ulandi', 'ok'); } catch (e) { if (e.name !== 'NotFoundError') toast(e.message, 'error'); } };
    const camera = async () => {
      if (camOn.value) { if (stopCam) stopCam(); stopCam = null; camOn.value = false; return; }
      camOn.value = true;
      await new Promise((r) => setTimeout(r, 50));
      try { stopCam = await startCamera(video.value, (code) => { beep(true); scans.value.unshift({ code, src: 'camera', at: new Date().toLocaleTimeString('ru-RU') }); }); }
      catch (e) { camOn.value = false; toast(t("Kamerani ochib bo'lmadi") + ': ' + e.message, 'error'); }
    };
    return { regs, rid, f, devices, busy, scans, camOn, video, save, test, drawerOpen, serial, camera, hw, saveHw, serialSupported, MODES };
  },
  template: `
  <div>
    <div class="page-head"><h1>{{ $t('Uskunalar') }}</h1></div>
    <div class="grid c2">
      <div class="card">
        <h2>🖨 {{ $t('Chek printeri') }}</h2>
        <label class="f mb"><span>{{ $t('Kassa') }}</span>
          <select v-model="rid"><option v-for="r in regs" :key="r.id" :value="r.id">{{ $t(r.name) }}</option></select></label>
        <template v-if="f">
          <div class="mode-grid">
            <button v-for="(m,k) in MODES" :key="k" type="button" class="mode-card" :class="{on: f.mode===k}" @click="f.mode=k">
              <span class="mi">{{m.icon}}</span><b>{{ $t(m.label) }}</b></button>
          </div>
          <p class="small muted">{{ $t(MODES[f.mode].hint) }}</p>
          <div class="form-grid">
            <template v-if="f.mode==='network'">
              <label class="f"><span>{{ $t('IP manzil') }}</span><input v-model="f.host" placeholder="192.168.1.100"></label>
              <label class="f"><span>{{ $t('Port') }}</span><input type="number" v-model.number="f.port" placeholder="9100"></label>
            </template>
            <label class="f full" v-if="f.mode==='system'"><span>{{ $t('Printer') }}</span>
              <select v-model="f.name"><option value="" disabled>{{ devices.printers.length ? $t('Tanlang') : $t('Printer topilmadi') }}</option><option v-for="p in devices.printers" :key="p" :value="p">{{p}}</option></select></label>
            <label class="f full" v-if="f.mode==='device'"><span>{{ $t('Qurilma') }}</span>
              <input v-model="f.device" list="hw-devs" placeholder="/dev/usb/lp0"><datalist id="hw-devs"><option v-for="d in devices.devices" :key="d" :value="d"/></datalist></label>
            <label class="f"><span>{{ $t("Qog'oz kengligi") }}</span><select v-model.number="f.width"><option :value="80">80 mm</option><option :value="58">58 mm</option></select></label>
            <label class="f" v-if="f.mode!=='browser'"><span>{{ $t('Kirill harflari (kod sahifasi)') }}</span><select v-model="f.codepage"><option value="cp866">CP866</option><option value="cp1251">CP1251</option><option value="ascii">{{ $t('Faqat lotin') }}</option></select></label>
            <template v-if="f.mode!=='browser'">
              <label class="check"><input type="checkbox" v-model="f.auto"> {{ $t('Sotuvdan keyin chek avtomatik') }}</label>
              <label class="check"><input type="checkbox" v-model="f.cut"> {{ $t("Qog'ozni kesish") }}</label>
              <label class="check"><input type="checkbox" v-model="f.drawer"> {{ $t("Naqd to'lovda pul yashigini ochish") }}</label>
              <label class="check"><input type="checkbox" v-model="f.qr"> {{ $t('Chekda QR kod') }}</label>
            </template>
          </div>
          <div class="row mt">
            <button class="btn primary" :disabled="!!busy" @click="save">{{ $t('Saqlash') }}</button>
            <button class="btn" v-if="f.mode!=='browser'" :disabled="!!busy" @click="test(false)">🧾 {{ $t('Test cheki') }}</button>
            <button class="btn" v-if="f.mode!=='browser'" :disabled="!!busy" @click="drawerOpen">💰 {{ $t('Yashikni ochish') }}</button>
          </div>
          <p class="small muted mt" v-if="f.mode!=='browser'">{{ $t("Pul yashigi chek printerining «DK / Cash drawer» portiga RJ11 kabel bilan ulanadi — printer orqali ochiladi.") }}</p>
        </template>
        <div class="empty" v-else>{{ $t("Avval Kassalar bo'limida kassa yarating") }}</div>
      </div>

      <!-- Canon va Wi-Fi printerlar uchun qo'llanma -->
      <div class="card" style="background:var(--surface-2);border:1px solid #a7f3d0">
        <h3 style="margin:0 0 6px">🖨 {{ $t('Canon va boshqa Wi-Fi printerlar (Android / iOS)') }}</h3>
        <p class="small muted" style="margin:0 0 10px;line-height:1.45">
          {{ $t("Canon printerlar Wi-Fi orqali to'g'ridan-to'g'ri ulangan bo'lsa, telefonda Canon PRINT ilovasini o'rnatish kifoya. Nakladnoy yoki KP da «Canon / Wi-Fi» yoki «Chop etish» bosilganda PDF avtomatik Canon ilovasiga yuboriladi:") }}
        </p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <a href="https://play.google.com/store/apps/details?id=jp.co.canon.bsd.ad.pixmaprint" target="_blank" class="btn sm" style="background:#fff">🤖 Android: Canon PRINT (Google Play) ↗</a>
          <a href="https://apps.apple.com/us/app/canon-print/id664425773" target="_blank" class="btn sm" style="background:#fff">🍏 iOS: Canon PRINT (App Store) ↗</a>
        </div>
      </div>

      <div class="card">
        <h2>▥ {{ $t('Shtrix-kod skaneri') }}</h2>
        <p class="small muted">{{ $t("USB va Bluetooth skanerlar qo'shimcha sozlamasiz ishlaydi: kompyuterga ulang va istalgan shtrix-kodni o'qiting — pastda paydo bo'lishi kerak. Kassa ekranida kursor qayerda bo'lmasin, kod savatga tushadi.") }}</p>
        <div class="scan-test">
          <div v-for="(s,i) in scans" :key="i" class="row small" style="padding:3px 0"><b style="flex:1">{{s.code}}</b><span class="badge gray">{{ s.src === 'serial' ? 'COM' : s.src === 'camera' ? $t('kamera') : 'USB' }}</span><span class="muted">{{s.at}}</span></div>
          <div class="empty small" v-if="!scans.length">{{ $t("Skanerdan shtrix-kod o'qiting...") }}</div>
        </div>
        <div class="form-grid mt">
          <label class="f"><span>{{ $t("Sezgirlik (belgilar oralig'i, ms)") }}</span><input type="number" min="15" max="150" v-model.number="hw.maxGap" @change="saveHw"></label>
          <label class="f"><span>{{ $t('Eng qisqa kod (belgi)') }}</span><input type="number" min="2" max="20" v-model.number="hw.minLen" @change="saveHw"></label>
          <label class="check full"><input type="checkbox" v-model="hw.sound" @change="saveHw"> {{ $t('Skanerlanganda ovoz') }}</label>
        </div>
        <p class="small muted">{{ $t("Skaner kodni o'qisa-yu, savatga tushmasa — sezgirlikni oshiring (masalan 80). Klaviaturada tez yozganda tasodifan ushlanib qolsa — kamaytiring.") }}</p>
        <div class="row mt">
          <button class="btn" v-if="serialSupported()" @click="serial">🔌 {{ hw.serial ? $t('COM skaner ulangan') : $t('COM (serial) skaner ulash') }}</button>
          <button class="btn" @click="camera">📷 {{ camOn ? $t('Kamerani yopish') : $t('Kamera bilan sinash') }}</button>
        </div>
        <video v-show="camOn" ref="video" playsinline muted style="width:100%;margin-top:10px;border-radius:10px;background:#000;max-height:260px"></video>
        <div class="tips mt">
          <b>{{ $t('Maslahatlar') }}</b>
          <ul class="small">
            <li>{{ $t("Skaner «USB HID / klaviatura» rejimida bo'lsin (ko'pchiligida standart). Oxirida «Enter» (CR) qo'shilishi yoqilgan bo'lsin.") }}</li>
            <li>{{ $t("Tarozi yorlig'i (2X + PLU + vazn) avtomatik tushunadi: mahsulot artikuliga PLU kodini yozing.") }}</li>
            <li>{{ $t("Bir nechta dona: qidiruvga «5*» yozib, keyin skanerlang.") }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>`,
};
