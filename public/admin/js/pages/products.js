import { ref, reactive, computed, onMounted, onActivated, onBeforeUnmount } from 'vue';
import { t, translated, i18n, nReviews } from '/i18n/index.js';
import { get, api, post, del, money, dt, go, back, route, clientName, toast, nowLocal, can, qtyFmt, compressImageFile, formatBytes } from '../lib.js';
import { invalidateProducts } from '../components.js';
import { boxOnly, stockLabel, trackStock, fieldOn, settings } from '../docs.js';
import { UNITS, PACK_HINTS, baseName, packName, unitName, isFrac } from '../units.js';
import { industryOf } from '../industries.js';
import { removeWithUndo } from './clients.js';

// Kimlar uchun (katalogda filtr). Tayyor kategoriyalar — soha shablonida (industries.js)
export const AUDIENCE = { men: 'Erkaklar uchun', women: 'Ayollar uchun', unisex: 'Uniseks', kids: 'Bolalar uchun' };

// Kategoriya tanlash: qidiruvli katta ro'yxat (mahsulot soni bilan); yo'q bo'lsa — yozilgani yangi kategoriya bo'ladi
const CategoryInput = {
  props: { modelValue: String, options: Array },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const open = ref(false);
    const hl = ref(-1);
    const text = computed({ get: () => props.modelValue || '', set: (v) => emit('update:modelValue', v) });
    const list = computed(() => {
      const q = text.value.trim().toLowerCase();
      const all = props.options || [];
      // Tanlangan qiymat to'liq mos bo'lsa — hammasini ko'rsatamiz (boshqasiga almashtirish oson bo'lsin)
      if (!q || all.some((o) => o.name.toLowerCase() === q)) return all;
      return all.filter((o) => o.name.toLowerCase().includes(q));
    });
    const isNew = computed(() => text.value.trim() && !(props.options || []).some((o) => o.name.toLowerCase() === text.value.trim().toLowerCase()));
    const pick = (o) => { emit('update:modelValue', o.name); open.value = false; };
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { open.value = true; hl.value = Math.min(hl.value + 1, list.value.length - 1); e.preventDefault(); }
      if (e.key === 'ArrowUp') { hl.value = Math.max(hl.value - 1, 0); e.preventDefault(); }
      if (e.key === 'Enter') { if (open.value && list.value[hl.value]) { pick(list.value[hl.value]); } open.value = false; e.preventDefault(); }
      if (e.key === 'Escape') open.value = false;
    };
    return { open, hl, text, list, isNew, pick, onKey, onBlur: () => setTimeout(() => (open.value = false), 180) };
  },
  template: `
  <div class="ac cat-ac">
    <input v-model="text" @focus="open=true; hl=-1" @input="open=true; hl=0" @blur="onBlur" @keydown="onKey" :placeholder="$t('Kategoriyani tanlang yoki yozing')" autocomplete="off">
    <div class="ac-list cat-list" v-if="open && (list.length || isNew)">
      <div v-if="isNew" class="ac-item" style="color:var(--primary)" @mousedown.prevent="open=false">＋ {{ $t('Yangi kategoriya') }}: <b>{{text.trim()}}</b></div>
      <div v-for="(o,i) in list" :key="o.name" class="ac-item" :class="{hl: i===hl, on: o.name===text}" @mousedown.prevent="pick(o)">
        <span style="flex:1">{{ $t(o.name) }}</span><span class="small muted" v-if="o.n">{{o.n}}</span>
      </div>
    </div>
  </div>`,
};

export const ProductPhotoCameraModal = {
  emits: ['capture', 'close'],
  setup(_props, { emit }) {
    const video = ref(null);
    const err = ref('');
    const busy = ref(false);
    let stream = null;

    onMounted(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (video.value) {
          video.value.srcObject = stream;
          await video.value.play();
        }
      } catch (e) {
        err.value = t("Kamera ochilmadi. Brauzerda kameraga ruxsat berilganligini tekshiring.");
      }
    });

    const stopStream = () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    };

    const close = () => {
      stopStream();
      emit('close');
    };

    const takePhoto = () => {
      if (!video.value || busy.value) return;
      busy.value = true;
      try {
        const v = video.value;
        const w = v.videoWidth || 1280;
        const h = v.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(v, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob) {
            err.value = t("Rasmga olishda xatolik yuz berdi");
            busy.value = false;
            return;
          }
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          stopStream();
          emit('capture', file);
          close();
        }, 'image/jpeg', 0.92);
      } catch (e) {
        err.value = e.message || String(e);
        busy.value = false;
      }
    };

    onBeforeUnmount(() => {
      stopStream();
    });

    return { video, err, busy, close, takePhoto };
  },
  template: `
  <div class="modal-bg cam-modal" @mousedown.self="close">
    <div class="modal" style="max-width:480px">
      <div class="mh">
        <h2>📸 {{ $t('Kamera orqali suratga olish') }}</h2>
        <button class="btn ghost icon" @click="close">✕</button>
      </div>
      <div class="mb">
        <div style="position:relative;background:#000;border-radius:12px;overflow:hidden;min-height:240px;display:flex;align-items:center;justify-content:center">
          <video ref="video" playsinline muted style="width:100%;max-height:55vh;display:block;object-fit:contain"></video>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:75%;height:75%;border:2px dashed rgba(255,255,255,0.7);border-radius:12px;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,0.35)"></div>
        </div>

        <div class="neg small mt" v-if="err" style="text-align:center">{{ err }}</div>

        <div class="row mt" style="justify-content:center;gap:12px">
          <button type="button" class="btn primary" :disabled="busy || !!err" @click="takePhoto" style="padding:10px 24px;font-size:15px;font-weight:600">
            📸 {{ busy ? $t("Tayyorlanmoqda...") : $t("Suratga olish") }}
          </button>
        </div>
      </div>
      <div class="mf" style="justify-content:flex-end">
        <button class="btn ghost" @click="close">{{ $t('Bekor qilish') }}</button>
      </div>
    </div>
  </div>`,
};

export const ProductModal = {
  components: { CategoryInput, ProductPhotoCameraModal },
  props: { product: Object },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const p = props.product || {};
    const f = reactive({
      name: p.name || '',
      code: p.sku || p.barcode || '',
      category: p.category || '',
      box_qty: p.box_qty || 1,
      piece_price: p.piece_price ?? '',
      stock: p.stock ?? '',
      unit: p.unit || 'dona',
      pack_name: p.pack_name || 'karobka',
      in_shop: p.in_shop ?? 1,
      active: p.active ?? 1,
    });
    const colors = ref(Array.isArray(p.colors) ? [...p.colors] : []);
    const newColor = ref('');
    const addColor = () => {
      const parts = String(newColor.value || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
      for (const part of parts) {
        if (!colors.value.includes(part)) colors.value.push(part);
      }
      newColor.value = '';
    };
    const removeColor = (idx) => { colors.value.splice(idx, 1); };
    const onColorKeydown = (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addColor();
      }
    };
    const catOptions = ref([]);
    const file = ref(null);
    const preview = ref(p.image || '');
    const removeImage = ref(false);
    const saving = ref(false);
    const showImgMenu = ref(false);
    const cameraModal = ref(false);
    const optimizing = ref(false);
    const imgInfo = ref('');
    const galleryInput = ref(null);
    const cameraInput = ref(null);
    const scanModal = ref(false);

    const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    const openCamera = () => {
      showImgMenu.value = false;
      if (isMobile()) {
        if (cameraInput.value) cameraInput.value.click();
      } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        cameraModal.value = true;
      } else {
        if (cameraInput.value) cameraInput.value.click();
      }
    };

    const openGallery = () => {
      showImgMenu.value = false;
      if (galleryInput.value) galleryInput.value.click();
    };

    const processSelectedFile = async (rawFile) => {
      if (!rawFile) return;
      optimizing.value = true;
      try {
        const compressed = await compressImageFile(rawFile, 1400, 0.88);
        file.value = compressed;
        preview.value = URL.createObjectURL(compressed);
        removeImage.value = false;
        imgInfo.value = formatBytes(compressed.size);
      } catch (e) {
        file.value = rawFile;
        preview.value = URL.createObjectURL(rawFile);
        removeImage.value = false;
      } finally {
        optimizing.value = false;
      }
    };

    const onFileInput = (e) => {
      const fl = e.target.files && e.target.files[0];
      if (fl) processSelectedFile(fl);
      if (e.target) e.target.value = '';
    };

    const onCameraCapture = (capturedFile) => {
      cameraModal.value = false;
      if (capturedFile) processSelectedFile(capturedFile);
    };

    const clearImage = () => {
      removeImage.value = true;
      file.value = null;
      imgInfo.value = '';
      showImgMenu.value = false;
    };

    const closeDropdown = () => {
      showImgMenu.value = false;
    };
    onMounted(async () => {
      window.addEventListener('click', closeDropdown);
      try {
        catOptions.value = await get('/api/products/categories?full=1');
      } catch {}
    });
    onBeforeUnmount(() => {
      window.removeEventListener('click', closeDropdown);
    });

    const boxQty = computed(() => Math.max(1, +f.box_qty || 1));
    const autoBox = computed(() => (+f.piece_price || 0) * boxQty.value);

    // Ichki shtrix-kod (EAN-13, "2" bilan boshlanadi)
    const genBarcode = () => {
      const d = ('2' + String(Date.now()).slice(-11)).split('').map(Number);
      const sum = d.reduce((a, x, k) => a + x * (k % 2 ? 3 : 1), 0);
      f.code = d.join('') + ((10 - (sum % 10)) % 10);
    };

    const save = async () => {
      if (!f.name || !f.name.trim()) return toast(t('Mahsulot nomini kiriting'), 'error');
      saving.value = true;
      try {
        const fd = new FormData();
        const data = {
          name: f.name.trim(),
          sku: f.code ? String(f.code).trim() : '',
          barcode: f.code ? String(f.code).trim() : '',
          category: f.category ? String(f.category).trim() : '',
          box_qty: boxQty.value,
          piece_price: Math.max(0, parseInt(f.piece_price, 10) || 0),
          box_price: autoBox.value,
          unit: f.unit || 'dona',
          pack_name: f.pack_name || 'karobka',
          in_shop: f.in_shop ?? 1,
          active: f.active ?? 1,
          colors: JSON.stringify(colors.value),
        };
        if (props.product) {
          if (f.stock !== '' && f.stock !== null && f.stock !== undefined) {
            data.set_stock = Number(f.stock) || 0;
          }
        } else {
          if (f.stock !== '' && f.stock !== null && f.stock !== undefined) {
            data.initial_stock = Number(f.stock) || 0;
          }
        }
        for (const [k, v] of Object.entries(data)) fd.append(k, v);
        if (file.value) fd.append('image', file.value);
        if (removeImage.value) fd.append('remove_image', '1');
        const r = props.product ? await api('PUT', '/api/products/' + props.product.id, fd) : await api('POST', '/api/products', fd);
        invalidateProducts();
        toast('Saqlandi', 'ok');
        emit('saved', props.product ? props.product.id : r.id);
      } finally { saving.value = false; }
    };

    return {
      f, preview, removeImage, saving, autoBox, boxQty, genBarcode, save, money, catOptions,
      galleryInput, cameraInput, showImgMenu, cameraModal, optimizing, imgInfo,
      openCamera, openGallery, onFileInput, onCameraCapture, clearImage, scanModal,
      colors, newColor, addColor, removeColor, onColorKeydown,
    };
  },
  template: `
  <modal wide :title="product ? $t('Mahsulotni tahrirlash') : $t('Yangi mahsulot')" @close="$emit('close')">
    <form id="prod-form" class="form-grid c2" @submit.prevent="save">
      <select v-model="f.unit" style="display:none"><option value="dona">dona</option></select>
      <!-- 1. Rasm yuklash (Kamera va Galereya) -->
      <div class="f full">
        <span class="bold" style="display:block;margin-bottom:6px">1. {{ $t('Mahsulot rasmi') }}</span>
        <input ref="galleryInput" type="file" accept="image/*" style="display:none" @change="onFileInput">
        <input ref="cameraInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onFileInput">

        <!-- Rasm mavjud bo'lsa -->
        <div v-if="preview && !removeImage" class="prod-img-zone">
          <div class="prod-img-card">
            <div class="prod-img-thumb">
              <img :src="preview" alt="Mahsulot">
            </div>
            <div style="flex:1">
              <div class="small muted" style="margin-bottom:6px">
                <span v-if="optimizing">⏳ {{ $t('Siqilmoqda...') }}</span>
                <span v-else-if="imgInfo">✓ {{ $t('Tayyor') }} ({{ imgInfo }})</span>
                <span v-else>✓ {{ $t('Mahsulot rasmi yuklangan') }}</span>
              </div>
              <div class="row" style="gap:8px">
                <div class="prod-img-opt-wrap">
                  <button type="button" class="btn sm" @click.stop="showImgMenu = !showImgMenu">
                    🔄 {{ $t('Almashtirish') }} ▾
                  </button>
                  <div v-if="showImgMenu" class="prod-img-dropdown" @click.stop>
                    <button type="button" class="prod-img-opt" @click="openCamera">
                      <span class="opt-ico">📸</span>
                      <div>
                        <div class="opt-title">{{ $t('Kamera') }}</div>
                        <div class="opt-desc">{{ $t('Suratga tushirish') }}</div>
                      </div>
                    </button>
                    <button type="button" class="prod-img-opt" @click="openGallery">
                      <span class="opt-ico">🖼️</span>
                      <div>
                        <div class="opt-title">{{ $t('Galereya') }}</div>
                        <div class="opt-desc">{{ $t('Fayllardan tanlash') }}</div>
                      </div>
                    </button>
                  </div>
                </div>
                <button type="button" class="btn sm red" @click="clearImage">
                  🗑️ {{ $t('Olib tashlash') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Rasm yo'q bo'lsa -->
        <div v-else class="prod-img-zone">
          <div class="row" style="gap:10px;align-items:center">
            <div class="prod-img-opt-wrap">
              <button type="button" class="btn primary sm" @click.stop="showImgMenu = !showImgMenu" style="gap:6px">
                📷 {{ $t('Rasm yuklash') }} ▾
              </button>
              <div v-if="showImgMenu" class="prod-img-dropdown" @click.stop>
                <button type="button" class="prod-img-opt" @click="openCamera">
                  <span class="opt-ico">📸</span>
                  <div>
                    <div class="opt-title">{{ $t('Kamera') }}</div>
                    <div class="opt-desc">{{ $t('Suratga tushirish') }}</div>
                  </div>
                </button>
                <button type="button" class="prod-img-opt" @click="openGallery">
                  <span class="opt-ico">🖼️</span>
                  <div>
                    <div class="opt-title">{{ $t('Galereya') }}</div>
                    <div class="opt-desc">{{ $t('Fayllardan tanlash') }}</div>
                  </div>
                </button>
              </div>
            </div>
            <span class="small muted" v-if="optimizing">⏳ {{ $t('Siqilmoqda...') }}</span>
            <span class="small muted" v-else>{{ $t('Kameradan rasmga oling yoki galereyadan tanlang') }}</span>
          </div>
        </div>
      </div>

      <!-- 2. Nomi -->
      <label class="f full">
        <span class="bold">2. {{ $t('Nomi') }} *</span>
        <input v-model="f.name" autofocus :placeholder="$t('Mahsulot nomi')" required>
      </label>

      <!-- 3. Kategoriya (Istalgan yangisini yozish mumkin) -->
      <label class="f full">
        <span class="bold">3. {{ $t('Kategoriya') }}</span>
        <category-input v-model="f.category" :options="catOptions"/>
      </label>

      <!-- 4. Kodi -->
      <label class="f">
        <span class="bold">4. {{ $t('Kodi') }} (Artikul / Shtrix-kod)</span>
        <div class="row" style="flex-wrap:nowrap;gap:4px">
          <input v-model="f.code" :placeholder="$t('Masalan: 1042')" style="flex:1;min-width:0">
          <button type="button" class="btn sm" @click="scanModal=true" :title="$t('Kamera orqali skanerlash')">📷</button>
          <button type="button" class="btn sm" @click="genBarcode" :title="$t('Avtomatik kod yaratish')">⟳</button>
        </div>
      </label>

      <!-- 5. Karobkada dona -->
      <label class="f">
        <span class="bold">5. {{ $t('Karobkada dona') }}</span>
        <input type="number" min="1" v-model.number="f.box_qty" placeholder="1">
        <span class="small muted" v-if="boxQty > 1">1 karobkada {{boxQty}} dona bo'ladi</span>
      </label>

      <!-- 6. Sotuv narxi -->
      <label class="f">
        <span class="bold">6. {{ $t('Sotuv narxi') }} (dona) *</span>
        <money-input v-model="f.piece_price" placeholder="0"/>
        <div class="calc-box mt" v-if="boxQty > 1" style="margin-top:4px">
          <span class="small muted">{{ $t('Karobka narxi') }}:</span>
          <b>{{money(autoBox)}} {{ $t("so'm") }}</b>
        </div>
      </label>

      <!-- 7. Qoldiq (Tovar astatkasi) -->
      <label class="f">
        <span class="bold">7. {{ product ? $t('Qoldiq (Astatka)') : $t("Boshlang'ich qoldiq (Astatka)") }}</span>
        <input type="number" step="any" min="0" v-model.number="f.stock" placeholder="0">
        <div class="small muted" v-if="f.stock && boxQty > 1" style="margin-top:4px">
          ≈ {{Math.floor(f.stock / boxQty)}} karobka <span v-if="f.stock % boxQty">va {{f.stock % boxQty}} dona</span>
        </div>
      </label>

      <!-- 8. Assortiment (Ranglar, hidlar, turlar) -->
      <div class="f full" style="margin-top:4px">
        <label class="bold" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span>8. ✨ {{ $t("Assortiment (Ranglar, hidlar, turlar)") }}</span>
          <span class="muted small" style="font-weight:normal">{{ $t("Enter yoki vergul bilan qo'shiladi") }}</span>
        </label>
        <div class="row" style="flex-wrap:nowrap;gap:6px">
          <input v-model="newColor" @keydown="onColorKeydown" :placeholder="$t('Masalan: Limonli, Qulupnayli, Qizil 05, Matoviy...')">
          <button type="button" class="btn sm" @click="addColor" style="width:auto;flex-shrink:0;padding:8px 14px">＋ {{ $t("Qo'shish") }}</button>
        </div>
        <div class="chips mt" v-if="colors.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          <span v-for="(c, idx) in colors" :key="c" class="chip active" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:12.5px;background:var(--primary);color:#fff;border-radius:999px">
            {{c}}
            <span role="button" @click.stop="removeColor(idx)" style="cursor:pointer;font-weight:bold;margin-left:4px;padding:0 2px" title="O'chirish">✕</span>
          </span>
        </div>
        <div class="small muted" style="margin-top:4px" v-else>
          {{ $t("Agar tovar bir nechta rang, hid yoki turda bo'lsa — har birini bu yerga yozib qo'shing.") }}
        </div>
      </div>
    </form>
    <barcode-scanner-modal v-if="scanModal" @code="c => { f.code = c; scanModal = false; }" @close="scanModal = false"/>
    <product-photo-camera-modal v-if="cameraModal" @capture="onCameraCapture" @close="cameraModal = false"/>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button>
      <button class="btn primary" form="prod-form" :disabled="saving">{{ $t('Saqlash') }}</button>
    </template>
  </modal>`,
};

// ---------- Excel import (oldindan ko'rish + tasdiqlash) ----------
const ImportModal = {
  emits: ['close', 'done'],
  setup(_p, { emit }) {
    const file = ref(null);
    const preview = ref(null);
    const busy = ref(false);
    const onlyIssues = ref(false);
    const uploadProgress = ref(0);
    const uploadStatus = ref('');

    const uploadFile = (fileObj) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('file', fileObj);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            uploadProgress.value = percent;
            const mbLoaded = (e.loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (e.total / (1024 * 1024)).toFixed(1);
            if (percent < 100) {
              uploadStatus.value = `Yuklanmoqda: ${percent}% (${mbLoaded} MB / ${mbTotal} MB)...`;
            } else {
              uploadStatus.value = "Fayl serverga yuklandi, tahlil qilinmoqda (rasmlar o'qilmoqda)...";
            }
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || 'Server xatosi: ' + xhr.status));
            }
          } catch (e) {
            reject(new Error("Server javobini o'qib bo'lmadi"));
          }
        };

        xhr.onerror = () => reject(new Error("Server bilan aloqa yo'q yoki tarmoq xatosi"));
        xhr.open('POST', '/api/import/products');
        xhr.send(fd);
      });
    };

    const onFile = async (e) => {
      file.value = e.target.files[0] || null;
      preview.value = null;
      uploadProgress.value = 0;
      uploadStatus.value = '';
      if (!file.value) return;
      busy.value = true;
      try {
        preview.value = await uploadFile(file.value);
      } catch (err) {
        toast(err.message || 'Xatolik', 'error');
      } finally {
        busy.value = false;
        uploadStatus.value = '';
      }
    };

    const commit = async () => {
      busy.value = true;
      uploadStatus.value = "Mahsulotlar va rasmlar bazaga saqlanmoqda...";
      try {
        let r;
        if (preview.value && preview.value.token) {
          // Token orqali — 150 MB faylni qayta yuklamaymiz!
          r = await api('POST', '/api/import/products?commit=1', { token: preview.value.token });
        } else {
          const fd = new FormData();
          fd.append('file', file.value);
          r = await api('POST', '/api/import/products?commit=1', fd);
        }
        invalidateProducts();
        toast(`Import tugadi: ${r.created} ta yangi, ${r.updated} ta yangilandi`, 'ok', { duration: 7000 });
        emit('done');
      } catch (err) {
        toast(err.message || 'Xatolik', 'error');
      } finally {
        busy.value = false;
        uploadStatus.value = '';
      }
    };
    const rows = computed(() => (preview.value ? preview.value.rows.filter((r) => !onlyIssues.value || r.action === 'error') : []));
    const ACT = translated({ create: ['Yangi', 'green'], update: ['Yangilanadi', 'blue'], error: ['Xato', 'red'] });
    return { file, preview, busy, onlyIssues, rows, onFile, commit, ACT, money, boxOnly, i18n, uploadProgress, uploadStatus };
  },
  template: `
  <modal :title="$t(&quot;Mahsulotlarni Excel'dan import qilish&quot;)" wide @close="$emit('close')">
    <div class="result-box mb small">
      1) <a :href="'/api/import/products/template?lang=' + i18n.lang">{{ $t('Shablonni yuklab oling') }}</a> ({{ $t('yoki') }} <a :href="'/api/import/products/export?lang=' + i18n.lang">{{ $t('mavjud mahsulotlarni eksport qiling') }}</a> — {{ $t("narxlarni o'zgartirib qayta yuklash uchun") }}).<br>
      {{ $t("2) To'ldiring. Rasmni «Rasm» ustunidagi katakka qo'ying") }}: <b>{{ $t('Insert → Pictures → Place in Cell') }}</b> {{ $t('yoki rasmni shu katak ustiga tashlang') }}.<br>
      {{ $t("3) Faylni tanlang — avval natija ko'rsatiladi, keyin tasdiqlaysiz. Bazada bor mahsulot (nom + hajm yoki artikul bo'yicha") }}) <b>{{ $t('yangilanadi') }}</b>, {{ $t('kirim esa omborga') }} <b>{{ $t("qo'shiladi") }}</b>.
      <div style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border,#cbd5e1);color:var(--text-muted,#64748b)">
        💡 <b>Fayl hajmi va tezlashtirish:</b> Ruxsat etilgan hajm — 250 MB gacha. Agar faylingiz 100–150 MB bo'lsa, tez yuklash uchun Excel'da rasmlarni siqish tavsiya etiladi (Excel → rasm ustiga 2 marta bosing → <b>Picture Format → Compress Pictures → E-mail/Web 96–150 ppi</b>). Bu faylni 5–10 MB ga tushiradi va yuklash bir necha soniyada bajariladi.
      </div>
    </div>
    <input type="file" accept=".xlsx" @change="onFile" :disabled="busy">
    <div v-if="busy" class="mt">
      <div class="muted small" style="margin-bottom:6px">⏳ {{ uploadStatus || $t("O'qilmoqda") + '...' }}</div>
      <div v-if="uploadProgress > 0 && uploadProgress < 100" style="background:var(--border,#e2e8f0);height:8px;border-radius:4px;overflow:hidden;max-width:320px">
        <div :style="{ width: uploadProgress + '%', height: '100%', background: 'var(--primary,#2563eb)', transition: 'width 0.2s' }"></div>
      </div>
    </div>
    <template v-if="preview">
      <div class="row mt">
        <span class="badge green">{{ $t('Yangi') }}: {{preview.summary.create}}</span>
        <span class="badge blue">{{ $t('Yangilanadi') }}: {{preview.summary.update}}</span>
        <span class="badge red" v-if="preview.summary.error">{{ $t('Xato') }}: {{preview.summary.error}}</span>
        <span class="badge gray">📷 {{ $t('Rasmli') }}: {{preview.summary.images}}</span>
        <span class="badge purple" v-if="preview.summary.stock_in && !boxOnly()">{{ $t('Omborga: +') }}{{preview.summary.stock_in}} {{ $t('dona') }}</span>
        <span class="spacer"></span>
        <label class="check small" v-if="preview.summary.error"><input type="checkbox" v-model="onlyIssues"> {{ $t('Faqat xatolar') }}</label>
      </div>
      <div class="table-wrap mt" style="max-height:50vh;overflow:auto">
        <table class="t">
          <thead><tr>
            <th>{{ $t('Qator') }}</th>
            <th>{{ $t('Holat') }}</th>
            <th>📷 {{ $t('Rasm') }}</th>
            <th>{{ $t('Nomi') }}</th>
            <th>{{ $t('Kategoriya') }}</th>
            <th>{{ $t('Kodi') }}</th>
            <th class="num">{{ $t('Karobkada dona') }}</th>
            <th class="num">{{ $t('Sotuv narxi') }}</th>
            <th class="num">{{ $t('Qoldiq') }}</th>
            <th>{{ $t('Izoh') }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.row">
              <td class="muted">{{r.row}}</td>
              <td><span class="badge" :class="ACT[r.action][1]">{{ACT[r.action][0]}}</span></td>
              <td>
                <img v-if="r.has_image && r.image && r.image.path" :src="r.image.path" class="prod-thumb" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:4px">
                <span v-else-if="r.has_image">✅</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="bold">{{r.name}}</td>
              <td><span class="badge gray" v-if="r.category">{{r.category}}</span><span v-else class="muted">—</span></td>
              <td><code>{{r.sku || r.barcode || '—'}}</code></td>
              <td class="num">{{r.box_qty || 1}} {{ $t('dona') }}</td>
              <td class="num bold">{{r.piece_price !== null ? money(r.piece_price) : ''}}</td>
              <td class="num pos">{{r.stock_in ? '+' + r.stock_in : '—'}}</td>
              <td class="small"><span class="neg">{{r.errors.map(e => $t(e)).join('; ')}}</span><span class="amber-t" v-if="r.notes && r.notes.length">{{r.notes.map(e => $t(e)).join('; ')}} </span><span class="muted" v-if="r.changes">{{r.changes.length ? r.changes.map(c => $t(c)).join(', ') : $t("o'zgarish yo'q")}}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template #footer>
      <button class="btn" @click="$emit('close')">{{ $t('Bekor') }}</button>
      <button class="btn primary" :disabled="busy || !preview || !(preview.summary.create + preview.summary.update)" @click="commit">
        ✓ {{ $t('Import qilish (') }}{{preview ? preview.summary.create + preview.summary.update : 0}} {{ $t('ta') }})
      </button>
    </template>
  </modal>`,
};

// Kam qolgan: minimal qoldiq belgilangan va qoldiq shundan oshmaydi
const isLow = (p) => p.min_stock > 0 && p.stock <= p.min_stock && p.stock > 0;
const isOut = (p) => p.stock !== undefined && p.stock !== null && p.stock <= 0;

export const ProductsPage = {
  components: { ProductModal, ImportModal },
  setup() {
    const q = ref(route.query.q || '');
    const category = ref(route.query.category || '');
    const low = ref(route.query.low === '1');
    const stockFilter = ref(route.query.low === '1' ? 'low' : 'all');
    const rows = ref([]);
    const modal = ref(null);
    const importing = ref(false);
    const selected = ref([]);

    const load = async () => {
      rows.value = await get('/api/products');
      if (selected.value.length) {
        const idSet = new Set(rows.value.map((p) => p.id));
        selected.value = selected.value.filter((id) => idSet.has(id));
      }
    };
    onActivated(load);

    const categories = computed(() => {
      const m = new Map();
      for (const p of rows.value) if (p.category) m.set(p.category, (m.get(p.category) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ name: c, count: n }));
    });
    const filtered = computed(() => {
      const t = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      return rows.value.filter((p) => {
        if (category.value && p.category !== category.value) return false;
        if (stockFilter.value === 'out' && !isOut(p)) return false;
        if (stockFilter.value === 'low' && !isLow(p)) return false;
        if (stockFilter.value === 'in' && (isOut(p) || isLow(p))) return false;
        if (low.value && !isLow(p) && !isOut(p)) return false;
        return t.every((x) => `${p.name} ${p.category || ''} ${p.sku} ${p.barcode}`.toLowerCase().includes(x));
      });
    });
    const outCount = computed(() => rows.value.filter(isOut).length);
    const lowCount = computed(() => rows.value.filter(isLow).length);
    const inCount = computed(() => rows.value.filter((p) => !isOut(p) && !isLow(p)).length);

    const isAllSelected = computed(() => filtered.value.length > 0 && filtered.value.every((p) => selected.value.includes(p.id)));
    const isIndeterminate = computed(() => {
      const count = filtered.value.filter((p) => selected.value.includes(p.id)).length;
      return count > 0 && count < filtered.value.length;
    });

    const toggleSelectAll = (e) => {
      if (e.target.checked) {
        const s = new Set(selected.value);
        for (const p of filtered.value) s.add(p.id);
        selected.value = [...s];
      } else {
        const filteredIds = new Set(filtered.value.map((p) => p.id));
        selected.value = selected.value.filter((id) => !filteredIds.has(id));
      }
    };

    const downloadSelected = async () => {
      if (!selected.value.length) return;
      const ids = selected.value;
      if (ids.length <= 150) {
        const a = document.createElement('a');
        a.href = `/api/import/products/export?lang=${i18n.lang}&ids=${ids.join(',')}`;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        try {
          const res = await fetch(`/api/import/products/export?lang=${i18n.lang}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) throw new Error(t("Eksport qilib bo'lmadi"));
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tanlangan_mahsulotlar_${nowLocal().slice(0, 10)}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (e) {
          toast(e.message || t('Eksportda xatolik'), 'error');
        }
      }
    };

    const deleteSelected = async () => {
      if (!selected.value.length) return;
      const count = selected.value.length;
      if (!confirm(`${count} ta tanlangan mahsulot o'chirilsinmi?`)) return;
      const idsToDelete = [...selected.value];
      try {
        const res = await post('/api/products/bulk-delete', { ids: idsToDelete });
        selected.value = [];
        toast(`${res.count || count} ta mahsulot o'chirildi`, '', {
          actionLabel: t('Qaytarish'),
          action: async () => {
            await post('/api/products/bulk-restore', { ids: idsToDelete });
            toast(t('Tiklandi'), 'ok');
            invalidateProducts();
            load();
          },
        });
        invalidateProducts();
        load();
      } catch (e) {
        toast(e.message || t('Xatolik yuz berdi'), 'error');
      }
    };

    return {
      q, category, categories, low, stockFilter, outCount, lowCount, inCount, isOut, rows, modal, importing,
      load, filtered, money, go, i18n, isLow, qtyFmt,
      selected, isAllSelected, isIndeterminate, toggleSelectAll, downloadSelected, deleteSelected,
    };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Mahsulotlar va ombor") }}</h1>
        <div class="small muted">{{ $t("Ombor qoldiqlari, narxlar va tovarlar katalogi") }}</div>
      </div>
      <div class="head-actions" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn green" v-if="$can('products.import')" @click="importing=true">📥 {{ $t("Excel import") }}</button>
        <a class="btn" v-if="$can('products.export')" :href="'/api/import/products/export?lang=' + i18n.lang">📤 {{ $t("Excel eksport") }}</a>
        <a class="btn" href="#/labels">🏷 {{ $t("Etiketkalar") }}</a>
        <button class="btn primary" v-if="$can('products.edit')" @click="modal={}">＋ {{ $t("Yangi mahsulot") }}</button>
      </div>
    </div>

    <!-- KPI Xulosa Kartalari -->
    <div class="grid c4 mb">
      <div class="card stat">
        <div class="l">📦 {{ $t("Jami tovarlar") }}</div>
        <div class="v">{{rows.length}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">🟢 {{ $t("Yetarli (borlar)") }}</div>
        <div class="v pos">{{inCount}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">🟡 {{ $t("Kam qolganlar") }}</div>
        <div class="v" :class="{neg: lowCount > 0}">{{lowCount}} {{ $t("ta") }}</div>
      </div>
      <div class="card stat">
        <div class="l">🔴 {{ $t("Tugagan tovarlar") }}</div>
        <div class="v neg">{{outCount}} {{ $t("ta") }}</div>
      </div>
    </div>

    <div class="row mb" style="align-items:center;gap:8px">
      <div class="search-big" style="flex:1;min-width:220px"><input v-model="q" :placeholder="$t(&quot;Nomi, kategoriya yoki kodi bo'yicha qidirish...&quot;)"></div>
      <select v-model="category" style="width:auto" v-if="categories.length">
        <option value="">{{ $t("Barcha kategoriyalar") }}</option>
        <option v-for="c in categories" :key="c.name" :value="c.name">{{c.name}} ({{c.count}})</option>
      </select>
    </div>

    <!-- Holat bo'yicha filtrlar: Hammasi, 🔴 Tugaganlar, 🟡 Kam qolganlar, 🟢 Borlar -->
    <div class="chips mb" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
      <button class="chip" :class="{active: stockFilter==='all'}" @click="stockFilter='all'">
        {{ $t("Hammasi") }} · {{rows.length}}
      </button>
      <button class="chip" style="color:#dc2626;font-weight:600" :style="stockFilter==='out' ? 'background:#fee2e2;border-color:#ef4444' : 'border-color:#fca5a5'" :class="{active: stockFilter==='out'}" @click="stockFilter='out'">
        🔴 {{ $t("Tugaganlar") }} · {{outCount}}
      </button>
      <button class="chip" style="color:#d97706;font-weight:600" :style="stockFilter==='low' ? 'background:#fef3c7;border-color:#f59e0b' : 'border-color:#fcd34d'" :class="{active: stockFilter==='low'}" @click="stockFilter='low'">
        🟡 {{ $t("Kam qolganlar") }} · {{lowCount}}
      </button>
      <button class="chip" style="color:#16a34a" :style="stockFilter==='in' ? 'background:#dcfce7;border-color:#22c55e' : 'border-color:#86efac'" :class="{active: stockFilter==='in'}" @click="stockFilter='in'">
        🟢 {{ $t("Yetarli (Borlar)") }} · {{inCount}}
      </button>
    </div>

    <!-- Belgilangan mahsulotlar amallar paneli -->
    <div class="card p mb" v-if="selected.length" style="background:#f0fdf4;border:1.5px solid #22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">☑️</span>
        <span style="font-weight:700;color:#166534;font-size:15px">
          {{selected.length}} {{ $t('ta mahsulot tanlandi') }}
        </span>
        <span class="small muted" v-if="selected.length < filtered.length">
          ({{ $t('jami') }} {{filtered.length}} {{ $t('tadan') }})
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn sm green" v-if="$can('products.export')" @click="downloadSelected" style="font-weight:600">
          📥 {{ $t('Tanlanganlarni yuklab olish (Excel)') }}
        </button>
        <a class="btn sm" :href="'#/labels?ids=' + selected.join(',')" style="font-weight:600">
          🏷 {{ $t('Etiketkalar') }}
        </a>
        <button class="btn sm red" v-if="$can('products.delete')" @click="deleteSelected" style="font-weight:600">
          🗑 {{ $t("O'chirish") }} ({{selected.length}})
        </button>
        <button class="btn sm ghost" @click="selected=[]">
          ✕ {{ $t('Bekor qilish') }}
        </button>
      </div>
    </div>

    <div class="card p0">
      <table class="t rt">
        <thead>
          <tr>
            <th style="width:40px;text-align:center" @click.stop>
              <input type="checkbox" :checked="isAllSelected" :indeterminate.prop="isIndeterminate" @change="toggleSelectAll" style="cursor:pointer;width:17px;height:17px;vertical-align:middle" :title="$t('Barchasini tanlash')">
            </th>
            <th style="width:58px;text-align:center">{{ $t('Rasm') }}</th>
            <th>{{ $t('Nomi') }}</th>
            <th>{{ $t('Kodi') }}</th>
            <th class="num">{{ $t('Karobkada dona') }}</th>
            <th class="num">{{ $t('Sotuv narxi') }}</th>
            <th class="num">{{ $t('Qoldiq (Astatka)') }}</th>
            <th style="width:48px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filtered" :key="p.id" class="click" :class="{dim:!p.active, 'row-selected': selected.includes(p.id)}" :style="selected.includes(p.id) ? 'background:#eff6ff' : (isOut(p) ? 'background:#fff5f5' : (isLow(p) ? 'background:#fffbeb' : ''))" @click="go('/products/'+p.id)">
            <td style="width:40px;text-align:center" @click.stop>
              <input type="checkbox" :value="p.id" v-model="selected" style="cursor:pointer;width:17px;height:17px;vertical-align:middle">
            </td>
            <td style="width:58px;text-align:center">
              <img v-if="p.image" :src="p.image" class="prod-thumb" loading="lazy" decoding="async">
              <span v-else class="prod-thumb-empty">📦</span>
            </td>
            <td class="main-cell">
              <div class="bold" style="font-size:14.5px">{{p.name}}</div>
              <div class="small muted" v-if="p.category" style="margin-top:2px">📁 <b>{{p.category}}</b></div>
              <div v-if="p.colors && p.colors.length" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                <span v-for="c in p.colors.slice(0, 3)" :key="c" style="display:inline-block;padding:1px 6px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text)">🎨 {{c}}</span>
                <span v-if="p.colors.length > 3" class="muted small" style="font-weight:600">+{{p.colors.length - 3}}</span>
              </div>
            </td>
            <td>
              <span class="badge gray bold" v-if="p.sku || p.barcode">#{{p.sku || p.barcode}}</span>
              <span class="muted small" v-else>—</span>
            </td>
            <td class="num">
              <b>{{p.box_qty || 1}}</b> <span class="small muted">{{ $t('dona') }}</span>
            </td>
            <td class="num">
              <div class="bold" style="color:var(--primary);font-size:14px">{{money(p.piece_price)}} <span class="small muted">/ dona</span></div>
              <div class="small muted" v-if="p.box_qty > 1">{{money(p.box_price || (p.piece_price * p.box_qty))}} / kar.</div>
            </td>
            <td class="num">
              <div :style="p.stock <= 0 ? 'color:#dc2626;font-weight:bold' : (isLow(p) ? 'color:#d97706;font-weight:bold' : 'font-weight:600')">
                {{p.stock || 0}} {{ $t('dona') }}
                <span class="small muted" v-if="p.box_qty > 1 && p.stock >= p.box_qty"> ({{Math.floor(p.stock / p.box_qty)}} kar.)</span>
              </div>
              <div class="small" v-if="p.stock <= 0"><span class="badge red sm" style="font-weight:bold">⚠️ {{ $t('TUGADI') }}</span></div>
              <div class="small" v-else-if="isLow(p)"><span class="badge amber sm">⚠️ {{ $t('Kam qoldi') }}</span></div>
            </td>
            <td style="text-align:center" @click.stop>
              <button class="btn sm ghost" v-if="$can('products.edit')" @click="modal = { ...p }" :title="$t('Tahrirlash')">✎</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" v-if="!filtered.length">{{ $t("Mahsulot yo'q") }}</div>
    </div>
    <product-modal v-if="modal" :product="modal.id ? modal : null" @close="modal=null" @saved="id => { modal=null; load() }"/>
    <import-modal v-if="importing" @close="importing=false" @done="importing=false; load()"/>
  </div>`,
};

export const ProductView = {
  components: { ProductModal },
  setup() {
    const p = ref(null);
    const edit = ref(false);
    const f = reactive({ unit: 'dona', qty: '', date: nowLocal(), note: '', sign: 1, color: '', cost: '' });
    const sgn = (v) => (v > 0 ? '+' : '');
    const moveLabel = (m) => (p.value.box_qty > 1 && m.qty_pieces % p.value.box_qty === 0
      ? `${sgn(m.qty_pieces)}${m.qty_pieces / p.value.box_qty} ${packName(p.value)}` : `${sgn(m.qty_pieces)}${qtyFmt(m.qty_pieces)} ${baseName(p.value)}`);
    const productId = route.parts[1];
    const load = async () => { p.value = await get('/api/products/' + productId); if (p.value.box_qty > 1 && !f.qty) f.unit = 'karobka'; };
    const margin = computed(() => (p.value && p.value.cost_price > 0 && p.value.piece_price > 0 ? Math.round((p.value.piece_price - p.value.cost_price) / p.value.piece_price * 100) : null));
    onActivated(load);
    const addStock = async () => {
      await post(`/api/products/${p.value.id}/stock`, { ...f, qty: f.sign * f.qty, cost: f.sign > 0 ? f.cost : '' });
      toast(f.sign > 0 ? 'Kirim qilindi' : 'Hisobdan chiqarildi', 'ok');
      f.qty = ''; f.note = ''; f.cost = '';
      invalidateProducts();
      load();
    };
    const removeMove = (m) => removeWithUndo('/api/products/stock/' + m.id, `Ombor harakati (${moveLabel(m)})`, load);
    const remove = () => removeWithUndo('/api/products/' + p.value.id, p.value.name, () => { invalidateProducts(); go('/products'); });

    const newAssortment = ref('');
    const quickSuggestions = ['Qulupnayli', 'Olmali', 'Limonli', 'Shaftolili', 'Qizil', 'Yashil', 'Sariq', 'Oq', 'Qora'];

    const saveAssortmentList = async (updatedList) => {
      try {
        const res = await post('/api/products/' + p.value.id + '/colors', { colors: updatedList });
        p.value.colors = res.colors || updatedList;
        invalidateProducts();
        return true;
      } catch (e) {
        toast(e.message || t('Xatolik yuz berdi'), 'err');
        return false;
      }
    };

    const addAssortment = async () => {
      const val = newAssortment.value.trim();
      if (!val) return;
      const parts = val.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return;
      const current = Array.isArray(p.value.colors) ? [...p.value.colors] : [];
      let addedCount = 0;
      for (const item of parts) {
        if (!current.some((c) => c.toLowerCase() === item.toLowerCase())) {
          current.push(item);
          addedCount++;
        }
      }
      if (!addedCount) {
        toast(t('Bu assortiment allaqachon mavjud'), 'info');
        newAssortment.value = '';
        return;
      }
      const ok = await saveAssortmentList(current);
      if (ok) {
        toast(t("Assortiment qo'shildi"), 'ok');
        newAssortment.value = '';
      }
    };

    const quickAddAssortment = async (name) => {
      if (!name) return;
      const current = Array.isArray(p.value.colors) ? [...p.value.colors] : [];
      if (current.some((c) => c.toLowerCase() === name.toLowerCase())) {
        toast(t('Bu assortiment allaqachon mavjud'), 'info');
        return;
      }
      current.push(name);
      const ok = await saveAssortmentList(current);
      if (ok) {
        toast(name + ' ' + t("qo'shildi"), 'ok');
      }
    };

    const removeAssortment = async (idx) => {
      const current = Array.isArray(p.value.colors) ? [...p.value.colors] : [];
      current.splice(idx, 1);
      const ok = await saveAssortmentList(current);
      if (ok) {
        toast(t("Assortiment o'chirildi"), 'ok');
      }
    };

    return {
      trackStock, AUDIENCE, nReviews, p, edit, f, load, addStock, removeMove, remove,
      money, dt, back, go, clientName, boxOnly, stockLabel, moveLabel, margin, qtyFmt,
      isLow, baseName, packName, unitName, isFrac,
      newAssortment, quickSuggestions, addAssortment, quickAddAssortment, removeAssortment,
    };
  },
  template: `
  <div v-if="p">
    <div class="page-head">
      <a class="back" href="" @click.prevent="back('/products')">←</a>
      <h1>{{p.name}} <span class="muted" style="font-weight:400">{{p.volume}}</span></h1>
      <a class="btn" :href="'#/labels?ids=' + p.id">🏷 {{ $t('Etiketka') }}</a>
      <button class="btn" v-if="$can('products.edit')" @click="edit=true">✎ {{ $t('Tahrirlash') }}</button>
      <button class="btn red" v-if="$can('products.delete')" @click="remove">🗑</button>
    </div>

    <!-- Mahsulot kartochkasi: Rasm, Nomi, Kodi, Karobkada dona, Sotuv narxi, Qoldiq -->
    <div class="card mb prod-view-header-card">
      <div class="prod-view-header">
        <div class="prod-view-img-wrap" @click="$can('products.edit') && (edit=true)" :title="$t('Rasmni tahrirlash')">
          <img v-if="p.image" :src="p.image" :alt="p.name" class="prod-view-img">
          <div v-else class="prod-view-noimg">📦</div>
        </div>
        <div class="prod-view-meta">
          <div class="prod-view-title-row">
            <h2 class="prod-view-title">{{p.name}}</h2>
            <button class="btn sm" v-if="$can('products.edit')" @click="edit=true">✎ {{ $t('Tahrirlash') }}</button>
          </div>
          <div class="prod-view-code">
            <span class="muted">{{ $t('Kodi / Artikul') }}:</span> <b>{{p.sku || p.barcode || '—'}}</b>
          </div>
          <div class="prod-view-badges">
            <span class="badge gray">📦 1 karobkada: {{p.box_qty || 1}} {{ $t('dona') }}</span>
            <span class="badge blue">💰 {{ $t('Sotuv narxi') }}: {{money(p.piece_price)}} {{ $t("so'm") }}</span>
            <span v-if="p.box_qty > 1" class="badge purple">📦 {{ $t('Karobka') }}: {{money(p.box_price || (p.piece_price * p.box_qty))}} {{ $t("so'm") }}</span>
            <span class="badge" :class="p.stock <= 0 ? 'red' : (isLow(p) ? 'amber' : 'green')">
              📊 {{ $t('Qoldiq (Astatka)') }}: {{stockLabel(p.stock || 0, p.box_qty, p)}} ({{qtyFmt(p.stock || 0)}} {{baseName(p)}})
            </span>
          </div>
          <div class="small muted" style="margin-top:6px;display:flex;align-items:center;gap:6px">
            <span>🏪 <b>{{ $t('Yagona ombor') }}:</b> {{ $t("Barcha do'konlar (Do'kon 1, Do'kon 2) ushbu umumiy qoldiqni ko'radi va sotadi.") }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="grid c4 mb">
      <div class="card stat"><div class="l">{{ $t('Omborda') }}</div><div class="v" :style="p.stock <= 0 ? 'color:#dc2626;font-weight:bold' : (isLow(p) ? 'color:#d97706' : '')">{{stockLabel(p.stock || 0, p.box_qty, p)}}</div>
        <div class="s">{{qtyFmt(p.stock || 0)}} {{baseName(p)}}
          <span v-if="p.stock <= 0" class="badge red sm" style="margin-left:6px;font-weight:bold">⚠️ {{ $t('TUGADI') }}</span>
          <span v-else-if="isLow(p)" class="badge amber sm" style="margin-left:6px">⚠ {{ $t('kam qolgan') }}</span>
        </div></div>
      <div class="card stat"><div class="l">{{ $t('Narxi') }} / {{baseName(p)}}</div><div class="v">{{money(p.piece_price)}}</div>
        <div class="s" v-if="p.box_qty > 1">{{packName(p)}} ({{p.box_qty}}): {{money(p.box_price)}}</div></div>
      <div class="card stat" v-if="$can('products.cost')"><div class="l">{{ $t('Tannarx') }} / {{baseName(p)}}</div><div class="v">{{p.cost_price ? money(Math.round(p.cost_price)) : '—'}}</div>
        <div class="s" v-if="margin !== null" :class="margin > 0 ? 'pos' : 'neg'">{{ $t('ustama') }} {{margin}}%</div></div>
      <div class="card stat"><div class="l">{{ $t('Katalogda') }}</div><div class="v">{{p.in_shop && p.active ? $t('Ha') : $t("Yo'q")}}</div>
        <div class="s"><a :href="'#/reviews?product=' + p.id">★ {{p.reviews ? p.rating + ' · ' + nReviews(p.reviews) : $t("Sharhlar yo'q")}}</a></div></div>
    </div>

    <!-- Mahsulot assortimenti (Ranglar, hidlar, mevalar, turlar) -->
    <div class="card mb assort-mgmt-card" style="border:1.5px solid var(--border);border-top:3.5px solid var(--primary);box-shadow:0 2px 8px rgba(0,0,0,0.04)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:6px">
          <span>🎨</span> <b>{{ $t("Mahsulot assortimenti (Ranglar, hidlar, mevalar, turlar)") }}</b>
        </h3>
        <span class="badge blue sm" v-if="p.colors && p.colors.length">{{p.colors.length}} {{ $t("ta tur") }}</span>
      </div>
      <div class="small muted" style="margin-bottom:12px">
        {{ $t("Ushbu mahsulotning barcha variantlari (masalan: Qizil, Yashil, Sariq, Qulupnayli, Olmali, Limonli). Har bir assortiment savatda, kassa POS tizimida, Nakladnoy va KP da alohida tanlab sotiladi.") }}
      </div>

      <!-- Mavjud assortimentlar ro'yxati -->
      <div v-if="p.colors && p.colors.length" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">
        <div v-for="(c, idx) in p.colors" :key="c" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;font-size:13px;font-weight:600">
          <span style="color:var(--primary)">🎨</span> <span>{{c}}</span>
          <button v-if="$can('products.edit')" type="button" @click="removeAssortment(idx)" style="background:transparent;border:0;color:#ef4444;cursor:pointer;font-weight:bold;font-size:13px;padding:0 2px;margin-left:2px" title="O'chirish">✕</button>
        </div>
      </div>
      <div v-else class="small muted" style="margin-bottom:12px;font-style:italic">
        ✨ {{ $t("Ushbu mahsulotda hali assortiment yo'q. Quyidagi maydon orqali qo'shing (masalan: Qizil, Yashil, Sariq yoki Qulupnayli, Olmali).") }}
      </div>

      <!-- Assortiment qo'shish formasi -->
      <form v-if="$can('products.edit')" @submit.prevent="addAssortment" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input type="text" v-model="newAssortment" :placeholder="$t('Yangi assortiment (masalan: Qulupnayli, Olmali, Limonli, Qizil...)')" style="flex:1;min-width:240px;max-width:440px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px">
        <button type="submit" class="btn primary" :disabled="!newAssortment.trim()" style="white-space:nowrap;padding:8px 16px;font-weight:600">
          ＋ {{ $t("Assortiment qo'shish") }}
        </button>
      </form>

      <!-- Tezkor tanlash -->
      <div v-if="$can('products.edit')" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <span class="small muted">{{ $t("Tezkor tanlash") }}:</span>
        <button type="button" v-for="q in quickSuggestions" :key="q" class="chip sm" @click="quickAddAssortment(q)" :disabled="p.colors && p.colors.some((c) => c.toLowerCase() === q.toLowerCase())" style="font-size:11.5px;cursor:pointer">
          + {{q}}
        </button>
      </div>
    </div>
    <div class="card mb" v-if="p.category || p.description || p.size || p.audience || p.barcode || (p.colors && p.colors.length)">
      <div class="small muted" v-if="p.size || p.audience || p.colors.length">
        <span v-if="p.audience">{{ $t(AUDIENCE[p.audience]) }} · </span>
        <span v-if="p.size">{{ $t("O'lcham") }}: <b>{{p.size}}</b></span>
        <span v-if="p.colors.length"><span v-if="p.size"> · </span>{{ $t('Ranglar') }}: <span class="cchip" v-for="c in p.colors" :key="c">{{c}}</span></span>
      </div>
      <div class="small muted" v-if="p.category">{{ $t('Kategoriya') }}: <b>{{ $t(p.category) }}</b><span v-if="p.brand"> · {{ $t('Brend') }}: <b>{{p.brand}}</b></span><span v-if="p.barcode"> · {{ $t('Shtrix-kod') }}: <b>{{p.barcode}}</b></span></div>
      <div v-if="p.description" style="white-space:pre-line;margin-top:6px">{{p.description}}</div>
    </div>
    <div class="card p0 mb" v-if="p.color_stats && p.color_stats.length">
      <div style="padding:14px 16px 0"><h2>{{ $t("Ranglar bo'yicha") }}</h2></div>
      <table class="t rt">
        <thead><tr><th>{{ $t('Rang') }}</th><th class="num" v-if="trackStock()">{{ $t('Kirim (dona)') }}</th><th class="num">{{ $t('Sotilgan (dona)') }}</th><th class="num">{{ $t('Sotuv summasi') }}</th></tr></thead>
        <tbody><tr v-for="c in p.color_stats" :key="c.color">
          <td class="main-cell"><span class="cchip" v-if="c.color">{{c.color}}</span><span v-else class="muted">{{ $t('Rangsiz') }}</span></td>
          <td :data-l="$t('Kirim (dona)')" class="num" v-if="trackStock()">{{c.in}}</td><td :data-l="$t('Sotilgan (dona)')" class="num bold">{{c.sold}}</td><td :data-l="$t('Sotuv summasi')" class="num">{{money(c.sold_sum)}}</td>
        </tr></tbody>
      </table>
    </div>
    <div class="grid" :class="trackStock() ? 'c2' : ''">
      <div class="card" v-if="trackStock()">
        <h2>{{ $t('Ombor harakati') }}</h2>
        <form class="form-grid" v-if="$can('products.stock')" @submit.prevent="addStock">
          <div class="full chips">
            <button type="button" class="chip" :class="{active:f.sign===1}" @click="f.sign=1">＋ {{ $t('Kirim (tovar keldi)') }}</button>
            <button type="button" class="chip" :class="{active:f.sign===-1}" @click="f.sign=-1">− {{ $t('Hisobdan chiqarish') }}</button>
          </div>
          <label class="f"><span>{{ $t('Miqdor') }}</span><input type="number" min="0" :step="isFrac(p) && f.unit==='dona' ? 'any' : 1" v-model.number="f.qty"></label>
          <label class="f"><span>{{ $t('Birlik') }}</span><select v-model="f.unit"><option value="karobka" v-if="p.box_qty > 1">{{packName(p)}} ({{p.box_qty}} {{baseName(p)}})</option><option value="dona">{{baseName(p)}}</option></select></label>
          <label class="f" v-if="f.sign > 0 && $can('products.cost')"><span>{{ $t('Kirim narxi') }} (1 {{unitName(p, f.unit)}})</span><money-input v-model="f.cost" :placeholder="$t('tannarx yangilanadi')"/></label>
          <label class="f" v-if="p.colors.length"><span>{{ $t('Rang') }}</span><select v-model="f.color"><option value="">—</option><option v-for="c in p.colors" :key="c" :value="c">{{c}}</option></select></label>
          <label class="f"><span>{{ $t('Sana') }}</span><input type="datetime-local" v-model="f.date"></label>
          <label class="f"><span>{{ $t('Izoh') }}</span><input v-model="f.note" :placeholder="$t('Yetkazib beruvchi, sabab...')"></label>
          <div class="full right"><button class="btn primary" :disabled="!f.qty">{{ $t('Saqlash') }}</button></div>
        </form>
        <table class="t rt mt">
          <tbody>
            <tr v-for="m in p.moves" :key="m.id">
              <td :data-l="$t('Sana')" class="nowrap small">{{dt(m.date)}}</td>
              <td :data-l="$t('Miqdor')" class="num bold" :class="m.qty_pieces>0?'pos':'neg'">{{moveLabel(m)}}<div v-if="m.color" class="small muted">{{m.color}}</div></td>
              <td :data-l="$t('Izoh')" class="small muted">{{$t(m.note)}} <span v-if="m.user_name">· {{m.user_name}}</span><span v-if="m.cost"> · {{ $t('narxi') }} {{money(Math.round(m.cost))}}</span></td>
              <td data-l="" class="right"><button class="btn sm ghost" v-if="$can('products.stock')" @click="removeMove(m)">🗑</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card p0">
        <div style="padding:14px 16px 0"><h2>{{ $t('Sotuvlar') }}</h2></div>
        <table class="t rt">
          <tbody>
            <tr v-for="s in p.sales" :key="s.id+'-'+s.qty" class="click" @click="go('/sales/'+s.id)">
              <td class="main-cell"><a :href="'#/sales/'+s.id">{{s.number}}</a> · {{clientName(s)}}<span v-if="s.color" class="cchip">{{s.color}}</span><div class="small muted">{{dt(s.date)}}</div></td>
              <td :data-l="$t('Miqdor')" class="nowrap">{{qtyFmt(s.qty)}} {{unitName(p, s.unit)}}</td>
              <td :data-l="$t('Summa')" class="num">{{money(s.total)}}</td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-if="!p.sales.length">{{ $t('Sotilmagan') }}</div>
      </div>
    </div>
    <product-modal v-if="edit" :product="p" @close="edit=false" @saved="edit=false; load()"/>
  </div>`,
};
