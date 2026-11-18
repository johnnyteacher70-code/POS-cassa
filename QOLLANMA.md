# Foydalanuvchi qo'llanmasi

Bu qo'llanma do'kon egasi, administrator va kassirlar uchun. Har bir bo'lim qisqa: nima qilish kerak va qayerni bosish kerak.

---

## 1. Kirish

1. Brauzerda dastur manzilini oching. Server kompyuterida bu `http://localhost:3000`. Boshqa qurilmalarda manzil va QR kod egasi panelida: **Sozlamalar → Boshqa qurilmalardan ulanish**.
2. Login va parolni kiriting. Tizim sizni o'zi kerakli joyga olib boradi:
   - **egasi** filiallar paneliga tushadi;
   - **xodim** o'z filialiga tushadi; rolida bosh sahifa ruxsati bo'lmasa (masalan, kassir) to'g'ridan-to'g'ri **Kassa** ochiladi.
3. Tilni o'zgartirish uchun chap menyuning pastidagi **O'zbekcha / Русский** tugmasini bosing.

## 2. Egasi uchun

| Vazifa | Qayerda |
|---|---|
| Barcha filiallar savdosi, foydasi, qarzi | **📊 Umumiy hisobot**, davrni tanlang |
| Filial ochish, tahrirlash, bloklash | **🏬 Filiallar** |
| Filialga kirib ishlash | Filial kartochkasidagi **Kirish →**. Qaytish: **← Filiallarga qaytish** |
| Filial adminining parolini tiklash | Filial kartochkasi → **🔑 Admin paroli** |
| Mahsulotlarni boshqa filiallarga nusxalash | **📋 Katalogni tarqatish** |
| Filiallar orasidagi tovar harakati | **🔁 Ko'chirishlar** |
| Nom, logotip, rang, soha | **⚙️ Sozlamalar → Brend** |
| Litsenziya kalitini kiritish | **⚙️ Sozlamalar → Litsenziya** |
| Zaxira olish yoki tiklash | **⚙️ Sozlamalar → Zaxira nusxalar** |
| Fleshkadagi nusxalarni parol bilan himoyalash | **⚙️ Sozlamalar → Zaxira nusxalar → Parol o'rnatish** |
| Nusxani boshqa kompyuterga olib o'tish | Nusxa yonidagi **⬇ .dkz** (yuklab olish) → yangi kompyuterda **📂 Fayldan (.dkz)** → **Tiklash** |
| Taqdimot uchun namuna filial | **⚙️ Sozlamalar → Demo filial yaratish** |

> **Zaxiradan tiklash** barcha ma'lumotlarni tanlangan kunga qaytaradi. Hozirgi holat oldin alohida saqlab qo'yiladi. Tasdiqlash uchun `TIKLASH` deb yozish kerak.

> **Zaxira paroli** o'rnatilsa, fleshkaga yoziladigan va yuklab olinadigan nusxalar shifrlanadi (AES-256). Fleshka yo'qolsa ham ma'lumotni o'qib bo'lmaydi. **Parolni qog'ozga yozib, xavfsiz joyda saqlang**: u yo'qolsa, shifrlangan nusxani hech kim, jumladan dastur ishlab chiqaruvchisi ham ocha olmaydi. Kompyuterdagi kunlik nusxalar parolga bog'liq emas.

## 3. Xodimlar va rollar (administrator)

1. **Rollar va ruxsatlar** bo'limini oching. U yerda tayyor rollar bor: Sotuvchi, Kassir, Omborchi, Buxgalter, Menejer.
2. Yangi rol yaratish uchun **＋ Yangi rol** bosing:
   - nom yozing;
   - kerakli ruxsatlarni belgilang (shablondan boshlash mumkin);
   - **Saqlash** bosing.

   Rolni nusxalab, ozgina o'zgartirish ham mumkin.
3. **Xodimlar → ＋ Xodim qo'shish**: ism, login, parol, rol, kassa.
4. Xodim ishdan ketsa, uni o'chirmang: **Faol** belgisini olib tashlang. U kira olmaydi, lekin tarixi saqlanadi.

**Solishtirish jadvali** yorlig'ida qaysi rolda qaysi ruxsat borligi bir ekranda ko'rinadi.

Kassa uchun muhim ruxsatlar:

| Ruxsat | Bo'lmasa |
|---|---|
| Chegirma berish | Chegirma maydoni ko'rinmaydi |
| Narxni o'zgartirish | Narxni pasaytirib bo'lmaydi; narx turi va aksiya narxi esa ishlayveradi |
| Qarzga sotish | Faqat to'liq to'lov bilan sotiladi |
| Barcha sotuvlarni ko'rish | Xodim faqat o'z sotuvlarini ko'radi |

## 4. Kassa (POS)

1. **Mahsulot qo'shish.** Mahsulotni bosing yoki shtrix-kodni skanerlang. Qidiruv maydoni fokusda bo'lishi kerak: **F2**.
   - Yuqorida **Donalab / Qadoqlab** tanlanadi. Masalan, kg bilan yoki qop bilan.
   - kg, litr, metr kabi birliklarda kasr miqdor yoziladi: `2.5`.
2. **Mijoz.** Ismi yoki telefoni bilan tanlang.
   - Tanlanmasa, sotuv "Chakana xaridor"ga yoziladi.
   - Yangi telefon raqami yozilsa, mijoz o'zi yaratiladi.
   - Mijozning **narx turi** bo'lsa (masalan, ulgurji), narxlar o'zi qo'yiladi.
3. **Aksiya.** Faol aksiya bo'lsa, narx o'zi pasayadi. Mahsulot kartochkasida **−N%** belgisi chiqadi.
4. **To'lov.**
   - Turini tanlang: naqd, karta, perechisleniye.
   - **To'liq** tugmasi to'lov summasini chek summasiga tenglaydi.
   - Ikki usulda to'lash uchun **½** tugmasi: masalan, qismi naqd, qolgani karta.
   - **Qarzga** — qarzga yozish (ruxsat bo'lsa).
5. **Yakunlash.** **Sotuvni yakunlash (F9)** → **🧾 Chek** (termo-printer) yoki **Nakladnoy** (A4).
6. **Kutishga.** Savatni vaqtincha chetga qo'yib, boshqa mijozga xizmat qilish mumkin.

### Kassa smenasi

- Ish boshida: **Smenani ochish** → kassadagi naqd pulni kiriting.
- Ish oxirida: **Smenani yopish** → naqd pulni sanab kiriting. Tizim kutilgan summani, kamomad yoki ortiqchani ko'rsatadi → **Z-hisobot**ni chop eting.
- Sozlamalarda smena **majburiy** qilinsa, smena ochilmaguncha sotib bo'lmaydi.

### Qaytarish

1. Sotuvni oching: **Sotuvlar** ro'yxatidan yoki kassadagi **Bugun** oynasidan.
2. **↩ Qaytarish** bosing va qaytariladigan miqdorni kiriting.
3. Pulni qaytarish:
   - pul darhol qaytarilsa, **Pulni hozir qaytarish** maydonini to'ldiring;
   - aks holda summa mijozning qarzidan ayriladi.

Tovar omborga o'zi qaytadi.

## 4a. Uskunalarni ulash (skaner, chek printeri, pul yashigi)

Barcha sozlamalar bitta joyda: **Uskunalar (printer, skaner)** bo'limi. Har bir kassaning printeri alohida sozlanadi.

**Shtrix-kod skaneri:**
- **USB yoki Bluetooth skaner** — qo'shimcha sozlash shart emas. Ulang va **Uskunalar** sahifasida biror kodni o'qiting: kod ro'yxatda paydo bo'lsa, skaner ishlayapti.
- Kassa ekranida kursor qayerda turganining ahamiyati yo'q, kod baribir savatga tushadi. Muvaffaqiyatli o'qilganda qisqa ovoz chiqadi.
- **COM (serial) skaner**: **COM skaner ulash** tugmasi (Chrome/Edge'da ishlaydi).
- **Telefon yoki planshet kamerasi**: kassadagi 📷 tugmasi.
- **Tarozi yorlig'i** (vazni shtrix-kod ichida bo'lgan EAN-13) avtomatik tushuniladi. Mahsulotning artikuliga tarozidagi PLU kodini yozing.
- **Bir nechta dona**: qidiruvga `5*` yozing, keyin skanerlang.

**Chek printeri:**

| Usul | Qachon | Nima kerak |
|---|---|---|
| Tarmoq printeri (IP) | Wi-Fi yoki LAN kabelli printer | IP manzil (printerning test chekida yozilgan), port 9100 |
| Kompyuterga o'rnatilgan printer | USB printer, drayveri o'rnatilgan | **Windows:** printer xususiyatlarida **Общий доступ (Sharing)** ni yoqing va ro'yxatdan tanlang. **Linux:** CUPS printer nomi |
| USB qurilma | Drayversiz USB yoki COM printer | `/dev/usb/lp0`, `/dev/ttyUSB0`, `COM3` |
| Brauzer orqali | Boshqa yo'l bo'lmasa | Chop etish oynasi chiqadi. Oynasiz chiqarish uchun kassani **Kassa (POS)** yorlig'i bilan oching (`scripts\windows\kassa.bat`) va chek printerini standart printer qiling |

Printer tanlangach **Test cheki** tugmasini bosing. Chek chiqsa, tayyor. Kirill harflari noto'g'ri chiqsa, kod sahifasini almashtiring (CP866 / CP1251).

**Pul yashigi** chek printerining **DK (Cash drawer)** portiga RJ11 kabel bilan ulanadi:
- **Naqd to'lovda pul yashigini ochish** belgilansa, naqd sotuvdan keyin yashik o'zi ochiladi;
- qo'lda ochish: kassadagi **💰 Yashik** tugmasi yoki **F10**.

**Kassada naqd to'lov:**
- **Mijoz berdi** maydoniga (**F4**) olingan summani yozing yoki tayyor banknot tugmalaridan birini bosing;
- tizim **qaytimni** ko'rsatadi, qaytim chekda ham chiqadi.

Tezkor tugmalar:

| Tugma | Vazifasi |
|---|---|
| F2 | Qidiruv |
| F4 | Naqd |
| F8 | Kutishga |
| F9 | Yakunlash |
| F10 | Pul yashigi |
| + / − | Oxirgi mahsulot sonini o'zgartirish |
| Delete | Oxirgi mahsulotni o'chirish |

## 4b. Qo'shimcha imkoniyatlar

| Vazifa | Qayerda |
|---|---|
| **Akt sverki** | Mijoz kartasi → **📑 Akt sverki** → davrni tanlang → **Chop etish** yoki **PDF** |
| **Yetkazib beruvchiga buyurtma** | **Buyurtmalar (zakaz) → Yangi buyurtma** → **⚠ Kam qolganlardan to'ldirish** → saqlang va chop eting. Tovar kelganda **Tovar keldi — qabul qilish** (miqdor va narxni o'sha yerda tuzatish mumkin) |
| **Bonus** | Sozlamalar → **Bonus (loyallik)**: foiz va cheklov. Kassada mijoz tanlanganda **🎁 Bonus** qatori chiqadi |
| **Ish vaqti** | Xodim har kuni menyuning pastidagi **🕘 Keldim** / **Ketdim** tugmasini bosadi |
| **Oylik** | **Oylik va ish vaqti** sahifasi → ⚙ (oylik sharti: summa va foiz) → **💸 To'lash** |
| **Qarz eslatmalari** | **Qarzdorlik → 🔔 Eslatmalar**: matnni nusxalab messenjerga yuboring yoki qo'ng'iroq qiling → **Eslatildi** |
| **Excel** | Hisobotlar, Sotuvlar, Qarzdorlik va Xarajatlar sahifalaridagi **📥 Excel** tugmasi |
| **Xaridor ekrani** | Kassadagi **🖥** tugmasi → ochilgan oynani xaridorga qaragan monitorga suring (F11 — to'liq ekran) |
| **2FA (egasi)** | Egasi paneli → **🔐 Xavfsizlik** → **Yoqish** → telefondagi ilova bilan QR kodni skanerlang |
| **Telefon ilovasi** | Brauzer menyusi → **Bosh ekranga qo'shish** |

## 5. Mahsulotlar va ombor

**Yangi mahsulot:**
1. Nom, kategoriya, **o'lchov birligi** va narxni kiriting.
2. Kerak bo'lsa: shtrix-kod (⟳ tugmasi ichki kod yaratadi), tannarx, minimal qoldiq.
3. Qadoq bilan ham sotilsa, **"Qadoq bilan ham sotiladi"** belgisini qo'ying va qadoq nomi va sonini yozing. Masalan: qop = 50 kg.
4. **Narx turlari** bo'lsa (Sozlamalarda yaratiladi), har biri uchun narx yozing. Bo'sh qolsa, asosiy narx ishlatiladi.

**Ombor ishlari:**

| Vazifa | Qayerda / qanday |
|---|---|
| Kam qolgan tovarlar | Mahsulotlar ro'yxatidagi **⚠ Kam qolgan** tugmasi. Ro'yxat **Hisobotlar → Ombor qiymati**da ham bor |
| Narx etiketkasi | **🏷 Etiketkalar** → mahsulotlarni tanlang → o'lcham → **Chop etish** |
| Kirim (yetkazib beruvchidan) | **Xaridlar (kirim) → Yangi xarid**: yetkazib beruvchi, mahsulotlar, miqdor, kirim narxi, to'langan summa. Tovar omborga tushadi, tannarx yangilanadi, qolgan summa yetkazib beruvchiga qarz bo'ladi |
| Yetkazib beruvchiga to'lov | **Yetkazib beruvchilar** → kerakli yetkazib beruvchi → **To'lov qilish** |
| Inventarizatsiya (reviziya) | **Inventarizatsiya → Boshlash** → har bir mahsulotni sanang (skaner bilan har o'qishda +1) → **Yakunlash**. Farq omborda tuzatiladi, kamomad summasi ko'rsatiladi |
| Boshqa filialga jo'natish | **Filiallararo ko'chirish → Tovar jo'natish** |
| Boshqa filialdan qabul qilish | Kelgan hujjatni oching → **Qabul qilish** |
| Muddati o'tgan tovar | Xaridda har mahsulotga **yaroqlilik muddati**ni yozing. **Hisobotlar → Ombor qiymati**da muddati yaqin partiyalar omborda haqiqatda qolgan miqdori bilan chiqadi (avval eski partiya sotilgan deb hisoblanadi). Muddati o'tganini **Hisobdan chiqarish** tugmasi bilan chiqaring |

**Dollar narxlar:**
1. Sozlamalarda **Narxlarni dollarda ham yuritish** ni yoqing.
2. Mahsulotga dollar narxini yozing.
3. Kurs o'zgarsa, **Dollar kursi → Narxlarni yangilash** ni bosing.

## 6. Pul va hisobotlar

| Bo'lim | Nima uchun |
|---|---|
| **To'lovlar (kassa)** | Mijozlardan kirim va mijozlarga chiqim |
| **Xarajatlar** | Ijara, oylik, kommunal va boshqa xarajatlar (kategoriyalar bilan) |
| **Qarzdorlik** | Ochiq va muddati o'tgan qarzlar, qarzdor mijozlar |
| **Hisobotlar → Foyda va zarar** | Sof tushum, yalpi foyda, xarajatlar, sof foyda, kunlik grafik |
| **Hisobotlar → Mahsulotlar (ABC)** | Qaysi tovar ko'p foyda keltiradi, qaysi biri sotilmay turibdi |
| **Hisobotlar → Xodimlar** | Har bir sotuvchining savdosi va o'rtacha cheki |
| **Hisobotlar → Ombor qiymati** | Ombordagi tovar qiymati, kam qolgan va muddati o'tayotgan tovarlar |

> Foyda to'g'ri chiqishi uchun mahsulotlarda **tannarx** bo'lishi kerak. Tannarx xarid hujjati orqali o'zi to'ldiriladi. Xarid bekor qilinsa, o'rtacha tannarx avvalgi holiga qaytadi. Tannarxsiz sotuvlar bo'lsa, hisobot buni ogohlantiradi.

**Boshqa dasturdan o'tish (mijozlar va qarzlar):** **Mijozlar → 📥 Excel import**. Shablonni yuklab oling yoki eski dasturdan ro'yxatni Excel'ga chiqaring: "Ism", "Telefon", "Qarz", "Avans" ustunlari o'zi taniladi. Avval natija ko'rsatiladi. Bazada bor mijoz (telefon yoki INN bo'yicha) takror yaratilmaydi va qarzi ikki marta yozilmaydi.

## 7. Sozlamalar (filial)

**Rekvizitlar:**
- kompaniya ma'lumotlari: nakladnoy va chekda chiqadi.

**Mahsulot va narxlar:**
- **soha va mahsulot maydonlari:** formada qaysi qo'shimcha maydonlar ko'rinishi (brend, hajm, o'lcham, ranglar, MXIK);
- **narx turlari:** chakana, ulgurji, VIP ...;
- **valyuta:** dollar narxlari va kurs.

**Kassa:**
- **savdo:** dona bilan sotish, ombor qoldig'i;
- **kassa smenasi:** majburiy yoki ixtiyoriy;
- **yaroqlilik muddati:** xaridda partiya muddati kiritiladi;
- **kassa cheki:** lenta kengligi (58/80 mm), avtomatik chop etish, pastki matn.

**Katalog:**
- **katalog (sayt):** nomi va havolasi.

## 8. Muammo bo'lsa

| Muammo | Yechim |
|---|---|
| "Bu bo'limga ruxsatingiz yo'q" | Administratordan rolingizga kerakli ruxsatni qo'shishni so'rang |
| Kassa sotmayapti: "Avval kassa smenasini oching" | Kassa ekranining yuqorisidagi **Smenani ochish** tugmasini bosing |
| Shtrix-kod topilmadi | Mahsulot kartochkasiga shtrix-kodni kiriting yoki **Etiketkalar** sahifasida ichki kod bering |
| Kompyuter buzildi | Yangi kompyuterga dasturni o'rnating va zaxira papkasini (fleshkadagi `dokon-zaxira`) `data/backups` ga ko'chiring. Keyin egasi panelida **Tiklash** bosing |
| Egasi parolini unutdi | Server kompyuterida: `npm run owner -- <login> <yangi parol>` |
