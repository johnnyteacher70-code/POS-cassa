#!/usr/bin/env node
// Litsenziya kaliti chiqarish (faqat dastur sotuvchisi uchun). Yopiq kalit: ~/.dokon-license/private.pem
//   node scripts/license.js issue --business "Mijoz MChJ" --branches 5 [--expires 2027-12-31]
//   node scripts/license.js check <kalit>
// Yopiq kalitni hech kimga bermang va zaxiralab qo'ying: usiz yangi kalit chiqarib bo'lmaydi.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEY_FILE = process.env.DOKON_LICENSE_KEY || path.join(os.homedir(), '.dokon-license', 'private.pem');
const arg = (name, def = '') => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cmd = process.argv[2];
if (cmd === 'issue') {
  if (!fs.existsSync(KEY_FILE)) { console.error('Yopiq kalit topilmadi: ' + KEY_FILE); process.exit(1); }
  const business = arg('business');
  const branches = Number(arg('branches', '1'));
  const expires = arg('expires');
  if (!business || !(branches > 0) || (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires))) {
    console.error('Foydalanish: issue --business "Nomi" --branches N [--expires YYYY-MM-DD]'); process.exit(1);
  }
  const payload = { v: 1, id: crypto.randomBytes(6).toString('hex'), business, branches, expires, issued: new Date().toISOString().slice(0, 10) };
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(fs.readFileSync(KEY_FILE)));
  console.log(body + '.' + b64u(sig));
} else if (cmd === 'check') {
  process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
  const { verify } = require('../server/license');
  const r = verify(process.argv[3]);
  console.log(r ? JSON.stringify(r, null, 2) : "Kalit noto'g'ri");
  process.exit(r ? 0 : 1);
} else {
  console.log('node scripts/license.js issue --business "Nomi" --branches N [--expires YYYY-MM-DD]\nnode scripts/license.js check <kalit>');
}
