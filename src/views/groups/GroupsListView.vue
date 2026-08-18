<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupsStore } from '../../stores/groups'

const groups = useGroupsStore()
const router = useRouter()

const showCreateForm = ref(false)
const newGroupName = ref('')
const newGroupDescription = ref('')
const creating = ref(false)
const joiningGroupId = ref(null)

onMounted(async () => {
  await Promise.all([groups.fetchMyMemberships(), groups.fetchAllGroups()])
})

const myGroupIds = computed(() => new Set(groups.myMemberships.map((m) => m.group_id)))

const joinableGroups = computed(() => groups.allGroups.filter((g) => !myGroupIds.value.has(g.id)))

async function handleCreateGroup() {
  if (!newGroupName.value.trim()) return
  creating.value = true
  try {
    const group = await groups.createGroup({
      name: newGroupName.value.trim(),
      description: newGroupDescription.value.trim() || null,
    })
    newGroupName.value = ''
    newGroupDescription.value = ''
    showCreateForm.value = false
    router.push({ name: 'group-detail', params: { id: group.id } })
  } finally {
    creating.value = false
  }
}

async function handleJoin(groupId) {
  joiningGroupId.value = groupId
  try {
    await groups.requestToJoin(groupId)
  } finally {
    joiningGroupId.value = null
  }
}
</script>

<template>
  <div class="groups-page">
    <section>
      <div class="section-head">
        <h2>My Groups</h2>
        <button class="btn btn-primary" @click="showCreateForm = !showCreateForm">
          {{ showCreateForm ? 'Cancel' : 'Create Group' }}
        </button>
      </div>

      <div v-if="showCreateForm" class="glass create-form">
        <div class="field">
          <label for="group-name">Name</label>
          <input id="group-name" v-model="newGroupName" type="text" placeholder="Sunday Skins Club" />
        </div>
        <div class="field">
          <label for="group-description">Description</label>
          <textarea id="group-description" v-model="newGroupDescription" rows="2" placeholder="Optional"></textarea>
        </div>
        <button class="btn btn-primary" :disabled="creating || !newGroupName.trim()" @click="handleCreateGroup">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>

      <p v-if="groups.myPendingGroups.length" class="pending-note">
        Pending approval: {{ groups.myPendingGroups.map((m) => m.group.name).join(', ') }}
      </p>

      <div v-if="groups.myActiveGroups.length" class="cards-grid">
        <RouterLink
          v-for="m in groups.myActiveGroups"
          :key="m.id"
          :to="{ name: 'group-detail', params: { id: m.group_id } }"
          class="glass stat-card group-card"
        >
          <div class="label">{{ m.role === 'admin' ? 'Admin' : 'Member' }}</div>
          <div class="value" style="font-size: 20px">{{ m.group.name }}</div>
        </RouterLink>
      </div>
      <p v-else class="empty-note">You're not in any groups yet.</p>
    </section>

    <section v-if="joinableGroups.length">
      <h2 class="sub-heading">Browse Groups</h2>
      <div class="glass browse-list">
        <div v-for="g in joinableGroups" :key="g.id" class="browse-row">
          <div>
            <div class="browse-name">{{ g.name }}</div>
            <div class="browse-desc" v-if="g.description">{{ g.description }}</div>
          </div>
          <button class="btn btn-ghost" :disabled="joiningGroupId === g.id" @click="handleJoin(g.id)">
            {{ joiningGroupId === g.id ? 'Requesting…' : 'Request to Join' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.groups-page {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

h2 {
  font-size: 18px;
}

.sub-heading {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

.create-form {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  max-width: 420px;
}

.pending-note,
.empty-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 12px;
}

.group-card {
  text-decoration: none;
  color: inherit;
  display: block;
  cursor: pointer;
}

.browse-list {
  padding: 6px;
}

.browse-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.browse-row + .browse-row {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.browse-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
}

.browse-desc {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-dim);
  margin-top: 2px;
}
</style>
