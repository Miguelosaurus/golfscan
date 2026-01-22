/**
 * Game Settlement V2
 * 
 * Production-ready settlement system with:
 * - Atomic 2-side match primitives
 * - Round-robin pairing for 3-4 players
 * - Full press support (manual + auto-down-2)
 * - Global netting with allocation tracking
 * - Deterministic outputs
 */

import { Id } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISM: Sort keys and ID generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sort players by ID for deterministic ordering
 */
export function sortPlayerIds(ids: Id<"players">[]): Id<"players">[] {
    return [...ids].sort();
}

/**
 * Generate deterministic transaction ID (opaque, never parsed)
 */
export interface TransactionIdContext {
    roundId: string;
    gameType: GameType;
    pairingId?: string;
    segment?: SegmentName;
    pressId?: string;
    holeNumber?: number;
    index: number;
}

export function generateTransactionId(ctx: TransactionIdContext): string {
    return [
        ctx.roundId,
        ctx.gameType,
        ctx.pairingId ?? "field",
        ctx.segment ?? "na",
        ctx.pressId ?? "na",
        ctx.holeNumber?.toString() ?? "na",
        ctx.index.toString(),
    ].join(":");
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format cents as $X.YY (never use floats)
 */
export function formatCents(cents: number): string {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100);
    const remainder = abs % 100;
    return `${sign}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GameType = "stroke_play" | "match_play" | "nassau" | "skins" | "side_bets";
export type SegmentName = "front" | "back" | "overall";
export type GameMode = "individual" | "head_to_head" | "teams";
export type TeamScoring = "bestBall" | "aggregate";

export interface Segment {
    name: SegmentName;
    startHole: number;  // 1-indexed
    endHole: number;    // 1-indexed, inclusive
}

/**
 * Get segments to settle based on hole selection
 */
export function getSegmentsToSettle(holeSelection: "18" | "front_9" | "back_9"): Segment[] {
    switch (holeSelection) {
        case "front_9":
            return [{ name: "front", startHole: 1, endHole: 9 }];
        case "back_9":
            return [{ name: "back", startHole: 10, endHole: 18 }];
        case "18":
            return [
                { name: "front", startHole: 1, endHole: 9 },
                { name: "back", startHole: 10, endHole: 18 },
                { name: "overall", startHole: 1, endHole: 18 },
            ];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SCORING
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayerScore {
    playerId: Id<"players">;
    holeScores: (number | null)[];  // 0-indexed, null = not entered
}

export interface StrokeAllocation {
    playerId: Id<"players">;
    strokesByHole: number[];  // 0-indexed
}

/**
 * Validate that all required holes have scores (not null)
 * @throws Error if any required hole is missing
 */
export function validateRoundCompletion(
    playerScores: PlayerScore[],
    segment: Segment
): void {
    for (const ps of playerScores) {
        for (let h = segment.startHole; h <= segment.endHole; h++) {
            const holeIndex = h - 1;
            const score = ps.holeScores[holeIndex];
            if (score === null || score === undefined) {
                throw new Error(
                    `Missing score for hole ${h}. Round is incomplete and cannot be settled.`
                );
            }
            if (score === 0) {
                throw new Error(
                    `Invalid score of 0 for hole ${h}. Scores must be positive integers.`
                );
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAIRINGS
// ═══════════════════════════════════════════════════════════════════════════

export interface Side {
    sideId: string;
    playerIds: Id<"players">[];
    name?: string;
}

export interface Pairing {
    pairingId: string;
    sideA: Id<"players">[];
    sideB: Id<"players">[];
    nameA?: string;
    nameB?: string;
}

/**
 * Generate all round-robin pairings for individual mode
 * Order is deterministic: sorted by first player in each pairing
 */
export function generatePairings(
    playerIds: Id<"players">[],
    playerNames?: Map<Id<"players">, string>
): Pairing[] {
    const sorted = sortPlayerIds(playerIds);
    const pairings: Pairing[] = [];

    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            pairings.push({
                pairingId: `${sorted[i]}_vs_${sorted[j]}`,
                sideA: [sorted[i]],
                sideB: [sorted[j]],
                nameA: playerNames?.get(sorted[i]),
                nameB: playerNames?.get(sorted[j]),
            });
        }
    }

    return pairings;
    // 2 players = 1 pairing
    // 3 players = 3 pairings
    // 4 players = 6 pairings
}

/**
 * Convert sides to pairings for head-to-head or teams mode
 * Uses canonical ordering (sorted sideIds) for stable pairingId
 */
export function sidesToPairing(sides: Side[]): Pairing {
    if (sides.length !== 2) {
        throw new Error("sidesToPairing requires exactly 2 sides");
    }
    // Sort sides by sideId for canonical pairingId
    const [first, second] = sides[0].sideId < sides[1].sideId
        ? [sides[0], sides[1]]
        : [sides[1], sides[0]];

    return {
        pairingId: `${first.sideId}_vs_${second.sideId}`,
        sideA: sortPlayerIds(first.playerIds),
        sideB: sortPlayerIds(second.playerIds),
        nameA: first.name,
        nameB: second.name,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOLE-BY-HOLE MATCH STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface HoleMatchState {
    holeNumber: number;  // 1-indexed
    sideANetScore: number;
    sideBNetScore: number;
    holeWinner: "A" | "B" | "tie";
    runningStatus: {
        leader: "A" | "B" | "tie";
        margin: number;  // Always positive
    };
}

export interface MatchState {
    pairingId: string;
    segment: SegmentName;
    holes: HoleMatchState[];
    presses: PressState[];
}

export interface MatchConfig {
    teamScoring: TeamScoring;
}

/**
 * Get team score for a hole (bestBall = min, aggregate = sum)
 * Assumes validateRoundCompletion() was already called
 */
export function getTeamHoleScore(
    side: Id<"players">[],
    holeIndex: number,  // 0-indexed
    playerScores: PlayerScore[],
    strokeAllocations: StrokeAllocation[],
    scoring: TeamScoring
): number {
    const netScores = side.map(pid => {
        const ps = playerScores.find(p => p.playerId === pid);
        const alloc = strokeAllocations.find(a => a.playerId === pid);
        if (!ps) throw new Error(`Missing player score for ${pid}`);
        const gross = ps.holeScores[holeIndex];
        if (gross === null || gross === undefined) {
            throw new Error(`Missing score for hole ${holeIndex + 1}. Round must be complete.`);
        }
        const strokes = alloc?.strokesByHole[holeIndex] ?? 0;
        return gross - strokes;
    });

    if (scoring === "bestBall") {
        return Math.min(...netScores);
    } else {
        return netScores.reduce((a, b) => a + b, 0);
    }
}

/**
 * Build hole-by-hole match state for a pairing and segment
 */
export function buildMatchState(
    pairing: Pairing,
    segment: Segment,
    playerScores: PlayerScore[],
    strokeAllocations: StrokeAllocation[],
    config: MatchConfig
): MatchState {
    const holes: HoleMatchState[] = [];
    let sideATotal = 0;
    let sideBTotal = 0;

    for (let h = segment.startHole; h <= segment.endHole; h++) {
        const holeIndex = h - 1;  // Convert to 0-indexed

        const sideANet = getTeamHoleScore(
            pairing.sideA, holeIndex, playerScores, strokeAllocations, config.teamScoring
        );
        const sideBNet = getTeamHoleScore(
            pairing.sideB, holeIndex, playerScores, strokeAllocations, config.teamScoring
        );

        let holeWinner: "A" | "B" | "tie" = "tie";
        if (sideANet < sideBNet) {
            holeWinner = "A";
            sideATotal++;
        } else if (sideBNet < sideANet) {
            holeWinner = "B";
            sideBTotal++;
        }

        const margin = sideATotal - sideBTotal;
        holes.push({
            holeNumber: h,
            sideANetScore: sideANet,
            sideBNetScore: sideBNet,
            holeWinner,
            runningStatus: {
                leader: margin > 0 ? "A" : margin < 0 ? "B" : "tie",
                margin: Math.abs(margin),
            },
        });
    }

    return {
        pairingId: pairing.pairingId,
        segment: segment.name,
        holes,
        presses: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface MatchResult {
    pairingId: string;
    sideA: Id<"players">[];
    sideB: Id<"players">[];
    segment: SegmentName;
    startHole: number;
    endHole: number;
    holesWonA: number;
    holesWonB: number;
    tiedHoles: number;
    winner: "A" | "B" | "tie";
    context: string;  // Human-readable: "Front 9", "Press #1 (hole 5+)"
}

/**
 * Calculate match result from match state
 */
export function calculateMatchResult(
    pairing: Pairing,
    state: MatchState,
    segment: Segment,
    context: string
): MatchResult {
    let holesWonA = 0;
    let holesWonB = 0;
    let tiedHoles = 0;

    for (const hole of state.holes) {
        if (hole.holeWinner === "A") holesWonA++;
        else if (hole.holeWinner === "B") holesWonB++;
        else tiedHoles++;
    }

    let winner: "A" | "B" | "tie" = "tie";
    if (holesWonA > holesWonB) winner = "A";
    else if (holesWonB > holesWonA) winner = "B";

    return {
        pairingId: pairing.pairingId,
        sideA: pairing.sideA,
        sideB: pairing.sideB,
        segment: segment.name,
        startHole: segment.startHole,
        endHole: segment.endHole,
        holesWonA,
        holesWonB,
        tiedHoles,
        winner,
        context,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PressConfig {
    pressEnabled: boolean;
    pressMode: "manual" | "autoDown2";
    pressTriggerDownBy: number;           // Default: 2
    pressStart: "nextHole" | "immediateHole";
    maxPressesPerSegment: number;         // Default: 1, applies to both manual and auto
    pressAppliesToOverall: boolean;       // Default: false
    pressValueCents?: number;             // If undefined, inherits segment bet
}

export const DEFAULT_PRESS_CONFIG: PressConfig = {
    pressEnabled: true,
    pressMode: "manual",
    pressTriggerDownBy: 2,
    pressStart: "nextHole",
    maxPressesPerSegment: 1,
    pressAppliesToOverall: false,
};

export interface PressState {
    pressId: string;
    pairingId: string;
    segment: SegmentName;
    startHole: number;
    endHole: number;
    pressingSide: "A" | "B";
    triggeredByPlayerId?: Id<"players">;  // For manual press
    valueCents: number;
    result?: MatchResult;
}

// Press registry for duplicate prevention
export type PressKey = `${string}:${SegmentName}:${number}`;

export function makePressKey(pairingId: string, segment: SegmentName, startHole: number): PressKey {
    return `${pairingId}:${segment}:${startHole}`;
}

export interface PressRegistry {
    created: Set<PressKey>;
}

export function createPressRegistry(): PressRegistry {
    return { created: new Set() };
}

/**
 * Detect auto-presses with threshold crossing gate
 */
export function detectAutoPresses(
    state: MatchState,
    config: PressConfig,
    segmentBetCents: number,
    registry: PressRegistry,
    existingManualPresses: PressState[]
): PressState[] {
    if (!config.pressEnabled || config.pressMode !== "autoDown2") return [];

    // Count existing presses for this pairing/segment
    const existingCount = existingManualPresses.filter(
        p => p.pairingId === state.pairingId && p.segment === state.segment
    ).length;

    if (existingCount >= config.maxPressesPerSegment) return [];

    const presses: PressState[] = [];
    let pressCount = existingCount;
    let previousMargin = 0;
    let previousLeader: "A" | "B" | "tie" = "tie";

    for (const hole of state.holes) {
        if (pressCount >= config.maxPressesPerSegment) break;

        const { leader, margin } = hole.runningStatus;

        // Gate: only trigger on FIRST crossing of threshold
        const justCrossedThreshold =
            margin >= config.pressTriggerDownBy &&
            (previousMargin < config.pressTriggerDownBy || previousLeader !== leader);

        if (justCrossedThreshold) {
            const startHole = config.pressStart === "nextHole"
                ? hole.holeNumber + 1
                : hole.holeNumber;

            const segmentEndHole = state.holes[state.holes.length - 1].holeNumber;

            // Validate: startHole within segment
            if (startHole > segmentEndHole) {
                previousMargin = margin;
                previousLeader = leader;
                continue;
            }

            // Validate: at least 2 holes remaining
            if (segmentEndHole - startHole + 1 < 2) {
                previousMargin = margin;
                previousLeader = leader;
                continue;
            }

            // Duplicate check
            const key = makePressKey(state.pairingId, state.segment, startHole);
            if (registry.created.has(key)) {
                previousMargin = margin;
                previousLeader = leader;
                continue;
            }

            registry.created.add(key);
            presses.push({
                pressId: `${state.pairingId}:${state.segment}:press:${startHole}`,
                pairingId: state.pairingId,
                segment: state.segment,
                startHole,
                endHole: segmentEndHole,
                pressingSide: leader === "A" ? "B" : "A",
                valueCents: config.pressValueCents ?? segmentBetCents,
            });
            pressCount++;
        }

        previousMargin = margin;
        previousLeader = leader;
    }

    // Sort by startHole for determinism
    return presses.sort((a, b) => a.startHole - b.startHole);
}

/**
 * Validate manual press (cap, duplicate, eligibility)
 */
export interface ManualPressRequest {
    pairingId: string;
    segment: SegmentName;
    startHole: number;
    pressingSide: "A" | "B";
    triggeredByPlayerId: Id<"players">;
}

export function validateManualPress(
    request: ManualPressRequest,
    matchState: MatchState,
    config: PressConfig,
    registry: PressRegistry,
    existingPresses: PressState[]
): { valid: boolean; reason?: string } {
    // Rule 1: Cap check
    const count = existingPresses.filter(
        p => p.pairingId === request.pairingId && p.segment === request.segment
    ).length;
    if (count >= config.maxPressesPerSegment) {
        return { valid: false, reason: `Max ${config.maxPressesPerSegment} presses per segment` };
    }

    // Rule 2: Duplicate check
    const key = makePressKey(request.pairingId, request.segment, request.startHole);
    if (registry.created.has(key)) {
        return { valid: false, reason: "Press already exists for this hole" };
    }

    // Rule 3: Eligibility - must be down by trigger amount
    // CRITICAL: Evaluate at the press decision point, NOT the final hole
    // - If press starts "nextHole", evaluate state at startHole - 1
    // - If "immediateHole", evaluate at startHole
    let evaluationHoleNumber = config.pressStart === "nextHole"
        ? request.startHole - 1
        : request.startHole;

    // Segment-local eligibility: clamp to first hole in matchState
    // This prevents cross-segment lookups (e.g., back-9 press at hole 10 won't require hole 9)
    const firstHoleInSegment = matchState.holes[0]?.holeNumber;
    if (firstHoleInSegment !== undefined && evaluationHoleNumber < firstHoleInSegment) {
        evaluationHoleNumber = firstHoleInSegment;
    }

    // Find the hole at the (clamped) evaluation point
    const evaluationHole = matchState.holes.find(h => h.holeNumber === evaluationHoleNumber);
    if (!evaluationHole) {
        // If evaluation hole hasn't been played yet, press is invalid
        return { valid: false, reason: `Hole ${evaluationHoleNumber} has not been played yet` };
    }

    const { leader, margin } = evaluationHole.runningStatus;
    const isDown = leader !== request.pressingSide &&
        leader !== "tie" &&
        margin >= config.pressTriggerDownBy;

    if (!isDown) {
        return { valid: false, reason: `Must be down by ${config.pressTriggerDownBy}+ holes to press (was ${margin} at hole ${evaluationHoleNumber})` };
    }

    return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// RAW TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ContributionCategory {
    gameType: GameType;
    segment?: SegmentName;
    pairingId?: string;
    pressId?: string;
    label: string;  // Human-readable for display
}

export interface RawTransaction {
    id: string;  // Opaque, never parsed
    fromPlayerId: Id<"players">;
    toPlayerId: Id<"players">;
    amountCents: number;
    reason: string;
    explanation: string;
    gameType: GameType;
    segment?: SegmentName;
    pairingId?: string;
    pressId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL NETTING
// ═══════════════════════════════════════════════════════════════════════════

export interface CategoryBucket {
    category: ContributionCategory;
    amountCents: number;  // Original amount (negative = loss)
    remainingLossCents: number;  // Mutable for allocation (positive)
    transactionIds: string[];
}

export interface PlayerLedger {
    playerId: Id<"players">;
    netBalance: number;  // Negative = debtor, positive = creditor
    categoryBuckets: CategoryBucket[];
}

export interface AllocatedContribution {
    category: ContributionCategory;
    allocatedCents: number;  // Always positive
    transactionIds: string[];
}

export interface NettedPayment {
    fromPlayerId: Id<"players">;
    toPlayerId: Id<"players">;
    amountCents: number;
    allocatedContributions: AllocatedContribution[];
    breakdown: string;
}

/**
 * Allocation sort key (structured, not label-based)
 */
function allocationSortKey(c: ContributionCategory): string {
    return [c.gameType, c.segment ?? "", c.pairingId ?? "", c.pressId ?? ""].join(":");
}

/**
 * Allocate from loss buckets
 * Uses an external allocation tracker to avoid mutating original bucket state
 * @param buckets - The category buckets to allocate from
 * @param amountToAllocate - Total cents to allocate
 * @param allocationTracker - Map of bucket category sortKey → remaining cents (mutated)
 */
function allocateFromBuckets(
    buckets: CategoryBucket[],
    amountToAllocate: number,
    allocationTracker: Map<string, number>
): AllocatedContribution[] {
    // Initialize tracker if needed
    for (const b of buckets) {
        const key = allocationSortKey(b.category);
        if (!allocationTracker.has(key)) {
            allocationTracker.set(key, b.remainingLossCents);
        }
    }

    // Get buckets with remaining allocation, sorted deterministically
    const lossBuckets = buckets
        .map(b => ({
            bucket: b,
            key: allocationSortKey(b.category),
        }))
        .filter(({ key }) => (allocationTracker.get(key) ?? 0) > 0)
        .sort((a, b) => a.key.localeCompare(b.key));

    const allocated: AllocatedContribution[] = [];
    let remaining = amountToAllocate;

    for (const { bucket, key } of lossBuckets) {
        if (remaining <= 0) break;

        const availableInBucket = allocationTracker.get(key) ?? 0;
        const toAllocate = Math.min(remaining, availableInBucket);
        if (toAllocate > 0) {
            allocated.push({
                category: bucket.category,
                allocatedCents: toAllocate,
                transactionIds: [...bucket.transactionIds],
            });
            // Update tracker (external state, not bucket)
            allocationTracker.set(key, availableInBucket - toAllocate);
            remaining -= toAllocate;
        }
    }

    return allocated;
}

/**
 * Build breakdown string from contributions
 */
function buildBreakdown(contributions: AllocatedContribution[], total: number): string {
    if (contributions.length === 0) return formatCents(total);

    // Group by gameType
    const byGame = new Map<string, number>();
    for (const c of contributions) {
        const key = c.category.gameType;
        byGame.set(key, (byGame.get(key) ?? 0) + c.allocatedCents);
    }

    const parts = Array.from(byGame.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([game, amt]) => `${game} ${formatCents(amt)}`);

    return parts.length === 1
        ? formatCents(total)
        : `${parts.join(" + ")} = ${formatCents(total)}`;
}

/**
 * Add transaction to player's category bucket
 */
function addToBucket(
    ledger: PlayerLedger,
    tx: RawTransaction,
    deltaCents: number
): void {
    const category: ContributionCategory = {
        gameType: tx.gameType,
        segment: tx.segment,
        pairingId: tx.pairingId,
        pressId: tx.pressId,
        label: tx.reason,
    };

    // Find existing bucket with same category
    const existingIdx = ledger.categoryBuckets.findIndex(
        b => allocationSortKey(b.category) === allocationSortKey(category)
    );

    if (existingIdx >= 0) {
        const bucket = ledger.categoryBuckets[existingIdx];
        bucket.amountCents += deltaCents;
        bucket.remainingLossCents = bucket.amountCents < 0 ? -bucket.amountCents : 0;
        bucket.transactionIds.push(tx.id);
    } else {
        ledger.categoryBuckets.push({
            category,
            amountCents: deltaCents,
            remainingLossCents: deltaCents < 0 ? -deltaCents : 0,
            transactionIds: [tx.id],
        });
    }
}

/**
 * Global netting: balance → debtor/creditor matching → simplified payments
 */
export function globalNetTransactions(
    raw: RawTransaction[]
): { payments: NettedPayment[]; ledgers: PlayerLedger[] } {
    // Step 1: Build per-player category buckets
    const ledgerMap = new Map<Id<"players">, PlayerLedger>();

    const getOrCreateLedger = (pid: Id<"players">): PlayerLedger => {
        let ledger = ledgerMap.get(pid);
        if (!ledger) {
            ledger = { playerId: pid, netBalance: 0, categoryBuckets: [] };
            ledgerMap.set(pid, ledger);
        }
        return ledger;
    };

    for (const tx of raw) {
        // Payer loses money
        addToBucket(getOrCreateLedger(tx.fromPlayerId), tx, -tx.amountCents);
        // Payee gains money
        addToBucket(getOrCreateLedger(tx.toPlayerId), tx, tx.amountCents);
    }

    // Step 2: Compute net balance per player
    for (const ledger of Array.from(ledgerMap.values())) {
        ledger.netBalance = ledger.categoryBuckets.reduce((sum, b) => sum + b.amountCents, 0);
    }

    // Step 3: Separate debtors/creditors, sort by playerId
    const sortedPlayerIds = sortPlayerIds(Array.from(ledgerMap.keys()));
    const debtors: { ledger: PlayerLedger; remaining: number }[] = [];
    const creditors: { playerId: Id<"players">; remaining: number }[] = [];

    for (const pid of sortedPlayerIds) {
        const ledger = ledgerMap.get(pid)!;
        if (ledger.netBalance < 0) {
            debtors.push({ ledger, remaining: -ledger.netBalance });
        } else if (ledger.netBalance > 0) {
            creditors.push({ playerId: pid, remaining: ledger.netBalance });
        }
    }

    // Step 4: Match debtors to creditors, allocate contributions
    // Use per-debtor allocation trackers to avoid mutating original bucket state
    const allocationTrackers = new Map<string, Map<string, number>>();
    for (const debtor of debtors) {
        allocationTrackers.set(debtor.ledger.playerId as string, new Map());
    }

    const payments: NettedPayment[] = [];
    let di = 0, ci = 0;

    while (di < debtors.length && ci < creditors.length) {
        const debtor = debtors[di];
        const creditor = creditors[ci];
        const paymentAmount = Math.min(debtor.remaining, creditor.remaining);

        if (paymentAmount > 0) {
            const tracker = allocationTrackers.get(debtor.ledger.playerId as string)!;
            const allocated = allocateFromBuckets(debtor.ledger.categoryBuckets, paymentAmount, tracker);

            payments.push({
                fromPlayerId: debtor.ledger.playerId,
                toPlayerId: creditor.playerId,
                amountCents: paymentAmount,
                allocatedContributions: allocated,
                breakdown: buildBreakdown(allocated, paymentAmount),
            });
        }

        debtor.remaining -= paymentAmount;
        creditor.remaining -= paymentAmount;
        if (debtor.remaining === 0) di++;
        if (creditor.remaining === 0) ci++;
    }

    return { payments, ledgers: Array.from(ledgerMap.values()) };
}

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANT ASSERTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function assertSettlementInvariants(
    raw: RawTransaction[],
    netted: NettedPayment[]
): void {
    // 1. No self-payments in raw
    for (const tx of raw) {
        if (tx.fromPlayerId === tx.toPlayerId) {
            throw new Error(`Self-payment in raw transaction: ${tx.id}`);
        }
    }

    // 2. No self-payments in netted
    for (const p of netted) {
        if (p.fromPlayerId === p.toPlayerId) {
            throw new Error(`Self-payment in netted: ${p.fromPlayerId}`);
        }
    }

    // 3. Each payment's contributions sum to amountCents
    for (const p of netted) {
        const contribSum = p.allocatedContributions.reduce((s, c) => s + c.allocatedCents, 0);
        if (contribSum !== p.amountCents) {
            throw new Error(`Allocation mismatch: sum=${contribSum}, payment=${p.amountCents}`);
        }
    }

    // 4. No negative amounts
    for (const p of netted) {
        if (p.amountCents < 0) {
            throw new Error(`Negative payment amount: ${p.amountCents}`);
        }
        for (const c of p.allocatedContributions) {
            if (c.allocatedCents < 0) {
                throw new Error(`Negative contribution: ${c.allocatedCents}`);
            }
        }
    }

    // 5. Raw transactions balance check (sum of flows from each player = 0 when aggregated)
    const balances = new Map<string, number>();
    for (const tx of raw) {
        balances.set(tx.fromPlayerId as string, (balances.get(tx.fromPlayerId as string) ?? 0) - tx.amountCents);
        balances.set(tx.toPlayerId as string, (balances.get(tx.toPlayerId as string) ?? 0) + tx.amountCents);
    }
    const totalBalance = Array.from(balances.values()).reduce((a, b) => a + b, 0);
    if (totalBalance !== 0) {
        throw new Error(`Raw transactions don't balance: total=${totalBalance}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGER-SAFE SPLITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Split cents evenly with deterministic remainder assignment
 */
export function splitCentsEvenly(totalCents: number, count: number): number[] {
    if (count <= 0) return [];

    const base = Math.floor(totalCents / count);
    const remainder = totalCents % count;

    const amounts = new Array(count).fill(base);
    for (let i = 0; i < remainder; i++) {
        amounts[i]++;  // First N get extra cent
    }

    return amounts;
}

/**
 * Assign split to players (sorted by ID for determinism)
 */
export function assignSplit(
    recipients: Id<"players">[],
    totalCents: number
): Map<Id<"players">, number> {
    const sorted = sortPlayerIds(recipients);
    const amounts = splitCentsEvenly(totalCents, sorted.length);
    return new Map(sorted.map((pid, i) => [pid, amounts[i]]));
}

/**
 * Calculate team payout with deterministic cents allocation
 * Each loser pays their share to winners (no cents lost)
 */
export interface TeamPayout {
    from: Id<"players">;
    to: Id<"players">;
    amount: number;
}

export function calculateTeamPayout(
    losingSide: Id<"players">[],
    winningSide: Id<"players">[],
    totalCents: number
): TeamPayout[] {
    const payouts: TeamPayout[] = [];

    // Sort both sides for determinism
    const sortedLosers = sortPlayerIds([...losingSide]);
    const sortedWinners = sortPlayerIds([...winningSide]);

    // Split total among losers (each loser pays their share)
    const perLoser = splitCentsEvenly(totalCents, sortedLosers.length);

    // Each loser distributes their share to winners
    for (let li = 0; li < sortedLosers.length; li++) {
        const loserAmount = perLoser[li];
        if (loserAmount <= 0) continue;

        // Split this loser's payment among winners
        const perWinner = splitCentsEvenly(loserAmount, sortedWinners.length);

        for (let wi = 0; wi < sortedWinners.length; wi++) {
            if (perWinner[wi] > 0) {
                payouts.push({
                    from: sortedLosers[li],
                    to: sortedWinners[wi],
                    amount: perWinner[wi],
                });
            }
        }
    }

    return payouts;
}


// ═══════════════════════════════════════════════════════════════════════════
// NASSAU SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface NassauConfig {
    frontCents: number;
    backCents: number;
    overallCents: number;
    pressConfig: PressConfig;
}

export interface ManualPressInput {
    pairingId: string;
    segment: SegmentName;
    startHole: number;
    valueCents: number;
    initiatedBy: Id<"players">;
}

export interface SettlementArgs {
    roundId: string;
    playerScores: PlayerScore[];
    strokeAllocations: StrokeAllocation[];
    playerNames: Map<Id<"players">, string>;
    holeSelection: "18" | "front_9" | "back_9";
    gameMode: GameMode;
    sides?: Side[];
    matchConfig: MatchConfig;
    manualPresses?: ManualPressInput[];
    sideBetsConfig?: SideBetsConfig;
    trackedSideBetCounts?: Array<{ playerId: Id<"players">; greenies: number; sandies: number }>;
    parByHole?: number[];
}

export interface SideBetsConfig {
    greenies: boolean;
    sandies: boolean;
    birdies: boolean;
    amountCents: number;
}

/**
 * Calculate Nassau settlement with round-robin support
 */
export function calculateNassauSettlement(
    args: SettlementArgs,
    config: NassauConfig
): { transactions: RawTransaction[]; matchResults: MatchResult[] } {
    const transactions: RawTransaction[] = [];
    const matchResults: MatchResult[] = [];
    const registry = createPressRegistry();

    // Get players
    const playerIds = args.playerScores.map(ps => ps.playerId);

    // Generate pairings based on game mode
    let pairings: Pairing[];
    if (args.gameMode === "individual") {
        pairings = generatePairings(playerIds, args.playerNames);
    } else if (args.sides && args.sides.length === 2) {
        pairings = [sidesToPairing(args.sides)];
    } else {
        throw new Error("Nassau requires individual mode or exactly 2 sides");
    }

    // Get segments to settle
    const segments = getSegmentsToSettle(args.holeSelection);
    let txIndex = 0;

    for (const pairing of pairings) {
        for (const segment of segments) {
            // Skip overall for presses if not enabled
            if (segment.name === "overall" && !config.pressConfig.pressAppliesToOverall) {
                // Still calculate the match, just no presses
            }

            // Get bet amount for this segment
            const segmentBetCents =
                segment.name === "front" ? config.frontCents :
                    segment.name === "back" ? config.backCents :
                        config.overallCents;

            // Build match state
            const matchState = buildMatchState(
                pairing,
                segment,
                args.playerScores,
                args.strokeAllocations,
                args.matchConfig
            );

            // Calculate main segment result
            const context = segment.name === "front" ? "Front 9" :
                segment.name === "back" ? "Back 9" : "Overall";
            const result = calculateMatchResult(pairing, matchState, segment, context);
            matchResults.push(result);

            // Generate transaction for main segment (push if tie)
            if (result.winner !== "tie") {
                const winningSide = result.winner === "A" ? pairing.sideA : pairing.sideB;
                const losingSide = result.winner === "A" ? pairing.sideB : pairing.sideA;
                const winnerName = result.winner === "A" ? pairing.nameA : pairing.nameB;

                // Use deterministic team payout helper
                const payouts = calculateTeamPayout(losingSide, winningSide, segmentBetCents);
                for (const payout of payouts) {
                    transactions.push({
                        id: generateTransactionId({
                            roundId: args.roundId,
                            gameType: "nassau",
                            pairingId: pairing.pairingId,
                            segment: segment.name,
                            index: txIndex++,
                        }),
                        fromPlayerId: payout.from,
                        toPlayerId: payout.to,
                        amountCents: payout.amount,
                        reason: `Lost ${context}`,
                        explanation: `${winnerName ?? "Winner"} won ${result.holesWonA}-${result.holesWonB} (${result.tiedHoles} tied)`,
                        gameType: "nassau",
                        segment: segment.name,
                        pairingId: pairing.pairingId,
                    });
                }
            }

            // Detect and process presses (not for overall unless enabled)
            if (config.pressConfig.pressEnabled &&
                (segment.name !== "overall" || config.pressConfig.pressAppliesToOverall)) {
                // Convert + validate manual presses for this pairing/segment.
                // Note: Press eligibility ("must be down by N") is validated here at settlement time,
                // when hole-by-hole scores are available.
                const manualPressStates: PressState[] = [];
                const manualPressInputs = (args.manualPresses ?? [])
                    .filter(mp => mp.pairingId === pairing.pairingId && mp.segment === segment.name)
                    .sort((a, b) =>
                        a.startHole - b.startHole ||
                        (a.initiatedBy as string).localeCompare(b.initiatedBy as string)
                    );

                for (const mp of manualPressInputs) {
                    // Defensive validation: ensure start hole is inside the segment
                    if (mp.startHole < segment.startHole || mp.startHole > segment.endHole) continue;

                    // Defensive validation: require at least 2 holes remaining (consistent with auto-press rules)
                    if (segment.endHole - mp.startHole + 1 < 2) continue;

                    // Determine which side is pressing based on who initiated
                    const pressingSide: "A" | "B" | null =
                        pairing.sideA.includes(mp.initiatedBy) ? "A" :
                            pairing.sideB.includes(mp.initiatedBy) ? "B" :
                                null;
                    if (!pressingSide) continue;

                    const request: ManualPressRequest = {
                        pairingId: pairing.pairingId,
                        segment: segment.name,
                        startHole: mp.startHole,
                        pressingSide,
                        triggeredByPlayerId: mp.initiatedBy,
                    };

                    const validation = validateManualPress(
                        request,
                        matchState,
                        config.pressConfig,
                        registry,
                        manualPressStates
                    );
                    if (!validation.valid) continue;

                    // Register to prevent duplicates across manual + auto presses
                    const key = makePressKey(pairing.pairingId, segment.name, mp.startHole);
                    registry.created.add(key);

                    manualPressStates.push({
                        pressId: `${pairing.pairingId}:${segment.name}:manual:${mp.startHole}`,
                        pairingId: pairing.pairingId,
                        segment: segment.name,
                        startHole: mp.startHole,
                        endHole: segment.endHole,
                        pressingSide,
                        triggeredByPlayerId: mp.initiatedBy,
                        valueCents: mp.valueCents,
                    });
                }

                const autoPresses = detectAutoPresses(
                    matchState,
                    config.pressConfig,
                    segmentBetCents,
                    registry,
                    manualPressStates
                );

                // Combine manual + auto presses
                const allPresses = [...manualPressStates, ...autoPresses];

                for (const press of allPresses) {
                    // Build press segment
                    const pressSegment: Segment = {
                        name: segment.name,
                        startHole: press.startHole,
                        endHole: press.endHole,
                    };

                    const pressMatchState = buildMatchState(
                        pairing,
                        pressSegment,
                        args.playerScores,
                        args.strokeAllocations,
                        args.matchConfig
                    );

                    const pressContext = `Press (hole ${press.startHole}+)`;
                    const pressResult = calculateMatchResult(pairing, pressMatchState, pressSegment, pressContext);
                    press.result = pressResult;
                    matchResults.push(pressResult);

                    // Generate press transaction with deterministic payout
                    if (pressResult.winner !== "tie") {
                        const winningSide = pressResult.winner === "A" ? pairing.sideA : pairing.sideB;
                        const losingSide = pressResult.winner === "A" ? pairing.sideB : pairing.sideA;

                        const pressPayouts = calculateTeamPayout(losingSide, winningSide, press.valueCents);
                        for (const payout of pressPayouts) {
                            transactions.push({
                                id: generateTransactionId({
                                    roundId: args.roundId,
                                    gameType: "nassau",
                                    pairingId: pairing.pairingId,
                                    segment: segment.name,
                                    pressId: press.pressId,
                                    index: txIndex++,
                                }),
                                fromPlayerId: payout.from,
                                toPlayerId: payout.to,
                                amountCents: payout.amount,
                                reason: `Lost ${pressContext}`,
                                explanation: `Press from hole ${press.startHole}: ${pressResult.holesWonA}-${pressResult.holesWonB}`,
                                gameType: "nassau",
                                segment: segment.name,
                                pairingId: pairing.pairingId,
                                pressId: press.pressId,
                            });
                        }
                    }
                }
            }
        }
    }

    return { transactions, matchResults };
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH PLAY SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface MatchPlayConfig {
    betPerUnitCents: number;
    betUnit: "match" | "hole";
}

export function calculateMatchPlaySettlement(
    args: SettlementArgs,
    config: MatchPlayConfig
): { transactions: RawTransaction[]; matchResults: MatchResult[] } {
    const transactions: RawTransaction[] = [];
    const matchResults: MatchResult[] = [];

    const playerIds = args.playerScores.map(ps => ps.playerId);

    // Generate pairings
    let pairings: Pairing[];
    if (args.gameMode === "individual") {
        pairings = generatePairings(playerIds, args.playerNames);
    } else if (args.sides && args.sides.length === 2) {
        pairings = [sidesToPairing(args.sides)];
    } else {
        throw new Error("Match play requires individual mode or exactly 2 sides");
    }

    const segments = getSegmentsToSettle(args.holeSelection);
    // For match play, use the "overall" segment or first segment for 9-hole
    const segment = segments.find(s => s.name === "overall") ?? segments[0];

    let txIndex = 0;

    for (const pairing of pairings) {
        const matchState = buildMatchState(
            pairing,
            segment,
            args.playerScores,
            args.strokeAllocations,
            args.matchConfig
        );

        const result = calculateMatchResult(pairing, matchState, segment, "Match Play");
        matchResults.push(result);

        if (result.winner !== "tie") {
            const winningSide = result.winner === "A" ? pairing.sideA : pairing.sideB;
            const losingSide = result.winner === "A" ? pairing.sideB : pairing.sideA;

            // Calculate amount
            const holeDiff = Math.abs(result.holesWonA - result.holesWonB);
            const amount = config.betUnit === "hole"
                ? config.betPerUnitCents * holeDiff
                : config.betPerUnitCents;

            // Use deterministic team payout
            const matchPayouts = calculateTeamPayout(losingSide, winningSide, amount);
            for (const payout of matchPayouts) {
                transactions.push({
                    id: generateTransactionId({
                        roundId: args.roundId,
                        gameType: "match_play",
                        pairingId: pairing.pairingId,
                        index: txIndex++,
                    }),
                    fromPlayerId: payout.from,
                    toPlayerId: payout.to,
                    amountCents: payout.amount,
                    reason: "Match Play",
                    explanation: `${result.holesWonA}-${result.holesWonB} (${result.tiedHoles} tied)`,
                    gameType: "match_play",
                    pairingId: pairing.pairingId,
                });
            }
        }
    }

    return { transactions, matchResults };
}

// ═══════════════════════════════════════════════════════════════════════════
// STROKE PLAY SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface StrokePlayConfig {
    betPerUnitCents: number;
    payoutMode: "pot" | "war";
    maxStrokeDiffPerPair?: number;  // For war mode
    tieBreakMethod: "split" | "countback";
}

interface PlayerNetTotal {
    playerId: Id<"players">;
    netTotal: number;
    netScores: number[];
}

function calculateNetTotals(
    args: SettlementArgs,
    segment: Segment
): PlayerNetTotal[] {
    return args.playerScores.map(ps => {
        const alloc = args.strokeAllocations.find(a => a.playerId === ps.playerId);
        let netTotal = 0;
        const netScores: number[] = [];

        for (let h = segment.startHole; h <= segment.endHole; h++) {
            const gross = ps.holeScores[h - 1];
            if (gross === null || gross === undefined) {
                throw new Error(`Missing score for hole ${h}. Round must be complete.`);
            }
            const strokes = alloc?.strokesByHole[h - 1] ?? 0;
            const net = gross - strokes;
            netScores.push(net);
            netTotal += net;
        }

        return { playerId: ps.playerId, netTotal, netScores };
    }).sort((a, b) => {
        // Primary: net total ascending
        if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
        // Tie-breaker: playerId for determinism
        return (a.playerId as string).localeCompare(b.playerId as string);
    });
}

function countbackTieBreaker(
    tied: PlayerNetTotal[]
): { winners: Id<"players">[]; method: string } {
    const ranges = [
        { name: "Back 9", start: 9, end: 17 },
        { name: "Back 6", start: 12, end: 17 },
        { name: "Back 3", start: 15, end: 17 },
        { name: "Hole 18", start: 17, end: 17 },
    ];

    let remaining = [...tied];

    for (const range of ranges) {
        const totals = remaining.map(p => ({
            ...p,
            rangeTotal: p.netScores.slice(range.start, range.end + 1).reduce((a, b) => a + b, 0),
        })).sort((a, b) => a.rangeTotal - b.rangeTotal);

        const minTotal = totals[0].rangeTotal;
        remaining = totals.filter(t => t.rangeTotal === minTotal);

        if (remaining.length === 1) {
            return { winners: [remaining[0].playerId], method: `Won on ${range.name} countback` };
        }
    }

    return { winners: remaining.map(p => p.playerId), method: "Split (true tie)" };
}

export function calculateStrokePlaySettlement(
    args: SettlementArgs,
    config: StrokePlayConfig
): { transactions: RawTransaction[]; standings: PlayerNetTotal[] } {
    const transactions: RawTransaction[] = [];

    const segments = getSegmentsToSettle(args.holeSelection);
    const segment = segments.find(s => s.name === "overall") ?? segments[0];

    const standings = calculateNetTotals(args, segment);
    const playerIds = standings.map(s => s.playerId);

    let txIndex = 0;

    if (config.payoutMode === "pot") {
        // Pot mode: winner(s) take all
        const minScore = standings[0].netTotal;
        const tied = standings.filter(s => s.netTotal === minScore);

        let winners: Id<"players">[];
        if (tied.length > 1 && config.tieBreakMethod === "countback") {
            const result = countbackTieBreaker(tied);
            winners = result.winners;
        } else {
            winners = tied.map(t => t.playerId);
        }

        const losers = playerIds.filter(id => !winners.includes(id));
        const totalPot = config.betPerUnitCents * playerIds.length;
        const winnerShares = assignSplit(winners, totalPot);

        // Each loser pays their share to winners
        for (const loserId of losers) {
            const loserPay = config.betPerUnitCents;
            const perWinner = splitCentsEvenly(loserPay, winners.length);

            winners.forEach((winnerId, wi) => {
                if (perWinner[wi] > 0) {
                    transactions.push({
                        id: generateTransactionId({
                            roundId: args.roundId,
                            gameType: "stroke_play",
                            index: txIndex++,
                        }),
                        fromPlayerId: loserId,
                        toPlayerId: winnerId,
                        amountCents: perWinner[wi],
                        reason: "Stroke Play",
                        explanation: `${args.playerNames.get(winnerId) ?? "Winner"} won with net ${minScore}`,
                        gameType: "stroke_play",
                    });
                }
            });
        }
    } else {
        // War mode: pairwise stroke differential
        for (let i = 0; i < standings.length; i++) {
            for (let j = i + 1; j < standings.length; j++) {
                const better = standings[i];
                const worse = standings[j];

                let strokeDiff = worse.netTotal - better.netTotal;
                if (config.maxStrokeDiffPerPair && strokeDiff > config.maxStrokeDiffPerPair) {
                    strokeDiff = config.maxStrokeDiffPerPair;
                }

                if (strokeDiff > 0) {
                    transactions.push({
                        id: generateTransactionId({
                            roundId: args.roundId,
                            gameType: "stroke_play",
                            pairingId: `${better.playerId}_vs_${worse.playerId}`,
                            index: txIndex++,
                        }),
                        fromPlayerId: worse.playerId,
                        toPlayerId: better.playerId,
                        amountCents: strokeDiff * config.betPerUnitCents,
                        reason: "Stroke Play War",
                        explanation: `Lost by ${strokeDiff} strokes at ${formatCents(config.betPerUnitCents)}/stroke`,
                        gameType: "stroke_play",
                        pairingId: `${better.playerId}_vs_${worse.playerId}`,
                    });
                }
            }
        }
    }

    return { transactions, standings };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKINS SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface SkinsConfig {
    skinValueCents: number;
    carryover: boolean;
    finalCarryoverMode: "no_winner" | "split_tied_18";
}

export function calculateSkinsSettlement(
    args: SettlementArgs,
    config: SkinsConfig
): { transactions: RawTransaction[]; skinsWon: Map<Id<"players">, number> } {
    const transactions: RawTransaction[] = [];
    const skinsWon = new Map<Id<"players">, number>();

    const segments = getSegmentsToSettle(args.holeSelection);
    const segment = segments.find(s => s.name === "overall") ?? segments[0];

    let carryoverSkins = 0;
    let txIndex = 0;

    for (let h = segment.startHole; h <= segment.endHole; h++) {
        const holeIndex = h - 1;

        // Find lowest net score
        const scores = args.playerScores.map(ps => {
            const alloc = args.strokeAllocations.find(a => a.playerId === ps.playerId);
            const gross = ps.holeScores[holeIndex];
            if (gross === null || gross === undefined) {
                throw new Error(`Missing score for hole ${h}. Round must be complete.`);
            }
            const strokes = alloc?.strokesByHole[holeIndex] ?? 0;
            return { playerId: ps.playerId, net: gross - strokes };
        });

        const minNet = Math.min(...scores.map(s => s.net));
        const winners = scores.filter(s => s.net === minNet);

        if (winners.length === 1) {
            // Single winner takes skin + carryover
            const winnerId = winners[0].playerId;
            const totalSkins = 1 + carryoverSkins;
            skinsWon.set(winnerId, (skinsWon.get(winnerId) ?? 0) + totalSkins);

            // Each other player pays
            for (const ps of args.playerScores) {
                if (ps.playerId !== winnerId) {
                    transactions.push({
                        id: generateTransactionId({
                            roundId: args.roundId,
                            gameType: "skins",
                            holeNumber: h,
                            index: txIndex++,
                        }),
                        fromPlayerId: ps.playerId,
                        toPlayerId: winnerId,
                        amountCents: config.skinValueCents * totalSkins,
                        reason: `Hole ${h} (${totalSkins} skin${totalSkins > 1 ? "s" : ""})`,
                        explanation: `${args.playerNames.get(winnerId) ?? "Winner"} won with net ${minNet}`,
                        gameType: "skins",
                    });
                }
            }

            carryoverSkins = 0;
        } else if (config.carryover) {
            carryoverSkins++;
        }
    }

    // Handle final carryover
    if (carryoverSkins > 0 && config.finalCarryoverMode === "split_tied_18") {
        const lastHoleIndex = segment.endHole - 1;
        const scores = args.playerScores.map(ps => {
            const alloc = args.strokeAllocations.find(a => a.playerId === ps.playerId);
            const gross = ps.holeScores[lastHoleIndex];
            if (gross === null || gross === undefined) {
                throw new Error(`Missing score for hole ${segment.endHole}. Round must be complete.`);
            }
            const strokes = alloc?.strokesByHole[lastHoleIndex] ?? 0;
            return { playerId: ps.playerId, net: gross - strokes };
        });

        const minNet = Math.min(...scores.map(s => s.net));
        const winners = scores.filter(s => s.net === minNet).map(s => s.playerId);
        const losers = scores.filter(s => s.net > minNet).map(s => s.playerId);

        if (winners.length < args.playerScores.length && losers.length > 0) {
            const totalValue = carryoverSkins * config.skinValueCents;

            // Use deterministic team payout
            const carryoverPayouts = calculateTeamPayout(losers, winners, totalValue);
            for (const payout of carryoverPayouts) {
                transactions.push({
                    id: generateTransactionId({
                        roundId: args.roundId,
                        gameType: "skins",
                        segment: "overall",
                        index: txIndex++,
                    }),
                    fromPlayerId: payout.from,
                    toPlayerId: payout.to,
                    amountCents: payout.amount,
                    reason: `Carryover (${carryoverSkins} skins)`,
                    explanation: `Split among tied-low on hole ${segment.endHole}`,
                    gameType: "skins",
                });
            }
        }
    }

    return { transactions, skinsWon };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDE BETS SETTLEMENT V2
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate side bets settlement with V2 format (raw transactions with IDs)
 */
export function calculateSideBetsSettlementV2(
    args: SettlementArgs
): RawTransaction[] {
    if (!args.sideBetsConfig || !args.parByHole) return [];

    const config = args.sideBetsConfig;
    const transactions: RawTransaction[] = [];
    let txIndex = 0;

    const segments = getSegmentsToSettle(args.holeSelection);
    const segment = segments.find(s => s.name === "overall") ?? segments[0];

    // Sort player scores for determinism
    const sortedPlayers = [...args.playerScores].sort((a, b) =>
        (a.playerId as string).localeCompare(b.playerId as string)
    );

    // Birdies (auto-calculated from scores)
    if (config.birdies && args.parByHole) {
        for (const ps of sortedPlayers) {
            let birdieCount = 0;

            for (let h = segment.startHole; h <= segment.endHole; h++) {
                const holeIndex = h - 1;
                const score = ps.holeScores[holeIndex];
                if (score === null || score === undefined) continue; // Skip incomplete holes

                const par = args.parByHole[holeIndex] ?? 4;
                if (score > 0 && score < par) {
                    birdieCount++;
                }
            }

            if (birdieCount > 0) {
                // Each other player pays
                for (const otherPs of sortedPlayers) {
                    if (otherPs.playerId !== ps.playerId) {
                        transactions.push({
                            id: generateTransactionId({
                                roundId: args.roundId,
                                gameType: "side_bets",
                                pairingId: `birdie:${ps.playerId}`,
                                index: txIndex++,
                            }),
                            fromPlayerId: otherPs.playerId,
                            toPlayerId: ps.playerId,
                            amountCents: config.amountCents * birdieCount,
                            reason: `${birdieCount} birdie(s)`,
                            explanation: `Birdie bonus`,
                            gameType: "side_bets",
                        });
                    }
                }
            }
        }
    }

    // Greenies (manually tracked)
    if (config.greenies && args.trackedSideBetCounts) {
        // Sort tracked counts for determinism
        const sortedTracked = [...args.trackedSideBetCounts].sort((a, b) =>
            (a.playerId as string).localeCompare(b.playerId as string)
        );

        for (const tracked of sortedTracked) {
            if (tracked.greenies > 0) {
                for (const otherPs of sortedPlayers) {
                    if (otherPs.playerId !== tracked.playerId) {
                        transactions.push({
                            id: generateTransactionId({
                                roundId: args.roundId,
                                gameType: "side_bets",
                                pairingId: `greenie:${tracked.playerId}`,
                                index: txIndex++,
                            }),
                            fromPlayerId: otherPs.playerId,
                            toPlayerId: tracked.playerId,
                            amountCents: config.amountCents * tracked.greenies,
                            reason: `${tracked.greenies} greenie(s)`,
                            explanation: `Greenie bonus`,
                            gameType: "side_bets",
                        });
                    }
                }
            }
        }
    }

    // Sandies (manually tracked)
    if (config.sandies && args.trackedSideBetCounts) {
        const sortedTracked = [...args.trackedSideBetCounts].sort((a, b) =>
            (a.playerId as string).localeCompare(b.playerId as string)
        );

        for (const tracked of sortedTracked) {
            if (tracked.sandies > 0) {
                for (const otherPs of sortedPlayers) {
                    if (otherPs.playerId !== tracked.playerId) {
                        transactions.push({
                            id: generateTransactionId({
                                roundId: args.roundId,
                                gameType: "side_bets",
                                pairingId: `sandy:${tracked.playerId}`,
                                index: txIndex++,
                            }),
                            fromPlayerId: otherPs.playerId,
                            toPlayerId: tracked.playerId,
                            amountCents: config.amountCents * tracked.sandies,
                            reason: `${tracked.sandies} sandy(ies)`,
                            explanation: `Sandy bonus`,
                            gameType: "side_bets",
                        });
                    }
                }
            }
        }
    }

    return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTLEMENT RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface SettlementResultV2 {
    settlementVersion: "v2";
    rawTransactions: RawTransaction[];
    nettedPayments: NettedPayment[];
    matchResults?: MatchResult[];
    standings?: PlayerNetTotal[];
    skinsWon?: Map<Id<"players">, number>;
}

/**
 * Main settlement dispatcher
 */
export function calculateSettlement(
    gameType: GameType,
    args: SettlementArgs,
    config: NassauConfig | MatchPlayConfig | StrokePlayConfig | SkinsConfig
): SettlementResultV2 {
    // Sort playerScores for determinism before processing
    const sortedArgs: SettlementArgs = {
        ...args,
        playerScores: [...args.playerScores].sort((a, b) =>
            (a.playerId as string).localeCompare(b.playerId as string)
        ),
    };

    // Validate round completion for all required holes
    const segments = getSegmentsToSettle(args.holeSelection);
    for (const segment of segments) {
        if (segment.name === "overall") continue; // Covered by front/back
        validateRoundCompletion(sortedArgs.playerScores, segment);
    }

    let rawTransactions: RawTransaction[] = [];
    let matchResults: MatchResult[] | undefined;
    let standings: PlayerNetTotal[] | undefined;
    let skinsWon: Map<Id<"players">, number> | undefined;

    switch (gameType) {
        case "nassau": {
            const result = calculateNassauSettlement(sortedArgs, config as NassauConfig);
            rawTransactions = result.transactions;
            matchResults = result.matchResults;
            break;
        }
        case "match_play": {
            const result = calculateMatchPlaySettlement(sortedArgs, config as MatchPlayConfig);
            rawTransactions = result.transactions;
            matchResults = result.matchResults;
            break;
        }
        case "stroke_play": {
            const result = calculateStrokePlaySettlement(sortedArgs, config as StrokePlayConfig);
            rawTransactions = result.transactions;
            standings = result.standings;
            break;
        }
        case "skins": {
            const result = calculateSkinsSettlement(sortedArgs, config as SkinsConfig);
            rawTransactions = result.transactions;
            skinsWon = result.skinsWon;
            break;
        }
        case "side_bets": {
            rawTransactions = calculateSideBetsSettlementV2(sortedArgs);
            break;
        }
    }

    // Add side bets if configured (for all game types)
    if (gameType !== "side_bets" && sortedArgs.sideBetsConfig) {
        const sideBetTxns = calculateSideBetsSettlementV2(sortedArgs);
        rawTransactions = [...rawTransactions, ...sideBetTxns];
    }

    // Run invariant checks
    const { payments } = globalNetTransactions(rawTransactions);
    assertSettlementInvariants(rawTransactions, payments);

    return {
        settlementVersion: "v2",
        rawTransactions,
        nettedPayments: payments,
        matchResults,
        standings,
        skinsWon,
    };
}
