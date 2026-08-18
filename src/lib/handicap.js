// USGA course handicap formula: handicap index adjusted for the specific tee played.
export function computeCourseHandicap(handicapIndex, slopeRating, courseRating, coursePar) {
  if (handicapIndex == null || slopeRating == null || courseRating == null || coursePar == null) {
    return null
  }
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - coursePar))
}

// Standard USGA stroke allocation: distribute a course handicap across 18 holes by stroke
// index. Works for handicaps above 18 (extra strokes on the hardest holes) and negative
// "plus" handicaps (strokes given back on the hardest holes), via floored division.
export function strokesReceivedOnHole(courseHandicap, strokeIndex) {
  if (courseHandicap == null) return 0
  const base = Math.floor(courseHandicap / 18)
  const remainder = courseHandicap - base * 18
  return base + (strokeIndex <= remainder ? 1 : 0)
}

// Net double bogey cap: the most strokes that can count toward a handicap differential on a
// given hole, based on the player's course handicap.
export function netDoubleBogeyCap(par, strokeIndex, courseHandicap) {
  return par + 2 + strokesReceivedOnHole(courseHandicap, strokeIndex)
}

// Handicap differential for one posted round.
export function computeDifferential(adjustedGrossTotal, courseRating, slopeRating) {
  return ((adjustedGrossTotal - courseRating) * 113) / slopeRating
}

// Handicap index = average of the best 3 differentials from the last 5 posted rounds.
// Degrades gracefully with fewer rounds; callers should treat roundsUsed < 3 as "no
// official handicap yet" for display purposes.
export function computeHandicapIndex(differentials) {
  const lastFive = [...differentials].sort((a, b) => b.playedAt - a.playedAt).slice(0, 5)
  const bestThree = [...lastFive].sort((a, b) => a.differential - b.differential).slice(0, 3)
  if (!bestThree.length) return { handicapIndex: null, roundsUsed: 0 }
  const average = bestThree.reduce((sum, d) => sum + d.differential, 0) / bestThree.length
  return { handicapIndex: Math.round(average * 10) / 10, roundsUsed: bestThree.length }
}
