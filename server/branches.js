// Filiallarni boshqarish (faqat egasi): yaratish, tahrirlash, bloklash, admin parolini tiklash.
const fs = require('fs');
const bcrypt = require('bcryptjs');
const main = require('./main_db');
const branchDb = require('./branch_db');
const { runInBranch } = require('./context');
const db = require('./db');
const accounts = require('./accounts');
const { now, str, httpError, audit } = require('./util');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const PREFIX_RE = /^[A-Z0-9]{0,6}$/;

const getBranch = (id) => main.prepare('SELECT * FROM branches WHERE id=?').get(id) || null;
const getBySlug = (slug) => main.prepare('SELECT * FROM branches WHERE slug=?').get(String(slug || '').toLowerCase()) || null;
const allBranches = () => main.prepare('SELECT * FROM branches ORDER BY id').all();

function mustGet(id) {
  const b = getBranch(id);
  if (!b) throw httpError(404, 'Filial topilmadi');
  return b;
}

// Kartochka uchun: filial + xodimlar soni (egasining yozuvi hisobga olinmaydi)
function listBranches() {
  return allBranches().map((b) => {
    const staff = runInBranch(b.id, () => db.prepare('SELECT COUNT(*) n FROM users WHERE is_owner=0 AND active=1').get().n);
    return { ...b, staff_count: staff };
  });
}

function readFields(body) {
  const f = {
    name: str(body.name, 100), address: str(body.address, 300), phone: str(body.phone, 50),
    doc_prefix: str(body.doc_prefix, 6).toUpperCase(),
  };
  if (!f.name) throw httpError(400, 'Filial nomini kiriting');
  if (!PREFIX_RE.test(f.doc_prefix)) throw httpError(400, 'Hujjat prefiksi: faqat lotin harflari va raqamlar (6 tagacha)');
  return f;
}

// Filial admini paroli: kamida 6 belgi (sotuvchilarniki — 4)
function checkPassword(p) {
  if (String(p || '').length < 6) throw httpError(400, 'Admin paroli kamida 6 belgi');
}

function createBranch(body, ownerReq) {
  const f = readFields(body);
  const slug = str(body.slug, 30).toLowerCase();
  if (!SLUG_RE.test(slug)) throw httpError(400, "Qisqa kod: lotin harflari, raqamlar va '-' (2–30 belgi)");
  if (getBySlug(slug)) throw httpError(400, 'Bu qisqa kod band');
  const a = body.admin || {};
  const username = accounts.normLogin(a.username);
  if (!accounts.LOGIN_RE.test(username)) throw httpError(400, 'Admin logini kamida 3 belgi (a-z, 0-9, _ .)');
  if (accounts.loginTaken(username)) throw httpError(400, 'Bu login band');
  checkPassword(a.password);

  const t = now();
  const id = Number(main.prepare('INSERT INTO branches (slug,name,address,phone,doc_prefix,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(slug, f.name, f.address, f.phone, f.doc_prefix, 'active', t, t).lastInsertRowid);
  try {
    branchDb.openBranch(id, { create: true });
    const userId = runInBranch(id, () => {
      const set = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      set.run('company_name', f.name);
      set.run('shop_title', f.name);
      if (f.address) set.run('company_address', f.address);
      if (f.phone) set.run('company_phone', f.phone);
      for (const [k, v] of Object.entries(require('./business').branchDefaults())) set.run(k, v);   // soha, maydonlar, savdo turi
      const uid = Number(db.prepare("INSERT INTO users (username,password_hash,full_name,role,role_id,created_at) VALUES (?,?,?,'admin',(SELECT id FROM roles WHERE is_system=1 ORDER BY id LIMIT 1),?)")
        .run(username, bcrypt.hashSync(String(a.password), 10), str(a.full_name, 100) || username, t).lastInsertRowid);
      audit(ownerReq, { action: 'create', entity: 'settings', summary: `Filial yaratildi: ${f.name}` });
      return uid;
    });
    accounts.addLogin(username, id, userId);
  } catch (e) {
    // Yarim yaratilgan filial qolmasin
    main.prepare('DELETE FROM branches WHERE id=?').run(id);
    branchDb.closeBranch(id);
    fs.rmSync(branchDb.branchDir(id), { recursive: true, force: true });
    throw e;
  }
  return getBranch(id);
}

function updateBranch(id, body) {
  mustGet(id);
  const f = readFields(body);
  main.prepare('UPDATE branches SET name=?, address=?, phone=?, doc_prefix=?, updated_at=? WHERE id=?')
    .run(f.name, f.address, f.phone, f.doc_prefix, now(), id);
  return getBranch(id);
}

function setStatus(id, status) {
  mustGet(id);
  if (!['active', 'blocked'].includes(status)) throw httpError(400, "Noto'g'ri holat");
  main.prepare('UPDATE branches SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
  if (status === 'blocked') accounts.deleteBranchStaffSessions(id);   // xodimlar darhol chiqarib yuboriladi
  return getBranch(id);
}

// Filial adminlari (parolini tiklash uchun tanlash)
function branchAdmins(id) {
  mustGet(id);
  return runInBranch(id, () => db.prepare("SELECT id, username, full_name, active FROM users WHERE role='admin' AND is_owner=0 ORDER BY id").all());
}

function resetAdminPassword(id, userId, password, ownerReq) {
  mustGet(id);
  checkPassword(password);
  const u = runInBranch(id, () => {
    const row = db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND is_owner=0").get(userId);
    if (!row) throw httpError(404, 'Admin topilmadi');
    db.prepare('UPDATE users SET password_hash=?, active=1 WHERE id=?').run(bcrypt.hashSync(String(password), 10), row.id);
    audit(ownerReq, { action: 'update', entity: 'user', entity_id: row.id, summary: `Admin paroli tiklandi (egasi): ${row.username}` });
    return row;
  });
  accounts.deleteStaffSessions(id, u.id);
  return { ok: true };
}

// O'chirish: faqat bloklangan filial va nomi qo'lda yozib tasdiqlansa. Oldin zaxira nusxa olinadi
// (DATA_DIR/backups/<sana>_ochirish_<kod>/), keyin filial papkasi, loginlari va sessiyalari o'chiriladi.
async function deleteBranch(id, confirmName) {
  const b = mustGet(id);
  if (b.status !== 'blocked') throw httpError(400, "Avval filialni bloklang, keyin o'chiring");
  if (String(confirmName || '').trim() !== b.name) throw httpError(400, "Tasdiqlash uchun filial nomini aynan yozing");
  const path = require('path');
  const { backupBranch, BACKUP_DIR, stampNow } = require('./backup');
  const snap = path.join(BACKUP_DIR, `${stampNow()}_ochirish_${b.slug}`);
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(path.join(snap, 'filial.json'), JSON.stringify(b, null, 2));
  await backupBranch(id, snap);
  // Egasining shu filial ichidagi sessiyalari yopilmaydi — filiallar sahifasiga qaytadi
  main.prepare("UPDATE sessions SET branch_id=NULL WHERE kind='owner' AND branch_id=?").run(id);
  main.prepare('DELETE FROM branches WHERE id=?').run(id);   // xodimlar loginlari va sessiyalari ham (ON DELETE CASCADE)
  branchDb.closeBranch(id);
  fs.rmSync(branchDb.branchDir(id), { recursive: true, force: true });
  return { ok: true, backup: snap };
}

// Egasi filialga kirganda uning shu filialdagi yozuvi (amallar "Egasi: ..." nomi bilan yoziladi).
// Bu yozuv loginlar indeksida yo'q — u orqali tizimga kirib bo'lmaydi.
function ownerUser(branchId, owner) {
  return runInBranch(branchId, () => {
    const username = `__owner_${owner.id}`;
    const name = `Egasi: ${owner.full_name || owner.username}`;
    let u = db.prepare('SELECT * FROM users WHERE username=? AND is_owner=1').get(username);
    if (!u) {
      db.prepare("INSERT INTO users (username,password_hash,full_name,role,role_id,active,is_owner,created_at) VALUES (?,'!',?,'admin',(SELECT id FROM roles WHERE is_system=1 ORDER BY id LIMIT 1),1,1,?)").run(username, name, now());
      u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    } else if (u.full_name !== name) {
      db.prepare('UPDATE users SET full_name=? WHERE id=?').run(name, u.id);
      u.full_name = name;
    }
    return u;
  });
}

module.exports = { SLUG_RE, getBranch, getBySlug, allBranches, listBranches, createBranch, updateBranch, setStatus, deleteBranch, branchAdmins, resetAdminPassword, ownerUser };
