import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { computeDifferential, computeHandicapIndex, netDoubleBogeyCap } from '../lib/handicap'

export const useHandicapStore = defineStore('handicap', {
  actions: {
    async fetchRoundContext(eventRoundId) {
      const { data: round, error: roundError } = await supabase
        .from('event_rounds')
        .select('*, event_course:event_courses(*, course:courses(*, holes(*)))')
        .eq('id', eventRoundId)
        .single()
      if (roundError) throw roundError

      const { data: participants, error: participantsError } = await supabase
        .from('event_participants')
        .select('*, user:users(*), tee_box:tee_boxes(*)')
        .eq('event_id', round.event_id)
        .eq('status', 'registered')
      if (participantsError) throw participantsError

      const holes = [...round.event_course.course.holes].sort((a, b) => a.hole_number - b.hole_number)
      return { round, holes, participants }
    },

    async fetchScores(eventRoundId, participantId) {
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('event_round_id', eventRoundId)
        .eq('participant_id', participantId)
      if (error) throw error
      return data
    },

    // Saves gross strokes for all 18 holes, computing the net double bogey cap and adjusted
    // gross per hole from the participant's course handicap (falling back to 0 / scratch if
    // they don't have one yet), then rolls the round up into a differential and recomputes
    // the player's handicap snapshot.
    async saveRoundScores(round, participant, holeScores) {
      const { data: userData } = await supabase.auth.getUser()
      const courseHandicap = participant.course_handicap ?? 0

      const rows = holeScores.map(({ hole, grossStrokes }) => {
        const cap = netDoubleBogeyCap(hole.par, hole.stroke_index, courseHandicap)
        return {
          event_round_id: round.id,
          participant_id: participant.id,
          hole_id: hole.id,
          gross_strokes: grossStrokes,
          net_double_bogey_cap: cap,
          adjusted_gross_strokes: Math.min(grossStrokes, cap),
          entered_by: userData.user.id,
        }
      })

      const { error } = await supabase
        .from('scores')
        .upsert(rows, { onConflict: 'event_round_id,participant_id,hole_id' })
      if (error) throw error

      await this.recomputeRoundDifferential(round, participant)
      await this.recomputeHandicapSnapshot(participant.user_id)
    },

    async recomputeRoundDifferential(round, participant) {
      const { data: scores, error: scoresError } = await supabase
        .from('scores')
        .select('adjusted_gross_strokes')
        .eq('event_round_id', round.id)
        .eq('participant_id', participant.id)
      if (scoresError) throw scoresError

      const adjustedGrossTotal = scores.reduce((sum, s) => sum + s.adjusted_gross_strokes, 0)
      const teeBox = participant.tee_box
      const differential = computeDifferential(adjustedGrossTotal, teeBox.course_rating, teeBox.slope_rating)

      const { error } = await supabase.from('round_differentials').upsert(
        {
          user_id: participant.user_id,
          event_round_id: round.id,
          adjusted_gross_total: adjustedGrossTotal,
          course_rating: teeBox.course_rating,
          slope_rating: teeBox.slope_rating,
          differential,
          played_at: round.round_date,
        },
        { onConflict: 'user_id,event_round_id' }
      )
      if (error) throw error
    },

    async recomputeHandicapSnapshot(userId) {
      const { data, error } = await supabase
        .from('round_differentials')
        .select('differential, played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(5)
      if (error) throw error
      if (!data.length) return

      const { handicapIndex, roundsUsed } = computeHandicapIndex(
        data.map((d) => ({ differential: d.differential, playedAt: new Date(d.played_at).getTime() }))
      )

      const { error: insertError } = await supabase.from('handicap_snapshots').insert({
        user_id: userId,
        handicap_index: handicapIndex,
        rounds_used: roundsUsed,
      })
      if (insertError) throw insertError
    },

    async fetchLatestHandicapSnapshot(userId) {
      const { data, error } = await supabase
        .from('handicap_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  },
})
