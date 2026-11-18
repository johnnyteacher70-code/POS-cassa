// So'rov konteksti: hozirgi so'rov qaysi filialga tegishli.
// Middleware filialni faqat serverdagi sessiyadan (yoki katalog slug'idan) aniqlab, shu yerga yozadi;
// db.js shu qiymat bo'yicha to'g'ri filial bazasini tanlaydi.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function runInBranch(branchId, fn) {
  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error(`Noto'g'ri filial: ${branchId}`);
  return als.run({ branchId }, fn);
}

function currentBranchId() {
  const s = als.getStore();
  return s ? s.branchId : null;
}

// Stream hodisalari orqali next() chaqiradigan middleware'lar (multer) kontekstni yo'qotadi —
// bu o'ram keyingi ishlovni yana shu filial kontekstida davom ettiradi.
function keepContext(mw) {
  return (req, res, next) => {
    const store = als.getStore();
    mw(req, res, (err) => (store ? als.run(store, () => next(err)) : next(err)));
  };
}

// Faqat buyruq qatori skriptlari uchun (demo va h.k.): butun jarayon shu filial kontekstida ishlaydi
function enterBranch(branchId) {
  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error(`Noto'g'ri filial: ${branchId}`);
  als.enterWith({ branchId });
}

module.exports = { runInBranch, currentBranchId, keepContext, enterBranch };
