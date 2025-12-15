import { internalMutation } from "./_generated/server";
import { calculateDifferential, validateDifferential } from "./lib/handicapUtils";

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

                // Get rating and slope (prefer stored values if available, else course defaults)
                const rating = score.courseRatingUsed ?? course.rating ?? 72;
                const slope = score.courseSlopeUsed ?? course.slope ?? 113;
                const grossScore = score.grossScore;

                // Calculate differential
                const differential = calculateDifferential(grossScore, rating, slope);

                // Validate
                validateDifferential(differential, {
                    courseName: course.name,
                    grossScore,
                });

                // Update the score
                await ctx.db.patch(score._id, {
                    handicapDifferential: differential,
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
