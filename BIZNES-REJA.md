# "Do'kon boshqaruv": chakana va ulgurji savdo uchun tayyor mahsulot

**Rivojlantirish rejasi va kamchiliklar tahlili** · 2026-10-10

---

## 1. Maqsad

Biz bu tizimni obuna xizmati (SaaS) sifatida emas, **biznesga o'rnatib beriladigan tayyor mahsulot** sifatida sotamiz:
- tizim mijozning kompyuteri yoki serverida ishlaydi;
- ma'lumot mijozning o'zida qoladi;
- bir martalik litsenziya va ixtiyoriy yillik qo'llab-quvvatlash.

**Maqsadli mijozlar (target):**

| Segment | Misol | Ularga nima muhim |
|---|---|---|
| Ulgurji (optom) do'konlar | Kosmetika, oziq-ovqat, xo'jalik mollari, qurilish, kanselyariya | Mijoz qarzlari, nakladnoy, karobka/dona, narx turlari, yetkazib beruvchilar |
| Chakana do'konlar | Minimarket, butik, dorixona, avtoehtiyot qismlar | Tez kassa, shtrix-kod, chek, smena yopish, foyda |
| Aralash (chakana + ulgurji) | Bozordagi ulgurji va chakana nuqtalar | Bitta mahsulotga ikki narx, bitta omborda ikki xil savdo |
| Tarmoqlar (2–10 filial) | Shahar bo'ylab bir nechta do'kon | Filiallar alohida, egasi hammasini bir joydan ko'radi, filiallar orasida tovar ko'chiriladi |

**Taklifimiz bir gapda:** *"Internetsiz ham ishlaydigan, ma'lumoti o'zingizda qoladigan, filiallarni alohida yuritadigan, qarz va omborni aniq hisoblaydigan savdo tizimi."*

---

## 2. Hozir nimamiz bor (taqdimotdagi kuchli tomonlar)

Bularning hammasi ishlaydi va testlangan: 650 dan ortiq avtomatik tekshiruv, hammasi o'tadi.

1. **Ko'p filial.** Har bir filialning bazasi alohida faylda, ma'lumotlar aralashib ketishi texnik jihatdan mumkin emas. Xodim login qilganda to'g'ri o'z filialiga kiradi, egasi esa hamma filialni boshqaradi.
2. **Kassa (POS).** Tez qidiruv, dona va karobka bilan sotish, bir nechta kassa, xodim kesimidagi hisobot.
3. **Mijoz qarzlari (debitorlik).** To'lovlar sotuvlarga avtomatik taqsimlanadi, avans va qarz muddati bor, muddati o'tgan qarzlar ko'rinadi.
4. **Hujjatlar.** Nakladnoy, tijorat taklifi (KP), hisob-faktura chop etiladi.
5. **Onlayn katalog.** Har filialning o'z sayti bor (`/shop/<filial>`): mijoz o'zi buyurtma beradi, sharh qoldiradi.
6. **Ombor.** Kirim, hisobdan chiqarish va qoldiq avtomatik hisoblanadi.
7. **Excel.** Mahsulotlarni Excel'dan rasmlari bilan import qilish va eksport.
8. **Xavfsizlik va nazorat:**
   - har bir amal tarixda saqlanadi (audit);
   - o'chirilgan narsa savatdan qaytariladi;
   - rollar bor (admin / sotuvchi);
   - parolni taxmin qilishdan himoya bor.
9. **Zaxira nusxa.** Har kuni avtomatik olinadi, fleshka yoki tashqi diskka ham ko'chiriladi.
10. **Tezlik.** 100 mingdan ortiq yozuvda ham asosiy amallar 10–200 ms ichida bajariladi (benchmark bor).
11. **Ikki til.** O'zbekcha va ruscha.

---

## 3. Kamchiliklar tahlili

Darajalar:
- 🔴 Mahsulotni sotish uchun **albatta** kerak: busiz xaridor "bu bizga to'g'ri kelmaydi" deydi.
- 🟡 Raqobatbardosh bo'lish uchun kerak.
- ⚪ Keyinroq qilsa ham bo'ladi.

### 3.1. Tizim faqat kosmetikaga moslab yozilgan 🔴

Hozirgi tizim bitta kosmetika do'koni uchun yozilgan. Boshqa soha do'koni buni darrov sezadi.

| Muammo | Qayerda | Yechim |
|---|---|---|
| Tayyor kategoriyalar: "Atir", "Makiyaj", "Tirnoq"… | `public/admin/js/pages/products.js:11` | Soha shablonlari: birinchi sozlashda soha tanlanadi (kosmetika, oziq-ovqat, qurilish, kiyim, dorixona, umumiy) |
| "Kimlar uchun" maydoni (erkak/ayol/bolalar), ranglar, "Hajmi: 100 ml" | `products.js:10`, `schema.js:277-278` | Maydonlar sozlamada yoqiladi yoki o'chiriladi; "Hajmi" o'rniga umumiy "Xususiyat" |
| Birlik faqat "dona / karobka" | `sale_items.unit` | **O'lchov birliklari:** dona, kg, litr, metr, m², pachka, blok, qop. Har mahsulotga asosiy birlik va qadoq (karobka = N asosiy birlik) |
| Demo ma'lumotlar faqat kosmetika | `server/demo.js`, `demo_cosmetics.js` | Har bir soha uchun demo (taqdimotda xaridorning o'z sohasini ko'rsatish uchun) |
| Izohlar, matnlar, katalog sarlavhasi "kosmetika" ruhida | i18n, `shop/index.html` | Neytral matnlar |

### 3.2. Biznes logikasida yetishmayotgan qismlar

| # | Imkoniyat | Daraja | Nega kerak |
|---|---|---|---|
| B1 | **Tannarx va foyda.** Mahsulotning kelish narxi, sotuvdan sof foyda, marja | 🔴 | Egasi birinchi so'raydigan savol: "qancha foyda qildim?". Hozir tizim faqat tushumni biladi |
| B2 | **Narx turlari.** Chakana, ulgurji, VIP yoki diler narxi; mijozga narx turi biriktiriladi | 🔴 | Aralash do'konning asosiy talabi. Hozir mahsulotda faqat dona va karobka narxi bor |
| B3 | **Yetkazib beruvchilar va xarid.** Kirim hujjati (kimdan, qancha, qanday narxda) va yetkazib beruvchiga qarz | 🔴 | Hozir kirim faqat "+N dona". Ulgurjida yetkazib beruvchi bilan hisob-kitob debitorlik kabi muhim |
| B4 | **Qaytarish (vozvrat).** Sotuvdan qisman qaytarish: tovar omborga qaytadi, pul qaytariladi yoki qarzdan ayriladi | 🔴 | Hozir faqat butun sotuvni bekor qilish mumkin, bu esa hisobotni buzadi |
| B5 | **Shtrix-kod.** Skaner bilan sotish, mahsulotga shtrix-kod va etiketka chop etish | 🔴 | Chakana kassa shtrix-kodsiz sekin ishlaydi |
| B6 | **Termo-chek (58/80 mm).** Kassada qisqa chek | 🔴 | Hozir faqat A4 nakladnoy chiqadi |
| B7 | **Xarajatlar.** Ijara, oylik, transport…, kategoriyalar bilan | 🟡 | Foyda va zarar hisoboti busiz to'liq bo'lmaydi |
| B8 | **Kassa smenasi.** Smena ochish va yopish, kassadagi naqd pulni sanash, farq, Z-hisobot | 🟡 | Kassirlarni nazorat qilish uchun. Kassalar bor, smena yo'q |
| B9 | **Inventarizatsiya (reviziya).** Haqiqiy qoldiqni sanab kiritish, tizim farqni ko'rsatadi va tuzatadi | 🟡 | Har bir do'kon oyda yoki chorakda qiladi |
| B10 | **Kam qolgan tovar.** Minimal qoldiq, "buyurtma qilish kerak" ro'yxati | 🟡 | Oddiy, lekin taqdimotda yaxshi ko'rinadi |
| B11 | **Valyuta.** Narx dollarda, to'lov so'mda, kurs kiritiladi | 🟡 | O'zbekistonda ulgurji savdoning katta qismi dollarda yuradi |
| B12 | **To'lov usullari.** Naqd, plastik (Uzcard/Humo), o'tkazma, Click/Payme; aralash to'lov | 🟡 | Hozir usullar bor, lekin bitta chekni bir nechta usulda to'lash yo'q |
| B13 | **Chegirma va aksiya qoidalari.** Foiz yoki summa, "N dona olsa", mijoz guruhi bo'yicha | ⚪ | |
| B14 | **Muddat va partiya.** Yaroqlilik muddati, partiya raqami | ⚪ | Oziq-ovqat va dorixona uchun 🔴, boshqalar uchun shart emas. Soha shabloni bilan yoqiladi |
| B15 | **Kengroq rollar.** Kassir, omborchi, buxgalter va menejer, har biri o'z huquqlari bilan | 🟡 | Hozir faqat admin va sotuvchi bor. Katta do'kon nozikroq taqsimot so'raydi |

### 3.3. Egasi va tarmoq darajasida

| # | Imkoniyat | Daraja | Izoh |
|---|---|---|---|
| T1 | **Umumiy hisobot.** Barcha filiallar bo'yicha savdo, foyda, qarz va qoldiq bir sahifada, filiallar solishtiriladi | 🔴 | Hozir egasi har filialga alohida kirishi kerak. Tarmoq egasi uchun asosiy ekran shu |
| T2 | **Filiallar orasida tovar ko'chirish.** A filialdan chiqim, B filialga kirim, yo'ldagi tovar | 🔴 | Tarmoq uchun eng ko'p so'raladigan funksiya. Hozir bazalar alohida, shuning uchun bu ataylab loyihalanishi kerak |
| T3 | **Umumiy katalog.** Mahsulotni bir marta yaratib, hamma filialga tarqatish (narx har filialda o'zgacha bo'lishi mumkin) | 🟡 | Hozir har filialda mahsulot qaytadan kiritiladi yoki Excel orqali ko'chiriladi |
| T4 | **Egasi uchun telefon ko'rinishi.** Bugungi savdo, kassa, qarzlar | 🟡 | Mobil brauzerda ixcham boshqaruv paneli |

### 3.4. Sotiladigan mahsulot bo'lishi uchun

Bu bo'lim alohida funksiya emas: kodni **"bir do'kon uchun yozilgan dastur"** holatidan **"istalgan do'konga o'rnatiladigan mahsulot"** holatiga o'tkazadi.

| # | Nima | Daraja | Izoh |
|---|---|---|---|
| M1 | **Birinchi ishga tushirish ustasi (wizard).** Biznes nomi va logotipi, soha, savdo turi (chakana / ulgurji / aralash), valyuta, birinchi filial | 🔴 | Xaridor 10 daqiqada o'zi sozlab olishi kerak |
| M2 | **O'z brendi (white-label).** Mijozning logotipi va nomi menyuda, hujjatlarda, chekda va katalogda; rang tanlash | 🔴 | Hozir "Do'kon boshqaruv" brendi qattiq yozilgan (`public/brand/`) |
| M3 | **Litsenziya.** Kalit fayl: biznes nomi, filiallar soni, muddat. Internetsiz tekshiriladi (imzolangan kalit) | 🔴 | Busiz bitta nusxani hamma ko'chirib oladi. Filiallar soni bo'yicha narxlash ham shunga bog'liq |
| M4 | **O'rnatish paketi.** Windows uchun bitta o'rnatuvchi (`.exe`), Linux uchun skript; avtomatik ishga tushish | 🔴 | Do'konlarning ko'pchiligida Windows bor. Hozir faqat Linux systemd skripti bor |
| M5 | **Yangilash.** Yangi versiya faylini yuklab o'rnatish (GitHub'siz): avval avtomatik zaxira, keyin migratsiya | 🔴 | Yangilanishsiz qo'llab-quvvatlash shartnomasini sotib bo'lmaydi |
| M6 | **Qayta tiklash.** Zaxiradan tiklash interfeysi (hozir faqat zaxira olinadi, tiklash qo'lda) | 🔴 | "Kompyuter buzilsa nima bo'ladi?" degan savolga tayyor javob |
| M7 | **Demo rejim.** Bir tugma bilan soha bo'yicha demo baza, keyin "demoni tozalab ishni boshlash" | 🟡 | Taqdimot va sinov muddati uchun |
| M8 | **Hujjatlar.** Foydalanuvchi qo'llanmasi (rasmlar bilan), video darslar, o'rnatish yo'riqnomasi | 🟡 | Qo'llab-quvvatlashga keladigan savollarni kamaytiradi |
| M9 | **Tarmoqda ishlash.** Bitta kompyuter server bo'ladi, boshqa kompyuter va planshetlar brauzer orqali ulanadi. Server manzilini ko'rsatish, QR-kod | 🟡 | Texnik jihatdan ishlaydi, lekin oddiy foydalanuvchi uchun tushunarsiz |
| M10 | **Internet o'chganda.** Server do'konning ichida bo'lgani uchun kassa ishlayveradi; buni hujjatlarda va taqdimotda alohida aytish | ⚪ | Bu kuchli savdo argumenti, ish talab qilmaydi |

### 3.5. O'zbekiston qonunchiligi va integratsiyalar ⚪ (alohida modul sifatida)

Quyidagilar qonunchilik va tashqi xizmatlarga bog'liq. Talablarni joriy qilishdan oldin rasmiy manbalardan aniq tekshirish kerak. Ularni **qo'shimcha pullik modul** sifatida taklif qilgan ma'qul:

- **Onlayn nazorat-kassa (fiskal chek).** Ba'zi faoliyat turlari uchun majburiy. Fiskal modul yoki provayder bilan integratsiya talab qilinadi.
- **MXIK (IKPU) kodi** mahsulotlar uchun: fiskal chek va elektron hisob-faktura uchun kerak. Mahsulotga maydon qo'shish oson, buni hozir qilib qo'yish mumkin.
- **Elektron hisob-faktura** (Didox, Faktura.uz va hokazo): ulgurji B2B mijozlar uchun.
- **Click / Payme:** katalogdagi buyurtmani onlayn to'lash.
- **SMS:** mijozga qarz eslatmasi.

> Diqqat: bu integratsiyalar tizimni tashqi xizmatlarga ulaydi. Hozirgi "hech qayerga ulanmaydi" tamoyilini saqlash uchun ular **standart bo'yicha o'chiq** turadi va faqat mijoz yoqsa ishlaydi.

### 3.6. Texnik kamchiliklar va optimallashtirish

Asosiy optimallashtirishlar (kesh ustunlar, indekslar, triggerlar) avvalroq qilingan. Mahsulot darajasiga chiqish uchun qolganlari:

| # | Nima | Daraja | Izoh |
|---|---|---|---|
| X1 | `pos.js` (835 qator) va `components.js` (484 qator) juda katta | 🟡 | Yangi funksiyalar (qaytarish, shtrix-kod, smena) qo'shilishidan oldin bo'laklarga ajratish kerak, aks holda o'zgartirish xavfli bo'ladi |
| X2 | Shrift Google Fonts'dan yuklanadi | 🔴 | Internetsiz o'rnatishda shrift chiqmaydi va "hech qayerga ulanmaydi" tamoyili buziladi. Shriftni loyiha ichiga qo'yish kerak |
| X3 | Vue va kutubxonalar | ✅ | Tekshirildi: hammasi lokal. Tashqi manzil faqat shrift (X2) |
| X4 | Pul summalari faqat butun so'mda (INTEGER) | 🟡 | Valyuta (B11) uchun tiyin yoki sent kerak bo'ladi. Ustun turini oldindan loyihalash kerak |
| X5 | "Tezkor mijoz" (bir martalik xaridor) ledgeri har sotuvda to'liq qayta hisoblanadi (~180 ms) | 🟡 | Chakanada kuniga minglab chek bo'ladi. Shu mijoz uchun ledgerni bosqichma-bosqich (inkremental) hisoblash kerak |
| X6 | Audit jurnali cheksiz o'sadi | ⚪ | Eski yozuvlarni arxiv faylga ko'chirish |
| X7 | Sotuvchi interfeysida admin tugmalari ko'rinib qoladi (server baribir rad etadi) | 🟡 | Interfeysni rolga qarab tozalash |
| X8 | Migratsiyalar `addColumn` orqali tartibsiz yig'ilgan | 🟡 | Versiyali migratsiya tizimi (M5 uchun shart): `schema_version` va raqamlangan qadamlar |
| X9 | Sozlamalar ro'yxati qattiq yozilgan (`misc.js:8`) | ⚪ | Soha va savdo turi sozlamalari qo'shilganda kengaytirish |

---

## 4. Bosqichma-bosqich reja

Har bir bosqich oxirida:
- avtomatik testlar yoziladi va hammasi o'tadi;
- demo baza yangilanadi;
- tizim ishga tushiriladi va qo'lda tekshiriladi.

**Holat — 2026-10-11:** ✅ bajarildi va testlangan · 🟡 qisman · ⬜ qilinmadi.

### Bosqich 0. Universal poydevor
- ✅ X2: shrift lokal (`@fontsource-variable/inter`), tizim internetsiz to'liq ishlaydi.
- 🟡 X8: migratsiyalar avvalgidek takrorlanuvchi (`addColumn`); versiya o'zgarsa, migratsiyadan oldin avtomatik zaxira olinadi. Raqamli versiyalash qilinmadi.
- ✅ 3.1: o'lchov birliklari (dona, kg, litr, metr, m² ...), erkin nomli qadoq, kasr miqdor; kosmetikaga xos maydonlar sozlamada.
- ✅ Soha shablonlari: 10 ta soha (kategoriyalar, maydonlar) va har biri uchun demo.
- ✅ M2: o'z brendi (nom, shior, logotip, asosiy rang).
- ✅ X7 va B15: qo'lda yaratiladigan rollar, 59 ta ruxsat, huquqni oshirib berishdan himoya, interfeys ruxsatga qarab.

### Bosqich 1. Savdo yadrosi
- ✅ B1: tannarx (o'rtacha tortilgan), sotuv paytidagi tannarx pozitsiyada saqlanadi.
- ✅ B2: narx turlari, mijozga narx turi; kassada avtomatik.
- ✅ B3: yetkazib beruvchilar, kirim hujjati, yetkazib beruvchi qarzi va to'lovlari, xaridni bekor qilish.
- ✅ B4: qisman va to'liq qaytarish (chegirmaga mutanosib), naqd qaytarish.
- ✅ B5: shtrix-kod (skaner, ichki EAN-13), etiketka chop etish (EAN-13 / Code128).
- ✅ B6: 58/80 mm termo-chek, avtomatik chop etish.
- ✅ X1: `pos.js` bo'laklarga ajratildi (pos/core.js, pos/panels.js, pos/cart.js, pages/pos.js).

### Bosqich 2. Ombor va pul
- ✅ B9: inventarizatsiya (skaner +1, ko'r-ko'rona sanash, kamomad summasi). ✅ B10: kam qolgan tovar.
- ✅ B7: xarajatlar (kategoriyalar). ✅ B8: kassa smenasi, kutilgan naqd, kamomad, Z-hisobot.
- ✅ B12: aralash to'lov.
- ✅ Hisobotlar: foyda va zarar, kunlik grafik, pul oqimi, ABC, sotilmagan tovarlar, xodimlar, ombor qiymati.
- ✅ X5: to'liq to'langan chakana sotuv uchun "tez yo'l" (306 ms → 26 ms), to'liq hisoblash bilan aynanligi testlangan.

### Bosqich 3. Tarmoq
- ✅ T1: egasining umumiy paneli (filiallar solishtiruvi, bugungi savdo, foyda, qarz, ombor, yo'ldagi tovar).
- ✅ T2: filiallar orasida ko'chirish (jo'natish, qabul qilish, bekor qilish; mahsulot kartochkasi va rasmi bilan).
- ✅ T3: katalogni filiallarga tarqatish (faqat yo'qlari yoki narxlarni ham).
- 🟡 T4: egasi paneli telefonda moslashuvchan; alohida mobil ko'rinish qilinmadi.

### Bosqich 4. Mahsulotga aylantirish
- ✅ M1: birinchi ishga tushirish ustasi (soha, savdo turi, rang).
- ✅ M3: litsenziya (Ed25519 imzo, internetsiz; filiallar soni va muddat; sinov rejimi 14 kun / 3 filial).
- 🟡 M4: Windows `install.bat` (yorliq, avtoyuklash) va Linux xizmati yozildi; Windows'da sinab ko'rilmagan. Bitta `.exe` o'rnatuvchi ⬜.
- 🟡 M5: versiya o'zgarsa avtomatik zaxira ✅; yangilash faylini panel orqali yuklash ⬜ (yangilash — fayllarni almashtirish).
- ✅ M6: zaxiradan tiklash interfeysi (avval joriy holat saqlanadi, server o'zi qayta ishga tushadi).
- ✅ M7: bir tugmada demo filial. ✅ M9: tarmoq manzillari va QR. ✅ M8: [QOLLANMA.md](QOLLANMA.md).

### Bosqich 5. Qo'shimcha modullar
- ✅ B11: dollar narx va kurs bo'yicha qayta hisoblash (tiyin/sent darajasidagi valyuta hisobi ⬜).
- ✅ B13: aksiyalar (foiz; do'kon / kategoriya / mahsulot; muddat; minimal miqdor).
- 🟡 B14: partiya yaroqlilik muddati (xaridda) va muddati o'tayotganlar hisoboti ✅; partiyalar bo'yicha FIFO hisobdan chiqarish ⬜.
- 🟡 3.5: MXIK (IKPU) maydoni ✅; fiskal chek, elektron hisob-faktura, Click/Payme, SMS ⬜. Bular tashqi xizmatga ulanishni talab qiladi, "hech qayerga ulanmaydi" tamoyiliga ko'ra mijoz buyurtmasi bilan alohida modul bo'ladi.

### Bosqich 6. Tahlildan keyingi qo'shimchalar (2026-10-11)
- ✅ Onlayn katalog: o'lchov birliklari, kasr miqdor, mijozning narx turi, aksiyalar.
- ✅ Excel import/eksport: shtrix-kod, birlik, qadoq, tannarx, minimal qoldiq, MXIK, narx turlari; hisobotlar Excelga.
- ✅ Mijoz kartasida qaytarishlar va narx turi; bosh sahifada foyda, kam qolgan tovar, ochiq smenalar.
- ✅ Akt sverki; yetkazib beruvchiga buyurtma (zakaz); bonus (loyallik); qarz eslatmalari.
- ✅ Kassa uskunalari: skaner (USB/Bluetooth/COM/kamera, tarozi yorlig'i), ESC/POS chek printeri, pul yashigi, xaridor ekrani.
- ✅ Xodimlar oyligi va ish vaqti; egasi uchun 2FA va faol kirishlar; PWA.
- ✅ Har soha uchun demo (10 ta soha); `pos.js` bo'laklarga ajratildi (core, panels, cart, sahifa).
- ⬜ Tashqi xizmatlar (fiskal, Didox, Click/Payme, SMS) — "hech qayerga ulanmaydi" tamoyiliga ko'ra qilinmadi.

Taqdimotga tayyor: 0–4 bosqichlarning asosiy qismi bajarilgan, `npm test` dagi 950 dan ortiq tekshiruv o'tadi.

---

## 5. Taqdimot ssenariysi (10–12 daqiqa jonli demo)

1. **Muammo (1 daqiqa).** "Daftar va Excel'da qarz yo'qoladi, filiallarni nazorat qilib bo'lmaydi, kassir pulni to'g'ri topshirganini bilmaysiz."
2. **Egasi paneli (2 daqiqa).** 3 ta filial bitta ekranda: bugungi savdo, foyda, qarzlar; filiallar solishtiruvi.
3. **Kassa (3 daqiqa).**
   - shtrix-kod bilan sotish;
   - mijozga ulgurji narx o'zi qo'yiladi;
   - qisman to'lov qilinadi va qolgani qarzga yoziladi;
   - termo-chek chiqadi.
4. **Qarz nazorati (2 daqiqa).** Muddati o'tgan qarzlar, mijoz kartasi, to'lov avtomatik taqsimlanadi.
5. **Ombor (2 daqiqa).**
   - yetkazib beruvchidan kirim;
   - kam qolgan tovarlar;
   - boshqa filialga tovar ko'chirish.
6. **Xavfsizlik (1 daqiqa).** Kim nima qilgani tarixda, o'chirilgan narsani qaytarish, har kuni zaxira, internet o'chsa ham ishlaydi.
7. **Onlayn katalog (1 daqiqa).** Mijoz telefondan buyurtma beradi va u kassada paydo bo'ladi.

**Kerakli slaydlar (8–10 ta):**
1. Muammo
2. Yechim
3. Kimlar uchun
4. Asosiy imkoniyatlar
5. Filiallar va xavfsizlik
6. Raqobatchilardan farqi
7. Narxlar
8. O'rnatish va qo'llab-quvvatlash
9. Aloqa

---

## 6. Narx modeli bo'yicha taklif (muhokama uchun)

| Paket | Kimga | Tarkibi |
|---|---|---|
| **Start** | 1 do'kon | 1 filial, 3 ta xodim, asosiy funksiyalar |
| **Biznes** | O'sib borayotgan do'kon | 3 tagacha filial, cheklanmagan xodim, foyda va xarajat, ombor, katalog |
| **Tarmoq** | 4+ filial | Umumiy panel, tovar ko'chirish, umumiy katalog |
| **Modullar** | Qo'shimcha | Fiskal, elektron hisob-faktura, Click/Payme, SMS: har biri alohida narxda |

Narx tuzilishi: bir martalik litsenziya (filiallar soniga qarab), ixtiyoriy yillik qo'llab-quvvatlash va yangilanishlar (litsenziya narxining ~15–20 %), o'rnatish va o'qitish xizmati. Paketlar texnik jihatdan litsenziya kaliti (M3) orqali cheklanadi.

---

## 7. Xatarlar

| Xatar | Yechim |
|---|---|
| Fiskal talablar tez o'zgaradi | Fiskal qismni alohida modul qilish, yadroga bog'lamaslik |
| Mijoz kompyuteri buziladi va ma'lumot yo'qoladi | Har kuni zaxira, tashqi diskka nusxa, bir tugma bilan tiklash (M6) |
| Litsenziyani buzish | Imzolangan kalit; asosiy himoya esa qo'llab-quvvatlash va yangilanishlarning qiymati |
| Har bir mijoz o'ziga xos o'zgarish so'raydi | Soha shablonlari va sozlamalar orqali; kodni mijozga qarab tarmoqlarga bo'lmaslik |
| Katta do'konda SQLite yetmay qoladi | Har filial alohida baza bo'lgani uchun yuk bo'linadi. Benchmark yuzlab ming yozuvda ham yaxshi natija bergan |

---

## 8. Sizdan kerak bo'lgan qarorlar

1. **Birinchi soha.** Taqdimot qaysi soha do'konlari uchun? Shunga qarab birinchi soha shabloni va demo tayyorlanadi.
2. **Taqdimot sanasi.** Shunga qarab qaysi bosqichlar ulguradi, belgilaymiz.
3. **Mahsulot nomi.** "Do'kon boshqaruv" qoladimi yoki yangi brend nomi tanlaymizmi?
4. **Fiskal chek.** Maqsadli mijozlar uchun majburiymi? Agar majburiy bo'lsa, u 5-bosqichdan oldinga suriladi.
