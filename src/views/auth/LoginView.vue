<script setup>
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()

async function handleGoogleSignIn() {
  await auth.signInWithGoogle()
}
</script>

<template>
  <div class="login-page">
    <div class="glass login-card">
      <div class="eyebrow">Golf360</div>
      <h1>Sign in</h1>
      <p class="sub">Sign in with Google to view your groups and events.</p>
      <button class="btn btn-primary" @click="handleGoogleSignIn">Continue with Google</button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  padding: 40px;
  max-width: 380px;
  width: 100%;
  text-align: center;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 14px;
}

h1 {
  font-size: 28px;
  margin-bottom: 10px;
}

.sub {
  color: var(--ink-dim);
  font-size: 14px;
  margin-bottom: 28px;
}

.btn {
  width: 100%;
}
</style>
