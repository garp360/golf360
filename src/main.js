import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/theme.css'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(createPinia())

// Router guards read auth.isAuthenticated synchronously, so the session must be
// resolved before the router's first navigation runs — otherwise a valid session
// still loses the initial guard check and gets stuck redirected to /login.
const auth = useAuthStore()
await auth.init()

app.use(router)
app.mount('#app')
