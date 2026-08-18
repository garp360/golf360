<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useEventsStore } from '../../stores/events'
import { useGroupsStore } from '../../stores/groups'
import { useCoursesStore } from '../../stores/courses'
import { useAuthStore } from '../../stores/auth'

const route = useRoute()
const events = useEventsStore()
const groups = useGroupsStore()
const courses = useCoursesStore()
const auth = useAuthStore()

const loading = ref(true)
const event = ref(null)
const eventCourses = ref([])
const eventRounds = ref([])
const participants = ref([])
const groupMembers = ref([])

const isAdmin = computed(() => {
  if (!event.value) return false
  const membership = groups.myMemberships.find((m) => m.group_id === event.value.group_id)
  return membership?.status === 'active' && membership?.role === 'admin'
})

const myParticipant = computed(() =>
  participants.value.find((p) => p.user_id === auth.user?.id && p.status === 'registered')
)

const availableTeeBoxes = computed(() =>
  eventCourses.value.flatMap((ec) => ec.course.tee_boxes.map((tb) => ({ ...tb, course: ec.course })))
)

const availableCoursesToAdd = computed(() => {
  const addedIds = new Set(eventCourses.value.map((ec) => ec.course_id))
  return courses.courses.filter((c) => !addedIds.has(c.id))
})

const canAdminAdd = computed(() => event.value && !['closed', 'cancelled'].includes(event.value.status))

const addableMembers = computed(() => {
  const registeredIds = new Set(
    participants.value.filter((p) => p.status === 'registered').map((p) => p.user_id)
  )
  return groupMembers.value.filter((m) => !registeredIds.has(m.user_id))
})

const statusOptions = ['draft', 'open', 'closed', 'completed', 'cancelled']

async function load() {
  loading.value = true
  const detail = await events.fetchEventDetail(route.params.id)
  event.value = detail.event
  eventCourses.value = detail.eventCourses
  eventRounds.value = detail.eventRounds
  participants.value = detail.participants
  groupMembers.value = await groups.fetchGroupMembers(detail.event.group_id)
  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  if (!courses.courses.length) {
    await courses.fetchCourses()
  }
  await load()
})

async function handleStatusChange(newStatus) {
  await events.updateEventStatus(event.value.id, newStatus)
  event.value.status = newStatus
}

const addingCourseId = ref('')
async function handleAddCourse() {
  if (!addingCourseId.value) return
  await events.addEventCourse(event.value.id, addingCourseId.value)
  addingCourseId.value = ''
  await load()
}

const newRound = reactive({
  event_course_id: '',
  round_date: '',
  first_tee_time: '',
  tee_time_interval_minutes: 10,
})
async function handleAddRound() {
  if (!newRound.event_course_id || !newRound.round_date) return
  const nextRoundNumber = eventRounds.value.length + 1
  await events.addEventRound(
    event.value.id,
    newRound.event_course_id,
    nextRoundNumber,
    newRound.round_date,
    newRound.first_tee_time,
    newRound.tee_time_interval_minutes
  )
  newRound.event_course_id = ''
  newRound.round_date = ''
  newRound.first_tee_time = ''
  newRound.tee_time_interval_minutes = 10
  await load()
}

const signupTeeBoxId = ref('')
const signingUp = ref(false)
async function handleSignUp() {
  if (!signupTeeBoxId.value) return
  signingUp.value = true
  try {
    await events.signUp(event.value.id, signupTeeBoxId.value)
    await load()
  } finally {
    signingUp.value = false
  }
}

const adminAddUserId = ref('')
const adminAddTeeBoxId = ref('')
const adminAdding = ref(false)
async function handleAdminAdd() {
  if (!adminAddUserId.value || !adminAddTeeBoxId.value) return
  adminAdding.value = true
  try {
    await events.addParticipant(event.value.id, adminAddUserId.value, adminAddTeeBoxId.value)
    adminAddUserId.value = ''
    adminAddTeeBoxId.value = ''
    await load()
  } finally {
    adminAdding.value = false
  }
}

async function handleWithdraw(participantId) {
  await events.withdraw(participantId)
  await load()
}

async function handleToggle(participant, field) {
  await events.updateParticipantFlags(participant.id, {
    paid: field === 'paid' ? !participant.paid : participant.paid,
    checked_in: field === 'checked_in' ? !participant.checked_in : participant.checked_in,
  })
  await load()
}

const handicapDraftId = ref(null)
const handicapDraftValue = ref('')
function startHandicapEntry(participant) {
  handicapDraftId.value = participant.id
  handicapDraftValue.value = participant.handicap_index_at_signup || ''
}
async function handleSaveHandicap(participant) {
  if (!handicapDraftValue.value) return
  await events.setProvisionalHandicap(participant, Number(handicapDraftValue.value))
  handicapDraftId.value = null
  await load()
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else-if="event" class="event-detail">
    <RouterLink :to="{ name: 'group-detail', params: { id: event.group_id } }" class="back-link"
      >&larr; {{ event.group.name }}</RouterLink
    >
    <div class="title-row">
      <div>
        <h1>{{ event.name }}</h1>
        <p class="description">{{ event.event_date }}</p>
      </div>
      <div class="title-row-actions">
        <RouterLink :to="{ name: 'event-financials', params: { id: event.id } }" class="btn btn-ghost"
          >Financials</RouterLink
        >
        <RouterLink :to="{ name: 'event-ctp', params: { id: event.id } }" class="btn btn-ghost">CTP</RouterLink>
        <RouterLink :to="{ name: 'event-skins', params: { id: event.id } }" class="btn btn-ghost">Skins</RouterLink>
        <RouterLink :to="{ name: 'event-leaderboard', params: { id: event.id } }" class="btn btn-ghost"
          >Leaderboard</RouterLink
        >
        <select v-if="isAdmin" class="status-select" :value="event.status" @change="handleStatusChange($event.target.value)">
          <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
        </select>
        <span v-else class="badge badge-live">{{ event.status }}</span>
      </div>
    </div>

    <section>
      <h2 class="sub-heading">Courses &amp; Rounds</h2>
      <div class="glass panel">
        <div v-if="eventCourses.length" class="course-list">
          <div v-for="ec in eventCourses" :key="ec.id" class="course-block">
            <span class="course-name">{{ ec.course.name }}</span>
            <div class="round-links">
              <div v-for="r in eventRounds.filter((r) => r.event_course_id === ec.id)" :key="r.id" class="round-link-row">
                <RouterLink :to="{ name: 'round-score', params: { id: r.id } }" class="round-link">
                  Round {{ r.round_number }} — {{ r.round_date }}
                  <template v-if="r.first_tee_time">· {{ r.first_tee_time.slice(0, 5) }} tee, every {{ r.tee_time_interval_minutes }}m</template>
                </RouterLink>
                <RouterLink :to="{ name: 'round-flights', params: { id: r.id } }" class="round-link flights-link"
                  >Tee Groups</RouterLink
                >
              </div>
              <span v-if="!eventRounds.some((r) => r.event_course_id === ec.id)" class="course-rounds">No rounds yet.</span>
            </div>
          </div>
        </div>
        <p v-else class="empty-note">No courses added yet.</p>

        <div v-if="isAdmin" class="admin-row">
          <select v-model="addingCourseId">
            <option value="" disabled>Add a course…</option>
            <option v-for="c in availableCoursesToAdd" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="btn btn-ghost" :disabled="!addingCourseId" @click="handleAddCourse">Add Course</button>
        </div>

        <div v-if="isAdmin && eventCourses.length" class="admin-row">
          <select v-model="newRound.event_course_id">
            <option value="" disabled>Round for course…</option>
            <option v-for="ec in eventCourses" :key="ec.id" :value="ec.id">{{ ec.course.name }}</option>
          </select>
          <input v-model="newRound.round_date" type="date" />
          <input v-model="newRound.first_tee_time" type="time" title="First tee time" />
          <input
            v-model.number="newRound.tee_time_interval_minutes"
            type="number"
            min="1"
            class="interval-input"
            title="Tee time interval (minutes)"
          />
          <button class="btn btn-ghost" :disabled="!newRound.event_course_id || !newRound.round_date" @click="handleAddRound">
            Add Round
          </button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="sub-heading">Participants ({{ participants.filter((p) => p.status === 'registered').length }})</h2>

      <div v-if="!myParticipant && event.status === 'open'" class="glass panel signup-panel">
        <select v-model="signupTeeBoxId">
          <option value="" disabled>Select tee box…</option>
          <option v-for="tb in availableTeeBoxes" :key="tb.id" :value="tb.id">
            {{ tb.course.name }} — {{ tb.name }}
          </option>
        </select>
        <button class="btn btn-primary" :disabled="!signupTeeBoxId || signingUp" @click="handleSignUp">
          {{ signingUp ? 'Signing up…' : 'Sign Up' }}
        </button>
      </div>

      <div v-if="isAdmin && canAdminAdd && addableMembers.length" class="glass panel signup-panel">
        <select v-model="adminAddUserId">
          <option value="" disabled selected>Add member…</option>
          <option v-for="m in addableMembers" :key="m.user_id" :value="m.user_id">
            {{ m.user.display_name || m.user.email }}
          </option>
        </select>
        <select v-model="adminAddTeeBoxId">
          <option value="" disabled selected>Select tee box…</option>
          <option v-for="tb in availableTeeBoxes" :key="tb.id" :value="tb.id">
            {{ tb.course.name }} — {{ tb.name }}
          </option>
        </select>
        <button class="btn btn-ghost" :disabled="!adminAddUserId || !adminAddTeeBoxId || adminAdding" @click="handleAdminAdd">
          {{ adminAdding ? 'Adding…' : 'Add Participant' }}
        </button>
      </div>

      <div class="glass participant-list" v-if="participants.length">
        <div v-for="p in participants" :key="p.id" class="participant-row" :class="{ withdrawn: p.status === 'withdrawn' }">
          <div class="participant-main">
            <div class="participant-name">{{ p.user.display_name || p.user.email }}</div>
            <div class="participant-meta">
              {{ p.tee_box.course.name }} — {{ p.tee_box.name }}
              <template v-if="p.course_handicap != null">· HCP {{ p.course_handicap }}</template>
              <template v-else>· No handicap yet</template>
              <span v-if="p.is_provisional_handicap" class="badge badge-skins" style="margin-left: 6px">provisional</span>
            </div>
          </div>

          <div v-if="isAdmin" class="participant-admin">
            <button class="badge" :class="p.paid ? 'badge-live' : ''" @click="handleToggle(p, 'paid')">
              {{ p.paid ? 'Paid' : 'Unpaid' }}
            </button>
            <button class="badge" :class="p.checked_in ? 'badge-live' : ''" @click="handleToggle(p, 'checked_in')">
              {{ p.checked_in ? 'Checked in' : 'Not checked in' }}
            </button>

            <template v-if="handicapDraftId === p.id">
              <input v-model="handicapDraftValue" type="number" step="0.1" class="handicap-input" />
              <button class="btn btn-ghost" @click="handleSaveHandicap(p)">Save</button>
            </template>
            <button v-else class="btn btn-ghost" @click="startHandicapEntry(p)">Set HCP</button>

            <button v-if="p.status === 'registered'" class="btn btn-danger" @click="handleWithdraw(p.id)">Withdraw</button>
          </div>
        </div>
      </div>
      <p v-else class="empty-note">No one has signed up yet.</p>
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

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 32px;
}

.title-row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .title-row-actions {
    width: 100%;
  }

  .title-row-actions .btn,
  .title-row-actions .status-select {
    flex: 1 1 auto;
  }
}

.title-row-actions .btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

h1 {
  font-size: 26px;
  margin-bottom: 6px;
}

.description {
  color: var(--ink-dim);
  font-size: 14px;
}

section {
  margin-bottom: 40px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.panel {
  padding: 22px;
}

.course-list {
  margin-bottom: 16px;
}

.course-block {
  padding: 10px 0;
}

.course-block + .course-block {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.course-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
}

.round-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.round-link-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.round-link {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green);
  text-decoration: none;
}

.flights-link {
  color: var(--gold);
}

.interval-input {
  width: 70px;
}

.course-rounds {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
}

.admin-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
}

select,
.status-select {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
}

.signup-panel {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.participant-list {
  padding: 6px;
}

.participant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  flex-wrap: wrap;
  gap: 10px;
}

.participant-row + .participant-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.participant-row.withdrawn {
  opacity: 0.5;
}

.participant-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
}

.participant-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 2px;
}

.participant-admin {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.participant-admin .badge {
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  color: var(--ink-faint);
}

.handicap-input {
  width: 60px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 8px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
