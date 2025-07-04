import { PlayerRound, Score } from '@/types';

export const generateUniqueId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const calculateTotalScore = (scores: Score[]): number => {
  return scores.reduce((total, score) => total + score.strokes, 0);
};

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
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