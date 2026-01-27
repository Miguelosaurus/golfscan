export function roundHalfUpToInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const epsilon = 1e-9;
  return value >= 0 ? Math.floor(value + 0.5 + epsilon) : Math.ceil(value - 0.5 - epsilon);
}

export function calculateCourseHandicapWHS(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
  return roundHalfUpToInt(courseHandicap);
}

type TeeLike = {
  name?: string;
  rating?: number;
  slope?: number;
  gender?: string;
  frontRating?: number;
  frontSlope?: number;
  backRating?: number;
  backSlope?: number;
  holes?: Array<{ number: number; par?: number }>;
};

function pickTeeMeta(course: any, teeName?: string | null, teeGender?: string | null): TeeLike | null {
  const teeSets = (course as any)?.teeSets as TeeLike[] | undefined;
  if (!Array.isArray(teeSets) || !teeName) return null;
  const lowerName = teeName.toString().toLowerCase();
  const candidates = teeSets.filter((t) => t?.name && t.name.toString().toLowerCase() === lowerName);
  if (!candidates.length) return null;
  if (teeGender) {
    const genderMatch = candidates.find((t) => t.gender === teeGender);
    if (genderMatch) return genderMatch;
  }
  return candidates[0];
}

function sumParForHoles(course: any, holeNumbers: number[], teeMeta?: TeeLike | null): number {
  const holesFromCourse = Array.isArray((course as any)?.holes) ? (course as any).holes : [];
  const holesFromTee = Array.isArray(teeMeta?.holes) ? teeMeta!.holes : [];
  const holes = holesFromCourse.length > 0 ? holesFromCourse : holesFromTee;

  if (!Array.isArray(holes) || holes.length === 0) {
    return holeNumbers.length * 4;
  }

  return holeNumbers.reduce((sum, n) => {
    const h = holes.find((x: any) => x?.number === n);
    return sum + (h?.par ?? 4);
  }, 0);
}

function getBaseRatingSlope(course: any, teeMeta?: TeeLike | null): { rating: number; slope: number } {
  const holes = Array.isArray((course as any)?.holes) ? (course as any).holes : [];
  const parTotal = holes.reduce((sum: number, h: any) => sum + (h?.par ?? 4), 0) || 72;
  const rating = (teeMeta?.rating ?? (course as any)?.rating ?? parTotal) as number;
  const slope = (teeMeta?.slope ?? (course as any)?.slope ?? 113) as number;
  return { rating, slope };
}

export function calculateCourseHandicapForRound(args: {
  handicapIndex: number | undefined;
  course: any;
  teeName?: string | null;
  teeGender?: string | null;
  holeNumbers: number[];
}): number | undefined {
  const { handicapIndex, course, teeName, teeGender, holeNumbers } = args;
  if (typeof handicapIndex !== "number" || !Number.isFinite(handicapIndex)) return undefined;
  if (!course) return undefined;

  const teeMeta = pickTeeMeta(course, teeName, teeGender);
  const { rating: baseRating, slope: baseSlope } = getBaseRatingSlope(course, teeMeta);

  const isNineHole = holeNumbers.length > 0 && holeNumbers.every((h) => h >= 1 && h <= 18) && holeNumbers.length <= 9;
  const isFront = isNineHole && holeNumbers.every((h) => h <= 9);
  const isBack = isNineHole && holeNumbers.every((h) => h >= 10);

  const ratingUsed =
    isNineHole && isFront && typeof teeMeta?.frontRating === "number"
      ? teeMeta.frontRating
      : isNineHole && isBack && typeof teeMeta?.backRating === "number"
        ? teeMeta.backRating
        : isNineHole
          ? baseRating / 2
          : baseRating;

  const slopeUsed =
    isNineHole && isFront && typeof teeMeta?.frontSlope === "number"
      ? teeMeta.frontSlope
      : isNineHole && isBack && typeof teeMeta?.backSlope === "number"
        ? teeMeta.backSlope
        : baseSlope;

  const parTotal = sumParForHoles(course, holeNumbers, teeMeta);

  return calculateCourseHandicapWHS(handicapIndex, slopeUsed, ratingUsed, parTotal);
}

