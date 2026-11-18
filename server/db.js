// Joriy so'rov filialining bazasi.
// Barcha route'lar `require('./db')` dan foydalanadi — bu proksi har bir chaqiruvda so'rov kontekstidagi
// filial bazasiga yo'naltiradi. Filial konteksti bo'lmasa — xato (hech qachon "standart" filialga tushmaydi).
const { currentBranchId } = require('./context');
const { openBranch } = require('./branch_db');

function current() {
  const id = currentBranchId();
  if (!id) throw new Error("Filial konteksti yo'q: bazaga filialsiz murojaat qilindi");
  return openBranch(id);
}

module.exports = new Proxy({}, {
  get(_t, prop) {
    const db = current();
    const v = db[prop];
    return typeof v === 'function' ? v.bind(db) : v;
  },
  set() { throw new Error("db proksisini o'zgartirib bo'lmaydi"); },
});
