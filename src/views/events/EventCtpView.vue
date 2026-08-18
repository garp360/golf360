<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { useCtpStore } from '../../stores/ctp'
import { useGroupsStore } from '../../stores/groups'

const route = useRoute()
const ctp = useCtpStore()
const groups = useGroupsStore()

const loading = ref(true)
const event = ref(null)
const par3Holes = ref([])
const ctpHoles = ref([])
const participants = ref([])

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

const designatedHoleIds = computed(() => new Set(ctpHoles.value.map((c) => c.hole_id)))
const addableHoles = computed(() => par3Holes.value.filter((h) => !designatedHoleIds.value.has(h.id)))

const newHoleId = ref('')
const newPrizeAmount = ref('')
const adding = ref(false)

const winnerDrafts = ref({})

async function load() {
  loading.value = true
  const { data } = await supabase.from('events').select('*').eq('id', route.params.id).single()
  event.value = data

  par3Holes.value = await ctp.fetchAvailablePar3Holes(route.params.id)
  ctpHoles.value = await ctp.fetchEventCtpHoles(route.params.id)

  const { data: parts } = await supabase
    .from('event_participants')
    .select('*, user:users(*)')
    .eq('event_id', route.params.id)
    .eq('status', 'registered')
  participants.value = parts
  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await load()
})

async function handleAddHole() {
  if (!newHoleId.value || !newPrizeAmount.value) return
  adding.value = true
  try {
    await ctp.addCtpHole(route.params.id, newHoleId.value, Number(newPrizeAmount.value))
    newHoleId.value = ''
    newPrizeAmount.value = ''
    await load()
  } finally {
    adding.value = false
  }
}

async function handleRemoveHole(id) {
  await ctp.removeCtpHole(id)
  await load()
}

async function handleRecordWinner(ctpHoleId) {
  const winnerId = winnerDrafts.value[ctpHoleId]
  if (!winnerId) return
  await ctp.recordWinner(ctpHoleId, winnerId)
  await load()
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="ctp-page">
    <RouterLink :to="{ name: 'event-detail', params: { id: route.params.id } }" class="back-link"
      >&larr; {{ event.name }}</RouterLink
    >
    <h1>Closest to the Pin</h1>

    <div v-if="isAdmin && addableHoles.length" class="glass add-form">
      <div class="field">
        <label>Par-3 Hole</label>
        <select v-model="newHoleId">
          <option value="" disabled>Select hole…</option>
          <option v-for="h in addableHoles" :key="h.id" :value="h.id">Hole {{ h.hole_number }}</option>
        </select>
      </div>
      <div class="field mono">
        <label>Prize ($)</label>
        <input v-model="newPrizeAmount" type="number" min="0" class="prize-input" />
      </div>
      <button class="btn btn-primary" :disabled="adding || !newHoleId || !newPrizeAmount" @click="handleAddHole">
        Add
      </button>
    </div>
    <p v-if="isAdmin && !addableHoles.length && !ctpHoles.length" class="empty-note">
      No par-3 holes found on this event's course(s) yet.
    </p>

    <div v-if="ctpHoles.length" class="cards-grid ctp-grid">
      <div v-for="c in ctpHoles" :key="c.id" class="glass stat-card ctp-card">
        <div class="label">Hole {{ c.hole.hole_number }}</div>
        <div class="value gold">${{ c.prize_amount }}</div>

        <div v-if="c.result" class="winner-line">
          Winner: <strong>{{ c.result.winner.user.display_name || c.result.winner.user.email }}</strong>
        </div>
        <div v-else-if="isAdmin" class="record-form">
          <select v-model="winnerDrafts[c.id]">
            <option value="" disabled selected>Select winner…</option>
            <option v-for="p in participants" :key="p.id" :value="p.id">
              {{ p.user.display_name || p.user.email }}
            </option>
          </select>
          <button class="btn btn-ghost" @click="handleRecordWinner(c.id)">Record</button>
        </div>
        <div v-else class="winner-line">Not yet recorded</div>

        <button v-if="isAdmin && !c.result" class="btn btn-danger remove-btn" @click="handleRemoveHole(c.id)">
          Remove
        </button>
      </div>
    </div>
    <p v-else class="empty-note">No CTP holes designated for this event yet.</p>
  </div>
</template>

<style scoped>
.loading-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 13px;
}

.back-link {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
  text-decoration: none;
  display: inline-block;
  margin-bottom: 20px;
}

h1 {
  font-size: 26px;
  margin-bottom: 24px;
}

.add-form {
  padding: 22px;
  display: flex;
  gap: 14px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 28px;
}

.add-form select {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.prize-input {
  width: 100px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.ctp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.winner-line {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-dim);
}

.record-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.record-form select {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  flex: 1;
}

.remove-btn {
  align-self: flex-start;
  margin-top: 4px;
}
</style>
