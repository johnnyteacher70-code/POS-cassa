// Kirish ma'lumotlari (main.db): egasi akkaunti, filial xodimlari loginlari indeksi va sessiyalar.
// Filial xodimining o'zi (ismi, roli, paroli) filial bazasidagi `users` jadvalida; bu yerda faqat
// "login → qaysi filial" bog'lanishi saqlanadi. Login butun tizim bo'yicha yagona.
const crypto = require('crypto');
const main = require('./main_db');
const { now } = require('./util');

const SESSION_DAYS = 30;
const LOGIN_RE = /^[a-z0-9_.]{3,50}$/;

function normLogin(v) { return String(v || '').trim().toLowerCase(); }

function loginTaken(username) {
  const u = normLogin(username);
  return !!(main.prepare('SELECT 1 FROM owners WHERE username=?').get(u) || main.prepare('SELECT 1 FROM logins WHERE username=?').get(u));
}

// Kirishda: login egasinikimi yoki qaysi filial xodiminiki
function findLogin(username) {
  const u = normLogin(username);
  const owner = main.prepare('SELECT * FROM owners WHERE username=?').get(u);
  if (owner) return { kind: 'owner', owner };
  const l = main.prepare('SELECT * FROM logins WHERE username=?').get(u);
  if (l) return { kind: 'staff', branch_id: l.branch_id, user_id: l.user_id };
  return null;
}

function addLogin(username, branchId, userId) {
  main.prepare('INSERT INTO logins (username,branch_id,user_id) VALUES (?,?,?)').run(normLogin(username), branchId, userId);
}

// ---- Sessiyalar ----
function expiry() {
  return new Date(Date.now() + SESSION_DAYS * 864e5).toLocaleString('sv-SE').slice(0, 19);
}

function createSession({ kind, owner_id = null, branch_id = null, user_id = null, ip = '', ua = '' }) {
  const token = crypto.randomBytes(32).toString('hex');
  main.prepare('INSERT INTO sessions (token,kind,owner_id,branch_id,user_id,created_at,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(token, kind, owner_id, branch_id, user_id, now(), expiry(), String(ip || '').slice(0, 60), String(ua || '').slice(0, 200));
  return token;
}
// Sessiyaning ochiq identifikatori (tokenning o'zi hech qachon ko'rsatilmaydi)
const sessionId = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);

function getSession(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const s = main.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, now());
  return s || null;
}

const deleteSession = (token) => main.prepare('DELETE FROM sessions WHERE token=?').run(String(token || ''));
// Filial xodimining barcha (yoki joriysidan boshqa) sessiyalari
function deleteStaffSessions(branchId, userId, exceptToken = '') {
  main.prepare("DELETE FROM sessions WHERE kind='staff' AND branch_id=? AND user_id=? AND token != ?").run(branchId, userId, exceptToken);
}
// Filial bloklanganda: xodimlari chiqarib yuboriladi (egasining sessiyasi qoladi)
const deleteBranchStaffSessions = (branchId) => main.prepare("DELETE FROM sessions WHERE kind='staff' AND branch_id=?").run(branchId);
const deleteOwnerSessions = (ownerId, exceptToken = '') => main.prepare("DELETE FROM sessions WHERE kind='owner' AND owner_id=? AND token != ?").run(ownerId, exceptToken);
// Egasi filialga kiradi / filiallar sahifasiga qaytadi
const setSessionBranch = (token, branchId) => main.prepare("UPDATE sessions SET branch_id=? WHERE token=? AND kind='owner'").run(branchId, token);
const cleanupSessions = () => main.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());

module.exports = {
  sessionId,
  SESSION_DAYS, LOGIN_RE, normLogin, loginTaken, findLogin, addLogin,
  createSession, getSession, deleteSession, deleteStaffSessions, deleteBranchStaffSessions, deleteOwnerSessions, setSessionBranch, cleanupSessions,
};
