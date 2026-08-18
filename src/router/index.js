import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('../views/auth/OnboardingView.vue'),
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/groups/GroupsListView.vue'),
  },
  {
    path: '/groups/:id',
    name: 'group-detail',
    component: () => import('../views/groups/GroupDetailView.vue'),
  },
  {
    path: '/courses',
    name: 'courses',
    component: () => import('../views/courses/CoursesListView.vue'),
  },
  {
    path: '/courses/:id',
    name: 'course-detail',
    component: () => import('../views/courses/CourseDetailView.vue'),
  },
  {
    path: '/events/:id',
    name: 'event-detail',
    component: () => import('../views/events/EventDetailView.vue'),
  },
  {
    path: '/rounds/:id',
    name: 'round-score',
    component: () => import('../views/events/RoundScoreView.vue'),
  },
  {
    path: '/rounds/:id/flights',
    name: 'round-flights',
    component: () => import('../views/events/EventFlightsView.vue'),
  },
  {
    path: '/events/:id/leaderboard',
    name: 'event-leaderboard',
    component: () => import('../views/events/EventLeaderboardView.vue'),
  },
  {
    path: '/events/:id/skins',
    name: 'event-skins',
    component: () => import('../views/events/EventSkinsView.vue'),
  },
  {
    path: '/events/:id/ctp',
    name: 'event-ctp',
    component: () => import('../views/events/EventCtpView.vue'),
  },
  {
    path: '/events/:id/financials',
    name: 'event-financials',
    component: () => import('../views/events/EventFinancialsView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (auth.isAuthenticated && !auth.isProfileComplete && to.name !== 'onboarding') {
    return { name: 'onboarding' }
  }

  if (auth.isAuthenticated && auth.isProfileComplete && to.name === 'onboarding') {
    return { name: 'dashboard' }
  }

  return true
})
