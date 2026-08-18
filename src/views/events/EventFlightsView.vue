<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useFlightsStore } from '../../stores/flights'
import { useGroupsStore } from '../../stores/groups'
import { supabase } from '../../lib/supabase'

const route = useRoute()
const flightsStore = useFlightsStore()
const groups = useGroupsStore()

const loading = ref(true)
const round = ref(null)
const event = ref(null)
const flights = ref([])
const unassigned = ref([])

const newTeeTime = ref('')
const creatingFlight = ref(false)
const addingToFlight = ref(null)
const selectedParticipantByFlight = ref({})

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const mm = String(wrapped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function suggestedNextTeeTime() {
  if (!round.value.first_tee_time) return ''
  const base = round.value.first_tee_time.slice(0, 5)
  const interval = round.value.tee_time_interval_minutes || 0
  return addMinutes(base, interval * flights.value.length)
}

async function load() {
  loading.value = true
  round.value = await flightsStore.fetchRound(route.params.id)

  const { data: eventData } = await supabase.from('events').select('*').eq('id', round.value.event_id).single()
  event.value = eventData

  flights.value = await flightsStore.fetchFlights(route.params.id)
  unassigned.value = await flightsStore.fetchUnassignedParticipants(round.value.event_id, route.params.id)
  newTeeTime.value = suggestedNextTeeTime()
  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await load()
})

async function handleCreateFlight() {
  creatingFlight.value = true
  try {
    const nextNumber = flights.value.length + 1
    await flightsStore.createFlight(route.params.id, nextNumber, newTeeTime.value)
    await load()
  } finally {
    creatingFlight.value = false
  }
}

async function handleDeleteFlight(flightId) {
  await flightsStore.deleteFlight(flightId)
  await load()
}

async function handleAssign(flightId) {
  const participantId = selectedParticipantByFlight.value[flightId]
  if (!participantId) return
  addingToFlight.value = flightId
  try {
    await flightsStore.assignParticipant(flightId, route.params.id, participantId)
    selectedParticipantByFlight.value[flightId] = ''
    await load()
  } finally {
    addingToFlight.value = null
  }
}

async function handleRemove(flightMemberId) {
  await flightsStore.removeParticipant(flightMemberId)
  await load()
}

function participantName(p) {
  return p.user.display_name || p.user.email
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="flights-page">
    <RouterLink :to="{ name: 'event-detail', params: { id: round.event_id } }" class="back-link"
      >&larr; {{ event.name }}</RouterLink
    >
    <h1>Tee Time Groups</h1>
    <p class="description">
      {{ round.event_course.course.name }} — Round {{ round.round_number }}
      <template v-if="round.first_tee_time">
        · First tee {{ round.first_tee_time.slice(0, 5) }}, every {{ round.tee_time_interval_minutes }} min
      </template>
    </p>

    <div v-if="isAdmin" class="glass add-flight-form">
      <div class="field mono">
        <label>Tee Time</label>
        <input v-model="newTeeTime" type="time" />
      </div>
      <button class="btn btn-primary" :disabled="creatingFlight" @click="handleCreateFlight">
        Add Flight {{ flights.length + 1 }}
      </button>
    </div>

    <div class="flights-grid">
      <div v-for="f in flights" :key="f.id" class="glass flight-card">
        <div class="flight-head">
          <span class="flight-title">Flight {{ f.flight_number }}</span>
          <span v-if="f.tee_time" class="tee-pill">{{ f.tee_time.slice(0, 5) }}</span>
          <button v-if="isAdmin" class="btn btn-danger flight-delete" @click="handleDeleteFlight(f.id)">Delete</button>
        </div>

        <div class="flight-members">
          <div v-for="m in f.members" :key="m.id" class="flight-member">
            <span>{{ participantName(m.participant) }}</span>
            <button v-if="isAdmin" class="remove-btn" @click="handleRemove(m.id)">&times;</button>
          </div>
          <p v-if="!f.members.length" class="empty-note">No players yet.</p>
        </div>

        <div v-if="isAdmin && f.members.length < 4 && unassigned.length" class="assign-row">
          <select v-model="selectedParticipantByFlight[f.id]">
            <option value="" disabled selected>Add player…</option>
            <option v-for="p in unassigned" :key="p.id" :value="p.id">{{ participantName(p) }}</option>
          </select>
          <button class="btn btn-ghost" :disabled="addingToFlight === f.id" @click="handleAssign(f.id)">Add</button>
        </div>
        <p v-else-if="f.members.length >= 4" class="full-note">Full</p>
      </div>
    </div>
    <p v-if="!flights.length" class="empty-note">No flights yet — add one above.</p>

    <section v-if="unassigned.length">
      <h2 class="sub-heading">Unassigned ({{ unassigned.length }})</h2>
      <div class="glass unassigned-list">
        <div v-for="p in unassigned" :key="p.id" class="unassigned-row">{{ participantName(p) }}</div>
      </div>
    </section>
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
  margin-bottom: 6px;
}

.description {
  color: var(--ink-dim);
  font-size: 14px;
  margin-bottom: 24px;
}

.add-flight-form {
  padding: 22px;
  display: flex;
  gap: 14px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 28px;
}

.add-flight-form input {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.flights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
  margin-bottom: 32px;
}

.flight-card {
  padding: 20px;
}

.flight-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.flight-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
}

.flight-delete {
  margin-left: auto;
  font-size: 11px;
  padding: 6px 12px;
}

.flight-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.flight-member {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-body);
  font-size: 14px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.remove-btn {
  background: transparent;
  border: none;
  color: var(--danger);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.assign-row {
  display: flex;
  gap: 8px;
}

.assign-row select {
  flex: 1;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
}

.full-note {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--green);
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.unassigned-list {
  padding: 6px;
}

.unassigned-row {
  padding: 10px 20px;
  font-family: var(--font-body);
  font-size: 14px;
}

.unassigned-row + .unassigned-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
