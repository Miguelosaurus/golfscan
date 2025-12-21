import { Course, Hole, PlayerRound, Round } from '@/types';
import { getEighteenHoleEquivalentScore } from '@/utils/helpers';

export interface PerformanceByPar {
  par3: number | null;
  par4: number | null;
  par5: number | null;
}

export interface PerformanceByDifficulty {
  hard: number | null;
  medium: number | null;
  easy: number | null;
}

export interface BlowUpRateResult {
  averagePerRound: number;
  totalBlowUps: number;
  roundsConsidered: number;
}

export interface ScoreTrendData {
  labels: string[];
  scores: number[];
  movingAverage: number[];
  totalRounds: number;
}

interface PlayerScopedOptions {
  playerId: string;
  rounds: Round[];
  courses?: Course[];
  courseId?: string;
}

const getCourseForRound = (courses: Course[] | undefined, round: Round): Course | undefined => {
  if (!courses) return undefined;
  return courses.find((c) => c.id === round.courseId);
};

const getPlayerRoundData = (round: Round, playerId: string): PlayerRound | undefined => {
  // Prefer an exact id match when available
  const exact = round.players.find(player => player.playerId === playerId);
  if (exact) return exact;

  // Fallback: use the row flagged as self / user. This helps when the
  // local "current user" id does not match the Convex players table id
  // but the summary rows still carry an isSelf / isUser flag.
  const anySelf = (round.players as any[]).find(
    (p) => (p as any).isSelf || (p as any).isUser
  );
  return anySelf as PlayerRound | undefined;
};

export const calculatePerformanceByPar = ({
  playerId,
  rounds,
  course,
}: PlayerScopedOptions & { course: Course }): PerformanceByPar => {
  const totals: Record<number, { relativeToPar: number; count: number }> = {
    3: { relativeToPar: 0, count: 0 },
    4: { relativeToPar: 0, count: 0 },
    5: { relativeToPar: 0, count: 0 },
  };

  rounds.forEach(round => {
    const player = getPlayerRoundData(round, playerId);
    if (!player) return;

    player.scores.forEach(score => {
      const hole = course.holes.find(h => h.number === score.holeNumber);
      if (!hole || hole.par < 3 || hole.par > 5) return;

      totals[hole.par].relativeToPar += score.strokes - hole.par;
      totals[hole.par].count += 1;
    });
  });

  return {
    par3: totals[3].count ? totals[3].relativeToPar / totals[3].count : null,
    par4: totals[4].count ? totals[4].relativeToPar / totals[4].count : null,
    par5: totals[5].count ? totals[5].relativeToPar / totals[5].count : null,
  };
};

export const calculatePerformanceByDifficulty = ({
  playerId,
  rounds,
  courses,
}: PlayerScopedOptions): PerformanceByDifficulty => {
  const buckets: Record<'hard' | 'medium' | 'easy', { relativeToPar: number; count: number }> = {
    hard: { relativeToPar: 0, count: 0 },
    medium: { relativeToPar: 0, count: 0 },
    easy: { relativeToPar: 0, count: 0 },
  };

  rounds.forEach(round => {
    const player = getPlayerRoundData(round, playerId);
    if (!player) return;

    const course = getCourseForRound(courses, round);
    if (!course) return;

    player.scores.forEach(score => {
      const hole = course.holes.find((h: Hole) => h.number === score.holeNumber);
      if (!hole || !hole.handicap) return;

      const relativeToPar = score.strokes - hole.par;
      let bucket: keyof typeof buckets | null = null;

      if (hole.handicap >= 1 && hole.handicap <= 6) bucket = 'hard';
      else if (hole.handicap >= 7 && hole.handicap <= 12) bucket = 'medium';
      else if (hole.handicap >= 13 && hole.handicap <= 18) bucket = 'easy';

      if (bucket) {
        buckets[bucket].relativeToPar += relativeToPar;
        buckets[bucket].count += 1;
      }
    });
  });

  const format = (entry: { relativeToPar: number; count: number }) =>
    entry.count ? entry.relativeToPar / entry.count : null;

  return {
    hard: format(buckets.hard),
    medium: format(buckets.medium),
    easy: format(buckets.easy),
  };
};

export const calculateBlowUpRate = ({
  playerId,
  rounds,
  courses,
  courseId,
}: PlayerScopedOptions): BlowUpRateResult => {
  let blowUpCount = 0;
  let consideredRounds = 0;

  rounds.forEach(round => {
    if (courseId && round.courseId !== courseId) {
      return;
    }

    const player = getPlayerRoundData(round, playerId);
    if (!player) return;

    const course = getCourseForRound(courses, round);
    if (!course) return;

    let countedRound = false;
    player.scores.forEach(score => {
      const hole = course.holes.find((h: Hole) => h.number === score.holeNumber);
      if (!hole) return;

      countedRound = true;
      if (score.strokes >= hole.par + 3) {
        blowUpCount += 1;
      }
    });

    if (countedRound) {
      consideredRounds += 1;
    }
  });

  return {
    averagePerRound: consideredRounds ? blowUpCount / consideredRounds : 0,
    totalBlowUps: blowUpCount,
    roundsConsidered: consideredRounds,
  };
};

interface HoleAverageResult {
  average: number;
  attempts: number;
}

export const calculatePerHoleAverages = ({
  playerId,
  rounds,
  course,
}: {
  playerId: string;
  rounds: Round[];
  course: Course;
}): Record<number, HoleAverageResult> => {
  const aggregates: Record<number, { total: number; count: number }> = {};

  rounds.forEach(round => {
    const player = getPlayerRoundData(round, playerId);
    if (!player) return;

    player.scores.forEach(score => {
      const hole = course.holes.find(h => h.number === score.holeNumber);
      if (!hole) return;

      if (!aggregates[hole.number]) {
        aggregates[hole.number] = { total: 0, count: 0 };
      }

      aggregates[hole.number].total += score.strokes;
      aggregates[hole.number].count += 1;
    });
  });

  const averages: Record<number, HoleAverageResult> = {};
  Object.keys(aggregates).forEach(holeNumber => {
    const number = Number(holeNumber);
    const { total, count } = aggregates[number];
    averages[number] = { average: total / count, attempts: count };
  });

  return averages;
};

export const buildScoreTrendData = ({
  playerId,
  rounds,
  courses,
  maxRounds = 10,
  movingAverageWindow = 5,
}: PlayerScopedOptions & { maxRounds?: number; movingAverageWindow?: number }): ScoreTrendData => {
  const playerRounds = rounds
    .filter(round => round.players.some(player => player.playerId === playerId))
    .map(round => {
      const player = getPlayerRoundData(round, playerId)!;
      const course = getCourseForRound(courses, round);
      const score = course
        ? getEighteenHoleEquivalentScore(player, round, course)
        : player.totalScore;

      return {
        round,
        date: new Date(round.date),
        score,
      };
    })
    .filter(item => !isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const recentRounds = playerRounds.slice(-maxRounds);
  const labels = recentRounds.map(item =>
    item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const scores = recentRounds.map(item => item.score);

  const movingAverage: number[] = [];
  scores.forEach((score, index) => {
    const windowStart = Math.max(0, index - movingAverageWindow + 1);
    const windowScores = scores.slice(windowStart, index + 1);
    const average =
      windowScores.length > 0
        ? windowScores.reduce((sum, value) => sum + value, 0) / windowScores.length
        : score;
    movingAverage.push(Number(average.toFixed(1)));
  });

  return {
    labels,
    scores,
    movingAverage,
    totalRounds: recentRounds.length,
  };
};
