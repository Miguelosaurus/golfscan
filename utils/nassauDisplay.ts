type AnyObj = Record<string, any>;

type SegmentKey = "front" | "back" | "overall";

export type NassauDetailTab = "payments" | "breakdown" | "net";

export interface NassauPlayerSegmentCell {
  segment: SegmentKey;
  contextLabel: string;
  result: "W" | "L" | "T";
  holesWonFor: number;
  holesWonAgainst: number;
  tiedHoles: number;
}

export interface NassauPlayerMatchup {
  opponentPlayerId: string;
  opponentName: string;
  pairingId: string;
  segments: NassauPlayerSegmentCell[];
}

export interface NassauPlayerDetail {
  playerId: string;
  playerName: string;
  segRecord: string;
  segmentsWon: number;
  matchups: NassauPlayerMatchup[];
}

export interface NassauPairwiseSettlement {
  pairKey: string;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  amountCents: number;
  lineItems: AnyObj[];
}

export interface NassauNetBalanceRow {
  playerId: string;
  playerName: string;
  netCents: number;
}

export interface NassauDisplayModel {
  isRoundRobin: boolean;
  pairingCount: number;
  segmentsPerPairing: number;
  totalSegmentMatches: number;
  totalLineItems: number;
  totalToSettleCents: number;
  grossMatchedCents: number;
  wagerSummary: string | null;
  standingsWinnerText: string | null;
  standingsColumns: {
    metricA: string;
    metricB: string;
  };
  playerDetails: NassauPlayerDetail[];
  pairwiseSettlements: NassauPairwiseSettlement[];
  netBalances: NassauNetBalanceRow[];
  lineItems: AnyObj[];
}

function cents(value: any): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function money(centsValue: number): string {
  return `$${(centsValue / 100).toFixed(2)}`;
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function buildParticipantNameMap(participants: AnyObj[]): Map<string, string> {
  return new Map(participants.map((p) => [String(p.playerId), String(p.name ?? "Player")]));
}

function parsePairingId(pairingId: string): [string | null, string | null] {
  if (typeof pairingId !== "string") return [null, null];
  const bits = pairingId.split("_vs_");
  if (bits.length !== 2) return [null, null];
  return [bits[0] ?? null, bits[1] ?? null];
}

function segmentLabel(segment: SegmentKey): string {
  if (segment === "front") return "Front 9";
  if (segment === "back") return "Back 9";
  return "Overall";
}

function segmentOrder(segment: string): number {
  if (segment === "front") return 0;
  if (segment === "back") return 1;
  if (segment === "overall") return 2;
  return 3;
}

function segmentsForSelection(holeSelection: "18" | "front_9" | "back_9"): SegmentKey[] {
  if (holeSelection === "18") return ["front", "back", "overall"];
  if (holeSelection === "front_9") return ["front"];
  return ["back"];
}

function buildWagerSummary(session: AnyObj, segmentKeys: SegmentKey[]): string | null {
  const amounts = session?.betSettings?.nassauAmounts ?? {};
  const defaultUnit = cents(session?.betSettings?.betPerUnitCents);
  const segmentAmount = (segment: SegmentKey): number => {
    if (segment === "front") return cents(amounts.frontCents ?? defaultUnit);
    if (segment === "back") return cents(amounts.backCents ?? defaultUnit);
    return cents(amounts.overallCents ?? defaultUnit * 2);
  };

  const parts = segmentKeys.map((segment) => `${segmentLabel(segment)} ${money(segmentAmount(segment))}`);
  return parts.length ? parts.join(" • ") : null;
}

function normalizeLineItems(rawTransactions: AnyObj[]): AnyObj[] {
  return [...rawTransactions]
    .map((tx) => ({
      ...tx,
      id: String(tx.id ?? ""),
      amountCents: cents(tx.amountCents),
      segment: typeof tx.segment === "string" ? tx.segment : "unknown",
      pairingId: typeof tx.pairingId === "string" ? tx.pairingId : "unknown",
    }))
    .sort((a, b) => {
      if (a.pairingId !== b.pairingId) return String(a.pairingId).localeCompare(String(b.pairingId));
      const seg = segmentOrder(String(a.segment)) - segmentOrder(String(b.segment));
      if (seg !== 0) return seg;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
}

function buildPairwiseSettlements(
  lineItems: AnyObj[],
  nameByPlayerId: Map<string, string>
): NassauPairwiseSettlement[] {
  type PairLedger = {
    playerAId: string;
    playerBId: string;
    netFromAToB: number;
    lineItems: AnyObj[];
  };

  const map = new Map<string, PairLedger>();
  for (const item of lineItems) {
    const fromPlayerId = String(item.fromPlayerId ?? "");
    const toPlayerId = String(item.toPlayerId ?? "");
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) continue;
    const [playerAId, playerBId] = sortPair(fromPlayerId, toPlayerId);
    const key = `${playerAId}|${playerBId}`;
    if (!map.has(key)) {
      map.set(key, { playerAId, playerBId, netFromAToB: 0, lineItems: [] });
    }
    const row = map.get(key)!;
    row.lineItems.push(item);
    const amount = cents(item.amountCents);
    if (fromPlayerId === playerAId) row.netFromAToB += amount;
    else row.netFromAToB -= amount;
  }

  return Array.from(map.entries())
    .map(([pairKey, row]) => {
      const playerAName = nameByPlayerId.get(row.playerAId) ?? "Player";
      const playerBName = nameByPlayerId.get(row.playerBId) ?? "Player";
      const fromPlayerId = row.netFromAToB >= 0 ? row.playerAId : row.playerBId;
      const toPlayerId = row.netFromAToB >= 0 ? row.playerBId : row.playerAId;
      return {
        pairKey,
        playerAId: row.playerAId,
        playerAName,
        playerBId: row.playerBId,
        playerBName,
        fromPlayerId,
        fromPlayerName: nameByPlayerId.get(fromPlayerId) ?? "Player",
        toPlayerId,
        toPlayerName: nameByPlayerId.get(toPlayerId) ?? "Player",
        amountCents: Math.abs(row.netFromAToB),
        lineItems: [...row.lineItems].sort((a, b) => segmentOrder(String(a.segment)) - segmentOrder(String(b.segment))),
      };
    })
    .filter((row) => row.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents || a.pairKey.localeCompare(b.pairKey));
}

function buildNetBalances(lineItems: AnyObj[], nameByPlayerId: Map<string, string>): NassauNetBalanceRow[] {
  const balances = new Map<string, number>();
  for (const item of lineItems) {
    const fromPlayerId = String(item.fromPlayerId ?? "");
    const toPlayerId = String(item.toPlayerId ?? "");
    const amount = cents(item.amountCents);
    if (!fromPlayerId || !toPlayerId || amount <= 0) continue;
    balances.set(fromPlayerId, (balances.get(fromPlayerId) ?? 0) - amount);
    balances.set(toPlayerId, (balances.get(toPlayerId) ?? 0) + amount);
  }
  return Array.from(balances.entries())
    .map(([playerId, netCents]) => ({
      playerId,
      playerName: nameByPlayerId.get(playerId) ?? "Player",
      netCents,
    }))
    .sort((a, b) => b.netCents - a.netCents || a.playerName.localeCompare(b.playerName));
}

function buildStandingsWinnerText(gameOutcome: AnyObj | null | undefined, segmentTotal: number): string | null {
  if (!gameOutcome || gameOutcome.computeStatus !== "complete") return null;
  const rows = Array.isArray(gameOutcome?.standings?.rows) ? gameOutcome.standings.rows : [];
  if (!rows.length) return null;
  const winners = rows.filter((r: AnyObj) => !!r.isWinner);
  const winnerNames = winners.map((w: AnyObj) => String(w.label ?? "Player"));
  if (winnerNames.length === 0) return null;
  if (winnerNames.length === 1) {
    const best = winners[0];
    const points = String(best?.metricB?.display ?? "0");
    return `${winnerNames[0]} leads Nassau segments with ${points}/${segmentTotal}.`;
  }
  return `Tied leaders in Nassau segments: ${winnerNames.join(", ")}.`;
}

function buildPlayerDetails(
  participants: AnyObj[],
  nameByPlayerId: Map<string, string>,
  gameOutcome: AnyObj | null | undefined,
  matchResults: AnyObj[],
  segmentKeys: SegmentKey[]
): NassauPlayerDetail[] {
  const standingsRows: AnyObj[] = Array.isArray(gameOutcome?.standings?.rows) ? gameOutcome.standings.rows : [];
  const rowBySideId = new Map(standingsRows.map((row) => [String(row.sideId), row]));
  const segmentSet = new Set(segmentKeys);
  const mainResults = matchResults.filter((r) => {
    const isMain = typeof r?.segment === "string" && segmentSet.has(r.segment as SegmentKey);
    const isPress = typeof r?.context === "string" && r.context.toLowerCase().startsWith("press");
    const hasSingles = Array.isArray(r?.sideA) && r.sideA.length === 1 && Array.isArray(r?.sideB) && r.sideB.length === 1;
    return isMain && !isPress && hasSingles;
  });

  const matchupsByPlayer = new Map<string, Map<string, NassauPlayerMatchup>>();
  for (const result of mainResults) {
    const playerA = String(result.sideA[0]);
    const playerB = String(result.sideB[0]);
    const pairingId = String(result.pairingId ?? `${playerA}_vs_${playerB}`);
    const segment = result.segment as SegmentKey;
    const contextLabel = typeof result.context === "string" ? result.context : segmentLabel(segment);

    const addCell = (playerId: string, opponentId: string, isA: boolean) => {
      if (!matchupsByPlayer.has(playerId)) matchupsByPlayer.set(playerId, new Map());
      const byOpponent = matchupsByPlayer.get(playerId)!;
      if (!byOpponent.has(opponentId)) {
        byOpponent.set(opponentId, {
          opponentPlayerId: opponentId,
          opponentName: nameByPlayerId.get(opponentId) ?? "Player",
          pairingId,
          segments: [],
        });
      }
      const matchup = byOpponent.get(opponentId)!;
      const holesWonFor = isA ? cents(result.holesWonA) : cents(result.holesWonB);
      const holesWonAgainst = isA ? cents(result.holesWonB) : cents(result.holesWonA);
      let outcome: "W" | "L" | "T" = "T";
      if (result.winner === "A") outcome = isA ? "W" : "L";
      else if (result.winner === "B") outcome = isA ? "L" : "W";
      matchup.segments.push({
        segment,
        contextLabel,
        result: outcome,
        holesWonFor,
        holesWonAgainst,
        tiedHoles: cents(result.tiedHoles),
      });
    };

    addCell(playerA, playerB, true);
    addCell(playerB, playerA, false);
  }

  return participants
    .map((p) => {
      const playerId = String(p.playerId);
      const row = rowBySideId.get(playerId);
      const matchups = Array.from(matchupsByPlayer.get(playerId)?.values() ?? [])
        .map((matchup) => ({
          ...matchup,
          segments: [...matchup.segments].sort((a, b) => segmentOrder(a.segment) - segmentOrder(b.segment)),
        }))
        .sort((a, b) => a.opponentName.localeCompare(b.opponentName));
      return {
        playerId,
        playerName: nameByPlayerId.get(playerId) ?? String(p.name ?? "Player"),
        segRecord: String(row?.metricA?.display ?? "0-0-0"),
        segmentsWon: Number(row?.metricB?.value ?? Number(row?.metricB?.display ?? 0) ?? 0),
        matchups,
      };
    })
    .sort((a, b) => b.segmentsWon - a.segmentsWon || a.playerName.localeCompare(b.playerName));
}

export function buildNassauDisplayModel(args: {
  linkedSession: AnyObj | null | undefined;
  gameOutcome: AnyObj | null | undefined;
}): NassauDisplayModel | null {
  const linkedSession = args.linkedSession;
  if (!linkedSession || linkedSession?.gameType !== "nassau") return null;
  const settlement = linkedSession?.settlement;
  const hasSettlementV2 = !!(settlement && settlement.settlementVersion === "v2");

  const participants: AnyObj[] = Array.isArray(linkedSession?.participants) ? linkedSession.participants : [];
  const nameByPlayerId = buildParticipantNameMap(participants);
  const holeSelection = (linkedSession?.holeSelection ?? args.gameOutcome?.holeSelection ?? "18") as "18" | "front_9" | "back_9";
  const segmentKeys = segmentsForSelection(holeSelection);

  const outcomeAuditResults: AnyObj[] = Array.isArray(args.gameOutcome?.audit?.nassauSegments)
    ? args.gameOutcome.audit.nassauSegments
    : [];
  const allMatchResults: AnyObj[] = hasSettlementV2
    ? (Array.isArray(settlement.matchResults) ? settlement.matchResults : [])
    : outcomeAuditResults;
  const mainMatchResults = allMatchResults.filter((r) => {
    const isPress = typeof r?.context === "string" && r.context.toLowerCase().startsWith("press");
    return !isPress;
  });

  const pairingCount = new Set(mainMatchResults.map((r) => String(r.pairingId ?? "")).filter(Boolean)).size;
  const segmentsPerPairing = segmentKeys.length;
  const totalSegmentMatches = pairingCount * segmentsPerPairing;

  const rawTransactions: AnyObj[] = hasSettlementV2 && Array.isArray(settlement.rawTransactions) ? settlement.rawTransactions : [];
  const nassauLineItems = normalizeLineItems(rawTransactions.filter((tx) => tx.gameType === "nassau"));
  const pairwiseSettlements = buildPairwiseSettlements(nassauLineItems, nameByPlayerId);
  const netBalances = buildNetBalances(nassauLineItems, nameByPlayerId);
  const playerDetails = buildPlayerDetails(participants, nameByPlayerId, args.gameOutcome, allMatchResults, segmentKeys);

  const nettedPayments: AnyObj[] = hasSettlementV2 && Array.isArray(settlement.nettedPayments) ? settlement.nettedPayments : [];
  const totalToSettleCents = nettedPayments.reduce((sum, row) => sum + cents(row.amountCents), 0);
  const grossMatchedCents = nassauLineItems.reduce((sum, row) => sum + cents(row.amountCents), 0);

  return {
    isRoundRobin: pairingCount > 1,
    pairingCount,
    segmentsPerPairing,
    totalSegmentMatches,
    totalLineItems: nassauLineItems.length,
    totalToSettleCents,
    grossMatchedCents,
    wagerSummary: buildWagerSummary(linkedSession, segmentKeys),
    standingsWinnerText: buildStandingsWinnerText(args.gameOutcome, segmentKeys.length * Math.max(1, participants.length - 1)),
    standingsColumns: {
      metricA: "SEGMENTS (W-L-T)",
      metricB: "SEGMENTS WON",
    },
    playerDetails,
    pairwiseSettlements,
    netBalances,
    lineItems: nassauLineItems,
  };
}
