<script setup>
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <div class="shell-header-left">
        <span class="brand">Golf360</span>
        <nav class="shell-nav">
          <RouterLink :to="{ name: 'dashboard' }">Groups</RouterLink>
          <RouterLink :to="{ name: 'courses' }">Courses</RouterLink>
        </nav>
      </div>
      <button class="btn btn-ghost" @click="auth.signOut()">Sign out</button>
    </header>
    <main class="shell-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

.shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 32px;
}

.shell-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .shell {
    padding: 20px 16px 60px;
  }
}

.brand {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--ink);
}

.shell-nav {
  display: flex;
  gap: 20px;
}

.shell-nav a {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-faint);
  text-decoration: none;
}

.shell-nav a.router-link-active {
  color: var(--green);
}
</style>
