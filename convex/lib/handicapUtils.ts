/**
 * Shared Handicap Calculation Utilities
 * 
 * This file contains the official WHS (World Handicap System) formula
 * and related utilities. ALL handicap calculations should use these functions.
 */

/**
 * Official WHS table for number of differentials used and adjustments.
 * Returns the handicap and which indices were used in the calculation.
 */
export function calculateHandicapWithSelection(
    differentials: number[]
): { handicap: number | null; usedIndices: number[] } {
    if (!differentials.length) {
        return { handicap: null, usedIndices: [] };
    }

    // Use at most the most recent 20 scores
    const limited = differentials.slice(0, 20);
    const annotated = limited.map((diff, index) => ({ diff, index }));
    const count = annotated.length;

    // Official WHS table for number of differentials used and adjustments
    let scoresUsed = 0;
    let adjustment = 0;  // Positive values are SUBTRACTED from average

    if (count <= 2) {
        // Need at least 3 scores for official handicap (provisional otherwise)
        scoresUsed = 1;
        adjustment = 0;
    } else if (count === 3) {
        scoresUsed = 1;
        adjustment = 2.0;  // Subtract 2.0 to make it harder
    } else if (count === 4) {
        scoresUsed = 1;
        adjustment = 1.0;
    } else if (count === 5) {
        scoresUsed = 1;
        adjustment = 0;
    } else if (count === 6) {
        scoresUsed = 2;
        adjustment = 1.0;
    } else if (count >= 7 && count <= 8) {
        scoresUsed = 2;
        adjustment = 0;
    } else if (count >= 9 && count <= 11) {
        scoresUsed = 3;
        adjustment = 0;
    } else if (count >= 12 && count <= 14) {
        scoresUsed = 4;
        adjustment = 0;
    } else if (count >= 15 && count <= 16) {
        scoresUsed = 5;
        adjustment = 0;
    } else if (count >= 17 && count <= 18) {
        scoresUsed = 6;
        adjustment = 0;
    } else if (count === 19) {
        scoresUsed = 7;
        adjustment = 0;
    } else {
        // 20+ scores
        scoresUsed = 8;
        adjustment = 0;
    }

    const usedSorted = [...annotated]
        .sort((a, b) => a.diff - b.diff)  // Sort by differential (lowest = best)
        .slice(0, scoresUsed);

    const sum = usedSorted.reduce((acc, item) => acc + item.diff, 0);
    const average = sum / scoresUsed;
    // Per WHS: subtract adjustment (makes handicap lower/harder for few rounds)
    // Floor at 0.0 (no negative handicaps displayed)
    const rawHandicap = Math.round((average - adjustment) * 10) / 10;
    const handicap = Math.max(0, rawHandicap);
    const usedIndices = usedSorted.map((item) => item.index);

    return { handicap, usedIndices };
}

/**
 * Calculate handicap from differentials (simple wrapper).
 * Returns just the handicap value, or null if not enough data.
 */
export function calculateHandicapFromDiffs(differentials: number[]): number | null {
    return calculateHandicapWithSelection(differentials).handicap;
}

/**
 * Calculate handicap differential from score, rating, and slope.
 * Formula: (Adjusted Gross Score - Course Rating) × 113 / Slope Rating
 */
export function calculateDifferential(
    adjustedGrossScore: number,
    courseRating: number,
    slopeRating: number
): number {
    return ((adjustedGrossScore - courseRating) * 113) / slopeRating;
}

/**
 * Validate a differential value and log warning if suspicious.
 * Returns true if valid, false if suspicious (but still usable).
 */
export function validateDifferential(
    differential: number,
    context?: { courseName?: string; grossScore?: number }
): boolean {
    const MIN_REASONABLE = -10;
    const MAX_REASONABLE = 60;

    if (differential < MIN_REASONABLE || differential > MAX_REASONABLE) {
        console.warn(
            `[Handicap] Unusual differential ${differential.toFixed(1)}`,
            context ? `for ${context.courseName || "unknown course"} (score: ${context.grossScore})` : ""
        );
        return false;
    }
    return true;
}

/**
 * Apply equitable stroke control (ESC) cap per WHS.
 * Caps the maximum score on any hole to Par + N based on Course Handicap.
 */
export function applyESC(
    holeScores: { hole: number; score: number; par: number }[],
    courseHandicap?: number
): { hole: number; score: number; par: number }[] {
    // Default cap: Par + 3 (double bogey + 1)
    // This is a simplified version - full WHS has different caps based on handicap
    const cap = 3;

    return holeScores.map(h => ({
        ...h,
        score: Math.min(h.score, h.par + cap)
    }));
}

/**
 * Compute adjusted gross score with ESC applied.
 */
export function computeAdjustedGross(
    holeData: { hole: number; score: number; par: number }[]
): number {
    let adjusted = 0;
    for (const hole of holeData) {
        const par = hole.par ?? 4;
        const cap = par + 3;  // Simplified ESC cap
        adjusted += hole.score > cap ? cap : hole.score;
    }
    return adjusted;
}

/**
 * Find tee metadata from course teeSets by name and gender.
 */
export function pickTeeMeta(
    course: any,
    teeName?: string | null,
    teeGender?: string | null
): any | null {
    const teeSets = course?.teeSets as any[] | undefined;
    if (!Array.isArray(teeSets) || !teeName) return null;
    const lowerName = teeName.toString().toLowerCase();
    const candidates = teeSets.filter(
        (t) => t?.name && t.name.toString().toLowerCase() === lowerName
    );
    if (!candidates.length) return null;
    if (teeGender) {
        const genderMatch = candidates.find((t) => t.gender === teeGender);
        if (genderMatch) return genderMatch;
    }
    return candidates[0];
}

/**
 * Get rating and slope for a score, handling 9-hole adjustments.
 */
export function getRatingSlopeForScore(
    course: any,
    teeMeta: any | null,
    holeCount: 9 | 18,
    holeData: { hole: number }[]
): { ratingUsed: number; slopeUsed: number; scaleTo18: number } {
    const coursePar = course.holes?.reduce((sum: number, h: any) => sum + (h.par ?? 4), 0) ?? 72;
    const baseRating = (teeMeta && teeMeta.rating) ?? course.rating ?? coursePar;
    const baseSlope = (teeMeta && teeMeta.slope) ?? course.slope ?? 113;

    if (holeCount === 18) {
        return { ratingUsed: baseRating, slopeUsed: baseSlope, scaleTo18: 1 };
    }

    const allHoles = holeData.map((h) => h.hole);
    const isFront = allHoles.length > 0 && allHoles.every((h) => h <= 9);
    const isBack = allHoles.length > 0 && allHoles.every((h) => h >= 10);

    const frontRating = teeMeta?.frontRating as number | undefined;
    const frontSlope = teeMeta?.frontSlope as number | undefined;
    const backRating = teeMeta?.backRating as number | undefined;
    const backSlope = teeMeta?.backSlope as number | undefined;

    if (isFront && typeof frontRating === "number" && typeof frontSlope === "number") {
        return { ratingUsed: frontRating, slopeUsed: frontSlope, scaleTo18: 2 };
    }
    if (isBack && typeof backRating === "number" && typeof backSlope === "number") {
        return { ratingUsed: backRating, slopeUsed: backSlope, scaleTo18: 2 };
    }

    const rating9 = baseRating / 2;
    const slope9 = baseSlope;
    return { ratingUsed: rating9, slopeUsed: slope9, scaleTo18: 2 };
}
