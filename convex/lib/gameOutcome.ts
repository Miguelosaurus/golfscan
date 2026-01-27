import { Id } from "../_generated/dataModel";
import {
  calculateMatchResult,
  generatePairings,
  sidesToPairing,
  sortPlayerIds,
  type PlayerScore as SettlementPlayerScore,
  type Segment,
  type SegmentName,
  type Side as SettlementSide,
  type TeamScoring,
} from "./gameSettlementV2";

export const GAME_OUTCOME_VERSION = 1 as const;

export type GameOutcomeStatus = "complete" | "incomplete" | "unsupported" | "error";
export type BetterDirection = "lower" | "higher";

export type GameOutcomeGameType = "stroke_play" | "match_play" | "nassau" | "skins";
export type GameOutcomeGameMode = "individual" | "head_to_head" | "teams";

export type TeamFormat = "individual" | "bestBall" | "aggregate";

export interface StandingsMetric {
  display: string;
  value?: number;
}

export interface StandingsDeciderMetric {
  display: string;
  value: number;
}

export interface StandingsDetailBlock {
  title: string;
  lines: string[];
}

export interface StandingsRow {
  sideId: string;
  label: string;
  placement: string; // "1", "T1", "2", ...
  isWinner: boolean;
  winnerBadge?: "WINNER" | "TIED WINNER";
  metricA: StandingsMetric;
  metricB: StandingsDeciderMetric;
  details?: StandingsDetailBlock[];
}

export interface StandingsColumns {
  metricA: { label: string };
  metricB: { label: string; isDecider: true; better: BetterDirection };
}

export interface StandingsTable {
  columns: StandingsColumns;
  rows: StandingsRow[];
}

export interface GameOutcomeVerdict {
  winnerLabel: string;
  text: string;
  subtext?: string;
}

export interface GameOutcomeAuditLight {
  holesPlayed: 9 | 18;
  holeSelection: "18" | "front_9" | "back_9";
  teamFormat: TeamFormat;
  teamScoring?: TeamScoring;
  matchPlayHoles?: {
    pairingId: string;
    segment: SegmentName;
    holes: Array<{
      holeNumber: number;
      sideANetScore: number;
      sideBNetScore: number;
      holeWinner: "A" | "B" | "tie";
    }>;
  };
  nassauOverallHoles?: {
    pairingId: string;
    holes: Array<{
      holeNumber: number;
      sideANetScore: number;
      sideBNetScore: number;
      holeWinner: "A" | "B" | "tie";
    }>;
  };
  courseHandicapByPlayerId?: Record<string, number>;
  strokeAllocationByPlayerId?: Record<string, number[]>;
  grossTotalBySideId?: Record<string, number>;
  netTotalBySideId?: Record<string, number>;
  nassauSegments?: Array<{
    pairingId: string;
    segment: SegmentName;
    context: string;
    sideA: string[];
    sideB: string[];
    holesWonA: number;
    holesWonB: number;
    tiedHoles: number;
    winner: "A" | "B" | "tie";
  }>;
  skinsWins?: Array<{
    holeNumber: number;
    winnerSideId: string;
    pointsAwarded: number;
    minNet: number;
  }>;
}

export interface GameOutcome {
  resultsVersion: number;
  computeStatus: GameOutcomeStatus;
  statusMessage?: string;
  gameType: GameOutcomeGameType;
  gameMode: GameOutcomeGameMode;
  scoringBasis: "net";
  holeSelection: "18" | "front_9" | "back_9";
  holesPlayed: 9 | 18;
  teamFormat: TeamFormat;
  sides: Array<{ sideId: string; name: string; playerIds: Id<"players">[] }>;
  winnerSideIds: string[];
  standings: StandingsTable | null;
  verdict: GameOutcomeVerdict | null;
  audit?: GameOutcomeAuditLight;
}

export interface ComputeGameOutcomeArgs {
  gameType: GameOutcomeGameType;
  gameMode: GameOutcomeGameMode;
  holeSelection: "18" | "front_9" | "back_9";
  teamScoring?: TeamScoring;
  sides: SettlementSide[];
  playerScores: SettlementPlayerScore[];
  strokeAllocations: Array<{ playerId: Id<"players">; strokesByHole: number[] }>;
  playerNames: Map<Id<"players">, string>;
  courseHandicapByPlayerId?: Map<Id<"players">, number>;
}

function holeNumbersForSelection(sel: "18" | "front_9" | "back_9"): number[] {
  if (sel === "18") return Array.from({ length: 18 }, (_, i) => i + 1);
  if (sel === "front_9") return Array.from({ length: 9 }, (_, i) => i + 1);
  return Array.from({ length: 9 }, (_, i) => i + 10);
}

function holesPlayedForSelection(sel: "18" | "front_9" | "back_9"): 9 | 18 {
  return sel === "18" ? 18 : 9;
}

function formatSideLabel(side: SettlementSide, playerNames: Map<Id<"players">, string>): string {
  if (side.name) return side.name;
  const ids = sortPlayerIds(side.playerIds);
  if (ids.length === 1) return playerNames.get(ids[0]) ?? "Player";
  return ids.map((id) => playerNames.get(id) ?? "Player").join(" & ");
}

function computeTeamFormat(sides: SettlementSide[], teamScoring?: TeamScoring): { teamFormat: TeamFormat; error?: string } {
  const hasTeams = sides.some((s) => (s.playerIds?.length ?? 0) > 1);
  if (!hasTeams) return { teamFormat: "individual" };
  if (!teamScoring) return { teamFormat: "individual", error: "Missing team scoring mode (bestBall/aggregate)." };
  return { teamFormat: teamScoring === "bestBall" ? "bestBall" : "aggregate" };
}

function buildAuditCommon(args: ComputeGameOutcomeArgs, teamFormat: TeamFormat): GameOutcomeAuditLight {
  const courseHandicapByPlayerId: Record<string, number> | undefined = args.courseHandicapByPlayerId
    ? Object.fromEntries(Array.from(args.courseHandicapByPlayerId.entries()).map(([k, v]) => [k as string, v]))
    : undefined;

  const strokeAllocationByPlayerId: Record<string, number[]> = Object.fromEntries(
    args.strokeAllocations.map((a) => [a.playerId as string, a.strokesByHole])
  );

  return {
    holesPlayed: holesPlayedForSelection(args.holeSelection),
    holeSelection: args.holeSelection,
    teamFormat,
    teamScoring: args.teamScoring,
    courseHandicapByPlayerId,
    strokeAllocationByPlayerId,
  };
}

function isHolePresentForSide(
  side: SettlementSide,
  holeIndex: number,
  playerScoreById: Map<Id<"players">, SettlementPlayerScore>,
  teamFormat: TeamFormat
): boolean {
  const scores = side.playerIds.map((pid) => playerScoreById.get(pid)?.holeScores[holeIndex] ?? null);
  if (teamFormat === "bestBall") {
    return scores.some((s) => typeof s === "number" && s > 0);
  }
  return scores.every((s) => typeof s === "number" && s > 0);
}

function validateSupported(args: ComputeGameOutcomeArgs, teamFormat: TeamFormat): { ok: true } | { ok: false; message: string } {
  if (args.gameType === "stroke_play" || args.gameType === "skins") {
    if (args.gameMode !== "individual") {
      return { ok: false, message: `${args.gameType} does not support teams/head-to-head.` };
    }
  }

  if (args.gameType === "match_play" || args.gameType === "nassau") {
    if (args.gameMode !== "individual" && args.sides.length !== 2) {
      return { ok: false, message: `${args.gameType} requires exactly 2 sides for ${args.gameMode}.` };
    }
    if (teamFormat !== "individual" && args.gameMode === "individual") {
      return { ok: false, message: `${args.gameType} individual mode cannot have team sides.` };
    }
  }

  if (args.sides.length < 2) return { ok: false, message: "At least 2 sides are required." };
  return { ok: true };
}

function buildRowsWithPlacement(
  rowsSorted: Omit<StandingsRow, "placement" | "isWinner" | "winnerBadge">[],
  better: BetterDirection
): StandingsRow[] {
  const rows: StandingsRow[] = rowsSorted.map((r) => ({
    ...r,
    placement: "",
    isWinner: false,
  }));

  if (rows.length === 0) return rows;
  const bestValue = rows.reduce((best, cur) => {
    if (better === "lower") return Math.min(best, cur.metricB.value);
    return Math.max(best, cur.metricB.value);
  }, rows[0].metricB.value);

  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].metricB.value === rows[i].metricB.value) j++;
    const rank = i + 1;
    const placement = j - i > 1 ? `T${rank}` : `${rank}`;
    for (let k = i; k < j; k++) rows[k].placement = placement;
    i = j;
  }

  const winners = rows.filter((r) => r.metricB.value === bestValue);
  const badge = winners.length > 1 ? "TIED WINNER" : "WINNER";
  for (const r of winners) {
    r.isWinner = true;
    r.winnerBadge = badge;
  }
  return rows;
}

function netForPlayerOnHole(
  playerId: Id<"players">,
  holeIndex: number,
  playerScoreById: Map<Id<"players">, SettlementPlayerScore>,
  strokesByPlayerId: Map<Id<"players">, number[]>
): number | null {
  const gross = playerScoreById.get(playerId)?.holeScores[holeIndex];
  if (gross === null || gross === undefined || gross <= 0) return null;
  const strokes = strokesByPlayerId.get(playerId)?.[holeIndex] ?? 0;
  return gross - strokes;
}

function netForSideOnHole(
  side: SettlementSide,
  holeIndex: number,
  playerScoreById: Map<Id<"players">, SettlementPlayerScore>,
  strokesByPlayerId: Map<Id<"players">, number[]>,
  teamFormat: TeamFormat
): number | null {
  const nets = side.playerIds
    .map((pid) => netForPlayerOnHole(pid, holeIndex, playerScoreById, strokesByPlayerId))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  if (teamFormat === "bestBall") {
    return nets.length ? Math.min(...nets) : null;
  }
  if (nets.length !== side.playerIds.length) return null;
  return nets.reduce((a, b) => a + b, 0);
}

function buildMatchStateForOutcome(args: {
  pairingId: string;
  segment: Segment;
  sideA: Id<"players">[];
  sideB: Id<"players">[];
  playerScoreById: Map<Id<"players">, SettlementPlayerScore>;
  strokesByPlayerId: Map<Id<"players">, number[]>;
  teamFormat: TeamFormat;
}) {
  const holes: Array<{
    holeNumber: number;
    sideANetScore: number;
    sideBNetScore: number;
    holeWinner: "A" | "B" | "tie";
    runningStatus: { leader: "A" | "B" | "tie"; margin: number };
  }> = [];

  let holesWonA = 0;
  let holesWonB = 0;

  for (let h = args.segment.startHole; h <= args.segment.endHole; h++) {
    const holeIndex = h - 1;
    const sideANet = netForSideOnHole(
      { sideId: "A", playerIds: args.sideA },
      holeIndex,
      args.playerScoreById,
      args.strokesByPlayerId,
      args.teamFormat
    );
    const sideBNet = netForSideOnHole(
      { sideId: "B", playerIds: args.sideB },
      holeIndex,
      args.playerScoreById,
      args.strokesByPlayerId,
      args.teamFormat
    );

    if (sideANet === null || sideBNet === null) {
      throw new Error(`Missing score for hole ${h}. Round must be complete.`);
    }

    let holeWinner: "A" | "B" | "tie" = "tie";
    if (sideANet < sideBNet) {
      holeWinner = "A";
      holesWonA++;
    } else if (sideBNet < sideANet) {
      holeWinner = "B";
      holesWonB++;
    }

    const margin = holesWonA - holesWonB;
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
    pairingId: args.pairingId,
    segment: args.segment.name,
    holes,
    presses: [],
  };
}

function segmentLabel(segment: Segment, holeSelection: "18" | "front_9" | "back_9"): string {
  if (segment.name === "overall") return "Overall";
  if (holeSelection === "18") return segment.name === "front" ? "Front 9" : "Back 9";
  // For 9-hole rounds, label based on what was played.
  return holeSelection === "front_9" ? "Front 9" : "Back 9";
}

function segmentsForNassau(holeSelection: "18" | "front_9" | "back_9"): Segment[] {
  if (holeSelection === "18") {
    return [
      { name: "front", startHole: 1, endHole: 9 },
      { name: "back", startHole: 10, endHole: 18 },
      { name: "overall", startHole: 1, endHole: 18 },
    ];
  }
  const startHole = holeSelection === "front_9" ? 1 : 10;
  const endHole = holeSelection === "front_9" ? 9 : 18;
  const primary: Segment = { name: holeSelection === "front_9" ? "front" : "back", startHole, endHole };
  const overall: Segment = { name: "overall", startHole, endHole };
  return [primary, overall];
}

function buildRecord(wins: number, losses: number, ties: number): string {
  return `${wins}-${losses}-${ties}`;
}

export function computeGameOutcome(args: ComputeGameOutcomeArgs): GameOutcome {
  const holesPlayed = holesPlayedForSelection(args.holeSelection);
  const scoringBasis = "net" as const;
  const normalizedSides: Array<{ sideId: string; name: string; playerIds: Id<"players">[] }> = args.sides.map((s) => ({
    sideId: s.sideId,
    name: formatSideLabel(s, args.playerNames),
    playerIds: sortPlayerIds(s.playerIds),
  }));

  const { teamFormat, error: teamError } = computeTeamFormat(args.sides, args.teamScoring);
  const audit = buildAuditCommon(args, teamFormat);

  if (teamError) {
    return {
      resultsVersion: GAME_OUTCOME_VERSION,
      computeStatus: "unsupported",
      statusMessage: teamError,
      gameType: args.gameType,
      gameMode: args.gameMode,
      scoringBasis,
      holeSelection: args.holeSelection,
      holesPlayed,
      teamFormat,
      sides: normalizedSides,
      winnerSideIds: [],
      standings: null,
      verdict: null,
      audit,
    };
  }

  const supported = validateSupported(args, teamFormat);
  if (!supported.ok) {
    return {
      resultsVersion: GAME_OUTCOME_VERSION,
      computeStatus: "unsupported",
      statusMessage: "Standings not available for this game format yet.",
      gameType: args.gameType,
      gameMode: args.gameMode,
      scoringBasis,
      holeSelection: args.holeSelection,
      holesPlayed,
      teamFormat,
      sides: normalizedSides,
      winnerSideIds: [],
      standings: null,
      verdict: null,
      audit: { ...audit, teamFormat },
    };
  }

  const playerScoreById = new Map<Id<"players">, SettlementPlayerScore>(
    args.playerScores.map((ps) => [ps.playerId, ps])
  );
  const strokesByPlayerId = new Map<Id<"players">, number[]>(
    args.strokeAllocations.map((a) => [a.playerId, a.strokesByHole])
  );

  const requiredHoleIndexes = holeNumbersForSelection(args.holeSelection).map((h) => h - 1);
  for (const side of args.sides) {
    for (const holeIndex of requiredHoleIndexes) {
      if (!isHolePresentForSide(side, holeIndex, playerScoreById, teamFormat)) {
        return {
          resultsVersion: GAME_OUTCOME_VERSION,
          computeStatus: "incomplete",
          statusMessage: "Standings available after the round is complete.",
          gameType: args.gameType,
          gameMode: args.gameMode,
          scoringBasis,
          holeSelection: args.holeSelection,
          holesPlayed,
          teamFormat,
          sides: normalizedSides,
          winnerSideIds: [],
          standings: null,
          verdict: null,
          audit,
        };
      }
    }
  }

  try {
    if (args.gameType === "stroke_play") {
      const grossTotalBySideId: Record<string, number> = {};
      const netTotalBySideId: Record<string, number> = {};

      const rowsBase = normalizedSides.map((side) => {
        const playerId = side.playerIds[0];
        let grossTotal = 0;
        let strokesTotal = 0;
        for (const holeIndex of requiredHoleIndexes) {
          const gross = playerScoreById.get(playerId)?.holeScores[holeIndex] ?? 0;
          const strokes = strokesByPlayerId.get(playerId)?.[holeIndex] ?? 0;
          grossTotal += gross;
          strokesTotal += strokes;
        }
        const netTotal = grossTotal - strokesTotal;
        grossTotalBySideId[side.sideId] = grossTotal;
        netTotalBySideId[side.sideId] = netTotal;

        return {
          sideId: side.sideId,
          label: side.name,
          metricA: { display: `${grossTotal}`, value: grossTotal },
          metricB: { display: `${netTotal}`, value: netTotal },
        };
      });

      const rowsSorted = rowsBase.sort((a, b) => {
        if (a.metricB.value !== b.metricB.value) return a.metricB.value - b.metricB.value;
        if ((a.metricA.value ?? 0) !== (b.metricA.value ?? 0)) return (a.metricA.value ?? 0) - (b.metricA.value ?? 0);
        return a.label.localeCompare(b.label);
      });

      const rows = buildRowsWithPlacement(rowsSorted, "lower");
      const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);

      const winnerLabel =
        winnerSideIds.length > 1
          ? `${winnerSideIds.length === 2 ? "Two-way tie" : `${winnerSideIds.length}-way tie`}`
          : rows.find((r) => r.isWinner)?.label ?? "Winner";
      const best = rows[0];
      const tiedWinners = rows.filter((r) => r.isWinner).map((r) => r.label).join(", ");
      const verdictText =
        winnerSideIds.length > 1
          ? `for the win with net ${best.metricB.display}: ${tiedWinners}.`
          : `won Stroke Play with net ${best.metricB.display} (gross ${best.metricA.display}).`;

      return {
        resultsVersion: GAME_OUTCOME_VERSION,
        computeStatus: "complete",
        gameType: args.gameType,
        gameMode: args.gameMode,
        scoringBasis,
        holeSelection: args.holeSelection,
        holesPlayed,
        teamFormat,
        sides: normalizedSides,
        winnerSideIds,
        standings: {
          columns: { metricA: { label: "GROSS" }, metricB: { label: "NET", isDecider: true, better: "lower" } },
          rows,
        },
        verdict: {
          winnerLabel,
          text: verdictText,
          subtext: "Net scoring (strokes applied).",
        },
        audit: { ...audit, grossTotalBySideId, netTotalBySideId },
      };
    }

    if (args.gameType === "skins") {
      const skinsCountBySideId: Record<string, number> = {};
      const skinPointsBySideId: Record<string, number> = {};
      const skinsWins: GameOutcomeAuditLight["skinsWins"] = [];

      for (const s of normalizedSides) {
        skinsCountBySideId[s.sideId] = 0;
        skinPointsBySideId[s.sideId] = 0;
      }

      let carryover = 0;
      for (const holeIndex of requiredHoleIndexes) {
        const scores = normalizedSides
          .map((side) => {
            const playerId = side.playerIds[0];
            const net = netForPlayerOnHole(playerId, holeIndex, playerScoreById, strokesByPlayerId);
            return { sideId: side.sideId, net };
          })
          .filter((s) => typeof s.net === "number") as Array<{ sideId: string; net: number }>;

        const minNet = Math.min(...scores.map((s) => s.net));
        const winners = scores.filter((s) => s.net === minNet);
        if (winners.length === 1) {
          const pointsAwarded = 1 + carryover;
          const winnerSideId = winners[0].sideId;
          skinsCountBySideId[winnerSideId] += 1;
          skinPointsBySideId[winnerSideId] += pointsAwarded;
          skinsWins.push({ holeNumber: holeIndex + 1, winnerSideId, pointsAwarded, minNet });
          carryover = 0;
        } else {
          carryover += 1;
        }
      }

      const rowsBase = normalizedSides.map((side) => ({
        sideId: side.sideId,
        label: side.name,
        metricA: { display: `${skinsCountBySideId[side.sideId]}`, value: skinsCountBySideId[side.sideId] },
        metricB: { display: `${skinPointsBySideId[side.sideId]}`, value: skinPointsBySideId[side.sideId] },
      }));

      const rowsSorted = rowsBase.sort((a, b) => {
        if (a.metricB.value !== b.metricB.value) return b.metricB.value - a.metricB.value;
        if ((a.metricA.value ?? 0) !== (b.metricA.value ?? 0)) return (b.metricA.value ?? 0) - (a.metricA.value ?? 0);
        return a.label.localeCompare(b.label);
      });

      const rows = buildRowsWithPlacement(rowsSorted, "higher");
      const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);
      const best = rows[0];
      const tiedWinners = rows.filter((r) => r.isWinner).map((r) => r.label).join(", ");

      const winnerLabel =
        winnerSideIds.length > 1
          ? `${winnerSideIds.length === 2 ? "Two-way tie" : `${winnerSideIds.length}-way tie`}`
          : rows.find((r) => r.isWinner)?.label ?? "Winner";

      const verdictText =
        winnerSideIds.length > 1
          ? `for the win with ${best.metricB.display} skin point${best.metricB.value === 1 ? "" : "s"}: ${tiedWinners}.`
          : `won Skins with ${best.metricB.display} point${best.metricB.value === 1 ? "" : "s"} (${best.metricA.display} skins).`;

      return {
        resultsVersion: GAME_OUTCOME_VERSION,
        computeStatus: "complete",
        gameType: args.gameType,
        gameMode: args.gameMode,
        scoringBasis,
        holeSelection: args.holeSelection,
        holesPlayed,
        teamFormat,
        sides: normalizedSides,
        winnerSideIds,
        standings: {
          columns: { metricA: { label: "SKINS" }, metricB: { label: "POINTS", isDecider: true, better: "higher" } },
          rows,
        },
        verdict: {
          winnerLabel,
          text: verdictText,
          subtext: "Net skins (strokes applied). Ties carry over.",
        },
        audit: { ...audit, skinsWins },
      };
    }

    // Match play + Nassau share match primitives.
    const playerIds = args.playerScores.map((ps) => ps.playerId);

    const pairings =
      args.gameMode === "individual"
        ? generatePairings(playerIds, args.playerNames)
        : [sidesToPairing(args.sides)];

    if (args.gameType === "match_play") {
      if (args.gameMode === "individual") {
        const pointsBySideId = new Map<string, number>();
        const winsBySideId = new Map<string, number>();
        const lossesBySideId = new Map<string, number>();
        const tiesBySideId = new Map<string, number>();

        for (const side of normalizedSides) {
          pointsBySideId.set(side.sideId, 0);
          winsBySideId.set(side.sideId, 0);
          lossesBySideId.set(side.sideId, 0);
          tiesBySideId.set(side.sideId, 0);
        }

        const segment: Segment = (() => {
          const holes = holeNumbersForSelection(args.holeSelection);
          return { name: "overall", startHole: holes[0], endHole: holes[holes.length - 1] };
        })();

        for (const pairing of pairings) {
          const state = buildMatchStateForOutcome({
            pairingId: pairing.pairingId,
            segment,
            sideA: pairing.sideA,
            sideB: pairing.sideB,
            playerScoreById,
            strokesByPlayerId,
            teamFormat,
          });
          const result = calculateMatchResult(pairing, state, segment, "Match Play");

          const sideAId = result.sideA[0] as string;
          const sideBId = result.sideB[0] as string;
          if (result.winner === "tie") {
            pointsBySideId.set(sideAId, (pointsBySideId.get(sideAId) ?? 0) + 0.5);
            pointsBySideId.set(sideBId, (pointsBySideId.get(sideBId) ?? 0) + 0.5);
            tiesBySideId.set(sideAId, (tiesBySideId.get(sideAId) ?? 0) + 1);
            tiesBySideId.set(sideBId, (tiesBySideId.get(sideBId) ?? 0) + 1);
          } else if (result.winner === "A") {
            pointsBySideId.set(sideAId, (pointsBySideId.get(sideAId) ?? 0) + 1);
            winsBySideId.set(sideAId, (winsBySideId.get(sideAId) ?? 0) + 1);
            lossesBySideId.set(sideBId, (lossesBySideId.get(sideBId) ?? 0) + 1);
          } else {
            pointsBySideId.set(sideBId, (pointsBySideId.get(sideBId) ?? 0) + 1);
            winsBySideId.set(sideBId, (winsBySideId.get(sideBId) ?? 0) + 1);
            lossesBySideId.set(sideAId, (lossesBySideId.get(sideAId) ?? 0) + 1);
          }
        }

        const rowsBase = normalizedSides.map((side) => {
          const w = winsBySideId.get(side.sideId) ?? 0;
          const l = lossesBySideId.get(side.sideId) ?? 0;
          const t = tiesBySideId.get(side.sideId) ?? 0;
          const pts = pointsBySideId.get(side.sideId) ?? 0;
          return {
            sideId: side.sideId,
            label: side.name,
            metricA: { display: buildRecord(w, l, t) },
            metricB: { display: `${pts}`, value: pts },
          };
        });

        const rowsSorted = rowsBase.sort((a, b) => {
          if (a.metricB.value !== b.metricB.value) return b.metricB.value - a.metricB.value;
          return a.label.localeCompare(b.label);
        });

        const rows = buildRowsWithPlacement(rowsSorted, "higher");
        const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);
        const best = rows[0];
        const tiedWinners = rows.filter((r) => r.isWinner).map((r) => r.label).join(", ");
        const winnerLabel =
          winnerSideIds.length > 1
            ? `${winnerSideIds.length === 2 ? "Two-way tie" : `${winnerSideIds.length}-way tie`}`
            : rows.find((r) => r.isWinner)?.label ?? "Winner";

        return {
          resultsVersion: GAME_OUTCOME_VERSION,
          computeStatus: "complete",
          gameType: args.gameType,
          gameMode: args.gameMode,
          scoringBasis,
          holeSelection: args.holeSelection,
          holesPlayed,
          teamFormat,
          sides: normalizedSides,
          winnerSideIds,
          standings: {
            columns: { metricA: { label: "RECORD" }, metricB: { label: "POINTS", isDecider: true, better: "higher" } },
            rows,
          },
          verdict: {
            winnerLabel,
            text:
              winnerSideIds.length > 1
                ? `for the win with ${best.metricB.display} points: ${tiedWinners}.`
                : `won Match Play with ${best.metricB.display} point${best.metricB.value === 1 ? "" : "s"} (record ${best.metricA.display}).`,
            subtext: "Net scoring (strokes applied).",
          },
          audit,
        };
      }

    // Head-to-head / teams: single match over played holes.
      const segment: Segment = (() => {
        const holes = holeNumbersForSelection(args.holeSelection);
        return { name: "overall", startHole: holes[0], endHole: holes[holes.length - 1] };
      })();

      const pairing = pairings[0];
      const state = buildMatchStateForOutcome({
        pairingId: pairing.pairingId,
        segment,
        sideA: pairing.sideA,
        sideB: pairing.sideB,
        playerScoreById,
        strokesByPlayerId,
        teamFormat,
      });
      const result = calculateMatchResult(pairing, state, segment, "Match Play");

      const holesA = result.holesWonA;
      const holesB = result.holesWonB;
      const tied = result.tiedHoles;
      const diffA = holesA - holesB;
      const diffB = holesB - holesA;

      const sideAId = args.sides.find((s) => sortPlayerIds(s.playerIds).join(",") === sortPlayerIds(result.sideA).join(","))?.sideId;
      const sideBId = args.sides.find((s) => sortPlayerIds(s.playerIds).join(",") === sortPlayerIds(result.sideB).join(","))?.sideId;

      const sideById = new Map(normalizedSides.map((s) => [s.sideId, s]));
      const rowAId = sideAId ?? normalizedSides[0].sideId;
      const rowBId = sideBId ?? normalizedSides[1].sideId;
      const labelA = sideById.get(rowAId)?.name ?? "Side A";
      const labelB = sideById.get(rowBId)?.name ?? "Side B";

      const rowsBase = [
        {
          sideId: rowAId,
          label: labelA,
          metricA: { display: `W${holesA} L${holesB} T${tied}` },
          metricB: { display: diffA === 0 ? "AS" : diffA > 0 ? `+${diffA}` : `${diffA}`, value: diffA },
        },
        {
          sideId: rowBId,
          label: labelB,
          metricA: { display: `W${holesB} L${holesA} T${tied}` },
          metricB: { display: diffB === 0 ? "AS" : diffB > 0 ? `+${diffB}` : `${diffB}`, value: diffB },
        },
      ];

      const rowsSorted = rowsBase.sort((a, b) => {
        if (a.metricB.value !== b.metricB.value) return b.metricB.value - a.metricB.value;
        return a.label.localeCompare(b.label);
      });
      const rows = buildRowsWithPlacement(rowsSorted, "higher");
      const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);

      const winnerLabel =
        winnerSideIds.length > 1
          ? "Match Play"
          : (result.winner === "A" ? labelA : labelB);

      const verdictText =
        winnerSideIds.length > 1
          ? `finished tied — ${labelA} ${holesA} holes, ${labelB} ${holesB} holes (${tied} tied).`
          : `won Match Play vs ${result.winner === "A" ? labelB : labelA} — ${result.winner === "A" ? holesA : holesB}-${result.winner === "A" ? holesB : holesA} holes (${tied} tied).`;

      return {
        resultsVersion: GAME_OUTCOME_VERSION,
        computeStatus: "complete",
        gameType: args.gameType,
        gameMode: args.gameMode,
        scoringBasis,
        holeSelection: args.holeSelection,
        holesPlayed,
        teamFormat,
        sides: normalizedSides,
        winnerSideIds,
        standings: {
          columns: { metricA: { label: "HOLES" }, metricB: { label: "RESULT", isDecider: true, better: "higher" } },
          rows,
        },
        verdict: {
          winnerLabel,
          text: verdictText,
          subtext: "Net scoring (strokes applied).",
        },
        audit: {
          ...audit,
          matchPlayHoles: {
            pairingId: pairing.pairingId,
            segment: "overall",
            holes: state.holes.map((h: any) => ({
              holeNumber: h.holeNumber,
              sideANetScore: h.sideANetScore,
              sideBNetScore: h.sideBNetScore,
              holeWinner: h.holeWinner,
            })),
          },
        },
      };
    }

    // Nassau
    const segments = segmentsForNassau(args.holeSelection);

    const nassauSegmentsAudit: NonNullable<GameOutcomeAuditLight["nassauSegments"]> = [];

    if (args.gameMode !== "individual") {
      const pairing = pairings[0];
      const sideAId =
        args.sides.find((s) => sortPlayerIds(s.playerIds).join(",") === sortPlayerIds(pairing.sideA).join(","))?.sideId ??
        args.sides[0].sideId;
      const sideBId =
        args.sides.find((s) => sortPlayerIds(s.playerIds).join(",") === sortPlayerIds(pairing.sideB).join(","))?.sideId ??
        args.sides[1].sideId;

      const unitsBySideId: Record<string, number> = { [sideAId]: 0, [sideBId]: 0 };
      const segmentResultsByContext: Record<
        string,
        {
          context: string;
          winner: "A" | "B" | "tie";
          holesWonA: number;
          holesWonB: number;
          tiedHoles: number;
        }
      > = {};

      for (const segment of segments) {
        const state = buildMatchStateForOutcome({
          pairingId: pairing.pairingId,
          segment,
          sideA: pairing.sideA,
          sideB: pairing.sideB,
          playerScoreById,
          strokesByPlayerId,
          teamFormat,
        });
        const result = calculateMatchResult(pairing, state, segment, segmentLabel(segment, args.holeSelection));

        nassauSegmentsAudit.push({
          pairingId: result.pairingId,
          segment: result.segment,
          context: result.context,
          sideA: result.sideA as unknown as string[],
          sideB: result.sideB as unknown as string[],
          holesWonA: result.holesWonA,
          holesWonB: result.holesWonB,
          tiedHoles: result.tiedHoles,
          winner: result.winner,
        });

        segmentResultsByContext[result.context] = {
          context: result.context,
          winner: result.winner,
          holesWonA: result.holesWonA,
          holesWonB: result.holesWonB,
          tiedHoles: result.tiedHoles,
        };

        if (result.winner === "tie") {
          unitsBySideId[sideAId] += 0.5;
          unitsBySideId[sideBId] += 0.5;
        } else if (result.winner === "A") {
          unitsBySideId[sideAId] += 1;
        } else {
          unitsBySideId[sideBId] += 1;
        }

        if (segment.name === "overall") {
          audit.nassauOverallHoles = {
            pairingId: pairing.pairingId,
            holes: state.holes.map((h: any) => ({
              holeNumber: h.holeNumber,
              sideANetScore: h.sideANetScore,
              sideBNetScore: h.sideBNetScore,
              holeWinner: h.holeWinner,
            })),
          };
        }
      }

      const rangeMax = args.holeSelection === "18" ? 3 : 2;

      const metricASummaryFor = (sideId: string) => {
        const isA = sideId === sideAId;
        const fmt = (label: string, context: string) => {
          const r = segmentResultsByContext[context];
          if (!r) return null;
          if (r.winner === "tie") return `${label} AS`;

          const holesFor = isA ? r.holesWonA : r.holesWonB;
          const holesAgainst = isA ? r.holesWonB : r.holesWonA;
          const didWin = (r.winner === "A" && isA) || (r.winner === "B" && !isA);
          return `${label} ${didWin ? "W" : "L"}${holesFor}-${holesAgainst}`;
        };

        const parts: string[] = [];
        if (args.holeSelection === "18") {
          parts.push(fmt("F", "Front 9") ?? "");
          parts.push(fmt("B", "Back 9") ?? "");
          parts.push(fmt("O", "Overall") ?? "");
        } else {
          const nineContext = args.holeSelection === "front_9" ? "Front 9" : "Back 9";
          const nineLabel = args.holeSelection === "front_9" ? "F" : "B";
          parts.push(fmt(nineLabel, nineContext) ?? "");
          parts.push(fmt("O", "Overall") ?? "");
        }
        return parts.filter(Boolean).join(" · ") || "--";
      };

      const rowsBase = normalizedSides.map((side) => ({
        sideId: side.sideId,
        label: side.name,
        metricA: { display: metricASummaryFor(side.sideId) },
        metricB: { display: `${unitsBySideId[side.sideId] ?? 0}`, value: unitsBySideId[side.sideId] ?? 0 },
      }));

      const rowsSorted = rowsBase.sort((a, b) => {
        if (a.metricB.value !== b.metricB.value) return b.metricB.value - a.metricB.value;
        return a.label.localeCompare(b.label);
      });
      const rows = buildRowsWithPlacement(rowsSorted, "higher");
      const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);
      const best = rows[0];
      const tiedWinners = rows.filter((r) => r.isWinner).map((r) => r.label).join(", ");

      const winnerLabel =
        winnerSideIds.length > 1
          ? `${winnerSideIds.length === 2 ? "Two-way tie" : `${winnerSideIds.length}-way tie`}`
          : rows.find((r) => r.isWinner)?.label ?? "Nassau";

      const verdictText =
        winnerSideIds.length > 1
          ? `for the win with ${best.metricB.display} units: ${tiedWinners}.`
          : `won Nassau with ${best.metricB.display}/${rangeMax} units.`;

      return {
        resultsVersion: GAME_OUTCOME_VERSION,
        computeStatus: "complete",
        gameType: args.gameType,
        gameMode: args.gameMode,
        scoringBasis,
        holeSelection: args.holeSelection,
        holesPlayed,
        teamFormat,
        sides: normalizedSides,
        winnerSideIds,
        standings: {
          columns: {
            metricA: { label: "F/B/O" },
            metricB: { label: "UNITS", isDecider: true, better: "higher" },
          },
          rows,
        },
        verdict: {
          winnerLabel,
          text: verdictText,
          subtext: "Net scoring (strokes applied).",
        },
        audit: { ...audit, nassauSegments: nassauSegmentsAudit },
      };
    }

    // Individual Nassau: units over all pairings/segments.
    const unitsBySideId = new Map<string, number>();
    const segWinsBySideId = new Map<string, number>();
    const segLossBySideId = new Map<string, number>();
    const segTiesBySideId = new Map<string, number>();
    for (const side of normalizedSides) {
      unitsBySideId.set(side.sideId, 0);
      segWinsBySideId.set(side.sideId, 0);
      segLossBySideId.set(side.sideId, 0);
      segTiesBySideId.set(side.sideId, 0);
    }

    for (const pairing of pairings) {
      for (const segment of segments) {
        const state = buildMatchStateForOutcome({
          pairingId: pairing.pairingId,
          segment,
          sideA: pairing.sideA,
          sideB: pairing.sideB,
          playerScoreById,
          strokesByPlayerId,
          teamFormat,
        });
        const result = calculateMatchResult(pairing, state, segment, segmentLabel(segment, args.holeSelection));

        const sideAId = result.sideA[0] as string;
        const sideBId = result.sideB[0] as string;

        nassauSegmentsAudit.push({
          pairingId: result.pairingId,
          segment: result.segment,
          context: result.context,
          sideA: result.sideA as unknown as string[],
          sideB: result.sideB as unknown as string[],
          holesWonA: result.holesWonA,
          holesWonB: result.holesWonB,
          tiedHoles: result.tiedHoles,
          winner: result.winner,
        });

        if (result.winner === "tie") {
          unitsBySideId.set(sideAId, (unitsBySideId.get(sideAId) ?? 0) + 0.5);
          unitsBySideId.set(sideBId, (unitsBySideId.get(sideBId) ?? 0) + 0.5);
          segTiesBySideId.set(sideAId, (segTiesBySideId.get(sideAId) ?? 0) + 1);
          segTiesBySideId.set(sideBId, (segTiesBySideId.get(sideBId) ?? 0) + 1);
        } else if (result.winner === "A") {
          unitsBySideId.set(sideAId, (unitsBySideId.get(sideAId) ?? 0) + 1);
          segWinsBySideId.set(sideAId, (segWinsBySideId.get(sideAId) ?? 0) + 1);
          segLossBySideId.set(sideBId, (segLossBySideId.get(sideBId) ?? 0) + 1);
        } else {
          unitsBySideId.set(sideBId, (unitsBySideId.get(sideBId) ?? 0) + 1);
          segWinsBySideId.set(sideBId, (segWinsBySideId.get(sideBId) ?? 0) + 1);
          segLossBySideId.set(sideAId, (segLossBySideId.get(sideAId) ?? 0) + 1);
        }
      }
    }

    const rowsBase = normalizedSides.map((side) => {
      const units = unitsBySideId.get(side.sideId) ?? 0;
      const w = segWinsBySideId.get(side.sideId) ?? 0;
      const l = segLossBySideId.get(side.sideId) ?? 0;
      const t = segTiesBySideId.get(side.sideId) ?? 0;

      return {
        sideId: side.sideId,
        label: side.name,
        metricA: { display: buildRecord(w, l, t) },
        metricB: { display: `${units}`, value: units },
      };
    });

    const rowsSorted = rowsBase.sort((a, b) => {
      if (a.metricB.value !== b.metricB.value) return b.metricB.value - a.metricB.value;
      return a.label.localeCompare(b.label);
    });
    const rows = buildRowsWithPlacement(rowsSorted, "higher");
    const winnerSideIds = rows.filter((r) => r.isWinner).map((r) => r.sideId);
    const best = rows[0];
    const tiedWinners = rows.filter((r) => r.isWinner).map((r) => r.label).join(", ");

    const winnerLabel =
      winnerSideIds.length > 1
        ? `${winnerSideIds.length === 2 ? "Two-way tie" : `${winnerSideIds.length}-way tie`}`
        : rows.find((r) => r.isWinner)?.label ?? "Nassau";

    const verdictText =
      winnerSideIds.length > 1
        ? `for the win with ${best.metricB.display} units: ${tiedWinners}.`
        : args.gameMode === "individual"
          ? `won Nassau with ${best.metricB.display} units.`
          : `won Nassau with ${best.metricB.display}/${args.holeSelection === "18" ? 3 : 2} units.`;

    return {
      resultsVersion: GAME_OUTCOME_VERSION,
      computeStatus: "complete",
      gameType: args.gameType,
      gameMode: args.gameMode,
      scoringBasis,
      holeSelection: args.holeSelection,
      holesPlayed,
      teamFormat,
      sides: normalizedSides,
      winnerSideIds,
      standings: {
        columns: { metricA: { label: "SEG RECORD" }, metricB: { label: "UNITS", isDecider: true, better: "higher" } },
        rows,
      },
      verdict: {
        winnerLabel,
        text: verdictText,
        subtext: "Net scoring (strokes applied).",
      },
      audit: { ...audit, nassauSegments: nassauSegmentsAudit },
    };
  } catch (e: any) {
    return {
      resultsVersion: GAME_OUTCOME_VERSION,
      computeStatus: "error",
      statusMessage: e?.message ? String(e.message) : "Failed to compute standings.",
      gameType: args.gameType,
      gameMode: args.gameMode,
      scoringBasis,
      holeSelection: args.holeSelection,
      holesPlayed,
      teamFormat,
      sides: normalizedSides,
      winnerSideIds: [],
      standings: null,
      verdict: null,
      audit,
    };
  }
}
