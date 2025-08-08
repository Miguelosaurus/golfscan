import { PlayerRound, Score, Round, Course } from '@/types';

export const generateUniqueId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const calculateTotalScore = (scores: Score[]): number => {
  return scores.reduce((total, score) => total + score.strokes, 0);
};

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const ensureValidDate = (dateString: string | null | undefined): string => {
  // If dateString is null, undefined, or empty, return today's date
  if (!dateString || dateString.trim() === '') {
    return new Date().toISOString().split('T')[0];
  }
  
  // Validate the date format (basic YYYY-MM-DD check)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return new Date().toISOString().split('T')[0];
  }
  
  // Try to parse the date to ensure it's valid
  const parsedDate = new Date(dateString);
  if (isNaN(parsedDate.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  
  return dateString;
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

export const calculateHandicap = (differentials: number[]): number => {
  // Sort differentials from lowest to highest
  const sortedDiffs = [...differentials].sort((a, b) => a - b);
  
  // Determine how many scores to use based on total available
  let scoresUsed = 0;
  if (sortedDiffs.length >= 20) scoresUsed = 8;
  else if (sortedDiffs.length >= 15) scoresUsed = 6;
  else if (sortedDiffs.length >= 10) scoresUsed = 4;
  else if (sortedDiffs.length >= 5) scoresUsed = 2;
  else scoresUsed = 1;
  
  // Calculate average of the best differentials
  const sum = sortedDiffs.slice(0, scoresUsed).reduce((acc, diff) => acc + diff, 0);
  const average = sum / scoresUsed;
  
  // Multiply by 0.96 and truncate to 1 decimal place
  return Math.floor(average * 0.96 * 10) / 10;
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
  const coursePar9 = course ? 
    course.holes.slice(0, 9).reduce((sum, hole) => sum + hole.par, 0) : 
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