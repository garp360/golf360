<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCoursesStore } from '../../stores/courses'
import { useGroupsStore } from '../../stores/groups'

const route = useRoute()
const courses = useCoursesStore()
const groups = useGroupsStore()

const loading = ref(true)
const course = ref(null)
const holes = ref([])
const teeBoxes = ref([])

const savingHoles = ref(false)
const holesError = ref('')

const showAddTeeBox = ref(false)
const newTeeBox = reactive({ name: '', course_rating: '', slope_rating: '', total_yardage: '' })
const creatingTeeBox = ref(false)

const editingTeeBoxId = ref(null)
const teeBoxEdits = reactive({})
const savingTeeBoxId = ref(null)

const isAdmin = computed(() => groups.myAdminGroupIds.size > 0)

async function load() {
  loading.value = true
  const detail = await courses.fetchCourseDetail(route.params.id)
  course.value = detail.course
  holes.value = detail.holes.map((h) => ({ ...h }))
  teeBoxes.value = detail.teeBoxes
  loading.value = false
}

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await load()
})

async function handleSaveHoles() {
  const strokeIndexes = holes.value.map((h) => h.stroke_index)
  const uniqueCount = new Set(strokeIndexes).size
  if (uniqueCount !== holes.value.length) {
    holesError.value = 'Each stroke index (1–18) must be used exactly once.'
    return
  }
  holesError.value = ''
  savingHoles.value = true
  try {
    await courses.saveHoles(course.value.id, holes.value)
  } finally {
    savingHoles.value = false
  }
}

function yardageFor(teeBox, holeId) {
  const y = teeBox.tee_box_hole_yardages.find((y) => y.hole_id === holeId)
  return y ? y.yardage : ''
}

async function handleCreateTeeBox() {
  if (!newTeeBox.name.trim() || !newTeeBox.course_rating || !newTeeBox.slope_rating) return
  creatingTeeBox.value = true
  try {
    await courses.createTeeBox(course.value.id, {
      name: newTeeBox.name.trim(),
      course_rating: Number(newTeeBox.course_rating),
      slope_rating: Number(newTeeBox.slope_rating),
      total_yardage: newTeeBox.total_yardage ? Number(newTeeBox.total_yardage) : null,
    })
    newTeeBox.name = ''
    newTeeBox.course_rating = ''
    newTeeBox.slope_rating = ''
    newTeeBox.total_yardage = ''
    showAddTeeBox.value = false
    await load()
  } finally {
    creatingTeeBox.value = false
  }
}

function startEditTeeBox(teeBox) {
  editingTeeBoxId.value = teeBox.id
  teeBoxEdits[teeBox.id] = {
    name: teeBox.name,
    course_rating: teeBox.course_rating,
    slope_rating: teeBox.slope_rating,
    total_yardage: teeBox.total_yardage || '',
    yardages: holes.value.map((h) => ({ hole_id: h.id, hole_number: h.hole_number, yardage: yardageFor(teeBox, h.id) })),
  }
}

async function handleSaveTeeBox(teeBoxId) {
  const edit = teeBoxEdits[teeBoxId]
  savingTeeBoxId.value = teeBoxId
  try {
    await courses.updateTeeBox(teeBoxId, {
      name: edit.name,
      course_rating: Number(edit.course_rating),
      slope_rating: Number(edit.slope_rating),
      total_yardage: edit.total_yardage ? Number(edit.total_yardage) : null,
    })
    await courses.saveYardages(
      teeBoxId,
      edit.yardages.map((y) => ({ hole_id: y.hole_id, yardage: y.yardage ? Number(y.yardage) : null }))
    )
    editingTeeBoxId.value = null
    await load()
  } finally {
    savingTeeBoxId.value = null
  }
}

async function handleDeleteTeeBox(teeBoxId) {
  await courses.deleteTeeBox(teeBoxId)
  await load()
}
</script>

<template>
  <div v-if="loading" class="loading-note">Loading…</div>
  <div v-else class="course-detail">
    <RouterLink :to="{ name: 'courses' }" class="back-link">&larr; All Courses</RouterLink>
    <h1>{{ course.name }}</h1>
    <p v-if="course.location" class="description">{{ course.location }}</p>

    <section>
      <h2 class="sub-heading">Holes</h2>
      <div class="glass scorecard">
        <table class="holes-edit-table">
          <thead>
            <tr>
              <th>Hole</th>
              <th v-for="h in holes" :key="h.id">{{ h.hole_number }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Par</td>
              <td v-for="h in holes" :key="h.id">
                <input v-if="isAdmin" v-model.number="h.par" type="number" min="3" max="6" class="hole-input" />
                <span v-else>{{ h.par }}</span>
              </td>
            </tr>
            <tr>
              <td>Stroke Index</td>
              <td v-for="h in holes" :key="h.id">
                <input
                  v-if="isAdmin"
                  v-model.number="h.stroke_index"
                  type="number"
                  min="1"
                  max="18"
                  class="hole-input"
                />
                <span v-else>{{ h.stroke_index }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="holesError" class="error-note">{{ holesError }}</p>
      <button v-if="isAdmin" class="btn btn-primary save-holes-btn" :disabled="savingHoles" @click="handleSaveHoles">
        {{ savingHoles ? 'Saving…' : 'Save Holes' }}
      </button>
    </section>

    <section>
      <div class="section-head">
        <h2 class="sub-heading" style="margin-bottom: 0">Tee Boxes</h2>
        <button v-if="isAdmin" class="btn btn-ghost" @click="showAddTeeBox = !showAddTeeBox">
          {{ showAddTeeBox ? 'Cancel' : 'Add Tee Box' }}
        </button>
      </div>

      <div v-if="showAddTeeBox" class="glass create-form">
        <div class="field">
          <label>Name</label>
          <input v-model="newTeeBox.name" type="text" placeholder="Blue" />
        </div>
        <div class="field mono">
          <label>Course Rating</label>
          <input v-model="newTeeBox.course_rating" type="number" step="0.1" placeholder="74.2" />
        </div>
        <div class="field mono">
          <label>Slope Rating</label>
          <input v-model="newTeeBox.slope_rating" type="number" placeholder="138" />
        </div>
        <div class="field mono">
          <label>Total Yardage</label>
          <input v-model="newTeeBox.total_yardage" type="number" placeholder="Optional" />
        </div>
        <button class="btn btn-primary" :disabled="creatingTeeBox" @click="handleCreateTeeBox">
          {{ creatingTeeBox ? 'Creating…' : 'Create' }}
        </button>
      </div>

      <div v-for="tb in teeBoxes" :key="tb.id" class="glass tee-box-card">
        <template v-if="editingTeeBoxId === tb.id">
          <div class="tee-box-edit-fields">
            <div class="field">
              <label>Name</label>
              <input v-model="teeBoxEdits[tb.id].name" type="text" />
            </div>
            <div class="field mono">
              <label>Course Rating</label>
              <input v-model="teeBoxEdits[tb.id].course_rating" type="number" step="0.1" />
            </div>
            <div class="field mono">
              <label>Slope Rating</label>
              <input v-model="teeBoxEdits[tb.id].slope_rating" type="number" />
            </div>
            <div class="field mono">
              <label>Total Yardage</label>
              <input v-model="teeBoxEdits[tb.id].total_yardage" type="number" />
            </div>
          </div>
          <table class="holes-edit-table">
            <thead>
              <tr>
                <th>Hole</th>
                <th v-for="y in teeBoxEdits[tb.id].yardages" :key="y.hole_id">{{ y.hole_number }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Yardage</td>
                <td v-for="y in teeBoxEdits[tb.id].yardages" :key="y.hole_id">
                  <input v-model.number="y.yardage" type="number" class="hole-input" />
                </td>
              </tr>
            </tbody>
          </table>
          <div class="row">
            <button class="btn btn-primary" :disabled="savingTeeBoxId === tb.id" @click="handleSaveTeeBox(tb.id)">
              {{ savingTeeBoxId === tb.id ? 'Saving…' : 'Save' }}
            </button>
            <button class="btn btn-ghost" @click="editingTeeBoxId = null">Cancel</button>
          </div>
        </template>
        <template v-else>
          <div class="tee-box-summary">
            <div>
              <span class="tee-pill">{{ tb.name }}</span>
              <span class="tee-box-stats">Rtg {{ tb.course_rating }} / Slp {{ tb.slope_rating }}</span>
              <span v-if="tb.total_yardage" class="tee-box-stats">{{ tb.total_yardage }} yds</span>
            </div>
            <div v-if="isAdmin" class="row">
              <button class="btn btn-ghost" @click="startEditTeeBox(tb)">Edit</button>
              <button class="btn btn-danger" @click="handleDeleteTeeBox(tb.id)">Delete</button>
            </div>
          </div>
        </template>
      </div>
      <p v-if="!teeBoxes.length" class="empty-note">No tee boxes yet.</p>
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
  margin-bottom: 40px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.holes-edit-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 640px;
  font-family: var(--font-mono);
  font-size: 13px;
}

.holes-edit-table th,
.holes-edit-table td {
  padding: 8px 4px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.holes-edit-table th:first-child,
.holes-edit-table td:first-child {
  text-align: left;
  color: var(--ink-dim);
  font-family: var(--font-body);
  font-size: 12px;
  min-width: 90px;
}

.hole-input {
  width: 34px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 4px 2px;
}

.save-holes-btn {
  margin-top: 16px;
}

.error-note {
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 10px;
}

.create-form {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 320px;
}

.tee-box-card {
  padding: 20px 24px;
  margin-bottom: 14px;
}

.tee-box-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.tee-box-stats {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-faint);
  margin-left: 14px;
}

.tee-box-edit-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
