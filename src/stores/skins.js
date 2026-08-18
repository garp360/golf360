import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { strokesReceivedOnHole } from '../lib/handicap'
import { resolveHoleSkin } from '../lib/skins'

export const useSkinsStore = defineStore('skins', {
  actions: {
    async fetchSkinsConfig(eventId) {
      const { data, error } = await supabase
        .from('event_skins_configs')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async saveSkinsConfig(eventId, { enabled, mode, win_condition, pool_amount }) {
      const { error } = await supabase
        .from('event_skins_configs')
        .upsert({ event_id: eventId, enabled, mode, win_condition, pool_amount }, { onConflict: 'event_id' })
      if (error) throw error
    },

    async fetchCarryover(groupId) {
      const { data, error } = await supabase
        .from('skins_pot_carryovers')
        .select('*')
        .eq('group_id', groupId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    // Live preview — not persisted. Assumes each participant has at most one score per
    // physical hole for the event (true for single-round events; the schema's
    // unique(event_id, hole_id) on skins_results doesn't distinguish rounds on a shared course).
    async computeResults(eventId, config) {
      const { data: rounds, error: roundsError } = await supabase
        .from('event_rounds')
        .select('id, event_course:event_courses(course:courses(holes(*)))')
        .eq('event_id', eventId)
      if (roundsError) throw roundsError

      const { data: participants, error: participantsError } = await supabase
        .from('event_participants')
        .select('id, user:users(*), course_handicap')
        .eq('event_id', eventId)
        .eq('status', 'registered')
      if (participantsError) throw participantsError

      const roundIds = rounds.map((r) => r.id)
      let scores = []
      if (roundIds.length) {
        const { data, error } = await supabase.from('scores').select('*').in('event_round_id', roundIds)
        if (error) throw error
        scores = data
      }

      const courseHandicapByParticipant = Object.fromEntries(participants.map((p) => [p.id, p.course_handicap ?? 0]))
      const userByParticipant = Object.fromEntries(participants.map((p) => [p.id, p.user]))

      const holes = []
      const seenHoleIds = new Set()
      rounds.forEach((r) => {
        r.event_course.course.holes.forEach((h) => {
          if (!seenHoleIds.has(h.id)) {
            seenHoleIds.add(h.id)
            holes.push(h)
          }
        })
      })
      holes.sort((a, b) => a.hole_number - b.hole_number)

      const holeResults = holes.map((hole) => {
        const holeScores = scores.filter((s) => s.hole_id === hole.id)
        const grossEntries = holeScores.map((s) => ({ participantId: s.participant_id, score: s.gross_strokes }))
        const netEntries = holeScores.map((s) => ({
          participantId: s.participant_id,
          score: s.gross_strokes - strokesReceivedOnHole(courseHandicapByParticipant[s.participant_id], hole.stroke_index),
        }))

        const { winningType, winnerParticipantId } = resolveHoleSkin({
          mode: config.mode,
          winCondition: config.win_condition,
          grossEntries,
          netEntries,
          par: hole.par,
        })

        return {
          hole,
          winningType,
          winnerParticipantId,
          winnerName: winnerParticipantId ? userByParticipant[winnerParticipantId]?.display_name || userByParticipant[winnerParticipantId]?.email : null,
        }
      })

      const skinsWon = holeResults.filter((r) => r.winningType !== 'none')
      return { holeResults, skinsWonCount: skinsWon.length }
    },

    async finalizeSkins(eventId, groupId, config, holeResults) {
      const carryover = await this.fetchCarryover(groupId)
      const carriedAmount = carryover?.carried_amount ?? 0
      const effectivePot = Number(config.pool_amount) + Number(carriedAmount)

      const skinsWon = holeResults.filter((r) => r.winningType !== 'none')
      const payoutPerSkin = skinsWon.length ? Math.round(effectivePot / skinsWon.length) : 0

      const rows = holeResults.map((r) => ({
        event_id: eventId,
        hole_id: r.hole.id,
        winning_type: r.winningType,
        winner_participant_id: r.winnerParticipantId,
        payout_amount: r.winningType !== 'none' ? payoutPerSkin : null,
      }))
      const { error } = await supabase.from('skins_results').upsert(rows, { onConflict: 'event_id,hole_id' })
      if (error) throw error

      const newCarriedAmount = skinsWon.length ? 0 : effectivePot
      const { error: carryoverError } = await supabase.from('skins_pot_carryovers').upsert(
        {
          group_id: groupId,
          carried_amount: newCarriedAmount,
          originating_event_id: eventId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_id' }
      )
      if (carryoverError) throw carryoverError

      return { effectivePot, payoutPerSkin, skinsWonCount: skinsWon.length }
    },
  },
})
