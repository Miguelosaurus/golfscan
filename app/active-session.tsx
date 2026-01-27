import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    Modal,
    TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { formatBetLineFromSession, type HoleSelection, type PayoutMode } from '@/utils/betDisplay';
import {
    Camera,
    Users,
    MapPin,
    Flag,
    DollarSign,
    Target,
    ArrowLeftRight,
    PlusCircle,
    MinusCircle,
    Leaf,       // Greenie
    Waves,      // Sandy (bunker)
    Bird,       // Birdie
    TrendingDown, // Press
    X,           // Close modal
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
    sideBets?: {
        greenies: boolean;
        sandies: boolean;
        birdies: boolean;
        amountCents: number;
    };
}

interface SessionData {
    _id: string;
    gameType: string;
    gameMode: string;
    holeSelection: HoleSelection;
    payoutMode?: PayoutMode;
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

    // Get current user profile to determine initiatedBy
    const profile = useQuery(api.users.getProfile);

    // Compute current user's playerId from session participants
    const currentPlayerId = useMemo(() => {
        if (!session?.playerDetails || !profile?._id) return null;

        // Get full session with participants (cast to access participants array)
        const sessionWithParticipants = session as any;
        const participants = sessionWithParticipants.participants || [];

        // Match by userId from profile
        const match = participants.find((p: any) => p.userId === profile._id);
        if (match) return match.playerId as string;

        // Fallback: use first player if no match (shouldn't happen in normal use)
        return session.playerDetails[0]?.playerId || null;
    }, [session, profile?._id]);

    // Side bet tracking state - must be declared before any early return
    const [sideBetCounts, setSideBetCounts] = useState<{
        [playerId: string]: { greenies: number; sandies: number };
    }>({});

    // Initialize side bet counts when session loads - load from persisted data
    React.useEffect(() => {
        if (session?.playerDetails) {
            setSideBetCounts(() => {
                const initial: { [playerId: string]: { greenies: number; sandies: number } } = {};
                const persisted = (session as any).sideBetTracking || [];

                session.playerDetails.forEach((p: PlayerDetail) => {
                    // Look for persisted count for this player
                    const tracked = persisted.find((t: any) => t.playerId === p.playerId);
                    initial[p.playerId] = {
                        greenies: tracked?.greenies || 0,
                        sandies: tracked?.sandies || 0,
                    };
                });
                return initial;
            });
        }
    }, [session?.playerDetails, (session as any)?.sideBetTracking]);

    // Mutation to persist side bet counts
    const updateSideBetCountsMutation = useMutation(api.gameSessions.updateSideBetCounts);

    // Press modal state and mutation
    const [pressModalVisible, setPressModalVisible] = useState(false);
    const [pressSegment, setPressSegment] = useState<'front' | 'back'>('front');
    const [pressStartHole, setPressStartHole] = useState('');
    const [selectedPairingId, setSelectedPairingId] = useState<string | null>(null);
    const [pressLoading, setPressLoading] = useState(false);
    const addPressMutation = useMutation(api.gameSessions.addPress);

    // Generate pairings for individual mode (round-robin)
    const pairings = useMemo(() => {
        if (!session || session.gameMode !== 'individual') return [];

        const players = session.playerDetails || [];
        const result: { pairingId: string; playerA: string; playerB: string; playerAId: string; playerBId: string }[] = [];

        // Sort by playerId for deterministic ordering
        const sortedPlayers = [...players].sort((a, b) =>
            a.playerId.localeCompare(b.playerId)
        );

        for (let i = 0; i < sortedPlayers.length; i++) {
            for (let j = i + 1; j < sortedPlayers.length; j++) {
                const pA = sortedPlayers[i];
                const pB = sortedPlayers[j];
                result.push({
                    pairingId: `${pA.playerId}_vs_${pB.playerId}`,
                    playerA: pA.name,
                    playerB: pB.name,
                    playerAId: pA.playerId,
                    playerBId: pB.playerId,
                });
            }
        }
        return result;
    }, [session?.playerDetails, session?.gameMode]);

    // Handle adding a press
    const handleAddPress = async () => {
        if (!session || !sessionId) return;

        const startHoleNum = parseInt(pressStartHole, 10);
        if (isNaN(startHoleNum)) {
            alert('Please enter a valid hole number');
            return;
        }

        // Validate segment is valid for round's holeSelection
        if (session.holeSelection === 'front_9' && pressSegment !== 'front') {
            alert('This is a front 9 round - only front segment presses are allowed');
            return;
        }
        if (session.holeSelection === 'back_9' && pressSegment !== 'back') {
            alert('This is a back 9 round - only back segment presses are allowed');
            return;
        }

        // Validate hole is in correct range for segment
        if (pressSegment === 'front' && (startHoleNum < 1 || startHoleNum > 9)) {
            alert('Front segment presses must start on holes 1-9');
            return;
        }
        if (pressSegment === 'back' && (startHoleNum < 10 || startHoleNum > 18)) {
            alert('Back segment presses must start on holes 10-18');
            return;
        }

        // For individual mode, require pairing selection
        if (session.gameMode === 'individual' && !selectedPairingId) {
            alert('Please select which matchup to press');
            return;
        }

        // Validate current user is identified
        if (!currentPlayerId) {
            alert('Unable to identify current user. Please try again.');
            return;
        }

        setPressLoading(true);
        try {
            await addPressMutation({
                sessionId: sessionId as Id<'gameSessions'>,
                pressId: `press_${Date.now()}`,
                startHole: startHoleNum,
                segment: pressSegment,
                // initiatedBy is now derived server-side from authenticated user
                valueCents: session.betSettings?.betPerUnitCents || 500,
                pairingId: session.gameMode === 'individual' ? selectedPairingId ?? undefined : undefined,
            });
            setPressModalVisible(false);
            setPressStartHole('');
            setSelectedPairingId(null);
        } catch (error: any) {
            alert(error.message || 'Failed to add press');
        } finally {
            setPressLoading(false);
        }
    };

    const updateSideBetCount = async (playerId: string, type: 'greenies' | 'sandies', delta: number) => {
        const newCount = Math.max(0, (sideBetCounts[playerId]?.[type] || 0) + delta);

        // Update local state for immediate UI feedback
        setSideBetCounts((prev) => ({
            ...prev,
            [playerId]: {
                ...prev[playerId],
                [type]: newCount,
            },
        }));

        // Persist to Convex
        if (sessionId) {
            try {
                await updateSideBetCountsMutation({
                    sessionId: sessionId as Id<'gameSessions'>,
                    playerId: playerId as Id<'players'>,
                    greenies: type === 'greenies' ? newCount : (sideBetCounts[playerId]?.greenies || 0),
                    sandies: type === 'sandies' ? newCount : (sideBetCounts[playerId]?.sandies || 0),
                });
            } catch (e) {
                console.error('[ActiveSession] Failed to persist side bet count:', e);
            }
        }
    };

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

    const betLine = formatBetLineFromSession({
        gameType: session.gameType,
        holeSelection: session.holeSelection,
        payoutMode: (session.payoutMode ?? 'war') as PayoutMode,
        betSettings: session.betSettings,
    });

    // Calculate strokes based on course handicap differences (for display purposes)
    // The lowest HCP player gives strokes to others
    // When strokes > 18, player gets 2 strokes on some holes
    const calculateDisplayStrokes = () => {
        if (!session.playerDetails || session.playerDetails.length < 2) return [];

        const minCourseHcp = Math.min(...session.playerDetails.map(p => p.courseHandicap));

        // Get hole handicaps from course (sorted by difficulty - lowest hcp = hardest)
        // Check multiple possible sources for hole data: course.holes, teeSets holes
        let holes: any[] = session.course?.holes || [];

        // If holes is empty, try to get from first tee set
        if (holes.length === 0 && (session.course as any)?.teeSets?.[0]?.holes) {
            holes = (session.course as any).teeSets[0].holes;
        }

        const holesByDifficulty = [...Array(18)].map((_, i) => {
            const hole = holes.find((h: any) => h.number === i + 1);
            // Check for hcp first (Convex format), then handicap (local format), then fallback
            const hcp = hole?.hcp ?? hole?.handicap ?? (i + 1);
            return { number: i + 1, hcp };
        }).sort((a, b) => a.hcp - b.hcp);

        return session.playerDetails.map(player => {
            const strokesReceived = player.courseHandicap - minCourseHcp;

            // Calculate 1-stroke and 2-stroke holes
            // If strokes <= 18: get 1 stroke on the hardest N holes
            // If strokes > 18: get 1 stroke on ALL holes + 2 strokes on (strokes - 18) hardest
            const singleStrokeHoles: number[] = [];
            const doubleStrokeHoles: number[] = [];

            if (strokesReceived > 0 && strokesReceived <= 18) {
                // Simple case: N strokes on N hardest holes
                holesByDifficulty.slice(0, strokesReceived).forEach(h => {
                    singleStrokeHoles.push(h.number);
                });
            } else if (strokesReceived > 18) {
                // More than 18 strokes: 1 on all + 2 on extra
                const extraStrokes = strokesReceived - 18;
                // The hardest (extraStrokes) holes get 2 strokes
                holesByDifficulty.slice(0, extraStrokes).forEach(h => {
                    doubleStrokeHoles.push(h.number);
                });
            }

            return {
                playerId: player.playerId,
                name: player.name,
                strokesReceived,
                singleStrokeHoles: singleStrokeHoles.sort((a, b) => a - b),
                doubleStrokeHoles: doubleStrokeHoles.sort((a, b) => a - b),
                getsStrokeOnAllHoles: strokesReceived > 18,
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
                        {/* High handicap: gets stroke on all holes + double on some */}
                        {player.getsStrokeOnAllHoles && (
                            <View style={styles.strokeHolesSection}>
                                <Text style={styles.strokeHolesLabel}>
                                    1 stroke on all holes
                                    {player.doubleStrokeHoles.length > 0 && `, plus 2nd stroke on:`}
                                </Text>
                                {player.doubleStrokeHoles.length > 0 && (
                                    <View style={styles.strokeHolesRow}>
                                        {player.doubleStrokeHoles.map((hole: number) => (
                                            <View key={hole} style={[styles.strokeHolePill, { backgroundColor: THEME.accentOrange + '20' }]}>
                                                <Text style={[styles.strokeHolePillText, { color: THEME.accentOrange }]}>{hole}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Normal handicap: show specific holes */}
                        {!player.getsStrokeOnAllHoles && player.singleStrokeHoles.length > 0 && (
                            <View style={styles.strokeHolesSection}>
                                <Text style={styles.strokeHolesLabel}>Strokes on holes:</Text>
                                <View style={styles.strokeHolesRow}>
                                    {player.singleStrokeHoles.map((hole: number) => (
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
                {session.betSettings?.enabled && betLine && (
                    <>
                        <View style={styles.sectionHeader}>
                            <DollarSign size={18} color={THEME.textMain} />
                            <Text style={styles.sectionTitle}>Bet</Text>
                        </View>

                        <View style={styles.betCard}>
                            <Text style={styles.betAmount}>
                                {betLine}
                            </Text>
                            {session.betSettings.carryover && (
                                <Text style={styles.betDetail}>Carryover enabled</Text>
                            )}
                            {session.betSettings.pressEnabled && (
                                <Text style={styles.betDetail}>
                                    Presses enabled (threshold: {session.betSettings.pressThreshold ?? 2} down)
                                </Text>
                            )}
                            {/* Press Button for Nassau games */}
                            {session.gameType === 'nassau' && session.betSettings.pressEnabled && (
                                <TouchableOpacity
                                    style={styles.pressButton}
                                    onPress={() => setPressModalVisible(true)}
                                >
                                    <TrendingDown size={16} color="white" />
                                    <Text style={styles.pressButtonText}>Add Press</Text>
                                </TouchableOpacity>
                            )}
                            {/* Existing Presses List */}
                            {(session as any).presses && (session as any).presses.length > 0 && (
                                <View style={styles.pressListContainer}>
                                    <Text style={styles.pressListTitle}>
                                        Active Presses ({(session as any).presses.length})
                                    </Text>
                                    {(session as any).presses.map((press: any, idx: number) => (
                                        <View key={press.pressId || idx} style={styles.pressListItem}>
                                            <View style={styles.pressListItemLeft}>
                                                <Text style={styles.pressListSegment}>
                                                    {press.segment === 'front' ? 'Front 9' : 'Back 9'}
                                                </Text>
                                                <Text style={styles.pressListHole}>
                                                    Starting Hole {press.startHole}
                                                </Text>
                                            </View>
                                            <Text style={styles.pressListValue}>
                                                ${(press.valueCents / 100).toFixed(0)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </>
                )}

                {/* Side Bets Tracking */}
                {session.betSettings?.sideBets && (session.betSettings.sideBets.greenies || session.betSettings.sideBets.sandies) && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Bird size={18} color={THEME.textMain} />
                            <Text style={styles.sectionTitle}>
                                Side Bets (${(session.betSettings.sideBets.amountCents / 100).toFixed(0)} each)
                            </Text>
                        </View>

                        <View style={styles.sideBetsCard}>
                            {session.playerDetails.map((player) => (
                                <View key={player.playerId} style={styles.sideBetPlayerRow}>
                                    <View style={styles.sideBetPlayerInfo}>
                                        <View style={styles.playerAvatarSmall}>
                                            <Text style={styles.playerInitialSmall}>
                                                {player.name?.charAt(0) ?? '?'}
                                            </Text>
                                        </View>
                                        <Text style={styles.sideBetPlayerName}>{player.name}</Text>
                                    </View>

                                    <View style={styles.sideBetCounters}>
                                        {/* Greenie counter */}
                                        {session.betSettings?.sideBets?.greenies && (
                                            <View style={styles.sideBetCounter}>
                                                <Leaf size={14} color={THEME.primaryGreen} />
                                                <TouchableOpacity onPress={() => updateSideBetCount(player.playerId, 'greenies', -1)}>
                                                    <MinusCircle size={22} color={THEME.textSub} />
                                                </TouchableOpacity>
                                                <Text style={styles.sideBetCount}>
                                                    {sideBetCounts[player.playerId]?.greenies || 0}
                                                </Text>
                                                <TouchableOpacity onPress={() => updateSideBetCount(player.playerId, 'greenies', 1)}>
                                                    <PlusCircle size={22} color={THEME.primaryGreen} />
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {/* Sandy counter */}
                                        {session.betSettings?.sideBets?.sandies && (
                                            <View style={styles.sideBetCounter}>
                                                <Waves size={14} color={THEME.accentOrange} />
                                                <TouchableOpacity onPress={() => updateSideBetCount(player.playerId, 'sandies', -1)}>
                                                    <MinusCircle size={22} color={THEME.textSub} />
                                                </TouchableOpacity>
                                                <Text style={styles.sideBetCount}>
                                                    {sideBetCounts[player.playerId]?.sandies || 0}
                                                </Text>
                                                <TouchableOpacity onPress={() => updateSideBetCount(player.playerId, 'sandies', 1)}>
                                                    <PlusCircle size={22} color={THEME.accentOrange} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                            <Text style={styles.sideBetHint}>
                                Tap + when a player makes a greenie or sandy
                            </Text>
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

            {/* Press Modal */}
            <Modal
                visible={pressModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setPressModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Press</Text>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setPressModalVisible(false)}
                            >
                                <X size={24} color={THEME.textSub} />
                            </TouchableOpacity>
                        </View>

                        {/* Segment Selection */}
                        <View style={styles.modalField}>
                            <Text style={styles.modalLabel}>Segment</Text>
                            <View style={styles.segmentRow}>
                                <TouchableOpacity
                                    style={[styles.segmentButton, pressSegment === 'front' && styles.segmentButtonActive]}
                                    onPress={() => setPressSegment('front')}
                                >
                                    <Text style={[styles.segmentButtonText, pressSegment === 'front' && styles.segmentButtonTextActive]}>
                                        Front 9
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.segmentButton, pressSegment === 'back' && styles.segmentButtonActive]}
                                    onPress={() => setPressSegment('back')}
                                >
                                    <Text style={[styles.segmentButtonText, pressSegment === 'back' && styles.segmentButtonTextActive]}>
                                        Back 9
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Start Hole */}
                        <View style={styles.modalField}>
                            <Text style={styles.modalLabel}>
                                Start Hole ({pressSegment === 'front' ? '1-9' : '10-18'})
                            </Text>
                            <TextInput
                                style={styles.holeInput}
                                value={pressStartHole}
                                onChangeText={setPressStartHole}
                                placeholder={pressSegment === 'front' ? '1-9' : '10-18'}
                                keyboardType="number-pad"
                                placeholderTextColor={THEME.textSub}
                            />
                        </View>

                        {/* Pairing Selection for Individual Mode */}
                        {session?.gameMode === 'individual' && pairings.length > 0 && (
                            <View style={styles.modalField}>
                                <Text style={styles.modalLabel}>Choose Matchup</Text>
                                {pairings.map((p) => (
                                    <TouchableOpacity
                                        key={p.pairingId}
                                        style={[styles.pairingButton, selectedPairingId === p.pairingId && styles.pairingButtonActive]}
                                        onPress={() => setSelectedPairingId(p.pairingId)}
                                    >
                                        <Text style={styles.pairingButtonText}>
                                            {p.playerA} vs {p.playerB}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Confirm Button */}
                        <TouchableOpacity
                            style={[styles.confirmPressButton, pressLoading && styles.confirmPressButtonDisabled]}
                            onPress={handleAddPress}
                            disabled={pressLoading}
                        >
                            <Text style={styles.confirmPressButtonText}>
                                {pressLoading ? 'Adding...' : 'Confirm Press'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    // Side bets tracking
    sideBetsCard: {
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
    sideBetPlayerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    sideBetPlayerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sideBetPlayerName: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textMain,
    },
    sideBetCounters: {
        flexDirection: 'row',
        gap: 16,
    },
    sideBetCounter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: THEME.lightGreenBg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    sideBetCount: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.textMain,
        minWidth: 20,
        textAlign: 'center',
    },
    sideBetHint: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 12,
        textAlign: 'center',
        fontStyle: 'italic',
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
    // Press button styles
    pressButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: THEME.accentOrange,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
    },
    pressButtonText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '700',
    },
    // Press modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: THEME.textMain,
    },
    modalCloseButton: {
        padding: 4,
    },
    modalField: {
        marginBottom: 16,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 8,
    },
    segmentRow: {
        flexDirection: 'row',
        gap: 12,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: THEME.border,
        alignItems: 'center',
    },
    segmentButtonActive: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
    },
    segmentButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textSub,
    },
    segmentButtonTextActive: {
        color: THEME.primaryGreen,
    },
    holeInput: {
        borderWidth: 2,
        borderColor: THEME.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        color: THEME.textMain,
    },
    pairingButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: THEME.border,
        marginBottom: 8,
    },
    pairingButtonActive: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
    },
    pairingButtonText: {
        fontSize: 15,
        fontWeight: '500',
        color: THEME.textMain,
    },
    confirmPressButton: {
        backgroundColor: THEME.accentOrange,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    confirmPressButtonDisabled: {
        backgroundColor: THEME.border,
    },
    confirmPressButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
    // Press list styles
    pressListContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: THEME.border,
    },
    pressListTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 8,
    },
    pressListItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: THEME.lightGreenBg,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 6,
    },
    pressListItemLeft: {
        flex: 1,
    },
    pressListSegment: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.primaryGreen,
    },
    pressListHole: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 2,
    },
    pressListValue: {
        fontSize: 16,
        fontWeight: '700',
        color: THEME.textMain,
    },
});
