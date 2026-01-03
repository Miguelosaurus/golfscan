import "react-native-reanimated";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { useGolfStore } from "@/store/useGolfStore";
import { Id } from "@/convex/_generated/dataModel";
import { Alert, ImageBackground, StyleSheet } from "react-native";
import { DEFAULT_COURSE_IMAGE } from "@/constants/images";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

function ActiveScanPoller() {
  const router = useRouter();
  const pathname = usePathname();
  const lastHandledId = useRef<string | null>(null);
  const {
    activeScanJob,
    updateActiveScanJob,
    markActiveScanReviewPending,
    setIsScanning,
    setScannedData,
    clearActiveScanJob,
  } = useGolfStore();

  const jobId = activeScanJob?.id ?? null;
  const isConvexId = typeof jobId === "string" && /^[a-z0-9]{32}$/.test(jobId);

  const jobStatus = useQuery(
    api.scorecard.getJobStatus,
    isConvexId ? { jobId: jobId as any } : "skip"
  );
  const jobResult = useQuery(
    api.scorecard.getJobResult,
    isConvexId ? { jobId: jobId as any } : "skip"
  );

  useEffect(() => {
    if (!jobId || !jobStatus) return;

    const status = jobStatus.status;
    const progress = jobStatus.progress ?? 0;
    const message = jobStatus.message ?? "Processing...";

    updateActiveScanJob({
      status: status === "failed" ? "error" : status === "complete" ? "complete" : "processing",
      progress,
      message,
      updatedAt: new Date().toISOString(),
    });

    if (status === "failed") {
      setIsScanning(false);
      Alert.alert(
        "Scan Failed",
        message || "Failed to scan scorecard. Please try again.",
        [{ text: "OK", onPress: () => clearActiveScanJob() }]
      );
      return;
    }

    if (status === "complete" && jobResult && lastHandledId.current !== jobId) {
      lastHandledId.current = jobId;
      setScannedData(jobResult as any);
      updateActiveScanJob({
        status: "complete",
        stage: "complete",
        message: "Review your round and save when ready.",
        result: jobResult as any,
        requiresReview: true,
        updatedAt: new Date().toISOString(),
      });
      markActiveScanReviewPending();
      setIsScanning(false);
      console.log("[ActiveScanPoller] Job complete", { jobId, pathname });
      // Disable auto-navigation to avoid navigation thrash/flicker while debugging.
      // Home already shows the "Ready to review" card which opens `/scan-review`.
    }
  }, [jobId, jobStatus, jobResult, pathname, router]);

  return null;
}

const isConvexId = (value: string | undefined | null) => /^[a-z0-9]{32}$/i.test(value ?? "");

function RoundSyncer() {
  const { rounds, courses, updateRound, updateCourse, deleteRound: deleteLocalRound, unhideCourse } = useGolfStore();
  const saveRoundMutation = useMutation(api.rounds.saveRound);
  const updateRoundMutation = useMutation(api.rounds.updateRound);
  const upsertCourse = useMutation(api.courses.upsert);
  const getOrCreateCourseImage = useAction(api.courseImages.getOrCreate);
  const setLocationMutation = useMutation(api.courses.setLocation);
  // Session linking and completion mutations
  const linkRoundToSession = useMutation(api.gameSessions.linkRound);
  const completeSessionWithSettlement = useMutation(api.gameSessions.completeWithSettlement);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Helper to detect if location is missing/invalid
  const isLocationMissing = (loc?: string | null) =>
    !loc || loc === 'Unknown location' || loc.includes('undefined') || loc.includes('Unknown');

  // Sync Unsplash placeholder images and missing locations with real data from Google Places
  useEffect(() => {
    (async () => {
      for (const course of courses) {
        // Check if course needs image or location update
        const needsImage = course.imageUrl?.includes('unsplash.com') || course.imageUrl === DEFAULT_COURSE_IMAGE;
        const needsLocation = isLocationMissing(course.location);

        if (!needsImage && !needsLocation) continue;

        // If we have a convex ID, or at least a name
        const convexId = isConvexId(course.id) ? (course.id as Id<"courses">) : undefined;

        if (convexId) {
          try {
            const result = await getOrCreateCourseImage({
              courseId: convexId,
              courseName: course.name,
              // Only pass location if it's valid - don't pollute search with "undefined, Unknown"
              locationText: needsLocation ? undefined : course.location,
            });

            // Update image if we got a new one
            if (result?.url && result.url !== course.imageUrl) {
              console.log('[ImageSync] Replacing Unsplash image for', course.name);
              updateCourse({ ...course, imageUrl: result.url } as any);
            }

            // Update location if we got one and current is missing/invalid
            if (result?.location && needsLocation) {
              console.log('[ImageSync] Updating missing location for', course.name, '->', result.location);
              await setLocationMutation({
                courseId: convexId,
                location: result.location,
              });
              // Also update local store
              updateCourse({ ...course, location: result.location } as any);
            }
          } catch (e) {
            console.warn("[ImageSync] Failed to fetch image/location for", course.name, e);
          }
        }
      }
    })();
  }, [courses, getOrCreateCourseImage, updateCourse, setLocationMutation]);

  // Retry unsynced rounds periodically so they recover automatically when
  // connectivity comes back (e.g., server was down at save time).
  useEffect(() => {
    const interval = setInterval(() => setRetryTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const profile = useQuery(api.users.getProfile);
  const convexRounds =
    useQuery(
      api.rounds.listWithSummary,
      profile?._id ? { hostId: profile._id as any } : "skip"
    ) || [];

  // Keep local store in sync with Convex by pruning any rounds that
  // were previously synced (have a remoteId) but no longer exist on
  // the server. This lets dashboard deletions propagate into the app
  // while still allowing offline-only local rounds.
  useEffect(() => {
    if (!convexRounds) return;
    const serverIds = new Set<string>((convexRounds as any[]).map((r) => r.id as string));
    rounds.forEach((r) => {
      const remoteId = (r as any).remoteId as string | undefined;
      if (remoteId && isConvexId(remoteId) && !serverIds.has(remoteId)) {
        deleteLocalRound(r.id);
      }
    });
  }, [convexRounds, rounds, deleteLocalRound]);

  useEffect(() => {
    const pending = rounds.filter((r) => r.syncStatus && r.syncStatus !== "synced");
    console.log('[RoundSyncer] Pending rounds:', pending.length, 'isSyncing:', isSyncing);
    if (!pending.length || isSyncing) return;

    let cancelled = false;
    setIsSyncing(true);
    console.log('[RoundSyncer] Starting sync for', pending.length, 'rounds');

    (async () => {
      for (const round of pending) {
        if (cancelled) break;
        console.log('[RoundSyncer] Syncing round:', round.id, 'courseId:', round.courseId);

        const course = courses.find((c) => c.id === round.courseId);

        // If round.courseId is already a valid Convex ID, use it directly
        // Otherwise, check if the local course has a Convex ID
        let convexCourseId: Id<"courses"> | undefined =
          isConvexId(round.courseId)
            ? (round.courseId as any)
            : (course && isConvexId(course.id) ? (course.id as any) : undefined);
        // If this course hasn't been synced to Convex yet, upsert it now.
        if (!convexCourseId && course) {
          try {
            const courseId = await upsertCourse({
              externalId: course.id,
              name: course.name,
              location: course.location || "Unknown",
              slope: (course as any).slope,
              rating: (course as any).rating,
              teeSets: (course as any).teeSets
                ? (course as any).teeSets.map((t: any) => ({
                  name: t.name,
                  rating: t.rating,
                  slope: t.slope,
                  gender: t.gender,
                  holes: Array.isArray(t.holes)
                    ? t.holes.map((h: any, index: number) => ({
                      number: h.number ?? index + 1,
                      par: h.par,
                      hcp: h.handicap ?? h.hcp ?? index + 1,
                      yardage: h.distance ?? h.yardage,
                    }))
                    : undefined,
                }))
                : undefined,
              holes: (course.holes ?? []).map((h: any) => ({
                number: h.number,
                par: h.par,
                hcp: h.handicap ?? h.hcp ?? h.number,
                yardage: h.distance ?? h.yardage,
              })),
              // Never overwrite Convex's cached Google image with the default Unsplash placeholder
              imageUrl:
                (course as any).imageUrl &&
                  (course as any).imageUrl !== DEFAULT_COURSE_IMAGE
                  ? (course as any).imageUrl
                  : undefined,
            });
            convexCourseId = courseId as Id<"courses">;
          } catch (e) {
            console.warn("Convex upsert course during round sync failed:", e);
          }
        }
        if (!convexCourseId) {
          // Can't sync this round without a Convex course; mark as failed for now.
          console.warn('[RoundSyncer] No Convex course ID found for round:', round.id, 'marking as failed');
          updateRound({ ...round, syncStatus: "failed" } as any);
          continue;
        }

        // Unhide the course if it was previously hidden (deleted)
        // This ensures the course reappears when a round with it is saved
        if (course?.id) {
          unhideCourse(course.id);
        }

        const courseHoles = course?.holes ?? [];
        const holeCount =
          round.holeCount ??
          (round.players?.[0]?.scores?.length
            ? Math.max(...round.players[0].scores.map((s) => s.holeNumber))
            : 18);
        const buildHoleData = (p: any) =>
          (p.scores ?? []).map((s: any) => {
            const hole = courseHoles.find((h) => h.number === s.holeNumber);
            return {
              hole: s.holeNumber,
              score: s.strokes,
              par: hole?.par ?? 4,
              putts: undefined,
              fairwayHit: undefined,
              gir: undefined,
            };
          });

        const playersPayload = Object.values(
          (round.players ?? []).reduce<Record<string, any>>((acc, p) => {
            const key = p.playerId;
            if (acc[key]) return acc;
            acc[key] = p;
            return acc;
          }, {})
        ).map((p) => ({
          name: p.playerName,
          teeName: p.teeColor,
          teeGender: (p as any).teeGender,
          handicap: p.handicapUsed,
          holeData: buildHoleData(p),
          // Propagate "You" selection into Convex payload
          isSelf: !!(p as any).isUser,
        }));

        try {
          if ((round as any).remoteId && isConvexId((round as any).remoteId)) {
            await updateRoundMutation({
              roundId: (round as any).remoteId as any,
              courseId: convexCourseId,
              date: round.date,
              holeCount: holeCount <= 9 ? 9 : 18,
              weather: undefined,
              players: playersPayload,
            });
          } else {
            const res = await saveRoundMutation({
              courseId: convexCourseId,
              date: round.date,
              holeCount: holeCount <= 9 ? 9 : 18,
              weather: undefined,
              scanJobId: undefined,
              players: playersPayload,
            });
            const remoteId = (res as any)?.roundId;
            if (remoteId) {
              (round as any).remoteId = remoteId as string;
              round.id = round.id || remoteId;

              // If this round came from a game session, link and complete it
              const sessionId = (round as any).gameSessionId;
              if (sessionId && isConvexId(sessionId)) {
                try {
                  console.log('[RoundSyncer] Linking round to session:', remoteId, '->', sessionId);
                  await linkRoundToSession({
                    sessionId: sessionId as any,
                    roundId: remoteId as any,
                  });
                  console.log('[RoundSyncer] Completing session with settlement:', sessionId);
                  await completeSessionWithSettlement({
                    sessionId: sessionId as any,
                  });
                  console.log('[RoundSyncer] Session completed successfully');
                } catch (e) {
                  console.error('[RoundSyncer] Failed to complete session:', e);
                }
              }
            }
          }

          // Ensure we have a Google-derived image cached in Convex and mirrored locally.
          if (course) {
            try {
              const img = await getOrCreateCourseImage({
                courseId: convexCourseId,
                courseName: course.name,
                locationText: course.location,
              });
              if (img?.url && course.imageUrl !== img.url) {
                updateCourse({ ...course, imageUrl: img.url } as any);
              }
            } catch (e) {
              console.warn("courseImages.getOrCreate failed during round sync:", e);
            }
          }

          updateRound({
            ...round,
            syncStatus: "synced",
            updatedAt: new Date().toISOString(),
          } as any);
        } catch (err) {
          console.error('[RoundSyncer] Sync failed for round:', round.id, err);
          updateRound({
            ...round,
            syncStatus: "failed",
          } as any);
        }
      }
      if (!cancelled) setIsSyncing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rounds, courses, isSyncing, retryTick, saveRoundMutation, updateRoundMutation, upsertCourse, getOrCreateCourseImage, updateRound, updateCourse]);

  return null;
}

/**
 * CourseSyncer: Hydrates the local Zustand store with course data from Convex.
 * This ensures the local cache is a reflection of the backend.
 */
function CourseSyncer() {
  const { addCourse, updateCourse, getCourseById } = useGolfStore();
  const profile = useQuery(api.users.getProfile);
  const roundsData = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as Id<"users"> } : "skip"
  ) || [];
  const getConvexCourseByExternalId = useAction(api.courses.getByExternalIdAction);
  const [syncedCourses, setSyncedCourses] = useState<Set<string>>(new Set());

  // Sync courses from Convex roundsData into local Zustand store
  // Only runs when roundsData changes, NOT when local courses change
  useEffect(() => {
    if (!roundsData.length) return;

    // Build a map of courses from roundsData (which now includes full course data)
    const seenCourses = new Set<string>();
    const isDefaultImage = (url?: string | null) =>
      !url || url.includes('unsplash.com') || url.includes('photo-1587174486073-ae5e5cff23aa');
    const isRealImage = (url?: string | null) =>
      url && (url.startsWith('data:image') || (!url.includes('unsplash.com')));

    const processCourse = async (r: any) => {
      const externalId = r.courseExternalId as string | undefined;
      const convexCourseId = r.courseId as string;
      const courseKey = externalId ?? convexCourseId;

      // Skip if we've already processed this course in this batch
      if (seenCourses.has(courseKey)) return;
      seenCourses.add(courseKey);

      // Check if course exists in local store
      const existingCourse = getCourseById(courseKey);

      // Force update if local has default image but Convex has real image
      const convexImageUrl = r.courseImageUrl as string | undefined;
      const localHasDefaultImage = isDefaultImage(existingCourse?.imageUrl);
      const convexHasRealImage = isRealImage(convexImageUrl);
      const needsImageUpdate = existingCourse && localHasDefaultImage && convexHasRealImage;

      // Skip if we've already synced and don't need an image update
      if (syncedCourses.has(courseKey) && !needsImageUpdate) return;

      // Get holes data from Convex response
      let convexHoles = (r.courseHoles as any[] | undefined) ?? [];
      let convexTeeSets = (r.courseTeeSets as any[] | undefined) ?? [];
      let location = r.courseLocation ?? 'Unknown location';
      let slope = r.courseSlope;
      let rating = r.courseRating;

      // If no holes in listWithSummary, try to fetch from Convex courses API
      if (!convexHoles.length && externalId) {
        console.log('[CourseSyncer] Fetching missing course data:', r.courseName, externalId);
        try {
          const fullCourse = await getConvexCourseByExternalId({ externalId });
          console.log('[CourseSyncer] Fetched course:', externalId, 'holes:', fullCourse?.holes?.length ?? 0);
          if (fullCourse?.holes && fullCourse.holes.length > 0) {
            convexHoles = fullCourse.holes;
            convexTeeSets = (fullCourse as any).teeSets ?? convexTeeSets;
            location = fullCourse.location ?? location;
            slope = fullCourse.slope ?? slope;
            rating = fullCourse.rating ?? rating;
          }
        } catch (e) {
          console.warn('[CourseSyncer] Failed to fetch course:', externalId, e);
        }
      }

      // Mark as synced so we don't process again
      setSyncedCourses(prev => new Set(prev).add(courseKey));

      // Skip if still no holes data
      if (!convexHoles.length) {
        console.log('[CourseSyncer] No holes data for:', r.courseName, 'externalId:', externalId);
        return;
      }

      // Convert Convex format to local format
      const holes = convexHoles.map((h: any) => ({
        number: h.number,
        par: h.par,
        distance: h.yardage ?? h.distance ?? 0,
        handicap: h.hcp ?? h.handicap,
      }));

      const courseData = {
        id: externalId ?? convexCourseId,
        name: r.courseName,
        location,
        holes,
        imageUrl: r.courseImageUrl,
        slope,
        rating,
        teeSets: convexTeeSets,
      };

      if (!existingCourse) {
        // Course doesn't exist locally, add it
        addCourse(courseData as any);
      } else {
        // Update local course with fresh Convex data (Convex is source of truth)
        updateCourse({ ...existingCourse, ...courseData } as any);
      }
    };

    // Process all courses
    roundsData.forEach(processCourse);
  }, [roundsData, addCourse, updateCourse, getCourseById, getConvexCourseByExternalId, syncedCourses]);

  return null;
}

export default function RootLayout() {
  const pathname = usePathname();
  useEffect(() => {
    console.log('[nav] pathname', pathname);
  }, [pathname]);

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar style="dark" />
            <ActiveScanPoller />
            <RoundSyncer />
            <CourseSyncer />
            <Stack
              screenOptions={{
                headerBackTitle: "Back",
                headerStyle: { backgroundColor: "#FFFFFF" },
                headerShadowVisible: false,
                headerTitleStyle: { fontWeight: "600" },
                contentStyle: { backgroundColor: "#FFFFFF" },
              }}
            >
              <Stack.Screen name="(home)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="course/[id]"
                options={{ title: "Course Details", animation: "slide_from_right" }}
              />
              <Stack.Screen
                name="round/[id]"
                options={{
                  title: "Round Details",
                  presentation: "fullScreenModal",
                  animation: "slide_from_bottom"
                }}
              />
              <Stack.Screen
                name="player/[id]"
                options={{ title: "Player Profile", animation: "slide_from_right" }}
              />
              <Stack.Screen
                name="new-round"
                options={{ title: "New Round", presentation: "modal" }}
              />
              <Stack.Screen
                name="new-course"
                options={{ title: "Add Course", presentation: "modal" }}
              />
              <Stack.Screen
                name="scan-scorecard"
                options={{
                  title: "Scan Scorecard",
                  headerShown: false,
                  presentation: "fullScreenModal",
                  animation: "slide_from_bottom",
                  contentStyle: { backgroundColor: "#000000" },
                }}
              />
              <Stack.Screen
                name="scan-review"
                options={{
                  title: "Review Scorecard",
                  headerShown: false,
                  presentation: "formSheet",
                  // Full height to fully cover the home header.
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: false,
                  sheetCornerRadius: 28,
                  contentStyle: { backgroundColor: "#F5F3EF" },
                }}
              />
              <Stack.Screen
                name="active-session"
                options={{ title: "Active Session", animation: "slide_from_right" }}
              />
              <Stack.Screen
                name="scandicap-details"
                options={{
                  title: "Scandicap Details",
                  headerTransparent: true,
                  headerTintColor: "#E1F2EA",
                  headerTitleStyle: { color: "#E1F2EA", fontWeight: "600" },
                  headerShadowVisible: false,
                  headerBackground: () => (
                    <ImageBackground
                      source={require("../assets/images/green_texture.png")}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ),
                  contentStyle: { backgroundColor: "transparent" },
                }}
              />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
