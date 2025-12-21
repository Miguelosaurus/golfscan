import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import {
    Camera,
    Users,
    MapPin,
    Flag,
    DollarSign,
    Target,
    ArrowLeftRight,
} from 'lucide-react-native';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
    primaryGreen: '#1E6059',
    lightGreenBg: '#E8F3F1',
    accentOrange: '#FC661A',
    textMain: '#1A3330',
    textSub: '#5C706D',
    border: '#E0E0E0',
    card: '#FFFFFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PlayerDetail {
    playerId: string;
    name: string;
    handicapIndex: number;
    courseHandicap: number;
    teeName?: string;
    teeGender?: string;
}

interface StrokeAllocation {
    playerId: string;
    strokesByHole: number[];
}

interface Side {
    sideId: string;
    name?: string;
    playerIds: string[];
}

interface BetSettings {
    enabled: boolean;
    betPerUnitCents: number;
    carryover?: boolean;
    pressEnabled?: boolean;
    pressThreshold?: number;
}

interface SessionData {
    _id: string;
    gameType: string;
    gameMode: string;
    holeSelection: string;
    course?: { name: string; holes?: { number: number; hcp: number }[] } | null;
    playerDetails: PlayerDetail[];
    netStrokeAllocations: StrokeAllocation[];
    sides: Side[];
    betSettings?: BetSettings | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ActiveSessionScreen() {
    const router = useRouter();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

    // Fetch session data
    const session = useQuery(
        api.gameSessions.getById,
        sessionId ? { sessionId: sessionId as Id<'gameSessions'> } : 'skip'
    ) as SessionData | null;

    if (!session) {
        return (
            <SafeAreaView style={styles.container}>
                <Stack.Screen options={{ title: 'Active Session', headerBackTitle: 'Back' }} />
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading session...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const formatGameType = (type: string) => {
        return type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const formatGameMode = (mode: string) => {
        switch (mode) {
            case 'head_to_head': return '1 vs 1';
            case 'teams': return '2 vs 2';
            case 'individual': return 'Everyone vs Everyone';
            default: return mode;
        }
    };

    const formatHoleSelection = (sel: string) => {
        switch (sel) {
            case '18': return '18 Holes';
            case 'front_9': return 'Front 9';
            case 'back_9': return 'Back 9';
            default: return sel;
        }
    };

    const handleScanScorecard = () => {
        router.push(`/scan-scorecard?sessionId=${sessionId}`);
    };

    const betAmountDollars = session.betSettings?.enabled
        ? (session.betSettings.betPerUnitCents / 100).toFixed(0)
        : null;

    const getBetUnitLabel = () => {
        switch (session.gameType) {
            case 'skins': return 'per skin';
            case 'match_play': return 'per match';
            case 'nassau': return 'per point';
            default: return 'per player';
        }
    };

    // Calculate strokes based on course handicap differences (for display purposes)
    // The lowest HCP player gives strokes to others
    const calculateDisplayStrokes = () => {
        if (!session.playerDetails || session.playerDetails.length < 2) return [];

        const minCourseHcp = Math.min(...session.playerDetails.map(p => p.courseHandicap));

        return session.playerDetails.map(player => {
            const strokesReceived = player.courseHandicap - minCourseHcp;
            // Get holes where strokes are received (based on HCP ranking)
            const strokeHoles: number[] = [];
            if (strokesReceived > 0 && session.course?.holes) {
                // Sort holes by handicap (HCP)
                const sortedHoles = [...session.course.holes].sort((a, b) => a.hcp - b.hcp);
                for (let i = 0; i < Math.min(strokesReceived, 18); i++) {
                    if (sortedHoles[i]) {
                        strokeHoles.push(sortedHoles[i].number);
                    }
                }
                strokeHoles.sort((a, b) => a - b); // Sort by hole number for display
            }
            return {
                playerId: player.playerId,
                name: player.name,
                strokesReceived,
                strokeHoles,
            };
        });
    };

    const displayStrokes = calculateDisplayStrokes();

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ title: 'Active Session', headerBackTitle: 'Back' }} />

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                {/* Game Type & Mode */}
                <View style={styles.heroSection}>
                    <Text style={styles.gameTypeLabel}>
                        {formatGameType(session.gameType)}
                    </Text>
                    <Text style={styles.gameModeLabel}>
                        {formatGameMode(session.gameMode)}
                    </Text>
                </View>

                {/* STROKES FIRST (most important) */}
                <View style={styles.sectionHeader}>
                    <Target size={18} color={THEME.textMain} />
                    <Text style={styles.sectionTitle}>Stroke Allocation</Text>
                </View>

                {displayStrokes.map((player) => (
                    <View key={player.playerId} style={styles.strokePlayerCard}>
                        <View style={styles.strokePlayerHeader}>
                            <View style={styles.strokePlayerLeft}>
                                <View style={styles.playerAvatarSmall}>
                                    <Text style={styles.playerInitialSmall}>
                                        {player.name?.charAt(0) ?? '?'}
                                    </Text>
                                </View>
                                <Text style={styles.strokePlayerName}>{player.name}</Text>
                            </View>
                            {player.strokesReceived > 0 ? (
                                <View style={styles.strokeCountBadge}>
                                    <Text style={styles.strokeCountText}>+{player.strokesReceived}</Text>
                                </View>
                            ) : (
                                <Text style={styles.scratchLabel}>Scratch</Text>
                            )}
                        </View>
                        {player.strokesReceived > 0 && player.strokeHoles.length > 0 && (
                            <View style={styles.strokeHolesSection}>
                                <Text style={styles.strokeHolesLabel}>Strokes on holes:</Text>
                                <View style={styles.strokeHolesRow}>
                                    {player.strokeHoles.map((hole) => (
                                        <View key={hole} style={styles.strokeHolePill}>
                                            <Text style={styles.strokeHolePillText}>{hole}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                ))}

                {/* Teams/Sides (if applicable) */}
                {session.sides.length === 2 && session.gameMode !== 'individual' && (
                    <>
                        <View style={styles.sectionHeader}>
                            <ArrowLeftRight size={18} color={THEME.textMain} />
                            <Text style={styles.sectionTitle}>Matchup</Text>
                        </View>

                        <View style={styles.matchupCard}>
                            <View style={styles.sideContainer}>
                                <Text style={styles.sideLabel}>Side A</Text>
                                {session.sides[0].playerIds.map((playerId) => {
                                    const player = session.playerDetails.find(
                                        (p) => p.playerId === playerId
                                    );
                                    return (
                                        <Text key={playerId} style={styles.sideName}>
                                            {player?.name ?? 'Unknown'}
                                        </Text>
                                    );
                                })}
                            </View>

                            <Text style={styles.vsText}>VS</Text>

                            <View style={styles.sideContainer}>
                                <Text style={styles.sideLabel}>Side B</Text>
                                {session.sides[1].playerIds.map((playerId) => {
                                    const player = session.playerDetails.find(
                                        (p) => p.playerId === playerId
                                    );
                                    return (
                                        <Text key={playerId} style={styles.sideName}>
                                            {player?.name ?? 'Unknown'}
                                        </Text>
                                    );
                                })}
                            </View>
                        </View>
                    </>
                )}

                {/* Betting */}
                {session.betSettings?.enabled && betAmountDollars && (
                    <>
                        <View style={styles.sectionHeader}>
                            <DollarSign size={18} color={THEME.textMain} />
                            <Text style={styles.sectionTitle}>Bet</Text>
                        </View>

                        <View style={styles.betCard}>
                            <Text style={styles.betAmount}>
                                ${betAmountDollars} {getBetUnitLabel()}
                            </Text>
                            {session.betSettings.carryover && (
                                <Text style={styles.betDetail}>Carryover enabled</Text>
                            )}
                            {session.betSettings.pressEnabled && (
                                <Text style={styles.betDetail}>
                                    Presses enabled (threshold: {session.betSettings.pressThreshold ?? 2} down)
                                </Text>
                            )}
                        </View>
                    </>
                )}

                {/* Course & Holes */}
                <View style={styles.sectionHeader}>
                    <MapPin size={18} color={THEME.textMain} />
                    <Text style={styles.sectionTitle}>Course</Text>
                </View>

                <View style={styles.infoCard}>
                    <Text style={styles.courseName}>
                        {session.course?.name ?? 'Unknown Course'}
                    </Text>
                    <View style={styles.holesRow}>
                        <Flag size={14} color={THEME.textSub} />
                        <Text style={styles.holesText}>
                            {formatHoleSelection(session.holeSelection)}
                        </Text>
                    </View>
                </View>

                {/* Players */}
                <View style={styles.sectionHeader}>
                    <Users size={18} color={THEME.textMain} />
                    <Text style={styles.sectionTitle}>Players</Text>
                </View>

                <View style={styles.playersCard}>
                    {session.playerDetails.map((player) => (
                        <View key={player.playerId} style={styles.playerRow}>
                            <View style={styles.playerAvatar}>
                                <Text style={styles.playerInitial}>
                                    {player.name?.charAt(0) ?? '?'}
                                </Text>
                            </View>
                            <View style={styles.playerInfo}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerDetails}>
                                    HCP {player.handicapIndex.toFixed(1)} • Course HCP {player.courseHandicap}
                                    {player.teeName ? ` • ${player.teeName}` : ''}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Footer CTA */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanScorecard}
                >
                    <Camera size={20} color="white" />
                    <Text style={styles.scanButtonText}>Scan Scorecard</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        color: THEME.textSub,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    gameTypeLabel: {
        fontSize: 28,
        fontWeight: '800',
        color: THEME.textMain,
        marginBottom: 4,
    },
    gameModeLabel: {
        fontSize: 16,
        color: THEME.primaryGreen,
        fontWeight: '600',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: THEME.textMain,
    },
    // Stroke allocation cards (matching PreRoundFlowModal)
    strokePlayerCard: {
        backgroundColor: THEME.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
        elevation: 1,
    },
    strokePlayerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    strokePlayerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    playerAvatarSmall: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: THEME.accentOrange,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playerInitialSmall: {
        fontSize: 16,
        fontWeight: '700',
        color: 'white',
    },
    strokePlayerName: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
    },
    strokeCountBadge: {
        backgroundColor: THEME.primaryGreen,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 14,
    },
    strokeCountText: {
        fontSize: 16,
        fontWeight: '700',
        color: 'white',
    },
    scratchLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textSub,
    },
    strokeHolesSection: {
        marginTop: 12,
    },
    strokeHolesLabel: {
        fontSize: 13,
        color: THEME.textSub,
        marginBottom: 8,
    },
    strokeHolesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    strokeHolePill: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: THEME.lightGreenBg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    strokeHolePillText: {
        fontSize: 14,
        fontWeight: '700',
        color: THEME.primaryGreen,
    },
    // Course section
    infoCard: {
        backgroundColor: THEME.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    courseName: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 8,
    },
    holesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    holesText: {
        fontSize: 14,
        color: THEME.textSub,
    },
    // Players section
    playersCard: {
        backgroundColor: THEME.card,
        borderRadius: 16,
        padding: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    playerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: THEME.accentOrange,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    playerInitial: {
        fontSize: 18,
        fontWeight: '700',
        color: 'white',
    },
    playerInfo: {
        flex: 1,
    },
    playerName: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textMain,
    },
    playerDetails: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 2,
    },
    // Matchup section
    matchupCard: {
        backgroundColor: THEME.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sideContainer: {
        flex: 1,
        alignItems: 'center',
    },
    sideLabel: {
        fontSize: 11,
        color: THEME.accentOrange,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
    },
    sideName: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 2,
    },
    vsText: {
        fontSize: 14,
        fontWeight: '800',
        color: THEME.primaryGreen,
        marginHorizontal: 16,
    },
    // Bet section
    betCard: {
        backgroundColor: THEME.lightGreenBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: THEME.primaryGreen,
    },
    betAmount: {
        fontSize: 20,
        fontWeight: '700',
        color: THEME.primaryGreen,
        marginBottom: 4,
    },
    betDetail: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 2,
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: THEME.card,
        borderTopWidth: 1,
        borderTopColor: THEME.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 10,
    },
    scanButton: {
        backgroundColor: THEME.primaryGreen,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 10,
        shadowColor: THEME.primaryGreen,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    scanButtonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
    },
});
