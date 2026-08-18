import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useFlightsStore = defineStore('flights', {
  actions: {
    async fetchRound(eventRoundId) {
      const { data, error } = await supabase
        .from('event_rounds')
        .select('*, event_course:event_courses(course:courses(name))')
        .eq('id', eventRoundId)
        .single()
      if (error) throw error
      return data
    },

    async fetchFlights(eventRoundId) {
      const { data, error } = await supabase
        .from('event_flights')
        .select('*, members:event_flight_members(*, participant:event_participants(*, user:users(*)))')
        .eq('event_round_id', eventRoundId)
        .order('flight_number')
      if (error) throw error
      return data
    },

    async fetchUnassignedParticipants(eventId, eventRoundId) {
      const { data: participants, error: participantsError } = await supabase
        .from('event_participants')
        .select('*, user:users(*)')
        .eq('event_id', eventId)
        .eq('status', 'registered')
      if (participantsError) throw participantsError

      const { data: assigned, error: assignedError } = await supabase
        .from('event_flight_members')
        .select('participant_id')
        .eq('event_round_id', eventRoundId)
      if (assignedError) throw assignedError

      const assignedIds = new Set(assigned.map((a) => a.participant_id))
      return participants.filter((p) => !assignedIds.has(p.id))
    },

    async createFlight(eventRoundId, flightNumber, teeTime) {
      const { error } = await supabase
        .from('event_flights')
        .insert({ event_round_id: eventRoundId, flight_number: flightNumber, tee_time: teeTime || null })
      if (error) throw error
    },

    async deleteFlight(flightId) {
      const { error } = await supabase.from('event_flights').delete().eq('id', flightId)
      if (error) throw error
    },

    async assignParticipant(flightId, eventRoundId, participantId) {
      const { error } = await supabase
        .from('event_flight_members')
        .insert({ flight_id: flightId, event_round_id: eventRoundId, participant_id: participantId })
      if (error) throw error
    },

    async removeParticipant(flightMemberId) {
      const { error } = await supabase.from('event_flight_members').delete().eq('id', flightMemberId)
      if (error) throw error
    },
  },
})
