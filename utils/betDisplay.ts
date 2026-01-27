export type HoleSelection = "18" | "front_9" | "back_9";
export type PayoutMode = "war" | "pot";

type GameType = "stroke_play" | "match_play" | "nassau" | "skins" | string;

type BetUnit = "match" | "hole" | "stroke_margin" | "winner" | "point" | "skin" | string;

export function formatDollarsFromCents(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return `$${(safe / 100).toFixed(0)}`;
}

function formatNassauAmountsLine(args: {
  holeSelection: HoleSelection;
  frontCents: number;
  backCents: number;
  overallCents: number;
}): string {
  const front = `Front ${formatDollarsFromCents(args.frontCents)}`;
  const back = `Back ${formatDollarsFromCents(args.backCents)}`;
  const overall = `Overall ${formatDollarsFromCents(args.overallCents)}`;

  if (args.holeSelection === "front_9") return `${front} • ${overall}`;
  if (args.holeSelection === "back_9") return `${back} • ${overall}`;
  return `${front} • ${back} • ${overall}`;
}

export function formatBetLineFromSession(args: {
  gameType: GameType;
  holeSelection: HoleSelection;
  payoutMode: PayoutMode;
  betSettings: any;
}): string {
  const { gameType, holeSelection, payoutMode, betSettings } = args;
  if (!betSettings?.enabled) return "";

  if (gameType === "nassau") {
    const frontCents =
      betSettings?.nassauAmounts?.frontCents ?? betSettings?.betPerUnitCents ?? 0;
    const backCents =
      betSettings?.nassauAmounts?.backCents ?? betSettings?.betPerUnitCents ?? 0;
    const overallCents =
      betSettings?.nassauAmounts?.overallCents ??
      (typeof betSettings?.betPerUnitCents === "number" ? betSettings.betPerUnitCents * 2 : 0);

    return formatNassauAmountsLine({ holeSelection, frontCents, backCents, overallCents });
  }

  const amount = formatDollarsFromCents(betSettings?.betPerUnitCents ?? 0);

  if (gameType === "skins") return `${amount} per skin`;

  if (gameType === "match_play") {
    const unit = (betSettings?.betUnit as BetUnit) === "hole" ? "hole" : "match";
    return `${amount} per ${unit}`;
  }

  if (gameType === "stroke_play") {
    return payoutMode === "pot" ? `${amount} buy-in` : `${amount} per stroke`;
  }

  return amount;
}

export function formatBetLineFromSetup(args: {
  gameType: GameType | null;
  holeSelection: HoleSelection;
  payoutMode: PayoutMode;
  betEnabled: boolean;
  betAmountDollars: number;
  betUnit: "match" | "hole" | "stroke_margin" | "winner";
  nassauFrontDollars: number;
  nassauBackDollars: number;
  nassauOverallDollars: number;
}): string {
  if (!args.betEnabled || !args.gameType) return "";

  if (args.gameType === "nassau") {
    return formatNassauAmountsLine({
      holeSelection: args.holeSelection,
      frontCents: args.nassauFrontDollars * 100,
      backCents: args.nassauBackDollars * 100,
      overallCents: args.nassauOverallDollars * 100,
    });
  }

  const amount = `$${args.betAmountDollars}`;

  if (args.gameType === "skins") return `${amount} per skin`;

  if (args.gameType === "match_play") {
    const unit = args.betUnit === "hole" ? "hole" : "match";
    return `${amount} per ${unit}`;
  }

  if (args.gameType === "stroke_play") {
    return args.payoutMode === "pot" ? `${amount} buy-in` : `${amount} per stroke`;
  }

  return amount;
}

export function formatBetPickerLabel(args: {
  gameType: GameType | null;
  payoutMode: PayoutMode;
  betUnit: "match" | "hole" | "stroke_margin" | "winner";
}): string {
  if (!args.gameType) return "Wager";
  if (args.gameType === "match_play") return args.betUnit === "hole" ? "Wager per Hole" : "Wager per Match";
  if (args.gameType === "stroke_play") return args.payoutMode === "pot" ? "Buy-in" : "Wager per Stroke";
  if (args.gameType === "skins") return "Wager per Skin";
  if (args.gameType === "nassau") return "Nassau Bet Amounts";
  return "Wager";
}

