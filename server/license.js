// Litsenziya: sotuvchi (dastur egasi) yopiq kalit bilan imzolagan matn; bu yerda ochiq kalit bilan tekshiriladi — internet kerak emas.
// Kalit ko'rinishi: <base64url(JSON)>.<base64url(imzo)>
//   JSON: { v: 1, id, business, branches, expires: 'YYYY-MM-DD' | '', issued }
// Litsenziyasiz — sinov rejimi: 14 kun, 3 tagacha filial. Muddat tugasa yoki chegaraga yetsa — faqat YANGI filial
// ochish to'xtaydi; mavjud filiallarda savdo hech qachon to'xtamaydi (do'kon ishi buzilmasligi uchun).
// Kalit chiqarish: node scripts/license.js issue ... (yopiq kalit ~/.dokon-license/private.pem da, loyihada emas).
const crypto = require('crypto');
const business = require('./business');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAH341SG/Xq7yCslm5PiBiW1MOVhYnHDS3RlMVRMStohE=
-----END PUBLIC KEY-----`;
const TRIAL_DAYS = 14;
const TRIAL_BRANCHES = Number(process.env.TRIAL_BRANCHES) || 3;   // TRIAL_BRANCHES — faqat testlar uchun

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const today = () => new Date().toLocaleString('sv-SE').slice(0, 10);

// Kalitni tekshirish: to'g'ri bo'lsa — ma'lumotlari, aks holda null
function verify(key) {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(key || '').trim());
  if (!m) return null;
  try {
    const ok = crypto.verify(null, Buffer.from(m[1]), crypto.createPublicKey(PUBLIC_KEY), b64(m[2]));
    if (!ok) return null;
    const data = JSON.parse(b64(m[1]).toString('utf8'));
    return data && data.v === 1 ? data : null;
  } catch { return null; }
}

// O'rnatilgan sana (sinov muddati shundan hisoblanadi) — birinchi chaqiruvda yoziladi
function installedAt() {
  let d = business.get('installed_at');
  if (!d) { d = today(); business.set('installed_at', d); }
  return d;
}

function status() {
  const lic = verify(business.get('license_key'));
  if (lic) {
    const expired = !!lic.expires && lic.expires < today();
    return { mode: 'licensed', business: lic.business, branches: lic.branches, expires: lic.expires || '', expired, id: lic.id };
  }
  const start = installedAt();
  const end = new Date(new Date(start + 'T00:00:00').getTime() + TRIAL_DAYS * 864e5).toLocaleString('sv-SE').slice(0, 10);
  return { mode: 'trial', branches: TRIAL_BRANCHES, expires: end, expired: end < today(), days_left: Math.max(0, Math.round((new Date(end) - new Date(today())) / 864e5)) };
}

// Yangi filial ochish mumkinmi (mavjud filiallar soni bilan)
function canAddBranch(count) {
  const s = status();
  if (s.expired) return { ok: false, reason: s.mode === 'trial' ? "Sinov muddati tugagan — litsenziya kaliti kiriting" : 'Litsenziya muddati tugagan — yangilang' };
  if (s.branches && count >= s.branches) return { ok: false, reason: `Litsenziya ${s.branches} ta filialga mo'ljallangan — kengaytirish uchun yangi kalit oling` };
  return { ok: true };
}

function install(key) {
  const lic = verify(key);
  if (!lic) return null;
  business.set('license_key', String(key).trim());
  return status();
}

module.exports = { verify, status, canAddBranch, install, TRIAL_DAYS, TRIAL_BRANCHES };
