import React, { useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from "expo-image";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    ImageBackground,
    Modal,
    Alert,
    Animated,
    Easing,
    Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/constants/colors";
import { Button } from "@/components/Button";
import { getScoreDifferential, getScoreLabel, calculateNetScore, parseAnyDateStringToLocalDate } from "@/utils/helpers";
import { Calendar, MapPin, Award, Target, Zap, ArrowLeftRight, PiggyBank, TrendingDown, Edit3, Trash2, ChevronLeft, ChevronRight, ChevronDown, Camera, Eye, BarChart3, Info } from "lucide-react-native";
import { useMutation, useQuery } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useGolfStore } from "@/store/useGolfStore";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useT } from "@/lib/i18n";
import { buildNassauDisplayModel, NassauDetailTab } from "@/utils/nassauDisplay";

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
    const { id, onboardingMode } = useLocalSearchParams<{ id: string; onboardingMode?: string }>();
    const router = useRouter();
    const isOnboardingMode = onboardingMode === 'true';
    const t = useT();
    const language = useOnboardingStore((s) => s.language);
    const localeForDates = language === "es" ? "es-ES" : "en-US";

    const { rounds: localRounds, courses: localCourses, players: localPlayers, deleteRound: deleteLocalRound } = useGolfStore();
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
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);
    const [activeTab, setActiveTab] = useState<'summary' | 'scorecard' | 'stats'>('summary');
    const [scoreViewMode, setScoreViewMode] = useState<'actual' | 'adjusted'>('actual');
    const [selectedStatsPlayerIndex, setSelectedStatsPlayerIndex] = useState(0);
    const [scoringInfoVisible, setScoringInfoVisible] = useState(false);
    const [playerDetailVisible, setPlayerDetailVisible] = useState(false);
    const [selectedPlayerDetailId, setSelectedPlayerDetailId] = useState<string | null>(null);
    const [settlementDetailVisible, setSettlementDetailVisible] = useState(false);
    const [settlementDetailTab, setSettlementDetailTab] = useState<NassauDetailTab>("payments");
    const [expandedPaymentIndex, setExpandedPaymentIndex] = useState<number | null>(null);
    const [expandedPairKey, setExpandedPairKey] = useState<string | null>(null);

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

    const windowWidth = Dimensions.get("window").width;
    const windowHeight = Dimensions.get("window").height;
    const photoScrollX = useRef(new Animated.Value(0)).current;

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

    const mySessionPlayerId = useMemo(() => {
        if (!linkedSession?.participants) return null as string | null;

        if (profile?._id) {
            const match = linkedSession.participants.find((p: any) => p.userId === profile._id);
            if (match?.playerId) return match.playerId as string;
        }

        const match = linkedSession.participants.find((p: any) =>
            round?.players?.some((rp: any) => rp.isUser && rp.playerId === p.playerId)
        );
        if (match?.playerId) return match.playerId as string;

        if (profile?.name) {
            const nameMatch = linkedSession.participants.find((p: any) => p.name === profile.name);
            if (nameMatch?.playerId) return nameMatch.playerId as string;
        }

        return (round?.players?.find((p: any) => p.isUser)?.playerId as string | undefined) ?? null;
    }, [linkedSession, round, profile]);

    const participantNameById = useMemo(
        () => new Map<string, string>((linkedSession?.participants ?? []).map((p: any) => [String(p.playerId), String(p.name ?? "Player")])),
        [linkedSession?.participants]
    );

    // Log for debugging balance issues
    useEffect(() => {
        if (linkedSession?.settlement?.calculated) {
            console.log('[RoundDetails] Settlement Name:', mySettlementName, 'ProfileId:', profile?._id);
        }
    }, [mySettlementName, linkedSession, profile]);

    const gameOutcome = linkedSession?.gameOutcome as any;
    const nassauDisplayModel = useMemo(
        () => buildNassauDisplayModel({ linkedSession, gameOutcome }),
        [linkedSession, gameOutcome]
    );

    const settlementBreakdownText = useMemo(() => {
        const settlement = linkedSession?.settlement;
        if (!settlement?.calculated) return null;
        if (nassauDisplayModel) {
            const parts = [
                nassauDisplayModel.isRoundRobin
                    ? `Round robin: ${nassauDisplayModel.pairingCount} matchups`
                    : "Head-to-head Nassau",
                `Settled in ${Math.max(0, settlement?.nettedPayments?.length ?? 0)} payment${(settlement?.nettedPayments?.length ?? 0) === 1 ? "" : "s"}`,
            ];
            if (nassauDisplayModel.wagerSummary) {
                parts.push(nassauDisplayModel.wagerSummary);
            }
            return parts.join(" • ");
        }
        const raw = Array.isArray(settlement?.rawTransactions) ? settlement.rawTransactions : [];
        return raw.length > 0 ? "See settlement line items below." : null;
    }, [linkedSession, nassauDisplayModel]);

    const selectedPlayerDetail = useMemo(() => {
        if (!nassauDisplayModel || !selectedPlayerDetailId) return null;
        return nassauDisplayModel.playerDetails.find((p) => p.playerId === selectedPlayerDetailId) ?? null;
    }, [nassauDisplayModel, selectedPlayerDetailId]);

    const settlementData = useMemo(() => {
        const settlement = linkedSession?.settlement;
        if (!settlement?.calculated) return { payments: [] as any[], isV2: false, totalToSettleCents: 0 };
        const isV2 = settlement.settlementVersion === "v2" || settlement.nettedPayments;
        const payments = isV2 ? (settlement.nettedPayments || []) : (settlement.transactions || []);
        const totalToSettleCents = payments.reduce((sum: number, tx: any) => sum + (tx.amountCents || 0), 0);
        return { payments, isV2, totalToSettleCents };
    }, [linkedSession]);

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
    }, [localRound, round, t]);

    const sourceScanUploadedText = useMemo(() => {
        const lr: any = localRound as any;
        const rd: any = round as any;
        const candidate =
            lr?.scorecardPhotosUploadedAt ??
            lr?.updatedAt ??
            lr?.createdAt ??
            rd?.scorecardPhotosUploadedAt ??
            rd?.updatedAt ??
            rd?.createdAt ??
            null;

        if (!candidate) return null;
        const d = new Date(candidate);
        if (Number.isNaN(d.getTime())) return null;
        return t("Uploaded at {{time}}", {
            time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        });
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
        const d = parseAnyDateStringToLocalDate(dateString);
        if (!d) return dateString;
        return d.toLocaleDateString(localeForDates, {
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
                const holes = course.holes ?? [];
                const hole = holes.find((h: { number: number }) => h.number === score.holeNumber);
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

    const standingsSorted = useMemo(() => {
        const sorted = [...playerStats].sort((a, b) => {
            const aScore = a.netScore ?? a.totalScore;
            const bScore = b.netScore ?? b.totalScore;
            if (aScore !== bScore) return aScore - bScore;
            if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
            if (a.playerName !== b.playerName) return a.playerName.localeCompare(b.playerName);
            return (a.playerId ?? "").localeCompare(b.playerId ?? "");
        });
        return sorted;
    }, [playerStats]);

    const verdict = useMemo(() => {
        if (!gameOutcome || gameOutcome.computeStatus !== "complete") return null;
        if (linkedSession?.gameType === "nassau" && nassauDisplayModel?.standingsWinnerText) {
            return {
                winnerLabel: "",
                text: nassauDisplayModel.standingsWinnerText,
                subtext: "Net scoring (strokes applied).",
            };
        }
        return gameOutcome.verdict ?? null;
    }, [gameOutcome, linkedSession?.gameType, nassauDisplayModel]);

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
        if (value === 0) return t("Even");
        return value > 0 ? `+${value}` : `${value}`;
    };

    const formatMoney = (amountCents: number) => `$${(amountCents / 100).toFixed(2)}`;
    const formatSignedMoney = (amountCents: number) => {
        const abs = Math.abs(amountCents);
        const base = formatMoney(abs);
        if (amountCents > 0) return `+${base}`;
        if (amountCents < 0) return `-${base}`;
        return base;
    };

    const formatContributionLabel = (contribution: any) => {
        const category = contribution?.category ?? {};
        const pairingId = typeof category.pairingId === "string" ? category.pairingId : "";
        const [left, right] = pairingId.includes("_vs_") ? pairingId.split("_vs_") : [null, null];
        const leftName = left ? participantNameById.get(left) ?? "Player" : null;
        const rightName = right ? participantNameById.get(right) ?? "Player" : null;
        const pairLabel = leftName && rightName ? `${leftName} vs ${rightName}` : null;
        const segmentLabel =
            category.segment === "front" ? "Front 9" :
                category.segment === "back" ? "Back 9" :
                    category.segment === "overall" ? "Overall" : null;
        const label = typeof category.label === "string" ? category.label : "Nassau";
        const context = [segmentLabel, pairLabel].filter(Boolean).join(" • ");
        return context ? `${label} (${context})` : label;
    };

    const formatSegmentName = (segment: string) =>
        segment === "front" ? "Front 9" : segment === "back" ? "Back 9" : segment === "overall" ? "Overall" : segment;

    const handleDeleteRound = () => {
        Alert.alert(t("Delete Round"), t("Are you sure you want to delete this round?"), [
            { text: t("Cancel"), style: "cancel" },
            {
                text: t("Delete"),
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
                        Alert.alert(t("Error"), t("Could not delete round. Please try again."));
                    }
                },
            },
        ]);
    };

    const displayName = course.name;

    if (!round) {
        const isLoading = roundFromConvex === undefined && !localRound;
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                    locations={[0.3, 0.8, 1]}
                    style={StyleSheet.absoluteFill}
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
                    <View style={styles.loadingContainer}>
                        <Text style={styles.errorText}>{t("Round not found")}</Text>
                        <Button title={t("Go Back")} onPress={() => router.back()} style={styles.errorButton} />
                    </View>
                )}
            </View>
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
                // "Scandicap" on the edit screen should show handicap index (users/players.handicap),
                // not this round's course handicap ("handicapUsed") which is used for net scoring.
                handicap: (() => {
                    const storedIndex = (p as any).handicapIndex;
                    if (typeof storedIndex === "number") return storedIndex;
                    const isSelf = !!((p as any).isUser ?? (p as any).isSelf);
                    const storePlayer = localPlayers.find((sp) => sp.id === p.playerId);
                    const profileHandicap = (profile as any)?.handicap;
                    const candidate = isSelf ? (profileHandicap ?? storePlayer?.handicap) : storePlayer?.handicap;
                    return typeof candidate === "number" ? candidate : undefined;
                })(),
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
        <View style={{ flex: 1 }}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0.3, 0.8, 1]}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.container} edges={["bottom"]}>
                <Stack.Screen
                    options={{
                        title: t("Round Details"),
                        headerStyle: { backgroundColor: colors.background },
                        headerTitleStyle: { color: colors.text },
                        headerTintColor: colors.text,
                        // Hide back button during onboarding to prevent users from exiting the flow
                        headerLeft: isOnboardingMode ? () => null : () => (
                            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 0, paddingRight: 16 }} hitSlop={16}>
                                <ChevronLeft size={28} color={colors.primary} />
                            </TouchableOpacity>
                        ),
                        // Hide edit/delete buttons during onboarding
                        headerRight: isOnboardingMode ? () => null : () => (
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
                    {/* Hero Image Card - replaces old text header */}
                    <View style={styles.heroImageContainer}>
                        <ImageBackground
                            source={{ uri: (round as any)?.courseImageUrl || courseFromStore?.imageUrl || 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800' }}
                            style={styles.heroImage}
                            imageStyle={styles.heroImageRounded}
                        >
                            <View style={styles.heroOverlay}>
                                <Text style={styles.heroCourseName}>{displayName}</Text>
                                <View style={styles.heroDateRow}>
                                    <Calendar size={14} color="#FFFFFF" />
                                    <Text style={styles.heroDate}>{formatDate(round.date)}</Text>
                                </View>
                            </View>
                        </ImageBackground>
                        {syncStatus !== "synced" && (
                            <View style={styles.syncBadgeContainer}>
                                <Text
                                    style={[
                                        styles.syncBadge,
                                        syncStatus === "failed" ? styles.syncBadgeFailed : styles.syncBadgePending,
                                    ]}
                                >
                                    {syncStatus === "pending" ? t("Pending sync") : t("Sync failed")}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Tab Bar */}
                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'summary' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('summary')}
                        >
                            <Text style={[styles.tabButtonText, activeTab === 'summary' && styles.tabButtonTextActive]}>
                                {t("Summary")}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'scorecard' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('scorecard')}
                        >
                            <Text style={[styles.tabButtonText, activeTab === 'scorecard' && styles.tabButtonTextActive]}>
                                {t("Scorecard")}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'stats' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('stats')}
                        >
                            <Text style={[styles.tabButtonText, activeTab === 'stats' && styles.tabButtonTextActive]}>
                                {t("Stats")}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Summary Tab Content */}
                    {activeTab === 'summary' && (
                        <View style={styles.summaryContainer}>
                            {/* Final Standings Section */}
                            <View style={styles.standingsBlock}>
                                <View style={styles.sectionHeaderRow}>
                                    <Text style={styles.standingsSectionTitle}>{t("Final Standings")}</Text>
                                    {linkedSession?.gameType && (
                                        <View style={styles.gameTypeBadge}>
                                            <Text style={styles.gameTypeBadgeText}>
                                                {linkedSession.gameType === 'stroke_play' ? t('Stroke Play') :
                                                    linkedSession.gameType === 'match_play' ? t('Match Play') :
                                                        linkedSession.gameType === 'nassau' ? t('Nassau') :
                                                            linkedSession.gameType === 'skins' ? t('Skins') :
                                                                linkedSession.gameType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {verdict && (
                                    <View style={styles.verdictRow}>
                                        <View style={styles.verdictTextWrap}>
                                            <Text style={styles.verdictText}>
                                                {verdict.winnerLabel ? <Text style={styles.verdictWinner}>{verdict.winnerLabel} </Text> : null}
                                                <Text style={styles.verdictBody}>{verdict.text}</Text>
                                                {verdict.subtext ? <Text style={styles.verdictSubtext}> {verdict.subtext}</Text> : null}
                                            </Text>
                                        </View>
                                        {linkedSession?.gameType === "nassau" && (
                                            <TouchableOpacity
                                                style={styles.inlineInfoButton}
                                                onPress={() => setScoringInfoVisible(true)}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <Info size={14} color="#005953" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                <View style={styles.standingsCard}>
                                    {/* Leaderboard Table Header */}
                                    <View style={styles.leaderboardHeader}>
                                        <Text style={[styles.leaderboardHeaderCell, { flex: 6, textAlign: 'left' }]}>{t("PLAYER")}</Text>
                                        <Text style={[styles.leaderboardHeaderCell, { flex: 3 }]}>
                                            {linkedSession?.gameType === "nassau" && nassauDisplayModel
                                                ? nassauDisplayModel.standingsColumns.metricA
                                                : gameOutcome?.computeStatus === "complete" && gameOutcome?.standings?.columns?.metricA?.label
                                                    ? String(gameOutcome.standings.columns.metricA.label).toUpperCase()
                                                    : t("GROSS")}
                                        </Text>
                                        <Text style={[styles.leaderboardHeaderCell, { flex: 3 }]}>
                                            {linkedSession?.gameType === "nassau" && nassauDisplayModel
                                                ? nassauDisplayModel.standingsColumns.metricB
                                                : gameOutcome?.computeStatus === "complete" && gameOutcome?.standings?.columns?.metricB?.label
                                                    ? String(gameOutcome.standings.columns.metricB.label).toUpperCase()
                                                    : t("NET")}
                                        </Text>
                                        {/* Spacer matching chevron width in data rows */}
                                        {nassauDisplayModel && <View style={{ width: 20 }} />}
                                    </View>

                                    {/* Leaderboard Rows */}
                                    {(() => {
                                        if (gameOutcome && gameOutcome.computeStatus !== "complete") {
                                            return (
                                                <View style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
                                                    <Text style={styles.verdictSubtext}>
                                                        {gameOutcome.statusMessage ?? t("Standings available after the round is complete.")}
                                                    </Text>
                                                </View>
                                            );
                                        }

                                        if (gameOutcome?.computeStatus === "complete" && Array.isArray(gameOutcome?.standings?.rows)) {
                                            return gameOutcome.standings.rows.map((row: any, index: number) => {
                                                const isWinner = !!row.isWinner;
                                                const rankLabel = row.placement ?? "--";

                                                const rowCanOpenDetail = !!(nassauDisplayModel && row.sideId);
                                                const openRowDetail = () => {
                                                    if (!rowCanOpenDetail) return;
                                                    setSelectedPlayerDetailId(String(row.sideId));
                                                    setPlayerDetailVisible(true);
                                                };

                                                return (
                                                    <TouchableOpacity
                                                        key={row.sideId || row.label || index}
                                                        activeOpacity={rowCanOpenDetail ? 0.85 : 1}
                                                        onPress={openRowDetail}
                                                        style={[
                                                            styles.leaderboardRow,
                                                            isWinner && styles.leaderboardRowWinner,
                                                            index === (gameOutcome.standings.rows.length - 1) && { borderBottomWidth: 0 }
                                                        ]}
                                                    >
                                                        {isWinner && <View style={styles.leaderboardWinnerAccent} />}

                                                        <View style={[styles.leaderboardCell, { flex: 6, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }]}>
                                                            <View style={[
                                                                styles.positionBadge,
                                                                isWinner && styles.positionBadgeWinner
                                                            ]}>
                                                                <Text style={[
                                                                    styles.positionBadgeText,
                                                                    isWinner && styles.positionBadgeTextWinner
                                                                ]}>{rankLabel}</Text>
                                                            </View>
                                                            <View style={{ flex: 1, overflow: 'hidden' }}>
                                                                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.playerNameText, isWinner && styles.playerNameTextWinner]}>
                                                                    {row.label}
                                                                    {mySessionPlayerId && row.sideId === mySessionPlayerId ? (
                                                                        <Text style={styles.youLabel}> ({t("You")})</Text>
                                                                    ) : null}
                                                                </Text>
                                                                {row.winnerBadge ? <Text style={styles.winnerLabel}>{row.winnerBadge}</Text> : null}
                                                            </View>
                                                        </View>

                                                        <View style={[styles.leaderboardCell, styles.leaderboardNumericCell, { flex: 3 }]}>
                                                            <Text style={[styles.scoreText, isWinner && { fontWeight: '700' }]}>{row.metricA?.display ?? '--'}</Text>
                                                        </View>

                                                        <View style={[styles.leaderboardCell, styles.leaderboardNumericCell, { flex: 3 }]}>
                                                            <Text style={[styles.netScoreText, isWinner && { color: '#F46C3A', fontSize: 18 }]}>
                                                                {row.metricB?.display ?? '--'}
                                                            </Text>
                                                        </View>
                                                        <View style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}>
                                                            {rowCanOpenDetail && (
                                                                <ChevronRight size={14} color="rgba(0, 89, 83, 0.3)" />
                                                            )}
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            });
                                        }

                                        if (standingsSorted.length === 0) return null;

                                        const bestScore = standingsSorted[0].netScore ?? standingsSorted[0].totalScore;
                                        const tieForFirstCount = standingsSorted.filter(
                                            (p) => (p.netScore ?? p.totalScore) === bestScore
                                        ).length;
                                        const hasTieForFirst = tieForFirstCount > 1;

                                        return standingsSorted.map((stats, index) => {
                                            const scoreKey = stats.netScore ?? stats.totalScore;
                                            const uniqueLowerScores = new Set(
                                                standingsSorted
                                                    .map((p) => p.netScore ?? p.totalScore)
                                                    .filter((s) => s < scoreKey)
                                            );
                                            const rank = uniqueLowerScores.size + 1;
                                            const tieCount = standingsSorted.filter(
                                                (p) => (p.netScore ?? p.totalScore) === scoreKey
                                            ).length;
                                            const rankLabel = tieCount > 1 ? `T${rank}` : `${rank}`;

                                            const isWinner = rank === 1 && !hasTieForFirst;

                                            return (
                                                <View
                                                    key={stats.playerId || index}
                                                    style={[
                                                        styles.leaderboardRow,
                                                        isWinner && styles.leaderboardRowWinner,
                                                        index === playerStats.length - 1 && { borderBottomWidth: 0 }
                                                    ]}
                                                >
                                                    {isWinner && <View style={styles.leaderboardWinnerAccent} />}

                                                    {/* Player Column (includes position badge and name) */}
                                                    <View style={[styles.leaderboardCell, { flex: 6, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }]}>
                                                        <View style={[
                                                            styles.positionBadge,
                                                            isWinner && styles.positionBadgeWinner
                                                        ]}>
                                                            <Text style={[
                                                                styles.positionBadgeText,
                                                                isWinner && styles.positionBadgeTextWinner
                                                            ]}>{rankLabel}</Text>
                                                        </View>
                                                        <View style={{ flex: 1, overflow: 'hidden' }}>
                                                            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.playerNameText, isWinner && styles.playerNameTextWinner]}>
                                                                {stats.playerName}
                                                                {mySessionPlayerId && stats.playerId === mySessionPlayerId ? (
                                                                    <Text style={styles.youLabel}> ({t("You")})</Text>
                                                                ) : null}
                                                            </Text>
                                                            {isWinner && <Text style={styles.winnerLabel}>{t("WINNER")}</Text>}
                                                        </View>
                                                    </View>

                                                    {/* Gross */}
                                                    <View style={[styles.leaderboardCell, styles.leaderboardNumericCell, { flex: 3 }]}>
                                                        <Text style={[styles.scoreText, isWinner && { fontWeight: '700' }]}>{stats.totalScore}</Text>
                                                    </View>

                                                    {/* Net */}
                                                    <View style={[styles.leaderboardCell, styles.leaderboardNumericCell, { flex: 3 }]}>
                                                        <Text style={[styles.netScoreText, isWinner && { color: '#F46C3A', fontSize: 18 }]}>
                                                            {stats.netScore ?? '--'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        });
                                    })()}
                                </View>
                            </View>

                            {/* 
                            COMMENTED OUT: Round Highlights Section - Will be reactivated with a different setup
                            {winner && (
                                <View style={styles.highlightsSection}>
                                    <Text style={styles.standingsSectionTitle}>Round Highlights</Text>
                                    <View style={styles.highlightCard}>
                                        <View style={styles.highlightIconContainer}>
                                            <Award size={20} color="#FFD700" />
                                        </View>
                                        <View style={styles.highlightContent}>
                                            <Text style={styles.highlightLabel}>TOP PERFORMER</Text>
                                            <Text style={styles.highlightValue}>{winner.playerName}</Text>
                                            ... explanations removed for now ...
                                        </View>
                                    </View>
                                </View>
                            )}
                            */}


                            {linkedSession?.settlement?.calculated && settlementData.payments.length > 0 && (
                                <View style={styles.settlementsBlock}>
                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.standingsSectionTitle}>{t("Settlement")}</Text>
                                        {settlementData.totalToSettleCents > 0 ? (
                                            <Text style={styles.totalPotText}>
                                                {`Total to settle: ${formatMoney(settlementData.totalToSettleCents)}`}
                                            </Text>
                                        ) : null}
                                    </View>

                                    <View style={styles.settlementsCard}>
                                        {settlementBreakdownText && (
                                            <View style={styles.settlementBreakdown}>
                                                <Text style={styles.settlementBreakdownText}>{settlementBreakdownText}</Text>
                                            </View>
                                        )}
                                        {nassauDisplayModel ? (
                                            <TouchableOpacity
                                                style={styles.settlementDetailButton}
                                                onPress={() => {
                                                    setSettlementDetailTab("payments");
                                                    setSettlementDetailVisible(true);
                                                }}
                                            >
                                                <Text style={styles.settlementDetailButtonText}>
                                                    {`View details • ${nassauDisplayModel.pairwiseSettlements.length} pairings • ${nassauDisplayModel.totalLineItems} line items`}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {settlementData.payments.map((tx: any, idx: number) => {
                                            const fromName = participantNameById.get(String(tx.fromPlayerId)) || t("Unknown");
                                            const toName = participantNameById.get(String(tx.toPlayerId)) || t("Unknown");
                                            const amountCents = typeof tx.amountCents === "number" ? tx.amountCents : 0;
                                            const isPositiveForMe = mySessionPlayerId
                                                ? String(tx.toPlayerId) === String(mySessionPlayerId)
                                                : toName === mySettlementName;
                                            const contributionCount = Array.isArray(tx.allocatedContributions) ? tx.allocatedContributions.length : 0;
                                            const reason =
                                                contributionCount > 0
                                                    ? `${contributionCount} line item${contributionCount === 1 ? "" : "s"}`
                                                    : (tx.breakdown || tx.reason || t("Game settlement"));
                                            const isExpanded = expandedPaymentIndex === idx;

                                            return (
                                                <TouchableOpacity
                                                    key={idx}
                                                    activeOpacity={0.9}
                                                    onPress={() => setExpandedPaymentIndex((prev) => (prev === idx ? null : idx))}
                                                    style={[
                                                        styles.settlementCard,
                                                        isPositiveForMe && styles.settlementCardPositive,
                                                        idx === settlementData.payments.length - 1 && { borderBottomWidth: 0 },
                                                    ]}
                                                >
                                                    <View style={styles.settlementCardTopRow}>
                                                        <View style={styles.settlementCardLeft}>
                                                            <View style={[styles.settlementIcon, isPositiveForMe ? styles.settlementIconPositive : styles.settlementIconNegative]}>
                                                                {isPositiveForMe ? (
                                                                    <PiggyBank size={18} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                                                                ) : (
                                                                    <ArrowLeftRight size={16} color="#005953" />
                                                                )}
                                                            </View>
                                                            <View style={styles.settlementNamesWrap}>
                                                                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.settlementNames}>
                                                                    <Text style={{ fontWeight: '700' }}>{fromName}</Text>
                                                                    <Text style={{ color: 'rgba(0, 89, 83, 0.6)', fontWeight: '400' }}> {t("owes")} </Text>
                                                                    <Text style={{ fontWeight: '700' }}>{toName}</Text>
                                                                </Text>
                                                                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.settlementReason}>
                                                                    {reason}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={[styles.settlementAmount, isPositiveForMe && styles.settlementAmountPositive]}>
                                                                {isPositiveForMe ? '+' : ''}{formatMoney(amountCents)}
                                                            </Text>
                                                            {contributionCount > 0 && (
                                                                <ChevronDown size={14} color="rgba(0, 89, 83, 0.3)" style={isExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
                                                            )}
                                                        </View>
                                                    </View>
                                                    {isExpanded && Array.isArray(tx.allocatedContributions) && tx.allocatedContributions.length > 0 ? (
                                                        <View style={styles.settlementContributionList}>
                                                            {tx.allocatedContributions.map((contrib: any, contribIndex: number) => (
                                                                <View key={`${idx}:${contribIndex}`} style={styles.settlementContributionRow}>
                                                                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.settlementContributionLabel}>
                                                                        {formatContributionLabel(contrib)}
                                                                    </Text>
                                                                    <Text style={styles.settlementContributionAmount}>
                                                                        {formatMoney(contrib?.allocatedCents ?? 0)}
                                                                    </Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    ) : null}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* 
                            COMMENTED OUT: Winner Details - Will be reactivated with a different setup
                            {winner && !linkedSession?.settlement?.calculated && (
                                <View style={styles.winnerDetailsCard}>
                                    <View style={styles.winnerDetailsHeader}>
                                        <Award size={18} color="#FFD700" />
                                        <Text style={styles.winnerDetailsTitle}>Top Performer</Text>
                                    </View>
                                    <Text style={styles.winnerDetailsName}>{winner.playerName}</Text>
                                    {winner.handicapUsed !== undefined ? (
                                        <Text style={styles.winnerDetailsScore}>
                                            Net Score: {winner.totalScore - winner.handicapUsed} (HCP {winner.handicapUsed})
                                        </Text>
                                    ) : (
                                        <Text style={styles.winnerDetailsScore}>
                                            Gross Score: {winner.totalScore} (...)
                                        </Text>
                                    )}
                                </View>
                            )}
                            */}

                            {/* Quick Notes */}
                            {localRound?.notes && (
                                <View style={styles.quickNotesSection}>
                                    <Text style={styles.standingsSectionTitle}>{t("Quick Notes")}</Text>
                                    <View style={styles.notesCard}>
                                        <Text style={styles.notesCardText}>{localRound.notes}</Text>
                                    </View>
                                </View>
                            )}

                            {/* Source Scan / Photos - Redesigned to match reference */}
                            {localPhotos.length > 0 && (
                                <View style={styles.sourceScanSection}>
                                    <Text style={[styles.standingsSectionTitle, { marginBottom: 12 }]}>{t("Source Scan")}</Text>
                                    <View style={styles.sourceScanCard}>
                                        <View style={styles.sourceScanCardInner}>
                                            <TouchableOpacity
                                                style={styles.sourceScanThumbnail}
                                                onPress={() => {
                                                    photoScrollX.setValue(0);
                                                    setActivePhotoIndex(0);
                                                    setPhotoModalVisible(true);
                                                }}
                                            >
                                                <Image source={{ uri: localPhotos[0] }} style={styles.sourceScanThumbnailImage} />
                                            </TouchableOpacity>
                                            <View style={styles.sourceScanContent}>
                                                <Text style={styles.sourceScanTitle}>{t("Original Scorecard")}</Text>
                                                <Text style={styles.sourceScanSubtitle}>
                                                    {sourceScanUploadedText ?? t('Uploaded')}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.sourceScanViewButton}
                                                onPress={() => {
                                                    photoScrollX.setValue(0);
                                                    setActivePhotoIndex(0);
                                                    setPhotoModalVisible(true);
                                                }}
                                            >
                                                <Eye size={16} color="#005953" strokeWidth={2.5} />
                                                <Text style={styles.sourceScanViewButtonText}>{t("View")}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* View Detailed Stats Button */}
                            <TouchableOpacity
                                style={styles.viewStatsButton}
                                onPress={() => setActiveTab('stats')}
                            >
                                <BarChart3 size={18} color="#FFFFFF" />
                                <Text style={styles.viewStatsButtonText}>{t("View Detailed Stats")}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Scorecard Tab */}
                    {activeTab === 'scorecard' && (
                        <View style={styles.tabContent}>
                            <View style={styles.scorecardHeader}>
                                <Text style={styles.sectionTitle}>{t("Scorecard")}</Text>
                                <View style={styles.scorecardHeaderRight}>
                                    <TouchableOpacity
                                        style={styles.adjustedInfoButton}
                                        onPress={() => {
                                            Alert.alert(
                                                t("Actual vs Adjusted"),
                                                t("Adjusted is for handicap posting (WHS Net Double Bogey caps). It can be lower than your gross.\n\nNet score in the Stats tab is different: Gross − Course Handicap."),
                                            );
                                        }}
                                    >
                                        <Info size={16} color="#005953" />
                                    </TouchableOpacity>
                                    <View style={styles.scoreViewToggle}>
                                        <TouchableOpacity
                                            style={[styles.scoreViewOption, scoreViewMode === 'actual' && styles.scoreViewOptionActive]}
                                            onPress={() => setScoreViewMode('actual')}
                                        >
                                            <Text style={[styles.scoreViewText, scoreViewMode === 'actual' && styles.scoreViewTextActive]}>{t("Actual")}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.scoreViewOption, scoreViewMode === 'adjusted' && styles.scoreViewOptionActive]}
                                            onPress={() => setScoreViewMode('adjusted')}
                                        >
                                            <Text style={[styles.scoreViewText, scoreViewMode === 'adjusted' && styles.scoreViewTextActive]}>{t("Adjusted")}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* Multi-player Scorecard Grid */}
                            <View style={styles.scorecardGrid}>
                                {/* Header Row */}
                                <View style={styles.scorecardRow}>
                                    <View style={[styles.scorecardCell, styles.scorecardHoleHeaderCell, { width: 50 }]}>
                                        <Text style={styles.scorecardHoleHeaderText}>{t("HOLE")}</Text>
                                    </View>
                                    <View style={[styles.scorecardCell, styles.scorecardParHeaderCell, { width: 45 }]}>
                                        <Text style={styles.scorecardParHeaderText}>{t("PAR")}</Text>
                                    </View>
                                    {round.players.map((p: any, idx: number) => (
                                        <Text key={p.playerId || idx} style={[styles.scorecardCell, styles.scorecardHeaderCell, styles.scorecardPlayerCell]}>
                                            {p.playerName?.split(' ')[0] || t("Player")}
                                        </Text>
                                    ))}
                                </View>

                                {/* Hole Rows */}
                                {Array.from({ length: roundHoleCount }, (_, i) => i + 1).map((holeNum) => {
                                    const hole = (course.holes ?? []).find((h: any) => h.number === holeNum);
                                    const par = hole?.par ?? 4;
                                    return (
                                        <View key={holeNum} style={styles.scorecardRow}>
                                            <View style={[styles.scorecardCell, styles.scorecardHoleCell, { width: 50 }]}>
                                                <Text style={styles.scorecardHoleCellText}>{holeNum}</Text>
                                            </View>
                                            <View style={[styles.scorecardCell, styles.scorecardParCell, { width: 45 }]}>
                                                <Text style={styles.scorecardParCellText}>{par}</Text>
                                            </View>
                                            {round.players.map((p: any, idx: number) => {
                                                const score = p.scores?.find((s: any) => s.holeNumber === holeNum);
                                                const actualStrokes = score?.strokes ?? '-';
                                                const adjustedStrokes = score?.adjustedScore ?? actualStrokes;
                                                const strokes = scoreViewMode === 'adjusted' && score?.adjustedScore !== undefined
                                                    ? adjustedStrokes
                                                    : actualStrokes;
                                                const adjustment = typeof actualStrokes === 'number' && typeof adjustedStrokes === 'number'
                                                    ? adjustedStrokes - actualStrokes
                                                    : 0;
                                                const relativeToPar = typeof strokes === 'number' ? strokes - par : 0;
                                                return (
                                                    <View key={p.playerId || idx} style={[styles.scorecardCell, styles.scorecardPlayerCell]}>
                                                        <View style={styles.scorecardScoreWrapper}>
                                                            {scoreViewMode === 'adjusted' && adjustment !== 0 ? (
                                                                <Text style={styles.scorecardAdjustmentInline}>
                                                                    {adjustment}
                                                                </Text>
                                                            ) : (
                                                                <View style={styles.scorecardAdjustmentInlinePlaceholder} />
                                                            )}
                                                            <View style={[
                                                                styles.scorecardScoreBadge,
                                                                relativeToPar < 0 && styles.scorecardBirdie,
                                                                relativeToPar > 0 && styles.scorecardBogey,
                                                            ]}>
                                                                <Text style={[
                                                                    styles.scorecardScoreText,
                                                                    relativeToPar < 0 && styles.scorecardBirdieText,
                                                                    relativeToPar > 0 && styles.scorecardBogeyText,
                                                                ]}>
                                                                    {strokes}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })}

                                {/* Total Row */}
                                <View style={[styles.scorecardRow, styles.scorecardTotalRow]}>
                                    <View style={[styles.scorecardCell, styles.scorecardHoleCell, styles.scorecardTotalHoleCell, { width: 50 }]}>
                                        <Text style={styles.scorecardTotalHoleText}>{t("Total")}</Text>
                                    </View>
                                    <View style={[styles.scorecardCell, styles.scorecardParCell, { width: 45 }]}>
                                        <Text style={styles.scorecardParCellText}>
                                            {(course.holes ?? []).slice(0, roundHoleCount).reduce((sum: number, h: any) => sum + (h.par ?? 4), 0)}
                                        </Text>
                                    </View>
                                    {round.players.map((p: any, idx: number) => (
                                        <View key={p.playerId || idx} style={[styles.scorecardCell, styles.scorecardPlayerCell]}>
                                            {(() => {
                                                const actualTotal = p.totalScore;
                                                if (scoreViewMode !== 'adjusted') {
                                                    return (
                                                        <Text style={styles.scorecardTotalCell}>{actualTotal}</Text>
                                                    );
                                                }

                                                const scoresByHole = new Map<number, any>(
                                                    (p.scores ?? []).map((s: any) => [s.holeNumber, s])
                                                );

                                                let adjustedTotal = 0;
                                                for (let holeNum = 1; holeNum <= roundHoleCount; holeNum++) {
                                                    const score = scoresByHole.get(holeNum);
                                                    const adjusted = score?.adjustedScore;
                                                    const strokes = score?.strokes;
                                                    const value = typeof adjusted === 'number'
                                                        ? adjusted
                                                        : typeof strokes === 'number'
                                                            ? strokes
                                                            : null;
                                                    if (value === null) {
                                                        return (
                                                            <Text style={styles.scorecardTotalCell}>{actualTotal}</Text>
                                                        );
                                                    }
                                                    adjustedTotal += value;
                                                }

                                                const adjustment = adjustedTotal - actualTotal;

                                                return (
                                                    <View style={styles.scorecardTotalWrapper}>
                                                        {adjustment !== 0 ? (
                                                            <Text style={styles.scorecardAdjustmentInline}>
                                                                {adjustment}
                                                            </Text>
                                                        ) : (
                                                            <View style={styles.scorecardAdjustmentInlinePlaceholder} />
                                                        )}
                                                        <Text style={styles.scorecardTotalCell}>{adjustedTotal}</Text>
                                                    </View>
                                                );
                                            })()}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Stats Tab */}
                    {activeTab === 'stats' && (() => {
                        const stats = playerStats[selectedStatsPlayerIndex] || playerStats[0];
                        if (!stats) return null;
                        const vsPar = totalPar > 0 ? stats.totalScore - totalPar : 0;
                        const birdieCount = stats.birdies + stats.eagles;
                        const otherCount = stats.doubleBogeys + stats.worseThanDouble;
                        const maxCount = Math.max(birdieCount, stats.pars, stats.bogeys, otherCount, 1);
                        const barMaxHeight = 120;
                        const scoreCounts = [
                            { label: 'Birdie', count: birdieCount },
                            { label: 'Par', count: stats.pars },
                            { label: 'Bogey', count: stats.bogeys },
                            { label: 'Other', count: otherCount },
                        ];
                        const mostCommon = scoreCounts.reduce((a, b) => a.count >= b.count ? a : b);

                        // Calculate actual par hole counts from course data
                        const courseHoles = (course.holes ?? []).slice(0, roundHoleCount);
                        const par3Count = courseHoles.filter((h: any) => h.par === 3).length;
                        const par4Count = courseHoles.filter((h: any) => h.par === 4).length;
                        const par5Count = courseHoles.filter((h: any) => h.par === 5).length;

                        // Calculate averages for each par type
                        const par3Avg = par3Count > 0 ? (3 + stats.scoreByPar.par3 / par3Count).toFixed(1) : '—';
                        const par4Avg = par4Count > 0 ? (4 + stats.scoreByPar.par4 / par4Count).toFixed(1) : '—';
                        const par5Avg = par5Count > 0 ? (5 + stats.scoreByPar.par5 / par5Count).toFixed(1) : '—';

                        return (
                            <View style={styles.statsTabContainer}>
                                {/* Player Selector (only show if multiple players) */}
                                {playerStats.length > 1 && (
                                    <View style={styles.statsPlayerSelector}>
                                        <Text style={styles.statsPlayerLabel}>{t("Viewing stats for:")}</Text>
                                        <View style={styles.statsPlayerDropdown}>
                                            {playerStats.map((p, idx) => (
                                                <TouchableOpacity
                                                    key={p.playerId || idx}
                                                    style={[styles.statsPlayerOption, selectedStatsPlayerIndex === idx && styles.statsPlayerOptionActive]}
                                                    onPress={() => setSelectedStatsPlayerIndex(idx)}
                                                >
                                                    <Text style={[styles.statsPlayerOptionText, selectedStatsPlayerIndex === idx && styles.statsPlayerOptionTextActive]}>
                                                        {p.playerName?.split(' ')[0] || t("Player")}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* Score Boxes Row - Two separate cards */}
                                <View style={styles.statsScoreBoxesRow}>
                                    <View style={[styles.statsGrossBox, { backgroundColor: '#FFFFFF', borderColor: '#E6E4DF', borderWidth: 1, shadowColor: '#005953', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20 }]}>
                                        <Text style={[styles.statsGrossLabel, { color: 'rgba(0, 89, 83, 0.6)' }]}>{t("GROSS SCORE")}</Text>
                                        <View style={styles.statsGrossScoreRow}>
                                            <View style={{ position: 'relative' }}>
                                                <Text style={styles.statsGrossScore}>{stats.totalScore}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.statsGrossParText}>
                                            {vsPar === 0
                                                ? t("Even")
                                                : vsPar > 0
                                                    ? t("{{count}} over par", { count: vsPar })
                                                    : t("{{count}} under par", { count: Math.abs(vsPar) })}
                                        </Text>
                                    </View>
                                    <View style={[styles.statsHcpBox, { backgroundColor: '#005953', shadowColor: '#005953', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20 }]}>
                                        <Text style={[styles.statsHcpLabel, { color: 'rgba(255, 255, 255, 0.8)' }]}>{t("NET SCORE")}</Text>
                                        <Text style={[styles.statsHcpValue, { color: '#F5F6F1' }]}>
                                            {stats.netScore ?? '--'}
                                        </Text>
                                    </View>
                                </View>

                                {/* Scoring Distribution - Redesigned with wider bars */}
                                <View style={[styles.statsCard, { shadowColor: '#005953', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20 }]}>
                                    <View style={styles.statsDistHeader}>
                                        <Text style={styles.statsCardTitle}>{t("Scoring Distribution")}</Text>
                                        <View style={styles.statsDistBadge}>
                                            <Text style={styles.statsDistBadgeText}>{t("{{count}} Holes", { count: roundHoleCount })}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.statsDistributionWide}>
                                        {[
                                            { label: t("Birdie"), count: birdieCount, color: '#005953' },    // Brand Green
                                            { label: t("Par"), count: stats.pars, color: 'rgba(0, 89, 83, 0.4)' },      // Brand Green / 40
                                            { label: t("Bogey"), count: stats.bogeys, color: 'rgba(244, 108, 58, 0.4)' },    // Brand Orange / 40
                                            { label: t("Other"), count: otherCount, color: '#F46C3A' },      // Brand Orange
                                        ].map((item) => (
                                            <View key={item.label} style={styles.statsDistItemWide}>
                                                <View style={styles.statsDistBarContainerWide}>
                                                    <Text style={[styles.statsDistCountLabel, item.count === 0 && { opacity: 0 }]}>{item.count}</Text>
                                                    <View style={[
                                                        styles.statsDistBarWide,
                                                        {
                                                            backgroundColor: item.color,
                                                            height: Math.max(8, (item.count / maxCount) * barMaxHeight),
                                                            borderTopLeftRadius: 8,
                                                            borderTopRightRadius: 8,
                                                            borderBottomLeftRadius: 2,
                                                            borderBottomRightRadius: 2
                                                        }
                                                    ]} />
                                                </View>
                                                <Text style={styles.statsDistLabelWide}>{item.label}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    <View style={styles.statsDistFooter}>
                                        <View style={styles.statsDistSeparator} />
                                        <Text style={styles.statsDistFooterText}>
                                            {t("Most common score:")}{" "}
                                            <Text style={styles.statsDistFooterBold}>
                                                {mostCommon.label} ({mostCommon.count})
                                            </Text>
                                        </Text>
                                    </View>
                                </View>

                                {/* Performance by Par - Title outside, 3 separate cards */}
                                <View style={styles.statsPerformanceSection}>
                                    <Text style={styles.statsPerformanceTitle}>{t("Performance by Par")}</Text>
                                    <View style={styles.statsParCardsRow}>
                                        {/* PAR 3 Card */}
                                        <View style={[styles.statsParCard, { overflow: 'hidden', padding: 16 }]}>
                                            <View style={[
                                                styles.statsParCorner,
                                                { backgroundColor: stats.scoreByPar.par3 > 0 ? 'rgba(244, 108, 58, 0.1)' : 'rgba(0, 89, 83, 0.1)' }
                                            ]}>
                                                {stats.scoreByPar.par3 === 0 ? (
                                                    <Text style={{ fontSize: 16, color: '#005953' }}>—</Text>
                                                ) : (
                                                    <TrendingDown
                                                        size={16}
                                                        color={stats.scoreByPar.par3 > 0 ? '#F46C3A' : '#005953'}
                                                        style={stats.scoreByPar.par3 <= 0 ? { transform: [{ rotate: '180deg' }] } : {}}
                                                    />
                                                )}
                                            </View>
                                            <Text style={styles.statsParCardLabel}>{t("PAR 3")}</Text>
                                            <Text style={styles.statsParCardAvg}>
                                                {par3Avg}
                                            </Text>
                                            <Text style={[styles.statsParCardTotal, stats.scoreByPar.par3 > 0 ? { color: '#F46C3A' } : { color: '#005953' }]}>
                                                {stats.scoreByPar.par3 === 0
                                                    ? t("Even")
                                                    : `${stats.scoreByPar.par3 > 0 ? "+" : ""}${stats.scoreByPar.par3} ${t("Total")}`}
                                            </Text>
                                        </View>

                                        {/* PAR 4 Card */}
                                        <View style={[styles.statsParCard, { overflow: 'hidden', padding: 16 }]}>
                                            <View style={[
                                                styles.statsParCorner,
                                                { backgroundColor: stats.scoreByPar.par4 > 0 ? 'rgba(244, 108, 58, 0.1)' : 'rgba(0, 89, 83, 0.1)' }
                                            ]}>
                                                {stats.scoreByPar.par4 === 0 ? (
                                                    <Text style={{ fontSize: 16, color: '#005953' }}>—</Text>
                                                ) : (
                                                    <TrendingDown
                                                        size={16}
                                                        color={stats.scoreByPar.par4 > 0 ? '#F46C3A' : '#005953'}
                                                        style={stats.scoreByPar.par4 <= 0 ? { transform: [{ rotate: '180deg' }] } : {}}
                                                    />
                                                )}
                                            </View>
                                            <Text style={styles.statsParCardLabel}>{t("PAR 4")}</Text>
                                            <Text style={styles.statsParCardAvg}>
                                                {par4Avg}
                                            </Text>
                                            <Text style={[styles.statsParCardTotal, stats.scoreByPar.par4 > 0 ? { color: '#F46C3A' } : { color: '#005953' }]}>
                                                {stats.scoreByPar.par4 === 0
                                                    ? t("Even")
                                                    : `${stats.scoreByPar.par4 > 0 ? "+" : ""}${stats.scoreByPar.par4} ${t("Total")}`}
                                            </Text>
                                        </View>

                                        {/* PAR 5 Card */}
                                        <View style={[styles.statsParCard, { overflow: 'hidden', padding: 16 }]}>
                                            <View style={[
                                                styles.statsParCorner,
                                                { backgroundColor: stats.scoreByPar.par5 > 0 ? 'rgba(244, 108, 58, 0.1)' : 'rgba(0, 89, 83, 0.1)' }
                                            ]}>
                                                {stats.scoreByPar.par5 === 0 ? (
                                                    <Text style={{ fontSize: 16, color: '#005953' }}>—</Text>
                                                ) : (
                                                    <TrendingDown
                                                        size={16}
                                                        color={stats.scoreByPar.par5 > 0 ? '#F46C3A' : '#005953'}
                                                        style={stats.scoreByPar.par5 <= 0 ? { transform: [{ rotate: '180deg' }] } : {}}
                                                    />
                                                )}
                                            </View>
                                            <Text style={styles.statsParCardLabel}>{t("PAR 5")}</Text>
                                            <Text style={styles.statsParCardAvg}>
                                                {par5Avg}
                                            </Text>
                                            <Text style={[styles.statsParCardTotal, stats.scoreByPar.par5 > 0 ? { color: '#F46C3A' } : { color: '#005953' }]}>
                                                {stats.scoreByPar.par5 === 0
                                                    ? t("Even")
                                                    : `${stats.scoreByPar.par5 > 0 ? "+" : ""}${stats.scoreByPar.par5} ${t("Total")}`}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Best/Worst Holes */}
                                <View style={{ marginTop: 24, paddingHorizontal: 4 }}>
                                    <Text style={styles.statsCardTitle}>{t("Highlights")}</Text>
                                    <View style={styles.statsHighlightsRow}>
                                        <View style={styles.statsHighlightItem}>
                                            <Text style={styles.statsHighlightLabel}>{t("Best Hole")}</Text>
                                            <Text style={styles.statsHighlightValue}>
                                                {t("Hole")} {stats.bestHole?.holeNumber}: {stats.bestHole?.relativeToPar > 0 ? '+' : ''}{stats.bestHole?.relativeToPar}
                                            </Text>
                                        </View>
                                        <View style={styles.statsHighlightItem}>
                                            <Text style={styles.statsHighlightLabel}>{t("Worst Hole")}</Text>
                                            <Text style={[styles.statsHighlightValue, { color: '#D64545' }]}>
                                                {t("Hole")} {stats.worstHole?.holeNumber}: +{stats.worstHole?.relativeToPar}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
                </ScrollView>

                {/* Onboarding Continue Button */}
                {isOnboardingMode && (
                    <View style={styles.onboardingBottomSection}>
                        <TouchableOpacity
                            style={styles.continueButton}
                            onPress={() => router.replace('/(onboarding)/paywall' as any)}
                        >
                            <Text style={styles.continueButtonText}>{t("Continue")}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Modal
                    visible={scoringInfoVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setScoringInfoVisible(false)}
                >
                    <View style={styles.sheetBackdrop}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setScoringInfoVisible(false)} />
                        <View style={styles.sheetContainer}>
                            <View style={styles.sheetHandle} />
                            <Text style={styles.sheetTitle}>How Nassau scoring works</Text>
                            <Text style={styles.sheetSubtitle}>Game standings are separate from money settlement.</Text>
                            <Text style={styles.sheetBullet}>• Nassau runs as separate matches by segment.</Text>
                            <Text style={styles.sheetBullet}>• 18 holes: Front 9, Back 9, Overall.</Text>
                            <Text style={styles.sheetBullet}>• 9 holes: only the selected segment is scored.</Text>
                            <Text style={styles.sheetBullet}>• Segment result uses hole-by-hole net scores (strokes applied).</Text>
                            <Text style={styles.sheetBullet}>• Standings show segment record and segments won.</Text>
                            <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setScoringInfoVisible(false)}>
                                <Text style={styles.sheetCloseButtonText}>{t("Close")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={playerDetailVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setPlayerDetailVisible(false)}
                >
                    <View style={styles.sheetBackdrop}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPlayerDetailVisible(false)} />
                        <View style={[styles.sheetContainer, styles.sheetTallContainer]}>
                            <View style={styles.sheetHandle} />
                            <Text style={styles.sheetTitle}>{selectedPlayerDetail?.playerName ?? "Player detail"}</Text>
                            {selectedPlayerDetail ? (
                                <>
                                    <Text style={styles.sheetSubtitle}>
                                        {`Segments ${selectedPlayerDetail.segRecord} • Won ${selectedPlayerDetail.segmentsWon}`}
                                    </Text>
                                    <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                                        {selectedPlayerDetail.matchups.map((matchup) => (
                                            <View key={matchup.pairingId} style={styles.playerMatchupCard}>
                                                <Text style={styles.playerMatchupTitle}>{`vs ${matchup.opponentName}`}</Text>
                                                {matchup.segments.map((segment) => (
                                                    <View key={`${matchup.pairingId}:${segment.segment}`} style={styles.playerMatchupRow}>
                                                        <Text style={styles.playerMatchupSegment}>{segment.contextLabel}</Text>
                                                        <Text style={styles.playerMatchupResult}>{segment.result}</Text>
                                                        <Text style={styles.playerMatchupScore}>
                                                            {`${segment.holesWonFor}-${segment.holesWonAgainst} (${segment.tiedHoles} tied)`}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ))}
                                    </ScrollView>
                                </>
                            ) : (
                                <Text style={styles.sheetSubtitle}>No player detail available.</Text>
                            )}
                            <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setPlayerDetailVisible(false)}>
                                <Text style={styles.sheetCloseButtonText}>{t("Close")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={settlementDetailVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setSettlementDetailVisible(false)}
                >
                    <View style={styles.sheetBackdrop}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setSettlementDetailVisible(false)} />
                        <View style={[styles.sheetContainer, styles.sheetTallContainer]}>
                            <View style={styles.sheetHandle} />
                            <Text style={styles.sheetTitle}>Settlement details</Text>
                            <Text style={styles.sheetSubtitle}>
                                {nassauDisplayModel
                                    ? `${nassauDisplayModel.pairingCount} matchups • ${nassauDisplayModel.totalLineItems} line items`
                                    : "Detailed settlement breakdown"}
                            </Text>
                            {/* Segmented control */}
                            <View style={styles.segmentedControl}>
                                {([
                                    ["payments", "Payments"],
                                    ["breakdown", "Breakdown"],
                                    ["net", "Net"],
                                ] as [NassauDetailTab, string][]).map(([key, label]) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[styles.segmentedTab, settlementDetailTab === key && styles.segmentedTabActive]}
                                        onPress={() => setSettlementDetailTab(key)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.segmentedTabText, settlementDetailTab === key && styles.segmentedTabTextActive]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <ScrollView style={styles.sheetScrollFixed} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                                {settlementDetailTab === "payments" && (
                                    <>
                                        {settlementData.payments.map((tx: any, idx: number) => {
                                            const fromName = participantNameById.get(String(tx.fromPlayerId)) || t("Unknown");
                                            const toName = participantNameById.get(String(tx.toPlayerId)) || t("Unknown");
                                            return (
                                                <View key={`payments:${idx}`} style={styles.sheetListRow}>
                                                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sheetListLabel}>
                                                        <Text style={{ fontWeight: '700' }}>{fromName}</Text>
                                                        <Text style={{ color: 'rgba(0, 89, 83, 0.55)' }}>{` owes `}</Text>
                                                        <Text style={{ fontWeight: '700' }}>{toName}</Text>
                                                    </Text>
                                                    <Text style={styles.sheetListAmount}>{formatMoney(tx.amountCents || 0)}</Text>
                                                </View>
                                            );
                                        })}
                                        {nassauDisplayModel ? (
                                            <View style={styles.sheetInfoFooter}>
                                                <Text style={styles.sheetInfoFooterText}>
                                                    {`Gross bets: ${formatMoney(nassauDisplayModel.grossMatchedCents)} • Settled: ${formatMoney(nassauDisplayModel.totalToSettleCents)}`}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </>
                                )}

                                {settlementDetailTab === "breakdown" && (nassauDisplayModel?.pairwiseSettlements ?? []).map((pair) => {
                                    const isExpanded = expandedPairKey === pair.pairKey;
                                    return (
                                        <TouchableOpacity
                                            key={pair.pairKey}
                                            activeOpacity={0.85}
                                            style={styles.sheetPairCard}
                                            onPress={() => setExpandedPairKey((prev) => prev === pair.pairKey ? null : pair.pairKey)}
                                        >
                                            <View style={styles.sheetListRow}>
                                                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sheetListLabel}>
                                                    <Text style={{ fontWeight: '700' }}>{pair.fromPlayerName}</Text>
                                                    <Text style={{ color: 'rgba(0, 89, 83, 0.55)' }}>{` → `}</Text>
                                                    <Text style={{ fontWeight: '700' }}>{pair.toPlayerName}</Text>
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Text style={styles.sheetListAmount}>{formatMoney(pair.amountCents)}</Text>
                                                    <ChevronDown size={13} color="rgba(0, 89, 83, 0.35)" style={isExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
                                                </View>
                                            </View>
                                            {isExpanded ? pair.lineItems.map((item: any, lineIdx: number) => (
                                                <View key={`${pair.pairKey}:${lineIdx}`} style={styles.sheetSubRow}>
                                                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sheetSubLabel}>
                                                        {`${formatSegmentName(String(item.segment))} • ${item.reason ?? "Nassau"}`}
                                                    </Text>
                                                    <Text style={styles.sheetSubAmount}>{formatMoney(item.amountCents || 0)}</Text>
                                                </View>
                                            )) : null}
                                        </TouchableOpacity>
                                    );
                                })}

                                {settlementDetailTab === "net" && (
                                    <>
                                        {(nassauDisplayModel?.netBalances ?? []).map((row) => (
                                            <View key={row.playerId} style={styles.sheetListRow}>
                                                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sheetListLabel}>{row.playerName}</Text>
                                                <Text style={[styles.sheetListAmount, row.netCents > 0 ? styles.sheetNetPositive : styles.sheetNetNegative]}>
                                                    {formatSignedMoney(row.netCents)}
                                                </Text>
                                            </View>
                                        ))}
                                    </>
                                )}
                            </ScrollView>
                            <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setSettlementDetailVisible(false)}>
                                <Text style={styles.sheetCloseButtonText}>{t("Close")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={photoModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setPhotoModalVisible(false)}
                >
                    <View style={styles.photoModalBackdrop}>
                        <View style={styles.photoModalPager}>
                            <Animated.FlatList
                                data={localPhotos}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                style={{ width: "100%", height: windowHeight * 0.66 }}
                                initialScrollIndex={activePhotoIndex}
                                getItemLayout={(_, index) => ({
                                    length: windowWidth,
                                    offset: windowWidth * index,
                                    index,
                                })}
                                keyExtractor={(uri, idx) => `${idx}:${uri}`}
                                renderItem={({ item }) => (
                                    <View style={{ width: windowWidth, height: "100%", justifyContent: "center", alignItems: "center" }}>
                                        <ExpoImage
                                            source={{ uri: item }}
                                            style={styles.photoModalImage}
                                            contentFit="contain"
                                            transition={0}
                                            cachePolicy="disk"
                                        />
                                    </View>
                                )}
                                scrollEventThrottle={16}
                                decelerationRate="fast"
                                removeClippedSubviews
                                windowSize={3}
                                initialNumToRender={1}
                                maxToRenderPerBatch={1}
                                updateCellsBatchingPeriod={50}
                                onScroll={Animated.event(
                                    [{ nativeEvent: { contentOffset: { x: photoScrollX } } }],
                                    { useNativeDriver: true }
                                )}
                                onMomentumScrollEnd={(e) => {
                                    const x = e.nativeEvent.contentOffset.x;
                                    const nextIndex = Math.round(x / windowWidth);
                                    setActivePhotoIndex(Math.max(0, Math.min(localPhotos.length - 1, nextIndex)));
                                }}
                            />

                            {localPhotos.length > 1 && (
                                <View style={styles.photoDots}>
                                    {localPhotos.map((_, idx) => {
                                        const inputRange = [
                                            (idx - 1) * windowWidth,
                                            idx * windowWidth,
                                            (idx + 1) * windowWidth,
                                        ];
                                        const opacity = photoScrollX.interpolate({
                                            inputRange,
                                            outputRange: [0.25, 1, 0.25],
                                            extrapolate: "clamp",
                                        });
                                        const scale = photoScrollX.interpolate({
                                            inputRange,
                                            outputRange: [1, 1.45, 1],
                                            extrapolate: "clamp",
                                        });
                                        return (
                                            <Animated.View
                                                key={idx}
                                                style={[styles.photoDot, { opacity, transform: [{ scale }] }]}
                                            />
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                        <TouchableOpacity style={styles.photoCloseButton} onPress={() => setPhotoModalVisible(false)}>
                            <Text style={styles.photoCloseText}>{t("Close")}</Text>
                        </TouchableOpacity>
                    </View>
                </Modal>
            </SafeAreaView >
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    // Hero Image Card Styles
    heroImageContainer: {
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    heroImage: {
        height: 180,
        width: '100%',
        justifyContent: 'flex-end',
    },
    heroImageRounded: {
        borderRadius: 16,
    },
    heroOverlay: {
        padding: 16,
        paddingTop: 100,
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderRadius: 16,
        flex: 1,
        justifyContent: 'flex-end',
    },
    heroCourseName: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 6,
    },
    heroDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    heroDate: {
        fontSize: 13,
        color: '#FFFFFF',
        opacity: 0.9,
    },
    syncBadgeContainer: {
        position: 'absolute',
        top: 12,
        right: 12,
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
    sheetBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(7, 21, 18, 0.35)",
    },
    sheetContainer: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
        minHeight: 280,
        maxHeight: "76%",
    },
    sheetTallContainer: {
        height: "60%",
        maxHeight: "60%",
    },
    sheetHandle: {
        alignSelf: "center",
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: "#D6DEDB",
        marginBottom: 10,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#005953",
    },
    sheetSubtitle: {
        fontSize: 13,
        lineHeight: 18,
        color: "rgba(0, 89, 83, 0.7)",
        marginTop: 4,
        marginBottom: 10,
    },
    sheetBullet: {
        fontSize: 13,
        lineHeight: 19,
        color: "#18453F",
        marginBottom: 4,
    },
    sheetCloseButton: {
        marginTop: 12,
        backgroundColor: "#005953",
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
    },
    sheetCloseButtonText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    sheetScroll: {
        marginTop: 6,
    },
    sheetScrollFixed: {
        marginTop: 4,
        flex: 1,
    },
    playerMatchupCard: {
        borderWidth: 1,
        borderColor: "#E8EBE6",
        borderRadius: 10,
        padding: 10,
        marginBottom: 10,
        gap: 6,
    },
    playerMatchupTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#005953",
    },
    playerMatchupRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    playerMatchupSegment: {
        width: 72,
        fontSize: 12,
        color: "rgba(0, 89, 83, 0.75)",
    },
    playerMatchupResult: {
        width: 18,
        fontSize: 12,
        fontWeight: "800",
        color: "#005953",
        textAlign: "center",
    },
    playerMatchupScore: {
        flex: 1,
        minWidth: 0,
        fontSize: 12,
        color: "#18453F",
    },
    segmentedControl: {
        flexDirection: "row",
        backgroundColor: "#EEF2F1",
        borderRadius: 10,
        padding: 3,
        marginTop: 8,
        marginBottom: 4,
    },
    segmentedTab: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        borderRadius: 8,
    },
    segmentedTabActive: {
        backgroundColor: "#FFFFFF",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    segmentedTabText: {
        fontSize: 13,
        color: "rgba(0, 89, 83, 0.55)",
        fontWeight: "600",
    },
    segmentedTabTextActive: {
        color: "#005953",
        fontWeight: "700",
    },
    sheetListRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#EEF2F1",
    },
    sheetListLabel: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        color: "#18453F",
    },
    sheetListAmount: {
        fontSize: 13,
        fontWeight: "700",
        color: "#005953",
    },
    sheetPairCard: {
        borderWidth: 1,
        borderColor: "#E8EBE6",
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        backgroundColor: "#FFFFFF",
    },
    sheetSubRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingTop: 6,
    },
    sheetSubLabel: {
        flex: 1,
        minWidth: 0,
        fontSize: 12,
        color: "rgba(0, 89, 83, 0.72)",
    },
    sheetSubAmount: {
        fontSize: 12,
        color: "#005953",
        fontWeight: "600",
    },
    sheetNetPositive: {
        color: "#0A8B61",
    },
    sheetNetNegative: {
        color: "#BB4C2C",
    },
    sheetInfoFooter: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "#EEF2F1",
    },
    sheetInfoFooterText: {
        fontSize: 12,
        color: "rgba(0, 89, 83, 0.5)",
        fontWeight: "600",
        textAlign: "center",
    },
    photoModalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    photoModalPager: {
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
    photoModalImage: {
        width: "90%",
        height: "100%",
    },
    photoDots: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginTop: -12,
    },
    photoDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.9)",
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
    // Tab Bar Styles
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#E8EBE6',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabButtonActive: {
        backgroundColor: '#005953',
    },
    tabButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    tabButtonTextActive: {
        color: '#FFFFFF',
    },
    tabContent: {
        flex: 1,
    },
    // Scorecard Styles
    scorecardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    scorecardHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#005953',
    },
    scoreViewToggle: {
        flexDirection: 'row',
        backgroundColor: '#E8EBE6',
        borderRadius: 8,
        padding: 3,
    },
    scoreViewOption: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    scoreViewOptionActive: {
        backgroundColor: '#005953',
    },
    scoreViewText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    scoreViewTextActive: {
        color: '#FFFFFF',
    },
    adjustedInfoButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F5F6F1',
        borderWidth: 1,
        borderColor: '#E8EBE6',
    },
    scorecardGrid: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    scorecardRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        alignItems: 'center',
    },
    scorecardCell: {
        paddingVertical: 10,
        paddingHorizontal: 8,
        fontSize: 13,
        textAlign: 'center',
        color: colors.text,
    },
    scorecardHeaderCell: {
        fontWeight: '700',
        backgroundColor: '#F5F6F1',
        color: '#005953',
        fontSize: 12,
    },
    // Hole Column Header Styles
    scorecardHoleHeaderCell: {
        backgroundColor: '#005953',
        justifyContent: 'center',
        alignItems: 'center',
        borderTopLeftRadius: 8,
    },
    scorecardHoleHeaderText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 11,
        letterSpacing: 0.5,
    },
    scorecardParHeaderCell: {
        backgroundColor: '#E8EBE6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scorecardParHeaderText: {
        color: '#005953',
        fontWeight: '600',
        fontSize: 11,
    },
    // Hole Body Cell Styles
    scorecardHoleCell: {
        backgroundColor: '#005953',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'stretch',
    },
    scorecardHoleCellText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    scorecardParCell: {
        backgroundColor: '#F5F6F1',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'stretch',
    },
    scorecardParCellText: {
        color: '#005953',
        fontWeight: '500',
        fontSize: 14,
    },
    scorecardPlayerCell: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scorecardScoreWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    scorecardScoreBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    scorecardBirdie: {
        backgroundColor: '#005953',
    },
    scorecardBogey: {
        backgroundColor: '#F46C3A',
    },
    scorecardScoreText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    scorecardBirdieText: {
        color: '#FFFFFF',
    },
    scorecardBogeyText: {
        color: '#FFFFFF',
    },
    scorecardAdjustmentInline: {
        width: 18,
        textAlign: 'right',
        fontSize: 10,
        fontWeight: '700',
        color: '#005953',
        marginRight: 4,
    },
    scorecardAdjustmentInlinePlaceholder: {
        width: 18,
        marginRight: 4,
    },
    scorecardTotalWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scorecardTotalRow: {
        backgroundColor: '#F5F6F1',
        borderBottomWidth: 0,
    },
    scorecardTotalCell: {
        fontWeight: '700',
        fontSize: 14,
        color: '#005953',
    },
    scorecardTotalHoleCell: {
        borderBottomLeftRadius: 8,
    },
    scorecardTotalHoleText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 12,
    },
    // Stats Tab Styles
    statsTabContainer: {
        gap: 16,
    },
    statsHeroCard: {
        flexDirection: 'row',
        backgroundColor: '#005953',
        borderRadius: 16,
        padding: 20,
        marginBottom: 8,
    },
    statsHeroLeft: {
        flex: 1,
    },
    statsHeroRight: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    statsHeroLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
        marginBottom: 4,
    },
    statsHeroScore: {
        fontSize: 48,
        fontWeight: '700',
        color: '#FFFFFF',
        lineHeight: 52,
    },
    statsHeroVsPar: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
    },
    statsHeroDiff: {
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    statsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    statsCardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 16,
        letterSpacing: 0.5,
    },
    statsDistribution: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 100,
    },
    statsDistItem: {
        alignItems: 'center',
        flex: 1,
    },
    statsDistBar: {
        width: 24,
        borderRadius: 4,
        marginBottom: 8,
    },
    statsDistCount: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 2,
    },
    statsDistLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    statsParRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statsParItem: {
        alignItems: 'center',
        flex: 1,
    },
    statsParLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    statsParValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#005953',
    },
    statsHighlightsRow: {
        flexDirection: 'row',
        gap: 16,
        backgroundColor: 'rgba(0, 89, 83, 0.05)', // Match reference: brand-green/5
        borderRadius: 12, // Match reference: rounded-xl
        padding: 16, // Match reference: p-4
        borderWidth: 1,
        borderColor: 'rgba(0, 89, 83, 0.1)', // Match reference: brand-green/10
    },
    statsHighlightItem: {
        flex: 1,
        // Removed separate card styling
    },
    statsHighlightLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#005953', // Match reference: text-brand-green
        marginBottom: 4,
    },
    statsHighlightValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#005953',
    },
    // Score Boxes Row - Separate Gross and HCP boxes
    statsScoreBoxesRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8,
    },
    statsGrossBox: {
        flex: 1,
        backgroundColor: '#E8EEEB',
        borderRadius: 16,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsGrossLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#005953',
        letterSpacing: 1,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    statsGrossScoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        // Removed gap to rely on absolute positioning wrapper
    },
    statsGrossScore: {
        fontSize: 42,
        fontWeight: '700',
        color: '#005953',
        lineHeight: 48,
        letterSpacing: -2,
    },
    statsGrossVsPar: {
        fontSize: 14,
        fontWeight: '700',
        color: '#F46C3A',
    },
    statsGrossParText: {
        fontSize: 12,
        color: '#005953', // This will be opaque in inline style override, likely not used directly if text is "12 over par"
    },
    statsHcpBox: {
        flex: 1,
        backgroundColor: '#005953',
        borderRadius: 16,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsHcpLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    statsHcpValue: {
        fontSize: 42,
        fontWeight: '700',
        color: '#F5F6F1',
        letterSpacing: -2,
    },
    // Wider Distribution Bars
    statsDistributionWide: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 140,
        gap: 8,
    },
    statsDistItemWide: {
        alignItems: 'center',
        flex: 1,
    },
    statsDistBarContainerWide: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 0,
        width: '100%',
        alignItems: 'center',
    },
    statsDistBarWide: {
        width: '85%', // Make bars wider relative to container
        minWidth: 56, // Enforce thickness
        borderRadius: 8, // Slightly softer radius
    },
    statsDistLabelWide: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 8,
        fontWeight: '600',
    },
    statsDistCountLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 4,
        opacity: 0, // Default to hidden, inline style overrides if count > 0
    },
    statsDistHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    statsDistBadge: {
        backgroundColor: '#F5F6F1',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statsDistBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0, 89, 83, 0.7)',
    },
    statsDistFooter: {
        marginTop: 16,
        paddingTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        position: 'relative', // Context for separator
    },
    statsDistSeparator: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        borderTopWidth: 1,
        borderColor: 'rgba(0, 89, 83, 0.1)',
        borderStyle: 'dashed',
    },
    statsDistFooterText: {
        fontSize: 14,
        color: 'rgba(0, 89, 83, 0.7)',
    },
    statsDistFooterBold: {
        fontWeight: '700',
        color: '#005953',
    },
    // Performance by Par Section - Separate Cards
    statsPerformanceSection: {
        marginTop: 8,
    },
    statsPerformanceTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    statsParCardsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    statsParCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E8EBE6',
        alignItems: 'center',
        position: 'relative', // For absolute positioned corner
    },
    statsParCorner: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 32,
        height: 32,
        borderBottomLeftRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsParCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 8,
    },
    statsParCardLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(0, 89, 83, 0.5)',
        letterSpacing: 0.5,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    statsParCardEvenIcon: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    statsParCardAvg: {
        fontSize: 32,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 4,
    },
    statsParCardTotal: {
        fontSize: 12,
        fontWeight: '700',
        color: '#005953',
    },
    // Player Selector Styles
    statsPlayerSelector: {
        marginBottom: 16,
    },
    statsPlayerLabel: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    statsPlayerDropdown: {
        flexDirection: 'row',
        backgroundColor: '#E8EBE6',
        borderRadius: 10,
        padding: 4,
    },
    statsPlayerOption: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    statsPlayerOptionActive: {
        backgroundColor: '#005953',
    },
    statsPlayerOptionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    statsPlayerOptionTextActive: {
        color: '#FFFFFF',
    },

    // Summary Tab Player Card Styles
    summaryPlayerCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    summaryPlayerHeader: {
        marginBottom: 16,
    },
    summaryPlayerName: {
        fontSize: 20,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 4,
    },
    summaryPlayerTee: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    summaryScoreRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    summaryScoreItem: {
        alignItems: 'center',
        flex: 1,
    },
    summaryScoreValue: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 2,
    },
    summaryScoreLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    summaryNineRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#E8EBE6',
    },
    summaryNineItem: {
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    summaryNineLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    summaryNineValue: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    summaryNineDivider: {
        width: 1,
        height: 32,
        backgroundColor: '#E0E0E0',
    },
    // New Summary Tab Redesign Styles
    summaryContainer: {
        gap: 20,
    },
    courseHeroCard: {
        marginBottom: 4,
    },
    courseHeroImage: {
        height: 160,
        width: '100%',
        justifyContent: 'flex-end',
    },
    courseHeroOverlay: {
        padding: 16,
        paddingTop: 60,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    courseHeroName: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 6,
    },
    courseHeroDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    courseHeroDate: {
        fontSize: 13,
        color: '#FFFFFF',
        opacity: 0.9,
    },
    standingsSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E8EBE6',
    },
    standingsBlock: {
        gap: 8,
    },
    standingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    standingsSectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'rgba(0, 89, 83, 0.8)',
    },
    gameTypeBadge: {
        backgroundColor: 'rgba(244, 108, 58, 0.10)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    gameTypeBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#F46C3A',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    standingsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E8EBE6',
        overflow: 'hidden',
    },
    leaderboardHeader: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#F5F6F1',
        borderBottomWidth: 1,
        borderBottomColor: '#E8EBE6',
    },
    leaderboardHeaderCell: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(0, 89, 83, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    leaderboardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8EBE6',
        position: 'relative',
    },
    leaderboardRowWinner: {
        backgroundColor: 'rgba(244, 108, 58, 0.05)', // Match reference: accent-orange/5
    },
    leaderboardWinnerAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: '#F46C3A',
    },
    leaderboardCell: {
        justifyContent: 'center',
    },
    leaderboardNumericCell: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    positionBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0, 89, 83, 0.1)', // Match reference: primary/10
        justifyContent: 'center',
        alignItems: 'center',
    },
    positionBadgeWinner: {
        backgroundColor: '#F46C3A', // Match reference: accent-orange for #1
    },
    positionBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#005953',
    },
    positionBadgeTextWinner: {
        color: '#FFFFFF',
    },
    winnerBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#FFD700',
        justifyContent: 'center',
        alignItems: 'center',
    },
    winnerBadgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    positionText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
        textAlign: 'center',
    },
    playerAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E8EBE6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playerAvatarWinner: {
        backgroundColor: '#005953',
    },
    playerAvatarText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    playerAvatarTextWinner: {
        color: '#FFFFFF',
    },
    playerNameText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    playerNameTextWinner: {
        fontWeight: '700',
        color: '#005953',
    },
    winnerLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#F46C3A',
        marginTop: 2,
    },
    scoreText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.text,
        textAlign: 'center',
        width: '100%',
    },
    netScoreText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
        width: '100%',
    },
    settlementsBlock: {
        gap: 12,
    },
    settlementsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E8EBE6',
        overflow: 'hidden',
    },
    totalPotText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(0, 89, 83, 0.7)',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E8EBE6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    settlementDetailButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E8EBE6',
        backgroundColor: 'rgba(0, 89, 83, 0.03)',
    },
    settlementDetailButtonText: {
        fontSize: 12,
        color: '#005953',
        fontWeight: '600',
    },
    settlementCard: {
        flexDirection: 'column',
        alignItems: 'stretch',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderStyle: 'dashed',
        borderBottomColor: '#E8EBE6',
    },
    settlementCardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    settlementCardPositive: {
        backgroundColor: 'rgba(244, 108, 58, 0.05)', // Match reference: accent-orange/5
    },
    settlementCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    settlementNamesWrap: {
        flex: 1,
        minWidth: 0,
    },
    settlementIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 89, 83, 0.05)', // Match reference: primary/5
    },
    settlementIconPositive: {
        backgroundColor: '#F46C3A', // Match reference: accent-orange for "You" positive
    },
    settlementIconNegative: {
        backgroundColor: 'rgba(0, 89, 83, 0.05)',
    },
    settlementNames: {
        fontSize: 14,
        color: colors.text,
    },
    settlementReason: {
        fontSize: 11,
        color: 'rgba(0, 89, 83, 0.5)',
        marginTop: 2,
    },
    settlementAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    settlementAmountPositive: {
        color: '#F46C3A', // Match reference: accent-orange
        fontSize: 18,
    },
    settlementContributionList: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#E8EBE6',
        gap: 6,
    },
    settlementContributionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    settlementContributionLabel: {
        flex: 1,
        minWidth: 0,
        fontSize: 11,
        color: 'rgba(0, 89, 83, 0.66)',
    },
    settlementContributionAmount: {
        fontSize: 11,
        fontWeight: '600',
        color: '#005953',
    },
    settlementBreakdown: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#E8EBE6',
    },
    settlementBreakdownText: {
        fontSize: 13,
        lineHeight: 18,
        color: 'rgba(0, 89, 83, 0.7)',
    },
    settlementBreakdownLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: '#005953',
        letterSpacing: 1,
    },
    verdictRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    verdictTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    inlineInfoButton: {
        marginTop: 3,
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C9D7D4',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        flexShrink: 0,
    },
    verdictText: {
        marginTop: 4,
        marginBottom: 6,
        paddingHorizontal: 4,
        fontSize: 14,
        lineHeight: 20,
        color: 'rgba(0, 89, 83, 0.75)',
        fontWeight: '700',
    },
    verdictWinner: {
        color: '#F46C3A',
        fontWeight: '800',
    },
    verdictBody: {
        color: 'rgba(0, 89, 83, 0.75)',
        fontWeight: '700',
    },
    verdictSubtext: {
        color: 'rgba(0, 89, 83, 0.55)',
        fontWeight: '700',
    },
    youLabel: {
        color: 'rgba(0, 89, 83, 0.55)',
        fontWeight: '700',
    },
    winnerDetailsCard: {
        backgroundColor: '#FFFBEB',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    winnerDetailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    winnerDetailsTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    winnerDetailsName: {
        fontSize: 20,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 4,
    },
    winnerDetailsScore: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    quickNotesSection: {
        gap: 12,
    },
    notesCard: {
        backgroundColor: '#F8F8F8',
        borderRadius: 12,
        padding: 16,
    },
    notesCardText: {
        fontSize: 14,
        lineHeight: 20,
        color: colors.text,
    },
    sourceScanSection: {
        gap: 4,
    },
    scanCard: {
        width: 100,
        height: 80,
        borderRadius: 12,
        marginRight: 12,
        overflow: 'hidden',
        backgroundColor: '#F0F0F0',
    },
    scanCardImage: {
        width: '100%',
        height: '100%',
    },
    scanCardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingVertical: 6,
    },
    scanCardText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#005953',
    },
    // Source Scan Redesigned Styles (matching reference HTML)
    sourceScanCard: {
        padding: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(0, 89, 83, 0.3)',
        backgroundColor: '#FFFFFF',
    },
    sourceScanCardInner: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        padding: 12,
        gap: 16,
    },
    sourceScanThumbnail: {
        width: 64,
        height: 64,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#F5F6F1',
        borderWidth: 1,
        borderColor: 'rgba(0, 89, 83, 0.1)',
    },
    sourceScanThumbnailImage: {
        width: '100%',
        height: '100%',
    },
    sourceScanContent: {
        flex: 1,
        justifyContent: 'center',
        gap: 4,
    },
    sourceScanTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#005953',
    },
    sourceScanSubtitle: {
        fontSize: 12,
        color: 'rgba(0, 89, 83, 0.6)',
    },
    sourceScanViewButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#F5F6F1',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E8EBE6',
    },
    sourceScanViewButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#005953',
    },
    viewStatsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#005953',
        paddingVertical: 16,
        borderRadius: 12,
        marginTop: 8,
    },
    viewStatsButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    // Round Highlights Section Styles
    highlightsSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E8EBE6',
        gap: 12,
    },
    highlightCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    highlightIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    highlightContent: {
        flex: 1,
    },
    highlightLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textSecondary,
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    highlightValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#005953',
        marginBottom: 2,
    },
    highlightDescription: {
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    // Onboarding Continue Button Styles
    onboardingBottomSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 8,
        backgroundColor: 'transparent',
    },
    continueButton: {
        backgroundColor: '#F46C3A',
        borderRadius: 28,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#F46C3A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    continueButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});
