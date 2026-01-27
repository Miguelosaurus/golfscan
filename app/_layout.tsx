import "react-native-reanimated";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, useState } from "react";
import { createConvexClient, useConvex, useQuery, useMutation, useAction } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { useGolfStore } from "@/store/useGolfStore";
import { Id } from "@/convex/_generated/dataModel";
import { Alert, AppState, ImageBackground, StyleSheet, Text, TextInput, View } from "react-native";
import { DEFAULT_COURSE_IMAGE } from "@/constants/images";
import { initPostHog, identifyUser, trackScanCompleted } from "@/lib/analytics";
import Constants from "expo-constants";

// Initialize PostHog on app startup
initPostHog();

// Cap Dynamic Type (font scaling) globally to keep UI consistent while still
// allowing some accessibility scaling.
const TextAny = Text as any;
TextAny.defaultProps = TextAny.defaultProps ?? {};
TextAny.defaultProps.allowFontScaling = true;
TextAny.defaultProps.maxFontSizeMultiplier = 1.2;

const TextInputAny = TextInput as any;
TextInputAny.defaultProps = TextInputAny.defaultProps ?? {};
TextInputAny.defaultProps.allowFontScaling = true;
TextInputAny.defaultProps.maxFontSizeMultiplier = 1.2;

const configErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111111", marginBottom: 8 },
  text: { fontSize: 14, color: "#333333", textAlign: "center", marginBottom: 12 },
  vars: { fontSize: 13, fontFamily: "Courier", color: "#111111", textAlign: "center" },
});

/**
 * Analytics component that identifies users with PostHog
 */
function AnalyticsProvider() {
  const profile = useQuery(api.users.getProfile);
  const identified = useRef(false);

  // Use lightweight count query instead of full listWithSummary
  const roundsCount = useQuery(
    api.rounds.countByHost,
    profile?._id ? { hostId: profile._id as any } : "skip"
  ) ?? 0;

  useEffect(() => {
    if (profile && !identified.current) {
      identified.current = true;
      identifyUser(profile._id, {
        name: profile.name,
        email: profile.email,
        handicap: profile.handicap ?? undefined,
        roundsPlayed: roundsCount,
        isPro: profile.isPro,
        appVersion: Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || "1.0.0",
      });
    }
  }, [profile, roundsCount]);

  return null;
}

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

      // Track scan completed
      if (jobStatus.createdAt && jobStatus.updatedAt) {
        const usage = (jobResult as any)?.usage;
        trackScanCompleted({
          durationMs: jobStatus.updatedAt - jobStatus.createdAt,
          confidence: (jobResult as any)?.overallConfidence ?? 0,
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        });
      }

      console.log("[ActiveScanPoller] Job complete", { jobId, pathname });
      // Disable auto-navigation to avoid navigation thrash/flicker while debugging.
      // Home already shows the "Ready to review" card which opens `/scan-review`.
    }
  }, [jobId, jobStatus, jobResult, pathname, router]);

  return null;
}

function StoreCleanup() {
  const { removeLegacyPlayers, removeLegacyCourses, _hasHydrated } = useGolfStore();

  useEffect(() => {
    if (_hasHydrated) {
      removeLegacyPlayers();
      removeLegacyCourses();
    }
  }, [_hasHydrated]);

  return null;
}

const isConvexId = (value: string | undefined | null) => /^[a-z0-9]{32}$/i.test(value ?? "");

function RoundSyncer() {
  const saveRoundMutation = useMutation(api.rounds.saveRound);
  const updateRoundMutation = useMutation(api.rounds.updateRound);
  const upsertCourse = useMutation(api.courses.upsert);
  const getOrCreateCourseImage = useAction(api.courseImages.getOrCreate);
  const setLocationMutation = useMutation(api.courses.setLocation);
  const linkRoundToSession = useMutation(api.gameSessions.linkRound);
  const completeSessionWithSettlement = useMutation(api.gameSessions.completeWithSettlementV2);

  const isSyncingRef = React.useRef(false);
  const processedCoursesRef = React.useRef<Set<string>>(new Set());
  const lastPruneRef = React.useRef<number>(0);
  const syncTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRoundsRef = React.useRef<(() => void) | null>(null);

  const profile = useQuery(api.users.getProfile);
  const convex = useConvex();

  // Helper to detect if location is missing/invalid
  const isLocationMissing = (loc?: string | null) =>
    !loc || loc === 'Unknown location' || loc.includes('undefined') || loc.includes('Unknown');

  // Sync courses (images/locations) - runs once per course via ref tracking
  useEffect(() => {
    if (!profile) return;

    // Reset per-user to avoid skipping work after logout/login.
    processedCoursesRef.current = new Set();

    let cancelled = false;

    const syncMissingCourseMeta = async () => {
      const { courses, updateCourse } = useGolfStore.getState();

      for (const course of courses) {
        if (cancelled) return;
        if (processedCoursesRef.current.has(course.id)) continue;

        const needsImage =
          course.imageUrl?.includes('unsplash.com') || course.imageUrl === DEFAULT_COURSE_IMAGE;
        const needsLocation = isLocationMissing(course.location);

        if (!needsImage && !needsLocation) continue;

        processedCoursesRef.current.add(course.id);

        const convexId = isConvexId(course.id) ? (course.id as Id<"courses">) : undefined;
        if (!convexId) continue;

        try {
          const result = await getOrCreateCourseImage({
            courseId: convexId,
            courseName: course.name,
            locationText: needsLocation ? undefined : course.location,
          });

          if (result?.url && result.url !== course.imageUrl) {
            updateCourse({ ...course, imageUrl: result.url } as any);
          }
          if (result?.location && needsLocation) {
            await setLocationMutation({ courseId: convexId, location: result.location });
            updateCourse({ ...course, location: result.location } as any);
          }
        } catch (e) {
          console.warn("[ImageSync] Failed for", course.name, e);
        }
      }
    };

    const run = () => {
      void syncMissingCourseMeta();
    };

    // Run once on mount/profile ready.
    run();

    // Re-run when new courses are added (event-driven; avoids polling).
    const unsubscribe = useGolfStore.subscribe((state, prevState) => {
      if (state.courses.length !== prevState.courses.length) run();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile, getOrCreateCourseImage, setLocationMutation]);

  // Trigger sync when pending rounds appear (event-driven).
  useEffect(() => {
    const unsubscribe = useGolfStore.subscribe((state, prevState) => {
      const hasPending = state.rounds.some((r) => r.syncStatus && r.syncStatus !== "synced");
      if (!hasPending) return;

      const prevHasPending = prevState.rounds.some(
        (r) => r.syncStatus && r.syncStatus !== "synced"
      );

      if (prevHasPending) return;

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      syncRoundsRef.current?.();
    });
    return unsubscribe;
  }, []);

  // Prune local rounds whose remoteId no longer exists on the server.
  // This preserves the original "delete on one device disappears on others" behavior
  // without re-introducing the heavy listWithSummary subscription.
  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    const pruneDeletedRounds = async () => {
      if (cancelled) return;

      // Rate limit: at most once per 5 minutes.
      const now = Date.now();
      if (now - lastPruneRef.current < 5 * 60 * 1000) return;
      lastPruneRef.current = now;

      const { rounds, deleteRound } = useGolfStore.getState();
      const remoteIds = rounds
        .map((r) => (r as any).remoteId as string | undefined)
        .filter((id): id is string => !!id && isConvexId(id));

      if (!remoteIds.length) return;

      const uniqueRemoteIds = Array.from(new Set(remoteIds));
      const existing = new Set<string>();

      // Chunk to keep args size and server work bounded.
      const chunkSize = 100;
      for (let i = 0; i < uniqueRemoteIds.length; i += chunkSize) {
        const chunk = uniqueRemoteIds.slice(i, i + chunkSize);
        const found = await convex.query(api.rounds.existsBatch, { roundIds: chunk as any });
        for (const id of found) existing.add(id);
      }

      for (const r of rounds) {
        const remoteId = (r as any).remoteId as string | undefined;
        if (!remoteId || !isConvexId(remoteId)) continue;
        if (existing.has(remoteId)) continue;
        deleteRound(r.id);
      }
    };

    // Run on mount/profile ready.
    void pruneDeletedRounds().catch((e) => console.warn("[RoundSyncer] Prune failed:", e));

    // Run when app comes back to foreground.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void pruneDeletedRounds().catch((e) => console.warn("[RoundSyncer] Prune failed:", e));
      syncRoundsRef.current?.();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [profile, convex]);

  // Main sync effect with SMART POLLING
  // - Fast (5s) when there are pending rounds
  // - No polling when idle (event-driven)
  useEffect(() => {
    const clearSyncTimeout = () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };

    const scheduleSync = (delayMs: number) => {
      clearSyncTimeout();
      syncTimeoutRef.current = setTimeout(() => {
        syncRoundsRef.current?.();
      }, delayMs);
    };

    const syncRounds = async () => {
      if (!profile) return;
      if (isSyncingRef.current) return;

      const { rounds, courses, updateRound, updateCourse, unhideCourse } = useGolfStore.getState();

      const pending = rounds.filter((r) =>
        r.syncStatus &&
        r.syncStatus !== "synced"
      );

      if (!pending.length) {
        clearSyncTimeout();
        return;
      }

      isSyncingRef.current = true;

      for (const round of pending) {
        const course = courses.find((c) => c.id === round.courseId);

        let convexCourseId: Id<"courses"> | undefined =
          isConvexId(round.courseId)
            ? (round.courseId as any)
            : (course && isConvexId(course.id) ? (course.id as any) : undefined);

        if (!convexCourseId && course) {
          try {
            const courseId = await upsertCourse({
              externalId: course.id,
              name: course.name,
              location: course.location || "Unknown",
              slope: (course as any).slope,
              rating: (course as any).rating,
              teeSets: (course as any).teeSets?.map((t: any) => ({
                name: t.name, rating: t.rating, slope: t.slope, gender: t.gender,
                holes: t.holes?.map((h: any, i: number) => ({
                  number: h.number ?? i + 1, par: h.par,
                  hcp: h.handicap ?? h.hcp ?? i + 1, yardage: h.distance ?? h.yardage,
                })),
              })),
              holes: (course.holes ?? []).map((h: any) => ({
                number: h.number, par: h.par,
                hcp: h.handicap ?? h.hcp ?? h.number, yardage: h.distance ?? h.yardage,
              })),
              imageUrl: (course as any).imageUrl !== DEFAULT_COURSE_IMAGE ? (course as any).imageUrl : undefined,
            });
            convexCourseId = courseId as Id<"courses">;
          } catch (e) {
            console.warn("Upsert course failed:", e);
          }
        }

        if (!convexCourseId) {
          console.warn('[RoundSyncer] No course ID for round:', round.id);
          updateRound({ ...round, syncStatus: "failed" } as any);
          continue;
        }

        if (course?.id) unhideCourse(course.id);

        const courseHoles = course?.holes ?? [];
        const holeCount = round.holeCount ??
          (round.players?.[0]?.scores?.length
            ? Math.max(...round.players[0].scores.map((s) => s.holeNumber))
            : 18);

        const buildHoleData = (p: any) => (p.scores ?? []).map((s: any) => {
          const hole = courseHoles.find((h) => h.number === s.holeNumber);
          return { hole: s.holeNumber, score: s.strokes, par: hole?.par ?? 4 };
        });

        const playersPayload = Object.values(
          (round.players ?? []).reduce<Record<string, any>>((acc, p) => {
            if (!acc[p.playerId]) acc[p.playerId] = p;
            return acc;
          }, {})
	        ).map((p) => ({
	          name: p.playerName,
	          playerId: isConvexId(p.playerId) ? p.playerId : undefined,
	          teeName: p.teeColor,
	          teeGender: (p as any).teeGender,
	          // Convex expects handicap index; local rounds store index separately when available.
	          handicap: (p as any).handicapIndex ?? p.handicapUsed,
	          holeData: buildHoleData(p),
	          isSelf: !!(p as any).isUser,
	        }));

        try {
          if ((round as any).remoteId && isConvexId((round as any).remoteId)) {
            await updateRoundMutation({
              roundId: (round as any).remoteId as any,
              courseId: convexCourseId,
              date: round.date.includes('T') ? round.date : `${round.date}T00:00:00`,
              holeCount: holeCount <= 9 ? 9 : 18,
              weather: undefined,
              players: playersPayload,
            });
          } else {
            const res = await saveRoundMutation({
              courseId: convexCourseId,
              date: round.date.includes('T') ? round.date : `${round.date}T00:00:00`,
              holeCount: holeCount <= 9 ? 9 : 18,
              weather: undefined,
              scanJobId: undefined,
              players: playersPayload,
            });
            const remoteId = (res as any)?.roundId;
            if (remoteId) {
              (round as any).remoteId = remoteId;
              const sessionId = (round as any).gameSessionId;
              if (sessionId && isConvexId(sessionId)) {
                try {
                  await linkRoundToSession({ sessionId: sessionId as any, roundId: remoteId as any });
                  await completeSessionWithSettlement({ sessionId: sessionId as any });
                } catch (e) {
                  console.error('[RoundSyncer] Session completion failed:', e);
                }
              }
            }
          }

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
            } catch (e) { }
          }

          updateRound({ ...round, syncStatus: "synced", updatedAt: new Date().toISOString() } as any);
        } catch (err) {
          console.error('[RoundSyncer] Sync failed:', round.id, err);
          updateRound({ ...round, syncStatus: "failed" } as any);
        }
      }

      isSyncingRef.current = false;

      const stillPending = useGolfStore
        .getState()
        .rounds.some((r) => r.syncStatus && r.syncStatus !== "synced");
      if (stillPending) {
        scheduleSync(5000);
      } else {
        clearSyncTimeout();
      }
    };

    // Expose to subscriptions / AppState handlers without re-rendering.
    syncRoundsRef.current = () => {
      void syncRounds().catch((e) => console.warn("[RoundSyncer] Sync failed:", e));
    };

    // Run immediately on mount
    void syncRounds().catch((e) => console.warn("[RoundSyncer] Sync failed:", e));

    return () => {
      syncRoundsRef.current = null;
      clearSyncTimeout();
    };
  }, [profile, saveRoundMutation, updateRoundMutation, upsertCourse, getOrCreateCourseImage, linkRoundToSession, completeSessionWithSettlement]);

  return null;
}

/**
 * CourseSyncer: Hydrates the local Zustand store with course data from Convex.
 * Uses lightweight listCourseRefsByHost and fetches full course data on-demand.
 */
function CourseSyncer() {
  const { addCourse, updateCourse, getCourseById } = useGolfStore();
  const profile = useQuery(api.users.getProfile);
  // Use lightweight query instead of listWithSummary
  const courseRefs = useQuery(
    api.rounds.listCourseRefsByHost,
    profile?._id ? { hostId: profile._id as Id<"users"> } : "skip"
  ) || [];
  const getConvexCourseByExternalId = useAction(api.courses.getByExternalIdAction);
  const [syncedCourses, setSyncedCourses] = useState<Set<string>>(new Set());

  // Sync courses from Convex courseRefs into local Zustand store
  // Only runs when courseRefs changes, NOT when local courses change
  useEffect(() => {
    if (!courseRefs.length) return;

    // Build a map of unique courses from courseRefs
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

      // listCourseRefsByHost doesn't include holes/teeSets - fetch full course data
      let convexHoles: any[] = [];
      let convexTeeSets: any[] = [];
      let location = r.courseLocation ?? 'Unknown location';
      let slope: number | undefined;
      let rating: number | undefined;

      // Fetch full course data from Convex (includes holes, teeSets, etc.)
      if (externalId) {
        try {
          const fullCourse = await getConvexCourseByExternalId({ externalId });
          if (fullCourse?.holes && fullCourse.holes.length > 0) {
            convexHoles = fullCourse.holes;
            convexTeeSets = (fullCourse as any).teeSets ?? [];
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
    courseRefs.forEach(processCourse);
  }, [courseRefs, addCourse, updateCourse, getCourseById, getConvexCourseByExternalId, syncedCourses]);

  return null;
}

function RootLayoutWithConfig(props: { convexUrl: string; clerkPublishableKey: string }) {
  const { convexUrl, clerkPublishableKey } = props;
  const convex = React.useMemo(() => createConvexClient(convexUrl), [convexUrl]);

  const pathname = usePathname();
  useEffect(() => {
    console.log('[nav] pathname', pathname);
  }, [pathname]);

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar style="dark" />
            <ActiveScanPoller />
            <RoundSyncer />
            <CourseSyncer />
            <AnalyticsProvider />
            <StoreCleanup />
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
                options={({ route }) => {
                  const onboarding = (route.params as any)?.onboardingMode === "true";
                  return {
                    title: "Round Details",
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                    gestureEnabled: !onboarding,
                    fullScreenGestureEnabled: !onboarding,
                  };
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
                options={({ route }) => {
                  const onboarding = (route.params as any)?.onboardingMode === "true";
                  return {
                    title: "Scan Scorecard",
                    headerShown: false,
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                    contentStyle: { backgroundColor: "#000000" },
                    gestureEnabled: !onboarding,
                    fullScreenGestureEnabled: !onboarding,
                  };
                }}
              />
              <Stack.Screen
                name="scan-review"
                options={({ route }) => {
                  const onboarding = (route.params as any)?.onboardingMode === "true";
                  return {
                    title: "Review Scorecard",
                    headerShown: false,
                    presentation: "formSheet",
                    // Full height to fully cover the home header.
                    sheetAllowedDetents: [1],
                    sheetInitialDetentIndex: 0,
                    // Prevent the sheet from trying to "consume" vertical scroll gestures.
                    sheetExpandsWhenScrolledToEdge: false,
                    sheetGrabberVisible: false,
                    sheetCornerRadius: 28,
                    contentStyle: { backgroundColor: "#F5F3EF" },
                    // Prevent dismissing the onboarding flow by swiping the sheet down.
                    gestureEnabled: !onboarding,
                    fullScreenGestureEnabled: !onboarding,
                  };
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
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

export default function RootLayout() {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!convexUrl || !clerkPublishableKey) {
    const missing = [
      !convexUrl ? "EXPO_PUBLIC_CONVEX_URL" : null,
      !clerkPublishableKey ? "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" : null,
    ].filter((v): v is string => v !== null);

    console.error("[Config] Missing required environment variables:", missing.join(", "));

    return (
      <View style={configErrorStyles.container}>
        <Text style={configErrorStyles.title}>Configuration error</Text>
        <Text style={configErrorStyles.text}>
          This build is missing required configuration:
        </Text>
        <Text style={configErrorStyles.vars}>{missing.join("\n")}</Text>
      </View>
    );
  }

  return (
    <RootLayoutWithConfig convexUrl={convexUrl} clerkPublishableKey={clerkPublishableKey} />
  );
}
