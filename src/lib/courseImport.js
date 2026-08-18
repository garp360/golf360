import { parseCsv } from './csv'

// Column format: one row per hole (18 rows), course_name/location repeated on every row
// (only the first row is read), tee box columns repeat per tee as tee{N}_name,
// tee{N}_rating, tee{N}_slope, tee{N}_yardage for N = 1, 2, 3, ...
export const CSV_TEMPLATE_HEADER = [
  'course_name',
  'location',
  'hole_number',
  'par',
  'stroke_index',
  'tee1_name',
  'tee1_rating',
  'tee1_slope',
  'tee1_yardage',
  'tee2_name',
  'tee2_rating',
  'tee2_slope',
  'tee2_yardage',
]

const TEMPLATE_HOLES = [
  { par: 4, si: 7, blue: 385, white: 355 },
  { par: 3, si: 15, blue: 165, white: 145 },
  { par: 5, si: 3, blue: 520, white: 490 },
  { par: 4, si: 11, blue: 400, white: 370 },
  { par: 4, si: 1, blue: 430, white: 400 },
  { par: 3, si: 17, blue: 155, white: 135 },
  { par: 5, si: 5, blue: 545, white: 505 },
  { par: 4, si: 9, blue: 375, white: 345 },
  { par: 4, si: 13, blue: 390, white: 360 },
  { par: 4, si: 8, blue: 410, white: 380 },
  { par: 3, si: 16, blue: 175, white: 150 },
  { par: 5, si: 2, blue: 535, white: 500 },
  { par: 4, si: 12, blue: 380, white: 350 },
  { par: 4, si: 4, blue: 425, white: 395 },
  { par: 3, si: 18, blue: 145, white: 125 },
  { par: 5, si: 6, blue: 515, white: 480 },
  { par: 4, si: 10, blue: 395, white: 365 },
  { par: 4, si: 14, blue: 405, white: 375 },
]

// Quotes a field if it contains a comma, quote, or newline — otherwise CSV columns
// silently shift when a value (e.g. "Anytown, USA") contains the delimiter itself.
function csvField(value) {
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsvTemplate() {
  const lines = [CSV_TEMPLATE_HEADER.join(',')]
  TEMPLATE_HOLES.forEach((h, i) => {
    const holeNumber = i + 1
    const courseName = holeNumber === 1 ? 'Sample Course' : ''
    const location = holeNumber === 1 ? 'Anytown, USA' : ''
    lines.push(
      [
        courseName,
        location,
        holeNumber,
        h.par,
        h.si,
        'Blue',
        74.2,
        138,
        h.blue,
        'White',
        71.0,
        126,
        h.white,
      ]
        .map(csvField)
        .join(',')
    )
  })
  return lines.join('\n')
}

export function parseCourseCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    throw new Error('CSV must have a header row and at least 18 data rows.')
  }

  const header = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1)
  const colIndex = (name) => header.indexOf(name)

  const required = ['course_name', 'hole_number', 'par', 'stroke_index']
  const missing = required.filter((name) => colIndex(name) === -1)
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`)
  }

  const teeNumbers = [
    ...new Set(
      header
        .map((h) => h.match(/^tee(\d+)_name$/))
        .filter(Boolean)
        .map((m) => Number(m[1]))
    ),
  ].sort((a, b) => a - b)
  if (!teeNumbers.length) {
    throw new Error('No tee box columns found (expected tee1_name, tee1_rating, tee1_slope, tee1_yardage, ...).')
  }

  const holes = []
  const teeBoxesByNumber = {}

  dataRows.forEach((row, i) => {
    const holeNumber = Number(row[colIndex('hole_number')])
    const par = Number(row[colIndex('par')])
    const strokeIndex = Number(row[colIndex('stroke_index')])
    if (!holeNumber || !par || !strokeIndex) {
      throw new Error(`Row ${i + 2}: hole_number, par, and stroke_index must all be numbers.`)
    }
    holes.push({ hole_number: holeNumber, par, stroke_index: strokeIndex })

    teeNumbers.forEach((n) => {
      const teeName = row[colIndex(`tee${n}_name`)]?.trim()
      if (!teeName) return
      if (!teeBoxesByNumber[n]) {
        teeBoxesByNumber[n] = {
          name: teeName,
          course_rating: Number(row[colIndex(`tee${n}_rating`)]),
          slope_rating: Number(row[colIndex(`tee${n}_slope`)]),
          yardages: {},
        }
      }
      const yardage = Number(row[colIndex(`tee${n}_yardage`)])
      if (yardage) teeBoxesByNumber[n].yardages[holeNumber] = yardage
    })
  })

  if (holes.length !== 18) {
    throw new Error(`Expected 18 hole rows, found ${holes.length}.`)
  }
  if (new Set(holes.map((h) => h.hole_number)).size !== 18) {
    throw new Error('hole_number values must be unique, 1–18.')
  }
  if (new Set(holes.map((h) => h.stroke_index)).size !== 18) {
    throw new Error('stroke_index values must be unique, 1–18.')
  }

  const courseName = dataRows[0][colIndex('course_name')]?.trim()
  if (!courseName) throw new Error('course_name is required on the first data row.')
  const locationIdx = colIndex('location')
  const location = locationIdx !== -1 ? dataRows[0][locationIdx]?.trim() : ''

  const teeBoxes = Object.values(teeBoxesByNumber)
  if (!teeBoxes.length) throw new Error('No tee box data found in the rows.')
  teeBoxes.forEach((tb) => {
    if (!tb.course_rating || !tb.slope_rating) {
      throw new Error(`Tee box "${tb.name}" is missing a course rating or slope rating.`)
    }
  })

  return {
    courseName,
    location,
    holes: holes.sort((a, b) => a.hole_number - b.hole_number),
    teeBoxes,
  }
}
