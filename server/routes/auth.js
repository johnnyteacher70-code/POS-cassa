// Kirish: bitta login sahifasi. Login egasiniki bo'lsa — filiallar sahifasi, filial xodiminiki bo'lsa —
// to'g'ridan-to'g'ri o'sha filial. Filial faqat serverdagi sessiyadan aniqlanadi (brauzer yuborgan qiymatdan emas).
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const main = require('../main_db');
const accounts = require('../accounts');
const branches = require('../branches');
const { runInBranch } = require('../context');
const { now, str, int, httpError, audit, limiter } = require('../util');
const perms = require('../perms');

const router = express.Router();

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* buzuq cookie — e'tiborsiz */ } }
  }
  return out;
}
const sidOf = (req) => parseCookies(req).sid || '';

// Sessiya bo'yicha: req.owner (egasi), req.branch, req.user (filialdagi foydalanuvchi).
// Filial aniqlansa — qolgan barcha ishlov shu filial kontekstida bajariladi.
function loadUser(req, _res, next) {
  const s = accounts.getSession(sidOf(req));
  if (!s) return next();
  req.session = s;
  if (s.kind === 'owner') {
    const owner = main.prepare('SELECT id, username, full_name, active FROM owners WHERE id=?').get(s.owner_id);
    if (!owner || !owner.active) return next();
    req.owner = owner;
    const b = s.branch_id && branches.getBranch(s.branch_id);
    if (!b) return next();
    req.branch = b;
    const u = branches.ownerUser(b.id, owner);
    return runInBranch(b.id, () => {
      req.user = { id: u.id, username: owner.username, full_name: u.full_name, role: 'admin', is_owner: true,
        role_id: null, role_name: 'Egasi', perms: new Set(['*']) };
      next();
    });
  }
  const b = branches.getBranch(s.branch_id);
  if (!b || b.status !== 'active') return next();
  runInBranch(b.id, () => {
    const u = db.prepare(`SELECT u.id, u.username, u.full_name, u.phone, u.role_id, u.register_id, u.active, r.name role_name, r.perms role_perms
      FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.is_owner=0`).get(s.user_id);
    if (u && u.active) {
      const p = new Set(perms.parse(u.role_perms));
      delete u.role_perms;
      req.branch = b;
      req.user = { ...u, perms: p, role: p.has('*') ? 'admin' : 'seller' };
    }
    next();
  });
}

// Ruxsat bormi ('*' — hammasi)
const can = (req, p) => !!(req.user && req.user.perms && (req.user.perms.has('*') || req.user.perms.has(p)));
const canAny = (req, list) => list.some((p) => can(req, p));
// Middleware: berilgan ruxsatlardan kamida bittasi bo'lishi kerak
const need = (...list) => (req, _res, next) => (canAny(req, list) ? next() : next(httpError(403, "Bu amal uchun ruxsatingiz yo'q")));

function requireAuth(req, _res, next) {
  if (!req.user) {
    if (req.owner) { const e = httpError(403, 'Avval filialni tanlang'); e.code = 'no_branch'; return next(e); }
    return next(httpError(401, 'Tizimga kiring'));
  }
  next();
}

// To'liq huquq (Administrator roli yoki egasi)
function requireAdmin(req, _res, next) {
  if (!can(req, '*')) return next(httpError(403, 'Faqat admin uchun'));
  next();
}

function requireOwner(req, _res, next) {
  if (!req.owner) return next(httpError(req.user ? 403 : 401, req.user ? 'Faqat egasi uchun' : 'Tizimga kiring'));
  next();
}

function setCookie(req, res, token) {
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: accounts.SESSION_DAYS * 864e5, secure: req.secure });
}

// Parol tanlashga qarshi: login+IP bo'yicha 10 ta, IP bo'yicha 30 ta xato / 15 daqiqa.
// Login o'zi bo'yicha (barcha IP lardan) — 100 ta / soat: begona odam bir necha xato bilan egasini bloklab qo'ya olmaydi.
const byUser = limiter(10, 15 * 60e3);
const byIp = limiter(30, 15 * 60e3);
const byLogin = limiter(100, 3600e3);
const BAD = "Login yoki parol noto'g'ri";
const DUMMY_HASH = bcrypt.hashSync('dummy', 10);   // login topilmasa ham vaqt bir xil bo'lsin
router.post('/login', async (req, res) => {
  const username = accounts.normLogin(str(req.body.username, 50));
  const password = String(req.body.password || '');
  const userKey = username + '|' + req.ip;
  if (byUser.blocked(userKey) || byIp.blocked(req.ip) || byLogin.blocked(username)) throw httpError(429, "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring");
  const fail = () => { byUser.hit(userKey); byIp.hit(req.ip); byLogin.hit(username); return httpError(401, BAD); };
  const found = accounts.findLogin(username);
  if (!found) { await bcrypt.compare(password, DUMMY_HASH); throw fail(); }

  if (found.kind === 'owner') {
    const o = found.owner;
    if (!o.active || !(await bcrypt.compare(password, o.password_hash))) throw fail();
    byUser.reset(userKey);
    // Ikki bosqichli kirish yoqilgan bo'lsa — parol to'g'ri, endi ilovadagi kod so'raladi
    const full = main.prepare('SELECT totp_secret FROM owners WHERE id=?').get(o.id);
    if (full && full.totp_secret) {
      const ticket = crypto.randomBytes(24).toString('hex');
      tickets.set(ticket, { owner_id: o.id, exp: Date.now() + 5 * 60e3, tries: 0 });
      return res.json({ need_2fa: true, ticket });
    }
    setCookie(req, res, accounts.createSession({ kind: 'owner', owner_id: o.id, ip: req.ip, ua: req.get('user-agent') }));
    return res.json({ kind: 'owner', username: o.username, full_name: o.full_name });
  }

  const b = branches.getBranch(found.branch_id);
  const u = b && runInBranch(b.id, () => db.prepare('SELECT * FROM users WHERE id=? AND is_owner=0').get(found.user_id));
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) throw fail();
  // Parol to'g'ri, lekin filial yopilgan — buni aytamiz (aks holda xodim parolini xato deb o'ylaydi)
  if (b.status !== 'active') throw httpError(403, 'Filial vaqtincha yopilgan');
  byUser.reset(userKey);
  setCookie(req, res, accounts.createSession({ kind: 'staff', branch_id: b.id, user_id: u.id, ip: req.ip, ua: req.get('user-agent') }));
  res.json({ kind: 'staff', id: u.id, username: u.username, full_name: u.full_name, role: u.role, branch: { id: b.id, name: b.name, slug: b.slug } });
});

// Ikkinchi bosqich: parol to'g'ri kiritilgandan keyin berilgan chipta + ilovadagi 6 xonali kod
const tickets = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of tickets) if (v.exp < t) tickets.delete(k); }, 60e3).unref();
router.post('/2fa', (req, res) => {
  const tk = tickets.get(String(req.body.ticket || ''));
  if (!tk || tk.exp < Date.now()) throw httpError(401, 'Vaqt tugadi — qaytadan kiring');
  const o = main.prepare('SELECT id, username, full_name, totp_secret, active FROM owners WHERE id=?').get(tk.owner_id);
  if (!o || !o.active || !require('../totp').verify(o.totp_secret, req.body.code)) {
    if (++tk.tries >= 5) tickets.delete(String(req.body.ticket));
    throw httpError(401, "Kod noto'g'ri");
  }
  tickets.delete(String(req.body.ticket));
  setCookie(req, res, accounts.createSession({ kind: 'owner', owner_id: o.id, ip: req.ip, ua: req.get('user-agent') }));
  res.json({ kind: 'owner', username: o.username, full_name: o.full_name });
});

router.post('/logout', (req, res) => {
  accounts.deleteSession(sidOf(req));
  res.clearCookie('sid');
  res.json({ ok: true });
});

const publicBranch = (b) => (b ? { id: b.id, name: b.name, slug: b.slug, status: b.status } : null);

router.get('/me', (req, res) => {
  if (!req.owner && !req.user) throw httpError(401, 'Tizimga kiring');
  const out = { owner: !!req.owner, branch: publicBranch(req.branch) };
  if (req.owner) Object.assign(out, { username: req.owner.username, full_name: req.owner.full_name });
  if (req.user) {
    const u = db.prepare('SELECT register_id FROM users WHERE id=?').get(req.user.id);
    Object.assign(out, { id: req.user.id, username: req.user.username, full_name: req.user.full_name, role: req.user.role,
      role_id: req.user.role_id, role_name: req.user.role_name, perms: [...req.user.perms], register_id: u ? u.register_id : null });
  }
  res.json(out);
});

router.post('/password', async (req, res) => {
  const np = String(req.body.new_password || '');
  const old = String(req.body.old_password || '');
  if (req.owner) {
    const o = main.prepare('SELECT * FROM owners WHERE id=?').get(req.owner.id);
    if (!await bcrypt.compare(old, o.password_hash)) throw httpError(400, "Eski parol noto'g'ri");
    if (np.length < 6) throw httpError(400, 'Parol kamida 6 belgi');
    main.prepare('UPDATE owners SET password_hash=? WHERE id=?').run(await bcrypt.hash(np, 10), o.id);
    accounts.deleteOwnerSessions(o.id, sidOf(req));   // boshqa qurilmalardagi kirishlar yopiladi
    return res.json({ ok: true });
  }
  if (!req.user) throw httpError(401, 'Tizimga kiring');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!await bcrypt.compare(old, u.password_hash)) throw httpError(400, "Eski parol noto'g'ri");
  const min = minPassword(req.user.perms);
  if (np.length < min) throw httpError(400, `Parol kamida ${min} belgi`);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(np, 10), u.id);
  accounts.deleteStaffSessions(req.branch.id, u.id, sidOf(req));   // joriysi qoladi
  res.json({ ok: true });
});

// Parol uzunligi: xodim yoki rollarni boshqara oladiganlar (va to'liq huquqlilar) — kamida 6, qolganlar — 4 (kassada tez kirish uchun)
const minPassword = (set) => (set.has('*') || set.has('users.manage') || set.has('roles.manage') ? 6 : 4);

function getRole(id) {
  const r = id ? db.prepare('SELECT * FROM roles WHERE id=?').get(int(id)) : null;
  return r ? { ...r, perms: perms.parse(r.perms) } : null;
}
// Faqat o'zidagi ruxsatlar doirasidagi rolni berish / tahrirlash mumkin (huquqni oshirib berishga qarshi)
function assignable(req, role) {
  if (!role) throw httpError(400, 'Rolni tanlang');
  if (!perms.subset(role.perms, req.user.perms)) throw httpError(403, `"${role.name}" rolida sizda yo'q ruxsatlar bor — bu amalni bajara olmaysiz`);
}
// Rol tanlovi: role_id, yoki eski API uchun role: 'admin' (Administrator) / 'seller' ("Sotuvchi"); yangi xodimga standart — "Sotuvchi"
function roleFromBody(body, fallbackId) {
  if (body.role_id !== undefined && body.role_id !== '' && body.role_id !== null) return getRole(body.role_id);
  if (body.role === 'admin') return getRole(db.prepare('SELECT id FROM roles WHERE is_system=1 ORDER BY id LIMIT 1').get()?.id);
  if (body.role === 'seller' || fallbackId === undefined) return getRole(db.prepare("SELECT id FROM roles WHERE is_system=0 ORDER BY (name='Sotuvchi') DESC, id LIMIT 1").get()?.id);
  return getRole(fallbackId);
}
const legacyRole = (set) => (set.has('*') ? 'admin' : 'seller');   // eski "role" ustuni (filial adminlari ro'yxati uchun)

// --- Filial xodimlari (egasining yozuvi ro'yxatda ko'rinmaydi) ---
router.get('/users', requireAuth, need('users.manage'), (_req, res) => {
  res.json(db.prepare(`SELECT u.id, u.username, u.full_name, u.phone, u.role, u.role_id, r.name role_name, u.active, u.register_id, u.created_at
    FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.is_owner=0 ORDER BY u.id`).all());
});

router.post('/users', requireAuth, need('users.manage'), async (req, res) => {
  const username = accounts.normLogin(str(req.body.username, 50));
  const password = String(req.body.password || '');
  if (!accounts.LOGIN_RE.test(username)) throw httpError(400, 'Login kamida 3 belgi (a-z, 0-9)');
  const role = roleFromBody(req.body);
  assignable(req, role);
  const set = new Set(role.perms);
  if (password.length < minPassword(set)) throw httpError(400, `Parol kamida ${minPassword(set)} belgi`);
  // Login butun tizim bo'yicha yagona (boshqa filialda ham bo'lmasligi kerak)
  if (accounts.loginTaken(username) || db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw httpError(400, 'Bu login band');
  const id = Number(db.prepare('INSERT INTO users (username,password_hash,full_name,phone,role,role_id,register_id,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(username, await bcrypt.hash(password, 10), str(req.body.full_name, 100), str(req.body.phone, 40).trim(), legacyRole(set), role.id, int(req.body.register_id) || null, now()).lastInsertRowid);
  try {
    accounts.addLogin(username, req.branch.id, id);
  } catch {
    db.prepare('DELETE FROM users WHERE id=?').run(id);   // bir vaqtda boshqa filialda shu login band qilingan bo'lsa
    throw httpError(400, 'Bu login band');
  }
  audit(req, { action: 'create', entity: 'user', entity_id: id, summary: `Foydalanuvchi: ${username} (${role.name})` });
  res.json({ id });
});

router.put('/users/:id', requireAuth, need('users.manage'), async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND is_owner=0').get(req.params.id);
  if (!u) throw httpError(404, 'Topilmadi');
  const old = getRole(u.role_id);
  if (old) assignable(req, old);                     // o'zidan yuqori huquqli xodimni tahrirlay olmaydi
  const role = roleFromBody(req.body, u.role_id);
  assignable(req, role);
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  if (u.id === req.user.id && (role.id !== u.role_id || !active)) throw httpError(400, "O'z rolingizni o'zgartira yoki o'zingizni o'chira olmaysiz");
  const set = new Set(role.perms);
  if (req.body.password && String(req.body.password).length < minPassword(set)) throw httpError(400, `Parol kamida ${minPassword(set)} belgi`);
  db.prepare('UPDATE users SET full_name=?, phone=?, role=?, role_id=?, active=?, register_id=? WHERE id=?')
    .run(str(req.body.full_name, 100), str(req.body.phone, 40).trim(), legacyRole(set), role.id, active, int(req.body.register_id) || null, u.id);
  if (req.body.password) {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(String(req.body.password), 10), u.id);
    if (u.id !== req.user.id) accounts.deleteStaffSessions(req.branch.id, u.id);   // parol almashtirilsa — xodim qayta kiradi
  }
  if (!active) accounts.deleteStaffSessions(req.branch.id, u.id);
  const roleNote = old && old.id !== role.id ? `, rol: ${old.name} → ${role.name}` : '';
  audit(req, { action: 'update', entity: 'user', entity_id: u.id, summary: `Foydalanuvchi: ${u.username}${roleNote}${active ? '' : ' (nofaol)'}` });
  res.json({ ok: true });
});

// --- Rollar va ruxsatlar ---
router.get('/perms', requireAuth, need('roles.manage', 'users.manage'), (_req, res) => {
  res.json({
    groups: perms.GROUPS.map((g) => ({ key: g.key, label: g.label, perms: g.perms.map(([key, label]) => ({ key, label })) })),
    presets: perms.PRESETS,
  });
});

router.get('/roles', requireAuth, need('roles.manage', 'users.manage'), (_req, res) => {
  const rows = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id AND u.is_owner=0) users,
      (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id AND u.is_owner=0 AND u.active=1) active_users
    FROM roles r ORDER BY r.is_system DESC, r.name COLLATE NOCASE`).all();
  res.json(rows.map((r) => ({ ...r, perms: perms.parse(r.perms) })));
});

function readRole(req, exceptId = 0) {
  const name = str(req.body.name, 60);
  if (!name) throw httpError(400, 'Rol nomini kiriting');
  if (db.prepare('SELECT 1 FROM roles WHERE lower(name)=lower(?) AND id<>?').get(name, exceptId)) throw httpError(400, 'Bunday nomli rol bor');
  const list = perms.clean(req.body.perms);
  if (!perms.subset(list, req.user.perms)) throw httpError(403, "Sizda yo'q ruxsatni rolga bera olmaysiz");
  return { name, list };
}

// Ruxsatlar farqi (tarix uchun): +qo'shilgan, -olib tashlangan
function permsDiff(a, b) {
  const A = new Set(a), B = new Set(b);
  const add = b.filter((p) => !A.has(p)), del = a.filter((p) => !B.has(p));
  return [...add.map((p) => '+' + p), ...del.map((p) => '-' + p)].join(', ');
}

router.post('/roles', requireAuth, need('roles.manage'), (req, res) => {
  const { name, list } = readRole(req);
  const t = now();
  const id = Number(db.prepare('INSERT INTO roles (name,perms,is_system,created_at,updated_at) VALUES (?,?,0,?,?)')
    .run(name, JSON.stringify(list), t, t).lastInsertRowid);
  audit(req, { action: 'create', entity: 'role', entity_id: id, summary: `Rol: ${name} (${list.length} ta ruxsat)` });
  res.json({ id });
});

function editableRole(req) {
  const r = getRole(req.params.id);
  if (!r) throw httpError(404, 'Topilmadi');
  if (r.is_system) throw httpError(400, "Administrator rolini o'zgartirib bo'lmaydi");
  if (r.id === req.user.role_id) throw httpError(400, "O'z rolingizni o'zgartira olmaysiz — buni boshqa admin qiladi");
  assignable(req, r);
  return r;
}

router.put('/roles/:id', requireAuth, need('roles.manage'), (req, res) => {
  const r = editableRole(req);
  const { name, list } = readRole(req, r.id);
  db.prepare('UPDATE roles SET name=?, perms=?, updated_at=? WHERE id=?').run(name, JSON.stringify(list), now(), r.id);
  // Eski "role" ustuni yangilanadi (rolda '*' bo'lmaydi — demak bu rol xodimlari admin emas)
  db.prepare("UPDATE users SET role='seller' WHERE role_id=?").run(r.id);
  const diff = permsDiff(r.perms, list);
  audit(req, { action: 'update', entity: 'role', entity_id: r.id, summary: `Rol: ${r.name}${name !== r.name ? ' → ' + name : ''}${diff ? ' (' + diff + ')' : ''}` });
  res.json({ ok: true });
});

router.delete('/roles/:id', requireAuth, need('roles.manage'), (req, res) => {
  const r = editableRole(req);
  const n = db.prepare('SELECT COUNT(*) n FROM users WHERE role_id=? AND is_owner=0').get(r.id).n;
  if (n) throw httpError(400, `Bu rolda ${n} ta xodim bor — avval ularni boshqa rolga o'tkazing`);
  db.prepare('DELETE FROM roles WHERE id=?').run(r.id);
  audit(req, { action: 'delete', entity: 'role', entity_id: r.id, summary: `Rol o'chirildi: ${r.name}` });
  res.json({ ok: true });
});

module.exports = { router, loadUser, requireAuth, requireAdmin, requireOwner, sidOf, can, canAny, need };
