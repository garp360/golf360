<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCoursesStore } from '../../stores/courses'
import { useGroupsStore } from '../../stores/groups'
import { buildCsvTemplate, parseCourseCsv } from '../../lib/courseImport'

const courses = useCoursesStore()
const groups = useGroupsStore()
const router = useRouter()

const showCreateForm = ref(false)
const newName = ref('')
const newLocation = ref('')
const creating = ref(false)

const showImportForm = ref(false)
const importError = ref('')
const parsedImport = ref(null)
const importing = ref(false)
const fileInput = ref(null)

const isAdmin = computed(() => groups.myAdminGroupIds.size > 0)

const templateDownloadHref = computed(
  () => `data:text/csv;charset=utf-8,${encodeURIComponent(buildCsvTemplate())}`
)

onMounted(async () => {
  if (!groups.myMemberships.length) {
    await groups.fetchMyMemberships()
  }
  await courses.fetchCourses()
})

async function handleCreate() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const course = await courses.createCourse({ name: newName.value.trim(), location: newLocation.value.trim() })
    newName.value = ''
    newLocation.value = ''
    showCreateForm.value = false
    router.push({ name: 'course-detail', params: { id: course.id } })
  } finally {
    creating.value = false
  }
}

function handleFileSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  importError.value = ''
  parsedImport.value = null

  const reader = new FileReader()
  reader.onload = () => {
    try {
      parsedImport.value = parseCourseCsv(reader.result)
    } catch (err) {
      importError.value = err.message
    }
  }
  reader.readAsText(file)
}

async function handleConfirmImport() {
  if (!parsedImport.value) return
  importing.value = true
  try {
    const course = await courses.importCourseFromCsv(parsedImport.value)
    showImportForm.value = false
    parsedImport.value = null
    if (fileInput.value) fileInput.value.value = ''
    router.push({ name: 'course-detail', params: { id: course.id } })
  } catch (err) {
    importError.value = err.message
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="courses-page">
    <div class="section-head">
      <h2>Courses</h2>
      <div class="header-actions" v-if="isAdmin">
        <button class="btn btn-ghost" @click="showImportForm = !showImportForm">
          {{ showImportForm ? 'Cancel Import' : 'Import CSV' }}
        </button>
        <button class="btn btn-primary" @click="showCreateForm = !showCreateForm">
          {{ showCreateForm ? 'Cancel' : 'Add Course' }}
        </button>
      </div>
    </div>

    <div v-if="showCreateForm" class="glass create-form">
      <div class="field">
        <label for="course-name">Name</label>
        <input id="course-name" v-model="newName" type="text" placeholder="Cypress Point" />
      </div>
      <div class="field">
        <label for="course-location">Location</label>
        <input id="course-location" v-model="newLocation" type="text" placeholder="Optional" />
      </div>
      <button class="btn btn-primary" :disabled="creating || !newName.trim()" @click="handleCreate">
        {{ creating ? 'Creating…' : 'Create' }}
      </button>
    </div>

    <div v-if="showImportForm" class="glass import-form">
      <p class="import-help">
        One row per hole (18 rows), with repeating <code>teeN_name</code>/<code>teeN_rating</code>/<code>teeN_slope</code>/<code>teeN_yardage</code>
        columns for each tee box.
        <a :href="templateDownloadHref" download="course-template.csv" class="template-link">Download template</a>
      </p>
      <input ref="fileInput" type="file" accept=".csv" @change="handleFileSelected" />

      <p v-if="importError" class="error-note">{{ importError }}</p>

      <div v-if="parsedImport" class="import-preview">
        <div class="preview-row">
          <strong>{{ parsedImport.courseName }}</strong>
          <span v-if="parsedImport.location" class="preview-muted"> — {{ parsedImport.location }}</span>
        </div>
        <div class="preview-row preview-muted">{{ parsedImport.holes.length }} holes</div>
        <div class="preview-row preview-muted">
          Tees: {{ parsedImport.teeBoxes.map((t) => `${t.name} (${t.course_rating}/${t.slope_rating})`).join(', ') }}
        </div>
        <button class="btn btn-primary confirm-btn" :disabled="importing" @click="handleConfirmImport">
          {{ importing ? 'Importing…' : 'Confirm Import' }}
        </button>
      </div>
    </div>

    <div v-if="courses.courses.length" class="cards-grid">
      <RouterLink
        v-for="c in courses.courses"
        :key="c.id"
        :to="{ name: 'course-detail', params: { id: c.id } }"
        class="glass stat-card course-card"
      >
        <div class="label" v-if="c.location">{{ c.location }}</div>
        <div class="value" style="font-size: 20px">{{ c.name }}</div>
      </RouterLink>
    </div>
    <p v-else class="empty-note">No courses yet.</p>
  </div>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

h2 {
  font-size: 18px;
}

.create-form {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 420px;
}

.import-form {
  padding: 22px;
  margin-bottom: 20px;
  max-width: 480px;
}

.import-help {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-dim);
  margin: 0 0 14px;
  line-height: 1.6;
}

.import-help code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
}

.template-link {
  display: block;
  margin-top: 8px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 12px;
}

.error-note {
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 14px;
}

.import-preview {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-row {
  font-family: var(--font-body);
  font-size: 14px;
  margin-bottom: 4px;
}

.preview-muted {
  color: var(--ink-faint);
  font-size: 12px;
}

.confirm-btn {
  margin-top: 14px;
}

.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.course-card {
  text-decoration: none;
  color: inherit;
  display: block;
  cursor: pointer;
}
</style>
