import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Rate limit configurations
const LIMITS = {
    scan: { daily: 10, monthly: 50 },
    courseApi: { daily: 15 },
    googlePlaces: { daily: 10 },
} as const;

type Service = "scan" | "courseApi" | "googlePlaces";

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetsAt: number;
    limitType: "daily" | "monthly";
}

/**
 * Get the start of the current day in UTC milliseconds
 */
function getStartOfDay(): number {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Get the start of the current month in UTC milliseconds
 */
function getStartOfMonth(): number {
    const now = new Date();
    now.setUTCDate(1);
    now.setUTCHours(0, 0, 0, 0);
    return now.getTime();
}

/**
 * Check if a user can perform an action and consume a quota unit if allowed.
 * Call this from mutation context.
 */
export async function checkAndConsume(
    ctx: MutationCtx,
    userId: Id<"users">,
    service: Service
): Promise<RateLimitResult> {
    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const now = Date.now();
    const startOfDay = getStartOfDay();
    const startOfMonth = getStartOfMonth();
    const startOfNextDay = startOfDay + 24 * 60 * 60 * 1000;
    const startOfNextMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1).getTime();

    // Initialize rate limit object if not exists
    const rateLimit = user.rateLimit || {
        scansDailyCount: 0,
        scansDailyResetAt: startOfDay,
        scansMonthlyCount: 0,
        scansMonthlyResetAt: startOfMonth,
        courseApiDailyCount: 0,
        courseApiDailyResetAt: startOfDay,
        googlePlacesDailyCount: 0,
        googlePlacesDailyResetAt: startOfDay,
    };

    // Clone for mutation
    const newRateLimit = { ...rateLimit };

    if (service === "scan") {
        // Reset daily counter if day has passed
        if (now >= rateLimit.scansDailyResetAt + 24 * 60 * 60 * 1000) {
            newRateLimit.scansDailyCount = 0;
            newRateLimit.scansDailyResetAt = startOfDay;
        }
        // Reset monthly counter if month has passed
        if (now >= rateLimit.scansMonthlyResetAt + 30 * 24 * 60 * 60 * 1000) {
            newRateLimit.scansMonthlyCount = 0;
            newRateLimit.scansMonthlyResetAt = startOfMonth;
        }

        // Check daily limit first
        if (newRateLimit.scansDailyCount >= LIMITS.scan.daily) {
            return {
                allowed: false,
                remaining: 0,
                resetsAt: startOfNextDay,
                limitType: "daily",
            };
        }
        // Check monthly limit
        if (newRateLimit.scansMonthlyCount >= LIMITS.scan.monthly) {
            return {
                allowed: false,
                remaining: 0,
                resetsAt: startOfNextMonth,
                limitType: "monthly",
            };
        }

        // Consume quota
        newRateLimit.scansDailyCount += 1;
        newRateLimit.scansMonthlyCount += 1;
        await ctx.db.patch(userId, { rateLimit: newRateLimit, updatedAt: now });

        const dailyRemaining = LIMITS.scan.daily - newRateLimit.scansDailyCount;
        const monthlyRemaining = LIMITS.scan.monthly - newRateLimit.scansMonthlyCount;
        return {
            allowed: true,
            remaining: Math.min(dailyRemaining, monthlyRemaining),
            resetsAt: dailyRemaining < monthlyRemaining ? startOfNextDay : startOfNextMonth,
            limitType: dailyRemaining < monthlyRemaining ? "daily" : "monthly",
        };
    }

    if (service === "courseApi") {
        // Reset daily counter if day has passed
        if (now >= rateLimit.courseApiDailyResetAt + 24 * 60 * 60 * 1000) {
            newRateLimit.courseApiDailyCount = 0;
            newRateLimit.courseApiDailyResetAt = startOfDay;
        }

        if (newRateLimit.courseApiDailyCount >= LIMITS.courseApi.daily) {
            return {
                allowed: false,
                remaining: 0,
                resetsAt: startOfNextDay,
                limitType: "daily",
            };
        }

        newRateLimit.courseApiDailyCount += 1;
        await ctx.db.patch(userId, { rateLimit: newRateLimit, updatedAt: now });

        return {
            allowed: true,
            remaining: LIMITS.courseApi.daily - newRateLimit.courseApiDailyCount,
            resetsAt: startOfNextDay,
            limitType: "daily",
        };
    }

    if (service === "googlePlaces") {
        // Reset daily counter if day has passed
        if (now >= rateLimit.googlePlacesDailyResetAt + 24 * 60 * 60 * 1000) {
            newRateLimit.googlePlacesDailyCount = 0;
            newRateLimit.googlePlacesDailyResetAt = startOfDay;
        }

        if (newRateLimit.googlePlacesDailyCount >= LIMITS.googlePlaces.daily) {
            return {
                allowed: false,
                remaining: 0,
                resetsAt: startOfNextDay,
                limitType: "daily",
            };
        }

        newRateLimit.googlePlacesDailyCount += 1;
        await ctx.db.patch(userId, { rateLimit: newRateLimit, updatedAt: now });

        return {
            allowed: true,
            remaining: LIMITS.googlePlaces.daily - newRateLimit.googlePlacesDailyCount,
            resetsAt: startOfNextDay,
            limitType: "daily",
        };
    }

    throw new Error(`Unknown service: ${service}`);
}

/**
 * Check rate limit without consuming (for read-only checks).
 * Call this from query context.
 */
export async function checkLimit(
    ctx: QueryCtx,
    userId: Id<"users">,
    service: Service
): Promise<RateLimitResult> {
    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const now = Date.now();
    const startOfDay = getStartOfDay();
    const startOfMonth = getStartOfMonth();
    const startOfNextDay = startOfDay + 24 * 60 * 60 * 1000;
    const startOfNextMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1).getTime();

    const rateLimit = user.rateLimit || {
        scansDailyCount: 0,
        scansDailyResetAt: startOfDay,
        scansMonthlyCount: 0,
        scansMonthlyResetAt: startOfMonth,
        courseApiDailyCount: 0,
        courseApiDailyResetAt: startOfDay,
        googlePlacesDailyCount: 0,
        googlePlacesDailyResetAt: startOfDay,
    };

    if (service === "scan") {
        const dailyCount = now >= rateLimit.scansDailyResetAt + 24 * 60 * 60 * 1000 ? 0 : rateLimit.scansDailyCount;
        const monthlyCount = now >= rateLimit.scansMonthlyResetAt + 30 * 24 * 60 * 60 * 1000 ? 0 : rateLimit.scansMonthlyCount;

        const dailyRemaining = LIMITS.scan.daily - dailyCount;
        const monthlyRemaining = LIMITS.scan.monthly - monthlyCount;

        if (dailyRemaining <= 0) {
            return { allowed: false, remaining: 0, resetsAt: startOfNextDay, limitType: "daily" };
        }
        if (monthlyRemaining <= 0) {
            return { allowed: false, remaining: 0, resetsAt: startOfNextMonth, limitType: "monthly" };
        }
        return {
            allowed: true,
            remaining: Math.min(dailyRemaining, monthlyRemaining),
            resetsAt: dailyRemaining < monthlyRemaining ? startOfNextDay : startOfNextMonth,
            limitType: dailyRemaining < monthlyRemaining ? "daily" : "monthly",
        };
    }

    if (service === "courseApi") {
        const count = now >= rateLimit.courseApiDailyResetAt + 24 * 60 * 60 * 1000 ? 0 : rateLimit.courseApiDailyCount;
        const remaining = LIMITS.courseApi.daily - count;
        return {
            allowed: remaining > 0,
            remaining: Math.max(0, remaining),
            resetsAt: startOfNextDay,
            limitType: "daily",
        };
    }

    if (service === "googlePlaces") {
        const count = now >= rateLimit.googlePlacesDailyResetAt + 24 * 60 * 60 * 1000 ? 0 : rateLimit.googlePlacesDailyCount;
        const remaining = LIMITS.googlePlaces.daily - count;
        return {
            allowed: remaining > 0,
            remaining: Math.max(0, remaining),
            resetsAt: startOfNextDay,
            limitType: "daily",
        };
    }

    throw new Error(`Unknown service: ${service}`);
}
