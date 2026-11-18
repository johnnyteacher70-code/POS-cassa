// Infratuzilma testi: filial bazalarining ajratilishi va so'rov konteksti.
// Ishga tushirish: DATA_DIR=<vaqtinchalik papka> node test/infra_test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { DATA_DIR } = require(ROOT + '/server/config');
const main = require(ROOT + '/server/main_db');
const branchDb = require(ROOT + '/server/branch_db');
const { runInBranch, currentBranchId } = require(ROOT + '/server/context');
const db = require(ROOT + '/server/db');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function throws(fn, name, re) {
  try { fn(); ok(false, name, 'xato chiqmadi'); } catch (e) { ok(!re || re.test(e.message), name, e.message); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = '2026-01-01 10:00:00';

(async () => {
  // --- main.db ---
  const mainTables = main.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  ok(['owners', 'branches', 'logins', 'sessions'].every((x) => mainTables.includes(x)), 'I1 main.db jadvallari', mainTables);
  ok(!mainTables.includes('clients') && !mainTables.includes('sales'), 'I2 main.db da filial ma\'lumotlari yo\'q');

  const ins = main.prepare('INSERT INTO branches (slug,name,created_at,updated_at) VALUES (?,?,?,?)');
  const A = Number(ins.run('a', 'A filial', t, t).lastInsertRowid);
  const B = Number(ins.run('b', 'B filial', t, t).lastInsertRowid);
  branchDb.openBranch(A, { create: true });
  branchDb.openBranch(B, { create: true });
  ok(fs.existsSync(path.join(DATA_DIR, 'branches', String(A), 'app.db')) && fs.existsSync(path.join(DATA_DIR, 'branches', String(B), 'uploads')), 'I3 har bir filialga alohida papka va baza');
  ok(branchDb.dbFile(A) !== branchDb.dbFile(B), 'I4 fayllar har xil');

  // --- Kontekstsiz murojaat bloklanadi ---
  ok(currentBranchId() === null, 'I5 kontekstdan tashqarida filial yo\'q');
  throws(() => db.prepare('SELECT 1').get(), 'I6 kontekstsiz db → xato', /Filial konteksti yo'q/);
  throws(() => runInBranch('1', () => 0), 'I7 satr ko\'rinishidagi filial ID rad etiladi');
  throws(() => runInBranch(0, () => 0), 'I8 0-filial rad etiladi');
  throws(() => branchDb.openBranch(999), 'I9 mavjud bo\'lmagan filial bazasi yaratilmaydi', /topilmadi/);
  ok(!fs.existsSync(path.join(DATA_DIR, 'branches', '999')), 'I10 999 papkasi paydo bo\'lmadi');
  throws(() => branchDb.branchDir('../x'), 'I11 yo\'l bilan o\'yin rad etiladi');

  // --- Ma'lumot ajratilishi ---
  runInBranch(A, () => {
    db.prepare("INSERT INTO clients (contact_name,phone,created_at,updated_at) VALUES ('Ali A','+998901111111',?,?)").run(t, t);
    db.prepare("INSERT INTO settings (key,value) VALUES ('company_name','A MChJ')").run();
  });
  ok(runInBranch(A, () => db.prepare('SELECT COUNT(*) n FROM clients').get().n) === 1, 'I12 A da 1 mijoz');
  ok(runInBranch(B, () => db.prepare('SELECT COUNT(*) n FROM clients').get().n) === 0, 'I13 B da mijoz yo\'q');
  ok(runInBranch(B, () => db.prepare("SELECT value FROM settings WHERE key='company_name'").get()) === undefined, 'I14 sozlamalar ham alohida');
  ok(runInBranch(A, () => db.prepare('SELECT COUNT(*) n FROM registers').get().n) === 3
    && runInBranch(B, () => db.prepare('SELECT COUNT(*) n FROM registers').get().n) === 3, 'I15 har bir filialda o\'z kassalari');

  // --- Tranzaksiya kontekstda ishlaydi va qaytariladi ---
  try {
    runInBranch(B, () => db.transaction(() => {
      db.prepare("INSERT INTO clients (contact_name,created_at,updated_at) VALUES ('X',?,?)").run(t, t);
      throw new Error('bekor');
    })());
  } catch { /* kutilgan */ }
  ok(runInBranch(B, () => db.prepare('SELECT COUNT(*) n FROM clients').get().n) === 0, 'I16 tranzaksiya qaytarildi');

  // --- Asinxron: await dan keyin ham kontekst saqlanadi, parallel so'rovlar aralashmaydi ---
  const work = (id, name) => runInBranch(id, async () => {
    for (let i = 0; i < 20; i++) {
      await sleep(Math.random() * 3);
      db.prepare('INSERT INTO clients (contact_name,created_at,updated_at) VALUES (?,?,?)').run(name, t, t);
      await Promise.resolve();
      if (currentBranchId() !== id) throw new Error('kontekst almashdi');
    }
  });
  await Promise.all([work(A, 'pA'), work(B, 'pB'), work(A, 'pA'), work(B, 'pB')]);
  const cA = runInBranch(A, () => db.prepare("SELECT contact_name n, COUNT(*) c FROM clients WHERE contact_name LIKE 'p%' GROUP BY 1").all());
  const cB = runInBranch(B, () => db.prepare("SELECT contact_name n, COUNT(*) c FROM clients WHERE contact_name LIKE 'p%' GROUP BY 1").all());
  ok(cA.length === 1 && cA[0].n === 'pA' && cA[0].c === 40, 'I17 parallel: A da faqat A yozuvlari', cA);
  ok(cB.length === 1 && cB[0].n === 'pB' && cB[0].c === 40, 'I18 parallel: B da faqat B yozuvlari', cB);

  // --- Ichma-ich kontekst: ichkisi tashqisini vaqtincha almashtiradi, keyin qaytadi ---
  runInBranch(A, () => {
    runInBranch(B, () => ok(currentBranchId() === B, 'I19 ichki kontekst B'));
    ok(currentBranchId() === A, 'I20 tashqi kontekst qaytdi');
  });

  // --- Yopish va qayta ochish: ma'lumot diskda ---
  branchDb.closeAll();
  ok(runInBranch(A, () => db.prepare("SELECT COUNT(*) n FROM clients WHERE contact_name='Ali A'").get().n) === 1, 'I21 qayta ochilganda ma\'lumot joyida');
  branchDb.closeAll();

  console.log(`\nINFRA: ${pass} o'tdi, ${fail} xato`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
