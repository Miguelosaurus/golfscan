import { v } from "convex/values";
import { query } from "./_generated/server";

export const getWagerStats = query({
    args: {
        userId: v.optional(v.id("users")),
        playerId: v.optional(v.id("players"))
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        const currentUserId = identity ? (await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique())?._id : null;

        let targetUserId = args.userId;
        let targetPlayerIds = new Set<string>();

        // If specific playerId provided, resolve it
        if (args.playerId) {
            targetPlayerIds.add(args.playerId);
            const p = await ctx.db.get(args.playerId);
            if (p && p.userId) {
                targetUserId = p.userId;
            }
        }

        // Default to current user if nothing provided
        if (!targetUserId && !args.playerId) {
            targetUserId = currentUserId ?? undefined;
        }

        if (!targetUserId && targetPlayerIds.size === 0) return null;

        // If we have a User ID, fetch ALL player aliases
        if (targetUserId) {
            const userPlayerDocs = await ctx.db
                .query("players")
                .withIndex("by_user", (q) => q.eq("userId", targetUserId!))
                .collect();
            userPlayerDocs.forEach(p => targetPlayerIds.add(p._id));
        }

        const userPlayerIds = targetPlayerIds; // Alias for readability logic below

        // Also include the session host? The host is typically one of the participants but not always linked via `players` table userId if they are just "Host".
        // Usually Host is also a player.
        // But `gameSessions.participants` uses `playerId`.

        // Fetch all game sessions where the user is a participant
        // Since we don't have a direct index on participants.userId, we have to scan or rely on other lookups.
        // Ideally we'd have an index, but for now we'll fetch all sessions for the user if possible.
        // "gameSessions" doesn't have an index on participants. 
        // BUT we know participants store PLAYER IDs, not USER IDs directly in the array objects.
        // This makes it hard to filter by userId efficiently without joining.
        // A scan might be heavy.

        // Better approach: 
        // 1. Find all `players` records for this userId.
        // 2. For each player record, find which sessions they are in? 
        // gameSessions stores participants as { playerId: ... }.
        // We don't have an index on "participants.playerId" either (it's inside an array object).

        // Alternative: Filter all gameSessions in memory? Heavy.
        // Wait, `players` table has `userId`.
        // We can find all `players` docs for this user.
        // But `gameSessions` links to `players`. `gameSessions` doesn't have a back-link from player?
        // No.

        // Let's check schema again. `gameSessions` has `hostId`.
        // It does NOT index participants.
        // This is a schema limitation.
        // HOWEVER, for a "profile" view, maybe we mostly care about sessions WHERE WE ARE HOST or... no, we want all.

        // Workaround for now (since I can't easily change schema indexing without potential migration pain/time):
        // List all gameSessions and filter in code? (Dangerous if many sessions).
        // OR: Assume user is Host often?
        // OR: Did I miss an index?
        // Schema: 
        // gameSessions: .index("by_host", ["hostId"])
        // .index("by_host_status", ["hostId", "status"])

        // We really need an index on participants to do this efficiently.
        // But since I'm in "Fix Bugs" mode, adding an index is modifying schema. defineSchema allows adding indexes easily.
        // But populating it requires existing data to be indexed (Convex handles this).
        // Can I add an index on a nested array field? 
        // Convex supports `index("by_participant_playerId", ["participants.playerId"])`? No, you can't index inside arrays like that easily unless you use separate table key.

        // Let's stick to: Fetch recently updated sessions? Or fetch all for now (assuming scale is small for this user).
        // Actually, maybe we can fetch `players` for the user, then... how do we find sessions containing those playerIDs?
        // We can't efficienty.

        // OK, I'll do a full table scan of `gameSessions` but optimize by strictly filtering in JS.
        // Note: This is not scalable but works for MVP.
        // Wait, query().collect() fetches everything.

        const allSessions = await ctx.db.query("gameSessions").collect();
        // Filter for sessions where this user participated
        // To do this, we need to know the User's PlayerIDs.
        // 1. Get all player docs for this user.


        const relevantSessions = allSessions.filter(session =>
            session.participants.some(p => userPlayerIds.has(p.playerId))
        );

        // Filter out orphaned sessions (where linkedRoundId exists but Round is missing)
        const validSessions = [];
        for (const session of relevantSessions) {
            if (session.linkedRoundId) {
                const round = await ctx.db.get(session.linkedRoundId);
                if (!round) continue; // Skip orphaned session
            }
            validSessions.push(session);
        }

        let bestWin = { amountCents: 0, date: 0, roundId: null as any };
        const opponentNet = new Map<string, number>();
        let totalWonCents = 0;
        let totalLostCents = 0;
        let gamesPlayed = 0;
        let wins = 0;
        let losses = 0;
        let ties = 0;

        for (const session of validSessions) {
            if (!session.settlement?.calculated) continue;

            const myPlayerId = session.participants.find(p => userPlayerIds.has(p.playerId))?.playerId;
            if (!myPlayerId) continue;

            let sessionNet = 0;
            let hasWager = false;

            const settlement = session.settlement;
            const transfers =
                "transactions" in settlement ? settlement.transactions :
                    "rawTransactions" in settlement ? settlement.rawTransactions :
                        [];

            if (transfers.length > 0) {
                for (const tx of transfers) {
                    if (tx.toPlayerId === myPlayerId) {
                        sessionNet += tx.amountCents;
                        totalWonCents += tx.amountCents;
                        hasWager = true;

                        // Track opponent loss (my gain)
                        const current = opponentNet.get(tx.fromPlayerId) || 0;
                        opponentNet.set(tx.fromPlayerId, current + tx.amountCents);
                    }
                    if (tx.fromPlayerId === myPlayerId) {
                        sessionNet -= tx.amountCents;
                        totalLostCents += tx.amountCents;
                        hasWager = true;

                        // Track opponent win (my loss)
                        const current = opponentNet.get(tx.toPlayerId) || 0;
                        opponentNet.set(tx.toPlayerId, current - tx.amountCents);
                    }
                }
            }

            if (hasWager) {
                gamesPlayed++;
                if (sessionNet > 0) {
                    wins++;
                    if (sessionNet > bestWin.amountCents) {
                        // We need the date. If session has startAt, use it. Or linked round date?
                        // Round data was fetched in validSessions check? No, we just checked existence.
                        // We need to re-fetch or optimistically usage session.startAt?
                        // session.startAt is a number (timestamp).
                        bestWin = {
                            amountCents: sessionNet,
                            date: session.startAt,
                            roundId: session.linkedRoundId
                        };
                    }
                }
                else if (sessionNet < 0) losses++;
                else ties++;
            }
        }

        // Find biggest donor
        let biggestDonor = null;
        let maxDonorAmount = 0;
        for (const [pdoId, amount] of Array.from(opponentNet.entries())) {
            if (amount > maxDonorAmount) {
                maxDonorAmount = amount;
                biggestDonor = pdoId;
            }
        }

        // Resolve name
        let biggestDonorName = "Unknown";
        if (biggestDonor) {
            const p = await ctx.db.get(biggestDonor as any);
            if (p && "name" in p) biggestDonorName = (p as any).name;
        }

        return {
            totalWonCents,
            totalLostCents,
            netBalanceCents: totalWonCents - totalLostCents,
            gamesPlayed,
            wins,
            losses,
            ties,
            bestWin: bestWin.amountCents > 0 ? bestWin : null,
            biggestDonor: biggestDonor ? { name: biggestDonorName, amountCents: maxDonorAmount, playerId: biggestDonor } : null
        };
    },
});

export const getHeadToHeadStats = query({
    args: {
        myPlayerId: v.id("players"),
        otherPlayerId: v.id("players")
    },
    handler: async (ctx, args) => {
        // 1. Get player docs
        const myPlayer = await ctx.db.get(args.myPlayerId);
        const otherPlayer = await ctx.db.get(args.otherPlayerId);

        if (!myPlayer || !otherPlayer) return { netBalanceCents: 0, gamesPlayed: 0 };

        let myPlayerIds = new Set([args.myPlayerId]);
        let otherPlayerIds = new Set([args.otherPlayerId]);

        // If linked to user, fetch all aliases
        if (myPlayer.userId) {
            const docs = await ctx.db.query("players").withIndex("by_user", q => q.eq("userId", myPlayer.userId!)).collect();
            docs.forEach(d => myPlayerIds.add(d._id));
        }
        if (otherPlayer.userId) {
            const docs = await ctx.db.query("players").withIndex("by_user", q => q.eq("userId", otherPlayer.userId!)).collect();
            docs.forEach(d => otherPlayerIds.add(d._id));
        }

        // 2. Scan sessions (inefficient but necessary without index)
        const allSessions = await ctx.db.query("gameSessions").collect();

        let netBalanceCents = 0;
        let gamesPlayed = 0;

        for (const session of allSessions) {
            if (!session.settlement?.calculated) continue;

            // Check if both present
            const myPid = session.participants.find(p => myPlayerIds.has(p.playerId))?.playerId;
            const otherPid = session.participants.find(p => otherPlayerIds.has(p.playerId))?.playerId;

            if (!myPid || !otherPid) continue;

            if (session.linkedRoundId) {
                const r = await ctx.db.get(session.linkedRoundId);
                if (!r) continue;
            }

            let sessionInteraction = false;
            const settlement = session.settlement;
            const transfers =
                "transactions" in settlement ? settlement.transactions :
                    "rawTransactions" in settlement ? settlement.rawTransactions :
                        [];

            if (transfers.length > 0) {
                for (const tx of transfers) {
                    // Me -> Them (Loss)
                    if (tx.fromPlayerId === myPid && tx.toPlayerId === otherPid) {
                        netBalanceCents -= tx.amountCents;
                        sessionInteraction = true;
                    }
                    // Them -> Me (Win)
                    if (tx.fromPlayerId === otherPid && tx.toPlayerId === myPid) {
                        netBalanceCents += tx.amountCents;
                        sessionInteraction = true;
                    }
                }
            }

            if (sessionInteraction) {
                gamesPlayed++;
            }
        }

        return {
            netBalanceCents,
            gamesPlayed
        };
    }
});
