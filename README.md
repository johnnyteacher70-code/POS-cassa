# Do'kon boshqaruv — chakana va ulgurji savdo tizimi

Do'konlar va do'kon tarmoqlari uchun tizim. U biznesning o'z kompyuteriga o'rnatiladi va ma'lumot o'sha yerda qoladi.

**Imkoniyatlari:**
- kassa (POS) va termo-chek;
- mijozlar qarzi va avansi;
- ombor, yetkazib beruvchilar va xarid;
- qaytarish, inventarizatsiya;
- xarajatlar, kassa smenasi (Z-hisobot);
- foyda hisobotlari;
- narx turlari va aksiyalar;
- shtrix-kod va etiketkalar;
- ko'p filial: filiallar orasida tovar ko'chirish, egasi uchun umumiy panel;
- rol va ruxsatlarni qo'lda sozlash;
- mijozlar uchun onlayn katalog;
- o'zbek va rus tillari.

Tizim kompyuterda, planshetda va telefonda ishlaydi. Server do'konning o'zida turgani uchun **internet o'chsa ham kassa ishlayveradi**. Tashqi xizmatlarga (bulut, Telegram, GitHub) ulanmaydi.

- Xodimlar uchun qo'llanma: [QOLLANMA.md](QOLLANMA.md)
- Rivojlantirish rejasi va holati: [BIZNES-REJA.md](BIZNES-REJA.md)
- Filiallar texnik topshirig'i: [TZ-filiallar.md](TZ-filiallar.md)

## O'rnatish

| Qayerga | Qanday |
|---|---|
| **Windows** | Node.js 20+ o'rnating. Paketni oching va `scripts\windows\install.bat` ni ishga tushiring. Kutubxonalar o'rnatiladi, ish stoliga yorliq qo'yiladi, server kompyuter yonganda o'zi ishga tushadi. |
| **Linux** | `npm install --omit=dev`, keyin `sudo bash scripts/install-service.sh`. Server systemd xizmati bo'ladi va yiqilsa o'zi qayta ishga tushadi. |
| **Sinab ko'rish** | `npm install && npm start`, keyin http://localhost:3000 |

`npm start` serverni kichik nazoratchi orqali ishga tushiradi (`scripts/run.js`). Server yiqilsa yoki zaxiradan tiklangandan keyin, nazoratchi uni o'zi qayta yoqadi. Sozlamalar ixtiyoriy, ular `.env.example` da (port, ma'lumotlar papkasi, zaxira).

**Sotish paketi:** `bash scripts/package.sh` → `dist/dokon-boshqaruv-<versiya>.zip`. Ma'lumotlar, testlar va litsenziya chiqarish skripti paketga kirmaydi.

## Birinchi ishga tushirish

1. **Egasi akkaunti:** ism, login, parol. Boshqa kompyuterdan ochilsa, server oynasida chiqqan bir martalik kod so'raladi.
2. **Biznes ustasi:**
   - biznes nomi;
   - soha: 10 ta shablon (oziq-ovqat, qurilish, kiyim, dorixona va boshqalar);
   - savdo turi: chakana, ulgurji yoki aralash;
   - asosiy rang.

   Soha mahsulot formasidagi maydonlarni va tayyor kategoriyalarni belgilaydi.
3. **Birinchi filial** va uning admini. Admin qolgan xodimlarni qo'shadi va ularga rol beradi.

Xohlasangiz, egasi panelidagi **Sozlamalar → Demo filial yaratish** bilan bir tugmada namuna ma'lumotli filial ochiladi. U taqdimot va o'qitish uchun.

## Rollar va ruxsatlar

Rollar **qo'lda yaratiladi**: rol bu 59 ta ruxsatdan tanlab tuzilgan to'plam. Har bir xodimga bitta rol biriktiriladi.

- **Tayyor rollar:** Administrator (tizim roli, hamma ruxsat), Sotuvchi, Kassir, Omborchi, Buxgalter, Menejer. Ularni o'zgartirish yoki o'chirish, yangisini yaratish mumkin.
- **Ruxsatlar amal darajasida.** Masalan:
  - chegirma berish;
  - narxni o'zgartirish;
  - qarzga sotish;
  - faqat o'z sotuvlarini ko'rish;
  - tannarxni ko'rish;
  - qaytarish;
  - xarid;
  - smena;
  - inventarizatsiya;
  - hisobotlar.
- **Server har bir so'rovni tekshiradi.** Interfeys esa ruxsat yo'q bo'limlarni va tugmalarni yashiradi.
- **Huquqni oshirib berib bo'lmaydi:**
  - xodim boshqaga o'zida yo'q ruxsatni bera olmaydi;
  - o'z rolini o'zgartira olmaydi;
  - o'zidan yuqori huquqli xodimni tahrirlay olmaydi.
- Rol o'zgarsa, shu roldagi xodimlarga qayta kirishsiz darhol kuchga kiradi.

## Asosiy imkoniyatlar

| Bo'lim | Nima qiladi |
|---|---|
| **Uskunalar** | USB/Bluetooth skaner kursor qayerda bo'lmasin ishlaydi. COM skaner (Web Serial) va kamera ham ulanadi, tarozi yorlig'i (EAN-13 ichida vazn) tushuniladi. Chek printeriga ESC/POS buyrug'i oynasiz yuboriladi: tarmoq (IP:9100), tizim printeri (CUPS / Windows umumiy printer) yoki USB qurilma orqali. Pul yashigi printer orqali ochiladi, QR kod chop etiladi, kirill harflari CP866 da. Har bir kassaning printeri alohida sozlanadi. |
| **Kassa (POS)** | Bosish yoki shtrix-kod skaneri bilan sotish. "Mijoz berdi → qaytim", tezkor tugmalar (F2/F4/F8/F9/F10, +/−, Del). Mijozning narx turi va aksiyalar avtomatik qo'llanadi. Aralash to'lov (naqd + karta), qarzga sotish, kutishdagi savatlar. 58/80 mm termo-chek yoki A4 nakladnoy. Kassa smenasi paneli. |
| **Mahsulotlar** | Har bir mahsulot uchun: o'lchov birligi (dona, kg, litr, metr, m² ...), qadoq (karobka, qop, blok — nomi erkin). Kasr miqdorda sotish, shtrix-kod (ichki EAN-13 yaratish bilan), tannarx (o'rtacha tortilgan), minimal qoldiq, narx turlari, dollar narxi, MXIK kodi. Excel import/eksport. |
| **Narx turlari va aksiyalar** | Chakana, ulgurji, VIP ... narxlari; mijozga narx turi biriktiriladi. Aksiya foiz bilan beriladi (butun do'kon, kategoriya yoki mahsulot), muddat va minimal miqdor shart qilib qo'yiladi. |
| **Yetkazib beruvchilar va xarid** | Kirim hujjati: tovar omborga tushadi, tannarx yangilanadi, yetkazib beruvchiga qarz yoziladi. Unga to'lovlar, partiya yaroqlilik muddati, xaridni bekor qilish. |
| **Qaytarish** | Sotuvdan qisman yoki to'liq qaytarish. Tovar omborga qaytadi, summa mijoz qarzidan ayriladi yoki naqd qaytariladi. Chegirmali sotuvda mutanosib hisoblanadi. |
| **Inventarizatsiya** | Sanash varag'i: skanerda o'qilgan tovarga +1 qo'shiladi, "ko'r-ko'rona" sanash rejimi bor. Yakunlanganda farq omborda tuzatiladi va kamomad summasi hisoblanadi. |
| **Pul** | To'lovlar, kassalar, xarajatlar (kategoriyalar bilan). Kassa smenasi: ochish, yopishda naqdni sanash, kamomad yoki ortiqcha, Z-hisobot. |
| **Hisobotlar** | Foyda va zarar (tushum − qaytarish − tannarx − xarajat). Kunlik grafik, pul oqimi. Mahsulotlar bo'yicha ABC tahlil va sotilmagan tovarlar. Xodimlar reytingi, o'rtacha chek. Ombor qiymati, kam qolgan va muddati o'tayotgan tovarlar. |
| **Egasi paneli** | Barcha filiallar bir ekranda: bugungi savdo, foyda, qarzlar, ombor, solishtiruv. Filiallar orasida ko'chirish tarixi. Katalogni filiallarga tarqatish. Brend, litsenziya, zaxira, tarmoq/QR. |
| **Filiallararo ko'chirish** | Jo'natilganda tovar manbadan chiqadi. Qabul qilinganda qabul qiluvchi omboriga kiradi: mahsulot shtrix-kod, artikul yoki nom bo'yicha topiladi, topilmasa kartochkasi va rasmi bilan yaratiladi. |
| **Mijozlar va qarz** | Balans = kirim − chiqim − sotuv. To'lovlar sotuvlarga avtomatik taqsimlanadi (FIFO), qarz muddati belgilanadi, nakladnoyda balans ko'rsatiladi. |
| **Katalog** | Har bir filialning onlayn katalogi (`/shop/<kod>`): mijoz buyurtma beradi va sharh qoldiradi. Kirgan ulgurji mijoz o'z narxini ko'radi. Aksiyalar, kg/litr birliklari va kasr miqdor ham bor. |
| **Akt sverki** | Mijoz bilan o'zaro hisob-kitob dalolatnomasi. Davr boshidagi va oxiridagi qoldiq, har bir sotuv va to'lov debet/kredit bo'lib chiqadi, ikki tomon imzosi bilan chop etiladi yoki PDF qilinadi. |
| **Yetkazib beruvchiga buyurtma** | Kam qolgan tovarlardan avtomatik to'ldiriladi va chop etiladi. Tovar kelganda "Qabul qilish" bosilsa, xarid hujjati va omborga kirim o'zi yaratiladi. |
| **Bonus (loyallik)** | Har xariddan N% bonus yig'iladi, keyingi xaridda chekning ko'pi bilan M% qismi bonus bilan to'lanadi. Sotuv bekor qilinsa yoki tovar qaytarilsa, bonus to'g'rilanadi. |
| **Oylik va ish vaqti** | Xodim "Keldim / Ketdim" tugmasini bosadi. Oylik belgilangan summa + o'z sotuvidan yoki foydasidan foiz, bonus yoki jarima bilan hisoblanadi. To'langan oylik "Ish haqi" xarajati bo'lib yoziladi. |
| **Qarz eslatmalari** | Muddati o'tgan qarzdorlar ro'yxati, har biriga tayyor matn (o'zbekcha/ruscha) va "Eslatildi" belgisi. |
| **Excel hisobotlar** | Foyda va zarar, ABC, xodimlar, ombor, sotuvlar, qarzdorlar va xarajatlar `.xlsx` faylga chiqadi. Mahsulot importi va eksporti shtrix-kod, birlik, tannarx va narx turlarini ham biladi. |
| **Xaridor ekrani** | Ikkinchi monitorda savat, jami summa, aksiyalar, qaytim va "Rahmat" ko'rinadi (`/display`). |
| **Xavfsizlik** | Egasi uchun ikki bosqichli kirish (TOTP, Google Authenticator). Faol kirishlar ro'yxati, begona qurilmani chiqarib yuborish mumkin. |
| **Ilova (PWA)** | "Bosh ekranga qo'shish" orqali telefon yoki kompyuterda ilova sifatida ochiladi. Server kompyuterida internetsiz ham ishga tushadi. |

## Mahsulotni sotish (litsenziya)

- Litsenziya kaliti Ed25519 imzosi bilan tekshiriladi, **internet kerak emas**.
- Kalitda yozilgan: biznes nomi, filiallar soni, muddat.
- Kalitsiz tizim **sinov rejimida** ishlaydi: 14 kun, 3 filialgacha.
- Muddat tugasa yoki chegaraga yetilsa, faqat **yangi filial ochish** to'xtaydi. Mavjud filiallarda savdo hech qachon to'xtamaydi.
- Kalit egasi panelida kiritiladi: **Sozlamalar → Litsenziya**.

Kalit chiqarish (faqat sotuvchi uchun):

```bash
node scripts/license.js issue --business "Mijoz MChJ" --branches 5 --expires 2027-12-31
```

Yopiq kalit `~/.dokon-license/private.pem` da saqlanadi va loyiha ichida emas. **Uni zaxiralang va hech kimga bermang**: usiz yangi kalit chiqarib bo'lmaydi.

## Ma'lumotlar, zaxira, yangilash

```
data/
  main.db                 egasi, filiallar, loginlar, sessiyalar, ko'chirishlar, biznes sozlamalari
  branches/<id>/app.db    filialning butun ma'lumoti (SQLite)
  branches/<id>/uploads/  mahsulot rasmlari
  brand/                  biznes logotipi
  backups/                zaxira nusxalar
  archive/audit/<id>/     2 yildan eski amallar jurnali (gzip JSON)
```

- **Zaxira:** har kuni avtomatik olinadi (soat 03:00 dan keyin, oxirgi 14 tasi saqlanadi). Qo'lda olish uchun egasi panelida **Sozlamalar → Hozir zaxira olish** yoki `npm run backup`. `.env` da `BACKUP_COPY_DIR` berilsa, nusxa fleshka yoki tashqi diskka ham ko'chiriladi. Egasi panelida **zaxira paroli** o'rnatilsa, tashqi nusxa bitta shifrlangan `.dkz` fayl bo'ladi (AES-256-GCM, kalit scrypt bilan; main.db da parol emas, faqat hosil qilingan kalit saqlanadi). `.dkz` ni serversiz ochish: `node scripts/backup-open.js fayl.dkz papka`.
- **Jurnal arxivi:** `AUDIT_KEEP_MONTHS` (standart 24) oydan eski amallar jurnali har kuni `data/archive/audit/` ga chiqariladi va bazadan o'chiriladi.
- **Tiklash:** egasi panelida nusxani tanlab "Tiklash" bosiladi. Hozirgi holat alohida saqlab qo'yiladi, server qayta ishga tushadi va nusxa bazalar ochilishidan oldin qo'yiladi.
- **Yangilash:** yangi versiya fayllari ustiga yoziladi va server qayta ishga tushiriladi. Versiya o'zgargani aniqlansa, migratsiyalardan **oldin** barcha bazalar `backups/<sana>_yangilash_<eski versiya>` ga avtomatik nusxalanadi.
- **Egasi parolini unutsangiz** (server kompyuterida): `npm run owner -- <login> <yangi parol>`.

## Tezlik

Kesh ustunlar trigger'lar orqali yangilanadi: ombor qoldig'i va mijoz qarzi. Indekslar va ledgerga diff bilan yozish ishlatiladi. Kassadagi to'liq to'langan sotuv uchun "tez yo'l" bor: mijozning butun tarixi qayta hisoblanmaydi.

Benchmark: `node test/bench.js` (5 000 mahsulot, 20 000 mijoz, 100 000 sotuvli sun'iy baza). Natijalar:

| So'rov | Vaqt |
|---|---|
| Kassadagi sotuv | ~26 ms |
| Bitta mahsulot | ~7 ms |
| Mahsulotlar ro'yxati | ~120 ms |
| Mijoz qidiruvi | ~200 ms |

## Testlar

`npm test` — 1000 ga yaqin tekshiruv. Hammasi vaqtinchalik papkalarda ishlaydi va `data/` ga tegmaydi:

| To'plam | Nimani tekshiradi |
|---|---|
| infratuzilma, litsenziya, tiklash | asosiy qatlam, kalitlar, zaxiradan tiklash sikli |
| kamchiliklar (48) | bonus va tannarxni qaytarish, partiya muddati (FIFO), mijozlar importi, shifrlangan zaxira, jurnal arxivi |
| API (256), filiallar, ajratish | asosiy API, filiallar, ma'lumotlar aralashmasligi |
| rollar | ruxsatlar va huquqni oshirib berishdan himoya |
| mahsulot, savdo, moliya, tarmoq | universal mahsulot, xarid va qaytarish, smena va hisobotlar, ko'p filial |
| kesh tekshiruvi | kesh ustunlar noldan hisoblangani bilan bir xilmi |
| brauzer (headless Chrome) | birinchi sozlashdan kassagacha hamma sahifa |

## Tuzilma

```
server/
  index.js, startup.js    server; bazalar ochilishidan oldingi tiklash / yangilash zaxirasi
  main_db.js, branch_db.js, schema.js, context.js, db.js
  perms.js                ruxsatlar katalogi va tayyor rollar
  units.js                o'lchov birliklari, narx turi va aksiya narxi
  ledger.js               balans, to'lovlarni taqsimlash, qarz sanalari
  license.js, business.js litsenziya; biznes sozlamalari (brend, soha)
  routes/                 auth, owner, products, sales, returns, purchases, finance (xarajat, smena),
                          inventory, reports, transfers, prices (narx turlari, aksiyalar), clients, payments, ...
public/admin/js/pages/    admin panel sahifalari (Vue 3, build kerak emas)
scripts/                  run.js (nazoratchi), license.js, package.sh, install-service.sh, windows/
test/                     testlar
```
