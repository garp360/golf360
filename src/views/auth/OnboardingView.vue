<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({ first_name: '', last_name: '', gender: '' })
const submitting = ref(false)
const error = ref('')

const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
]

async function handleSubmit() {
  if (!form.first_name.trim() || !form.last_name.trim() || !form.gender) {
    error.value = 'All fields are required.'
    return
  }
  error.value = ''
  submitting.value = true
  try {
    await auth.completeProfile({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender,
    })
    router.push({ name: 'dashboard' })
  } catch (e) {
    error.value = e.message || 'Something went wrong.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="onboarding-page">
    <div class="glass onboarding-card">
      <div class="eyebrow">Golf360</div>
      <h1>Complete your profile</h1>
      <p class="sub">Just need a couple of details before you get started.</p>

      <div class="field">
        <label for="first-name">First Name</label>
        <input id="first-name" v-model="form.first_name" type="text" @keyup.enter="handleSubmit" />
      </div>
      <div class="field">
        <label for="last-name">Last Name</label>
        <input id="last-name" v-model="form.last_name" type="text" @keyup.enter="handleSubmit" />
      </div>
      <div class="field">
        <label for="gender">Gender</label>
        <select id="gender" v-model="form.gender">
          <option value="" disabled>Select…</option>
          <option v-for="g in genderOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
      </div>

      <p v-if="error" class="error-note">{{ error }}</p>

      <button class="btn btn-primary submit-btn" :disabled="submitting" @click="handleSubmit">
        {{ submitting ? 'Saving…' : 'Continue' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.onboarding-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.onboarding-card {
  padding: 40px;
  max-width: 380px;
  width: 100%;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 14px;
  text-align: center;
}

h1 {
  font-size: 24px;
  margin-bottom: 10px;
  text-align: center;
}

.sub {
  color: var(--ink-dim);
  font-size: 14px;
  margin-bottom: 28px;
  text-align: center;
}

.field {
  margin-bottom: 16px;
}

.field select {
  width: 100%;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 12px;
}

.error-note {
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: 12px;
  margin-bottom: 12px;
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
}
</style>
