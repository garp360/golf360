// A skin is won by whoever has the strict unique lowest score on a hole (a tie means no
// winner) and, if win_condition is 'birdie_or_better', that score must also beat par by at
// least one stroke. `entries` is [{ participantId, score }] for one hole.
function findQualifyingWinner(entries, par, winCondition) {
  if (!entries.length) return null
  const minScore = Math.min(...entries.map((e) => e.score))
  const winners = entries.filter((e) => e.score === minScore)
  if (winners.length !== 1) return null
  if (winCondition === 'birdie_or_better' && minScore - par > -1) return null
  return winners[0].participantId
}

// Resolves one hole's skin winner. In 'both' mode gross is checked first — a qualifying net
// score only wins if no qualifying gross score exists on that hole.
export function resolveHoleSkin({ mode, winCondition, grossEntries, netEntries, par }) {
  const grossWinner = mode !== 'net' ? findQualifyingWinner(grossEntries, par, winCondition) : null
  const netWinner = mode !== 'gross' ? findQualifyingWinner(netEntries, par, winCondition) : null

  if (mode === 'gross') {
    return grossWinner ? { winningType: 'gross', winnerParticipantId: grossWinner } : { winningType: 'none', winnerParticipantId: null }
  }
  if (mode === 'net') {
    return netWinner ? { winningType: 'net', winnerParticipantId: netWinner } : { winningType: 'none', winnerParticipantId: null }
  }
  // mode === 'both'
  if (grossWinner) return { winningType: 'gross', winnerParticipantId: grossWinner }
  if (netWinner) return { winningType: 'net', winnerParticipantId: netWinner }
  return { winningType: 'none', winnerParticipantId: null }
}
