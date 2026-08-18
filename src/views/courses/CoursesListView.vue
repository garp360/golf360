<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCoursesStore } from '../../stores/courses'
import { useGroupsStore } from '../../stores/groups'

const courses = useCoursesStore()
const groups = useGroupsStore()
const router = useRouter()

const showCreateForm = ref(false)
const newName = ref('')
const newLocation = ref('')
const creating = ref(false)

const isAdmin = computed(() => groups.myAdminGroupIds.size > 0)

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
</script>

<template>
  <div class="courses-page">
    <div class="section-head">
      <h2>Courses</h2>
      <button v-if="isAdmin" class="btn btn-primary" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? 'Cancel' : 'Add Course' }}
      </button>
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
