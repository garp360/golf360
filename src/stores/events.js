import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { computeCourseHandicap } from '../lib/handicap'

export const useEventsStore = defineStore('events', {
  state: () => ({
    groupEvents: [],
  }),

  actions: {
    async fetchGroupEvents(groupId) {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('group_id', groupId)
        .order('event_date', { ascending: false })
      if (error) throw error
      this.groupEvents = data
    },

    async createEvent(groupId, { name, event_date }) {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('events')
        .insert({ group_id: groupId, name, event_date, created_by: userData.user.id })
        .select()
        .single()
      if (error) throw error
      await this.fetchGroupEvents(groupId)
      return data
    },

    async updateEventStatus(eventId, status) {
      const { error } = await supabase.from('events').update({ status }).eq('id', eventId)
      if (error) throw error
    },

    async fetchEventDetail(eventId) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*, group:groups(*)')
        .eq('id', eventId)
        .single()
      if (eventError) throw eventError

      const { data: eventCourses, error: coursesError } = await supabase
        .from('event_courses')
        .select('*, course:courses(*, holes(*), tee_boxes(*))')
        .eq('event_id', eventId)
      if (coursesError) throw coursesError

      const { data: eventRounds, error: roundsError } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', eventId)
        .order('round_number')
      if (roundsError) throw roundsError

      const { data: participants, error: participantsError } = await supabase
        .from('event_participants')
        .select('*, user:users(*), tee_box:tee_boxes(*, course:courses(*, holes(*)))')
        .eq('event_id', eventId)
        .order('signed_up_at')
      if (participantsError) throw participantsError

      return { event, eventCourses, eventRounds, participants }
    },

    async addEventCourse(eventId, courseId) {
      const { error } = await supabase.from('event_courses').insert({ event_id: eventId, course_id: courseId })
      if (error) throw error
    },

    async addEventRound(eventId, eventCourseId, roundNumber, roundDate) {
      const { error } = await supabase.from('event_rounds').insert({
        event_id: eventId,
        event_course_id: eventCourseId,
        round_number: roundNumber,
        round_date: roundDate,
      })
      if (error) throw error
    },

    async signUp(eventId, teeBoxId) {
      const { data: userData } = await supabase.auth.getUser()

      // Upsert rather than insert: re-signing up after a withdrawal hits the same
      // (event_id, user_id) row rather than a fresh one, since a withdrawn participant
      // still has a row (status = 'withdrawn') for that unique pair.
      // No official handicap yet at (re-)signup time — the handicap engine (once posted
      // rounds exist) or an admin-entered provisional index fill this in later.
      const { error } = await supabase.from('event_participants').upsert(
        {
          event_id: eventId,
          user_id: userData.user.id,
          tee_box_id: teeBoxId,
          status: 'registered',
          handicap_index_at_signup: null,
          is_provisional_handicap: false,
          course_handicap: null,
          paid: false,
          checked_in: false,
          signed_up_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' }
      )
      if (error) throw error
    },

    async withdraw(participantId) {
      const { error } = await supabase
        .from('event_participants')
        .update({ status: 'withdrawn' })
        .eq('id', participantId)
      if (error) throw error
    },

    async updateParticipantFlags(participantId, { paid, checked_in }) {
      const { error } = await supabase.from('event_participants').update({ paid, checked_in }).eq('id', participantId)
      if (error) throw error
    },

    async setProvisionalHandicap(participant, handicapIndex) {
      const teeBox = participant.tee_box
      const coursePar = teeBox.course.holes.reduce((sum, h) => sum + h.par, 0)
      const courseHandicap = computeCourseHandicap(handicapIndex, teeBox.slope_rating, teeBox.course_rating, coursePar)

      const { error } = await supabase
        .from('event_participants')
        .update({
          handicap_index_at_signup: handicapIndex,
          is_provisional_handicap: true,
          course_handicap: courseHandicap,
        })
        .eq('id', participant.id)
      if (error) throw error
    },
  },
})
