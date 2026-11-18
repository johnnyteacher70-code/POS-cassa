#!/usr/bin/env node
// Shifrlangan zaxira faylini (.dkz) papkaga ochish — server ishlamasa ham:
//   node scripts/backup-open.js fayl.dkz chiqish-papkasi
// Parol so'raladi (yoki BACKUP_PASSWORD muhit o'zgaruvchisidan olinadi).
const fs = require('fs');
const path = require('path');
const { open } = require('../server/backup_crypt');

const [file, out] = process.argv.slice(2);
if (!file || !out) { console.log('Foydalanish: node scripts/backup-open.js fayl.dkz chiqish-papkasi'); process.exit(1); }
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`Papka bo'sh emas: ${out}`); process.exit(1); }

function ask(q) {
  if (process.env.BACKUP_PASSWORD) return Promise.resolve(process.env.BACKUP_PASSWORD);
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

ask('Parol: ').then((pw) => {
  try {
    const files = open(fs.readFileSync(file), pw, path.resolve(out));
    console.log(`Ochildi: ${files.length} ta fayl → ${path.resolve(out)}`);
    console.log("Tiklash: shu papkani DATA_DIR/backups/ ichiga qo'ying va egasi panelida «Tiklash» ni bosing.");
  } catch (e) { console.error(e.message); process.exit(1); }
});
