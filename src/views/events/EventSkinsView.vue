<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { useSkinsStore } from '../../stores/skins'
import { useGroupsStore } from '../../stores/groups'

const route = useRoute()
const skins = useSkinsStore()
const groups = useGroupsStore()

const loading = ref(true)
const event = ref(null)
const config = ref(null)
const carryover = ref(null)
const holeResults = ref([])
const skinsWonCount = ref(0)
const finalizing = ref(false)
const finalizeSummary = ref(null)

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

const configForm = reactive({ enabled: false, mode: 'gross', win_condition: 'any', pool_amount: 0 })

const modeOptions = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'both', label: 'Both (gross first)' },
]
const winConditionOptions = [
  { value: 'any', label: 'Any' },
  { value: 'birdie_or_better', label: 'Birdie or better' },
]

const carriedAmount = computed(() => Number(carryover.value?.carried_amount ?? 0))
const effectivePot = computed(() => Number(configForm.pool_amount || 0) + carriedAmount.value)
const payoutPerSkin = computed(() => (skinsWonCount.value ? Math.round(effectivePot.value / skinsWonCount.value) : 0))

async function load() {
  loading.value = true
  const { data } = await supabase.from('events').select('*').eq('id', route.params.id).single()
  event.value = data

  carryover.value = await skins.fetchCarryover(event.value.group_id)
  config.value = await skins.fetchSkinsConfig(route.params.id)

  if (config.value) {
    configForm.enabled = config.value.enabled
    configForm.mode = config.value.mode
    configForm.win_condition = config.value.win_condition
    configForm.pool_amount = config.value.pool_amount

    if (config.value.enabled) {
      const results = await skins.computeResults(route.params.id, config.value)
      holeResults.value = results.holeResults
      skinsWonCount.value = results.skinsWonCount
    }
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
  await skins.saveSkinsConfig(route.params.id, {
    enabled: configForm.enabled,
    mode: configForm.mode,
    win_condition: configForm.win_condition,
    pool_amount: Number(configForm.pool_amount),
  })
  finalizeSummary.value = null
  await load()
}

async function handleFinalize() {
  finalizing.value = true
  try {
    const summary = await skins.finalizeSkins(route.params.id, event.value.group_id, config.value, holeResults.value)
    finalizeSummary.value = summary
    carryover.value = await skins.fetchCarryover(event.value.group_id)
  } finally {
    finalizing.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="skins-page">
    <RouterLink :to="{ name: 'event-detail', params: { id: route.params.id } }" class="back-link"
      >&larr; {{ event.name }}</RouterLink
    >
    <h1>Skins</h1>

    <div v-if="isAdmin" class="glass config-panel">
      <div class="config-row">
        <label class="checkbox-field">
          <input type="checkbox" v-model="configForm.enabled" />
          Enabled
        </label>
        <div class="field">
          <label>Mode</label>
          <select v-model="configForm.mode">
            <option v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>Win Condition</label>
          <select v-model="configForm.win_condition">
            <option v-for="w in winConditionOptions" :key="w.value" :value="w.value">{{ w.label }}</option>
          </select>
        </div>
        <div class="field mono">
          <label>Pool Amount ($)</label>
          <input v-model.number="configForm.pool_amount" type="number" min="0" class="pool-input" />
        </div>
      </div>
      <button class="btn btn-primary" @click="handleSaveConfig">Save Config</button>
    </div>

    <div v-if="!config || !config.enabled" class="empty-note">Skins isn't enabled for this event yet.</div>

    <template v-else>
      <div class="cards-grid summary-cards">
        <div class="glass stat-card">
          <div class="label">Skins Won</div>
          <div class="value">{{ skinsWonCount }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">Effective Pot</div>
          <div class="value gold">${{ effectivePot }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">Payout / Skin</div>
          <div class="value gold">${{ payoutPerSkin }}</div>
        </div>
      </div>
      <p v-if="carriedAmount > 0" class="carryover-note">
        Includes ${{ carriedAmount }} carried over from a previous event with zero skins won.
      </p>

      <div class="glass hole-list">
        <div v-for="r in holeResults" :key="r.hole.id" class="hole-row">
          <span class="hole-number">Hole {{ r.hole.hole_number }}</span>
          <span v-if="r.winningType !== 'none'" class="hole-winner">
            {{ r.winnerName }}
            <span class="badge badge-skins">{{ r.winningType }}</span>
          </span>
          <span v-else class="hole-none">No qualifying winner</span>
        </div>
      </div>

      <button v-if="isAdmin && holeResults.length" class="btn btn-ghost finalize-btn" :disabled="finalizing" @click="handleFinalize">
        {{ finalizing ? 'Finalizing…' : 'Finalize Skins' }}
      </button>
      <p v-if="finalizeSummary" class="finalized-note">
        Saved — {{ finalizeSummary.skinsWonCount }} skin(s) won
        <template v-if="finalizeSummary.skinsWonCount">at ${{ finalizeSummary.payoutPerSkin }} each.</template>
        <template v-else>· ${{ finalizeSummary.effectivePot }} carried to the next event.</template>
      </p>
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
  align-items: flex-end;
  margin-bottom: 16px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-dim);
  padding-bottom: 10px;
}

.config-row select,
.pool-input {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.pool-input {
  width: 110px;
  font-family: var(--font-mono);
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.summary-cards {
  margin-bottom: 12px;
}

.carryover-note {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--gold);
  margin-bottom: 20px;
}

.hole-list {
  padding: 6px;
}

.hole-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  font-family: var(--font-body);
  font-size: 14px;
}

.hole-row + .hole-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.hole-number {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
}

.hole-winner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-weight: 600;
}

.hole-none {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
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
</style>
