import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { provisionalStablefordClamp, stablefordPointsForHole } from '../lib/scoring'

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    ;(acc[item[key]] ||= []).push(item)
    return acc
  }, {})
}

export const useScoringStore = defineStore('scoring', {
  actions: {
    async fetchScoringConfig(eventId) {
      const { data, error } = await supabase
        .from('event_scoring_configs')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async saveScoringConfig(eventId, { format, payout_places, payout_splits }) {
      const { error } = await supabase
        .from('event_scoring_configs')
        .upsert({ event_id: eventId, format, payout_places, payout_splits }, { onConflict: 'event_id' })
      if (error) throw error
    },

    // Computes live standings from current scores — not persisted. Call finalizeResults
    // separately to snapshot them into scoring_results once the event is done.
    async computeStandings(eventId, config) {
      const { data: rounds, error: roundsError } = await supabase
        .from('event_rounds')
        .select('*, event_course:event_courses(course:courses(holes(*)))')
        .eq('event_id', eventId)
      if (roundsError) throw roundsError

      const { data: participants, error: participantsError } = await supabase
        .from('event_participants')
        .select('*, user:users(*), tee_box:tee_boxes(*)')
        .eq('event_id', eventId)
        .eq('status', 'registered')
      if (participantsError) throw participantsError

      const roundIds = rounds.map((r) => r.id)
      const holesByRound = Object.fromEntries(
        rounds.map((r) => [r.id, Object.fromEntries(r.event_course.course.holes.map((h) => [h.id, h]))])
      )
      const totalParPerRound = Object.fromEntries(
        rounds.map((r) => [r.id, r.event_course.course.holes.reduce((sum, h) => sum + h.par, 0)])
      )

      let scores = []
      if (roundIds.length) {
        const { data, error } = await supabase.from('scores').select('*').in('event_round_id', roundIds)
        if (error) throw error
        scores = data
      }

      const standings = participants.map((p) => {
        const myScores = scores.filter((s) => s.participant_id === p.id)
        const courseHandicap = p.course_handicap ?? 0
        const byRound = groupBy(myScores, 'event_round_id')

        let totalScore = 0
        let totalPar = 0

        if (config.format === 'medal_gross') {
          totalScore = myScores.reduce((sum, s) => sum + s.gross_strokes, 0)
          totalPar = Object.keys(byRound).reduce((sum, roundId) => sum + totalParPerRound[roundId], 0)
        } else if (config.format === 'medal_net') {
          totalScore = Object.entries(byRound).reduce((sum, [roundId, roundScores]) => {
            const roundGross = roundScores.reduce((s, sc) => s + sc.gross_strokes, 0)
            return sum + (roundGross - courseHandicap)
          }, 0)
          totalPar = Object.keys(byRound).reduce((sum, roundId) => sum + totalParPerRound[roundId], 0)
        } else if (config.format === 'stableford') {
          totalScore = Object.entries(byRound).reduce((sum, [roundId, roundScores]) => {
            let roundPoints = roundScores.reduce((s, sc) => {
              const hole = holesByRound[roundId][sc.hole_id]
              return s + stablefordPointsForHole(sc.gross_strokes, hole.par, hole.stroke_index, courseHandicap)
            }, 0)
            if (p.is_provisional_handicap) {
              const { min, max } = provisionalStablefordClamp(courseHandicap)
              roundPoints = Math.min(max, Math.max(min, roundPoints))
            }
            return sum + roundPoints
          }, 0)
        }

        return {
          participant: p,
          totalScore,
          totalPar,
          holesPlayed: myScores.length,
        }
      })

      const started = standings.filter((s) => s.holesPlayed > 0)
      const notStarted = standings.filter((s) => s.holesPlayed === 0)

      const ascending = config.format !== 'stableford'
      started.sort((a, b) => (ascending ? a.totalScore - b.totalScore : b.totalScore - a.totalScore))
      started.forEach((s, i) => {
        s.rank = i + 1
      })

      const totalHoles = rounds.reduce((sum, r) => sum + r.event_course.course.holes.length, 0)

      return { started, notStarted, totalHoles }
    },

    // scoringPool is optional — omit it (or pass null) to finalize standings without payouts,
    // e.g. before financials are set up for the event.
    async finalizeResults(eventId, standings, config, scoringPool) {
      const payoutByRank = {}
      if (scoringPool != null) {
        for (let i = 0; i < config.payout_places; i++) {
          payoutByRank[i + 1] = Math.round((scoringPool * (config.payout_splits[i] || 0)) / 100)
        }
      }

      const rows = standings.map((s) => ({
        event_id: eventId,
        participant_id: s.participant.id,
        total_score: s.totalScore,
        rank: s.rank,
        payout_amount: payoutByRank[s.rank] ?? null,
      }))
      if (!rows.length) return
      const { error } = await supabase.from('scoring_results').upsert(rows, { onConflict: 'event_id,participant_id' })
      if (error) throw error
    },
  },
})
