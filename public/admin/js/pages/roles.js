import { ref, computed, onActivated } from 'vue';
import { get, post, put, del, session, toast, t } from '../lib.js';

// Rollar va ruxsatlar: rol qo'lda yaratiladi, har bir ruxsat alohida yoqiladi.
// Server bilan bir xil qoida: o'zida yo'q ruxsatni rolga berib bo'lmaydi, o'z rolini va Administrator rolini o'zgartirib bo'lmaydi.
export const RolesPage = {
  setup() {
    const roles = ref([]);
    const groups = ref([]);
    const presets = ref([]);
    const tab = ref('cards');
    const modal = ref(null);
    const busy = ref(false);

    const load = async () => {
      const [r, p] = await Promise.all([get('/api/auth/roles'), groups.value.length ? null : get('/api/auth/perms')]);
      roles.value = r;
      if (p) { groups.value = p.groups; presets.value = p.presets; }
    };
    onActivated(load);

    const mine = () => session.user.perms;
    const have = (p) => mine().has('*') || mine().has(p);
    const editable = (r) => !r.is_system && r.id !== session.user.role_id && r.perms.every(have);
    const lockReason = (r) => (r.is_system ? "Tizim roli — barcha ruxsatlar, o'zgartirilmaydi"
      : r.id === session.user.role_id ? "Bu sizning rolingiz — uni boshqa admin o'zgartiradi"
        : !r.perms.every(have) ? "Bu rolda sizda yo'q ruxsatlar bor" : '');
    const total = computed(() => groups.value.reduce((a, g) => a + g.perms.length, 0));
    const label = (key) => { for (const g of groups.value) for (const p of g.perms) if (p.key === key) return p.label; return key; };

    const open = (r) => {
      modal.value = r
        ? { id: r.id, name: r.name, perms: new Set(r.is_system ? groups.value.flatMap((g) => g.perms.map((p) => p.key)) : r.perms), readonly: !editable(r), reason: lockReason(r), users: r.users }
        : { id: 0, name: '', perms: new Set(), readonly: false, reason: '', users: 0 };
    };
    const toggle = (key) => {
      const m = modal.value;
      if (m.readonly || !have(key)) return;
      if (m.perms.has(key)) m.perms.delete(key); else m.perms.add(key);
      m.perms = new Set(m.perms);   // reaktivlik uchun
    };
    const groupState = (g) => {
      const n = g.perms.filter((p) => modal.value.perms.has(p.key)).length;
      return n === 0 ? 'none' : n === g.perms.length ? 'all' : 'some';
    };
    const toggleGroup = (g) => {
      const m = modal.value;
      if (m.readonly) return;
      const on = groupState(g) !== 'all';
      for (const p of g.perms) if (have(p.key)) { if (on) m.perms.add(p.key); else m.perms.delete(p.key); }
      m.perms = new Set(m.perms);
    };
    const applyPreset = (p) => {
      const m = modal.value;
      m.perms = new Set(p.perms.filter(have));
      if (!m.name) m.name = t(p.name);
      if (p.perms.some((x) => !have(x))) toast("Shablondagi ba'zi ruxsatlar sizda yo'q — ular qo'shilmadi");
    };

    const save = async () => {
      const m = modal.value;
      busy.value = true;
      try {
        const body = { name: m.name, perms: [...m.perms] };
        if (m.id) await put('/api/auth/roles/' + m.id, body); else await post('/api/auth/roles', body);
        toast(m.id ? 'Saqlandi. Bu roldagi xodimlarga darhol kuchga kiradi' : 'Rol yaratildi. Endi uni xodimga biriktiring', 'ok', { duration: 6000 });
        modal.value = null;
        load();
      } finally { busy.value = false; }
    };
    const remove = async () => {
      const m = modal.value;
      if (!confirm(t(`"${m.name}" rolini o'chirasizmi?`))) return;
      await del('/api/auth/roles/' + m.id);
      toast("Rol o'chirildi", 'ok');
      modal.value = null;
      load();
    };
    const copy = (r) => {
      open(null);
      modal.value.name = t(r.name) + ' (' + t('nusxa') + ')';
      modal.value.perms = new Set((r.is_system ? groups.value.flatMap((g) => g.perms.map((p) => p.key)) : r.perms).filter(have));
    };
    const permsOf = (r) => (r.is_system ? null : new Set(r.perms));

    return { roles, groups, presets, tab, modal, busy, total, open, toggle, groupState, toggleGroup, applyPreset, save, remove, copy, have, editable, lockReason, label, permsOf, session };
  },
  template: `
  <div>
    <div class="page-head">
      <div>
        <h1>{{ $t("Rollar va ruxsatlar") }}</h1>
        <div class="small muted">{{ $t("Foydalanuvchi rollari, ruxsatlar chegarasi va xavfsizlik nazorati") }}</div>
      </div>
      <button class="btn primary" @click="open(null)">＋ {{ $t("Yangi rol") }}</button>
    </div>
    <div class="tabs">
      <button :class="{active: tab==='cards'}" @click="tab='cards'">{{ $t("Rollar") }}</button>
      <button :class="{active: tab==='matrix'}" @click="tab='matrix'">{{ $t("Solishtirish jadvali") }}</button>
    </div>
    <p class="muted small mb">{{ $t("Har bir xodimga bitta rol biriktiriladi. Rol — bu ruxsatlar to'plami: qaysi bo'limni ko'radi va qaysi amalni bajara oladi. Rol o'zgartirilsa, shu roldagi barcha xodimlarga darhol kuchga kiradi.") }}</p>

    <div v-if="tab==='cards'" class="role-grid">
      <div v-for="r in roles" :key="r.id" class="card role-card" :class="{system: r.is_system}" @click="open(r)">
        <div class="rc-head">
          <div class="rc-ico">{{ r.is_system ? '👑' : '🛡' }}</div>
          <div style="flex:1;min-width:0">
            <div class="bold">{{ $t(r.name) }}</div>
            <div class="small muted">{{ r.users }} {{ $t("ta xodim") }}<span v-if="r.users !== r.active_users"> ({{ r.active_users }} {{ $t("faol") }})</span></div>
          </div>
          <span class="badge purple" v-if="r.is_system">{{ $t("tizim") }}</span>
          <span class="badge gray" v-else-if="r.id === session.user.role_id">{{ $t("sizning rolingiz") }}</span>
        </div>
        <div class="rc-bar"><div :style="{width: (r.is_system ? 100 : Math.round(r.perms.length / total * 100)) + '%'}"></div></div>
        <div class="small muted">{{ r.is_system ? $t("Barcha ruxsatlar") : r.perms.length + ' / ' + total + ' ' + $t("ruxsat") }}</div>
        <div class="rc-tags" v-if="!r.is_system">
          <span v-for="g in groups" :key="g.key" class="tag" :class="{off: !g.perms.some((p) => r.perms.includes(p.key))}">{{ $t(g.label) }}</span>
        </div>
        <div class="rc-actions" @click.stop>
          <button class="btn sm" @click="open(r)">{{ editable(r) ? '✎ ' + $t("Tahrirlash") : '👁 ' + $t("Ko'rish") }}</button>
          <button class="btn sm ghost" @click="copy(r)" :title="$t('Nusxa olish')">⧉ {{ $t("Nusxa") }}</button>
        </div>
      </div>
    </div>

    <div v-else class="card p0 matrix-wrap">
      <table class="t matrix">
        <thead><tr><th>{{ $t('Ruxsat') }}</th><th v-for="r in roles" :key="r.id" class="c">{{ $t(r.name) }}</th></tr></thead>
        <tbody>
          <template v-for="g in groups" :key="g.key">
            <tr class="grp"><td :colspan="roles.length + 1">{{ $t(g.label) }}</td></tr>
            <tr v-for="p in g.perms" :key="p.key">
              <td>{{ $t(p.label) }}</td>
              <td v-for="r in roles" :key="r.id" class="c"><span v-if="r.is_system || r.perms.includes(p.key)" class="yes">✓</span><span v-else class="no">—</span></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <modal v-if="modal" wide :title="modal.id ? (modal.readonly ? $t('Rol') : $t('Rolni tahrirlash')) : $t('Yangi rol')" @close="modal=null">
      <div class="warn-box mb" v-if="modal.readonly">🔒 {{ $t(modal.reason) }}</div>
      <form id="role-form" @submit.prevent="save">
        <label class="f"><span>{{ $t('Rol nomi') }}</span><input v-model="modal.name" :disabled="modal.readonly" required maxlength="60" :placeholder="$t('masalan: Katta kassir')" autofocus></label>
        <div class="row mt" v-if="!modal.readonly">
          <span class="small muted">{{ $t('Shablondan:') }}</span>
          <button type="button" v-for="p in presets" :key="p.name" class="chip" @click="applyPreset(p)">{{ $t(p.name) }}</button>
          <button type="button" class="chip" @click="modal.perms = new Set()">{{ $t('Tozalash') }}</button>
        </div>
        <div class="small muted mt">{{ $t('Tanlangan') }}: <b>{{ modal.perms.size }}</b> / {{ total }}</div>
        <div class="perm-groups">
          <div v-for="g in groups" :key="g.key" class="perm-group">
            <label class="pg-head" :class="{dis: modal.readonly}">
              <input type="checkbox" :checked="groupState(g)==='all'" :indeterminate.prop="groupState(g)==='some'" :disabled="modal.readonly" @change="toggleGroup(g)">
              <b>{{ $t(g.label) }}</b>
            </label>
            <label v-for="p in g.perms" :key="p.key" class="check perm" :class="{dis: modal.readonly || !have(p.key)}" :title="!have(p.key) ? $t(&quot;Bu ruxsat sizda yo'q&quot;) : ''">
              <input type="checkbox" :checked="modal.perms.has(p.key)" :disabled="modal.readonly || !have(p.key)" @change="toggle(p.key)">
              <span>{{ $t(p.label) }}</span>
            </label>
          </div>
        </div>
      </form>
      <template #footer>
        <button v-if="modal.id && !modal.readonly" class="btn red" style="margin-right:auto" @click="remove" :disabled="modal.users > 0" :title="modal.users ? $t(&quot;Avval xodimlarni boshqa rolga o'tkazing&quot;) : ''">🗑 {{ $t("O'chirish") }}</button>
        <button class="btn" @click="modal=null">{{ modal.readonly ? $t('Yopish') : $t('Bekor') }}</button>
        <button v-if="!modal.readonly" class="btn primary" form="role-form" :disabled="busy">{{ $t('Saqlash') }}</button>
      </template>
    </modal>
  </div>`,
};
