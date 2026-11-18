// Mahsulot sharhlari: mijozlar katalogda qoldirgan baho va izohlar. Yashirish / o'chirish / tiklash.
import { ref, reactive, watch, onActivated } from 'vue';
import { get, post, dt, qs, route, toast, go } from '../lib.js';
import { removeWithUndo } from './clients.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export const ReviewsPage = {
  setup() {
    const f = reactive({ status: route.query.status || 'all', product: route.query.product || '', q: '' });
    const data = ref({ rows: [], stats: {} });
    const load = async () => { data.value = await get('/api/reviews' + qs(f), { latest: 'reviews' }); };
    let tmr;
    watch(() => [f.status, f.product], load);
    watch(() => f.q, () => { clearTimeout(tmr); tmr = setTimeout(load, 250); });
    onActivated(load);
    const toggle = async (r) => {
      await post(`/api/reviews/${r.id}/hide`, { hidden: r.hidden ? 0 : 1 });
      toast(r.hidden ? "Sharh katalogda ko'rsatildi" : 'Sharh yashirildi', 'ok');
      load();
    };
    const remove = (r) => removeWithUndo('/api/reviews/' + r.id, `Sharh (${r.product_name})`, load);
    const restore = async (r) => { await post(`/api/reviews/${r.id}/restore`); toast('Tiklandi', 'ok'); load(); };
    return { f, data, toggle, remove, restore, stars, dt, go };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Sharhlar va baholar") }}</h1>
        <div class="small muted">{{ $t("Mijozlar tomonidan tovarlar haqida qoldirilgan fikr-mulohazalar") }}</div>
      </div>
    </div>
    <div class="grid rv-stats mb">
      <div class="card stat"><div class="l">💬 {{ $t("Jami sharhlar") }}</div><div class="v">{{data.stats.total || 0}}</div></div>
      <div class="card stat"><div class="l">⭐ {{ $t("O'rtacha baho") }}</div><div class="v stars-v">★ {{data.stats.avg || '—'}}</div></div>
      <div class="card stat"><div class="l">👁️‍🗨️ {{ $t("Yashirilgan") }}</div><div class="v">{{data.stats.hidden || 0}}</div></div>
    </div>
    <div class="row mb wrap" style="align-items:center;gap:8px">
      <div class="search-big" style="flex:1;min-width:200px"><input v-model="f.q" :placeholder="$t('Mahsulot, mijoz yoki matn...')"></div>
      <div class="chips">
        <button class="chip" :class="{active: f.status==='all'}" @click="f.status='all'">{{ $t("Hammasi") }}</button>
        <button class="chip" :class="{active: f.status==='visible'}" @click="f.status='visible'">{{ $t("Ko'rinadigan") }}</button>
        <button class="chip" :class="{active: f.status==='hidden'}" @click="f.status='hidden'">{{ $t("Yashirilgan") }}</button>
        <button class="chip" :class="{active: f.status==='deleted'}" @click="f.status='deleted'">{{ $t("O'chirilgan") }}</button>
        <button class="chip active" v-if="f.product" @click="f.product=''">{{ $t("Bitta mahsulot") }} ✕</button>
      </div>
    </div>
    <div class="review-list">
      <div class="card review-card" v-for="r in data.rows" :key="r.id" :class="{dim: r.hidden || r.deleted_at}">
        <img v-if="r.product_image" :src="r.product_image" class="prod-thumb">
        <span v-else class="prod-thumb">🧴</span>
        <div class="rc-body">
          <div class="rc-head">
            <a :href="'#/products/' + r.product_id" class="bold">{{r.product_name}} <span class="muted">{{r.product_volume}}</span></a>
            <span class="rc-stars">{{stars(r.rating)}}</span>
          </div>
          <div class="small muted"><a :href="'#/clients/' + r.client_id"><b>{{r.client_name}}</b></a> · 🕒 {{dt(r.created_at)}}
            <span v-if="r.updated_at !== r.created_at"> · {{ $t("tahrirlangan") }}</span>
            <span class="badge gray" v-if="r.hidden">{{ $t("Yashirilgan") }}</span></div>
          <div class="rc-text" v-if="r.text" style="margin-top:4px">{{r.text}}</div>
        </div>
        <div class="rc-actions">
          <template v-if="!r.deleted_at">
            <button class="btn sm" @click="toggle(r)">{{ r.hidden ? $t("Ko'rsatish") : $t("Yashirish") }}</button>
            <button class="btn sm ghost" @click="remove(r)">🗑</button>
          </template>
          <button v-else class="btn sm" @click="restore(r)">↺ {{ $t("Tiklash") }}</button>
        </div>
      </div>
      <div class="empty card" v-if="!data.rows.length">{{ $t("Sharhlar yo'q") }}</div>
    </div>
  </div>`,
};
