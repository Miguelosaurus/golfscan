/**
 * Game Settlement Calculators
 *
 * Calculates "who owes whom" for each game type based on scores.
 * All amounts are in CENTS (integers).
 */

import { Id } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Transaction {
    fromPlayerId: Id<"players">;
    toPlayerId: Id<"players">;
    amountCents: number;
    reason: string;
}

export interface PlayerScore {
    playerId: Id<"players">;
    holeScores: number[]; // Raw scores by hole (index 0 = hole 1)
    netHoleScores?: number[]; // After stroke adjustments
}

export interface Side {
    sideId: string;
    name?: string;
    playerIds: Id<"players">[];
}

export interface StrokeAllocation {
    playerId: Id<"players">;
    strokesByHole: number[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate net scores for a player given their stroke allocation
 */
function calculateNetScores(
    grossScores: number[],
    strokesByHole: number[]
): number[] {
    return grossScores.map((gross, i) => gross - (strokesByHole[i] || 0));
}

/**
 * Sum scores for a range of holes (0-indexed)
 */
function sumScores(scores: number[], startHole: number, endHole: number): number {
    return scores.slice(startHole, endHole + 1).reduce((a, b) => a + b, 0);
}

/**
 * Get hole winner (lowest net score)
 * Returns null if tie
 */
function getHoleWinner(
    playerScores: { playerId: Id<"players">; netScore: number }[]
): Id<"players"> | null {
    const sortedScores = [...playerScores].sort((a, b) => a.netScore - b.netScore);
    if (sortedScores.length < 2) return sortedScores[0]?.playerId || null;
    if (sortedScores[0].netScore === sortedScores[1].netScore) return null; // Tie
    return sortedScores[0].playerId;
}

// ═══════════════════════════════════════════════════════════════════════════
// STROKE PLAY SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface StrokePlaySettlementArgs {
    playerScores: PlayerScore[];
    strokeAllocations: StrokeAllocation[];
    betPerUnitCents: number;
    payoutMode: "war" | "pot";
    holeSelection: "18" | "front_9" | "back_9";
}

/**
 * Calculate Stroke Play settlement
 * Winner = lowest total net score
 */
export function calculateStrokePlaySettlement(
    args: StrokePlaySettlementArgs
): Transaction[] {
    const { playerScores, strokeAllocations, betPerUnitCents, payoutMode, holeSelection } =
        args;

    // Determine hole range
    const startHole = holeSelection === "back_9" ? 9 : 0;
    const endHole = holeSelection === "front_9" ? 8 : 17;

    // Calculate net totals for each player
    const playerNetTotals = playerScores.map((ps) => {
        const allocation = strokeAllocations.find((a) => a.playerId === ps.playerId);
        const netScores = calculateNetScores(ps.holeScores, allocation?.strokesByHole || []);
        const total = sumScores(netScores, startHole, endHole);
        return { playerId: ps.playerId, netTotal: total };
    });

    // Sort by net total (lowest first = winner)
    playerNetTotals.sort((a, b) => a.netTotal - b.netTotal);

    const transactions: Transaction[] = [];

    if (payoutMode === "pot") {
        // Winner takes all
        const winner = playerNetTotals[0];
        const losers = playerNetTotals.slice(1);

        for (const loser of losers) {
            transactions.push({
                fromPlayerId: loser.playerId,
                toPlayerId: winner.playerId,
                amountCents: betPerUnitCents,
                reason: "Lost Stroke Play",
            });
        }
    } else {
        // War mode: each player settles with every other based on relative position
        // Simple implementation: each loser pays winner the unit bet
        const winner = playerNetTotals[0];
        for (let i = 1; i < playerNetTotals.length; i++) {
            transactions.push({
                fromPlayerId: playerNetTotals[i].playerId,
                toPlayerId: winner.playerId,
                amountCents: betPerUnitCents,
                reason: "Lost Stroke Play",
            });
        }
    }

    return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH PLAY SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface MatchPlaySettlementArgs {
    sides: Side[];
    playerScores: PlayerScore[];
    strokeAllocations: StrokeAllocation[];
    betPerUnitCents: number;
    holeSelection: "18" | "front_9" | "back_9";
    betUnit?: "match" | "hole" | "stroke_margin" | "winner" | "point" | "skin";
}

/**
 * Calculate Match Play settlement
 * Count holes won by each side, winner takes bet
 * If betUnit is "hole", multiply betPerUnitCents by holes won
 */
export function calculateMatchPlaySettlement(
    args: MatchPlaySettlementArgs
): Transaction[] {
    const { sides, playerScores, strokeAllocations, betPerUnitCents, holeSelection, betUnit } = args;

    if (sides.length !== 2) {
        throw new Error("Match play requires exactly 2 sides");
    }

    const [sideA, sideB] = sides;

    // Get hole range
    const startHole = holeSelection === "back_9" ? 9 : 0;
    const endHole = holeSelection === "front_9" ? 8 : 17;

    // Track holes won by each side
    let sideAWins = 0;
    let sideBWins = 0;

    for (let holeIndex = startHole; holeIndex <= endHole; holeIndex++) {
        // Get best net score for each side on this hole
        const sideABest = Math.min(
            ...sideA.playerIds.map((pid) => {
                const ps = playerScores.find((p) => p.playerId === pid);
                const alloc = strokeAllocations.find((a) => a.playerId === pid);
                if (!ps) return Infinity;
                return ps.holeScores[holeIndex] - (alloc?.strokesByHole[holeIndex] || 0);
            })
        );

        const sideBBest = Math.min(
            ...sideB.playerIds.map((pid) => {
                const ps = playerScores.find((p) => p.playerId === pid);
                const alloc = strokeAllocations.find((a) => a.playerId === pid);
                if (!ps) return Infinity;
                return ps.holeScores[holeIndex] - (alloc?.strokesByHole[holeIndex] || 0);
            })
        );

        if (sideABest < sideBBest) {
            sideAWins++;
        } else if (sideBBest < sideABest) {
            sideBWins++;
        }
        // Ties don't count
    }

    const transactions: Transaction[] = [];

    // Calculate amount based on betUnit
    // If betUnit is "hole", multiply by holes won difference
    // Otherwise, it's a flat match bet
    const holesWonDiff = Math.abs(sideAWins - sideBWins);
    const isPerHole = betUnit === "hole";
    const totalAmount = isPerHole ? betPerUnitCents * holesWonDiff : betPerUnitCents;

    if (sideAWins > sideBWins) {
        // Side A wins - each B player pays each A player
        for (const loserPid of sideB.playerIds) {
            for (const winnerPid of sideA.playerIds) {
                transactions.push({
                    fromPlayerId: loserPid,
                    toPlayerId: winnerPid,
                    amountCents: Math.round(totalAmount / sideA.playerIds.length),
                    reason: isPerHole
                        ? `Lost Match Play (${sideAWins}-${sideBWins}, $${(betPerUnitCents / 100).toFixed(0)}/hole × ${holesWonDiff})`
                        : `Lost Match Play (${sideAWins}-${sideBWins})`,
                });
            }
        }
    } else if (sideBWins > sideAWins) {
        // Side B wins
        for (const loserPid of sideA.playerIds) {
            for (const winnerPid of sideB.playerIds) {
                transactions.push({
                    fromPlayerId: loserPid,
                    toPlayerId: winnerPid,
                    amountCents: Math.round(totalAmount / sideB.playerIds.length),
                    reason: isPerHole
                        ? `Lost Match Play (${sideBWins}-${sideAWins}, $${(betPerUnitCents / 100).toFixed(0)}/hole × ${holesWonDiff})`
                        : `Lost Match Play (${sideBWins}-${sideAWins})`,
                });
            }
        }
    }
    // All square = no transactions

    return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// NASSAU SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface NassauSettlementArgs {
    sides: Side[];
    playerScores: PlayerScore[];
    strokeAllocations: StrokeAllocation[];
    betPerUnitCents: number;
    holeSelection: "18" | "front_9" | "back_9";
    // Per-segment amounts (optional, falls back to betPerUnitCents if not provided)
    nassauAmounts?: {
        frontCents: number;
        backCents: number;
        overallCents: number;
    };
    presses?: Array<{
        startHole: number;
        segment: "front" | "back";
        valueCents: number;
    }>;
}

/**
 * Calculate Nassau settlement
 * Bets:
 * - 18 holes: Front 9, Back 9, Overall (18)
 * - 9 holes: Front/Back (played nine) + Overall (same nine)
 * Supports separate amounts for each segment via nassauAmounts
 */
export function calculateNassauSettlement(args: NassauSettlementArgs): Transaction[] {
    const { sides, playerScores, strokeAllocations, betPerUnitCents, holeSelection, nassauAmounts, presses } =
        args;

    if (sides.length !== 2) {
        throw new Error("Nassau requires exactly 2 sides");
    }

    // Get per-segment amounts (fallback to betPerUnitCents for backwards compatibility)
    const frontAmount = nassauAmounts?.frontCents ?? betPerUnitCents;
    const backAmount = nassauAmounts?.backCents ?? betPerUnitCents;
    const overallAmount = nassauAmounts?.overallCents ?? betPerUnitCents;

    const transactions: Transaction[] = [];

    // Helper to calculate match result for a hole range
    const calculateSegment = (
        startHole: number,
        endHole: number
    ): { winner: "A" | "B" | "tie"; aWins: number; bWins: number } => {
        let aWins = 0;
        let bWins = 0;

        for (let h = startHole; h <= endHole; h++) {
            const sideABest = Math.min(
                ...sides[0].playerIds.map((pid) => {
                    const ps = playerScores.find((p) => p.playerId === pid);
                    const alloc = strokeAllocations.find((a) => a.playerId === pid);
                    if (!ps) return Infinity;
                    return ps.holeScores[h] - (alloc?.strokesByHole[h] || 0);
                })
            );
            const sideBBest = Math.min(
                ...sides[1].playerIds.map((pid) => {
                    const ps = playerScores.find((p) => p.playerId === pid);
                    const alloc = strokeAllocations.find((a) => a.playerId === pid);
                    if (!ps) return Infinity;
                    return ps.holeScores[h] - (alloc?.strokesByHole[h] || 0);
                })
            );
            if (sideABest < sideBBest) aWins++;
            else if (sideBBest < sideABest) bWins++;
        }

        if (aWins > bWins) return { winner: "A", aWins, bWins };
        if (bWins > aWins) return { winner: "B", aWins, bWins };
        return { winner: "tie", aWins, bWins };
    };

    // Add transactions for a segment winner
    const addWinnerTransactions = (winner: "A" | "B", amount: number, reason: string) => {
        const winningSide = winner === "A" ? sides[0] : sides[1];
        const losingSide = winner === "A" ? sides[1] : sides[0];

        for (const loser of losingSide.playerIds) {
            for (const winnerPid of winningSide.playerIds) {
                transactions.push({
                    fromPlayerId: loser,
                    toPlayerId: winnerPid,
                    amountCents: Math.round(amount / winningSide.playerIds.length),
                    reason,
                });
            }
        }
    };

    // Calculate each segment with appropriate amount
    if (holeSelection === "18" || holeSelection === "front_9") {
        const front = calculateSegment(0, 8);
        if (front.winner !== "tie") {
            addWinnerTransactions(front.winner, frontAmount, "Lost Front 9");
        }
    }

    if (holeSelection === "18" || holeSelection === "back_9") {
        const back = calculateSegment(9, 17);
        if (back.winner !== "tie") {
            addWinnerTransactions(back.winner, backAmount, "Lost Back 9");
        }
    }

    const overallRange =
        holeSelection === "front_9" ? { start: 0, end: 8 } :
            holeSelection === "back_9" ? { start: 9, end: 17 } :
                { start: 0, end: 17 };

    const overall = calculateSegment(overallRange.start, overallRange.end);
    if (overall.winner !== "tie") {
        addWinnerTransactions(overall.winner, overallAmount, "Lost Overall");
    }

    // Handle presses
    if (presses) {
        for (const press of presses) {
            const pressStart = press.startHole - 1; // Convert to 0-indexed
            const pressEnd = press.segment === "front" ? 8 : 17;
            const pressResult = calculateSegment(pressStart, pressEnd);
            if (pressResult.winner !== "tie") {
                addWinnerTransactions(
                    pressResult.winner,
                    press.valueCents,
                    `Lost Press (hole ${press.startHole}+)`
                );
            }
        }
    }

    return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKINS SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface SkinsSettlementArgs {
    playerScores: PlayerScore[];
    strokeAllocations: StrokeAllocation[];
    skinValueCents: number;
    carryover: boolean;
    holeSelection: "18" | "front_9" | "back_9";
    payoutMode: "war" | "pot";
}

/**
 * Calculate Skins settlement
 * Lowest net score wins the skin; ties carry over if enabled
 */
export function calculateSkinsSettlement(args: SkinsSettlementArgs): Transaction[] {
    const {
        playerScores,
        strokeAllocations,
        skinValueCents,
        carryover,
        holeSelection,
        payoutMode,
    } = args;

    const startHole = holeSelection === "back_9" ? 9 : 0;
    const endHole = holeSelection === "front_9" ? 8 : 17;

    // Track skins won by each player
    const skinsWon = new Map<string, number>();
    playerScores.forEach((ps) => skinsWon.set(ps.playerId as string, 0));

    let carryoverSkins = 0;

    for (let holeIndex = startHole; holeIndex <= endHole; holeIndex++) {
        const holeResults = playerScores.map((ps) => {
            const alloc = strokeAllocations.find((a) => a.playerId === ps.playerId);
            const netScore = ps.holeScores[holeIndex] - (alloc?.strokesByHole[holeIndex] || 0);
            return { playerId: ps.playerId, netScore };
        });

        const winner = getHoleWinner(holeResults);

        if (winner) {
            // Award skin(s)
            const currentSkins = skinsWon.get(winner as string) || 0;
            skinsWon.set(winner as string, currentSkins + 1 + carryoverSkins);
            carryoverSkins = 0;
        } else if (carryover) {
            // Tie - carry over
            carryoverSkins++;
        }
        // If no carryover, tied skins are just lost
    }

    // Handle final carryover (split among all if carryover was enabled)
    // For simplicity, ignored or can split - implementation choice

    const transactions: Transaction[] = [];

    if (payoutMode === "pot") {
        // Winner of most skins takes entire pot
        let maxSkins = 0;
        let winner: Id<"players"> | null = null;

        skinsWon.forEach((count, pid) => {
            if (count > maxSkins) {
                maxSkins = count;
                winner = pid as Id<"players">;
            }
        });

        if (winner) {
            for (const ps of playerScores) {
                if (ps.playerId !== winner) {
                    transactions.push({
                        fromPlayerId: ps.playerId,
                        toPlayerId: winner,
                        amountCents: skinValueCents * (endHole - startHole + 1),
                        reason: "Lost Skins (pot)",
                    });
                }
            }
        }
    } else {
        // War mode: each skin won is paid by all other players
        skinsWon.forEach((count, winnerId) => {
            if (count > 0) {
                for (const ps of playerScores) {
                    if (ps.playerId !== (winnerId as Id<"players">)) {
                        transactions.push({
                            fromPlayerId: ps.playerId,
                            toPlayerId: winnerId as Id<"players">,
                            amountCents: skinValueCents * count,
                            reason: `${count} skin(s) won`,
                        });
                    }
                }
            }
        });
    }

    return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDE BETS (JUNK) SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface SideBetsSettlementArgs {
    playerScores: PlayerScore[];
    parByHole: number[]; // Par for each hole (index 0 = hole 1)
    holeSelection: "18" | "front_9" | "back_9";
    sideBets: {
        greenies: boolean;
        sandies: boolean;
        birdies: boolean;
        amountCents: number;
    };
    // Manually tracked side bet counts from session
    trackedCounts?: Array<{
        playerId: Id<"players">;
        greenies: number;
        sandies: number;
    }>;
}

/**
 * Calculate Side Bets (Junk) settlement
 * Supports:
 * - Birdies: counted automatically from scores vs par
 * - Greenies: from manually tracked counts (par-3 GIR)
 * - Sandies: from manually tracked counts (par from bunker)
 */
export function calculateSideBetsSettlement(args: SideBetsSettlementArgs): Transaction[] {
    const { playerScores, parByHole, holeSelection, sideBets, trackedCounts } = args;

    if (!sideBets.birdies && !sideBets.greenies && !sideBets.sandies) {
        return [];
    }

    const startHole = holeSelection === "back_9" ? 9 : 0;
    const endHole = holeSelection === "front_9" ? 8 : 17;

    const transactions: Transaction[] = [];

    // Count birdies for each player (auto-calculated from scores)
    if (sideBets.birdies) {
        const birdieCount = new Map<string, number>();

        for (const ps of playerScores) {
            let count = 0;
            for (let h = startHole; h <= endHole; h++) {
                const par = parByHole[h] || 4;
                if (ps.holeScores[h] > 0 && ps.holeScores[h] < par) {
                    // Birdie or better
                    count++;
                }
            }
            birdieCount.set(ps.playerId as string, count);
        }

        // Each player with birdies gets paid by all others
        birdieCount.forEach((count, winnerId) => {
            if (count > 0) {
                for (const ps of playerScores) {
                    if (ps.playerId !== (winnerId as Id<"players">)) {
                        transactions.push({
                            fromPlayerId: ps.playerId,
                            toPlayerId: winnerId as Id<"players">,
                            amountCents: sideBets.amountCents * count,
                            reason: `${count} birdie(s)`,
                        });
                    }
                }
            }
        });
    }

    // Add manually tracked greenies
    if (sideBets.greenies && trackedCounts) {
        for (const tracked of trackedCounts) {
            if (tracked.greenies > 0) {
                for (const ps of playerScores) {
                    if (ps.playerId !== tracked.playerId) {
                        transactions.push({
                            fromPlayerId: ps.playerId,
                            toPlayerId: tracked.playerId,
                            amountCents: sideBets.amountCents * tracked.greenies,
                            reason: `${tracked.greenies} greenie(s)`,
                        });
                    }
                }
            }
        }
    }

    // Add manually tracked sandies
    if (sideBets.sandies && trackedCounts) {
        for (const tracked of trackedCounts) {
            if (tracked.sandies > 0) {
                for (const ps of playerScores) {
                    if (ps.playerId !== tracked.playerId) {
                        transactions.push({
                            fromPlayerId: ps.playerId,
                            toPlayerId: tracked.playerId,
                            amountCents: sideBets.amountCents * tracked.sandies,
                            reason: `${tracked.sandies} sandy(ies)`,
                        });
                    }
                }
            }
        }
    }

    return transactions;
}
