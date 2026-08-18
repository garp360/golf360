<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { useScoringStore } from '../../stores/scoring'
import { useGroupsStore } from '../../stores/groups'
import { useFinancialsStore } from '../../stores/financials'

const route = useRoute()
const scoring = useScoringStore()
const groups = useGroupsStore()
const financials = useFinancialsStore()

const loading = ref(true)
const event = ref(null)
const config = ref(null)
const started = ref([])
const notStarted = ref([])
const totalHolesInEvent = ref(0)
const finalizing = ref(false)
const finalizedAt = ref(null)
const payoutByParticipant = ref({})

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

const formatOptions = [
  { value: 'medal_gross', label: 'Medal Gross' },
  { value: 'medal_net', label: 'Medal Net' },
  { value: 'stableford', label: 'Stableford' },
]

const suggestedPlaces = computed(() => {
  const n = started.value.length + notStarted.value.length
  if (n >= 13) return 3
  if (n >= 7) return 2
  return 1
})

const configForm = reactive({ format: 'medal_gross', payout_places: 1, payout_splits: [100] })

function syncSplitsLength() {
  const n = configForm.payout_places
  const current = configForm.payout_splits
  if (current.length === n) return
  if (current.length < n) {
    configForm.payout_splits = [...current, ...Array(n - current.length).fill(0)]
  } else {
    configForm.payout_splits = current.slice(0, n)
  }
}
watch(() => configForm.payout_places, syncSplitsLength)

async function load() {
  loading.value = true
  const { data } = await supabase.from('events').select('*').eq('id', route.params.id).single()
  event.value = data

  config.value = await scoring.fetchScoringConfig(route.params.id)
  if (config.value) {
    configForm.format = config.value.format
    configForm.payout_places = config.value.payout_places
    configForm.payout_splits = [...config.value.payout_splits]

    const standings = await scoring.computeStandings(route.params.id, config.value)
    started.value = standings.started
    notStarted.value = standings.notStarted
    totalHolesInEvent.value = standings.totalHoles

    const { data: results } = await supabase
      .from('scoring_results')
      .select('participant_id, payout_amount')
      .eq('event_id', route.params.id)
    payoutByParticipant.value = Object.fromEntries(
      (results || []).filter((r) => r.payout_amount != null).map((r) => [r.participant_id, r.payout_amount])
    )
  } else {
    configForm.payout_places = suggestedPlaces.value
    configForm.payout_splits = Array(suggestedPlaces.value).fill(Math.round(100 / suggestedPlaces.value))
  }
  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await load()
})

async function handleSaveConfig() {
  await scoring.saveScoringConfig(route.params.id, {
    format: configForm.format,
    payout_places: configForm.payout_places,
    payout_splits: configForm.payout_splits.map(Number),
  })
  await load()
}

async function handleFinalize() {
  finalizing.value = true
  try {
    const eventFinancials = await financials.fetchFinancials(route.params.id)
    let scoringPool = null
    if (eventFinancials) {
      const paidCount = await financials.fetchPaidCount(route.params.id)
      scoringPool = eventFinancials.scoring_pool_per_player * paidCount
    }
    await scoring.finalizeResults(route.params.id, started.value, config.value, scoringPool)
    finalizedAt.value = new Date()
    await load()
  } finally {
    finalizing.value = false
  }
}

function scoreLabel(standing) {
  if (config.value.format === 'stableford') return standing.totalScore
  const diff = standing.totalScore - standing.totalPar
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

function scoreClass(standing) {
  if (config.value.format === 'stableford') return 'points'
  const diff = standing.totalScore - standing.totalPar
  return diff < 0 ? 'score-under' : diff > 0 ? 'score-over' : ''
}

function thruLabel(standing) {
  if (totalHolesInEvent.value && standing.holesPlayed === totalHolesInEvent.value) return 'F'
  return standing.holesPlayed
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="leaderboard-page">
    <RouterLink :to="{ name: 'event-detail', params: { id: route.params.id } }" class="back-link"
      >&larr; {{ event.name }}</RouterLink
    >
    <h1>Leaderboard</h1>

    <div v-if="isAdmin" class="glass config-panel">
      <div class="config-row">
        <div class="field">
          <label>Format</label>
          <select v-model="configForm.format">
            <option v-for="f in formatOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>Payout Places</label>
          <select v-model.number="configForm.payout_places">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
          </select>
        </div>
        <div class="field" v-for="(split, i) in configForm.payout_splits" :key="i">
          <label>Place {{ i + 1 }} %</label>
          <input v-model.number="configForm.payout_splits[i]" type="number" min="0" max="100" class="split-input" />
        </div>
      </div>
      <button class="btn btn-primary" @click="handleSaveConfig">
        {{ config ? 'Update Format' : 'Save Format' }}
      </button>
    </div>

    <div v-if="!config" class="empty-note">Set a scoring format above to start the leaderboard.</div>

    <template v-else>
      <div class="glass leaderboard">
        <div class="leaderboard-head">
          <span>#</span><span>Player</span><span style="text-align: right">Thru</span
          ><span style="text-align: right">{{ config.format === 'stableford' ? 'Pts' : 'Score' }}</span>
        </div>
        <div
          v-for="s in started"
          :key="s.participant.id"
          class="leaderboard-row"
          :class="{ leader: s.rank === 1 }"
        >
          <span class="rank">{{ s.rank }}</span>
          <span class="player">
            <span class="player-name">
              {{ s.participant.user.display_name || s.participant.user.email }}
              <span v-if="payoutByParticipant[s.participant.id]" class="badge badge-skins payout-badge"
                >${{ payoutByParticipant[s.participant.id] }}</span
              >
            </span>
            <span class="player-meta">
              {{ s.participant.course_handicap != null ? `HCP ${s.participant.course_handicap}` : 'No HCP' }} ·
              {{ s.participant.tee_box.name }} tees
            </span>
          </span>
          <span class="stat">{{ thruLabel(s) }}</span>
          <span class="stat" :class="scoreClass(s)">{{ scoreLabel(s) }}</span>
        </div>
      </div>

      <p v-if="notStarted.length" class="empty-note not-started-note">
        Not yet started: {{ notStarted.map((s) => s.participant.user.display_name || s.participant.user.email).join(', ') }}
      </p>

      <button v-if="isAdmin && started.length" class="btn btn-ghost finalize-btn" :disabled="finalizing" @click="handleFinalize">
        {{ finalizing ? 'Finalizing…' : 'Finalize Results' }}
      </button>
      <p v-if="finalizedAt" class="finalized-note">Results saved.</p>
    </template>
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

.config-panel {
  padding: 22px;
  margin-bottom: 28px;
}

.config-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.config-row select {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.split-input {
  width: 70px;
}

.leaderboard-head,
.leaderboard-row {
  grid-template-columns: 44px 1fr 90px 90px;
}

.payout-badge {
  margin-left: 8px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.not-started-note {
  margin-top: 16px;
}

.finalize-btn {
  margin-top: 20px;
}

.finalized-note {
  margin-top: 10px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 12px;
}

@media (max-width: 480px) {
  .leaderboard-head {
    display: none;
  }

  .leaderboard-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    row-gap: 6px;
  }

  .leaderboard-row .player {
    flex: 1 1 160px;
    margin-left: 10px;
  }

  .leaderboard-row .stat {
    flex: 0 0 auto;
    margin-left: 16px;
    text-align: left;
  }
}
</style>
