import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useFinancialsStore = defineStore('financials', {
  actions: {
    async fetchFinancials(eventId) {
      const { data, error } = await supabase
        .from('event_financials')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async saveFinancials(eventId, { entry_fee, scoring_pool_per_player, skins_pool_per_player, ctp_pool_per_player }) {
      const { error } = await supabase.from('event_financials').upsert(
        { event_id: eventId, entry_fee, scoring_pool_per_player, skins_pool_per_player, ctp_pool_per_player },
        { onConflict: 'event_id' }
      )
      if (error) throw error
    },

    async fetchPaidCount(eventId) {
      const { count, error } = await supabase
        .from('event_participants')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered')
        .eq('paid', true)
      if (error) throw error
      return count ?? 0
    },

    // Keeps the skins config's pool_amount in sync with financials × paid participants.
    // Only applies if a skins config already exists for the event.
    async syncSkinsPool(eventId, skinsPool) {
      const { error } = await supabase
        .from('event_skins_configs')
        .update({ pool_amount: skinsPool })
        .eq('event_id', eventId)
      if (error) throw error
    },
  },
})
