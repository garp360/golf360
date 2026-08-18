<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useHandicapStore } from '../../stores/handicap'

const route = useRoute()
const handicap = useHandicapStore()

const loading = ref(true)
const round = ref(null)
const holes = ref([])
const participants = ref([])
const selectedParticipantId = ref('')

const scoresByHole = reactive({})
const saving = ref(false)
const lastResult = ref(null)

const selectedParticipant = computed(() => participants.value.find((p) => p.id === selectedParticipantId.value))

async function load() {
  loading.value = true
  const ctx = await handicap.fetchRoundContext(route.params.id)
  round.value = ctx.round
  holes.value = ctx.holes
  participants.value = ctx.participants
  if (!selectedParticipantId.value && participants.value.length) {
    selectedParticipantId.value = participants.value[0].id
  }
  loading.value = false
}

async function loadScoresForParticipant() {
  if (!selectedParticipant.value) return
  const existing = await handicap.fetchScores(round.value.id, selectedParticipant.value.id)
  const byHoleId = Object.fromEntries(existing.map((s) => [s.hole_id, s.gross_strokes]))
  holes.value.forEach((h) => {
    scoresByHole[h.id] = byHoleId[h.id] ?? null
  })
  lastResult.value = null
}

watch(selectedParticipantId, loadScoresForParticipant)

onMounted(async () => {
  await load()
  await loadScoresForParticipant()
})

function scoreClass(hole) {
  const score = scoresByHole[hole.id]
  if (score == null) return ''
  if (score < hole.par) return 'birdie'
  if (score > hole.par) return 'bogey'
  return 'par'
}

const allHolesEntered = computed(() => holes.value.every((h) => scoresByHole[h.id] != null))
const total = computed(() => holes.value.reduce((sum, h) => sum + (scoresByHole[h.id] || 0), 0))

async function handleSave() {
  if (!allHolesEntered.value || !selectedParticipant.value) return
  saving.value = true
  try {
    const holeScores = holes.value.map((h) => ({ hole: h, grossStrokes: scoresByHole[h.id] }))
    await handicap.saveRoundScores(round.value, selectedParticipant.value, holeScores)
    const snapshot = await handicap.fetchLatestHandicapSnapshot(selectedParticipant.value.user_id)
    lastResult.value = snapshot
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="round-score">
    <h1>{{ round.event_course.course.name }} — Round {{ round.round_number }}</h1>
    <p class="description">{{ round.round_date }}</p>

    <div class="field participant-select">
      <label>Player</label>
      <select v-model="selectedParticipantId">
        <option v-for="p in participants" :key="p.id" :value="p.id">
          {{ p.user.display_name || p.user.email }}
        </option>
      </select>
    </div>

    <div v-if="selectedParticipant" class="glass scorecard">
      <div class="scorecard-title-row">
        <div>
          <div class="scorecard-title">{{ selectedParticipant.user.display_name || selectedParticipant.user.email }}</div>
          <div class="scorecard-sub">{{ selectedParticipant.tee_box.name }} tees</div>
        </div>
        <span class="tee-pill">
          {{ selectedParticipant.course_handicap != null ? `HCP ${selectedParticipant.course_handicap}` : 'No handicap yet' }}
        </span>
      </div>

      <table class="holes">
        <tr>
          <th>Hole</th>
          <th v-for="h in holes" :key="h.id">{{ h.hole_number }}</th>
          <th>Total</th>
        </tr>
        <tr>
          <td>Par</td>
          <td v-for="h in holes" :key="h.id">{{ h.par }}</td>
          <td>{{ holes.reduce((s, h) => s + h.par, 0) }}</td>
        </tr>
        <tr>
          <td>SI</td>
          <td v-for="h in holes" :key="h.id">{{ h.stroke_index }}</td>
          <td></td>
        </tr>
        <tr>
          <td>Score</td>
          <td v-for="h in holes" :key="h.id">
            <span class="score-cell" :class="scoreClass(h)">
              <input
                v-model.number="scoresByHole[h.id]"
                type="number"
                min="1"
                max="15"
                class="score-input"
              />
            </span>
          </td>
          <td>{{ total || '' }}</td>
        </tr>
      </table>
    </div>

    <button class="btn btn-primary save-btn" :disabled="!allHolesEntered || saving" @click="handleSave">
      {{ saving ? 'Saving…' : 'Save Round' }}
    </button>

    <div v-if="lastResult" class="glass result-panel">
      <div class="label">Updated Handicap Index</div>
      <div class="value" :class="lastResult.rounds_used >= 3 ? 'green' : ''">
        {{ lastResult.handicap_index }}
      </div>
      <p v-if="lastResult.rounds_used < 3" class="provisional-note">
        Provisional — based on {{ lastResult.rounds_used }} round{{ lastResult.rounds_used === 1 ? '' : 's' }}.
        Official once 3+ rounds are posted.
      </p>
    </div>
  </div>
</template>

<style scoped>
.loading-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 13px;
}

h1 {
  font-size: 24px;
  margin-bottom: 6px;
}

.description {
  color: var(--ink-dim);
  font-size: 14px;
  margin-bottom: 24px;
}

.participant-select {
  max-width: 280px;
  margin-bottom: 20px;
}

.participant-select select {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.score-input {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  text-align: center;
  color: inherit;
  font-family: var(--font-mono);
  font-size: 13px;
}

.score-input:focus {
  outline: none;
}

.save-btn {
  margin-top: 20px;
}

.result-panel {
  margin-top: 24px;
  padding: 22px;
  max-width: 280px;
}

.result-panel .label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.result-panel .value {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
}

.result-panel .value.green {
  color: var(--green);
}

.provisional-note {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 8px;
}
</style>
