// Ruxsatlar katalogi va tayyor rollar.
// Har bir filialda rollar qo'lda yaratiladi: rol = nom + ruxsatlar ro'yxati. Xodimga bitta rol biriktiriladi.
// '*' — barcha ruxsatlar (faqat tizim roli "Administrator"da; uni o'zgartirib yoki o'chirib bo'lmaydi).

const GROUPS = [
  { key: 'pos', label: 'Kassa (POS)', perms: [
    ['pos.use', 'Kassada sotish (POS sahifasi)'],
    ['sales.discount', 'Chegirma berish'],
    ['sales.price', "Narxni o'zgartirish (katalog narxidan boshqa narxda sotish)"],
    ['sales.credit', 'Qarzga sotish (to\'liq to\'lanmagan sotuv)'],
  ] },
  { key: 'sales', label: 'Sotuvlar', perms: [
    ['sales.view', "Barcha sotuvlarni ko'rish (yo'q bo'lsa — faqat o'zinikini)"],
    ['sales.create', 'Sotuv hujjati yaratish (forma, KP va buyurtmadan)'],
    ['sales.edit', 'Sotuvni tahrirlash'],
    ['sales.cancel', 'Sotuvni bekor qilish / qayta tiklash'],
    ['sales.delete', "Sotuvni o'chirish / savatdan qaytarish"],
    ['sales.return', 'Qaytarish (vozvrat): mijoz tovarni qaytaradi'],
  ] },
  { key: 'payments', label: "To'lovlar", perms: [
    ['payments.view', "To'lovlar ro'yxatini ko'rish"],
    ['payments.create', "To'lov qabul qilish va pul qaytarish"],
    ['payments.edit', "To'lovni tahrirlash"],
    ['payments.delete', "To'lovni o'chirish / qaytarish"],
  ] },
  { key: 'clients', label: 'Mijozlar', perms: [
    ['clients.view', "Mijozlar ro'yxati va kartasini ko'rish"],
    ['clients.create', "Mijoz qo'shish"],
    ['clients.edit', 'Mijozni tahrirlash (boshlang\'ich qarz ham)'],
    ['clients.delete', "Mijozni o'chirish / qaytarish"],
    ['clients.shop_password', 'Mijozga katalog parolini o\'rnatish'],
    ['debts.view', "Qarzdorlik ro'yxatini ko'rish"],
  ] },
  { key: 'products', label: 'Mahsulotlar va ombor', perms: [
    ['products.edit', "Mahsulot qo'shish va tahrirlash"],
    ['products.delete', "Mahsulotni o'chirish / qaytarish"],
    ['products.stock', 'Ombor: kirim va hisobdan chiqarish'],
    ['products.import', 'Exceldan import'],
    ['products.export', 'Excelga eksport'],
    ['products.cost', "Tannarx va foydani ko'rish, kirim narxini kiritish"],
    ['prices.manage', 'Narx turlarini boshqarish (chakana, ulgurji, VIP ...)'],
    ['promotions.manage', 'Aksiyalar (chegirma qoidalari)'],
    ['transfers.send', "Boshqa filialga tovar jo'natish"],
    ['transfers.receive', 'Boshqa filialdan kelgan tovarni qabul qilish'],
  ] },
  { key: 'suppliers', label: 'Yetkazib beruvchilar va xarid', perms: [
    ['suppliers.view', "Yetkazib beruvchilar va xaridlarni ko'rish"],
    ['suppliers.edit', "Yetkazib beruvchi qo'shish va tahrirlash"],
    ['purchases.create', 'Xarid (kirim hujjati) yaratish'],
    ['purchases.delete', 'Xaridni bekor qilish'],
    ['suppliers.pay', "Yetkazib beruvchiga to'lov"],
  ] },
  { key: 'money', label: 'Xarajatlar, smena, inventarizatsiya', perms: [
    ['expenses.view', "Xarajatlarni ko'rish"],
    ['expenses.create', 'Xarajat kiritish'],
    ['expenses.delete', "Xarajatni o'chirish, kategoriyalarni boshqarish"],
    ['shifts.use', 'Kassa smenasini ochish va yopish'],
    ['shifts.view', "Barcha smenalar va Z-hisobotlarni ko'rish"],
    ['inventory.manage', 'Inventarizatsiya (reviziya) o\'tkazish'],
    ['payroll.manage', 'Xodimlar oyligi va ish vaqti'],
  ] },
  { key: 'quotes', label: 'Tijorat takliflari (KP)', perms: [
    ['quotes.view', "KP larni ko'rish"],
    ['quotes.edit', 'KP yaratish va tahrirlash'],
    ['quotes.delete', "KP ni o'chirish / qaytarish"],
  ] },
  { key: 'orders', label: 'Katalog buyurtmalari', perms: [
    ['orders.view', "Buyurtmalarni ko'rish"],
    ['orders.process', 'Buyurtmani tasdiqlash / rad etish'],
    ['orders.delete', "Buyurtmani qayta ochish, o'chirish, qaytarish"],
    ['reviews.manage', 'Sharhlarni boshqarish'],
  ] },
  { key: 'reports', label: 'Hisobotlar va kassalar', perms: [
    ['dashboard.view', "Bosh sahifa (umumiy ko'rsatkichlar)"],
    ['reports.view', 'Hisobotlar: foyda va zarar, eng ko\'p sotilganlar, ombor qiymati'],
    ['registers.view', 'Kassalar hisoboti'],
    ['registers.manage', "Kassalarni qo'shish va tahrirlash"],
    ['staff.report_all', "Barcha xodimlar hisobotini ko'rish (yo'q bo'lsa — faqat o'zinikini)"],
  ] },
  { key: 'partners', label: "Qo'shnilar va tovar qarzi", perms: [
    ['partners.view', "Qo'shnilar oldi-berdisini ko'rish"],
    ['partners.manage', "Qo'shniga tovar berish / olish va qarzni yopish"],
  ] },
  { key: 'system', label: 'Tizim', perms: [
    ['users.manage', 'Xodimlarni boshqarish'],
    ['roles.manage', 'Rollar va ruxsatlarni boshqarish'],
    ['settings.edit', "Sozlamalarni o'zgartirish"],
    ['audit.view', "Harakatlar tarixini ko'rish"],
    ['trash.view', "Savatni ko'rish"],
  ] },
];

const ALL = GROUPS.flatMap((g) => g.perms.map(([k]) => k));
const ALL_SET = new Set(ALL);

// Tayyor rollar (yangi filialda avtomatik yaratiladi; keyin xohlagancha o'zgartiriladi yoki o'chiriladi)
const SELLER = ['shifts.use', 'pos.use', 'sales.discount', 'sales.price', 'sales.credit', 'sales.view', 'sales.create', 'payments.view', 'payments.create',
  'clients.view', 'clients.create', 'clients.edit', 'debts.view', 'quotes.view', 'quotes.edit', 'orders.view', 'orders.process',
  'registers.view', 'dashboard.view', 'partners.view', 'partners.manage'];
const PRESETS = [
  { name: 'Sotuvchi', perms: SELLER },
  { name: 'Kassir', perms: ['pos.use', 'payments.create', 'clients.create', 'shifts.use'] },
  { name: 'Omborchi', perms: ['products.edit', 'products.stock', 'products.import', 'products.export', 'products.cost', 'orders.view',
    'suppliers.view', 'suppliers.edit', 'purchases.create', 'inventory.manage', 'transfers.send', 'transfers.receive'] },
  { name: 'Buxgalter', perms: ['sales.view', 'payments.view', 'payments.create', 'payments.edit', 'clients.view', 'debts.view',
    'registers.view', 'dashboard.view', 'staff.report_all', 'products.export', 'products.cost', 'audit.view', 'suppliers.view', 'suppliers.pay', 'expenses.view', 'expenses.create', 'shifts.view', 'reports.view'] },
  { name: 'Menejer', perms: ALL.filter((p) => !['users.manage', 'roles.manage', 'settings.edit', 'trash.view'].includes(p)) },
];

// Kiritilgan ro'yxatni tozalash: faqat katalogdagi kalitlar ('*' bu yerda qabul qilinmaydi)
function clean(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((p) => ALL_SET.has(p)))].sort();
}

function parse(json) {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// a ro'yxatidagi har bir ruxsat actor da bormi (huquqni oshirib berishga qarshi)
function subset(perms, actor) {
  if (actor.has('*')) return true;
  return perms.every((p) => p !== '*' && actor.has(p));
}

module.exports = { GROUPS, ALL, PRESETS, clean, parse, subset };
