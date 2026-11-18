// Kassa uskunalari: chek printeri sozlamasi (har bir kassaga), chek / test chop etish, pul yashigini ochish.
const express = require('express');
const db = require('../db');
const { str, int, httpError, audit } = require('../util');
const { need } = require('./auth');
const printer = require('../printer');
const escpos = require('../escpos');

const router = express.Router();

const settingsMap = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
function registerCfg(id) {
  const r = id ? db.prepare('SELECT * FROM registers WHERE id=?').get(int(id)) : null;
  if (!r) throw httpError(400, 'Kassa tanlanmagan');
  return { reg: r, cfg: printer.readConfig(r.printer) };
}

// Kassaning printer sozlamasi (kassadagi har kim o'qiydi — chek qanday chiqishini bilish uchun)
router.get('/printer/:registerId', (req, res) => {
  const { reg, cfg } = registerCfg(req.params.registerId);
  res.json({ register: { id: reg.id, name: reg.name }, ...cfg });
});

router.put('/printer/:registerId', need('registers.manage'), (req, res) => {
  const { reg } = registerCfg(req.params.registerId);
  const cfg = printer.readConfig(req.body);
  db.prepare('UPDATE registers SET printer=? WHERE id=?').run(JSON.stringify(cfg), reg.id);
  audit(req, { action: 'update', entity: 'register', entity_id: reg.id, summary: `${reg.name}: chek printeri — ${cfg.mode}${cfg.mode === 'network' ? ' ' + cfg.host + ':' + cfg.port : cfg.mode === 'system' ? ' ' + cfg.name : cfg.mode === 'device' ? ' ' + cfg.device : ''}` });
  res.json(cfg);
});

// Tanlash uchun: tizim printerlari va USB qurilmalari
router.get('/devices', need('registers.manage'), async (_req, res) => {
  res.json({ printers: await printer.listSystemPrinters(), devices: printer.listDevices(), platform: process.platform });
});

router.post('/test/:registerId', need('registers.manage', 'pos.use'), async (req, res) => {
  const { cfg } = registerCfg(req.params.registerId);
  const buf = escpos.testReceipt(settingsMap(), { width: cfg.width, codepage: cfg.codepage, cut: cfg.cut, drawer: !!req.body.drawer });
  await printer.send(buf, cfg).catch((e) => { throw httpError(424, e.message); });
  res.json({ ok: true, bytes: buf.length });
});

// Sotuv chekini printerga: cash_given — mijoz bergan naqd (qaytim chekda chiqadi), drawer — pul yashigi ochilsinmi
router.post('/receipt', need('pos.use', 'sales.view', 'sales.create'), async (req, res) => {
  const { cfg } = registerCfg(req.body.register_id);
  const id = int(req.body.sale_id);
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id);
  if (!sale) throw httpError(404, 'Sotuv topilmadi');
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(id);
  sale.payments = db.prepare('SELECT * FROM payments WHERE sale_id=? AND deleted_at IS NULL ORDER BY id').all(id);
  sale.client = db.prepare('SELECT * FROM clients WHERE id=?').get(sale.client_id);
  sale.creator = sale.created_by ? db.prepare('SELECT id, full_name, username, phone FROM users WHERE id=?').get(sale.created_by) : null;
  const bal = db.prepare('SELECT balance FROM clients WHERE id=?').get(sale.client_id);
  sale.summary = { balance_after: bal ? bal.balance : 0 };
  const cash = Math.max(0, int(req.body.cash_given));
  const paidCash = sale.payments.filter((p) => p.method === 'cash' && p.direction === 'in').reduce((a, p) => a + p.amount, 0);
  const buf = escpos.saleReceipt(sale, settingsMap(), {
    width: cfg.width, codepage: cfg.codepage, cut: cfg.cut, qr: cfg.qr,
    drawer: cfg.drawer && (paidCash > 0 || !!req.body.drawer),
    cash_given: cash, change: cash > paidCash ? cash - paidCash : 0,
  });
  await printer.send(buf, cfg).catch((e) => { throw httpError(424, e.message); });
  res.json({ ok: true });
});

router.post('/drawer/:registerId', need('pos.use'), async (req, res) => {
  const { reg, cfg } = registerCfg(req.params.registerId);
  await printer.send(new escpos.Receipt().drawer().build(), cfg).catch((e) => { throw httpError(424, e.message); });
  audit(req, { action: 'drawer', entity: 'register', entity_id: reg.id, summary: `${reg.name}: pul yashigi ochildi` });
  res.json({ ok: true });
});

module.exports = { router };
