/**
 * Stroke Allocation Utilities
 *
 * Handles course handicap calculation and stroke distribution for golf games.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Hole {
    number: number;
    par: number;
    hcp: number; // Stroke index (1-18, lower = harder)
    yardage?: number;
}

export interface StrokeAllocation {
    playerId: string;
    strokesByHole: number[]; // Always length 18, index = hole-1
}

// ═══════════════════════════════════════════════════════════════════════════
// COURSE HANDICAP CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate course handicap from handicap index
 * Formula: Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
 */
export function calculateCourseHandicap(
    handicapIndex: number,
    slopeRating: number,
    courseRating: number,
    par: number
): number {
    const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
    return Math.round(courseHandicap);
}

/**
 * Calculate course handicap for 9 holes (front or back)
 * Uses half the adjustment and rounds appropriately
 */
export function calculateCourseHandicap9(
    handicapIndex: number,
    slopeRating: number,
    courseRating: number,
    par: number
): number {
    const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
    return Math.round(courseHandicap / 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// NET STROKE ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate NET stroke allocation (full course handicap distributed across holes)
 * Strokes are allocated to hardest holes first (lowest HCP index)
 *
 * @param courseHandicap - Player's course handicap for this course/tee
 * @param holes - Array of 18 holes with HCP indexes
 * @returns Array of 18 numbers (strokes on each hole: 0, 1, or 2)
 */
export function calculateNetStrokeAllocation(
    courseHandicap: number,
    holes: Hole[]
): number[] {
    // Initialize all holes with 0 strokes
    const strokesByHole = new Array(18).fill(0);

    if (courseHandicap <= 0) {
        return strokesByHole;
    }

    // Sort holes by HCP index (hardest first)
    const sortedHoles = [...holes].sort((a, b) => a.hcp - b.hcp);

    let strokesRemaining = courseHandicap;

    // First pass: give 1 stroke to each hole in HCP order
    for (const hole of sortedHoles) {
        if (strokesRemaining <= 0) break;
        strokesByHole[hole.number - 1] = 1;
        strokesRemaining--;
    }

    // Second pass: for handicaps > 18, give 2nd stroke to hardest holes
    for (const hole of sortedHoles) {
        if (strokesRemaining <= 0) break;
        strokesByHole[hole.number - 1] = 2;
        strokesRemaining--;
    }

    return strokesByHole;
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH STROKE ALLOCATION (Computed at runtime)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate MATCH stroke allocation (difference between two players/sides)
 * Used for Match Play, Nassau
 *
 * @param courseHandicapA - Course handicap of player/side A
 * @param courseHandicapB - Course handicap of player/side B
 * @param holes - Array of holes with HCP indexes
 * @returns Object with which side gets strokes and where
 */
export function calculateMatchStrokeAllocation(
    courseHandicapA: number,
    courseHandicapB: number,
    holes: Hole[]
): {
    receivingPlayer: "A" | "B" | "none";
    strokeDifference: number;
    strokesByHole: number[];
} {
    const diff = Math.abs(courseHandicapA - courseHandicapB);

    if (diff === 0) {
        return {
            receivingPlayer: "none",
            strokeDifference: 0,
            strokesByHole: new Array(18).fill(0),
        };
    }

    const receivingPlayer = courseHandicapA > courseHandicapB ? "A" : "B";

    // Allocate difference strokes to hardest holes
    const strokesByHole = calculateNetStrokeAllocation(diff, holes);

    return {
        receivingPlayer,
        strokeDifference: diff,
        strokesByHole,
    };
}

/**
 * Calculate team match strokes (for 2v2)
 * Uses combined team handicaps
 */
export function calculateTeamMatchStrokes(
    teamACourseHandicaps: number[],
    teamBCourseHandicaps: number[],
    holes: Hole[]
): {
    receivingTeam: "A" | "B" | "none";
    strokeDifference: number;
    strokesByHole: number[];
} {
    const teamATotal = teamACourseHandicaps.reduce((a, b) => a + b, 0);
    const teamBTotal = teamBCourseHandicaps.reduce((a, b) => a + b, 0);

    const result = calculateMatchStrokeAllocation(teamATotal, teamBTotal, holes);
    return {
        receivingTeam: result.receivingPlayer,
        strokeDifference: result.strokeDifference,
        strokesByHole: result.strokesByHole,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOLE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get holes for a given selection (18, front 9, back 9)
 */
export function getHolesForSelection(
    holes: Hole[],
    selection: "18" | "front_9" | "back_9"
): Hole[] {
    switch (selection) {
        case "18":
            return holes;
        case "front_9":
            return holes.filter((h) => h.number <= 9);
        case "back_9":
            return holes.filter((h) => h.number >= 10);
    }
}

/**
 * Filter stroke allocation to relevant holes
 * Returns strokes for holes 0-8 (front) or 9-17 (back)
 */
export function filterStrokesForSelection(
    strokesByHole: number[],
    selection: "18" | "front_9" | "back_9"
): number[] {
    switch (selection) {
        case "18":
            return strokesByHole;
        case "front_9":
            return strokesByHole.slice(0, 9);
        case "back_9":
            return strokesByHole.slice(9, 18);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// USGA vs MODIFIED FORMAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate stroke allocations based on format
 *
 * USGA: Best player plays scratch, others get strokes based on difference
 * Modified: Each player gets their full course handicap
 */
export function calculateAllocationsForFormat(
    participants: Array<{ playerId: string; courseHandicap: number }>,
    holes: Hole[],
    format: "usga" | "modified"
): StrokeAllocation[] {
    if (format === "modified") {
        // Everyone gets their full course handicap
        return participants.map((p) => ({
            playerId: p.playerId,
            strokesByHole: calculateNetStrokeAllocation(p.courseHandicap, holes),
        }));
    }

    // USGA: Best player (lowest CH) plays at scratch, others get difference
    const lowestCH = Math.min(...participants.map((p) => p.courseHandicap));

    return participants.map((p) => {
        const adjustedCH = p.courseHandicap - lowestCH;
        return {
            playerId: p.playerId,
            strokesByHole: calculateNetStrokeAllocation(adjustedCH, holes),
        };
    });
}
