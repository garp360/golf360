<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { useGroupsStore } from '../../stores/groups'
import { useEventsStore } from '../../stores/events'

const route = useRoute()
const groups = useGroupsStore()
const events = useEventsStore()

const group = ref(null)
const members = ref([])
const pendingRequests = ref([])
const decidingId = ref(null)
const loading = ref(true)

const showCreateEvent = ref(false)
const newEvent = reactive({ name: '', event_date: '' })
const creatingEvent = ref(false)

const isAdmin = computed(() => {
  const membership = groups.myMemberships.find((m) => m.group_id === route.params.id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

async function loadGroup() {
  loading.value = true
  const { data } = await supabase.from('groups').select('*').eq('id', route.params.id).single()
  group.value = data

  members.value = await groups.fetchGroupMembers(route.params.id)
  if (isAdmin.value) {
    pendingRequests.value = await groups.fetchPendingRequests(route.params.id)
  }
  await events.fetchGroupEvents(route.params.id)
  loading.value = false
}

async function handleCreateEvent() {
  if (!newEvent.name.trim() || !newEvent.event_date) return
  creatingEvent.value = true
  try {
    await events.createEvent(route.params.id, { name: newEvent.name.trim(), event_date: newEvent.event_date })
    newEvent.name = ''
    newEvent.event_date = ''
    showCreateEvent.value = false
  } finally {
    creatingEvent.value = false
  }
}

async function handleDecision(membershipId, status) {
  decidingId.value = membershipId
  try {
    await groups.decideMembership(membershipId, status)
    await Promise.all([groups.fetchMyMemberships()])
    pendingRequests.value = await groups.fetchPendingRequests(route.params.id)
    members.value = await groups.fetchGroupMembers(route.params.id)
  } finally {
    decidingId.value = null
  }
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await loadGroup()
})
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else-if="group" class="group-detail">
    <RouterLink :to="{ name: 'dashboard' }" class="back-link">&larr; All Groups</RouterLink>
    <h1>{{ group.name }}</h1>
    <p v-if="group.description" class="description">{{ group.description }}</p>

    <section>
      <div class="section-head">
        <h2 class="sub-heading" style="margin-bottom: 0">Events</h2>
        <button v-if="isAdmin" class="btn btn-ghost" @click="showCreateEvent = !showCreateEvent">
          {{ showCreateEvent ? 'Cancel' : 'Create Event' }}
        </button>
      </div>

      <div v-if="showCreateEvent" class="glass create-form">
        <div class="field">
          <label>Name</label>
          <input v-model="newEvent.name" type="text" placeholder="Saturday Scramble" />
        </div>
        <div class="field">
          <label>Date</label>
          <input v-model="newEvent.event_date" type="date" />
        </div>
        <button class="btn btn-primary" :disabled="creatingEvent" @click="handleCreateEvent">
          {{ creatingEvent ? 'Creating…' : 'Create' }}
        </button>
      </div>

      <div class="glass event-list" v-if="events.groupEvents.length">
        <RouterLink
          v-for="e in events.groupEvents"
          :key="e.id"
          :to="{ name: 'event-detail', params: { id: e.id } }"
          class="event-row"
        >
          <div>
            <div class="event-name">{{ e.name }}</div>
            <div class="event-date">{{ e.event_date }}</div>
          </div>
          <span class="badge badge-live">{{ e.status }}</span>
        </RouterLink>
      </div>
      <p v-else class="empty-note">No events yet.</p>
    </section>

    <section v-if="isAdmin && pendingRequests.length">
      <h2 class="sub-heading">Pending Join Requests</h2>
      <div class="glass request-list">
        <div v-for="req in pendingRequests" :key="req.id" class="request-row">
          <div>
            <div class="request-name">{{ req.user.display_name || req.user.email }}</div>
            <div class="request-email">{{ req.user.email }}</div>
          </div>
          <div class="request-actions">
            <button
              class="btn btn-primary"
              :disabled="decidingId === req.id"
              @click="handleDecision(req.id, 'active')"
            >
              Approve
            </button>
            <button
              class="btn btn-danger"
              :disabled="decidingId === req.id"
              @click="handleDecision(req.id, 'denied')"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="sub-heading">Members ({{ members.length }})</h2>
      <div class="glass member-list">
        <div v-for="m in members" :key="m.id" class="member-row">
          <span class="member-name">{{ m.user.display_name || m.user.email }}</span>
          <span class="badge" :class="m.role === 'admin' ? 'badge-skins' : 'badge-live'">{{ m.role }}</span>
        </div>
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
  margin-bottom: 8px;
}

.description {
  color: var(--ink-dim);
  font-size: 14px;
  margin-bottom: 32px;
}

section {
  margin-bottom: 32px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.request-list,
.member-list {
  padding: 6px;
}

.request-row,
.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.request-row + .request-row,
.member-row + .member-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.request-name,
.member-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
}

.request-email {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 2px;
}

.request-actions {
  display: flex;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.create-form {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 320px;
}

.event-list {
  padding: 6px;
}

.event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  text-decoration: none;
  color: inherit;
}

.event-row + .event-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.event-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
}

.event-date {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 2px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
