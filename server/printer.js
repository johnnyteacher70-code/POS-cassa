// Chek printeriga ESC/POS baytlarini yuborish (server kompyuteridan — brauzer oynasi chiqmaydi).
//   network — tarmoq printeri (Wi-Fi / LAN), odatda 9100-port: deyarli barcha termo-printerlarda bor
//   system  — kompyuterga o'rnatilgan printer: Linux/Mac — CUPS (`lp -o raw`), Windows — umumiy (shared) printer nomi
//   device  — USB qurilma fayli (Linux: /dev/usb/lp0), to'g'ridan-to'g'ri yoziladi
//   browser — server chop etmaydi, brauzerning chop etish oynasi (hamma printerda ishlaydi)
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const MODES = ['browser', 'network', 'system', 'device'];

function readConfig(raw) {
  let c = {};
  try { c = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch { c = {}; }
  return {
    mode: MODES.includes(c.mode) ? c.mode : 'browser',
    host: String(c.host || '').trim().slice(0, 100), port: Number(c.port) || 9100,
    name: String(c.name || '').trim().slice(0, 100), device: String(c.device || '').trim().slice(0, 200),
    width: Number(c.width) === 58 ? 58 : 80, codepage: ['cp866', 'cp1251', 'ascii'].includes(c.codepage) ? c.codepage : 'cp866',
    cut: c.cut !== false && c.cut !== 0, drawer: !!c.drawer && c.drawer !== '0', qr: !!c.qr && c.qr !== '0',
    auto: c.auto !== false && c.auto !== 0,
  };
}

function sendNetwork(buf, host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Printer IP manzili kiritilmagan'));
    const s = net.createConnection({ host, port });
    const fail = (e) => { s.destroy(); reject(new Error(`Printerga ulanib bo'lmadi (${host}:${port}): ${e.code || e.message}`)); };
    s.setTimeout(timeout, () => fail(new Error('javob yo\'q (timeout)')));
    s.on('error', fail);
    s.on('connect', () => s.end(buf, () => resolve()));
  });
}

function sendDevice(buf, device) {
  if (!device) throw new Error('Qurilma fayli kiritilmagan (masalan /dev/usb/lp0)');
  // Faqat printer qurilmalari yoki COM/LPT portlari (boshqa fayllarga yozishga yo'l qo'yilmaydi)
  if (!/^(\/dev\/(usb\/lp\d+|lp\d+|ttyUSB\d+|ttyACM\d+|rfcomm\d+)|COM\d+|LPT\d+)$/i.test(device)) throw new Error("Qurilma nomi noto'g'ri: /dev/usb/lp0, /dev/ttyUSB0, COM3, LPT1 ...");
  const target = /^(COM|LPT)\d+$/i.test(device) ? '\\\\.\\' + device.toUpperCase() : device;
  fs.writeFileSync(target, buf);
}

function sendSystem(buf, name) {
  if (!name) return Promise.reject(new Error('Printer nomini tanlang'));
  if (!/^[\w .\-()]+$/.test(name)) return Promise.reject(new Error("Printer nomida ruxsat etilmagan belgi bor"));
  if (process.platform === 'win32') {
    // Windows: printer "umumiy" (Sharing) qilingan bo'lishi kerak; xom baytlar \\localhost\<nom> ga ko'chiriladi
    const tmp = path.join(os.tmpdir(), `chek-${Date.now()}.bin`);
    fs.writeFileSync(tmp, buf);
    return new Promise((resolve, reject) => {
      execFile('cmd', ['/c', 'copy', '/b', tmp, `\\\\localhost\\${name}`], { windowsHide: true }, (e) => {
        fs.rmSync(tmp, { force: true });
        if (e) reject(new Error(`Windows printeriga yuborib bo'lmadi. Printerning "Printer properties" (Свойства принтера) -> "Sharing" (Доступ) bo'limidan "Share this printer" ni yoqing, umumiy nom: ${name}`)); else resolve();
      });
    });
  }
  return new Promise((resolve, reject) => {
    const p = spawn('lp', ['-d', name, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error('lp topilmadi (CUPS o\'rnatilmagan): ' + e.message)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Printer xatosi: ${err.trim() || code}`))));
    p.stdin.end(buf);
  });
}

async function send(buf, cfg) {
  if (cfg.mode === 'network') return sendNetwork(buf, cfg.host, cfg.port);
  if (cfg.mode === 'device') return sendDevice(buf, cfg.device);
  if (cfg.mode === 'system') return sendSystem(buf, cfg.name);
  throw new Error("Bu kassada printer brauzer orqali chop etadi");
}

// Kompyuterga o'rnatilgan printerlar ro'yxati (tanlash uchun)
function listSystemPrinters() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'], { windowsHide: true, timeout: 8000 }, (e, out) => {
        resolve(e ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      });
    } else {
      execFile('lpstat', ['-e'], { timeout: 5000 }, (e, out) => resolve(e ? [] : String(out).split('\n').map((s) => s.trim()).filter(Boolean)));
    }
  });
}
// Linux: ulangan USB printer qurilmalari
function listDevices() {
  if (process.platform === 'win32') return ['COM1', 'COM2', 'COM3', 'COM4', 'LPT1'];
  const out = [];
  for (const d of ['/dev/usb']) { try { for (const f of fs.readdirSync(d)) if (/^lp\d+$/.test(f)) out.push(path.join(d, f)); } catch { /* yo'q */ } }
  try { for (const f of fs.readdirSync('/dev')) if (/^(ttyUSB|ttyACM)\d+$/.test(f)) out.push('/dev/' + f); } catch { /* jim */ }
  return out;
}

module.exports = { readConfig, send, listSystemPrinters, listDevices, MODES };
