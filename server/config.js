// Umumiy yo'llar: barcha ma'lumotlar DATA_DIR ichida saqlanadi
//   main.db              — egasi akkaunti, filiallar ro'yxati, loginlar indeksi, sessiyalar
//   branches/<id>/       — har bir filialning o'z bazasi (app.db) va rasmlari (uploads/)
//   backups/             — zaxira nusxalar
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = { DATA_DIR };
