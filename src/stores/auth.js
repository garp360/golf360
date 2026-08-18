import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    session: null,
    profile: null,
    loading: true,
  }),

  getters: {
    isAuthenticated: (state) => !!state.session,
    isProfileComplete: (state) =>
      !!(state.profile && state.profile.first_name && state.profile.last_name && state.profile.gender),
  },

  actions: {
    async init() {
      const { data } = await supabase.auth.getSession()
      this.session = data.session
      this.user = data.session?.user ?? null
      if (this.user) {
        await this.fetchProfile()
      }
      this.loading = false

      supabase.auth.onAuthStateChange(async (_event, session) => {
        this.session = session
        this.user = session?.user ?? null
        if (this.user) {
          await this.fetchProfile()
        } else {
          this.profile = null
        }
      })
    },

    async fetchProfile() {
      const { data, error } = await supabase.from('users').select('*').eq('id', this.user.id).single()
      if (error) throw error
      this.profile = data
    },

    async completeProfile({ first_name, last_name, gender }) {
      const display_name = `${first_name} ${last_name}`.trim()
      const { error } = await supabase
        .from('users')
        .update({ first_name, last_name, gender, display_name })
        .eq('id', this.user.id)
      if (error) throw error
      await this.fetchProfile()
    },

    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    },

    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      this.user = null
      this.session = null
      this.profile = null
    },
  },
})
