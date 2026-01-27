import { internalMutation } from "./_generated/server";
import {
    computeAdjustedGrossForHandicapRound,
    getRatingSlopeForScore,
    pickTeeMeta,
    roundToTenth,
    validateDifferential,
} from "./lib/handicapUtils";

/**
 * Backfill migration to calculate handicapDifferential for scores that are missing it.
 * 
 * This is useful for:
 * - Old scores created before handicapDifferential was tracked
 * - Scores where the calculation failed for some reason
 * 
 * Run this via the Convex dashboard: 
 *   await ctx.runMutation(internal.backfillDifferentials.run)
 */
export const run = internalMutation({
    args: {},
    handler: async (ctx) => {
        console.log("[Backfill] Starting handicap differential backfill...");

        // Find scores missing handicapDifferential
        const allScores = await ctx.db.query("scores").collect();
        const missingDiffs = allScores.filter(
            (s) => s.handicapDifferential === undefined && !s.isSynthesized
        );

        console.log(`[Backfill] Found ${missingDiffs.length} scores missing differentials`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const score of missingDiffs) {
            try {
                const course = await ctx.db.get(score.courseId);
                if (!course) {
                    console.warn(`[Backfill] Course ${score.courseId} not found for score ${score._id}`);
                    skipped++;
                    continue;
                }

                const holeCount = (score.holeCount === 9 ? 9 : 18) as 9 | 18;
                const holeData = Array.isArray(score.holeData)
                    ? score.holeData.map((h: any) => ({
                        hole: h.hole,
                        score: h.score,
                        par: h.par ?? 4,
                    }))
                    : [];

                const teeMeta = pickTeeMeta(course, (score as any).teeName, (score as any).teeGender);
                const { ratingUsed, slopeUsed } = getRatingSlopeForScore(
                    course,
                    teeMeta,
                    holeCount,
                    holeData
                );

                const courseHandicapUsed = (score as any).handicapUsed;
                const adjustedGrossScore =
                    typeof (score as any).adjustedGrossScore === "number" && Number.isFinite((score as any).adjustedGrossScore)
                        ? (score as any).adjustedGrossScore
                        : (typeof courseHandicapUsed === "number" && Number.isFinite(courseHandicapUsed)
                            ? computeAdjustedGrossForHandicapRound({
                                holeCount,
                                holeData,
                                courseHoles: (course.holes as any[]) ?? [],
                                courseHandicap: courseHandicapUsed,
                            })
                            : null);

                if (typeof adjustedGrossScore !== "number") {
                    console.warn(`[Backfill] Skipping score ${score._id}: insufficient data for WHS adjusted gross`);
                    skipped++;
                    continue;
                }

                const differential = roundToTenth(((adjustedGrossScore - ratingUsed) * 113) / slopeUsed);

                // Validate
                validateDifferential(differential, {
                    courseName: course.name,
                    grossScore: score.grossScore,
                });

                // Update the score
                await ctx.db.patch(score._id, {
                    handicapDifferential: differential,
                    adjustedGrossScore,
                    courseRatingUsed: ratingUsed,
                    courseSlopeUsed: slopeUsed,
                    updatedAt: Date.now(),
                });

                updated++;
            } catch (error) {
                console.error(`[Backfill] Error processing score ${score._id}:`, error);
                errors++;
            }
        }

        console.log(`[Backfill] Complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

        return {
            totalProcessed: missingDiffs.length,
            updated,
            skipped,
            errors,
        };
    },
});

/**
 * Recompute and overwrite existing 9-hole handicap differentials.
 *
 * Use this if you have legacy 9-hole scores that were previously "scaled to 18"
 * instead of stored as true 9-hole differentials (which are later paired per WHS).
 *
 * Run this via the Convex dashboard:
 *   await ctx.runMutation(internal.backfillDifferentials.recomputeNineHole)
 */
export const recomputeNineHole = internalMutation({
    args: {},
    handler: async (ctx) => {
        console.log("[Recompute9] Starting 9-hole differential recompute...");

        const allScores = await ctx.db.query("scores").collect();
        const targets = allScores.filter(
            (s) => (s.holeCount === 9) && !s.isSynthesized
        );

        console.log(`[Recompute9] Found ${targets.length} candidate 9-hole scores`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const score of targets) {
            try {
                const course = await ctx.db.get(score.courseId);
                if (!course) {
                    skipped++;
                    continue;
                }

                const holeData = Array.isArray(score.holeData)
                    ? score.holeData.map((h: any) => ({
                        hole: h.hole,
                        score: h.score,
                        par: h.par ?? 4,
                    }))
                    : [];

                const teeMeta = pickTeeMeta(course, (score as any).teeName, (score as any).teeGender);
                const { ratingUsed, slopeUsed } = getRatingSlopeForScore(course, teeMeta, 9, holeData);

                const courseHandicapUsed = (score as any).handicapUsed;
                const adjustedGrossScore =
                    typeof (score as any).adjustedGrossScore === "number" && Number.isFinite((score as any).adjustedGrossScore)
                        ? (score as any).adjustedGrossScore
                        : (typeof courseHandicapUsed === "number" && Number.isFinite(courseHandicapUsed)
                            ? computeAdjustedGrossForHandicapRound({
                                holeCount: 9,
                                holeData,
                                courseHoles: (course.holes as any[]) ?? [],
                                courseHandicap: courseHandicapUsed,
                            })
                            : null);

                if (typeof adjustedGrossScore !== "number") {
                    skipped++;
                    continue;
                }
                const differential = roundToTenth(((adjustedGrossScore - ratingUsed) * 113) / slopeUsed);

                validateDifferential(differential, { courseName: course.name, grossScore: score.grossScore });

                const prior = typeof score.handicapDifferential === "number" ? roundToTenth(score.handicapDifferential) : undefined;
                const changed = prior === undefined || Math.abs(prior - differential) >= 0.05;
                if (!changed) {
                    skipped++;
                    continue;
                }

                await ctx.db.patch(score._id, {
                    handicapDifferential: differential,
                    adjustedGrossScore,
                    courseRatingUsed: ratingUsed,
                    courseSlopeUsed: slopeUsed,
                    updatedAt: Date.now(),
                });

                updated++;
            } catch (error) {
                console.error(`[Recompute9] Error processing score ${score._id}:`, error);
                errors++;
            }
        }

        console.log(`[Recompute9] Complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

        return {
            totalProcessed: targets.length,
            updated,
            skipped,
            errors,
        };
    },
});
