/**
 * Pure Next-Best-Action helpers (no DB) so the selection logic is unit-testable.
 */

export const CHANNEL_WEIGHTS: Record<string, number> = {
  email: 1.0,
  sms: 0.7,
  push: 0.5,
  whatsapp: 0.6,
  call: 0.3,
};

/**
 * Pick the best channel by WEIGHTED score, returning the weighted score that
 * was used to choose. The previous implementation compared the weighted value
 * but stored the unweighted one and seeded the baseline with the unweighted
 * email score — so email got an unfair edge and the reported score was
 * inconsistent with the choice. Here the comparison basis and the returned
 * score are the same throughout.
 */
export function pickBestChannel(
  channelScores: Record<string, number>,
  weights: Record<string, number> = CHANNEL_WEIGHTS,
): { channel: string; score: number } {
  let bestChannel = 'email';
  let bestWeighted = (channelScores.email ?? 0) * (weights.email ?? 1);

  for (const [ch, sc] of Object.entries(channelScores)) {
    const weighted = sc * (weights[ch] ?? 1);
    if (weighted > bestWeighted) {
      bestChannel = ch;
      bestWeighted = weighted;
    }
  }

  return { channel: bestChannel, score: Math.round(bestWeighted * 100) / 100 };
}
