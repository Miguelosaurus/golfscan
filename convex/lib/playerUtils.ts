/**
 * Shared Player Utilities
 * 
 * Common functions for managing player records.
 */

/**
 * Ensure a "self" player exists for a user, creating or updating as needed.
 * The self player represents the user themselves in rounds.
 */
export async function ensureSelfPlayer(
    ctx: any,
    ownerId: string,
    name: string,
    now: number,
    gender?: string
): Promise<string> {
    const existingPlayers = await ctx.db
        .query("players")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", ownerId))
        .collect();

    const selfPlayer = existingPlayers.find((p: any) => p.isSelf);
    if (selfPlayer) {
        const patch: any = { updatedAt: now };
        if (name && selfPlayer.name !== name) {
            patch.name = name;
        }
        if (gender !== undefined && selfPlayer.gender !== gender) {
            patch.gender = gender;
        }
        if (Object.keys(patch).length > 1) {
            await ctx.db.patch(selfPlayer._id, patch);
        }
        return selfPlayer._id;
    }

    return ctx.db.insert("players", {
        ownerId,
        userId: ownerId,
        name,
        gender: gender ?? undefined,
        handicap: undefined,
        isSelf: true,
        createdAt: now,
        updatedAt: now,
    });
}
