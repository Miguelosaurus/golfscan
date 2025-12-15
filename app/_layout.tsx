import "react-native-reanimated";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { useGolfStore } from "@/store/useGolfStore";
import { Alert, ImageBackground, StyleSheet } from "react-native";
import { DEFAULT_COURSE_IMAGE } from "@/constants/images";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

function ActiveScanPoller() {
  const router = useRouter();
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
      router.push("/scan-scorecard?review=1");
    }
  }, [jobId, jobStatus, jobResult]);

  return null;
}

function RoundSyncer() {
  const { rounds, courses, updateRound, updateCourse, deleteRound: deleteLocalRound } = useGolfStore();
  const saveRoundMutation = useMutation(api.rounds.saveRound);
  const updateRoundMutation = useMutation(api.rounds.updateRound);
  const upsertCourse = useMutation(api.courses.upsert);
  const getOrCreateCourseImage = useAction(api.courseImages.getOrCreate);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Retry unsynced rounds periodically so they recover automatically when
  // connectivity comes back (e.g., server was down at save time).
  useEffect(() => {
    const interval = setInterval(() => setRetryTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);
  const isConvexId = (value: string | undefined | null) => /^[a-z0-9]{32}$/i.test(value ?? "");
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
    if (!pending.length || isSyncing) return;

    let cancelled = false;
    setIsSyncing(true);

    (async () => {
      for (const round of pending) {
        if (cancelled) break;

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
              holes: course.holes.map((h: any) => ({
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
          updateRound({ ...round, syncStatus: "failed" } as any);
          continue;
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

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="dark" />
          <ActiveScanPoller />
          <RoundSyncer />
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
              options={{ title: "Round Details", animation: "slide_from_right" }}
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
              options={{ title: "Scan Scorecard", presentation: "modal" }}
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
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
