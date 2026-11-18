#!/usr/bin/env node
// Taqdimot uchun tayyor savdo tarmog'i: bitta tizimda 3 ta filial, har biri o'z yo'nalishida, to'liq demo ma'lumotlar bilan.
//   1) Optom oziq-ovqat (ulgurji: kompaniyalarga qop / karobka bilan, nasiya, avans)
//   2) Kiyim do'koni (chakana: o'lcham, rang, poyabzal, aksessuarlar)
//   3) Qurilish mollari (aralash: ustalar va kompaniyalar + chakana)
// Ishlatish (server TO'XTATILGAN holda): npm run demo:tarmoq
// Mavjud filiallar avval to'liq zaxiraga olinadi (DATA_DIR/backups/<sana>_demo_oldidan) va o'chiriladi.
// Egasi akkaunti saqlanadi; u hali yo'q bo'lsa — owner / owner123 yaratiladi.
require('dotenv').config({ quiet: true });
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
const path = require('path');
const { execFileSync } = require('child_process');

const BRANCHES = [
  { industry: 'grocery', name: 'Optom Oziq-ovqat', slug: 'optom', address: "Toshkent, Yunusobod, Bodomzor yo'li 12", phone: '+998 90 111 22 33', admin: 'optom_admin' },
  { industry: 'clothing', name: 'Moda Kiyim', slug: 'kiyim', address: 'Toshkent, Chilonzor, Bunyodkor 7', phone: '+998 90 444 55 66', admin: 'kiyim_admin' },
  { industry: 'building', name: 'Usta Qurilish Mollari', slug: 'qurilish', address: "Toshkent, Sergeli, Yangi Sergeli ko'chasi 3", phone: '+998 90 777 88 99', admin: 'qurilish_admin' },
];
const PASSWORD = 'demo123';

(async () => {
  const main = require('../server/main_db');
  const branches = require('../server/branches');
  const business = require('../server/business');
  const { runBackup } = require('../server/backup');

  let owner = main.prepare('SELECT * FROM owners ORDER BY id LIMIT 1').get();
  if (!owner) {
    const bcrypt = require('bcryptjs');
    main.prepare('INSERT INTO owners (username,password_hash,full_name,created_at) VALUES (?,?,?,?)')
      .run('owner', bcrypt.hashSync('owner123', 10), 'Egasi', require('../server/util').now());
    owner = main.prepare('SELECT * FROM owners ORDER BY id LIMIT 1').get();
    console.log('Egasi akkaunti yaratildi: owner / owner123');
  }
  const req = { actorName: `Egasi: ${owner.full_name || owner.username}` };

  const old = branches.allBranches();
  if (old.length) {
    const snap = await runBackup('demo_oldidan');
    console.log(`Avvalgi holat zaxirada: ${snap}`);
    for (const b of old) {
      branches.setStatus(b.id, 'blocked');
      await branches.deleteBranch(b.id, b.name);
      console.log(`  o'chirildi: ${b.name}`);
    }
  }

  business.set('sale_mode', 'mixed');
  if (!business.get('brand_name')) business.set('brand_name', "Savdo Tarmog'i");

  const made = [];
  for (const d of BRANCHES) {
    const b = branches.createBranch({ name: d.name, slug: d.slug, address: d.address, phone: d.phone,
      admin: { full_name: `${d.name} admini`, username: d.admin, password: PASSWORD } }, req);
    require('../server/branch_db').closeBranch(b.id);
    console.log(`\n▶ ${d.name} (filial ${b.id}, ${d.industry})`);
    execFileSync(process.execPath, [path.join(__dirname, '..', 'server', 'demo.js'), String(b.id), d.industry], { env: process.env, stdio: 'inherit' });
    made.push({ ...d, id: b.id });
  }

  console.log('\n================ TAYYOR ================');
  console.log(`Egasi (hamma filiallar bir ekranda): ${owner.username} — o'z parolingiz`);
  for (const m of made) {
    const sfx = m.id === 1 ? '' : String(m.id);
    console.log(`${m.name}: admin ${m.admin} / ${PASSWORD}; sotuvchi ali${sfx}, kassir vali${sfx}, menejer dilnoza${sfx} — parol 1234`);
  }
  process.exit(0);
})().catch((e) => { console.error('Xato:', e.message); process.exit(1); });
