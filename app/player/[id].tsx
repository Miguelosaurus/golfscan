import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Modal,
    Image,
    useWindowDimensions,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/constants/colors";
import { Button } from "@/components/Button";
import { ScoreTrendCard } from "@/components/ScoreTrendCard";
import { RoundCard } from "@/components/RoundCard";
import { HeadToHeadCard } from "@/components/HeadToHeadCard";
import { Round } from "@/types";
import { calculateAverageScoreWithHoleAdjustment } from "@/utils/helpers";
import { ScoreTrendData } from "@/utils/stats";
import { TrendingUp, Calendar, Info, DollarSign } from "lucide-react-native";
import { PieChart } from "react-native-gifted-charts";
import { useQuery } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type TooltipKey = "blowup" | "avgVsPar" | "performanceByPar" | "difficulty" | null;

const buildTrendFromRounds = (rounds: Round[], playerId: string | undefined): ScoreTrendData => {
    const sorted = [...rounds]
        .filter((r) => r.players.some((p) => p.playerId === playerId))
        .map((r) => ({
            date: new Date(r.date),
            score: r.players.find((p) => p.playerId === playerId)?.totalScore ?? 0,
        }))
        .filter((r) => !isNaN(r.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    const labels = sorted.map((r) => r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    const scores = sorted.map((r) => r.score);

    const movingAverage: number[] = [];
    scores.forEach((score, idx) => {
        const windowScores = scores.slice(Math.max(0, idx - 4), idx + 1);
        const avg = windowScores.reduce((s, v) => s + v, 0) / windowScores.length;
        movingAverage.push(Number(avg.toFixed(1)));
    });

    return {
        labels,
        scores,
        movingAverage,
        totalRounds: sorted.length,
    };
};

export default function PlayerProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const [activeTooltip, setActiveTooltip] = useState<TooltipKey>(null);

    const profile = useQuery(api.users.getProfile);
    const hostRounds =
        useQuery(
            api.rounds.listWithSummary,
            profile?._id ? ({ hostId: profile._id as Id<"users"> } as any) : "skip"
        ) || [];

    // Treat the route id as a Convex players id; both normal players and the
    // self player use the players table, so this behaves the same for everyone.
    const stats = useQuery(
        api.players.getStats,
        id ? ({ playerId: id as Id<"players"> } as any) : "skip"
    );

    // Get the current user's self player for head-to-head comparison
    const selfPlayer = useQuery(api.players.getSelf);
    const selfPlayerId = selfPlayer?._id;

    // Query head-to-head stats when viewing another player (not self)
    const headToHead = useQuery(
        api.players.getHeadToHead,
        selfPlayerId && id && !stats?.isSelf
            ? { myPlayerId: selfPlayerId as Id<"players">, theirPlayerId: id as Id<"players"> }
            : "skip"
    );

    const wagerStats = useQuery(
        api.stats.getWagerStats,
        stats?.isSelf && id
            ? { playerId: id as Id<"players"> }
            : "skip"
    );

    // Query head-to-head wager stats
    const wagerH2H = useQuery(
        api.stats.getHeadToHeadStats,
        selfPlayerId && id && !stats?.isSelf
            ? { myPlayerId: selfPlayerId as Id<"players">, otherPlayerId: id as Id<"players"> }
            : "skip"
    );

    const playerRounds: Round[] = useMemo(
        () =>
            hostRounds.filter((r: any) =>
                (r.players || []).some((p: any) => p.playerId === id)
            ) as Round[],
        [hostRounds, id]
    );

    const playerName =
        stats?.playerName ||
        playerRounds[0]?.players.find((p) => p.playerId === id)?.playerName ||
        "Unknown Player";
    const isLoading = stats === undefined;
    const isEmpty = stats === null && playerRounds.length === 0;

    const scoreDistributionEntries =
        stats &&
        [
            { label: "Eagles", value: stats.eagles, color: "#F7B32B" },
            { label: "Birdies", value: stats.birdies, color: "#4CAF50" },
            { label: "Pars", value: stats.pars, color: "#1E6059" },
            { label: "Bogeys", value: stats.bogeys, color: "#FFB347" },
            { label: "Doubles", value: stats.doubleBogeys, color: "#F44336" },
            { label: "Worse", value: stats.worseThanDouble, color: "#B71C1C" },
        ];
    const hasScoreDistribution = !!scoreDistributionEntries?.some((item: { value: number }) => item.value > 0);
    const pieRadius = Math.max(Math.min((windowWidth - 96) / 2.2, 130), 90);
    const totalScores = scoreDistributionEntries?.reduce((sum: number, item: { value: number }) => sum + item.value, 0) ?? 0;
    const pieChartData =
        scoreDistributionEntries
            ?.filter((item: { label: string; value: number; color: string }) => item.value > 0)
            .map((item: { label: string; value: number; color: string }) => ({
                value: item.value,
                color: item.color,
                text: totalScores ? `${Math.round((item.value / totalScores) * 100)}%` : "0%",
                textColor: "#fff",
                textSize: 12,
                shiftX: -6,
                shiftY: 0,
            })) || [];

    const scoreTrend = useMemo(() => buildTrendFromRounds(playerRounds, id), [playerRounds, id]);

    const averageVsParNumber = stats ? Number(stats.averageVsPar) : 0;

    const tooltipContent = {
        blowup: {
            title: "Blow-Up Holes/Rd",
            body: stats?.isSelf
                ? "Average number of holes per round where you scored triple bogey or worse."
                : `Average number of holes per round where ${playerName} scored triple bogey or worse.`,
        },
        avgVsPar: {
            title: "Avg vs Par",
            body: stats?.isSelf
                ? "How many strokes over/under par you typically shoot each round."
                : `How many strokes over/under par ${playerName} typically shoots each round.`,
        },
        performanceByPar: {
            title: "Performance by Par",
            body: "Average score relative to par for Par 3s, 4s, and 5s.",
        },
        difficulty: {
            title: "Performance vs Difficulty",
            body: "Average score relative to par grouped by hole handicap (hard, medium, easy).",
        },
    } as const;

    const renderTooltip = () => {
        if (!activeTooltip) return null;
        const { title, body } = tooltipContent[activeTooltip];
        return (
            <Modal transparent animationType="fade" visible onRequestClose={() => setActiveTooltip(null)}>
                <TouchableWithoutFeedback onPress={() => setActiveTooltip(null)}>
                    <View style={styles.tooltipOverlay}>
                        <View style={styles.tooltipBox}>
                            <Text style={styles.tooltipTitle}>{title}</Text>
                            <Text style={styles.tooltipText}>{body}</Text>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        );
    };

    const navigateToRoundDetails = (round: Round) => {
        router.push(`/round/${round.id}`);
    };

    const headerHandicap = stats?.isSelf
        ? profile?.handicap ?? "N/A"
        : stats?.handicap ?? "N/A";
    const roundsPlayed = stats?.roundsPlayed ?? playerRounds.length;
    const averageScore =
        stats?.averageScore ??
        (roundsPlayed
            ? calculateAverageScoreWithHoleAdjustment(
                playerRounds.map((round) => ({
                    round,
                    playerData: round.players.find((p) => p.playerId === id)!,
                    course: undefined,
                })) as any
            ).toFixed(1)
            : "0");

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0.3, 0.8, 1]}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
                {renderTooltip()}
                <Stack.Screen
                    options={{
                        title: stats?.playerName || playerName,
                        headerStyle: { backgroundColor: colors.background },
                        headerTitleStyle: { color: colors.text },
                        headerTintColor: colors.text,
                    }}
                />

                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.profileHeader}>
                        <View style={[styles.avatarContainer, stats?.isSelf && styles.userAvatarContainer]}>
                            <Text style={styles.avatarText}>{playerName.charAt(0)}</Text>
                        </View>
                        <Text style={styles.playerName}>
                            {playerName} {stats?.isSelf && <Text style={styles.userLabel}>(You)</Text>}
                        </Text>
                        <View style={styles.handicapContainer}>
                            <Text style={styles.handicapLabel}>Handicap</Text>
                            <Text style={styles.handicapValue}>{headerHandicap}</Text>
                        </View>
                    </View>

                    {isLoading && <Text style={styles.loading}>Loading player…</Text>}

                    {isEmpty && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>No data for this player yet</Text>
                            <Text style={styles.emptyMessage}>Save a round with this player to view stats.</Text>
                            <Button title="Back" onPress={() => router.back()} />
                        </View>
                    )}

                    {!isEmpty && !isLoading && (
                        <>
                            <View style={styles.statsContainer}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>{roundsPlayed}</Text>
                                    <Text style={styles.statLabel}>Rounds</Text>
                                </View>

                                <View style={styles.statDivider} />

                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>{averageScore}</Text>
                                    <Text style={styles.statLabel}>Avg. Score</Text>
                                </View>

                                {stats && (
                                    <>
                                        <View style={styles.statDivider} />

                                        <View style={[styles.statItem, styles.statItemWithIcon]}>
                                            <Text style={styles.statValue}>
                                                {stats.blowUp.averagePerRound.toFixed(1)}
                                            </Text>
                                            <Text style={styles.statLabel}>Blow-Up Holes/Rd</Text>
                                            <TouchableOpacity
                                                onPress={() => setActiveTooltip("blowup")}
                                                style={styles.statInfoButton}
                                                hitSlop={8}
                                            >
                                                <Info size={14} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </View>


                            {/* Total Wager Stats - Only for Self */}
                            {stats?.isSelf && wagerStats && wagerStats.gamesPlayed > 0 && (
                                <View style={[styles.statsContainer, { marginTop: 0 }]}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                            <DollarSign size={24} color="#2E7D32" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>Net Earnings</Text>
                                            <Text style={{ fontSize: 24, fontWeight: '700', color: wagerStats.netBalanceCents >= 0 ? '#2E7D32' : '#C62828' }}>
                                                {wagerStats.netBalanceCents >= 0 ? '+' : '-'}${Math.abs(wagerStats.netBalanceCents / 100).toFixed(2)}
                                            </Text>
                                            <View style={{ flexDirection: 'row', marginTop: 4 }}>
                                                <Text style={{ fontSize: 12, color: colors.textSecondary, marginRight: 8 }}>Won: <Text style={{ color: '#2E7D32', fontWeight: '600' }}>${(wagerStats.totalWonCents / 100).toFixed(2)}</Text></Text>
                                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Lost: <Text style={{ color: '#C62828', fontWeight: '600' }}>${(wagerStats.totalLostCents / 100).toFixed(2)}</Text></Text>
                                            </View>

                                            {(wagerStats.bestWin || wagerStats.biggestDonor) && (
                                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
                                                    {wagerStats.bestWin && (
                                                        <TouchableOpacity onPress={() => wagerStats.bestWin && router.push(`/round/${wagerStats.bestWin.roundId}`)} activeOpacity={0.7} style={{ marginBottom: 4 }}>
                                                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                                                🏆 Best Win: <Text style={{ color: '#2E7D32', fontWeight: '600' }}>${(wagerStats.bestWin.amountCents / 100).toFixed(0)}</Text>
                                                                <Text style={{ fontSize: 11 }}> ({new Date(wagerStats.bestWin.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})</Text>
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {wagerStats.biggestDonor && (
                                                        <TouchableOpacity onPress={() => wagerStats.biggestDonor && router.push(`/player/${wagerStats.biggestDonor.playerId}`)} activeOpacity={0.7}>
                                                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                                                💸 Your ATM: <Text style={{ color: colors.text, fontWeight: '600' }}>{wagerStats.biggestDonor.name}</Text>
                                                                <Text style={{ color: '#2E7D32', fontWeight: '600' }}> (+${(wagerStats.biggestDonor.amountCents / 100).toFixed(0)})</Text>
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* Head-to-Head Wager Stats - Only if interaction exists */}
                            {wagerH2H && wagerH2H.gamesPlayed > 0 && (
                                <View style={[styles.statsContainer, { marginTop: 0, justifyContent: 'center' }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                            <DollarSign size={24} color="#2E7D32" />
                                        </View>
                                        <View>
                                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>Wager History</Text>
                                            <Text style={{ fontSize: 18, fontWeight: '700', color: wagerH2H.netBalanceCents >= 0 ? '#2E7D32' : '#C62828' }}>
                                                {wagerH2H.netBalanceCents >= 0 ? 'You won' : 'You lost'} ${Math.abs(wagerH2H.netBalanceCents / 100).toFixed(2)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* Head-to-Head Card - Only shown when viewing another player */}
                            {!stats?.isSelf && headToHead && (
                                <HeadToHeadCard
                                    data={headToHead}
                                    theirName={playerName}
                                    onRoundPress={(roundId) => router.push(`/round/${roundId}`)}
                                />
                            )}

                            {stats && (
                                <View style={styles.keyInsightsCard}>
                                    <View style={styles.sectionHeaderLeft}>
                                        <TrendingUp size={18} color={colors.primary} />
                                        <Text style={styles.sectionTitle}>Key Insights</Text>
                                    </View>

                                    <View style={styles.avgVsParRow}>
                                        <View style={styles.sectionLabelRow}>
                                            <Text style={styles.avgVsParLabel}>Avg vs Par</Text>
                                            <TouchableOpacity onPress={() => setActiveTooltip("avgVsPar")} style={styles.infoButtonSmall} hitSlop={8}>
                                                <Info size={16} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>
                                        <Text
                                            style={[
                                                styles.avgVsParValue,
                                                averageVsParNumber < 0 ? styles.goodStat : averageVsParNumber > 0 ? styles.badStat : null,
                                            ]}
                                        >
                                            {averageVsParNumber > 0 ? "+" : ""}
                                            {stats ? stats.averageVsPar : "0"}
                                        </Text>
                                    </View>

                                    <View style={styles.sectionDivider} />

                                    <View style={styles.sectionLabelRow}>
                                        <Text style={styles.sectionSubtitle}>Performance by Par</Text>
                                        <TouchableOpacity onPress={() => setActiveTooltip("performanceByPar")} style={styles.infoButtonSmall} hitSlop={8}>
                                            <Info size={16} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.performanceByParRow}>
                                        <ParStat label="Par 3s" value={stats?.performanceByPar.par3 ?? null} />
                                        <ParStat label="Par 4s" value={stats?.performanceByPar.par4 ?? null} />
                                        <ParStat label="Par 5s" value={stats?.performanceByPar.par5 ?? null} />
                                    </View>

                                    <View style={styles.sectionDivider} />

                                    <View style={styles.sectionLabelRow}>
                                        <Text style={styles.sectionSubtitle}>Performance vs Difficulty</Text>
                                        <TouchableOpacity onPress={() => setActiveTooltip("difficulty")} style={styles.infoButtonSmall} hitSlop={8}>
                                            <Info size={16} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.performanceDifficultyRow}>
                                        <ParStat label="Hard (HCP 1-6)" value={stats?.performanceByDifficulty.hard ?? null} />
                                        <ParStat label="Medium (7-12)" value={stats?.performanceByDifficulty.medium ?? null} />
                                        <ParStat label="Easy (13-18)" value={stats?.performanceByDifficulty.easy ?? null} />
                                    </View>
                                </View>
                            )}

                            <ScoreTrendCard data={scoreTrend} />

                            <View style={styles.scoreDistributionContainer}>
                                <View style={styles.sectionHeader}>
                                    <TrendingUp size={18} color={colors.primary} />
                                    <Text style={styles.sectionTitle}>Score Distribution</Text>
                                </View>

                                <Text style={styles.sectionSubtitle}>Score Distribution (All-Time)</Text>

                                {hasScoreDistribution ? (
                                    <>
                                        <View style={styles.pieChartWrapper}>
                                            <PieChart
                                                data={pieChartData}
                                                radius={pieRadius}
                                                showText
                                                textColor="#fff"
                                                textSize={12}
                                                centerLabelComponent={() => null}
                                                innerRadius={0}
                                                strokeColor="#FFFFFF"
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <View style={styles.pieLegend}>
                                            {scoreDistributionEntries?.map((entry: { label: string; value: number; color: string }) => (
                                                <View key={entry.label} style={styles.pieLegendItem}>
                                                    <View style={[styles.pieLegendDot, { backgroundColor: entry.color }]} />
                                                    <Text style={styles.pieLegendLabel}>{entry.label}</Text>
                                                    <Text style={styles.pieLegendCount}>{entry.value}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </>
                                ) : (
                                    <Text style={styles.pieChartPlaceholder}>Play a few more rounds to see your scoring mix.</Text>
                                )}
                            </View>

                            <View style={styles.roundsContainer}>
                                <View style={styles.sectionHeader}>
                                    <Calendar size={18} color={colors.primary} />
                                    <Text style={styles.sectionTitle}>Recent Rounds</Text>
                                </View>

                                {playerRounds.slice(0, 5).map((round) => (
                                    <RoundCard key={round.id} round={round} onPress={() => navigateToRoundDetails(round)} highlightPlayerId={id} />
                                ))}

                                {playerRounds.length > 5 && (
                                    <Button title="View All Rounds" onPress={() => router.push("/history")} variant="outline" style={styles.viewAllButton} />
                                )}
                            </View>
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const ParStat = ({ label, value }: { label: string; value: number | null }) => (
    <View style={styles.performanceItem}>
        <Text style={styles.performanceLabel}>{label}</Text>
        <Text
            style={[
                styles.performanceValue,
                value !== null && value < 0 && styles.goodStat,
                value !== null && value > 0 && styles.badStat,
            ]}
        >
            {value === null ? "--" : value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loading: {
        padding: 24,
        color: colors.text,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 120,
    },
    profileHeader: {
        alignItems: "center",
        marginBottom: 24,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
    },
    userAvatarContainer: {
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.secondary,
    },
    avatarText: {
        fontSize: 36,
        fontWeight: "bold",
        color: colors.background,
    },
    playerName: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 8,
    },
    userLabel: {
        fontSize: 18,
        fontWeight: "500",
        color: colors.primary,
    },
    handicapContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: `${colors.text}10`,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E6EAE9",
    },
    handicapLabel: {
        fontSize: 14,
        color: colors.text,
        marginRight: 4,
    },
    handicapValue: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    statsContainer: {
        flexDirection: "row",
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    statItem: {
        flex: 1,
        alignItems: "center",
        position: "relative",
    },
    statItemWithIcon: {
        paddingTop: 4,
    },
    statDivider: {
        width: 1,
        backgroundColor: colors.border,
        marginHorizontal: 8,
    },
    statValue: {
        fontSize: 20,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        color: colors.text,
        textAlign: "center",
    },
    statInfoButton: {
        position: "absolute",
        top: 4,
        right: 4,
        padding: 4,
    },
    keyInsightsCard: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    avgVsParRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    avgVsParLabel: {
        fontSize: 14,
        color: colors.text,
    },
    avgVsParValue: {
        fontSize: 28,
        fontWeight: "700",
        color: colors.text,
    },
    scoreDistributionContainer: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    sectionHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 12,
    },
    sectionLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sectionDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 16,
    },
    performanceByParRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    performanceDifficultyRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    performanceItem: {
        flex: 1,
        alignItems: "center",
    },
    performanceLabel: {
        fontSize: 12,
        color: colors.text,
        marginBottom: 4,
    },
    performanceValue: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    pieChartWrapper: {
        alignItems: "center",
        marginBottom: 16,
    },
    pieChartPlaceholder: {
        color: colors.text,
        opacity: 0.6,
        textAlign: "center",
        paddingVertical: 16,
    },
    pieLegend: {
        paddingLeft: 0,
        marginTop: 8,
        width: "100%",
    },
    pieLegendItem: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
        paddingHorizontal: 16,
    },
    pieLegendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    pieLegendLabel: {
        flex: 1,
        fontSize: 14,
        color: colors.text,
    },
    pieLegendCount: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    statLabelWithIcon: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    infoButtonSmall: {
        padding: 2,
        marginLeft: 4,
    },
    infoButton: {
        padding: 4,
    },
    tooltipOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    tooltipBox: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        width: "90%",
    },
    tooltipTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    tooltipText: {
        fontSize: 14,
        color: colors.text,
    },
    roundsContainer: {
        marginBottom: 16,
    },
    viewAllButton: {
        marginTop: 8,
    },
    emptyState: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    emptyMessage: {
        fontSize: 14,
        color: colors.text,
        textAlign: "center",
    },
    goodStat: {
        color: colors.success,
    },
    badStat: {
        color: colors.error,
    },
});
