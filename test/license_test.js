// Litsenziya: sinov rejimi, kalit tekshiruvi (imzo), filial chegarasi, muddat. Serversiz — vaqtinchalik DATA_DIR da.
// DATA_DIR=<tmp> node test/license_test.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
delete process.env.TRIAL_BRANCHES;
const lic = require('../server/license');
const business = require('../server/business');

let pass = 0, fail = 0;
const fails = [];
const ok = (c, n, e) => { if (c) pass++; else { fail++; fails.push(n + (e !== undefined ? ' → ' + JSON.stringify(e) : '')); } };

let s = lic.status();
ok(s.mode === 'trial' && s.branches === 3 && !s.expired && s.days_left === 14, 'L1 yangi o\'rnatish — 14 kunlik sinov, 3 filial', s);
ok(lic.canAddBranch(2).ok && !lic.canAddBranch(3).ok, 'L2 sinovda 3 tadan ortiq filial yo\'q');
business.set('installed_at', '2020-01-01');
s = lic.status();
ok(s.mode === 'trial' && s.expired && !lic.canAddBranch(0).ok, 'L3 sinov muddati tugagan — yangi filial yo\'q', s);
ok(lic.install('abc.def') === null && lic.install('') === null, 'L4 noto\'g\'ri kalit qabul qilinmaydi');

const KEY_FILE = path.join(os.homedir(), '.dokon-license', 'private.pem');
if (fs.existsSync(KEY_FILE)) {
  const issue = (...a) => execFileSync('node', [path.join(__dirname, '../scripts/license.js'), 'issue', ...a]).toString().trim();
  const good = issue('--business', 'Sinov MChJ', '--branches', '5', '--expires', '2099-12-31');
  ok(lic.verify(good) && lic.verify(good).business === 'Sinov MChJ', 'L5 kalit imzosi to\'g\'ri');
  const parts = good.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, business: 'Sinov MChJ', branches: 999, expires: '' })).toString('base64url') + '.' + parts[1];
  ok(lic.verify(forged) === null, 'L6 soxtalashtirilgan kalit (filial soni o\'zgartirilgan) — rad');
  s = lic.install(good);
  ok(s && s.mode === 'licensed' && s.branches === 5 && !s.expired, 'L7 litsenziya o\'rnatildi', s);
  ok(lic.canAddBranch(4).ok && !lic.canAddBranch(5).ok, 'L8 litsenziya chegarasi: 5 filial');
  lic.install(issue('--business', 'Eski', '--branches', '9', '--expires', '2021-01-01'));
  s = lic.status();
  ok(s.expired && !lic.canAddBranch(1).ok, 'L9 muddati o\'tgan litsenziya — yangi filial yo\'q', s);
} else {
  console.log('  (yopiq kalit yo\'q — L5–L9 o\'tkazib yuborildi)');
}

console.log(`LITSENZIYA: ${pass} o'tdi, ${fail} xato`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fail ? 1 : 0);
