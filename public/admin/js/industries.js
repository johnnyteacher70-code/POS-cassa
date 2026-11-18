// Soha shablonlari: tanlangan sohaga qarab mahsulot formasida qaysi maydonlar ko'rinadi va qanday kategoriyalar taklif qilinadi.
// Sozlamalarda soha almashtirilsa yoki maydonlar qo'lda yoqilsa/o'chirilsa — mavjud ma'lumotlar o'zgarmaydi.

// Ixtiyoriy mahsulot maydonlari (nomi, narxi, birligi, shtrix-kodi — har doim bor)
export const OPTIONAL_FIELDS = {
  brand: 'Brend',
  volume: 'Hajmi / og\'irligi (yozuv)',
  size: "O'lcham",
  audience: 'Kimlar uchun (erkak / ayol / bolalar)',
  colors: 'Ranglar',
  mxik: 'MXIK (IKPU) soliq kodi',
};

export const INDUSTRIES = {
  general: { label: 'Umumiy savdo', icon: '🏪', fields: ['brand'], unit: 'dona', categories: [] },
  grocery: {
    label: 'Oziq-ovqat va ichimliklar', icon: '🛒', fields: ['brand', 'volume'], unit: 'dona',
    categories: ['Ichimliklar', 'Sut mahsulotlari', 'Non va qandolat', "Go'sht va kolbasa", 'Bakaleya', 'Konservalar', 'Shirinliklar', 'Choy va kofe', 'Muzlatilgan mahsulotlar', 'Meva va sabzavot'],
  },
  cosmetics: {
    label: 'Kosmetika va parfyumeriya', icon: '💄', fields: ['brand', 'volume', 'size', 'audience', 'colors'], unit: 'dona',
    categories: ['Atir', 'Yuz parvarishi', 'Tana parvarishi', 'Soch parvarishi', 'Makiyaj', 'Tirnoq', 'Gigiyena', 'Erkaklar uchun', "Sovg'a to'plamlari"],
  },
  household: {
    label: "Xo'jalik mollari va maishiy kimyo", icon: '🧽', fields: ['brand', 'volume'], unit: 'dona',
    categories: ['Kir yuvish vositalari', 'Tozalash vositalari', 'Gigiyena', 'Idish-tovoq', "Qog'oz mahsulotlari", 'Uy jihozlari'],
  },
  building: {
    label: 'Qurilish mollari', icon: '🧱', fields: ['brand', 'size'], unit: 'dona',
    categories: ['Sement va quruq aralashmalar', "Bo'yoqlar", 'Santexnika', 'Elektr mollari', 'Asboblar', 'Mahkamlagichlar', 'Plitka va kafel', 'Yog\'och va metall'],
  },
  clothing: {
    label: 'Kiyim va poyabzal', icon: '👕', fields: ['brand', 'size', 'audience', 'colors'], unit: 'dona',
    categories: ['Erkaklar kiyimi', 'Ayollar kiyimi', 'Bolalar kiyimi', 'Poyabzal', 'Aksessuarlar', 'Ichki kiyim'],
  },
  pharmacy: {
    label: 'Dorixona', icon: '💊', fields: ['brand', 'volume'], unit: 'dona',
    categories: ['Dori vositalari', 'Vitaminlar', 'Tibbiy buyumlar', 'Gigiyena', 'Bolalar uchun', 'Kosmetika'],
  },
  stationery: {
    label: 'Kanselyariya va kitoblar', icon: '✏️', fields: ['brand', 'colors'], unit: 'dona',
    categories: ['Daftar va bloknot', 'Ruchka va qalam', "Qog'oz", 'Ofis jihozlari', 'Kitoblar', "O'yinchoqlar"],
  },
  auto: {
    label: 'Avtoehtiyot qismlar', icon: '🚗', fields: ['brand'], unit: 'dona',
    categories: ['Moylar', 'Filtrlar', 'Tormoz tizimi', 'Elektrika', 'Akkumulyatorlar', 'Shinalar', 'Kuzov qismlari'],
  },
  electronics: {
    label: 'Elektronika va telefonlar', icon: '📱', fields: ['brand', 'colors'], unit: 'dona',
    categories: ['Telefonlar', 'Aksessuarlar', 'Maishiy texnika', 'Kompyuter jihozlari', 'Audio', 'Zaryadlovchilar'],
  },
};

export const industryOf = (key) => INDUSTRIES[key] || INDUSTRIES.general;
