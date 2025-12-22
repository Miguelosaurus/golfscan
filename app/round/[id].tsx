import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/constants/colors";
import { Button } from "@/components/Button";
import { getScoreDifferential, getScoreLabel, calculateNetScore } from "@/utils/helpers";
import { Calendar, MapPin, Award, Target, Zap, TrendingDown, Edit3, Trash2, ChevronLeft } from "lucide-react-native";
import { useMutation, useQuery } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useGolfStore } from "@/store/useGolfStore";
import { SettlementSummary } from "@/components/SettlementSummary";

type PlayerScore = {
  playerId: string;
  playerName: string;
  scores: { holeNumber: number; strokes: number; confidence?: number }[];
  totalScore: number;
  handicapUsed?: number;
  teeColor?: string | null;
  teeGender?: "M" | "F" | null;
};

export default function RoundDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { rounds: localRounds, courses: localCourses, deleteRound: deleteLocalRound } = useGolfStore();
  // Resolve the round from local store and, when available, from Convex by its remoteId.
  const localRound = useMemo(
    () =>
      localRounds.find(
        (r) => r.id === id || (r as any).remoteId === id
      ) as any,
    [localRounds, id]
  );

  // Only call Convex when we have a real Convex round id (remoteId from sync)
  const isConvexId = (value: string | undefined | null) =>
    !!value && /^[a-z0-9]{32}$/i.test(value);
  const routeConvexId = isConvexId(id) ? (id as Id<"rounds">) : undefined;
  const convexRoundId = (localRound?.remoteId as Id<"rounds"> | undefined) ?? routeConvexId;

  const roundFromConvex = useQuery(
    api.rounds.getDetail,
    convexRoundId && isConvexId(convexRoundId as any)
      ? { roundId: convexRoundId as Id<"rounds"> }
      : "skip"
  ) as any;

  const round = (roundFromConvex || localRound) as any;
  const deleteRound = useMutation(api.rounds.deleteRound);
  const profile = useQuery(api.users.getProfile);

  // Query for linked game session (if this round has settlement data)
  const linkedSession = useQuery(
    api.gameSessions.getByLinkedRound,
    convexRoundId ? { roundId: convexRoundId as Id<"rounds"> } : "skip"
  ) as any;

  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const courseFromStore = useMemo(
    () => (round ? localCourses.find((c) => c.id === round.courseId) : undefined),
    [round, localCourses]
  );

  const course = useMemo(() => {
    if (!round) {
      return {
        name: "Unknown Course",
        location: "Unknown location",
        holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, distance: 0 })),
        teeSets: [],
      };
    }
    const holes =
      (round as any).holes && Array.isArray((round as any).holes) && (round as any).holes.length
        ? (round as any).holes
        : Array.from({ length: round.holeCount === 9 ? 9 : 18 }, (_, i) => ({
          number: i + 1,
          par: 4,
          distance: 0,
        }));
    return {
      name: round.courseName,
      location: (round as any).courseLocation ?? courseFromStore?.location ?? "Unknown location",
      holes,
      teeSets: (round as any).teeSets ?? courseFromStore?.teeSets ?? [],
    };
  }, [round, courseFromStore]);

  // Determine the current user's name for settlement matching
  const mySettlementName = useMemo(() => {
    if (!linkedSession?.participants) return 'Me';

    // 1. Try to match by User ID (most robust for synced rounds)
    if (profile?._id) {
      const match = linkedSession.participants.find((p: any) => p.userId === profile._id);
      if (match) return match.name;
    }

    // 2. Try to match by local/convex round player linkage (isUser flag + playerId)
    const match = linkedSession.participants.find((p: any) =>
      round?.players?.some((rp: any) => rp.isUser && rp.playerId === p.playerId)
    );
    if (match) return match.name;

    // 3. Try to match by Profile Name (fallback if IDs missing)
    if (profile?.name) {
      const nameMatch = linkedSession.participants.find((p: any) => p.name === profile.name);
      if (nameMatch) return nameMatch.name;
    }

    // 3. Fallback to basic name matching from round players
    return round?.players?.find((p: any) => p.isUser)?.playerName || 'Me';
  }, [linkedSession, round, profile]);

  // Log for debugging balance issues
  useEffect(() => {
    if (linkedSession?.settlement?.calculated) {
      console.log('[RoundDetails] Settlement Name:', mySettlementName, 'ProfileId:', profile?._id);
    }
  }, [mySettlementName, linkedSession, profile]);

  // Compute par adjusted for 9 vs 18 holes based on round holeCount.
  const coursePar18 = course.holes.reduce((sum: number, h: { par?: number }) => sum + (h.par ?? 4), 0);
  const coursePar9 = course.holes.slice(0, 9).reduce((sum: number, h: { par?: number }) => sum + (h.par ?? 4), 0);
  const roundHoleCount =
    (round && (round as any).holeCount) ??
    (round?.players && round.players[0]?.scores
      ? Math.max(...round.players[0].scores.map((s: any) => s.holeNumber))
      : 18);
  const totalPar = roundHoleCount <= 9 ? coursePar9 : coursePar18;

  const localPhotos = useMemo(() => {
    const lr: any = localRound as any;
    if (Array.isArray(lr?.scorecardPhotos) && lr.scorecardPhotos.length > 0) {
      return lr.scorecardPhotos as string[];
    }
    const rd: any = round as any;
    if (Array.isArray(rd?.scorecardPhotos)) {
      return rd.scorecardPhotos as string[];
    }
    return [] as string[];
  }, [localRound, round]);
  const syncStatus = localRound?.syncStatus ?? "synced";

  const localTeeMap = useMemo(() => {
    const map: Record<string, { teeColor?: string; teeGender?: "M" | "F" }> = {};
    const lr: any = localRound as any;
    if (lr && Array.isArray(lr.players)) {
      lr.players.forEach((p: any) => {
        if (!p || !p.playerId) return;
        map[p.playerId] = {
          teeColor: p.teeColor,
          teeGender: p.teeGender,
        };
      });
    }
    return map;
  }, [localRound]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getWinner = (players: PlayerScore[]) => {
    if (players.length <= 1) return null;

    // For match play games, determine winner from settlement (who receives money)
    if (linkedSession?.gameType === 'match_play' && linkedSession?.settlement?.transactions?.length) {
      // The player receiving money is the winner
      const winningTransaction = linkedSession.settlement.transactions.find((tx: any) => tx.amountCents > 0);
      if (winningTransaction) {
        const winnerParticipant = linkedSession.participants?.find((p: any) => p.playerId === winningTransaction.toPlayerId);
        const winnerPlayer = players.find(p => p.playerName === winnerParticipant?.name);
        if (winnerPlayer) return { ...winnerPlayer, isMatchPlayWinner: true };
      }
    }

    // Default: calculate by net score (for stroke play)
    const withHcp = players.filter((p) => p.handicapUsed !== undefined);
    if (withHcp.length) {
      const withNet = withHcp.map((p) => ({
        ...p,
        netScore: calculateNetScore(p.totalScore, p.handicapUsed!),
      }));
      return withNet.reduce((best, cur) => (cur.netScore < (best.netScore ?? 9999) ? cur : best));
    }
    return players.reduce((best, cur) => (cur.totalScore < best.totalScore ? cur : best));
  };

  const calculateStats = (players: PlayerScore[]) => {
    return players.map((player) => {
      let birdies = 0;
      let eagles = 0;
      let pars = 0;
      let bogeys = 0;
      let doubleBogeys = 0;
      let worseThanDouble = 0;
      let front9Score = 0;
      let back9Score = 0;
      let bestHole = { holeNumber: 0, relativeToPar: 0 };
      let worstHole = { holeNumber: 0, relativeToPar: 0 };
      let greenInRegulation = 0;
      let fairwaysHit = 0;
      let fairwaysTotal = 0;
      let totalPutts = 0;
      let puttsTracked = false;
      const scoreByPar = { par3: 0, par4: 0, par5: 0 };

      player.scores.forEach((score) => {
        const hole = course.holes.find((h: { number: number }) => h.number === score.holeNumber);
        if (!hole) return;
        const relativeToPar = score.strokes - (hole.par ?? 4);

        if (bestHole.holeNumber === 0 || relativeToPar < bestHole.relativeToPar) {
          bestHole = { holeNumber: score.holeNumber, relativeToPar };
        }
        if (worstHole.holeNumber === 0 || relativeToPar > worstHole.relativeToPar) {
          worstHole = { holeNumber: score.holeNumber, relativeToPar };
        }

        if (relativeToPar <= -2) eagles++;
        else if (relativeToPar === -1) birdies++;
        else if (relativeToPar === 0) pars++;
        else if (relativeToPar === 1) bogeys++;
        else if (relativeToPar === 2) doubleBogeys++;
        else if (relativeToPar > 2) worseThanDouble++;

        if (hole.par === 3) scoreByPar.par3 += relativeToPar;
        else if (hole.par === 4) scoreByPar.par4 += relativeToPar;
        else if (hole.par === 5) scoreByPar.par5 += relativeToPar;

        if (score.holeNumber <= 9) front9Score += score.strokes;
        else back9Score += score.strokes;

        if ((score as any).greenInRegulation) greenInRegulation++;
        if ((score as any).fairwayHit !== undefined && hole.par > 3) {
          fairwaysTotal++;
          if ((score as any).fairwayHit) fairwaysHit++;
        }
        if ((score as any).putts !== undefined) {
          puttsTracked = true;
          totalPutts += (score as any).putts;
        }
      });

      const netScore =
        player.handicapUsed !== undefined
          ? calculateNetScore(player.totalScore, player.handicapUsed)
          : undefined;

      const localTee = localTeeMap[player.playerId];
      const matchedTee =
        (course as any)?.teeSets?.find((t: any) => t.name === (player as any).teeColor) ?? null;
      const derivedGender =
        matchedTee?.gender === "M" || matchedTee?.gender === "F" ? (matchedTee.gender as "M" | "F") : null;
      const teeColor = localTee?.teeColor ?? player.teeColor ?? matchedTee?.name ?? null;
      const teeGender = localTee?.teeGender ?? player.teeGender ?? derivedGender ?? null;

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        totalScore: player.totalScore,
        handicap: player.handicapUsed,
        netScore,
        teeColor,
        teeGender,
        birdies,
        eagles,
        pars,
        bogeys,
        doubleBogeys,
        worseThanDouble,
        front9Score,
        back9Score,
        bestHole,
        worstHole,
        greenInRegulation,
        fairwaysHit,
        fairwaysTotal,
        totalPutts,
        puttsTracked,
        scoreByPar,
      };
    });
  };

  const uniqueRoundPlayers = useMemo(() => {
    const arr = (round?.players as PlayerScore[] | undefined) ?? [];
    return arr.filter(
      (p, idx, a) => a.findIndex((q) => q.playerId === p.playerId) === idx
    );
  }, [round]);

  const winner = round ? getWinner(uniqueRoundPlayers) : null;
  const playerStats = round ? calculateStats(uniqueRoundPlayers) : [];

  const SkeletonBlock: React.FC<{ width?: number | string; height: number; style?: any }> = ({
    width = "100%",
    height,
    style,
  }) => {
    const opacity = React.useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, [opacity]);

    return (
      <Animated.View
        style={[
          {
            width,
            height,
            backgroundColor: "#e6e6e6",
            borderRadius: 8,
            opacity,
          },
          style,
        ]}
      />
    );
  };


  const formatParTotal = (value: number) => {
    if (value === 0) return "Even";
    return value > 0 ? `+${value}` : `${value}`;
  };

  const handleDeleteRound = () => {
    Alert.alert("Delete Round", "Are you sure you want to delete this round?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!localRound && !round) return;
          try {
            // Only ever delete by the real Convex round id that came from sync.
            const candidateId =
              convexRoundId && isConvexId(convexRoundId as any)
                ? (convexRoundId as Id<"rounds">)
                : undefined;

            if (candidateId) {
              await deleteRound({ roundId: candidateId });
            }

            if (localRound?.id) {
              deleteLocalRound(localRound.id);
            }
            router.back();
          } catch {
            Alert.alert("Error", "Could not delete round. Please try again.");
          }
        },
      },
    ]);
  };

  const displayName = course.name;

  if (!round) {
    const isLoading = roundFromConvex === undefined;
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Round Details",
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { color: colors.text },
            headerTintColor: colors.text,
          }}
        />
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={{ paddingHorizontal: 16, width: "100%" }}>
              <SkeletonBlock width={"60%"} height={24} style={{ marginBottom: 12 }} />
              <SkeletonBlock width={120} height={16} style={{ marginBottom: 6 }} />
              <SkeletonBlock width={180} height={16} style={{ marginBottom: 24 }} />
              <SkeletonBlock width={"100%"} height={90} style={{ marginBottom: 16 }} />
              <SkeletonBlock width={"100%"} height={220} style={{ marginBottom: 16 }} />
              <SkeletonBlock width={"100%"} height={160} />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.errorText}>Round not found</Text>
            <Button title="Go Back" onPress={() => router.back()} style={styles.errorButton} />
          </>
        )}
      </SafeAreaView>
    );
  }

  const handleEditRound = () => {
    if (!id || !round) return;

    // Prefer local tee information (which is updated immediately on save) when building prefill data.
    const localTeeForPlayer: Record<
      string,
      { teeColor?: string; teeGender?: "M" | "F" }
    > = {};
    const lr: any = localRound as any;
    if (lr && Array.isArray(lr.players)) {
      lr.players.forEach((p: any) => {
        if (!p || !p.playerId) return;
        localTeeForPlayer[p.playerId] = {
          teeColor: p.teeColor,
          teeGender: p.teeGender,
        };
      });
    }

    const courseExternalId = (round as any).courseExternalId as string | null;
    const localByExternal = courseExternalId
      ? localCourses.find((c) => c.id === courseExternalId)
      : undefined;
    const courseIdForEdit = (localByExternal?.id ?? courseFromStore?.id ?? round.courseId) as string;
    const courseNameForEdit = localByExternal?.name ?? courseFromStore?.name ?? round.courseName;

    const prefilled = JSON.stringify({
      courseId: courseIdForEdit,
      courseName: courseNameForEdit,
      players: (round.players as any[]).map((p) => ({
        id: p.playerId,
        name: p.playerName,
        scores: p.scores.map((s: any) => ({
          holeNumber: s.holeNumber,
          strokes: s.strokes,
        })),
        teeColor: localTeeForPlayer[p.playerId]?.teeColor ?? p.teeColor,
        teeGender: localTeeForPlayer[p.playerId]?.teeGender ?? p.teeGender,
        handicap: (p as any).handicapUsed,
        // Preserve "You" selection when editing (either from local isUser or Convex isSelf)
        isUser: !!((p as any).isUser ?? (p as any).isSelf),
      })),
      date: round.date,
      notes: (round as any).notes ?? "",
      scorecardPhotos: (round as any).scorecardPhotos ?? [],
    });
    // Use the local round's ID if available, otherwise fall back to route ID
    // This ensures the edit flow can find the round in the local store
    const editId = localRound?.id ?? id;

    router.push({
      pathname: "/scan-review",
      params: { editRoundId: editId as string, prefilled, courseId: round.courseId },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Round Details",
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 0, paddingRight: 16 }} hitSlop={16}>
              <ChevronLeft size={28} color={colors.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleEditRound} style={styles.headerActionButton} hitSlop={8}>
                <Edit3 size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteRound} style={styles.headerActionButton} hitSlop={8}>
                <Trash2 size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.courseName}>{displayName}</Text>
          {syncStatus !== "synced" && (
            <Text
              style={[
                styles.syncBadge,
                syncStatus === "failed" ? styles.syncBadgeFailed : styles.syncBadgePending,
              ]}
            >
              {syncStatus === "pending" ? "Pending sync" : "Sync failed"}
            </Text>
          )}

          <View style={styles.dateContainer}>
            <Calendar size={16} color={colors.text} />
            <Text style={styles.date}>{formatDate(round.date)}</Text>
          </View>

          {course.location ? (
            <View style={styles.locationContainer}>
              <MapPin size={16} color={colors.text} />
              <Text style={styles.location}>{course.location}</Text>
            </View>
          ) : null}
        </View>

        {winner && (
          <View style={styles.winnerContainer}>
            <View style={styles.winnerHeader}>
              <Award size={20} color="#FFD700" />
              <Text style={styles.winnerTitle}>Winner</Text>
            </View>
            <Text style={styles.winnerName}>{winner.playerName}</Text>
            {/* Game-specific personalized description */}
            {(() => {
              // For linked session games, build personalized description
              if (linkedSession?.gameType === 'match_play' && linkedSession?.settlement?.transactions?.length) {
                // Parse hole score from transaction reason: "Lost Match Play (5-3)"
                const tx = linkedSession.settlement.transactions[0];
                const match = tx?.reason?.match(/\((\d+)-(\d+)\)/);
                if (match) {
                  const loserName = linkedSession.participants?.find((p: any) => p.playerId === tx.fromPlayerId)?.name || 'Opponent';
                  const winnerHoles = parseInt(match[1], 10);
                  const loserHoles = parseInt(match[2], 10);
                  const tiedHoles = roundHoleCount - winnerHoles - loserHoles;
                  return (
                    <Text style={styles.winnerScore}>
                      Won {winnerHoles} holes vs {loserName}'s {loserHoles}{tiedHoles > 0 ? ` (${tiedHoles} tied)` : ''}
                    </Text>
                  );
                }
                return <Text style={styles.winnerScore}>Won the match</Text>;
              }

              if (linkedSession?.gameType === 'skins' && linkedSession?.settlement?.transactions?.length) {
                // Count skins won from transaction reasons
                const tx = linkedSession.settlement.transactions.find((t: any) => t.toPlayerId && t.reason?.includes('skin'));
                const skinsMatch = tx?.reason?.match(/(\d+)\s*skin/);
                const skinsWon = skinsMatch ? parseInt(skinsMatch[1], 10) : null;
                return (
                  <Text style={styles.winnerScore}>
                    {skinsWon ? `Collected ${skinsWon} skin${skinsWon > 1 ? 's' : ''}` : 'Most skins won'}
                  </Text>
                );
              }

              if (linkedSession?.gameType === 'nassau') {
                // Show which segments won
                const txReasons = linkedSession.settlement.transactions?.map((t: any) => t.reason) || [];
                const segments = [];
                if (txReasons.some((r: string) => r?.includes('Front'))) segments.push('Front 9');
                if (txReasons.some((r: string) => r?.includes('Back'))) segments.push('Back 9');
                if (txReasons.some((r: string) => r?.includes('Overall'))) segments.push('Overall');
                return (
                  <Text style={styles.winnerScore}>
                    {segments.length > 0 ? `Won ${segments.join(', ')}` : 'Nassau winner'}
                  </Text>
                );
              }

              // Default stroke play description
              if (winner.handicapUsed !== undefined) {
                const netScore = winner.totalScore - winner.handicapUsed;
                const differential = getScoreDifferential(netScore, totalPar);
                const loser = round.players?.find((p: any) => p.playerId !== winner.playerId);
                const loserNet = loser && loser.handicapUsed !== undefined
                  ? loser.totalScore - loser.handicapUsed
                  : null;

                const relativeToPar = winner.totalScore - totalPar;
                const parText = relativeToPar === 0 ? 'Even Par' :
                  relativeToPar > 0 ? `${relativeToPar} Over Par` :
                    `${Math.abs(relativeToPar)} Under Par`;

                return (
                  <View>
                    <Text style={styles.winnerScore}>
                      Gross Score: {winner.totalScore} ({parText})
                    </Text>
                    <Text style={styles.winnerNetScore}>
                      Net Score: {netScore} (Handicap: {winner.handicapUsed})
                    </Text>
                  </View>
                );
              }

              return (
                <Text style={styles.winnerScore}>
                  Shot {winner.totalScore} ({getScoreLabel(getScoreDifferential(winner.totalScore, totalPar))})
                </Text>
              );
            })()}
          </View>
        )}

        {/* Settlement Summary for game sessions - positioned right below winner */}
        {linkedSession?.settlement?.calculated && linkedSession.settlement.transactions?.length > 0 && (
          <View style={{ marginHorizontal: 0, marginTop: 8, marginBottom: 16 }}>

            <SettlementSummary
              gameType={linkedSession.gameType}
              myPlayerName={mySettlementName}
              transactions={linkedSession.settlement.transactions.map((tx: any) => ({
                fromPlayerName: linkedSession.participants?.find((p: any) => p.playerId === tx.fromPlayerId)?.name || 'Unknown',
                toPlayerName: linkedSession.participants?.find((p: any) => p.playerId === tx.toPlayerId)?.name || 'Unknown',
                amountCents: tx.amountCents,
                reason: tx.reason,
              }))}
            />
          </View>
        )}

        {playerStats.map((stats, index) => (
          <View key={`${stats.playerId ?? 'player'}-${index}`} style={styles.playerStatsCard}>
            <View style={styles.playerNameContainer}>
              <Text style={styles.playerStatsName}>{stats.playerName}</Text>
              {(stats.teeColor || stats.teeGender) && (
                <Text style={styles.playerTeeInfo}>
                  Tee: {stats.teeColor ?? "Unknown"}
                  {stats.teeGender
                    ? ` (${stats.teeGender === "M" ? "Men" : "Women"})`
                    : ""}
                </Text>
              )}
            </View>

            <View style={styles.scoreOverview}>
              <View style={styles.scoreItem}>
                <Text style={styles.scoreLabel}>Gross</Text>
                <Text style={styles.scoreValue}>{stats.totalScore}</Text>
              </View>

              {stats.netScore !== undefined && stats.handicap !== undefined && (
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Net</Text>
                  <Text style={styles.scoreValue}>{stats.netScore}</Text>
                </View>
              )}

              {stats.handicap !== undefined && (
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Handicap</Text>
                  <Text style={styles.scoreValue}>{stats.handicap}</Text>
                </View>
              )}

              {totalPar > 0 && (
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>vs Par</Text>
                  <Text
                    style={[
                      styles.scoreDiff,
                      stats.totalScore < totalPar
                        ? styles.underPar
                        : stats.totalScore > totalPar
                          ? styles.overPar
                          : null,
                    ]}
                  >
                    {stats.totalScore === totalPar
                      ? "Even"
                      : stats.totalScore < totalPar
                        ? `-${totalPar - stats.totalScore}`
                        : `+${stats.totalScore - totalPar}`}
                  </Text>
                </View>
              )}

              <View style={styles.scoreItem}>
                <Text style={styles.scoreLabel}>Front 9</Text>
                <Text style={styles.scoreValue}>{stats.front9Score}</Text>
              </View>

              <View style={styles.scoreItem}>
                <Text style={styles.scoreLabel}>Back 9</Text>
                <Text style={styles.scoreValue}>{stats.back9Score}</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <View style={styles.statIconContainer}>
                  <Zap size={16} color="#FFD700" />
                </View>
                <Text style={styles.statValue}>{stats.eagles}</Text>
                <Text style={styles.statLabel}>Eagles</Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statIconContainer}>
                  <Target size={16} color={colors.success} />
                </View>
                <Text style={styles.statValue}>{stats.birdies}</Text>
                <Text style={styles.statLabel}>Birdies</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.pars}</Text>
                <Text style={styles.statLabel}>Pars</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.bogeys}</Text>
                <Text style={styles.statLabel}>Bogeys</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.doubleBogeys}</Text>
                <Text style={styles.statLabel}>Doubles</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.worseThanDouble}</Text>
                <Text style={styles.statLabel}>Worse</Text>
              </View>
            </View>

            <View style={styles.parBreakdownContainer}>
              <View style={styles.sectionDivider} />
              <Text style={styles.parBreakdownTitle}>Score by Par (This Round)</Text>
              <View style={styles.parBreakdownRow}>
                <View style={styles.parBreakdownItem}>
                  <Text style={styles.parBreakdownLabel}>Par 3s</Text>
                  <Text style={styles.parBreakdownValue}>{formatParTotal(stats.scoreByPar.par3)}</Text>
                </View>
                <View style={styles.parBreakdownItem}>
                  <Text style={styles.parBreakdownLabel}>Par 4s</Text>
                  <Text style={styles.parBreakdownValue}>{formatParTotal(stats.scoreByPar.par4)}</Text>
                </View>
                <View style={styles.parBreakdownItem}>
                  <Text style={styles.parBreakdownLabel}>Par 5s</Text>
                  <Text style={styles.parBreakdownValue}>{formatParTotal(stats.scoreByPar.par5)}</Text>
                </View>
              </View>
            </View>

            {stats.puttsTracked && (
              <View style={styles.additionalStatsContainer}>
                <Text style={styles.additionalStatsTitle}>Additional Stats</Text>
                <View style={styles.additionalStatsRow}>
                  <View style={styles.additionalStatItem}>
                    <Text style={styles.additionalStatValue}>{stats.totalPutts}</Text>
                    <Text style={styles.additionalStatLabel}>Total Putts</Text>
                  </View>

                  <View style={styles.additionalStatItem}>
                    <Text style={styles.additionalStatValue}>
                      {(stats.totalPutts / (round.holeCount ?? 18)).toFixed(1)}
                    </Text>
                    <Text style={styles.additionalStatLabel}>Putts/Hole</Text>
                  </View>
                </View>
              </View>
            )}

            {stats.fairwaysTotal > 0 && (
              <View style={styles.additionalStatsContainer}>
                <View style={styles.additionalStatsRow}>
                  <View style={styles.additionalStatItem}>
                    <Text style={styles.additionalStatValue}>
                      {stats.fairwaysHit}/{stats.fairwaysTotal}
                    </Text>
                    <Text style={styles.additionalStatLabel}>Fairways Hit</Text>
                  </View>

                  <View style={styles.additionalStatItem}>
                    <Text style={styles.additionalStatValue}>
                      {Math.round((stats.fairwaysHit / stats.fairwaysTotal) * 100)}%
                    </Text>
                    <Text style={styles.additionalStatLabel}>Fairway %</Text>
                  </View>

                  <View style={styles.additionalStatItem}>
                    <Text style={styles.additionalStatValue}>{stats.greenInRegulation}/{round.holeCount}</Text>
                    <Text style={styles.additionalStatLabel}>GIR</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.bestWorstContainer}>
              <View style={styles.bestHoleContainer}>
                <View style={styles.bestHoleHeader}>
                  <TrendingDown size={16} color={colors.success} />
                  <Text style={styles.bestHoleTitle}>Best Hole</Text>
                </View>
                <Text style={styles.bestHoleText}>
                  Hole {stats.bestHole.holeNumber}:{" "}
                  {stats.bestHole.relativeToPar < 0
                    ? stats.bestHole.relativeToPar
                    : stats.bestHole.relativeToPar === 0
                      ? "Even"
                      : `+${stats.bestHole.relativeToPar}`}
                </Text>
              </View>

              <View style={styles.worstHoleContainer}>
                <View style={styles.worstHoleHeader}>
                  <TrendingDown
                    size={16}
                    color={colors.error}
                    style={{ transform: [{ rotate: "180deg" }] }}
                  />
                  <Text style={styles.worstHoleTitle}>Worst Hole</Text>
                </View>
                <Text style={styles.worstHoleText}>
                  Hole {stats.worstHole.holeNumber}:{" "}
                  {stats.worstHole.relativeToPar > 0
                    ? `+${stats.worstHole.relativeToPar}`
                    : stats.worstHole.relativeToPar}
                </Text>
              </View>
            </View>

            <View style={styles.scoreDetailsHeader}>
              <Text style={styles.scoreDetailsTitle}>Hole by Hole</Text>
            </View>

            <View style={styles.holeScores}>
              {round.players[index].scores.map((score: { holeNumber: number; strokes: number }) => {
                const hole = course.holes.find((h: { number: number; par?: number }) => h.number === score.holeNumber);
                const relativeToPar = hole ? score.strokes - (hole.par ?? 4) : 0;

                return (
                  <View key={score.holeNumber} style={styles.holeScore}>
                    <Text style={styles.holeNumber}>Hole {score.holeNumber}</Text>
                    <Text
                      style={[
                        styles.holeScoreValue,
                        relativeToPar < 0 ? styles.underPar : relativeToPar > 0 ? styles.overPar : null,
                      ]}
                    >
                      {score.strokes}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {round.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{round.notes}</Text>
          </View>
        )}

        {localPhotos.length > 0 && (
          <View style={[styles.notesContainer, { marginTop: 16 }]}>
            <Text style={styles.notesTitle}>Scorecard Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {localPhotos.map((uri: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.photoThumb}
                  onPress={() => {
                    setActivePhoto(uri);
                    setPhotoModalVisible(true);
                  }}
                >
                  <Image source={{ uri }} style={styles.photoThumbImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.photoModalBackdrop}>
          {activePhoto && (
            <Image source={{ uri: activePhoto }} style={styles.photoModalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.photoCloseButton} onPress={() => setPhotoModalVisible(false)}>
            <Text style={styles.photoCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 24,
  },
  courseName: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  syncBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  syncBadgePending: {
    backgroundColor: "#fff8e1",
    color: "#d58512",
  },
  syncBadgeFailed: {
    backgroundColor: "#ffe5e5",
    color: colors.error,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 6,
  },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  location: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 6,
  },
  winnerContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  winnerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  winnerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 8,
  },
  winnerName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  winnerScore: {
    fontSize: 16,
    color: colors.text,
  },
  winnerNetScore: {
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  playerStatsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  playerNameContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  playerStatsName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  playerTeeInfo: {
    fontSize: 12,
    color: colors.text,
    marginTop: 2,
  },
  scoreOverview: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  scoreItem: {
    marginRight: 24,
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  scoreDiff: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  underPar: {
    color: colors.success,
  },
  overPar: {
    color: colors.error,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  statBox: {
    width: "33%",
    alignItems: "center",
    marginBottom: 16,
  },
  statIconContainer: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text,
  },
  parBreakdownContainer: {
    marginBottom: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  parBreakdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  parBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  parBreakdownItem: {
    flex: 1,
    alignItems: "center",
  },
  parBreakdownLabel: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 4,
  },
  parBreakdownValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  additionalStatsContainer: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  additionalStatsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  additionalStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  additionalStatItem: {
    alignItems: "center",
    flex: 1,
  },
  additionalStatValue: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  additionalStatLabel: {
    fontSize: 12,
    color: colors.text,
  },
  bestWorstContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  bestHoleContainer: {
    flex: 1,
    marginRight: 8,
  },
  bestHoleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  bestHoleTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
    marginLeft: 4,
  },
  bestHoleText: {
    fontSize: 14,
    color: colors.success,
  },
  worstHoleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  worstHoleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  worstHoleTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
    marginLeft: 4,
  },
  worstHoleText: {
    fontSize: 14,
    color: colors.error,
  },
  scoreDetailsHeader: {
    marginBottom: 8,
  },
  scoreDetailsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  holeScores: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  holeScore: {
    width: "33%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingRight: 16,
  },
  holeNumber: {
    fontSize: 14,
    color: colors.text,
  },
  holeScoreValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  notesContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  notesText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  errorText: {
    fontSize: 18,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  errorButton: {
    marginHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButton: {
    padding: 8,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoThumbImage: {
    width: "100%",
    height: "100%",
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalImage: {
    width: "90%",
    height: "80%",
  },
  photoCloseButton: {
    position: "absolute",
    top: 40,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  photoCloseText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginRight: 4,
  },
  headerActionButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});
