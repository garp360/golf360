<script setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppShell from './components/layout/AppShell.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// Router guards only run on navigation. Auth state can also change without a
// navigation (e.g. signing out) — this keeps the route in sync with it either way.
watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated && route.name === 'login') {
      router.replace({ name: 'dashboard' })
    } else if (!isAuthenticated && !route.meta.public) {
      router.replace({ name: 'login' })
    }
  }
)
</script>

<template>
  <div class="contours"></div>
  <AppShell v-if="auth.isAuthenticated && auth.isProfileComplete">
    <router-view />
  </AppShell>
  <router-view v-else />
</template>
