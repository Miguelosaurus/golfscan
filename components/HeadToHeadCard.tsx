import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "@/constants/colors";
import { Users, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react-native";

type RecentRound = {
    roundId: string;
    date: string;
    courseName: string;
    myScore: number;
    theirScore: number;
    winner: "me" | "them" | "tie";
};

type HeadToHeadData = {
    sharedRoundsCount: number;
    myWins: number;
    theirWins: number;
    ties: number;
    myAvgScore: number | null;
    theirAvgScore: number | null;
    avgMargin: number | null;
    myPlayerName?: string;
    theirPlayerName?: string;
    recentRounds: RecentRound[];
};

type Props = {
    data: HeadToHeadData;
    theirName: string;
    onRoundPress?: (roundId: string) => void;
};

export const HeadToHeadCard = ({ data, theirName, onRoundPress }: Props) => {
    const {
        sharedRoundsCount,
        myWins,
        theirWins,
        ties,
        myAvgScore,
        theirAvgScore,
        avgMargin,
        recentRounds,
    } = data;

    // Determine who's winning overall
    const isWinning = myWins > theirWins;
    const isLosing = myWins < theirWins;
    const isTied = myWins === theirWins;

    // Format the record string
    const recordString = `${myWins}-${theirWins}${ties > 0 ? `-${ties}` : ""}`;

    // Format average margin display
    const marginDisplay =
        avgMargin !== null
            ? avgMargin > 0
                ? `+${avgMargin.toFixed(1)}`
                : avgMargin.toFixed(1)
            : "--";

    if (sharedRoundsCount === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Users size={18} color={colors.primary} />
                    <Text style={styles.title}>Head-to-Head</Text>
                </View>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                        You haven't played any rounds with {theirName} yet.
                    </Text>
                    <Text style={styles.emptySubtext}>
                        Play a round together to see your head-to-head stats!
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Users size={18} color={colors.primary} />
                <Text style={styles.title}>Head-to-Head vs {theirName}</Text>
            </View>

            {/* Record Display - The big highlight */}
            <View style={styles.recordSection}>
                <View style={styles.recordContainer}>
                    <Text style={styles.recordLabel}>Your Record</Text>
                    <View style={styles.recordRow}>
                        {isWinning && <Trophy size={24} color={colors.success} />}
                        {isLosing && <TrendingDown size={24} color={colors.error} />}
                        {isTied && <Minus size={24} color={colors.text} />}
                        <Text
                            style={[
                                styles.recordValue,
                                isWinning && styles.winningRecord,
                                isLosing && styles.losingRecord,
                            ]}
                        >
                            {recordString}
                        </Text>
                    </View>
                    <Text style={styles.recordSubtext}>
                        {sharedRoundsCount} round{sharedRoundsCount !== 1 ? "s" : ""} played
                        together
                    </Text>
                </View>
            </View>

            {/* Comparison Stats */}
            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Your Avg</Text>
                    <Text style={styles.statValue}>
                        {myAvgScore !== null ? myAvgScore : "--"}
                    </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Their Avg</Text>
                    <Text style={styles.statValue}>
                        {theirAvgScore !== null ? theirAvgScore : "--"}
                    </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Margin</Text>
                    <View style={styles.marginContainer}>
                        {avgMargin !== null && avgMargin > 0 && (
                            <TrendingUp size={14} color={colors.success} />
                        )}
                        {avgMargin !== null && avgMargin < 0 && (
                            <TrendingDown size={14} color={colors.error} />
                        )}
                        <Text
                            style={[
                                styles.statValue,
                                avgMargin !== null && avgMargin > 0 && styles.positiveMargin,
                                avgMargin !== null && avgMargin < 0 && styles.negativeMargin,
                            ]}
                        >
                            {marginDisplay}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Recent Matchups */}
            {recentRounds.length > 0 && (
                <View style={styles.recentSection}>
                    <Text style={styles.recentTitle}>Recent Matchups</Text>
                    {recentRounds.map((round) => (
                        <TouchableOpacity
                            key={round.roundId}
                            style={styles.matchupRow}
                            onPress={() => onRoundPress?.(round.roundId)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.matchupInfo}>
                                <Text style={styles.matchupCourse} numberOfLines={1}>
                                    {round.courseName}
                                </Text>
                                <Text style={styles.matchupDate}>
                                    {new Date(round.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </Text>
                            </View>
                            <View style={styles.matchupScores}>
                                <Text
                                    style={[
                                        styles.matchupScore,
                                        round.winner === "me" && styles.winnerScore,
                                    ]}
                                >
                                    {round.myScore}
                                </Text>
                                <Text style={styles.matchupVs}>vs</Text>
                                <Text
                                    style={[
                                        styles.matchupScore,
                                        round.winner === "them" && styles.winnerScore,
                                    ]}
                                >
                                    {round.theirScore}
                                </Text>
                                {round.winner === "me" && (
                                    <View style={styles.winBadge}>
                                        <Text style={styles.winBadgeText}>W</Text>
                                    </View>
                                )}
                                {round.winner === "them" && (
                                    <View style={styles.lossBadge}>
                                        <Text style={styles.lossBadgeText}>L</Text>
                                    </View>
                                )}
                                {round.winner === "tie" && (
                                    <View style={styles.tieBadge}>
                                        <Text style={styles.tieBadgeText}>T</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 8,
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 16,
    },
    emptyText: {
        fontSize: 14,
        color: colors.text,
        textAlign: "center",
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.6,
        textAlign: "center",
    },
    recordSection: {
        alignItems: "center",
        marginBottom: 16,
    },
    recordContainer: {
        alignItems: "center",
        backgroundColor: `${colors.text}08`,
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 32,
        width: "100%",
    },
    recordLabel: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.7,
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    recordRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    recordValue: {
        fontSize: 36,
        fontWeight: "700",
        color: colors.text,
    },
    winningRecord: {
        color: colors.success,
    },
    losingRecord: {
        color: colors.error,
    },
    recordSubtext: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.6,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: "row",
        backgroundColor: `${colors.text}05`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    statItem: {
        flex: 1,
        alignItems: "center",
    },
    statDivider: {
        width: 1,
        backgroundColor: colors.border,
        marginHorizontal: 8,
    },
    statLabel: {
        fontSize: 11,
        color: colors.text,
        opacity: 0.6,
        marginBottom: 4,
        textTransform: "uppercase",
    },
    statValue: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
    },
    marginContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    positiveMargin: {
        color: colors.success,
    },
    negativeMargin: {
        color: colors.error,
    },
    recentSection: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 12,
    },
    recentTitle: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.7,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    matchupRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.border}50`,
    },
    matchupInfo: {
        flex: 1,
        marginRight: 12,
    },
    matchupCourse: {
        fontSize: 14,
        color: colors.text,
        fontWeight: "500",
    },
    matchupDate: {
        fontSize: 11,
        color: colors.text,
        opacity: 0.6,
    },
    matchupScores: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    matchupScore: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        minWidth: 28,
        textAlign: "center",
    },
    winnerScore: {
        color: colors.success,
    },
    matchupVs: {
        fontSize: 11,
        color: colors.text,
        opacity: 0.5,
    },
    winBadge: {
        backgroundColor: colors.success,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
    },
    winBadgeText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
    },
    lossBadge: {
        backgroundColor: colors.error,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
    },
    lossBadgeText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
    },
    tieBadge: {
        backgroundColor: colors.text,
        opacity: 0.5,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
    },
    tieBadgeText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
    },
});
