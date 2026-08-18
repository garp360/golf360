import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useGroupsStore = defineStore('groups', {
  state: () => ({
    myMemberships: [],
    allGroups: [],
    loading: false,
  }),

  getters: {
    myActiveGroups: (state) => state.myMemberships.filter((m) => m.status === 'active'),
    myPendingGroups: (state) => state.myMemberships.filter((m) => m.status === 'pending'),
    myAdminGroupIds: (state) =>
      new Set(
        state.myMemberships.filter((m) => m.status === 'active' && m.role === 'admin').map((m) => m.group_id)
      ),
  },

  actions: {
    async fetchMyMemberships() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return

      const { data, error } = await supabase
        .from('group_memberships')
        .select('*, group:groups(*)')
        .eq('user_id', userData.user.id)
      if (error) throw error
      this.myMemberships = data
    },

    async fetchAllGroups() {
      const { data, error } = await supabase.from('groups').select('*').order('name')
      if (error) throw error
      this.allGroups = data
    },

    async createGroup({ name, description }) {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('groups')
        .insert({ name, description, created_by: userData.user.id })
        .select()
        .single()
      if (error) throw error
      await this.fetchMyMemberships()
      await this.fetchAllGroups()
      return data
    },

    async requestToJoin(groupId) {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('group_memberships')
        .insert({ group_id: groupId, user_id: userData.user.id })
      if (error) throw error
      await this.fetchMyMemberships()
    },

    async fetchPendingRequests(groupId) {
      const { data, error } = await supabase
        .from('group_memberships')
        .select('*, user:users!group_memberships_user_id_fkey(*)')
        .eq('group_id', groupId)
        .eq('status', 'pending')
      if (error) throw error
      return data
    },

    async fetchGroupMembers(groupId) {
      const { data, error } = await supabase
        .from('group_memberships')
        .select('*, user:users!group_memberships_user_id_fkey(*)')
        .eq('group_id', groupId)
        .eq('status', 'active')
      if (error) throw error
      return data
    },

    async decideMembership(membershipId, status) {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('group_memberships')
        .update({ status, decided_at: new Date().toISOString(), decided_by: userData.user.id })
        .eq('id', membershipId)
      if (error) throw error
    },
  },
})
