import assert from "node:assert/strict";

import {
  buildHandicapDifferentialsForIndex,
  calculateCourseHandicapWHS,
  calculateHandicapWithSelection,
  computeAdjustedGrossForHandicapRound,
  roundToTenth,
} from "../convex/lib/handicapUtils.ts";
import { calculateAllocationsForFormat } from "../convex/lib/strokeAllocation.ts";
import { calculateCourseHandicapWHS as calculateCourseHandicapWHSClient } from "../utils/handicapCourse.ts";

function approxEqual(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ≈ ${b}`);
}

// Course handicap example from the bug report:
// HI 27.0 × (134/113) + (CourseRating - Par) where (CourseRating - Par) = -1.5
// -> 30.52 -> 31
{
  const hi = 27.0;
  const slope = 134;
  const rating = 70.5;
  const par = 72;
  const expected = 31;
  assert.equal(calculateCourseHandicapWHS(hi, slope, rating, par), expected);
  assert.equal(calculateCourseHandicapWHSClient(hi, slope, rating, par), expected);
}

// Differential rounding: to 0.1 (WHS Score Differential is stored/used at 1 decimal place).
{
  const adjustedGross = 85;
  const rating = 72.3;
  const slope = 134;
  const raw = ((adjustedGross - rating) * 113) / slope;
  approxEqual(roundToTenth(raw), Math.round(raw * 10) / 10);
}

// Handicap index rounding: 1 decimal and stable around floating boundaries.
{
  const diffs = [10.1, 10.2, 10.3, 10.4, 10.5];
  const { handicap } = calculateHandicapWithSelection(diffs);
  assert.ok(handicap !== null);
  approxEqual(handicap, roundToTenth(handicap));
}

// Stroke allocations for 9-hole selection should never allocate strokes on unplayed holes.
{
  const holesFront9 = Array.from({ length: 9 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcp: i + 1,
  }));
  const allocs = calculateAllocationsForFormat(
    [
      { playerId: "A", courseHandicap: 10 },
      { playerId: "B", courseHandicap: 15 },
    ],
    holesFront9,
    "usga"
  );
  const a = allocs.find((x) => x.playerId === "A");
  const b = allocs.find((x) => x.playerId === "B");

  assert.ok(a);
  assert.ok(b);
  assert.equal(a.strokesByHole.length, 18);
  assert.equal(b.strokesByHole.length, 18);

  // USGA: lowest CH plays scratch, so A should receive 0 strokes.
  assert.ok(a.strokesByHole.every((s) => s === 0));

  // B receives 5 strokes, all within holes 1-9. Holes 10-18 must stay 0.
  assert.ok(b.strokesByHole.slice(9).every((s) => s === 0));
  assert.equal(
    b.strokesByHole.slice(0, 9).reduce((sum, s) => sum + s, 0),
    5
  );
}

// Strict WHS 9-hole handling: two 9-hole differentials combine into one 18-hole differential (average).
{
  const scores = [
    { _id: "a", createdAt: 1, holeCount: 9, handicapDifferential: 10.0 },
    { _id: "b", createdAt: 2, holeCount: 9, handicapDifferential: 12.0 },
  ];
  const events = buildHandicapDifferentialsForIndex(scores);
  assert.equal(events.length, 1);
  assert.equal(events[0].differential, 11.0);
  assert.deepEqual([...events[0].scoreIds].sort(), ["a", "b"]);
}

// Plus handicaps (negative course handicap): strokes are GIVEN on easiest holes in modified format.
{
  const holes18 = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcp: i + 1,
  }));
  const allocs = calculateAllocationsForFormat(
    [{ playerId: "A", courseHandicap: -1 }],
    holes18,
    "modified"
  );
  const a = allocs[0];
  assert.ok(a);
  assert.equal(a.strokesByHole.length, 18);
  assert.ok(a.strokesByHole.slice(0, 17).every((s) => s === 0));
  assert.equal(a.strokesByHole[17], -1);
  assert.equal(a.strokesByHole.reduce((sum, s) => sum + s, 0), -1);
}

// WHS incomplete rounds: allow 18-hole score with >=14 holes and fill missing with net par.
{
  const courseHoles = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcp: i + 1,
  }));
  const holeData = Array.from({ length: 14 }, (_, i) => ({
    hole: i + 1,
    score: 5,
    par: 4,
  }));
  const adjusted = computeAdjustedGrossForHandicapRound({
    holeCount: 18,
    holeData,
    courseHoles,
    courseHandicap: 10,
  });
  assert.equal(adjusted, 86);
}

console.log("handicap-audit: OK");
