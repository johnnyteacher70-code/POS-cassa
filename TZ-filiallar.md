# TZ: Ko'p filialli tizim (optom kosmetika)

Holat: loyiha 3 ta filialga ega bitta do'kon (biznes) uchun qayta quriladi. Hozirgi barcha funksiyalar (mahsulotlar, ombor, POS kassa, sotuvlar, mijozlar va qarzdorlik, to'lovlar, KP, nakladnoy, buyurtmalar, sharhlar, kassalar, xodimlar, jurnal, Excel import) saqlanadi va **har bir filial ichida alohida** ishlaydi.

**Bajarilish holati (2026-10-06):** 0–5 bosqichlar bajarildi, `npm test` da 492 ta tekshiruv o'tadi
(8-bo'limdagi barcha mezonlar avtomatik test sifatida yozilgan). 11-bo'limdagi savollarga javob kelmagani uchun
taklif qilingan variantlar qabul qilindi (11-bo'limga qarang).

---

## 1. Maqsad

1. Tizimga kirganda **filiallar sahifasi** ochiladi. U yerda faqat yaratilgan filiallar ko'rinadi. Boshida ro'yxat bo'sh va faqat **"Filial yaratish"** tugmasi bor.
2. Filiallar soni oldindan belgilanmaydi. Tugma bosilib yaratilgandagina filial qo'shiladi (hozir 3 ta, keyin 4-, 5-si ham qo'shilishi mumkin).
3. Har bir filialning funksiyalari bir xil, lekin **ma'lumotlari to'liq alohida**: xodimlar, mahsulotlar, ombor, mijozlar, sotuvlar, to'lovlar, kassa, buxgalteriya, sozlamalar, jurnal.
4. Filiallar ma'lumoti **hech qachon aralashmaydi**. Bir filial xodimi boshqa filialni ko'rmaydi va unga kira olmaydi.
5. Xodim login qilganda tizim uning qaysi filialdan ekanini o'zi biladi va **to'g'ridan-to'g'ri o'sha filialga** kiritadi.
6. Hamma narsa **qo'lda, panel orqali** sozlanadi: `.env`, token yoki tashqi xizmat kerak emas.
7. Tashqi ulanishlar yo'q: Telegram, GitHub deploy va server skriptlari olib tashlanadi.

---

## 2. Rollar

| Rol | Kim | Nima qila oladi |
|---|---|---|
| **Egasi** (owner) | Biznes egasi, 1–2 kishi | Filiallar sahifasi: filial yaratish, tahrirlash, bloklash. Har bir filialga birinchi adminni tayinlash, admin parolini tiklash. Har qanday filialga "kirish" (pastdagi 11.1-savolga qarang). |
| **Filial admini** | Filial boshlig'i | Faqat o'z filiali: xodimlar, mahsulotlar, narxlar, sozlamalar, hisobotlar, hamma hujjatlar (hozirgi `admin` roli). |
| **Sotuvchi** | Kassir / sotuvchi | Faqat o'z filiali: POS, sotuv, to'lov qabul qilish (hozirgi `seller` roli). |

- Filial admini ham, sotuvchi ham **bitta filialga** tegishli. Bir odam ikki filialda ishlasa, unga ikki xil login beriladi.
- Login butun tizim bo'yicha **yagona** bo'ladi. Ikkita filialda bir xil `ali` logini bo'lishi mumkin emas, aks holda kirishda qaysi filial ekani noma'lum qoladi.

---

## 3. Ekranlar va ish oqimi

### 3.1. Birinchi ishga tushirish (qo'lda sozlash)
- Baza bo'sh bo'lsa, `/setup` sahifasi ochiladi. U yerda **egasi akkaunti** yaratiladi: ism, login, parol (2 marta).
- Shundan keyin `/setup` butunlay yopiladi.
- `.env`dagi `ADMIN_PASSWORD` va `admin123` standart paroli olib tashlanadi.

### 3.2. Kirish sahifasi (hamma uchun bitta)
- Faqat login va parol so'raladi, filial tanlanmaydi.
- Login **egasi** bo'lsa, filiallar sahifasi ochiladi.
- Login **filial xodimi** bo'lsa, darhol o'sha filialning paneli ochiladi. Sotuvchi uchun bu hozirgidek POS.
- Filial bloklangan bo'lsa: "Filial vaqtincha yopilgan" xabari chiqadi va kirish bo'lmaydi.

### 3.3. Filiallar sahifasi (faqat egasi)
- Filiallar **kartochka** ko'rinishida chiqadi. Har bir kartochkada: nomi, manzili, telefoni, holati (faol / bloklangan), xodimlar soni, yaratilgan sanasi.
- Filial yo'q bo'lsa: bo'sh holat va katta **"+ Filial yaratish"** tugmasi.
- Kartochkadagi amallar: **Kirish**, **Tahrirlash**, **Bloklash / Faollashtirish**, **Admin parolini tiklash**.
- Filialni o'chirish: faqat bloklangan filialni o'chirish mumkin. Buning uchun filial nomini qo'lda yozib tasdiqlash kerak. O'chirishdan oldin zaxira nusxa avtomatik olinadi.

### 3.4. "Filial yaratish" formasi
| Maydon | Majburiy | Izoh |
|---|---|---|
| Filial nomi | ha | masalan "Chilonzor filiali" |
| Qisqa kod (slug) | ha | lotin harflarida, masalan `chilonzor`. Katalog manzili uchun kerak, keyin o'zgartirilmaydi |
| Manzil, telefon | yo'q | nakladnoy va KP shapkasiga tushadi |
| Hujjat prefiksi | yo'q | masalan `CH`, shunda nakladnoy raqami `CH-000123` bo'ladi |
| Birinchi admin: ism, login, parol | ha | filialga shu admin kiradi va qolgan xodimlarni o'zi qo'shadi |

"Yaratish" bosilganda filialning bo'sh bazasi yaratiladi, sozlamalarga nomi, manzili va telefoni yoziladi, admin qo'shiladi va kartochka ro'yxatda paydo bo'ladi.

### 3.5. Filial ichi
- Panel hozirgisi bilan bir xil. Faqat yuqorida **filial nomi** doim ko'rinib turadi.
- Egasi filialga kirgan bo'lsa, yuqorida **"← Filiallarga qaytish"** tugmasi chiqadi. Jurnalda uning amallari "Egasi: <ism>" deb yoziladi.
- Har bir filialning sozlamalari alohida: kompaniya nomi, rekvizitlar, direktor, KP va nakladnoy izohi, sotuv birligi, ombor qoldig'ini ko'rsatish va boshqalar.

### 3.6. Mijozlar katalogi (sayt)
- Har bir filialning katalogi alohida: `/shop/<slug>` (masalan `/shop/chilonzor`).
- Katalogdagi mahsulotlar, mijoz kabineti, buyurtmalar va sharhlar o'sha filialniki.
- Mijoz telefon + parol bilan kiradi. Parolni tiklash Telegram orqali emas: mijoz menejerga murojaat qiladi va admin paneldan yangi parol beriladi (bu funksiya hozir ham bor).
- `/shop` (slugsiz) ochilsa, faol filiallar ro'yxati chiqadi. Agar katalog umuman kerak bo'lmasa, uni o'chirib qo'yish mumkin (11.3-savol).

---

## 4. Ma'lumotlarni ajratish (arxitektura)

### 4.1. Tanlov: har bir filialga **alohida baza fayli**
```
data/
  main.db                    ← faqat: egasi akkaunti, filiallar ro'yxati, login indeksi, sessiyalar
  branches/
    1/app.db                 ← 1-filialning BUTUN ma'lumoti (hozirgi barcha jadvallar)
    1/uploads/               ← 1-filial mahsulot rasmlari
    2/app.db
    2/uploads/
    3/...
  backups/YYYY-MM-DD/<filial>/app.db
```

**Nega bunday, `branch_id` ustuni emas:**
- Ajratish **jismoniy** bo'ladi: ikki filialning ma'lumoti bitta faylda turmaydi. Biror so'rovda `WHERE branch_id=?` yozish esdan chiqsa ham, ma'lumot oqib ketmaydi.
- Hozirgi ~2000 qatorlik route kodi deyarli o'zgarmaydi. Har bir SQL so'rovga filtr qo'shish shart emas.
- Filialni alohida zaxiralash, tiklash, ko'chirish yoki o'chirish oson: bitta papka.
- Hujjat raqamlari, ID'lar va qoldiqlar har bir filialda o'z-o'zidan mustaqil.

### 4.2. Qanday ishlaydi
1. **`main.db` jadvallari:**
   - `owners`: id, username, password_hash, full_name, active, created_at
   - `branches`: id, slug UNIQUE, name, address, phone, doc_prefix, status (`active` | `blocked`), created_at
   - `logins`: username UNIQUE, branch_id. Bu filial xodimlari loginlarining indeksi, kirishda filialni topish uchun.
   - `sessions`: token, kind (`owner` | `staff`), branch_id, user_id, expires_at
2. **Filial bazasi** (`branches/<id>/app.db`): hozirgi `db.js` sxemasi. Undan Telegram jadvallari va ustunlari olib tashlanadi (5-bo'lim).
3. **So'rov konteksti:** har bir so'rovda middleware sessiyadan `branch_id`ni aniqlaydi va uni `AsyncLocalStorage`ga yozadi. `require('./db')` endi **proksi** qaytaradi: u joriy so'rovning filial bazasiga murojaat qiladi. Shuning uchun route fayllari o'zgarmaydi.
4. **Xavfsizlik qoidasi (fail-closed):** filial konteksti bo'lmagan joyda `db` chaqirilsa, xato chiqadi. Hech qachon "standart" yoki "birinchi" filial bazasi ishlatilmaydi.
5. **`branch_id` faqat serverdagi sessiyadan olinadi.** Brauzer yuborgan hech qanday parametr, header yoki URL qiymatiga ishonilmaydi. Egasi filialga "kirganda" uning sessiyasidagi `branch_id` serverda o'zgartiriladi.
6. **Xodim qo'shish / o'zgartirish / o'chirish:** filial bazasidagi `users` jadvali va `main.db.logins` bitta amalda yangilanadi. Login band bo'lsa, "Bu login boshqa joyda band" xabari chiqadi.
7. **Fon vazifalari** (sessiyalarni tozalash, kunlik zaxira) har bir filial bo'yicha aniq tsikl bilan ishlaydi.
8. **Rasmlar** `/uploads/<branch_id>/...` manzilida turadi va filial papkasidan beriladi.
9. Ochiq filial bazalari xotirada keshlanadi. Server to'xtaganda hammasi yopiladi.

---

## 5. Olib tashlanadigan narsalar

| Narsa | Holat |
|---|---|
| GitHub remote, GitHub Actions deploy | ✅ olib tashlandi |
| `deploy/`, `DEPLOY.md`, `Dockerfile`, `docker-compose.yml`, `.dockerignore` | ✅ olib tashlandi |
| `.env` (eski parol bilan), eski `data/` (baza, zaxira, rasmlar) | ✅ olib tashlandi |
| Telegram mijozlar boti va admin bot: `server/bot.js`, `admin_bot.js`, `notify.js`, `tglink.js`, `staff_tg.js`, `server/i18n.js` | olib tashlanadi |
| Telegram WebApp orqali kirish (katalogda), `verifyInitData`, `SHOP_DEV` rejimi | olib tashlanadi |
| Telegram orqali parol tiklash (`/web/forgot`, `/web/reset`, `password_resets` jadvali) | olib tashlanadi |
| Ulanish so'rovlari (`link_requests`), xodimni Telegramga ulash (`staff_tg_links`) | olib tashlanadi |
| Ustunlar: `clients.telegram_id/telegram_username`, `users.telegram_id/tg_notify`; sozlama `notify_lang` | olib tashlanadi |
| Admin panel: `tglink.js`, "Telegram'ni ulash", mijozlardagi "Telegram" filtri, ulanish so'rovlari bo'limi | olib tashlanadi |
| `grammy` kutubxonasi, `test/bot_test.js` | olib tashlanadi |
| Subdomen sozlamalari (`SHOP_HOST` / `ADMIN_HOST`), `/healthz` dagi git versiyasi | olib tashlanadi (soddalashtirish) |
| `.env.example` | faqat `PORT` va `DATA_DIR` qoladi (ikkalasi ham ixtiyoriy) |

---

## 6. Ishlash bosqichlari

**0-bosqich: tozalash**
- 5-bo'limdagi Telegram va subdomen kodini olib tashlash.
- Testlarni yangilash. Hozirgi testlar yashil bo'lishi kerak.

**1-bosqich: asos (main.db va filial bazalari)**
- `server/main_db.js`: `main.db` sxemasi.
- `server/branch_db.js`: filial bazasini ochish yoki yaratish, keshlash, yopish.
- `db.js`ni AsyncLocalStorage proksisiga o'tkazish, fail-closed qoidasi bilan.
- Hozirgi sxemani "filial sxemasi" funksiyasiga ajratish.

**2-bosqich: kirish va rollar**
- `/setup` (birinchi egasi akkaunti).
- Yagona `/api/auth/login`: avval `owners`, keyin `logins` dan filial topiladi.
- Markaziy sessiyalar, `loadUser` va filial kontekstini o'rnatish.
- Xodim CRUD'ini `logins` indeksi bilan sinxronlash, global login tekshiruvi.
- Bloklangan filial xodimlarini kiritmaslik va ularning sessiyalarini bekor qilish.

**3-bosqich: egasi paneli**
- API: `/api/owner/branches` (ro'yxat, yaratish, tahrirlash, bloklash, o'chirish, admin parolini tiklash, `enter`, `leave`).
- Frontend: filiallar sahifasi, bo'sh holat, yaratish formasi, kartochkalar.
- Filial ichida filial nomi va "Filiallarga qaytish" tugmasi.

**4-bosqich: katalog, rasmlar, zaxira**
- `/shop/<slug>` va `/api/shop/<slug>/...`: kontekst slug bo'yicha o'rnatiladi.
- Rasmlar filial papkasida.
- Kunlik zaxira har bir filial bo'yicha, filialni o'chirishdan oldin ham.
- Hujjat prefiksi (`CH-000123`).

**5-bosqich: ajratish testlari va hujjat**
- 8-bo'limdagi barcha tekshiruvlar avtomatik test sifatida yoziladi.
- README yangilanadi: o'rnatish, birinchi sozlash, filial qo'shish.

---

## 7. Texnik talablar
- Node.js 20+, Express 5, better-sqlite3, Vue 3 (hozirgi stek o'zgarmaydi).
- Ishga tushirish: `npm install && npm start`. Birinchi kirishda `/setup` ochiladi.
- Bitta server jarayoni hamma filiallarga xizmat qiladi. Alohida port yoki alohida server kerak emas.
- Parollar bcrypt bilan saqlanadi. Sessiya cookie'si `httpOnly`. Kirish urinishlariga cheklov hozirgidek qoladi.

---

## 8. Qabul qilish mezonlari (testlar)
1. Yangi o'rnatishda `/setup` ochiladi. Egasi yaratilgach `/setup` 404 qaytaradi.
2. Egasi kirganda filial yo'q: faqat "Filial yaratish" tugmasi ko'rinadi.
3. A, B va C filiallari yaratildi. Uchtasi ham ro'yxatda, har birining bazasi va papkasi alohida.
4. A filialida mahsulot, mijoz, sotuv va to'lov qo'shildi. **B va C da ular ko'rinmaydi.** B dagi hisobotlar va kassa nolda.
5. A xodimi kirganda darhol A ga tushadi. Filiallar sahifasini ochib bo'lmaydi (403).
6. A xodimi B ma'lumotiga **hech qanday yo'l bilan** kira olmaydi: URL, header, ID almashtirish, katalog slug'ini almashtirish, rasm manzili. Hammasida 403 yoki 404 qaytadi.
7. B da A dagi xodim logini bilan yangi xodim qo'shib bo'lmaydi.
8. A bloklandi: A xodimlari chiqarib yuboriladi va kira olmaydi, B va C ishlashda davom etadi.
9. Egasi A ga kirib sotuv qildi: sotuv faqat A da, jurnalda "Egasi: ..." deb yozilgan.
10. Hujjat raqamlari har bir filialda alohida boshlanadi (A da 1, B da ham 1).
11. Kodda `telegram`, `grammy`, `BOT_TOKEN` qolmagan. Tashqi tarmoqqa hech qanday so'rov ketmaydi.
12. Server qayta ishga tushganda barcha filiallar ma'lumoti joyida.

---

## 9. Ma'lumot ko'chirish
Eski baza o'chirilgan, shuning uchun tizim **noldan** boshlanadi. Mahsulotlarni har bir filialga hozirgi **Excel import** orqali kiritish mumkin.

## 10. Kirmaydi (ataylab)
- Filiallar o'rtasida tovar ko'chirish, umumiy ombor, umumiy mijozlar bazasi. Talab bo'yicha ma'lumot aralashmasligi kerak.
- Telegram yoki SMS xabarnomalar.

## 11. Qabul qilingan qarorlar (savollarga javob kelmagani uchun taklif qilingan variant)
1. **Egasi filial ichiga kiradi** — to'liq admin sifatida; amallari jurnalda "Egasi: <ism>" deb yoziladi. O'zgartirish oson.
2. **Umumiy hisobot** — hozircha yo'q (filiallar sahifasida faqat holat va xodimlar soni). Kerak bo'lsa keyin qo'shiladi.
3. **Katalog (sayt)** — saqlandi, har bir filialga alohida: `/shop/<qisqa kod>`.
4. **Yangi filial bo'sh boshlanadi.** Mahsulotlarni boshqa filialdan Excel eksport → import qilib ko'chirish mumkin.

## 12. Amalga oshirishdagi aniqliklar
- Egasi API'si (filial yaratish va h.k.) 2-bosqichda yozildi, chunki testlar filial yaratishni talab qildi. 3-bosqichda faqat interfeys qoldi.
- Mahsulot rasmlari `/uploads/<filial ID>/<tasodifiy nom>` manzilida beriladi. Katalog ochiq bo'lgani uchun rasmlar ham ochiq,
  lekin bir filial rasmi boshqa filial yo'li orqali ochilmaydi.
- O'chirilgan filialning ID raqami hech qachon qayta berilmaydi (`AUTOINCREMENT`). Aks holda zaxiradagi rasmlar papkasi
  va brauzer keshidagi manzillar eski va yangi filial o'rtasida aralashishi mumkin edi. Buni testlar aniqladi.
- Filialga kirish / chiqish va login / logout sahifani to'liq qayta yuklaydi, shunda brauzerda oldingi filialning
  keshlangan ma'lumoti qolmaydi.
- Egasi parolini unutsa: `npm run owner -- <login> <yangi parol>` (server kompyuterida).
- Admin panel va katalog shriftlarni Google Fonts'dan yuklaydi (brauzer tomonida). Internet bo'lmasa oddiy shrift ishlatiladi.
