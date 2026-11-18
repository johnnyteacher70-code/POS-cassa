// Egasi parolini tiklash yoki yangi egasi akkauntini yaratish (parol unutilganda, server kompyuterida):
//   node server/admin_user.js <login> <parol> ["Ism Familiya"]
// Login bor bo'lsa — paroli yangilanadi va barcha kirishlari yopiladi; yo'q bo'lsa — yangi egasi yaratiladi.
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const main = require('./main_db');
const accounts = require('./accounts');
const { now } = require('./util');

const [username, password, fullName] = process.argv.slice(2);
if (!username || !password) {
  console.log('Ishlatish: node server/admin_user.js <login> <parol> ["Ism Familiya"]');
  process.exit(1);
}
const login = accounts.normLogin(username);
if (!accounts.LOGIN_RE.test(login)) { console.log('Login kamida 3 belgi (a-z, 0-9, _ .)'); process.exit(1); }
if (password.length < 4) { console.log('Parol kamida 4 belgi'); process.exit(1); }

const hash = bcrypt.hashSync(password, 10);
const ex = main.prepare('SELECT id FROM owners WHERE username=?').get(login);
if (ex) {
  main.prepare('UPDATE owners SET password_hash=?, active=1 WHERE id=?').run(hash, ex.id);
  if (fullName) main.prepare('UPDATE owners SET full_name=? WHERE id=?').run(fullName, ex.id);
  accounts.deleteOwnerSessions(ex.id);
} else {
  if (accounts.loginTaken(login)) { console.log('Bu login filial xodimiga tegishli'); process.exit(1); }
  main.prepare('INSERT INTO owners (username,password_hash,full_name,created_at) VALUES (?,?,?,?)').run(login, hash, fullName || login, now());
}
console.log(`${ex ? 'Parol yangilandi' : 'Yaratildi'}: egasi "${login}"`);
