// Shifrlangan zaxira fayli (.dkz): fleshka / tashqi diskka yoki yuklab olib boshqa joyda saqlash uchun.
// Fayl: "DKZ1" | salt(16) | iv(12) | tag(16) | AES-256-GCM( gzip( [nomi uzunligi u32][nomi][hajmi u64][fayl] ... ) )
// Kalit = scrypt(parol, salt). main.db da faqat salt va hosil qilingan kalit saqlanadi — parolning o'zi emas.
// Parol yo'qolsa .dkz fayllarni ochib bo'lmaydi (kompyuterdagi oddiy nusxalar bunga bog'liq emas).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MAGIC = Buffer.from('DKZ1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password, salt) => crypto.scryptSync(String(password), salt, 32, SCRYPT);

// Parol o'rnatilganda: { salt, key } (hex) — business jadvalida saqlanadi
function makeKey(password) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), key: derive(password, salt).toString('hex') };
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...listFiles(p, base));
    else if (f.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

// Nusxa papkasi → shifrlangan Buffer
function seal(dir, { salt, key }) {
  const parts = [];
  for (const rel of listFiles(dir)) {
    const data = fs.readFileSync(path.join(dir, rel));
    const name = Buffer.from(rel, 'utf8');
    const head = Buffer.alloc(4 + name.length + 8);
    head.writeUInt32BE(name.length, 0);
    name.copy(head, 4);
    head.writeBigUInt64BE(BigInt(data.length), 4 + name.length);
    parts.push(head, data);
  }
  const plain = zlib.gzipSync(Buffer.concat(parts), { level: 6 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, Buffer.from(salt, 'hex'), iv, c.getAuthTag(), body]);
}

// Shifrlangan Buffer → outDir ga fayllar. Parol noto'g'ri bo'lsa yoki fayl buzilgan bo'lsa — xato.
function open(buf, password, outDir) {
  if (buf.length < 48 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error('Bu shifrlangan zaxira fayli emas (.dkz)');
  const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48);
  let plain;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', derive(password, salt), iv);
    d.setAuthTag(tag);
    plain = zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(48)), d.final()]));
  } catch { throw new Error("Parol noto'g'ri yoki fayl buzilgan"); }
  const files = [];
  for (let o = 0; o < plain.length;) {
    const n = plain.readUInt32BE(o); o += 4;
    const rel = plain.subarray(o, o + n).toString('utf8'); o += n;
    const size = Number(plain.readBigUInt64BE(o)); o += 8;
    // Faqat nusxa ichidagi oddiy yo'llar (../ yoki mutlaq yo'l — rad)
    const safe = path.normalize(rel);
    if (!rel || path.isAbsolute(rel) || safe.startsWith('..')) throw new Error('Faylda noto\'g\'ri yo\'l bor');
    const dest = path.join(outDir, safe);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, plain.subarray(o, o + size)); o += size;
    files.push(rel);
  }
  if (!files.includes('main.db')) throw new Error("Faylda main.db yo'q — bu to'liq zaxira emas");
  return files;
}

module.exports = { makeKey, seal, open, MAGIC };
