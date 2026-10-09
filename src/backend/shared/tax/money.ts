// Pure integer-paisa helpers. No Node or DOM imports: the renderer's preview, the PDF and the
// server all run this same code.

/**
 * Rounds half away from zero, the convention GST uses: 2.5 → 3 and -2.5 → -3.
 * `Math.round` rounds half towards +∞, which would give -2 for the second case.
 */
export const roundHalfUp = (value: number): number => (value < 0 ? -Math.round(-value) : Math.round(value));

/** A percentage as integer basis points, so 18 → 1800 and 2.5 → 250. */
export const toBasisPoints = (percent: number): number => roundHalfUp(percent * 100);

/**
 * `amount * basisPoints / 10000`, rounded half up. The multiplication stays exact while
 * `amount * basisPoints` is inside 2^53, which holds for any realistic invoice line: at the
 * highest slab that is about ₹2.2 × 10^11.
 */
export const applyBasisPoints = (amount: number, basisPoints: number): number =>
  roundHalfUp((amount * basisPoints) / 10000);

/**
 * Splits `total` across `weights` in proportion, as whole paisa that add back up to `total`
 * exactly. Each share is rounded half up, then the rounding residual is given to the heaviest
 * weight, so nothing is created or lost. An all-zero or empty set of weights gets nothing.
 */
export const allocate = (total: number, weights: number[]): number[] => {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0 || weightTotal <= 0) return weights.map(() => 0);

  const shares = weights.map(weight => roundHalfUp((weight * total) / weightTotal));
  const residual = total - shares.reduce((sum, share) => sum + share, 0);
  if (residual !== 0) {
    let heaviest = 0;
    weights.forEach((weight, index) => {
      if (weight > weights[heaviest]) heaviest = index;
    });
    shares[heaviest] += residual;
  }
  return shares;
};
