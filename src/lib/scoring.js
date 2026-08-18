import { strokesReceivedOnHole } from './handicap'

// Custom Stableford scale (not the standard USGA one): points for a hole based on net
// score vs par. Net score = gross strokes minus strokes received on that hole.
export function stablefordPointsForHole(grossStrokes, par, strokeIndex, courseHandicap) {
  const netScore = grossStrokes - strokesReceivedOnHole(courseHandicap, strokeIndex)
  const diff = netScore - par
  if (diff <= -4) return 16 // condor
  if (diff === -3) return 8 // albatross
  if (diff === -2) return 4 // eagle
  if (diff === -1) return 2 // birdie
  if (diff === 0) return 1 // par
  if (diff === 1) return 0 // bogey
  return -1 // double bogey or worse
}

// A provisional (admin-entered) handicap restricts how much a round's Stableford total can
// swing: target = 36 - course handicap, clamped to target ± 3.
export function provisionalStablefordClamp(courseHandicap) {
  const target = 36 - courseHandicap
  return { min: target - 3, max: target + 3 }
}
