import { PlayerRound, Score, Round, Course } from '@/types';

export const generateUniqueId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const calculateTotalScore = (scores: Score[]): number => {
  return scores.reduce((total, score) => total + score.strokes, 0);
};

export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDate = (date: Date): string => {
  return getLocalDateString(date);
};

export const parseLocalDateString = (dateString: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  // Guard against JS Date overflow (e.g., 2026-02-30 becomes March 2).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

export const ensureValidDate = (dateString: string | null | undefined): string => {
  // If dateString is null, undefined, or empty, return today's date
  if (!dateString || dateString.trim() === '') {
    return getLocalDateString();
  }

  const ymd = extractYmdDate(dateString);
  if (!ymd) {
    return getLocalDateString();
  }

  // Try to parse the date to ensure it's valid
  const parsedDate = parseLocalDateString(ymd);
  if (!parsedDate) return getLocalDateString();

  return ymd;
};

export const formatLocalDateString = (dateString: string, style: 'short' | 'long' = 'short'): string => {
  const date = parseLocalDateString(dateString);
  if (!date) return dateString;

  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsLong = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const weekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const monthName = style === 'long' ? monthsLong[date.getMonth()] : monthsShort[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  if (style === 'long') {
    const weekday = weekdaysLong[date.getDay()];
    return `${weekday}, ${monthName} ${day}, ${year}`;
  }
  return `${monthName} ${day}, ${year}`;
};

export const extractYmdDate = (input: string): string | null => {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(input);
  return match ? match[1] : null;
};

export const coerceToLocalDateString = (input: string): string | null => {
  const ymd = extractYmdDate(input);
  if (ymd) return ymd;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return getLocalDateString(parsed);
};

export const parseAnyDateStringToLocalDate = (input: string): Date | null => {
  const ymd = extractYmdDate(input);
  if (ymd) return parseLocalDateString(ymd);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const formatAnyDateString = (input: string, style: 'short' | 'long' = 'short'): string => {
  const ymd = coerceToLocalDateString(input);
  return ymd ? formatLocalDateString(ymd, style) : input;
};

export const toLocalDateTimeString = (input: string | null | undefined): string => {
  const ymd = ensureValidDate(input);
  return `${ymd}T00:00:00`;
};

export const getScoreDifferential = (playerScore: number, coursePar: number): number => {
  return playerScore - coursePar;
};

export const getScoreLabel = (differential: number): string => {
  if (differential === 0) return 'Par';
  if (differential < 0) return `${Math.abs(differential)} Under Par`;
  return `${differential} Over Par`;
};

export const getWinner = (players: PlayerRound[]): PlayerRound | null => {
  if (!players.length) return null;

  // First try to use net scores if available
  const playersWithNetScores = players.filter(p => p.netScore !== undefined);

  if (playersWithNetScores.length > 0) {
    return playersWithNetScores.reduce((lowest, current) => {
      return (current.netScore as number) < (lowest.netScore as number) ? current : lowest;
    }, playersWithNetScores[0]);
  }

  // Otherwise use gross scores
  return players.reduce((lowest, current) => {
    return current.totalScore < lowest.totalScore ? current : lowest;
  }, players[0]);
};

export const calculateNetScore = (totalScore: number, handicap?: number): number => {
  if (handicap === undefined) return totalScore;
  return totalScore - handicap;
};

// Haversine formula to compute distance between two coordinates
export const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Earth radius in kilometers

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Golf scoring utilities for 9-hole vs 18-hole rounds

export const getRoundHoleCount = (round: Round): number => {
  if (round.holeCount) return round.holeCount;

  // Determine hole count from player scores
  if (round.players.length === 0) return 18; // default

  const firstPlayerScores = round.players[0].scores;
  const maxHoleNumber = Math.max(...firstPlayerScores.map(score => score.holeNumber));

  // If scores go up to hole 9, it's a 9-hole round
  // If scores go up to hole 18, it's an 18-hole round
  return maxHoleNumber <= 9 ? 9 : 18;
};

export const convertNineHoleToEighteenEquivalent = (
  nineHoleScore: number,
  playerHandicap?: number,
  coursePar9?: number
): number => {
  // Based on USGA standards, we use expected score for the remaining 9 holes
  // rather than simply doubling the actual 9-hole score

  const defaultPar9 = coursePar9 || 36; // Standard 9-hole par

  if (playerHandicap !== undefined) {
    // Use handicap to estimate expected score for remaining 9 holes
    // Player's handicap represents strokes over par for 18 holes
    const nineHoleHandicap = playerHandicap / 2;
    const expectedNineHoleScore = defaultPar9 + nineHoleHandicap;

    return nineHoleScore + expectedNineHoleScore;
  } else {
    // If no handicap available, use a conservative estimate
    // Assume player performs at par + 4 strokes for the remaining 9 holes
    // This prevents artificially low averages from good 9-hole rounds
    const expectedNineHoleScore = defaultPar9 + 4;

    return nineHoleScore + expectedNineHoleScore;
  }
};

export const getEighteenHoleEquivalentScore = (
  playerRound: PlayerRound,
  round: Round,
  course?: Course
): number => {
  const holeCount = getRoundHoleCount(round);

  if (holeCount === 18) {
    return playerRound.totalScore;
  }

  // For 9-hole rounds, convert to 18-hole equivalent
  const holes = course?.holes ?? [];
  const coursePar9 = holes.length >= 9 ?
    holes.slice(0, 9).reduce((sum, hole) => sum + (hole?.par ?? 4), 0) :
    36; // default 9-hole par

  return convertNineHoleToEighteenEquivalent(
    playerRound.totalScore,
    playerRound.handicapUsed,
    coursePar9
  );
};

export const calculateAverageScoreWithHoleAdjustment = (
  playerRounds: { round: Round; playerData: PlayerRound; course?: Course }[]
): number => {
  if (playerRounds.length === 0) return 0;

  const eighteenHoleEquivalentScores = playerRounds.map(({ playerData, round, course }) =>
    getEighteenHoleEquivalentScore(playerData, round, course)
  );

  const totalScore = eighteenHoleEquivalentScores.reduce((sum, score) => sum + score, 0);
  return Math.round(totalScore / eighteenHoleEquivalentScores.length);
};
