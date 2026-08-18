import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

const DEFAULT_HOLE_COUNT = 18

export const useCoursesStore = defineStore('courses', {
  state: () => ({
    courses: [],
  }),

  actions: {
    async fetchCourses() {
      const { data, error } = await supabase.from('courses').select('*').order('name')
      if (error) throw error
      this.courses = data
    },

    async fetchCourseDetail(courseId) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()
      if (courseError) throw courseError

      const { data: holes, error: holesError } = await supabase
        .from('holes')
        .select('*')
        .eq('course_id', courseId)
        .order('hole_number')
      if (holesError) throw holesError

      const { data: teeBoxes, error: teeBoxesError } = await supabase
        .from('tee_boxes')
        .select('*, tee_box_hole_yardages(*)')
        .eq('course_id', courseId)
        .order('name')
      if (teeBoxesError) throw teeBoxesError

      return { course, holes, teeBoxes }
    },

    async createCourse({ name, location }) {
      const { data: course, error } = await supabase
        .from('courses')
        .insert({ name, location: location || null })
        .select()
        .single()
      if (error) throw error

      const defaultHoles = Array.from({ length: DEFAULT_HOLE_COUNT }, (_, i) => ({
        course_id: course.id,
        hole_number: i + 1,
        par: 4,
        stroke_index: i + 1,
      }))
      const { error: holesError } = await supabase.from('holes').insert(defaultHoles)
      if (holesError) throw holesError

      await this.fetchCourses()
      return course
    },

    async updateCourse(courseId, { name, location }) {
      const { error } = await supabase
        .from('courses')
        .update({ name, location: location || null })
        .eq('id', courseId)
      if (error) throw error
    },

    async saveHoles(courseId, holes) {
      const payload = holes.map((h) => ({ hole_number: h.hole_number, par: h.par, stroke_index: h.stroke_index }))
      const { error } = await supabase.rpc('admin_upsert_holes', {
        p_course_id: courseId,
        p_holes: payload,
      })
      if (error) throw error
    },

    async createTeeBox(courseId, { name, course_rating, slope_rating, total_yardage }) {
      const { data, error } = await supabase
        .from('tee_boxes')
        .insert({
          course_id: courseId,
          name,
          course_rating,
          slope_rating,
          total_yardage: total_yardage || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },

    async updateTeeBox(teeBoxId, { name, course_rating, slope_rating, total_yardage }) {
      const { error } = await supabase
        .from('tee_boxes')
        .update({ name, course_rating, slope_rating, total_yardage: total_yardage || null })
        .eq('id', teeBoxId)
      if (error) throw error
    },

    async deleteTeeBox(teeBoxId) {
      const { error } = await supabase.from('tee_boxes').delete().eq('id', teeBoxId)
      if (error) throw error
    },

    async saveYardages(teeBoxId, yardages) {
      const rows = yardages.filter((y) => y.yardage).map((y) => ({
        tee_box_id: teeBoxId,
        hole_id: y.hole_id,
        yardage: y.yardage,
      }))
      if (!rows.length) return
      const { error } = await supabase.from('tee_box_hole_yardages').upsert(rows, {
        onConflict: 'tee_box_id,hole_id',
      })
      if (error) throw error
    },

    async importCourseFromCsv(parsed) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ name: parsed.courseName, location: parsed.location || null })
        .select()
        .single()
      if (courseError) throw courseError

      const holesPayload = parsed.holes.map((h) => ({
        course_id: course.id,
        hole_number: h.hole_number,
        par: h.par,
        stroke_index: h.stroke_index,
      }))
      const { data: insertedHoles, error: holesError } = await supabase.from('holes').insert(holesPayload).select()
      if (holesError) throw holesError

      const holeIdByNumber = Object.fromEntries(insertedHoles.map((h) => [h.hole_number, h.id]))

      for (const tee of parsed.teeBoxes) {
        const totalYardage = Object.values(tee.yardages).reduce((sum, y) => sum + y, 0)
        const { data: teeBox, error: teeError } = await supabase
          .from('tee_boxes')
          .insert({
            course_id: course.id,
            name: tee.name,
            course_rating: tee.course_rating,
            slope_rating: tee.slope_rating,
            total_yardage: totalYardage || null,
          })
          .select()
          .single()
        if (teeError) throw teeError

        const yardageRows = Object.entries(tee.yardages).map(([holeNumber, yardage]) => ({
          tee_box_id: teeBox.id,
          hole_id: holeIdByNumber[Number(holeNumber)],
          yardage,
        }))
        if (yardageRows.length) {
          const { error: yardageError } = await supabase.from('tee_box_hole_yardages').insert(yardageRows)
          if (yardageError) throw yardageError
        }
      }

      await this.fetchCourses()
      return course
    },
  },
})
