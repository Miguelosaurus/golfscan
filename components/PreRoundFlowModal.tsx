import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    ActivityIndicator,
    Alert,
    TextInput,
    Animated,
    Dimensions,
    Image,
    Platform,
} from 'react-native';

import {
    X,
    ChevronLeft,
    ChevronRight,
    Camera,
    Play,
    Zap,
    Users,
    Check,
    Info,
} from 'lucide-react-native';
import { useQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'expo-router';
import { CourseSearchModal } from './CourseSearchModal';
import { GameTypeGrid, GameType, GAME_RULES } from './GameTypeGrid';
import { Id } from '@/convex/_generated/dataModel';
import { formatBetLineFromSetup, formatBetPickerLabel } from '@/utils/betDisplay';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type GameMode = 'individual' | 'head_to_head' | 'teams';
type PayoutMode = 'war' | 'pot';
type HoleSelection = '18' | 'front_9' | 'back_9';

interface SelectedPlayer {
    playerId: Id<'players'>;
    name: string;
    handicapIndex: number;
    teeName?: string;
    teeGender?: 'M' | 'F';
}

interface PreRoundFlowModalProps {
    visible: boolean;
    onClose: () => void;
    /** Skip the intent screen and start with a specific intent */
    initialIntent?: 'new_game' | 'quick_strokes';
}

type Step =
    | 'intent'
    | 'course'
    | 'holes'
    | 'players'
    | 'gameType'
    | 'gameRules'
    | 'gameMode'
    | 'betConfig'
    | 'strokeAllocations'
    | 'summary';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine available game modes based on game type and player count.
 * Matrix:
 * - Stroke Play / Skins: always individual only
 * - Match Play / Nassau:
 *   - 2 players: head_to_head only
 *   - 3 players: individual only
 *   - 4 players: individual OR teams (user choice)
 */
function getAvailableGameModes(gameType: GameType, playerCount: number): GameMode[] {
    const modes: GameMode[] = [];

    if (gameType === 'stroke_play' || gameType === 'skins') {
        modes.push('individual');
    } else if (gameType === 'match_play' || gameType === 'nassau') {
        if (playerCount === 2) {
            modes.push('head_to_head');
        } else if (playerCount === 3) {
            modes.push('individual');
        } else if (playerCount === 4) {
            modes.push('teams');
            modes.push('individual');
        }
    }

    return modes;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function PreRoundFlowModal({ visible, onClose, initialIntent }: PreRoundFlowModalProps) {
    const router = useRouter();
    const lastNavAtRef = useRef(0);

    // Step state - start at 'course' if initialIntent is provided
    const [currentStep, setCurrentStep] = useState<Step>(() => initialIntent ? 'course' : 'intent');

    // Track if this was opened with an initial intent (to set game mode)
    const hasAppliedInitialIntent = useRef(false);

    // Apply initial intent settings when modal opens
    React.useEffect(() => {
        if (visible && initialIntent && !hasAppliedInitialIntent.current) {
            hasAppliedInitialIntent.current = true;
            setCurrentStep('course');
            if (initialIntent === 'quick_strokes') {
                // Quick strokes: set sensible defaults so session can be created without game setup
                setGameMode('individual');
                setGameType('stroke_play');
            }
        }
        // Reset when modal closes
        if (!visible) {
            hasAppliedInitialIntent.current = false;
        }
    }, [visible, initialIntent]);

    // Form data
    const [selectedCourse, setSelectedCourse] = useState<any>(null);
    const [holeSelection, setHoleSelection] = useState<HoleSelection>('18');
    const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([]);
    const [gameType, setGameType] = useState<GameType | null>(null);
    const [gameMode, setGameMode] = useState<GameMode>('head_to_head');
    const [payoutMode, setPayoutMode] = useState<PayoutMode>('war');
    const [betEnabled, setBetEnabled] = useState(false);
    const [betAmountDollars, setBetAmountDollars] = useState(5);
    const [carryover, setCarryover] = useState(true);
    const [pressEnabled, setPressEnabled] = useState(false);
    // Bet unit: how winnings are calculated
    const [betUnit, setBetUnit] = useState<'match' | 'hole' | 'stroke_margin' | 'winner'>('match');
    // Side bets ("junk")
    const [sideBets, setSideBets] = useState<{
        greenies: boolean;
        sandies: boolean;
        birdies: boolean;
    }>({ greenies: false, sandies: false, birdies: false });
    const [sideBetAmountDollars, setSideBetAmountDollars] = useState(2);
    // Nassau-specific: separate amounts for each segment
    const [nassauFrontDollars, setNassauFrontDollars] = useState(10);
    const [nassauBackDollars, setNassauBackDollars] = useState(10);
    const [nassauOverallDollars, setNassauOverallDollars] = useState(20);
    // Team assignments for head_to_head and teams modes
    const [teamAssignments, setTeamAssignments] = useState<{
        sideA: string[];
        sideB: string[];
    }>({ sideA: [], sideB: [] });

    // UI state
    const [showCourseModal, setShowCourseModal] = useState(false);
    const [showGameRules, setShowGameRules] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showTeePicker, setShowTeePicker] = useState(false);
    const [showPlayerPicker, setShowPlayerPicker] = useState(false);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [teePickerPlayerId, setTeePickerPlayerId] = useState<Id<'players'> | null>(null);
    const [teePickerGenderTab, setTeePickerGenderTab] = useState<'M' | 'F'>('M');
    // Store tee selection from CourseSearchModal
    const [preselectedTee, setPreselectedTee] = useState<string | null>(null);

    // Normalize bet options so we don't persist invalid combinations across gameType switches.
    React.useEffect(() => {
        if (!gameType) return;
        if (gameType === 'match_play') {
            if (betUnit !== 'match' && betUnit !== 'hole') setBetUnit('match');
            return;
        }
        if (gameType === 'stroke_play') {
            if (betUnit !== 'winner' && betUnit !== 'stroke_margin') {
                setBetUnit('winner');
                setPayoutMode('pot');
                return;
            }
            setPayoutMode(betUnit === 'winner' ? 'pot' : 'war');
        }
    }, [gameType, betUnit]);

    // Auto-assign teams when gameMode or players change
    React.useEffect(() => {
        if (!gameMode || selectedPlayers.length < 2) return;

        if (gameMode === 'head_to_head' && selectedPlayers.length >= 2) {
            setTeamAssignments({
                sideA: [selectedPlayers[0].playerId],
                sideB: [selectedPlayers[1].playerId],
            });
        } else if (gameMode === 'teams' && selectedPlayers.length >= 4) {
            setTeamAssignments({
                sideA: [selectedPlayers[0].playerId, selectedPlayers[1].playerId],
                sideB: [selectedPlayers[2].playerId, selectedPlayers[3].playerId],
            });
        }
    }, [gameMode, selectedPlayers]);

    // Auto-select game mode based on player count
    React.useEffect(() => {
        const playerCount = selectedPlayers.length;
        if (!gameType) return;  // No game type selected yet

        // Use shared helper to determine available modes
        const availableModes = getAvailableGameModes(gameType, playerCount);

        if (availableModes.length === 1 && gameMode !== availableModes[0]) {
            // Only one option, auto-select it
            setGameMode(availableModes[0]);
        } else if (availableModes.length > 1 && !availableModes.includes(gameMode)) {
            // Multiple options but current selection is invalid, default to first option
            setGameMode(availableModes[0]);
        }
    }, [selectedPlayers.length, gameType, gameMode]);

    // Queries - use listWithRounds to only show players who have played rounds (matches history tab)
    const players = useQuery(api.players.listWithRounds);
    const profile = useQuery(api.users.getProfile);
    const myPlayer = players?.find((p: { isSelf: boolean }) => p.isSelf);

    // Use the CALCULATED handicap from handicap.getSummary (lightweight version)
    // This is the same value as getDetails but without expensive course/round joins
    const handicapSummary = useQuery(
        api.handicap.getSummary,
        profile?._id ? { userId: profile._id as any } : "skip"
    );
    const myHandicapIndex = typeof handicapSummary?.currentHandicap === 'number'
        ? handicapSummary.currentHandicap
        : (typeof profile?.handicap === 'number' ? profile.handicap : 0);

    // Add myself if not in selected players
    React.useEffect(() => {
        // We handle adding self user in goNext() now to correctly apply tee selection
    }, [myPlayer]);

    // Mutations
    const createSession = useMutation(api.gameSessions.create);
    const createPlayer = useMutation(api.players.create);

    const handleSelectCourse = (course: any, meta?: { selectedTee?: string }) => {
        setSelectedCourse(course);
        if (meta?.selectedTee) {
            console.log('[PRE-ROUND] Captured selected tee:', meta.selectedTee);
            setPreselectedTee(meta.selectedTee);
        } else {
            setPreselectedTee(null);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════

    const getNextStep = useCallback((): Step | null => {
        // Quick strokes flow: course -> players -> strokeAllocations -> summary
        const isQuickStrokes = initialIntent === 'quick_strokes';

        switch (currentStep) {
            case 'intent':
                return 'course';
            case 'course':
                return 'players';
            case 'players':
                // Quick strokes skips game type, rules, mode, and betting
                if (isQuickStrokes) {
                    return 'strokeAllocations';
                }
                return 'gameType';
            case 'gameType':
                return 'gameRules';
            case 'gameRules':
                // Only show gameMode step if there are 2+ options to choose from
                // This happens for match_play/nassau with exactly 4 players
                // Stroke play and skins are always individual (no choice needed)
                const playerCount = selectedPlayers.length;
                const hasMultipleModes = (gameType === 'match_play' || gameType === 'nassau') && playerCount === 4;
                if (hasMultipleModes) {
                    return 'gameMode';
                }
                return 'betConfig';
            case 'gameMode':
                return 'betConfig';
            case 'betConfig':
                return 'strokeAllocations';
            case 'strokeAllocations':
                return 'summary';
            case 'summary':
                return null; // End
            default:
                return null;
        }
    }, [currentStep, gameType, gameMode, initialIntent, selectedPlayers.length]);

    const getPreviousStep = useCallback((): Step | null => {
        // Quick strokes flow: course -> players -> strokeAllocations -> summary
        const isQuickStrokes = initialIntent === 'quick_strokes';

        switch (currentStep) {
            case 'intent':
                return null;
            case 'course':
                // If started with initialIntent, don't go back to intent
                return initialIntent ? null : 'intent';
            case 'players':
                return 'course';
            case 'gameType':
                return 'players';
            case 'gameRules':
                return 'gameType';
            case 'gameMode':
                return 'gameRules';
            case 'betConfig':
                // Only go back to gameMode if it was shown (match_play/nassau with 4 players)
                const backPlayerCount = selectedPlayers.length;
                const wasGameModeShown = (gameType === 'match_play' || gameType === 'nassau') && backPlayerCount === 4;
                if (wasGameModeShown) {
                    return 'gameMode';
                }
                return 'gameRules';
            case 'strokeAllocations':
                // Quick strokes goes back to players (skipping game/betting steps)
                if (isQuickStrokes) {
                    return 'players';
                }
                return 'betConfig';
            case 'summary':
                return 'strokeAllocations';
            default:
                return null;
        }
    }, [currentStep, gameType, gameMode, initialIntent, selectedPlayers.length]);

    const goNext = () => {
        const next = getNextStep();
        if (next) {
            // Auto-add current user when entering players step
            if (next === 'players' && selectedPlayers.length === 0 && myPlayer) {
                // Determine tee to use: preselected from Search, or fallback logic
                const availableTees = selectedCourse?.teeSets || [];
                console.log('[PRE-ROUND] availableTees:', availableTees.length, 'course:', selectedCourse?.name);

                let teeToUse = null;
                let genderToUse = (myPlayer as any).gender === 'M' || (myPlayer as any).gender === 'F' ? (myPlayer as any).gender : 'M';

                if (preselectedTee) {
                    // Try to find full tee object for preselected name
                    const match = availableTees.find((t: any) => t.name === preselectedTee);
                    if (match) {
                        teeToUse = match;
                        genderToUse = match.gender || genderToUse;
                    } else {
                        // Just use the name if not found in teeSets (shouldn't happen often)
                        teeToUse = { name: preselectedTee };
                    }
                }

                if (!teeToUse && availableTees.length === 1) {
                    // Only auto-select if there's exactly one tee option
                    teeToUse = availableTees[0];
                }

                console.log('[PRE-ROUND] teeToUse:', teeToUse?.name, 'preselected:', preselectedTee);

                setSelectedPlayers([{
                    playerId: myPlayer._id,
                    name: myPlayer.name,
                    handicapIndex: myHandicapIndex,
                    teeName: teeToUse?.name,
                    teeGender: genderToUse,
                }]);
            }
            setCurrentStep(next);
        }
    };

    const goBack = () => {
        const prev = getPreviousStep();
        if (prev) {
            setCurrentStep(prev);
        } else if (initialIntent) {
            // If we started with initialIntent and can't go back, close the modal
            resetAndClose();
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    const handleScanPostRound = () => {
        const now = Date.now();
        if (now - lastNavAtRef.current < 800) {
            console.log('[PRE-ROUND] Ignoring double navigation to /scan-scorecard');
            return;
        }
        lastNavAtRef.current = now;

        console.log('[PRE-ROUND] nav -> /scan-scorecard');
        onClose();
        router.push('/scan-scorecard');
    };

    const resetAndClose = () => {
        setCurrentStep('intent');
        setSelectedCourse(null);
        setPreselectedTee(null);
        setSelectedPlayers([]);
        setHoleSelection('18');
        setGameType(null);
        setGameMode('head_to_head');
        setBetEnabled(false);
        onClose();
    };

    // Build correct stroke allocations for session creation (for settlement calculations)
    const buildStrokeAllocationsForSession = (
        players: SelectedPlayer[],
        course: any
    ): { playerId: Id<'players'>; strokesByHole: number[] }[] => {
        if (players.length < 2) {
            return players.map(p => ({
                playerId: p.playerId,
                strokesByHole: new Array(18).fill(0),
            }));
        }

        // Find lowest handicap as baseline
        const minHandicap = Math.min(...players.map(p => p.handicapIndex));

        // Get hole handicaps from course
        let holes = course?.holes || [];
        if (holes.length === 0 && course?.teeSets?.[0]?.holes) {
            holes = course.teeSets[0].holes;
        }
        if (holes.length === 0 && course?._convexCourse?.holes) {
            holes = course._convexCourse.holes;
        }

        // Sort holes by difficulty (lowest hcp = hardest = gets strokes first)
        const holesByDifficulty = [...Array(18)].map((_, i) => {
            const hole = holes.find((h: any) => h.number === i + 1);
            const hcp = hole?.hcp ?? hole?.handicap ?? (i + 1);
            return { number: i + 1, hcp };
        }).sort((a, b) => a.hcp - b.hcp);

        return players.map(p => {
            const strokesReceived = Math.max(0, Math.round(p.handicapIndex - minHandicap));
            const strokesByHole = new Array(18).fill(0);

            if (strokesReceived <= 18) {
                // 1 stroke on the hardest N holes
                holesByDifficulty.slice(0, strokesReceived).forEach(h => {
                    strokesByHole[h.number - 1] = 1;
                });
            } else {
                // 1 stroke on ALL holes + 2nd stroke on extra hardest
                strokesByHole.fill(1);
                const extraStrokes = strokesReceived - 18;
                holesByDifficulty.slice(0, extraStrokes).forEach(h => {
                    strokesByHole[h.number - 1] = 2;
                });
            }

            return {
                playerId: p.playerId,
                strokesByHole,
            };
        });
    };

    const handleCreateSession = async () => {
        if (!selectedCourse || !gameType || selectedPlayers.length < 2) {
            Alert.alert('Missing Info', 'Please complete all required fields.');
            return;
        }

        setIsCreating(true);
        try {
            // Build participants with course handicaps and tee info
            const participants = selectedPlayers.map((p) => ({
                playerId: p.playerId,
                handicapIndex: p.handicapIndex,
                courseHandicap: Math.round(p.handicapIndex), // Simplified - would calculate properly
                teeName: p.teeName,
                teeGender: p.teeGender,
            }));

            // Build sides based on game mode
            let sides: Array<{ sideId: string; playerIds: Id<'players'>[] }> = [];

            // Force individual logic for status-quo game types
            const creationMode = (gameType === 'stroke_play' || gameType === 'skins')
                ? 'individual'
                : gameMode;

            if (creationMode === 'individual') {
                sides = participants.map((p) => ({
                    sideId: p.playerId,
                    playerIds: [p.playerId],
                }));
            } else if ((creationMode === 'head_to_head' || creationMode === 'teams') && teamAssignments.sideA.length > 0) {
                // Use teamAssignments from UI (wired to swap logic)
                sides = [
                    { sideId: 'side-a', playerIds: teamAssignments.sideA as Id<'players'>[] },
                    { sideId: 'side-b', playerIds: teamAssignments.sideB as Id<'players'>[] },
                ];
            } else if (creationMode === 'head_to_head' && participants.length >= 2) {
                // Fallback for H2H if teamAssignments empty
                sides = [
                    { sideId: 'side-a', playerIds: [participants[0].playerId] },
                    { sideId: 'side-b', playerIds: [participants[1].playerId] },
                ];
            } else if (creationMode === 'teams' && participants.length >= 4) {
                // Fallback for Teams if teamAssignments empty
                sides = [
                    { sideId: 'side-a', playerIds: [participants[0].playerId, participants[1].playerId] },
                    { sideId: 'side-b', playerIds: [participants[2].playerId, participants[3].playerId] },
                ];
            }

            // Build stroke allocations using actual hole handicaps
            const netStrokeAllocations = buildStrokeAllocationsForSession(
                selectedPlayers,
                selectedCourse
            );

            // Get courseId - can be _id (Convex) or id (local/external)
            const convexCourseId = selectedCourse._id;
            const externalCourseId = selectedCourse.id;

            if (!convexCourseId && !externalCourseId) {
                throw new Error('Course ID is missing');
            }

            await createSession({
                // Pass Convex ID if available, otherwise use external ID lookup
                courseId: convexCourseId as Id<'courses'> | undefined,
                courseExternalId: !convexCourseId ? externalCourseId : undefined,
                startAt: Date.now(),
                holeSelection,
                gameType,
                gameMode: creationMode,
                payoutMode,
                participants,
                sides,
                netStrokeAllocations,
                betSettings: betEnabled ? {
                    enabled: true,
                    betPerUnitCents: gameType === 'nassau' ? nassauFrontDollars * 100 : betAmountDollars * 100,
                    ...(gameType === 'skins' ? { betUnit: 'skin' as const } : {}),
                    ...(gameType !== 'nassau' && gameType !== 'skins' ? { betUnit } : {}),
                    carryover: gameType === 'skins' ? carryover : undefined,
                    pressEnabled: gameType === 'nassau' ? pressEnabled : undefined,
                    // Nassau-specific: separate amounts for each segment
                    nassauAmounts: gameType === 'nassau' ? {
                        frontCents: nassauFrontDollars * 100,
                        backCents: nassauBackDollars * 100,
                        overallCents: nassauOverallDollars * 100,
                    } : undefined,
                    sideBets: (sideBets.greenies || sideBets.sandies || sideBets.birdies) ? {
                        ...sideBets,
                        amountCents: sideBetAmountDollars * 100,
                    } : undefined,
                } : undefined,
            });

            Alert.alert('Game Created!', 'Your game session is ready. Scan your scorecard when finished!');
            resetAndClose();
        } catch (error) {
            console.error('Error creating session:', error);
            Alert.alert('Error', 'Failed to create game session. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 'intent':
                return true;
            case 'course':
                return selectedCourse !== null;
            case 'players':
                return selectedPlayers.length >= 2;
            case 'gameType':
                return gameType !== null;
            case 'gameRules':
                return true;
            case 'gameMode':
                return true;
            case 'betConfig':
                return true;
            case 'strokeAllocations':
                return true;
            case 'summary':
                return true;
            default:
                return false;
        }
    }, [currentStep, selectedCourse, selectedPlayers, gameType]);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP CONTENT RENDERERS
    // ═══════════════════════════════════════════════════════════════════════════

    const renderIntentStep = () => (
        <View style={styles.intentContainer}>
            <View style={styles.intentHeader}>
                <View style={{ width: 60, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />
                <Text style={styles.intentTitle}>New Round</Text>
                <Text style={styles.intentSubtitle}>
                    Set up a game or scan a scorecard
                </Text>
            </View>

            <TouchableOpacity
                style={styles.intentCard}
                onPress={() => {
                    setGameType(null); // Reset
                    setCurrentStep('course');
                }}
            >
                <View style={styles.intentImageContainer}>
                    {/* Placeholder for doodle_start_game.png */}
                    <Image
                        source={require('@/assets/images/doodle_start_game.png')}
                        style={styles.intentImage}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.intentTextContainer}>
                    <Text style={styles.intentCardTitle}>Start a New Game</Text>
                    <Text style={styles.intentCardDescription}>
                        Set up strokes, bets, and games before you play
                    </Text>
                </View>
                <ChevronRight size={24} color={THEME.primaryGreen} />
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.intentCard}
                onPress={handleScanPostRound}
            >
                <View style={styles.intentImageContainer}>
                    {/* Placeholder for doodle_scan_scorecard.png */}
                    <Image
                        source={require('@/assets/images/doodle_scan_scorecard.png')}
                        style={styles.intentImage}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.intentTextContainer}>
                    <Text style={styles.intentCardTitle}>Scan Post-Round</Text>
                    <Text style={styles.intentCardDescription}>
                        Scan a scorecard from a round you've already played
                    </Text>
                </View>
                <ChevronRight size={24} color={THEME.primaryGreen} />
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.intentCard}
                onPress={() => {
                    setGameType(null);
                    setGameMode('individual'); // Default to individual for quick strokes
                    setCurrentStep('course');
                }}
            >
                <View style={styles.intentImageContainer}>
                    {/* Placeholder for doodle_quick_strokes.png */}
                    <Image
                        source={require('@/assets/images/doodle_quick_strokes.png')}
                        style={styles.intentImage}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.intentTextContainer}>
                    <Text style={styles.intentCardTitle}>Quick Strokes</Text>
                    <Text style={styles.intentCardDescription}>
                        Just calculate who gives strokes to whom
                    </Text>
                </View>
                <ChevronRight size={24} color={THEME.primaryGreen} />
            </TouchableOpacity>
        </View>
    );

    const renderCourseStep = () => (
        <View style={styles.stepContent}>
            <View style={styles.stepHeaderCenter}>
                <Image
                    source={require('@/assets/images/doodle_select_course.png')}
                    style={styles.stepDoodle}
                    resizeMode="cover"
                />
            </View>
            <Text style={styles.stepTitle}>Course Details</Text>
            <Text style={styles.stepSubtitle}>
                Choose your course and holes for today.
            </Text>

            {selectedCourse ? (
                <>
                    <TouchableOpacity
                        style={[styles.courseSelected, { marginBottom: 20 }]}
                        onPress={() => setShowCourseModal(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.courseName}>{selectedCourse.name}</Text>
                            <Text style={styles.courseLocation}>{selectedCourse.location}</Text>
                        </View>
                        <Text style={styles.changeText}>Change</Text>
                    </TouchableOpacity>

                    <View style={styles.holesGrid}>
                        {(['18', 'front_9', 'back_9'] as HoleSelection[]).map((option) => {
                            const labels: Record<HoleSelection, string> = {
                                '18': '18 Holes',
                                'front_9': 'Front 9',
                                'back_9': 'Back 9',
                            };
                            const isSelected = holeSelection === option;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.holeOption, isSelected && styles.holeOptionSelected, { paddingVertical: 12 }]}
                                    onPress={() => setHoleSelection(option)}
                                >
                                    <Text style={[styles.holeOptionTitle, isSelected && styles.holeOptionTextSelected, { marginBottom: 0 }]}>
                                        {labels[option]}
                                    </Text>
                                    {isSelected && (
                                        <View style={styles.selectionCircle}>
                                            <Check size={16} color="white" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            ) : (
                <TouchableOpacity
                    style={styles.selectCourseButton}
                    onPress={() => setShowCourseModal(true)}
                >
                    <Text style={styles.selectCourseText}>Tap to select a course</Text>
                </TouchableOpacity>
            )}
        </View>
    );



    const renderPlayersStep = () => {
        // Get available tees from the selected course
        const availableTees = selectedCourse?.teeSets || [];

        const openTeePickerForPlayer = (playerId: Id<'players'>, gender?: string) => {
            setTeePickerPlayerId(playerId);
            setTeePickerGenderTab((gender === 'M' || gender === 'F') ? gender : 'M');
            setShowTeePicker(true);
        };

        const handleAddPlayer = () => {
            // Show player picker modal or add from players list
            console.log('[PRE-ROUND] handleAddPlayer called, setting showPlayerPicker to true');
            setShowPlayerPicker(true);
        };

        const handleRemovePlayer = (playerId: Id<'players'>) => {
            setSelectedPlayers(selectedPlayers.filter(p => p.playerId !== playerId));
        };

        const handleHandicapChange = (playerId: Id<'players'>, value: string) => {
            const numValue = parseFloat(value) || 0;
            setSelectedPlayers(selectedPlayers.map(p =>
                p.playerId === playerId
                    ? { ...p, handicapIndex: numValue }
                    : p
            ));
        };

        return (
            <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
                <View style={styles.stepHeaderCenter}>
                    <Image
                        source={require('@/assets/images/doodle_players.png')}
                        style={styles.stepDoodle}
                        resizeMode="cover"
                    />
                </View>
                <View style={styles.playersHeader}>
                    <Text style={styles.stepTitle}>Players</Text>
                    <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer}>
                        <Text style={styles.addPlayerButtonText}>+ Add Player</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.stepSubtitle}>
                    Add players for your round.
                </Text>

                <View style={styles.playersList}>
                    {selectedPlayers.map((sp, index) => {
                        const player = players?.find((p: any) => p._id === sp.playerId);
                        const isSelf = player?.isSelf;

                        return (
                            <View key={sp.playerId} style={[styles.playerCard, isSelf && styles.playerCardSelf]}>
                                {/* Player header row */}
                                <View style={styles.playerCardHeader}>
                                    <Text style={styles.playerCardName}>{sp.name}</Text>
                                    {isSelf && (
                                        <View style={styles.youBadge}>
                                            <Text style={styles.youBadgeText}>You</Text>
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }} />
                                    {!isSelf && (
                                        <TouchableOpacity
                                            style={styles.removePlayerButton}
                                            onPress={() => handleRemovePlayer(sp.playerId)}
                                        >
                                            <X size={18} color={THEME.error} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Handicap and Tee row */}
                                <View style={styles.playerCardDetails}>
                                    <View style={styles.handicapRow}>
                                        <Text style={styles.handicapLabel}>Scandicap:</Text>
                                        {isSelf ? (
                                            <View style={styles.handicapDisplay}>
                                                <Text style={styles.handicapDisplayText}>
                                                    {(myHandicapIndex != null)
                                                        ? Math.max(0, myHandicapIndex).toFixed(1)
                                                        : 'Not set'}
                                                </Text>
                                            </View>
                                        ) : (
                                            <TextInput
                                                style={styles.handicapInput}
                                                value={sp.handicapIndex > 0 ? sp.handicapIndex.toString() : ''}
                                                onChangeText={(val: string) => handleHandicapChange(sp.playerId, val)}
                                                placeholder="Not set"
                                                placeholderTextColor={THEME.textSub}
                                                keyboardType="decimal-pad"
                                            />
                                        )}
                                    </View>
                                    <View style={styles.teeRow}>
                                        <Text style={styles.teeLabel}>Tee:</Text>
                                        <TouchableOpacity
                                            style={styles.teeButton}
                                            onPress={() => openTeePickerForPlayer(sp.playerId, sp.teeGender)}
                                        >
                                            <Text style={styles.teeButtonText} numberOfLines={1} ellipsizeMode="tail">
                                                {sp.teeName || 'Select'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })}

                    {selectedPlayers.length === 0 && (
                        <View style={styles.emptyPlayersCard}>
                            <Users size={32} color={THEME.textSub} />
                            <Text style={styles.emptyPlayersText}>No players added yet</Text>
                            <TouchableOpacity style={styles.addFirstPlayerButton} onPress={handleAddPlayer}>
                                <Text style={styles.addFirstPlayerButtonText}>+ Add Player</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>
        );
    };

    const renderGameTypeStep = () => (
        <>
            <View style={styles.stepHeaderCenter}>
                <Image
                    source={require('@/assets/images/doodle_game_type.png')}
                    style={styles.stepDoodle}
                    resizeMode="cover"
                />
            </View>
            <GameTypeGrid
                selected={gameType}
                onSelect={setGameType}
                onShowRules={(type) => {
                    setGameType(type);
                    setShowGameRules(true);
                }}
                playerCount={selectedPlayers.length}
            />
        </>
    );

    const renderGameRulesStep = () => {
        if (!gameType) return null;
        const rules = GAME_RULES[gameType];
        return (
            <View style={styles.stepContent}>
                <View style={styles.stepHeaderCenter}>
                    <Image
                        source={require('@/assets/images/doodle_game_rules.png')}
                        style={styles.stepDoodle}
                        resizeMode="cover"
                    />
                </View>
                <Text style={styles.stepTitle}>{rules.title}</Text>
                <Text style={styles.stepSubtitle}>Here's how this game works:</Text>

                <View style={styles.rulesList}>
                    {rules.rules.map((rule, index) => (
                        <View key={index} style={styles.ruleItem}>
                            <View style={styles.ruleBullet} />
                            <Text style={styles.ruleText}>{rule}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    const renderGameModeStep = () => {
        const playerCount = selectedPlayers.length;

        // Use shared helper to determine available modes
        const availableModes = gameType ? getAvailableGameModes(gameType, playerCount) : [];

        const handleSwapPlayers = (side: 'A' | 'B', playerIndex: number) => {
            if (gameMode === 'head_to_head') {
                // Simple swap for 1v1
                setTeamAssignments(prev => ({
                    sideA: prev.sideB,
                    sideB: prev.sideA,
                }));
            } else if (gameMode === 'teams') {
                // For teams mode, cycle through all valid team combinations
                // Keep the self player (first in selectedPlayers) always in Team 1, slot 0
                const selfPlayerId = selectedPlayers[0].playerId;
                const otherPlayers = selectedPlayers.slice(1).map(p => p.playerId);

                // All possible team combinations with self always in Team 1:
                // Team 1: [self, other[0]], Team 2: [other[1], other[2]]
                // Team 1: [self, other[1]], Team 2: [other[0], other[2]]
                // Team 1: [self, other[2]], Team 2: [other[0], other[1]]
                const allCombinations = [
                    { sideA: [selfPlayerId, otherPlayers[0]], sideB: [otherPlayers[1], otherPlayers[2]] },
                    { sideA: [selfPlayerId, otherPlayers[1]], sideB: [otherPlayers[0], otherPlayers[2]] },
                    { sideA: [selfPlayerId, otherPlayers[2]], sideB: [otherPlayers[0], otherPlayers[1]] },
                ];

                // Find current combination index
                const currentIndex = allCombinations.findIndex(combo =>
                    combo.sideA[0] === teamAssignments.sideA[0] &&
                    combo.sideA[1] === teamAssignments.sideA[1] &&
                    combo.sideB[0] === teamAssignments.sideB[0] &&
                    combo.sideB[1] === teamAssignments.sideB[1]
                );

                // Move to next combination
                const nextIndex = (currentIndex + 1) % allCombinations.length;
                setTeamAssignments(allCombinations[nextIndex]);
            }
        };

        return (
            <View style={styles.stepContent}>
                <View style={{ height: 24 }} />
                <Text style={styles.stepTitle}>Competition Format</Text>
                <Text style={styles.stepSubtitle}>
                    How do you want to compete?
                </Text>

                {(['individual', 'head_to_head', 'teams'] as GameMode[]).map((mode) => {
                    const labels: Record<GameMode, { title: string; desc: string }> = {
                        individual: { title: 'Everyone vs Everyone', desc: 'Each player competes individually (6 matchups)' },
                        head_to_head: { title: '1 vs 1', desc: 'Head-to-head match between two players' },
                        teams: { title: '2 vs 2', desc: 'Team competition' },
                    };

                    // This step only shows for match_play/nassau with 4 players
                    // So we only show teams and individual options
                    if (mode === 'head_to_head') {
                        // 1v1 not available with 4 players
                        return null;
                    }

                    // Both teams and individual are available for 4 players
                    const getAvailability = (): { available: boolean; reason?: string } => {
                        if (mode === 'individual') {
                            return { available: true };
                        } else if (mode === 'teams') {
                            return { available: true };
                        }
                        return { available: false };
                    };

                    const { available, reason } = getAvailability();
                    const isSelected = gameMode === mode;

                    return (
                        <TouchableOpacity
                            key={mode}
                            style={[
                                styles.modeOption,
                                isSelected && styles.modeOptionSelected,
                                !available && styles.modeOptionDisabled,
                            ]}
                            onPress={() => available && setGameMode(mode)}
                            disabled={!available}
                            activeOpacity={available ? 0.7 : 1}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modeTitle, !available && styles.modeTextDisabled]}>
                                    {labels[mode].title}
                                </Text>
                                <Text style={[styles.modeDesc, !available && styles.modeTextDisabled]}>
                                    {available ? labels[mode].desc : reason}
                                </Text>
                            </View>
                            {isSelected && available && (
                                <View style={styles.selectionCircle}>
                                    <Check size={16} color="white" />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Team Assignment UI - only show for head_to_head or teams */}
                {(gameMode === 'head_to_head' || gameMode === 'teams') && (
                    <View style={{ marginTop: 24 }}>
                        <Text style={[styles.stepTitle, { fontSize: 20, marginBottom: 8 }]}>Sides & Teams</Text>
                        <Text style={styles.stepSubtitle}>
                            Tap to swap players.
                        </Text>

                        {gameMode === 'head_to_head' && teamAssignments.sideA.length > 0 && teamAssignments.sideB.length > 0 && (
                            <View style={styles.matchupContainer}>
                                <TouchableOpacity
                                    style={styles.sideCard}
                                    onPress={() => handleSwapPlayers('A', 0)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.sideLabel, { color: THEME.accentOrange }]}>Side A</Text>
                                    <Text style={styles.sideName}>
                                        {selectedPlayers.find(p => p.playerId === teamAssignments.sideA[0])?.name}
                                    </Text>
                                </TouchableOpacity>
                                <Text style={[styles.vsText, { color: THEME.accentOrange }]}>VS</Text>
                                <TouchableOpacity
                                    style={styles.sideCard}
                                    onPress={() => handleSwapPlayers('B', 0)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.sideLabel, { color: THEME.accentOrange }]}>Side B</Text>
                                    <Text style={styles.sideName}>
                                        {selectedPlayers.find(p => p.playerId === teamAssignments.sideB[0])?.name}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {gameMode === 'teams' && teamAssignments.sideA.length >= 2 && teamAssignments.sideB.length >= 2 && (
                            <View style={styles.teamsContainer}>
                                <TouchableOpacity
                                    style={styles.teamCard}
                                    onPress={() => handleSwapPlayers('A', 0)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.teamLabel, { color: THEME.accentOrange }]}>Team 1</Text>
                                    <Text style={styles.teamNames}>
                                        {selectedPlayers.find(p => p.playerId === teamAssignments.sideA[0])?.name} & {selectedPlayers.find(p => p.playerId === teamAssignments.sideA[1])?.name}
                                    </Text>
                                </TouchableOpacity>
                                <Text style={[styles.vsText, { color: THEME.accentOrange }]}>VS</Text>
                                <TouchableOpacity
                                    style={styles.teamCard}
                                    onPress={() => handleSwapPlayers('B', 0)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.teamLabel, { color: THEME.accentOrange }]}>Team 2</Text>
                                    <Text style={styles.teamNames}>
                                        {selectedPlayers.find(p => p.playerId === teamAssignments.sideB[0])?.name} & {selectedPlayers.find(p => p.playerId === teamAssignments.sideB[1])?.name}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    const renderBetConfigStep = () => {
        const amounts = [5, 10, 20, 50];


        return (
            <View style={styles.stepContent}>
                <View style={styles.stepHeaderCenter}>
                    <Image
                        source={require('@/assets/images/doodle_betting.png')}
                        style={styles.stepDoodle}
                        resizeMode="cover"
                    />
                </View>
                <Text style={styles.stepTitle}>Betting (Optional)</Text>
                <Text style={styles.stepSubtitle}>
                    Add some friendly competition with side bets.
                </Text>

                <TouchableOpacity
                    style={[styles.toggleRow, betEnabled && styles.toggleRowActive]}
                    onPress={() => setBetEnabled(!betEnabled)}
                >
                    <Text style={styles.toggleLabel}>Enable Betting</Text>
                    <View style={[styles.toggle, betEnabled && styles.toggleActive]}>
                        <View style={[styles.toggleThumb, betEnabled && styles.toggleThumbActive]} />
                    </View>
                </TouchableOpacity>

                {betEnabled && (
                    <View style={{ gap: 24, marginTop: 8 }}>
                        {/* Nassau: 3 separate bet inputs for Front/Back/Overall */}
                        {gameType === 'nassau' ? (
                            <View>
                                <Text style={styles.betLabel}>Nassau Bet Amounts</Text>
                                <Text style={[styles.toggleDesc, { marginBottom: 12 }]}>
                                    Set separate amounts for Front, Back, and Overall
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {/* Front 9 */}
                                    {(holeSelection === '18' || holeSelection === 'front_9') && (
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.toggleDesc, { marginBottom: 4, textAlign: 'center' }]}>Front 9</Text>
                                            <View style={[styles.betAmountOption, styles.nassauAmountInput]}>
                                                <Text style={styles.currencyPrefix}>$</Text>
                                                <TextInput
                                                    style={styles.customBetInput}
                                                    keyboardType="numeric"
                                                    value={nassauFrontDollars > 0 ? nassauFrontDollars.toString() : ''}
                                                    onChangeText={(text) => {
                                                        const val = parseInt(text, 10);
                                                        setNassauFrontDollars(isNaN(val) ? 0 : val);
                                                    }}
                                                    placeholder="10"
                                                    placeholderTextColor={THEME.textSub}
                                                />
                                            </View>
                                        </View>
                                    )}
                                    {/* Back 9 */}
                                    {(holeSelection === '18' || holeSelection === 'back_9') && (
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.toggleDesc, { marginBottom: 4, textAlign: 'center' }]}>Back 9</Text>
                                            <View style={[styles.betAmountOption, styles.nassauAmountInput]}>
                                                <Text style={styles.currencyPrefix}>$</Text>
                                                <TextInput
                                                    style={styles.customBetInput}
                                                    keyboardType="numeric"
                                                    value={nassauBackDollars > 0 ? nassauBackDollars.toString() : ''}
                                                    onChangeText={(text) => {
                                                        const val = parseInt(text, 10);
                                                        setNassauBackDollars(isNaN(val) ? 0 : val);
                                                    }}
                                                    placeholder="10"
                                                    placeholderTextColor={THEME.textSub}
                                                />
                                            </View>
                                        </View>
                                    )}
                                    {/* Overall */}
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.toggleDesc, { marginBottom: 4, textAlign: 'center' }]}>Overall</Text>
                                        <View style={[styles.betAmountOption, styles.nassauAmountInput]}>
                                            <Text style={styles.currencyPrefix}>$</Text>
                                            <TextInput
                                                style={styles.customBetInput}
                                                keyboardType="numeric"
                                                value={nassauOverallDollars > 0 ? nassauOverallDollars.toString() : ''}
                                                onChangeText={(text) => {
                                                    const val = parseInt(text, 10);
                                                    setNassauOverallDollars(isNaN(val) ? 0 : val);
                                                }}
                                                placeholder="20"
                                                placeholderTextColor={THEME.textSub}
                                            />
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            /* Standard: Single bet amount picker for other game types */
                            <View>
                                <Text style={styles.betLabel}>
                                    {formatBetPickerLabel({ gameType, payoutMode, betUnit })}
                                </Text>
                                <View style={styles.betAmountGrid}>
                                    {amounts.map((amount) => (
                                        <TouchableOpacity
                                            key={amount}
                                            style={[
                                                styles.betAmountOption,
                                                betAmountDollars === amount && styles.betAmountSelected,
                                            ]}
                                            onPress={() => setBetAmountDollars(amount)}
                                        >
                                            <Text
                                                style={[
                                                    styles.betAmountText,
                                                    betAmountDollars === amount && styles.betAmountTextSelected,
                                                ]}
                                            >
                                                ${amount}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    {/* Custom Amount Input */}
                                    <View
                                        style={[
                                            styles.betAmountOption,
                                            styles.customBetOption,
                                            betAmountDollars > 0 && !amounts.includes(betAmountDollars) && styles.betAmountSelected
                                        ]}
                                    >
                                        <Text style={[
                                            styles.currencyPrefix,
                                            betAmountDollars > 0 && !amounts.includes(betAmountDollars) && styles.betAmountTextSelected
                                        ]}>$</Text>
                                        <TextInput
                                            style={[
                                                styles.customBetInput,
                                                betAmountDollars > 0 && !amounts.includes(betAmountDollars) && styles.betAmountTextSelected
                                            ]}
                                            placeholder="Custom"
                                            keyboardType="numeric"
                                            placeholderTextColor={betAmountDollars > 0 && !amounts.includes(betAmountDollars) ? 'white' : THEME.textSub}
                                            value={amounts.includes(betAmountDollars) ? '' : (betAmountDollars > 0 ? betAmountDollars.toString() : '')}
                                            onChangeText={(text) => {
                                                const val = parseInt(text, 10);
                                                setBetAmountDollars(isNaN(val) ? 0 : val);
                                            }}
                                        />
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Game Type Specific Settings */}
                        <View style={{ gap: 16 }}>
                            {/* Bet Unit for Match Play */}
                            {gameType === 'match_play' && (
                                <View>
                                    <Text style={styles.sectionLabel}>Bet Type</Text>
                                    <View style={styles.betUnitRow}>
                                        <TouchableOpacity
                                            style={[styles.betUnitOption, betUnit === 'match' && styles.betUnitOptionActive]}
                                            onPress={() => setBetUnit('match')}
                                        >
                                            <Text style={[styles.betUnitText, betUnit === 'match' && styles.betUnitTextActive]}>Per Match</Text>
                                            <Text style={styles.betUnitDesc}>Winner takes all</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.betUnitOption, betUnit === 'hole' && styles.betUnitOptionActive]}
                                            onPress={() => setBetUnit('hole')}
                                        >
                                            <Text style={[styles.betUnitText, betUnit === 'hole' && styles.betUnitTextActive]}>Per Hole</Text>
                                            <Text style={styles.betUnitDesc}>$X for each hole won</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Bet Unit for Stroke Play */}
                            {gameType === 'stroke_play' && (
                                <View>
                                    <Text style={styles.sectionLabel}>Bet Type</Text>
                                    <View style={styles.betUnitRow}>
                                        <TouchableOpacity
                                            style={[styles.betUnitOption, betUnit === 'winner' && styles.betUnitOptionActive]}
                                            onPress={() => {
                                                setBetUnit('winner');
                                                setPayoutMode('pot');
                                            }}
                                        >
                                            <Text style={[styles.betUnitText, betUnit === 'winner' && styles.betUnitTextActive]}>Winner Takes All</Text>
                                            <Text style={styles.betUnitDesc}>Fixed payout</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.betUnitOption, betUnit === 'stroke_margin' && styles.betUnitOptionActive]}
                                            onPress={() => {
                                                setBetUnit('stroke_margin');
                                                setPayoutMode('war');
                                            }}
                                        >
                                            <Text style={[styles.betUnitText, betUnit === 'stroke_margin' && styles.betUnitTextActive]}>Per Stroke</Text>
                                            <Text style={styles.betUnitDesc}>$X × stroke margin</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {gameType === 'skins' && (
                                <TouchableOpacity
                                    style={[styles.toggleRow, carryover && styles.toggleRowActive]}
                                    onPress={() => setCarryover(!carryover)}
                                >
                                    <View>
                                        <Text style={styles.toggleLabel}>Carryover Ties</Text>
                                        <Text style={styles.toggleDesc}>Value carries to next hole on ties</Text>
                                    </View>
                                    <View style={[styles.toggle, carryover && styles.toggleActive]}>
                                        <View style={[styles.toggleThumb, carryover && styles.toggleThumbActive]} />
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Always show presses if Nassau is selected */}
                            {gameType === 'nassau' && (
                                <TouchableOpacity
                                    style={[styles.toggleRow, pressEnabled && styles.toggleRowActive]}
                                    onPress={() => setPressEnabled(!pressEnabled)}
                                >
                                    <View>
                                        <Text style={styles.toggleLabel}>Allow Presses</Text>
                                        <Text style={styles.toggleDesc}>Double down when losing by 2+ holes</Text>
                                    </View>
                                    <View style={[styles.toggle, pressEnabled && styles.toggleActive]}>
                                        <View style={[styles.toggleThumb, pressEnabled && styles.toggleThumbActive]} />
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Side Bets ("Junk") */}
                            <View style={{ marginTop: 8 }}>
                                <Text style={styles.sectionLabel}>Side Bets (Junk)</Text>
                                <Text style={[styles.toggleDesc, { marginBottom: 12 }]}>Optional bonus payouts</Text>

                                <TouchableOpacity
                                    style={[styles.toggleRow, sideBets.greenies && styles.toggleRowActive]}
                                    onPress={() => setSideBets(prev => ({ ...prev, greenies: !prev.greenies }))}
                                >
                                    <View>
                                        <Text style={styles.toggleLabel}>Greenies</Text>
                                        <Text style={styles.toggleDesc}>Hit par-3 green & make par+</Text>
                                    </View>
                                    <View style={[styles.toggle, sideBets.greenies && styles.toggleActive]}>
                                        <View style={[styles.toggleThumb, sideBets.greenies && styles.toggleThumbActive]} />
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.toggleRow, sideBets.sandies && styles.toggleRowActive, { marginTop: 8 }]}
                                    onPress={() => setSideBets(prev => ({ ...prev, sandies: !prev.sandies }))}
                                >
                                    <View>
                                        <Text style={styles.toggleLabel}>Sandies</Text>
                                        <Text style={styles.toggleDesc}>Make par after bunker shot</Text>
                                    </View>
                                    <View style={[styles.toggle, sideBets.sandies && styles.toggleActive]}>
                                        <View style={[styles.toggleThumb, sideBets.sandies && styles.toggleThumbActive]} />
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.toggleRow, sideBets.birdies && styles.toggleRowActive, { marginTop: 8 }]}
                                    onPress={() => setSideBets(prev => ({ ...prev, birdies: !prev.birdies }))}
                                >
                                    <View>
                                        <Text style={styles.toggleLabel}>Birdies</Text>
                                        <Text style={styles.toggleDesc}>Make birdie on any hole</Text>
                                    </View>
                                    <View style={[styles.toggle, sideBets.birdies && styles.toggleActive]}>
                                        <View style={[styles.toggleThumb, sideBets.birdies && styles.toggleThumbActive]} />
                                    </View>
                                </TouchableOpacity>

                                {/* Side bet amount - only show if any side bet is enabled */}
                                {(sideBets.greenies || sideBets.sandies || sideBets.birdies) && (
                                    <View style={{ marginTop: 16 }}>
                                        <Text style={styles.betLabel}>Side Bet Amount</Text>
                                        <View style={styles.betAmountPicker}>
                                            {[1, 2, 5, 10].map((amount) => (
                                                <TouchableOpacity
                                                    key={amount}
                                                    style={[
                                                        styles.betAmountOption,
                                                        sideBetAmountDollars === amount && styles.betAmountSelected,
                                                    ]}
                                                    onPress={() => setSideBetAmountDollars(amount)}
                                                >
                                                    <Text style={[
                                                        styles.betAmountText,
                                                        sideBetAmountDollars === amount && styles.betAmountTextSelected,
                                                    ]}>
                                                        ${amount}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        {/* Custom Amount Input - on separate row like wager */}
                                        <View
                                            style={[
                                                styles.customWagerRow,
                                                sideBetAmountDollars > 0 && ![1, 2, 5, 10].includes(sideBetAmountDollars) && styles.customWagerRowSelected
                                            ]}
                                        >
                                            <Text style={[
                                                styles.currencyPrefix,
                                                sideBetAmountDollars > 0 && ![1, 2, 5, 10].includes(sideBetAmountDollars) && styles.betAmountTextSelected
                                            ]}>$</Text>
                                            <TextInput
                                                style={[
                                                    styles.customWagerInput,
                                                    sideBetAmountDollars > 0 && ![1, 2, 5, 10].includes(sideBetAmountDollars) && styles.betAmountTextSelected
                                                ]}
                                                placeholder="Custom"
                                                keyboardType="numeric"
                                                placeholderTextColor={sideBetAmountDollars > 0 && ![1, 2, 5, 10].includes(sideBetAmountDollars) ? 'white' : THEME.textSub}
                                                value={[1, 2, 5, 10].includes(sideBetAmountDollars) ? '' : (sideBetAmountDollars > 0 ? sideBetAmountDollars.toString() : '')}
                                                onChangeText={(text) => {
                                                    const val = parseInt(text, 10);
                                                    setSideBetAmountDollars(isNaN(val) ? 0 : val);
                                                }}
                                            />
                                        </View>
                                        <Text style={[styles.toggleDesc, { marginTop: 8 }]}>
                                            Per greenie, sandy, or birdie won
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    // Calculate relative stroke allocations for display
    // When strokes > 18, player gets 2 strokes on some holes
    const getStrokeAllocations = () => {
        if (selectedPlayers.length < 2) return [];

        // Find lowest handicap player as base
        const sortedByHandicap = [...selectedPlayers].sort((a, b) => a.handicapIndex - b.handicapIndex);
        const lowestHandicap = sortedByHandicap[0].handicapIndex;

        // Get hole handicaps from course (sorted by difficulty - lowest hcp = hardest)
        // Check multiple possible sources for hole data: course.holes, teeSets holes, or _convexCourse
        let holes = selectedCourse?.holes || [];

        // If holes is empty, try to get from first tee set
        if (holes.length === 0 && selectedCourse?.teeSets?.[0]?.holes) {
            holes = selectedCourse.teeSets[0].holes;
        }

        // If still empty, try _convexCourse (for cached courses)
        if (holes.length === 0 && (selectedCourse as any)?._convexCourse?.holes) {
            holes = (selectedCourse as any)._convexCourse.holes;
        }

        const holesByDifficulty = [...Array(18)].map((_, i) => {
            const hole = holes.find((h: any) => h.number === i + 1);
            // Check for hcp first (Convex format), then handicap (local format), then fallback
            const hcp = hole?.hcp ?? hole?.handicap ?? (i + 1);
            return { number: i + 1, hcp };
        }).sort((a, b) => a.hcp - b.hcp);

        return sortedByHandicap.map(p => {
            const strokesReceived = Math.round(p.handicapIndex - lowestHandicap);

            // Calculate 1-stroke and 2-stroke holes
            // If strokes <= 18: get 1 stroke on the hardest N holes
            // If strokes > 18: get 1 stroke on ALL holes + 2 strokes on (strokes - 18) hardest
            const singleStrokeHoles: number[] = [];
            const doubleStrokeHoles: number[] = [];

            if (strokesReceived <= 18) {
                // Simple case: N strokes on N hardest holes
                holesByDifficulty.slice(0, strokesReceived).forEach(h => {
                    singleStrokeHoles.push(h.number);
                });
            } else {
                // More than 18 strokes: 1 on all + 2 on extra
                const extraStrokes = strokesReceived - 18;
                // All holes get at least 1 stroke (shown implicitly)
                // The hardest (extraStrokes) holes get 2 strokes
                holesByDifficulty.slice(0, extraStrokes).forEach(h => {
                    doubleStrokeHoles.push(h.number);
                });
            }

            return {
                ...p,
                strokesReceived,
                singleStrokeHoles: singleStrokeHoles.sort((a, b) => a - b),
                doubleStrokeHoles: doubleStrokeHoles.sort((a, b) => a - b),
                getsStrokeOnAllHoles: strokesReceived > 18,
            };
        });
    };

    const renderStrokeAllocationsStep = () => {
        const allocations = getStrokeAllocations();

        return (
            <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
                <View style={styles.stepHeaderCenter}>
                    <Image
                        source={require('@/assets/images/doodle_strokes.png')}
                        style={styles.stepDoodle}
                        resizeMode="cover"
                    />
                </View>
                <Text style={styles.stepTitle}>Stroke Allocation</Text>
                <Text style={styles.stepSubtitle}>
                    Based on handicaps, here's who gives/gets strokes:
                </Text>

                {allocations.map((player) => (
                    <View key={player.playerId} style={styles.strokePlayerCard}>
                        <View style={styles.strokePlayerHeader}>
                            <Text style={styles.strokePlayerName}>{player.name}</Text>
                            <Text style={[
                                styles.strokePlayerBadge,
                                { color: player.strokesReceived === 0 ? THEME.primaryGreen : THEME.success }
                            ]}>
                                {player.strokesReceived === 0
                                    ? 'Gives strokes'
                                    : `Gets ${player.strokesReceived}`}
                            </Text>
                        </View>

                        {/* High handicap: gets stroke on all holes + double on some */}
                        {player.getsStrokeOnAllHoles && (
                            <View style={styles.strokeHolesContainer}>
                                <Text style={styles.strokeSummaryText}>
                                    1 stroke on all holes
                                    {player.doubleStrokeHoles.length > 0 && `, plus 2nd stroke on:`}
                                </Text>
                                {player.doubleStrokeHoles.length > 0 && (
                                    <View style={styles.strokeHolesRow}>
                                        {player.doubleStrokeHoles.map((hole: number) => (
                                            <View key={hole} style={styles.strokeHoleBadgeDouble}>
                                                <Text style={styles.strokeHoleTextDouble}>{hole}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Normal handicap: show specific holes */}
                        {!player.getsStrokeOnAllHoles && player.singleStrokeHoles.length > 0 && (
                            <View style={styles.strokeHolesContainer}>
                                <View style={styles.strokeHolesRow}>
                                    {player.singleStrokeHoles.map((hole: number) => (
                                        <View key={hole} style={styles.strokeHoleBadge}>
                                            <Text style={styles.strokeHoleText}>{hole}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                ))}

                <View style={styles.infoBox}>
                    <Info size={16} color={THEME.textSub} />
                    <Text style={styles.infoBoxText}>
                        Strokes are allocated to the hardest holes based on course handicap ratings.
                    </Text>
                </View>
            </ScrollView>
        );
    };

    const renderSummaryStep = () => (
        <View style={styles.stepContent}>
            <View style={styles.stepHeaderCenter}>
                <Image
                    source={require('@/assets/images/doodle_summary.png')}
                    style={styles.stepDoodle}
                    resizeMode="cover"
                />
            </View>
            <Text style={styles.stepTitle}>Ready to Play!</Text>
            <Text style={styles.stepSubtitle}>
                Review your game setup before starting.
            </Text>

            <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Course</Text>
                    <Text style={styles.summaryValue}>{selectedCourse?.name}</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Holes</Text>
                    <Text style={styles.summaryValue}>
                        {holeSelection === '18' ? '18 Holes' : holeSelection === 'front_9' ? 'Front 9' : 'Back 9'}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Game Type</Text>
                    <Text style={styles.summaryValue}>
                        {gameType ? gameType.replace('_', ' ') : 'Normal'}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Players</Text>
                    <Text style={styles.summaryValue}>
                        {selectedPlayers.map((p) =>
                            p.teeName ? `${p.name} (${p.teeName})` : p.name
                        ).join(', ')}
                    </Text>
                </View>
                {betEnabled && (
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Bet</Text>
                        <Text style={styles.summaryValue}>
                            {formatBetLineFromSetup({
                                gameType,
                                holeSelection,
                                payoutMode,
                                betEnabled,
                                betAmountDollars,
                                betUnit,
                                nassauFrontDollars,
                                nassauBackDollars,
                                nassauOverallDollars,
                            })}
                        </Text>
                    </View>
                )}
                {(sideBets.greenies || sideBets.sandies || sideBets.birdies) && (
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Side Bets</Text>
                        <Text style={styles.summaryValue}>
                            {[
                                sideBets.greenies && 'Greenies',
                                sideBets.sandies && 'Sandies',
                                sideBets.birdies && 'Birdies',
                            ].filter(Boolean).join(', ')} (${sideBetAmountDollars} each)
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );

    const renderStepContent = () => {
        switch (currentStep) {
            case 'intent':
                return renderIntentStep();
            case 'course':
                return renderCourseStep();
            case 'players':
                return renderPlayersStep();
            case 'gameType':
                return renderGameTypeStep();
            case 'gameRules':
                return renderGameRulesStep();
            case 'gameMode':
                return renderGameModeStep();
            case 'betConfig':
                return renderBetConfigStep();
            case 'strokeAllocations':
                return renderStrokeAllocationsStep();
            case 'summary':
                return renderSummaryStep();
            default:
                return null;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <>
            <Modal
                visible={visible && !showCourseModal}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={resetAndClose}
            >
                <SafeAreaView style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.headerButton}
                            onPress={currentStep === 'intent' ? resetAndClose : goBack}
                        >
                            {currentStep === 'intent' ? (
                                <X size={24} color={THEME.textMain} />
                            ) : (
                                <ChevronLeft size={24} color={THEME.textMain} />
                            )}
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>
                            {currentStep === 'intent' ? 'New Round' : 'Game Setup'}
                        </Text>
                        {currentStep !== 'intent' ? (
                            <TouchableOpacity
                                style={[styles.headerButton, !canProceed() && { opacity: 0.3 }]}
                                onPress={goNext}
                                disabled={!canProceed()}
                            >
                                <ChevronRight size={24} color={THEME.textMain} />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.headerButton} />
                        )}
                    </View>

                    {/* Content */}
                    <ScrollView
                        style={styles.content}
                        contentContainerStyle={styles.contentContainer}
                        keyboardShouldPersistTaps="handled"
                    >
                        {renderStepContent()}
                    </ScrollView>

                    {/* Footer */}
                    {currentStep !== 'intent' && (
                        <View style={styles.footer}>
                            {currentStep === 'summary' ? (
                                <TouchableOpacity
                                    style={[styles.primaryButton, isCreating && styles.buttonDisabled]}
                                    onPress={handleCreateSession}
                                    disabled={isCreating}
                                >
                                    {isCreating ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text style={styles.primaryButtonText}>Start Game</Text>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[
                                        styles.primaryButton,
                                        !canProceed() && styles.buttonDisabled,
                                    ]}
                                    onPress={goNext}
                                    disabled={!canProceed()}
                                >
                                    <Text style={styles.primaryButtonText}>
                                        {currentStep === 'betConfig' && !betEnabled ? 'Continue without betting' : 'Continue'}
                                    </Text>
                                    <ChevronRight size={20} color="white" />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </SafeAreaView>

                {/* Tee Picker Overlay */}
                {showTeePicker && (
                    <AnimatedSheet onClose={() => setShowTeePicker(false)}>
                        {(closeSheet) => (
                            <>
                                <View style={styles.sheetHeader}>
                                    <Text style={styles.sheetTitle}>Select Tee</Text>
                                    <TouchableOpacity
                                        onPress={closeSheet}
                                        style={{ padding: 4 }}
                                    >
                                        <X size={24} color={THEME.textSub} />
                                    </TouchableOpacity>
                                </View>

                                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                                    <View style={styles.sheetTabs}>
                                        <TouchableOpacity
                                            style={[styles.sheetTab, teePickerGenderTab === 'M' && styles.sheetTabActive]}
                                            onPress={() => setTeePickerGenderTab('M')}
                                        >
                                            <Text style={[styles.sheetTabText, teePickerGenderTab === 'M' && styles.sheetTabTextActive]}>
                                                Men's Tees
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.sheetTab, teePickerGenderTab === 'F' && styles.sheetTabActive]}
                                            onPress={() => setTeePickerGenderTab('F')}
                                        >
                                            <Text style={[styles.sheetTabText, teePickerGenderTab === 'F' && styles.sheetTabTextActive]}>
                                                Women's Tees
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                                    {(selectedCourse?.teeSets || [])
                                        .filter((t: any) => !t.gender || t.gender === teePickerGenderTab)
                                        .map((tee: any) => {
                                            const currentPlayer = selectedPlayers.find(p => p.playerId === teePickerPlayerId);
                                            const isSelected =
                                                currentPlayer?.teeName === tee.name &&
                                                (currentPlayer?.teeGender === tee.gender || (!currentPlayer?.teeGender && !tee.gender));

                                            return (
                                                <TouchableOpacity
                                                    key={`${tee.gender ?? 'U'}-${tee.name}`}
                                                    style={styles.teeOptionRow}
                                                    onPress={() => {
                                                        if (teePickerPlayerId) {
                                                            setSelectedPlayers(selectedPlayers.map(p =>
                                                                p.playerId === teePickerPlayerId
                                                                    ? { ...p, teeName: tee.name, teeGender: tee.gender || teePickerGenderTab }
                                                                    : p
                                                            ));
                                                        }
                                                        closeSheet();
                                                        setTeePickerPlayerId(null);
                                                    }}
                                                >
                                                    <View>
                                                        <Text style={styles.teeOptionName}>{tee.name}</Text>
                                                        <Text style={styles.teeOptionGender}>
                                                            {tee.rating && tee.slope
                                                                ? `${tee.rating}/${tee.slope}`
                                                                : tee.gender === 'F' ? 'Women' : 'Men'}
                                                        </Text>
                                                    </View>

                                                    {isSelected && <Check size={20} color={THEME.primaryGreen} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                </ScrollView>
                            </>
                        )}
                    </AnimatedSheet>
                )}

                {/* Player Picker Overlay */}
                {showPlayerPicker && (
                    <AnimatedSheet onClose={() => setShowPlayerPicker(false)}>
                        {(closeSheet) => (
                            <>
                                <View style={styles.sheetHeader}>
                                    <Text style={styles.sheetTitle}>Add Player</Text>
                                    <TouchableOpacity
                                        onPress={closeSheet}
                                        style={{ padding: 4 }}
                                    >
                                        <X size={24} color={THEME.textSub} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                                    {/* Create New Player Section */}
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        padding: 12,
                                        marginBottom: 12,
                                        backgroundColor: THEME.primaryGreen + '08',
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: THEME.primaryGreen + '20',
                                    }}>
                                        <TextInput
                                            style={{
                                                flex: 1,
                                                height: 40,
                                                backgroundColor: 'white',
                                                borderRadius: 8,
                                                paddingHorizontal: 12,
                                                fontSize: 14,
                                                color: THEME.textMain,
                                                borderWidth: 1,
                                                borderColor: THEME.border,
                                            }}
                                            placeholder="Create new player..."
                                            placeholderTextColor={THEME.textSub}
                                            value={newPlayerName}
                                            onChangeText={setNewPlayerName}
                                        />
                                        <TouchableOpacity
                                            style={{
                                                marginLeft: 12,
                                                paddingHorizontal: 16,
                                                paddingVertical: 10,
                                                backgroundColor: newPlayerName.trim() ? THEME.primaryGreen : THEME.border,
                                                borderRadius: 8,
                                            }}
                                            disabled={!newPlayerName.trim()}
                                            onPress={async () => {
                                                if (!newPlayerName.trim()) return;
                                                try {
                                                    const newPlayerId = await createPlayer({ name: newPlayerName.trim() });
                                                    const firstPlayerTee = selectedPlayers[0]?.teeName;
                                                    const firstPlayerTeeGender = selectedPlayers[0]?.teeGender;
                                                    setSelectedPlayers([...selectedPlayers, {
                                                        playerId: newPlayerId as any,
                                                        name: newPlayerName.trim(),
                                                        handicapIndex: 0,
                                                        teeName: firstPlayerTee,
                                                        teeGender: firstPlayerTeeGender || 'M',
                                                    }]);
                                                    setNewPlayerName('');
                                                    closeSheet();
                                                } catch (e) {
                                                    console.error('Failed to create player:', e);
                                                }
                                            }}
                                        >
                                            <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Create</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Existing Players */}
                                    {players?.filter((p: any) => !selectedPlayers.some(sp => sp.playerId === p._id)).map((player: any) => (
                                        <TouchableOpacity
                                            key={player._id}
                                            style={styles.teeOptionRow}
                                            onPress={() => {
                                                const firstPlayerTee = selectedPlayers[0]?.teeName;
                                                const firstPlayerTeeGender = selectedPlayers[0]?.teeGender;

                                                setSelectedPlayers([...selectedPlayers, {
                                                    playerId: player._id,
                                                    name: player.name,
                                                    handicapIndex: player.handicap ?? 0,
                                                    teeName: firstPlayerTee,
                                                    teeGender: firstPlayerTeeGender || ((player.gender === 'M' || player.gender === 'F') ? player.gender : 'M'),
                                                }]);
                                                closeSheet();
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <View style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: THEME.primaryGreen + '15',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    marginRight: 12
                                                }}>
                                                    <Users size={18} color={THEME.primaryGreen} />
                                                </View>
                                                <View>
                                                    <Text style={styles.teeOptionName}>{player.name}</Text>
                                                    <Text style={styles.teeOptionGender}>
                                                        Hcp: {player.handicap != null ? Math.max(0, player.handicap).toFixed(1) : 'NR'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{
                                                paddingHorizontal: 12, paddingVertical: 6,
                                                backgroundColor: THEME.primaryGreen, borderRadius: 20
                                            }}>
                                                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Add</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                    {(!players || players.filter((p: any) => !selectedPlayers.some(sp => sp.playerId === p._id)).length === 0) && (
                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                            <Text style={{ color: THEME.textSub }}>No other players found.</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </AnimatedSheet>
                )}
            </Modal>


            {/* Course Selection Modal - rendered outside parent Modal for iOS compatibility */}
            {visible && showCourseModal && (
                <CourseSearchModal
                    visible={true}
                    onClose={() => setShowCourseModal(false)}
                    onSelectCourse={handleSelectCourse}
                    testID="preround-course-modal"
                />
            )}

            {/* Tee Picker Modal - rendered outside parent Modal for iOS compatibility */}

        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const AnimatedSheet = ({ onClose, children }: { onClose: () => void, children: (close: () => void) => React.ReactNode }) => {
    const screenHeight = Dimensions.get('window').height;
    const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;

    React.useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 25,
            stiffness: 350,
            mass: 1,
        }).start();
    }, []);

    const animateClose = () => {
        Animated.timing(slideAnim, {
            toValue: screenHeight,
            duration: 150,
            useNativeDriver: true,
        }).start(onClose);
    };

    return (
        <View style={[styles.sheetOverlay, StyleSheet.absoluteFill, { zIndex: 100 }]}>
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: 'black', opacity: slideAnim.interpolate({
                            inputRange: [0, screenHeight],
                            outputRange: [0.5, 0]
                        })
                    }
                ]}
            >
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={animateClose} />
            </Animated.View>

            <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
                <Animated.View style={[
                    styles.sheetContainer,
                    { transform: [{ translateY: slideAnim }] }
                ]}>
                    {children(animateClose)}
                </Animated.View>
            </View>
        </View>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
    primaryGreen: '#1E6059', // Deep Premium Green (Main Brand)
    activeGreen: '#237D71',  // Slightly lighter for active states
    accentOrange: '#FC661A', // Accent only (Badges, critical actions)
    lightGreenBg: '#E8F3F1', // Subtle green tint for backgrounds
    background: '#FFFFFF',   // Clean White
    surface: '#FFFFFF',      // White Surface
    surfaceHighlight: '#F8F9FA', // Slightly offset surface
    textMain: '#1A3330',     // Very dark green/black
    textSub: '#5C706D',      // Muted green-gray
    border: '#E0E0E0',
    success: '#388E3C',
    shadowColor: '#1E6059',  // Colored shadow for premium feel
    error: '#D32F2F',
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: THEME.background,
    },
    // Progress Bar
    progressBarContainer: {
        height: 6,
        backgroundColor: '#F0F0F0',
        borderRadius: 3,
        marginHorizontal: 20,
        marginVertical: 12,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: THEME.primaryGreen, // Green progress
        borderRadius: 3,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8, // Reduced from 12
        paddingBottom: 0,
        backgroundColor: THEME.background,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#F5F7FA',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.textMain,
    },

    // Content
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: '800', // Premium bold
        color: THEME.textMain,
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    stepSubtitle: {
        fontSize: 16,
        color: THEME.textSub,
        marginBottom: 24,
        lineHeight: 22,
    },

    // Footer
    footer: {
        padding: 20,
        backgroundColor: THEME.background,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        shadowColor: "black",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 10,
    },
    primaryButton: {
        backgroundColor: THEME.primaryGreen, // Deep Green CTA
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: THEME.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    disabledButton: {
        backgroundColor: '#E0E0E0',
        shadowOpacity: 0,
        elevation: 0,
    },
    secondaryButton: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        marginBottom: 12,
    },
    secondaryButtonText: {
        color: THEME.textSub,
        fontSize: 16,
        fontWeight: '600',
    },

    // Course Selection Step
    selectedCourseCard: {
        backgroundColor: THEME.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: THEME.border,
        // Premium Shadow
        shadowColor: "black",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
        marginBottom: 24,
    },
    courseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    courseIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: THEME.lightGreenBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    courseName: {
        fontSize: 20,
        fontWeight: '700',
        color: THEME.textMain,
        flex: 1,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    locationText: {
        fontSize: 14,
        color: THEME.textSub,
        marginLeft: 6,
    },
    roundOptionsContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        gap: 12,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    optionLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    optionLabelText: {
        fontSize: 15,
        color: THEME.textSub,
        fontWeight: '500',
    },
    holeSelector: {
        flexDirection: 'row',
        backgroundColor: '#F5F7FA',
        borderRadius: 10,
        padding: 3,
    },
    holeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1.5,
        borderColor: '#F0F0F0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    holeOptionSelected: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
        shadowOpacity: 0.05,
    },
    holeOptionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
        marginBottom: 2,
    },
    holeOptionDesc: {
        fontSize: 13,
        color: THEME.textSub,
    },
    holeOptionTextSelected: {
        color: THEME.primaryGreen,
    },
    selectionCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: THEME.primaryGreen,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Player List in Course Step
    playerPreviewCard: {
        flexDirection: 'row',
        marginTop: 12,
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
    },
    playerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: THEME.lightGreenBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    playerName: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
    },
    playerHandicap: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 2,
    },
    selectedCount: {
        marginTop: 16,
        fontSize: 14,
        color: THEME.textSub,
        textAlign: 'center',
        fontWeight: '500',
    },

    // Game Rules Step
    rulesList: {
        gap: 12,
    },
    ruleItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    ruleBullet: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: THEME.primaryGreen,
        marginTop: 8,
        marginRight: 12,
    },
    ruleText: {
        flex: 1,
        fontSize: 15,
        color: THEME.textMain,
        lineHeight: 24,
    },

    // Game Mode Step
    modeOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 1.5,
        borderColor: '#EAEAEA',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    modeOptionSelected: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
        shadowOpacity: 0.05,
    },
    modeOptionDisabled: {
        opacity: 0.6, // More visible
        borderColor: '#D0D0D0',
        backgroundColor: '#F5F5F5',
    },
    modeTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
        marginBottom: 4,
    },
    modeDesc: {
        fontSize: 14,
        color: THEME.textSub,
        lineHeight: 20,
    },
    modeTextDisabled: {
        color: '#A0A0A0',
    },

    // Team Setup Step
    matchupContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        marginTop: 16,
    },
    sideCard: {
        flex: 1,
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EAEAEA',
    },
    sideLabel: {
        fontSize: 12,
        color: THEME.textSub,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '600',
    },
    sideName: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.textMain,
    },
    vsText: {
        fontSize: 16,
        fontWeight: '800',
        color: THEME.primaryGreen,
        fontStyle: 'italic',
    },
    teamsContainer: {
        gap: 16,
        marginTop: 16,
    },
    teamCard: {
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EAEAEA',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
    },
    teamLabel: {
        fontSize: 12,
        color: THEME.textSub,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '600',
    },
    teamNames: {
        fontSize: 18,
        fontWeight: '600',
        color: THEME.textMain,
        textAlign: 'center',
    },

    // Bet Config Step
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#EAEAEA',
    },
    toggleRowActive: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
    },
    toggleLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
    },
    toggleDesc: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 4,
    },
    toggle: {
        width: 52,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E0E0E0',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    toggleActive: {
        backgroundColor: THEME.primaryGreen,
    },
    toggleThumb: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'white',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    toggleThumbActive: {
        alignSelf: 'flex-end',
    },
    betAmountRow: {
        marginBottom: 20,
    },
    betLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 12,
    },
    betAmountPicker: {
        flexDirection: 'row',
        gap: 12,
    },
    betAmountOption: {
        minWidth: 70,
        backgroundColor: THEME.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#EAEAEA',
        flexGrow: 1, // Allow growing to fill space but respect minWidth
    },
    nassauAmountInput: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 4,
    },
    betAmountSelected: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
    },
    betAmountText: {
        fontSize: 17,
        fontWeight: '600',
        color: THEME.textMain,
    },
    betAmountTextSelected: {
        color: THEME.primaryGreen,
    },
    // Bet unit picker styles
    sectionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textSub,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    betUnitRow: {
        flexDirection: 'row',
        gap: 12,
    },
    betUnitOption: {
        flex: 1,
        backgroundColor: THEME.surface,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1.5,
        borderColor: '#EAEAEA',
    },
    betUnitOptionActive: {
        borderColor: THEME.primaryGreen,
        backgroundColor: THEME.lightGreenBg,
    },
    betUnitText: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 4,
    },
    betUnitTextActive: {
        color: THEME.primaryGreen,
    },
    betUnitDesc: {
        fontSize: 12,
        color: THEME.textSub,
    },
    betAmountGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 12,
    },
    customBetOption: {
        flexGrow: 2, // Give custom field more space
        minWidth: 140,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
    },
    currencyPrefix: {
        fontSize: 17,
        fontWeight: '600',
        color: THEME.primaryGreen,
        marginRight: 4,
    },
    customBetInput: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: THEME.textMain,
        padding: 0,
        height: '100%',
    },
    customWagerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E8E8E8',
        paddingVertical: 14,
        paddingHorizontal: 18,
        marginTop: 12,
    },
    customWagerRowSelected: {
        backgroundColor: THEME.primaryGreen,
        borderColor: THEME.primaryGreen,
    },
    customWagerInput: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: THEME.textMain,
        padding: 0,
    },

    // Summary Step
    summaryCard: {
        backgroundColor: THEME.surface,
        borderRadius: 20,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F0F0F0',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    summaryLabel: {
        fontSize: 15,
        color: THEME.textSub,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#E3F2FD', // Keep light blue for info or switch to green
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
    },
    infoBoxText: {
        flex: 1,
        fontSize: 14,
        color: '#1565C0', // Darker Blue
        lineHeight: 20,
    },
    strokePlayerCard: {
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
    },
    strokePlayerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    strokePlayerName: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
    },
    strokePlayerBadge: {
        fontSize: 15,
        fontWeight: '600',
    },
    strokeHolesContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
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
    strokeHoleBadge: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: THEME.lightGreenBg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    strokeHoleText: {
        fontSize: 14,
        fontWeight: '700',
        color: THEME.primaryGreen,
    },
    strokeSummaryText: {
        fontSize: 15,
        color: THEME.textMain,
        fontWeight: '600',
        marginBottom: 8,
    },
    doubleStrokeSection: {
        marginTop: 12,
    },
    doubleStrokeLabel: {
        fontSize: 13,
        color: THEME.textSub,
        marginBottom: 6,
    },
    strokeHoleBadgeDouble: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: THEME.accentOrange + '20',
        justifyContent: 'center',
        alignItems: 'center',
    },
    strokeHoleTextDouble: {
        fontSize: 14,
        fontWeight: '700',
        color: THEME.accentOrange,
    },
    teeSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F7FA', // Button-like bg
        marginLeft: 48,
        marginTop: -4,
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    teeSelectorLabel: {
        fontSize: 13,
        color: THEME.textSub,
        marginRight: 10,
    },
    teeOptionsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    teeOption: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: THEME.background,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    teeOptionSelected: {
        backgroundColor: THEME.lightGreenBg,
        borderColor: THEME.primaryGreen,
    },
    teeOptionText: {
        fontSize: 13,
        fontWeight: '500',
        color: THEME.textSub,
    },
    teeOptionTextSelected: {
        color: THEME.primaryGreen,
    },
    playerMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    playerTee: {
        fontSize: 13,
        color: THEME.primaryGreen,
        fontWeight: '600',
    },
    teeAssignSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    teeAssignTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 12,
    },
    teeAssignRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    teeAssignName: {
        fontSize: 15,
        color: THEME.textMain,
    },
    teeChips: {
        flexDirection: 'row',
        gap: 6,
    },
    teeChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: THEME.background,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    teeChipSelected: {
        backgroundColor: THEME.lightGreenBg,
        borderColor: THEME.primaryGreen,
    },
    teeChipText: {
        fontSize: 12,
        fontWeight: '500',
        color: THEME.textSub,
    },
    teeChipTextSelected: {
        color: THEME.primaryGreen,
    },
    playerSelectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    teeSelectorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 12,
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    teeSelectorValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    teeSelectorValueText: {
        fontSize: 15,
        color: THEME.primaryGreen,
        fontWeight: '600',
    },
    // Sheet / Modal Styles
    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)', // Slightly darker dimmer
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: THEME.background,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingBottom: 34,
        maxHeight: '85%',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 20,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 20,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: THEME.textMain,
    },
    sheetTabs: {
        flexDirection: 'row',
        backgroundColor: '#F0F0F0',
        borderRadius: 14,
        padding: 4,
        width: '90%',
    },
    sheetTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 12,
    },
    sheetTabActive: {
        backgroundColor: THEME.background,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    sheetTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textSub,
    },
    sheetTabTextActive: {
        color: THEME.textMain,
    },
    sheetList: {
        maxHeight: 400,
    },
    sheetListContent: {
        paddingHorizontal: 24,
        paddingBottom: 32,
    },
    teeOptionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        marginBottom: 10,
        borderRadius: 16,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        backgroundColor: THEME.surface,
    },
    teeOptionName: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
        marginBottom: 2,
    },
    teeOptionGender: {
        fontSize: 14,
        color: THEME.textSub,
    },
    // Player step - new card-based design
    playersHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    addPlayerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: THEME.activeGreen,
        backgroundColor: 'transparent',
    },
    addPlayerButtonText: {
        color: THEME.activeGreen,
        fontSize: 14,
        fontWeight: '700',
    },
    playerCard: {
        backgroundColor: THEME.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
    },
    playerCardSelf: {
        borderColor: THEME.primaryGreen,
        backgroundColor: '#F5FCFA', // Very light mint green for user
        borderWidth: 1.5,
        shadowOpacity: 0.08,
    },
    playerCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    playerCardName: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.textMain,
    },
    youBadge: {
        backgroundColor: THEME.accentOrange, // Keep Orange for the badge!
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 10,
    },
    youBadgeText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    removePlayerButton: {
        padding: 8,
        backgroundColor: '#FFF0F0',
        borderRadius: 12,
    },
    playerCardDetails: {
        flexDirection: 'row',
        justifyContent: 'flex-start', // Use flex-start for tighter layout
        alignItems: 'center',
    },
    handicapRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12, // Tighter gap between sections
    },
    teeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1, // Expand to fill remaining width
    },
    handicapLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: THEME.textSub,
        width: 80, // Optimized for "SCANDICAP:"
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    teeLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: THEME.textSub,
        width: 30, // Extremely tight for "TEE:"
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    handicapInput: {
        width: 60,
        backgroundColor: '#F7F8FA',
        borderRadius: 10,
        paddingVertical: 8,
        fontSize: 14,
        fontWeight: '700',
        color: THEME.textMain,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        textAlign: 'center',
    },
    teeButton: {
        backgroundColor: '#F7F8FA',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1, // Fill available space in teeRow
    },
    teeButtonText: {
        fontSize: 14,
        color: THEME.textMain,
        fontWeight: '700',
        textAlign: 'center',
        flex: 1, // Ensure text centers within the button
    },
    emptyPlayersCard: {
        backgroundColor: THEME.surface,
        borderRadius: 20,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#EAEAEA',
        borderStyle: 'dashed',
    },
    emptyPlayersText: {
        fontSize: 16,
        color: THEME.textSub,
        marginTop: 16,
        marginBottom: 20,
        textAlign: 'center',
        lineHeight: 24,
    },
    addFirstPlayerButton: {
        backgroundColor: THEME.primaryGreen,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: THEME.primaryGreen,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    addFirstPlayerButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
    handicapDisplay: {
        backgroundColor: '#F7F8FA',
        borderRadius: 10,
        paddingVertical: 8,
        width: 60,
        borderWidth: 1,
        borderColor: '#EAEAEA',
        alignItems: 'center',
        justifyContent: 'center',
    },
    handicapDisplayText: {
        fontSize: 14,
        color: THEME.textMain,
        fontWeight: '700',
        textAlign: 'center',
    },

    // Missing Styles Restored
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: 0, // Reduced from 24
        paddingBottom: 100,
    },
    stepContent: {
        paddingTop: 0, // Reduced from 4
        paddingBottom: 8,
    },
    stepHeaderCenter: {
        alignItems: 'center',
        marginBottom: 8, // Added slight space back for balance
        width: '100%',
    },
    stepDoodle: {
        width: '100%',
        height: 180, // Reduced from 220 to tighten the screen
        maxHeight: 220,
    },
    stepDoodleSmall: {
        width: '100%',
        height: 130, // Even smaller for merged screen
        maxHeight: 150,
    },
    buttonDisabled: {
        opacity: 0.5,
    },

    // Intent Step
    intentContainer: {
        padding: 24,
        paddingTop: 12,
    },
    intentHeader: {
        marginBottom: 32,
    },
    intentTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: THEME.textMain,
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    intentSubtitle: {
        fontSize: 16,
        color: THEME.textSub,
        lineHeight: 22,
    },
    intentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: THEME.border,
        shadowColor: THEME.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    intentImageContainer: {
        width: 100,
        height: 70,
        marginRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
        // Removed background color for cleaner look with landscape doodles
    },
    intentImage: {
        width: 100,
        height: 70,
    },
    intentTextContainer: {
        flex: 1,
        marginRight: 8,
    },
    intentCardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
        marginBottom: 4,
    },
    intentCardDescription: {
        fontSize: 14,
        color: THEME.textSub,
        lineHeight: 20,
    },

    // Course Step
    courseSelected: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1.5,
        borderColor: THEME.primaryGreen,
        shadowColor: THEME.shadowColor,
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    courseLocation: {
        fontSize: 14,
        color: THEME.textSub,
    },
    changeText: {
        fontSize: 15,
        color: THEME.primaryGreen,
        fontWeight: '600',
    },
    selectCourseButton: {
        backgroundColor: THEME.surface,
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#EAEAEA',
    },
    selectCourseText: {
        fontSize: 16,
        color: THEME.textSub,
    },

    // Holes Step
    holesGrid: {
        gap: 12,
    },

    // Players Step
    playersList: {
        gap: 8,
    },
});
