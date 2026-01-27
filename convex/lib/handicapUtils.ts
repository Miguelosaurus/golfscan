/**
 * Shared Handicap Calculation Utilities
 * 
 * This file contains the official WHS (World Handicap System) formula
 * and related utilities. ALL handicap calculations should use these functions.
 */

export function roundHalfUpToInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    // Tiny epsilon prevents cases like 30.4999999997 from rounding down unexpectedly.
    const epsilon = 1e-9;
    return value >= 0 ? Math.floor(value + 0.5 + epsilon) : Math.ceil(value - 0.5 - epsilon);
}

export function roundToTenth(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10;
    const scaled = value * factor;
    const epsilon = 1e-9;
    const rounded = value >= 0 ? Math.round(scaled + epsilon) : Math.round(scaled - epsilon);
    return rounded / factor;
}

/**
 * WHS Course Handicap calculation.
 * Formula: Handicap Index × (Slope Rating ÷ 113) + (Course Rating − Par)
 * Rounded to the nearest whole number (half up).
 */
export function calculateCourseHandicapWHS(
    handicapIndex: number,
    slopeRating: number,
    courseRating: number,
    par: number
): number {
    const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
    return roundHalfUpToInt(courseHandicap);
}

export type HandicapDifferentialEvent = {
    createdAt: number;
    differential: number;
    scoreIds: string[];
};

export function getWHSMinimumPlayedHoles(holeCount: 9 | 18): number {
    return holeCount === 18 ? 14 : 7;
}

export function getHoleNumbersForRoundSelection(
    holeCount: 9 | 18,
    holeData: Array<{ hole: number }>
): number[] {
    if (holeCount === 18) {
        return Array.from({ length: 18 }, (_, i) => i + 1);
    }

    const holes = (holeData ?? [])
        .map((h) => h?.hole)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .map((n) => Math.trunc(n))
        .filter((n) => n >= 1 && n <= 18);

    const frontCount = holes.filter((n) => n <= 9).length;
    const backCount = holes.filter((n) => n >= 10).length;
    const isBack = backCount > frontCount;

    const start = isBack ? 10 : 1;
    return Array.from({ length: 9 }, (_, i) => start + i);
}

export function countUniquePlayedHoles(
    holeData: Array<{ hole: number; score?: number }>,
    allowedHoles: number[]
): number {
    const allowed = new Set(allowedHoles);
    const played = new Set<number>();
    for (const h of holeData ?? []) {
        const hole = typeof h?.hole === "number" ? Math.trunc(h.hole) : NaN;
        if (!Number.isFinite(hole) || !allowed.has(hole)) continue;
        const score = (h as any)?.score;
        if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) continue;
        played.add(hole);
    }
    return played.size;
}

export function computeAdjustedGrossForHandicapRound(args: {
    holeCount: 9 | 18;
    holeData: Array<{ hole: number; score: number; par?: number }>;
    courseHoles: Array<{ number: number; par: number; hcp: number }>;
    courseHandicap: number;
}): number | null {
    const { holeCount, holeData, courseHoles, courseHandicap } = args;
    if (!Number.isFinite(courseHandicap)) return null;
    if (!Array.isArray(courseHoles) || courseHoles.length === 0) return null;

    const holeNumbers = getHoleNumbersForRoundSelection(holeCount, holeData);
    const minPlayed = getWHSMinimumPlayedHoles(holeCount);
    const playedCount = countUniquePlayedHoles(holeData, holeNumbers);
    if (playedCount < minPlayed) return null;

    const courseHoleByNumber = new Map<number, { number: number; par: number; hcp: number }>();
    for (const h of courseHoles) {
        if (typeof h?.number !== "number") continue;
        courseHoleByNumber.set(h.number, h);
    }

    const inputByHole = new Map<number, { hole: number; score: number; par?: number }>();
    for (const h of holeData ?? []) {
        const hole = typeof h?.hole === "number" ? Math.trunc(h.hole) : NaN;
        if (!Number.isFinite(hole)) continue;
        if (!holeNumbers.includes(hole)) continue;
        if (inputByHole.has(hole)) continue;
        inputByHole.set(hole, h);
    }

    const completed = holeNumbers.map((n) => {
        const courseHole = courseHoleByNumber.get(n);
        if (!courseHole) return null;
        if (typeof courseHole.par !== "number" || !Number.isFinite(courseHole.par)) return null;
        if (typeof courseHole.hcp !== "number" || !Number.isFinite(courseHole.hcp)) return null;

        const input = inputByHole.get(n);
        const par = courseHole.par;
        const hcp = courseHole.hcp;
        const strokesReceived = getStrokesReceivedOnHole(hcp, courseHandicap);

        const score =
            input && typeof input.score === "number" && Number.isFinite(input.score) && input.score > 0
                ? input.score
                : par + strokesReceived; // Net par for unplayed holes per WHS incomplete round rules

        return { hole: n, score, par, hcp };
    });

    if (completed.some((x) => x === null)) return null;

    const adjusted = applyNetDoubleBogey(completed as any, courseHandicap);
    return adjusted.reduce((sum, h) => sum + h.adjustedScore, 0);
}

export function buildHandicapDifferentialEventsFromScores(
    scores: Array<{ _id: any; createdAt: number; holeCount?: number; handicapDifferential?: number }>
): HandicapDifferentialEvent[] {
    const valid = scores
        .filter((s) => typeof s.createdAt === "number" && Number.isFinite(s.createdAt))
        .filter((s) => typeof s.handicapDifferential === "number" && Number.isFinite(s.handicapDifferential as number))
        .map((s) => ({
            id: String(s._id),
            createdAt: s.createdAt,
            holeCount: (s.holeCount === 9 ? 9 : 18) as 9 | 18,
            differential: roundToTenth(s.handicapDifferential as number),
        }));

    const nine = valid.filter((s) => s.holeCount === 9).sort((a, b) => a.createdAt - b.createdAt);
    const eighteen = valid
        .filter((s) => s.holeCount === 18)
        .map((s) => ({
            createdAt: s.createdAt,
            differential: s.differential,
            scoreIds: [s.id],
        }));

    const combinedNine: HandicapDifferentialEvent[] = [];
    for (let i = 0; i + 1 < nine.length; i += 2) {
        const a = nine[i];
        const b = nine[i + 1];
        combinedNine.push({
            createdAt: b.createdAt,
            differential: roundToTenth((a.differential + b.differential) / 2),
            scoreIds: [a.id, b.id],
        });
    }

    return [...eighteen, ...combinedNine].sort((a, b) => a.createdAt - b.createdAt);
}

export function buildHandicapDifferentialsForIndex(
    scores: Array<{ _id: any; createdAt: number; holeCount?: number; handicapDifferential?: number }>
): HandicapDifferentialEvent[] {
    return buildHandicapDifferentialEventsFromScores(scores).sort((a, b) => b.createdAt - a.createdAt);
}

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
    const rawHandicap = roundToTenth(average - adjustment);
    const handicap = rawHandicap;
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
    return roundToTenth(((adjustedGrossScore - courseRating) * 113) / slopeRating);
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
 * Calculate handicap strokes received on a specific hole.
 * Based on WHS rules: strokes allocated by comparing hole's stroke index to course handicap.
 */
export function getStrokesReceivedOnHole(
    holeStrokeIndex: number,
    courseHandicap: number
): number {
    if (!Number.isFinite(courseHandicap) || courseHandicap === 0) return 0;
    if (!Number.isFinite(holeStrokeIndex)) return 0;

    const strokeIndex = Math.min(18, Math.max(1, Math.trunc(holeStrokeIndex)));
    const magnitude = Math.abs(Math.trunc(courseHandicap));

    const fullLoops = Math.floor(magnitude / 18);
    const remainder = magnitude % 18;

    if (courseHandicap > 0) {
        // Positive course handicap: strokes received on hardest holes (lowest stroke index).
        let strokes = fullLoops;
        if (remainder > 0 && strokeIndex <= remainder) strokes += 1;
        return strokes;
    }

    // Plus handicap (negative course handicap): strokes GIVEN on easiest holes (highest stroke index).
    let strokes = -fullLoops;
    if (remainder > 0 && strokeIndex > 18 - remainder) strokes -= 1;
    return strokes;
}

/**
 * Apply WHS Net Double Bogey adjustment.
 * Maximum score per hole = Par + 2 + Handicap Strokes Received on that hole.
 * This replaces the old simplified ESC (Par+3) cap.
 */
export function applyNetDoubleBogey(
    holeScores: { hole: number; score: number; par: number; hcp?: number }[],
    courseHandicap: number
): { hole: number; score: number; adjustedScore: number; par: number; hcp?: number; wasAdjusted: boolean }[] {
    return holeScores.map(h => {
        const strokeIndex = h.hcp ?? 18; // Default stroke index if not provided
        const strokesReceived = getStrokesReceivedOnHole(strokeIndex, courseHandicap);
        const netDoubleBogey = h.par + 2 + strokesReceived;
        const adjustedScore = Math.min(h.score, netDoubleBogey);

        return {
            ...h,
            adjustedScore,
            wasAdjusted: h.score > adjustedScore
        };
    });
}

/**
 * @deprecated Use applyNetDoubleBogey instead. Kept for backward compatibility.
 * Apply equitable stroke control (ESC) cap per WHS.
 */
export function applyESC(
    holeScores: { hole: number; score: number; par: number }[],
    courseHandicap?: number
): { hole: number; score: number; par: number }[] {
    // Fall back to simplified cap if no course handicap provided
    const cap = 3;
    return holeScores.map(h => ({
        ...h,
        score: Math.min(h.score, h.par + cap)
    }));
}

/**
 * Compute adjusted gross score with Net Double Bogey applied.
 * Requires hole stroke indexes (hcp) and course handicap for accurate calculation.
 */
export function computeAdjustedGross(
    holeData: { hole: number; score: number; par: number; hcp?: number }[],
    courseHandicap?: number
): number {
    // If we have course handicap and hole data with stroke indexes, use proper Net Double Bogey
    if (typeof courseHandicap === 'number' && holeData.some(h => typeof h.hcp === 'number')) {
        const adjusted = applyNetDoubleBogey(holeData, courseHandicap);
        return adjusted.reduce((sum, h) => sum + h.adjustedScore, 0);
    }

    // Fallback to simplified Par+3 cap if missing required data
    let adjusted = 0;
    for (const hole of holeData) {
        const par = hole.par ?? 4;
        const cap = par + 3;  // Simplified fallback
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
        return { ratingUsed: frontRating, slopeUsed: frontSlope, scaleTo18: 1 };
    }
    if (isBack && typeof backRating === "number" && typeof backSlope === "number") {
        return { ratingUsed: backRating, slopeUsed: backSlope, scaleTo18: 1 };
    }

    const rating9 = baseRating / 2;
    const slope9 = baseSlope;
    return { ratingUsed: rating9, slopeUsed: slope9, scaleTo18: 1 };
}
