Scandicap Engine: The "Ground Truth" Logic

Goal: Create a single, universal handicap index (users.handicap) that is calculated server-side by Convex. This replaces the three fragmented systems (User Index, Player Handicap, Local Handicap) currently in the app.

1. The Core Philosophy

Server-Side Authority: The client never calculates the handicap index. It only displays users.handicap.

Tee-Specific: We never guess rating/slope. We look it up based on the teeId or teeName stored in the score.

9-Hole Aware: We strictly separate 9-hole rounds from 18-hole rounds in the math, using specific Front/Back ratings when available.

2. The Algorithm (convex/handicap.ts)

This logic runs every time a round is saved or deleted.

Step A: Fetch & Filter

Query the last 50 scores for the user (where playerId points to the user's players record).

Filter 1: Ignore rounds with incomplete data (missing differential).

Legacy Data Strategy: Scores created before this update won't have handicapDifferential.

Primary Decision: Ignore them (Option B). The user must play 3 new rounds to re-establish a handicap. This is the safest MVP path.

Advanced Option: You may run a one-time backfill script later if needed.

Filter 2: Sort by Date Descending. Take the most recent 20.

Step B: Calculate Differentials (In convex/rounds.ts)

Timing: This calculation happens once inside the saveRound mutation. The result is stored in scores.handicapDifferential.

The Formula:

$$\text{Diff} = \frac{113}{\text{Slope}} \times (\text{Adjusted Gross Score} - \text{Rating})$$

Handling 9-Hole Rounds:

Priority 1 (Best - Front/Back Detection): * Detection Logic:

If all hole.number <= 9 → Treat as Front 9. Use frontRating/frontSlope.

If all hole.number >= 10 → Treat as Back 9. Use backRating/backSlope.

If specific data exists for that side, use it.

Priority 2 (Fallback): If specific 9-hole data is missing or mixed, scale the 18-hole Rating/Slope: Rating_9 = Rating_18 / 2, Slope_9 = Slope_18 / 2.

Scale Result: Scale the resulting 9-hole differential to an 18-hole equivalent: Diff_18 = Diff_9 * 2.

Handling Blow-Ups (Net Double Bogey):

Cap: Max Hole Score = Par + 3 (Robust proxy for Net Double Bogey if dynamic handicap is unavailable during calc).

Storage: Calculate the differential using the Capped Score. Store the Raw Score in grossScore.

Historical Integrity (Source of Truth):

Rule: When calculating the differential, use the courseRatingUsed and courseSlopeUsed fields stored on the Score record itself. Do not look up the current Course document.

Why: If a course updates its scorecard ratings next month, it shouldn't retroactively change the differentials for rounds played last year. The Score record is a historical snapshot.

Step C: Averaging (In convex/handicap.ts)

Logic:

Read the stored handicapDifferential from the last 20 scores.

Ghost Round Handling: If score.isSynthesized is true, use its differential like any other score. It slides out of the window naturally as new scores come in.

Strict WHS-Style Lookup Table:

Rounds Available

Rounds to Count

Adjustment to Avg

0-2

None

Handicap is undefined (Show "—" in UI)

3

Best 1

-2.0

4

Best 1

-1.0

5

Best 1

0

6

Best 2

-1.0

7

Best 2

0

8

Best 2

0

9-11

Best 3

0

12-14

Best 4

0

15-16

Best 5

0

17-18

Best 6

0

19

Best 7

0

20

Best 8

0

Final Calculation:

Average the selected differentials.

Subtract the adjustment.

Round to the nearest tenth (e.g., 14.2).

Step D: Update

Update users.handicap with the new number (or null if < 3 rounds).

Push { date: now, value: newHandicap } to users.handicapIndexHistory.

3. Handling "Ghost Rounds" (Seeding)

Optional: This is only for users who already have a handicap and want to import it. New golfers start with 0 rounds.

Mutation: seedHandicap(initialHandicap)

Validate user has 0 real rounds.

Create 20 "Ghost" Scores in the scores table:

grossScore: 0 (or null)

isSynthesized: true

handicapDifferential: initialHandicap (Stored directly).

holeData: Empty array.

Call recalculate. The user now has an established handicap.

4. Integration with Stats

In convex/players.ts (getStats):

Rule: Explicitly filter !score.isSynthesized. Ghost rounds MUST NOT affect Avg Score, Best Score, or any other performance metric.

Handicap Display: Use users.handicap (The Scandicap) for the authenticated owner ("Self").

Friend Handicaps: Continue to use players.handicap for non-self players (friends).

5. Schema Requirements (Review)

Ensure convex/schema.ts scores table has these fields to support the logic:

scores: defineTable({
  // ...
  // Denormalized from rounds table (Write once on save)
  holeCount: v.union(v.literal(9), v.literal(18)), 
  teeName: v.optional(v.string()), 
  
  // NEW FIELDS (Specific to Scandicap)
  // Storing the inputs allows auditability
  courseRatingUsed: v.optional(v.number()),
  courseSlopeUsed: v.optional(v.number()),
  
  // The Result
  handicapDifferential: v.optional(v.number()),
  isSynthesized: v.optional(v.boolean()),
})

---

AGENT NOTES

- [x] Step 1: Extend `scores` schema with `holeCount`, `courseRatingUsed`, `courseSlopeUsed`, `handicapDifferential`, `isSynthesized` and run Convex codegen.
- [x] Step 2: Update `convex/rounds.saveRound` to:
  - [x] Compute adjusted gross (with Par+3 cap when `holeData` present).
  - [x] Derive 9-hole vs 18-hole rating/slope (including front/back logic where data exists).
  - [x] Compute and persist `handicapDifferential`, `courseRatingUsed`, `courseSlopeUsed`, `holeCount` on each `scores` row (including round edits).
- [x] Step 3: Update `convex/handicap.recalculate` to:
  - [x] Read only `scores.handicapDifferential` (ignore scores without it; ghost rounds still supported via stored differential).
  - [x] Apply WHS-style best-of table + adjustments.
  - [x] Write `users.handicap` and append to `handicapIndexHistory`.
- [x] Step 4: Update `convex/players.getStats` to:
  - [x] Filter out `isSynthesized` scores.
  - [x] Continue using existing 18-hole-equivalent scoring for performance stats.
  - [x] For the self player, surface `users.handicap` via profile (used by client).
- [x] Step 5: Client wiring & cleanup:
  - [x] Home screen reads `users.handicap` (Scandicap) via profile query and uses `roundsPlayed` to switch between seeding and details.
  - [x] Home handicap edit flow now calls `handicap.seedHandicap` when `roundsPlayed === 0`; for existing rounds it shows an Info icon and logs "Open Scandicap Details".
  - [x] Removed local `updatePlayerHandicap` path; server (Convex) is now the only handicap source of truth.



PART 2

Master Plan: Scandicap Details & Provisional Ratings

Goal: Provide immediate value to new users by showing an estimated handicap after their very first round, and build trust with experienced users by showing the exact math behind their index.

Part 1: The Logic Update (Provisional Handicap)

Context: Currently, the logic returns null for < 3 rounds. We are changing this to return a "Provisional" index for 1-2 rounds so the user gets a number immediately.

1. Update convex/handicap.ts

Modify the "Best X of Y" lookup table logic.

New Lookup Table:

Rounds Available

Rounds to Count

Adjustment

Status

0

None

N/A

Undefined

1

Best 1

-2.0

Provisional

2

Best 1

-2.0

Provisional

3

Best 1

-2.0

Official (Established)

4

Best 1

-1.0

Official

5

Best 1

0

Official

...

...

...

...

20

Best 8

0

Official (Mature)

Implementation Detail:

When calculating, if differentials.length is 1 or 2, apply the -2.0 adjustment and return the result.

Do not change the database schema. users.handicap simply stores this number.

The distinction between "Provisional" and "Official" is determined by users.stats.roundsPlayed (or the count of differentials) at read-time.

Part 2: Backend Data for UI

We need a dedicated query to power the new "Details" screen.

2. New Query: api.handicap.getDetails

File: convex/handicap.ts

Input: { userId }

Returns:

{
  currentHandicap: number,
  isProvisional: boolean, // true if rounds < 3
  roundsCount: number, // To drive the UI text
  history: Array<{ date: string, value: number }>, // For the trend chart
  calculationRounds: Array<{
    id: Id<"scores">,
    date: string,
    courseName: string, // "Imported History" for ghost rounds
    grossScore: number, // 0 for ghost rounds
    differential: number,
    usedInCalculation: boolean, // KEY: True if this was one of the "Best N"
    isSynthesized: boolean
  }>
}


Logic for usedInCalculation:

Fetch: Query scores (not rounds) to handle the "20 scores in 1 round" structure of synthesized data.

Filter: Strictly ignore any score where handicapDifferential is null or undefined (Legacy Data).

Selection: Re-run the "Best X of Y" selection logic (sorting by differential) inside this query.

Marking: Identify the specific score IDs that were included in the average and mark usedInCalculation: true.

Return: Sort the final list by Date Descending (using the score's specific createdAt or date) so it looks like a history log.

Part 3: The "Scandicap Details" Screen

File: app/scandicap-details.tsx

A. The Entry Point (Home Screen)

Logic: Check profile.handicap.

If null (0 rounds): Show Pencil/Plus Icon -> Opens Seeding Modal.

If number (>0 rounds): Show Info (i) Icon -> Opens ScandicapDetailsScreen.

B. Screen Structure

1. Hero Card (The "Digital Badge")

Content:

Big Number: The current Handicap Index.

Label: "OFFICIAL SCANDICAP" or "PROVISIONAL INDEX" (based on round count).

Badge: If provisional, display a distinct indicator (e.g., "Est.").

2. Trend Chart

Library: react-native-chart-kit (Use existing app configuration).

Data: Map data.history.

Content: Line chart showing the index fluctuation over available history.

3. "How it Works" (Dynamic Text Block)

If Provisional (1-2 Rounds): "This is an estimate based on your limited play history. Play 3 total rounds to establish an official handicap."

If Official (< 20 Rounds): "You have an official index! As you play more, your formula will mature to the standard 'Best 8 of 20'."

If Mature (20+ Rounds): "Calculated using the best 8 differentials from your last 20 rounds."

4. The Evidence Table

Columns: Date | Course | Score | Diff.

Rows: Map through data.calculationRounds.

Visual Logic:

Counting Rounds (usedInCalculation: true): Visually emphasize these rows to indicate they contributed to the current index.

Non-Counting Rounds: Display these with less visual prominence.

Ghost Rounds: Clearly label the Course Name as "Imported History" or "Seed Data".

Part 4: Execution Checklist

Backend: Update convex/handicap.ts with the 1-2 round logic (-2.0 adj).

Backend: Implement api.handicap.getDetails query with the "usedInCalculation" flagging logic.

Frontend: Build app/scandicap-details.tsx using the existing design system components.

Frontend: Update Home Screen header to link the (i) icon to this new screen.