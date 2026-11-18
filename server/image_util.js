let sharp = null;
try {
  sharp = require('sharp');
  // Kam xotirali (1 GB RAM / 1 vCPU) serverlarda barqaror ishlashi uchun:
  // - concurrency(1): 1 vCPU da ortiqcha kontekst almashinuvi va parallel xotira sarfini oldini oladi
  // - cache: libvips ichki keshini cheklaymiz, rasm qayta ishlangach xotira darhol bo'shatiladi
  sharp.concurrency(1);
  sharp.cache({ memory: 16, files: 0, items: 30 });
} catch (e) {
  console.warn("[image_util] sharp moduli yuklanmadi, rasmlar siqilmasdan saqlanadi:", e.message);
}
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Rasmni tiniqligini yo'qotmagan holda optimallashtirish (siqish).
 * - Max o'lcham: 1400x1400 (kichik rasmlar cho'zilmaydi — withoutEnlargement: true)
 * - Lanczos3 resampler — eng yuqori aniqlik va tiniqlik
 * - EXIF orientatsiyasi to'g'rilanadi (telefon kamerasida olingan rasm teskari bo'lib qolmaydi)
 * - Sifat: JPEG 85% (mozjpeg, subsampling 4:4:4), PNG (compressionLevel 8), WebP 85%
 * - Rasm formati saqlanadi (PNG -> PNG, JPEG -> JPEG, WebP -> WebP)
 * - Hech qachon xira bo'lmaydi, lekin fayl hajmi sezilarli darajada tejaladi
 */
async function optimizeImageBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return null;
  if (!sharp) return { buffer: buf, ext: 'jpg' };
  try {
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta || !meta.format) {
      return { buffer: buf, ext: 'jpg' };
    }

    // Animatsiyali GIF bo'lsa — o'zicha qoldiramiz
    if (meta.format === 'gif' && meta.pages && meta.pages > 1) {
      return { buffer: buf, ext: 'gif' };
    }

    let pipeline = sharp(buf, { failOn: 'none' })
      .rotate() // EXIF orientatsiyani avtomatik to'g'rilash
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      });

    let ext = 'jpg';
    if (meta.format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 6, adaptiveFiltering: false });
      ext = 'png';
    } else if (meta.format === 'webp') {
      pipeline = pipeline.webp({ quality: 82, effort: 3 });
      ext = 'webp';
    } else if (meta.format === 'gif') {
      pipeline = pipeline.gif();
      ext = 'gif';
    } else {
      pipeline = pipeline.jpeg({ quality: 82, mozjpeg: false, progressive: true });
      ext = 'jpg';
    }

    const optimized = await pipeline.toBuffer();
    return { buffer: optimized, ext };
  } catch (err) {
    // Sharp o'qiy olmasa original holda xavfsiz qaytaramiz
    return { buffer: buf, ext: 'jpg' };
  }
}

/**
 * Rasmni optimallashtirib filial uploads papkasiga saqlaydi
 */
async function saveOptimizedImage(buf, uploadsDir, uploadsUrl, written) {
  const opt = await optimizeImageBuffer(buf);
  const hash = crypto.createHash('sha1').update(opt.buffer).digest('hex').slice(0, 24);
  const filename = hash + '.' + opt.ext;
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, opt.buffer);
    if (written && Array.isArray(written)) written.push(filePath);
  }

  const urlPath = (uploadsUrl.endsWith('/') ? uploadsUrl : uploadsUrl + '/') + filename;
  return { path: urlPath, file: filePath, ext: opt.ext, size: opt.buffer.length };
}

module.exports = {
  optimizeImageBuffer,
  saveOptimizedImage,
};
