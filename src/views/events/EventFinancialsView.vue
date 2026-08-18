<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { useFinancialsStore } from '../../stores/financials'
import { useGroupsStore } from '../../stores/groups'

const route = useRoute()
const financials = useFinancialsStore()
const groups = useGroupsStore()

const loading = ref(true)
const event = ref(null)
const config = ref(null)
const paidCount = ref(0)
const hasSkinsConfig = ref(false)
const syncing = ref(false)
const syncedNote = ref(false)

const scoringPayouts = ref([])
const skinsPayouts = ref([])
const ctpPrizes = ref([])

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

const form = reactive({
  entry_fee: 0,
  scoring_pool_per_player: 0,
  skins_pool_per_player: 0,
  ctp_pool_per_player: 0,
})

const totalCollected = computed(() => form.entry_fee * paidCount.value)
const scoringPool = computed(() => form.scoring_pool_per_player * paidCount.value)
const skinsPool = computed(() => form.skins_pool_per_player * paidCount.value)
const ctpPoolInfo = computed(() => form.ctp_pool_per_player * paidCount.value)

async function load() {
  loading.value = true
  const { data } = await supabase.from('events').select('*').eq('id', route.params.id).single()
  event.value = data

  paidCount.value = await financials.fetchPaidCount(route.params.id)
  config.value = await financials.fetchFinancials(route.params.id)
  if (config.value) {
    form.entry_fee = config.value.entry_fee
    form.scoring_pool_per_player = config.value.scoring_pool_per_player
    form.skins_pool_per_player = config.value.skins_pool_per_player
    form.ctp_pool_per_player = config.value.ctp_pool_per_player
  }

  const { data: skinsConfig } = await supabase
    .from('event_skins_configs')
    .select('id')
    .eq('event_id', route.params.id)
    .maybeSingle()
  hasSkinsConfig.value = !!skinsConfig

  const { data: scoringResults } = await supabase
    .from('scoring_results')
    .select('rank, payout_amount, participant:event_participants(user:users(*))')
    .eq('event_id', route.params.id)
    .not('payout_amount', 'is', null)
    .order('rank')
  scoringPayouts.value = scoringResults || []

  const { data: skinsResults } = await supabase
    .from('skins_results')
    .select('payout_amount, hole:holes(hole_number), winner:event_participants(user:users(*))')
    .eq('event_id', route.params.id)
    .not('payout_amount', 'is', null)
    .order('hole_id')
  skinsPayouts.value = skinsResults || []

  const { data: ctpResults } = await supabase
    .from('event_ctp_holes')
    .select('prize_amount, hole:holes(hole_number), result:ctp_results(winner:event_participants(user:users(*)))')
    .eq('event_id', route.params.id)
  ctpPrizes.value = ctpResults || []

  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await load()
})

async function handleSave() {
  await financials.saveFinancials(route.params.id, {
    entry_fee: Number(form.entry_fee),
    scoring_pool_per_player: Number(form.scoring_pool_per_player),
    skins_pool_per_player: Number(form.skins_pool_per_player),
    ctp_pool_per_player: Number(form.ctp_pool_per_player),
  })
  syncedNote.value = false
  await load()
}

async function handleSyncSkinsPool() {
  syncing.value = true
  try {
    await financials.syncSkinsPool(route.params.id, skinsPool.value)
    syncedNote.value = true
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="financials-page">
    <RouterLink :to="{ name: 'event-detail', params: { id: route.params.id } }" class="back-link"
      >&larr; {{ event.name }}</RouterLink
    >
    <h1>Financials</h1>

    <div v-if="isAdmin" class="glass config-panel">
      <div class="config-row">
        <div class="field mono">
          <label>Entry Fee ($)</label>
          <input v-model.number="form.entry_fee" type="number" min="0" class="money-input" />
        </div>
        <div class="field mono">
          <label>Scoring Pool / Player</label>
          <input v-model.number="form.scoring_pool_per_player" type="number" min="0" class="money-input" />
        </div>
        <div class="field mono">
          <label>Skins Pool / Player</label>
          <input v-model.number="form.skins_pool_per_player" type="number" min="0" class="money-input" />
        </div>
        <div class="field mono">
          <label>CTP Pool / Player</label>
          <input v-model.number="form.ctp_pool_per_player" type="number" min="0" class="money-input" />
        </div>
      </div>
      <button class="btn btn-primary" @click="handleSave">Save</button>
    </div>

    <div v-if="!config" class="empty-note">Set the entry fee and pools above to get started.</div>

    <template v-else>
      <div class="cards-grid summary-cards">
        <div class="glass stat-card">
          <div class="label">Paid Players</div>
          <div class="value">{{ paidCount }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">Total Collected</div>
          <div class="value gold">${{ totalCollected }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">Scoring Pool</div>
          <div class="value gold">${{ scoringPool }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">Skins Pool</div>
          <div class="value gold">${{ skinsPool }}</div>
        </div>
        <div class="glass stat-card">
          <div class="label">CTP Pool (informational)</div>
          <div class="value gold">${{ ctpPoolInfo }}</div>
        </div>
      </div>

      <div v-if="isAdmin && hasSkinsConfig" class="sync-row">
        <button class="btn btn-ghost" :disabled="syncing" @click="handleSyncSkinsPool">
          {{ syncing ? 'Syncing…' : 'Sync Pool to Skins Config' }}
        </button>
        <span v-if="syncedNote" class="synced-note">Skins pot updated to ${{ skinsPool }}.</span>
      </div>

      <section>
        <h2 class="sub-heading">Payouts</h2>
        <div class="glass payout-panel">
          <div class="payout-group">
            <div class="payout-group-title">Scoring</div>
            <div v-if="scoringPayouts.length">
              <div v-for="(p, i) in scoringPayouts" :key="i" class="payout-row">
                <span>#{{ p.rank }} {{ p.participant.user.display_name || p.participant.user.email }}</span>
                <span class="payout-amount">${{ p.payout_amount }}</span>
              </div>
            </div>
            <p v-else class="empty-note">Not finalized yet.</p>
          </div>

          <div class="payout-group">
            <div class="payout-group-title">Skins</div>
            <div v-if="skinsPayouts.length">
              <div v-for="(p, i) in skinsPayouts" :key="i" class="payout-row">
                <span>Hole {{ p.hole.hole_number }} — {{ p.winner.user.display_name || p.winner.user.email }}</span>
                <span class="payout-amount">${{ p.payout_amount }}</span>
              </div>
            </div>
            <p v-else class="empty-note">Not finalized yet.</p>
          </div>

          <div class="payout-group">
            <div class="payout-group-title">Closest to Pin</div>
            <div v-if="ctpPrizes.length">
              <div v-for="(c, i) in ctpPrizes" :key="i" class="payout-row">
                <span>
                  Hole {{ c.hole.hole_number }} —
                  {{ c.result ? c.result.winner.user.display_name || c.result.winner.user.email : 'Not yet recorded' }}
                </span>
                <span class="payout-amount">${{ c.prize_amount }}</span>
              </div>
            </div>
            <p v-else class="empty-note">No CTP holes designated.</p>
          </div>
        </div>
      </section>
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

.money-input {
  width: 110px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.summary-cards {
  margin-bottom: 20px;
}

.sync-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 32px;
}

.synced-note {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green);
}

section {
  margin-top: 32px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.payout-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.payout-group-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 10px;
}

.payout-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-dim);
}

.payout-amount {
  font-family: var(--font-mono);
  color: var(--gold);
  font-weight: 600;
}
</style>
