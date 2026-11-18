// Demo filial profili soha bo'yicha: mijozlar, yetkazib beruvchilar, katalog matni va savdo uslubi.
//   mode: 'wholesale' — asosan kompaniyalarga qadoq bilan, nasiya va avans bilan;
//         'retail'    — asosan chakana xaridorlar, kichik cheklar, naqd / karta;
//         'mixed'     — ikkalasi.
// Profili yo'q soha (va kosmetika) — demo.js dagi standart ro'yxatlar ishlatiladi.
module.exports = {
  grocery: {
    mode: 'wholesale', sales: 110,
    welcome: "Xush kelibsiz! Oziq-ovqat mahsulotlarini optom narxda buyurtma qiling — Toshkent bo'ylab yetkazib beramiz.",
    b2b: [
      ['"Baraka Market" MChJ', 'Alisher Valiyev', 'Toshkent, Yunusobod'], ['"Oila Supermarket" XK', 'Gulnoza Rahimova', 'Samarqand'],
      ['"Mahalla Do\'koni" XK', 'Bekzod Tursunov', "Farg'ona"], ['"Korzinka Franchayz" MChJ', 'Shahzod Karimov', 'Andijon'],
      ['"Nur Savdo" MChJ', 'Malika Ergasheva', 'Toshkent, Chilonzor'], ['"Hamyon Market" XK', 'Jasur Abdullayev', 'Buxoro'],
      ['"Navro\'z Market" MChJ', 'Dilshod Nazarov', 'Namangan'], ['"Do\'stlik Oziq-ovqat" XK', 'Nodira Saidova', 'Qarshi'],
      ['"Mega Planet" MChJ', 'Sardor Aliyev', "Toshkent, Mirzo Ulug'bek"], ['"Kafe Rayhon" MChJ', 'Feruza Xolmatova', 'Toshkent, Sergeli'],
      ['"Choyxona Bahor" XK', 'Otabek Yusupov', 'Termiz'], ['"Maktab oshxonasi №45"', 'Kamola Mirzayeva', 'Toshkent, Olmazor'],
      ['"Toza Mahsulot" MChJ', 'Rustam Hamidov', 'Xiva'], ['"Arzon Narx" XK', 'Zarina Qodirova', 'Jizzax'],
      ['"Afsona Savdo" MChJ', "Ulug'bek Rasulov", 'Guliston'], ['"Restoran Samarqand" MChJ', 'Akmal Sobirov', 'Toshkent, Yakkasaroy'],
    ],
    b2c: ['Dilnoza Karimova', "Aziza Yo'ldosheva", 'Bobur Ismoilov', 'Madina Ahmedova'],
    suppliers: [['Andijon Don Mahsulotlari MChJ', 'Rustam Aliyev', '305112233'], ['Coca-Cola Ichimligi Uzbekistan', 'Olga Kim', '306445566'], ['Lactel Distribyutsiya', 'Akmal Yusupov', '307778899']],
  },
  clothing: {
    mode: 'retail', sales: 220,
    welcome: "Xush kelibsiz! Yangi mavsum kolleksiyasi — erkaklar, ayollar va bolalar kiyimlari, poyabzal va aksessuarlar.",
    b2b: [
      ['"Moda Butik" XK', 'Laylo Usmonova', 'Toshkent, Yakkasaroy'], ['"Korporativ Forma" MChJ', 'Sardor Aliyev', 'Toshkent, Chilonzor'],
      ['"Maktab №112"', 'Kamola Mirzayeva', 'Toshkent, Sergeli'],
    ],
    b2c: ['Dilnoza Karimova', "Aziza Yo'ldosheva", 'Bobur Ismoilov', 'Madina Ahmedova', 'Javohir Ortiqov', 'Nilufar Rashidova', 'Sherzod Qosimov',
      'Sevara Tojiyeva', 'Jahongir Rahimov', 'Mohira Salimova', 'Otabek Nurmatov', 'Shahnoza Ergasheva', 'Diyorbek Aliyev', 'Kamila Yusupova',
      'Asadbek Hamidov', 'Munisa Karimova', 'Sanjar Toshmatov', 'Gulchehra Abdullayeva'],
    suppliers: [['Uztex Tikuv Fabrikasi', 'Rustam Aliyev', '305112233'], ['Istanbul Moda Import LLC', 'Emre Yilmaz', '306445566'], ['Sport Brands Distribution', 'Akmal Yusupov', '307778899']],
  },
  building: {
    mode: 'mixed', sales: 130,
    welcome: "Qurilish va ta'mirlash uchun hamma narsa: sement, bo'yoq, plitka, santexnika, elektr mollari va asboblar.",
    b2b: [
      ['"Mega Qurilish" MChJ', 'Alisher Valiyev', 'Toshkent, Yunusobod'], ['"Usta Ta\'mir" XK', 'Bekzod Tursunov', 'Toshkent, Chilonzor'],
      ['"Yangi Uy Qurilish" MChJ', 'Shahzod Karimov', 'Toshkent viloyati, Zangiota'], ['"Golden House" MChJ', 'Sardor Aliyev', "Toshkent, Mirzo Ulug'bek"],
      ['"Elektromontaj Servis" XK', 'Jasur Abdullayev', 'Toshkent, Sergeli'], ['"Santex Usta" XK', 'Dilshod Nazarov', 'Toshkent, Olmazor'],
      ['"Prime Development" MChJ', 'Otabek Yusupov', 'Toshkent, Yashnobod'], ['"Dizayn Interyer" MChJ', 'Malika Ergasheva', 'Toshkent, Shayxontohur'],
    ],
    b2c: ['Bobur Ismoilov', 'Javohir Ortiqov', 'Sherzod Qosimov', 'Jahongir Rahimov', 'Otabek Nurmatov', 'Diyorbek Aliyev', 'Sanjar Toshmatov', 'Nilufar Rashidova'],
    suppliers: [['Qizilqum Sement Savdo', 'Rustam Aliyev', '305112233'], ['Knauf Uzbekistan', 'Olga Kim', '306445566'], ['Elektro Import Group', 'Akmal Yusupov', '307778899']],
  },
};
