import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useCtpStore = defineStore('ctp', {
  actions: {
    async fetchAvailablePar3Holes(eventId) {
      const { data: eventCourses, error } = await supabase
        .from('event_courses')
        .select('course:courses(holes(*))')
        .eq('event_id', eventId)
      if (error) throw error

      const seen = new Set()
      const holes = []
      eventCourses.forEach((ec) => {
        ec.course.holes
          .filter((h) => h.par === 3)
          .forEach((h) => {
            if (!seen.has(h.id)) {
              seen.add(h.id)
              holes.push(h)
            }
          })
      })
      return holes.sort((a, b) => a.hole_number - b.hole_number)
    },

    async fetchEventCtpHoles(eventId) {
      const { data, error } = await supabase
        .from('event_ctp_holes')
        .select('*, hole:holes(*), result:ctp_results(*, winner:event_participants(*, user:users(*)))')
        .eq('event_id', eventId)
      if (error) throw error
      // ctp_results has a unique FK to event_ctp_holes, so PostgREST embeds it as a
      // to-one relationship (an object or null), not an array.
      return data
    },

    async addCtpHole(eventId, holeId, prizeAmount) {
      const { error } = await supabase
        .from('event_ctp_holes')
        .insert({ event_id: eventId, hole_id: holeId, prize_amount: prizeAmount })
      if (error) throw error
    },

    async removeCtpHole(id) {
      const { error } = await supabase.from('event_ctp_holes').delete().eq('id', id)
      if (error) throw error
    },

    async recordWinner(eventCtpHoleId, winnerParticipantId) {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('ctp_results').upsert(
        {
          event_ctp_hole_id: eventCtpHoleId,
          winner_participant_id: winnerParticipantId,
          recorded_by: userData.user.id,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: 'event_ctp_hole_id' }
      )
      if (error) throw error
    },
  },
})
