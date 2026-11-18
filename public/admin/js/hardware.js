// Kassa uskunalari (brauzer tomoni):
//   Skaner — USB/Bluetooth skanerlar klaviatura kabi yozadi: juda tez kelgan belgilar + Enter = shtrix-kod.
//            Kursor qayerda bo'lishidan qat'i nazar ushlanadi (tasodifan boshqa maydonga yozilgani o'chiriladi).
//            COM/serial skanerlar — Web Serial (Chrome/Edge), telefon/planshet — kamera.
//   Printer — kassa sozlamasiga qarab: server ESC/POS yuboradi (oynasiz) yoki brauzer orqali chop etiladi.
//   Ovoz — skaner muvaffaqiyatli / topilmadi.
import { reactive } from 'vue';
import { get, post } from './lib.js';

const LS = 'hw_scanner_v1';
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
export const hw = reactive({
  minLen: 4, maxGap: 45, sound: true, ...load(),   // maxGap — belgilar orasidagi eng katta vaqt (ms): skaner ~5-20 ms, odam ~100+ ms
  serial: false, serialName: '', lastScan: '', scans: 0,
});
export function saveHw() { try { localStorage.setItem(LS, JSON.stringify({ minLen: hw.minLen, maxGap: hw.maxGap, sound: hw.sound })); } catch { /* jim */ } }

// ---------- Ovoz ----------
let ac = null;
export function beep(ok = true) {
  if (!hw.sound) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = ok ? 1800 : 300;
    g.gain.value = 0.06;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + (ok ? 0.08 : 0.25));
  } catch { /* ovozsiz */ }
}

// ---------- Klaviatura-skaner (global) ----------
const listeners = new Set();
let buf = '', times = [], startEl = null, startVal = null;
function emit(code, source) {
  hw.lastScan = code; hw.scans++;
  for (const fn of listeners) fn(code, source);
}
function onKey(e) {
  if (!listeners.size) return;
  const now = performance.now();
  if (e.key === 'Enter') {
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const fast = buf.length >= hw.minLen && gaps.length && Math.max(...gaps) <= hw.maxGap;
    if (fast) {
      e.preventDefault(); e.stopPropagation();
      // Skaner kodni tasodifan boshqa maydonga yozib qo'ygan bo'lsa — qaytaramiz
      if (startEl && startVal !== null && 'value' in startEl && startEl.value.endsWith(buf)) {
        startEl.value = startVal; startEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      emit(buf, 'keyboard');
    }
    buf = ''; times = []; startEl = null; startVal = null;
    return;
  }
  if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
  if (times.length && now - times[times.length - 1] > hw.maxGap * 3) { buf = ''; times = []; }
  if (!buf) { startEl = document.activeElement; startVal = startEl && 'value' in startEl ? startEl.value : null; }
  buf += e.key; times.push(now);
}
document.addEventListener('keydown', onKey, true);
// fn(code, source) — skaner o'qiganda; qaytaradi — obunani bekor qilish
export function onScan(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- Serial (COM) skaner — Web Serial API ----------
export const serialSupported = () => 'serial' in navigator;
async function readPort(port) {
  await port.open({ baudRate: 9600 }).catch((e) => { if (!/already open/i.test(e.message)) throw e; });
  hw.serial = true;
  const info = port.getInfo ? port.getInfo() : {};
  hw.serialName = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)}` : 'COM';
  const dec = new TextDecoder();
  let line = '';
  try {
    while (port.readable) {
      const reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          line += dec.decode(value);
          let i;
          while ((i = line.search(/[\r\n]/)) >= 0) { const code = line.slice(0, i).trim(); line = line.slice(i + 1); if (code) emit(code, 'serial'); }
        }
      } finally { reader.releaseLock(); }
    }
  } catch { /* uzildi */ }
  hw.serial = false;
}
export async function connectSerial() {
  const port = await navigator.serial.requestPort();
  readPort(port);
}
// Avval ruxsat berilgan port — sahifa ochilganda o'zi ulanadi
export async function autoSerial() {
  if (!serialSupported() || hw.serial) return;
  const ports = await navigator.serial.getPorts().catch(() => []);
  if (ports[0]) readPort(ports[0]).catch(() => {});
}

// ---------- Kamera skaner (telefon / planshet / noutbuk kamerasi) ----------
let zxingLoading = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/zxing.js'; s.onload = () => res(window.ZXing); s.onerror = rej; document.head.appendChild(s); });
  return zxingLoading;
}
// video elementga kamerani ulab, kod topilsa onCode(code); qaytaradi — to'xtatish funksiyasi
export async function startCamera(video, onCode) {
  if ('BarcodeDetector' in window) {
    const det = new window.BarcodeDetector();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream; await video.play();
    let stop = false, last = '';
    const tick = async () => {
      if (stop) return;
      try { const r = await det.detect(video); if (r[0] && r[0].rawValue !== last) { last = r[0].rawValue; onCode(last); setTimeout(() => { last = ''; }, 1500); } } catch { /* keyingi kadr */ }
      requestAnimationFrame(tick);
    };
    tick();
    return () => { stop = true; stream.getTracks().forEach((t) => t.stop()); };
  }
  const Z = await loadZxing();
  const reader = new Z.BrowserMultiFormatReader();
  let last = '';
  await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => {
    if (res && res.getText() !== last) { last = res.getText(); onCode(last); setTimeout(() => { last = ''; }, 1500); }
  });
  return () => reader.reset();
}

// Rasm yoki fayldan (telefon kamerasida olingan surat) shtrix-kodni o'qish (OCR / Barcode decoding)
export async function decodeBarcodeFromImage(file) {
  if (!file) return null;
  // 1. Native BarcodeDetector (Chrome/Android)
  if ('BarcodeDetector' in window) {
    try {
      const det = new window.BarcodeDetector();
      const bmp = await createImageBitmap(file);
      const codes = await det.detect(bmp);
      if (codes && codes.length > 0 && codes[0].rawValue) {
        return codes[0].rawValue;
      }
    } catch {}
  }
  // 2. ZXing orqali o'qish
  try {
    const Z = await loadZxing();
    const reader = new Z.BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, fail) => {
        img.onload = ok;
        img.onerror = fail;
        img.src = url;
      });
      const result = await reader.decodeFromImageElement(img);
      return result ? result.getText() : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

// ---------- Chek printeri ----------
const cfgCache = new Map();
export async function printerCfg(registerId, force = false) {
  if (!registerId) return { mode: 'browser' };
  if (!force && cfgCache.has(+registerId)) return cfgCache.get(+registerId);
  const c = await get('/api/hardware/printer/' + registerId, { silent: true }).catch(() => ({ mode: 'browser' }));
  cfgCache.set(+registerId, c);
  return c;
}
export const resetPrinterCache = () => cfgCache.clear();
// Serverdagi printerga chek; brauzer rejimida false qaytaradi (chaqiruvchi brauzer orqali chop etadi)
export async function printReceiptHw(saleId, registerId, extra = {}) {
  const c = await printerCfg(registerId);
  if (c.mode === 'browser') return false;
  await post('/api/hardware/receipt', { sale_id: saleId, register_id: registerId, ...extra });
  return true;
}
export async function openDrawer(registerId) { await post('/api/hardware/drawer/' + registerId); }
