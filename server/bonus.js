// Bonus (loyallik): har bir xariddan to'langan summaning N foizi mijoz hisobiga bonus bo'lib yig'iladi,
// keyingi xaridlarda to'lov sifatida ishlatiladi (payments.method='bonus' — pul emas, kassa hisobotlariga kirmaydi).
// Bonus harakatlari: bonus_moves (+ yig'ildi, − ishlatildi / qaytarildi); clients.bonus — kesh.
const db = require('./db');
const { now, getSetting } = require('./util');

function config() {
  return {
    on: getSetting('bonus_enabled', '') === '1',
    pct: Math.max(0, Math.min(50, Number(getSetting('bonus_percent', '0')) || 0)),
    maxPay: Math.max(0, Math.min(100, Number(getSetting('bonus_max_pay', '50')) || 0)),
  };
}
const walkinId = () => Number((db.prepare("SELECT value FROM settings WHERE key='walkin_client_id'").get() || {}).value || 0);
// "Chakana xaridor" (umumiy mijozsiz sotuv) — bonus yig'maydi
const eligible = (clientId) => clientId && clientId !== walkinId();

function recalc(clientId) {
  const v = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM bonus_moves WHERE client_id=? AND deleted_at IS NULL').get(clientId).v;
  db.prepare('UPDATE clients SET bonus=? WHERE id=?').run(v, clientId);
  return v;
}
function move(clientId, saleId, amount, note, returnId = null) {
  if (!amount) return;
  db.prepare('INSERT INTO bonus_moves (client_id,sale_id,amount,note,return_id,created_at) VALUES (?,?,?,?,?,?)').run(clientId, saleId, amount, note, returnId, now());
}

// Sotuvda bonus bilan to'lash mumkin bo'lgan eng katta summa
function maxSpend(client, total) {
  const c = config();
  if (!c.on || !eligible(client.id)) return 0;
  return Math.max(0, Math.min(Math.floor(client.bonus || 0), Math.floor(total * c.maxPay / 100)));
}

// Sotuvdan keyin: ishlatilgan bonus (−) va yig'ilgan bonus (+, bonusdan boshqa to'lovlar bo'yicha)
function afterSale(client, saleId, total, pays) {
  const c = config();
  if (!eligible(client.id)) return { used: 0, earned: 0 };
  const used = pays.filter((p) => p.method === 'bonus').reduce((a, p) => a + p.amount, 0);
  const paidMoney = pays.filter((p) => p.method !== 'bonus').reduce((a, p) => a + p.amount, 0);
  const earned = c.on && c.pct ? Math.floor(Math.min(paidMoney, Math.max(0, total - used)) * c.pct / 100) : 0;
  if (used) move(client.id, saleId, -used, 'Xaridda ishlatildi');
  if (earned) move(client.id, saleId, earned, `Xariddan ${c.pct}%`);
  if (used || earned) recalc(client.id);
  return { used, earned };
}

// Sotuv bekor qilinsa / o'chirilsa: yig'ilgan bonus olinadi, ishlatilgan bonus (to'lovi bilan birga) mijozga qaytadi
// Hammasi bitta vaqt belgisi bilan o'chiriladi — sotuv tiklanganda aynan shular qaytariladi.
function onSaleVoid(sale) {
  const moves = db.prepare('SELECT * FROM bonus_moves WHERE sale_id=? AND deleted_at IS NULL').all(sale.id);
  if (!moves.length) return;
  const t = now();
  db.prepare('UPDATE bonus_moves SET deleted_at=? WHERE sale_id=? AND deleted_at IS NULL').run(t, sale.id);
  db.prepare("UPDATE payments SET deleted_at=?, updated_at=? WHERE sale_id=? AND method='bonus' AND deleted_at IS NULL").run(t, t, sale.id);
  recalc(sale.client_id);
}

// Bekor qilingan / o'chirilgan sotuv tiklanganda: oxirgi bekor qilishda o'chgan bonus harakatlari va bonus to'lovi qaytadi
// (o'zi bekor qilingan qaytarishlarning bonusi bundan mustasno)
function onSaleRestore(sale) {
  const stamp = db.prepare('SELECT MAX(deleted_at) v FROM bonus_moves WHERE sale_id=? AND deleted_at IS NOT NULL').get(sale.id).v;
  if (!stamp) return;
  db.prepare(`UPDATE bonus_moves SET deleted_at=NULL WHERE sale_id=? AND deleted_at=?
    AND (return_id IS NULL OR return_id IN (SELECT id FROM sale_returns WHERE deleted_at IS NULL))`).run(sale.id, stamp);
  db.prepare("UPDATE payments SET deleted_at=NULL, updated_at=? WHERE sale_id=? AND method='bonus' AND deleted_at=?").run(now(), sale.id, stamp);
  recalc(sale.client_id);
}

// Qaytarishda: shu sotuvdan yig'ilgan bonusning qaytarilgan ulushi olinadi
function onReturn(sale, returnTotal, returnId = null) {
  if (!sale.total) return;
  const earned = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM bonus_moves WHERE sale_id=? AND amount>0 AND deleted_at IS NULL').get(sale.id).v;
  const back = Math.floor(earned * Math.min(1, returnTotal / sale.total));
  if (back > 0) { move(sale.client_id, sale.id, -back, 'Qaytarish: bonus olindi', returnId); recalc(sale.client_id); }
}

// Qaytarish bekor qilinsa: undan olingan bonus mijozga qaytadi
function onReturnVoid(ret) {
  const r = db.prepare('UPDATE bonus_moves SET deleted_at=? WHERE return_id=? AND deleted_at IS NULL').run(now(), ret.id);
  if (r.changes) recalc(ret.client_id);
}

module.exports = { config, maxSpend, afterSale, onSaleVoid, onSaleRestore, onReturn, onReturnVoid, recalc, eligible };
