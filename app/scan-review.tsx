import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ScrollView,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
// @ts-ignore - local ambient types provided via declarations
import DraggableFlatList from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
    X,
    Users,
    User,
    GripVertical,
    Plus,
    Link as LinkIcon,
    MapPin,
    ChevronDown,
    Check,
    Calendar,
    RotateCcw,
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { generateUniqueId, ensureValidDate } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { ScorecardScanResult, ApiCourseData, Course, Player } from '@/types';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useMutation, useQuery } from '@/lib/convex';
import { useConvex } from "convex/react";
import { convertApiCourseToLocal, getDeterministicCourseId } from '@/utils/course-helpers';

interface DetectedPlayer {
    id: string;
    name: string;
    nameConfidence?: number;
    linkedPlayerId?: string;
    isUser?: boolean;
    handicap?: number;
    prevLinkedPlayerId?: string;
    prevHandicap?: number;
    prevName?: string;
    teeColor?: string;
    teeGender?: 'M' | 'F';
    detectedAsName?: string;
    isFromSession?: boolean;
    scannedPlayerIndex?: number;
    scores: {
        holeNumber: number;
        strokes: number;
        confidence?: number;
    }[];
}

// Module-level set to track which scan jobs have had their course restored
const restoredCourseJobIds = new Set<string>();

export default function ReviewScanScreen() {
    const router = useRouter();
    const {
        players,
        courses,
        addRound,
        addPlayer,
        addCourse,
        activeScanJob,
        clearActiveScanJob,
        pendingScanCourseSelection,
        clearPendingScanCourseSelection,
        markActiveScanReviewed,
    } = useGolfStore();

    const profile = useQuery(api.users.getProfile);
    const userGender = (profile as any)?.gender as "M" | "F" | undefined;

    const convex = useConvex();
    const upsertCourse = useMutation(api.courses.upsert);
    const saveRoundMutation = useMutation(api.rounds.saveRound);

    // State
    const [activeTab, setActiveTab] = useState<'players' | 'scores' | 'details'>('players');
    const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
    const [selectedApiCourse, setSelectedApiCourse] = useState<{ apiCourse: ApiCourseData; selectedTee: any } | null>(null);
    const [isLocalCourseSelected, setIsLocalCourseSelected] = useState(false);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState<string>('');
    const [showCourseSearchModal, setShowCourseSearchModal] = useState(false);
    const [showTeePicker, setShowTeePicker] = useState(false);
    const [teePickerPlayerIndex, setTeePickerPlayerIndex] = useState<number | null>(null);
    const [teePickerGenderTab, setTeePickerGenderTab] = useState<'M' | 'F'>('M');
    const [isDragging, setIsDragging] = useState(false);
    const [listVersion, setListVersion] = useState(0);
    const [processingComplete, setProcessingComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showPlayerLinking, setShowPlayerLinking] = useState(false);
    const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number | null>(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [linkingWasRemoved, setLinkingWasRemoved] = useState(false);

    const preDragPlayersRef = useRef<DetectedPlayer[] | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Current user detection
    const currentUser = React.useMemo(
        () => players.find((p) => p.isUser) || (profile ? ({ id: (profile as any)._id, isUser: true, handicap: (profile as any)?.handicap, name: profile.name } as any) : null),
        [players, profile]
    );
    const currentUserId = currentUser?.id as string | undefined;
    const currentUserName = (currentUser as any)?.name?.trim()?.toLowerCase?.();

    // Linkable players for the linking screen
    const linkablePlayers = React.useMemo(() => {
        return players.filter(p => !p.isUser);
    }, [players]);

    // Initialize from activeScanJob on mount
    useEffect(() => {
        if (!activeScanJob?.result || processingComplete) return;

        const scanResult = activeScanJob.result as ScorecardScanResult;

        // Apply pending course selection if available
        if (pendingScanCourseSelection) {
            setSelectedCourse(pendingScanCourseSelection.courseId);
            setIsLocalCourseSelected(true);
            clearPendingScanCourseSelection();
        } else if (activeScanJob.selectedCourseId && activeScanJob.id && !restoredCourseJobIds.has(activeScanJob.id)) {
            restoredCourseJobIds.add(activeScanJob.id);
            setSelectedCourse(activeScanJob.selectedCourseId as string);
            setIsLocalCourseSelected(true);
        }

        // Regular mode - NOT session mode (session mode was only for pre-round flow)
        const currentUser = players.find(p => p.isUser);
        const aiDetectedPlayers: DetectedPlayer[] = scanResult.players.map(player => ({
            id: generateUniqueId(),
            name: player.name,
            nameConfidence: player.nameConfidence,
            teeColor: 'Blue',
            teeGender: userGender ?? 'M',
            scores: player.scores
                .filter(score => score.score !== null)
                .map(score => ({
                    holeNumber: score.hole,
                    strokes: score.score!,
                    confidence: score.confidence
                }))
        }));

        // Auto-link to existing players
        const linkedPlayers = aiDetectedPlayers.map(dp => {
            const match = players.find(p => p.name.toLowerCase().trim() === dp.name.toLowerCase().trim());
            if (match) {
                return { ...dp, linkedPlayerId: match.id, isUser: match.isUser, handicap: match.handicap };
            }
            return dp;
        });

        setDetectedPlayers(linkedPlayers);
        setDate(ensureValidDate(scanResult.date));
        setProcessingComplete(true);
    }, [activeScanJob, processingComplete]);

    const handleClose = () => {
        clearActiveScanJob();
        router.replace('/');
    };

    const handleSelectCourse = async (course: Course | ApiCourseData, selectedTee?: any) => {
        if ('holes' in course && !('tees' in course)) {
            setSelectedCourse(course.id);
            setSelectedApiCourse(null);
            setIsLocalCourseSelected(true);
        } else {
            setSelectedApiCourse({ apiCourse: course as ApiCourseData, selectedTee });
            setSelectedCourse(getDeterministicCourseId(course as ApiCourseData, selectedTee));
            setIsLocalCourseSelected(false);
        }
        setShowCourseSearchModal(false);
    };

    const handleAddCourseManually = () => {
        setShowCourseSearchModal(false);
        Alert.alert('Add Course', 'Please search for your course or enter it manually.');
    };

    const getSelectedCourseName = (): string => {
        if (selectedApiCourse?.apiCourse) {
            const { apiCourse } = selectedApiCourse;
            return `${apiCourse.club_name} - ${apiCourse.course_name}`;
        }
        const course = courses.find(c => c.id === selectedCourse);
        return course?.name || 'Select a course';
    };

    const getAvailableTeeSets = () => {
        if (selectedApiCourse) return selectedApiCourse.apiCourse.tees || [];
        const course = courses.find(c => c.id === selectedCourse);
        return (course as any)?.teeSets || [];
    };

    const openTeePicker = (playerId: string, index: number) => {
        const player = detectedPlayers.find(p => p.id === playerId);
        setTeePickerPlayerIndex(index);
        setTeePickerGenderTab(player?.teeGender || userGender || 'M');
        setShowTeePicker(true);
    };

    const handleSelectTee = (teeName: string, gender: 'M' | 'F') => {
        if (teePickerPlayerIndex !== null) {
            setDetectedPlayers(prev => {
                const updated = [...prev];
                updated[teePickerPlayerIndex] = { ...updated[teePickerPlayerIndex], teeColor: teeName, teeGender: gender };
                return updated;
            });
        }
        setShowTeePicker(false);
        setTeePickerPlayerIndex(null);
    };

    const handleAddPlayer = () => {
        const newPlayer: DetectedPlayer = {
            id: generateUniqueId(),
            name: `Player ${detectedPlayers.length + 1}`,
            teeColor: 'Blue',
            teeGender: userGender ?? 'M',
            scores: detectedPlayers[0]?.scores.map(s => ({ holeNumber: s.holeNumber, strokes: 0 })) || [],
        };
        setDetectedPlayers([...detectedPlayers, newPlayer]);
        setListVersion(v => v + 1);
    };

    const handleRemovePlayerById = (playerId: string) => {
        setDetectedPlayers(prev => prev.filter(p => p.id !== playerId));
        setListVersion(v => v + 1);
    };

    const handleEditPlayerNameById = (playerId: string, newName: string) => {
        setDetectedPlayers(prev => {
            const updated = prev.map(p => ({ ...p }));
            const idx = updated.findIndex(p => p.id === playerId);
            if (idx < 0) return prev;
            updated[idx].name = newName;

            // Auto-link if exact match found
            const exactMatch = players.find(p => p.name.toLowerCase() === newName.toLowerCase());
            if (exactMatch && !updated[idx].linkedPlayerId) {
                const matchesUserById = currentUserId && exactMatch.id === currentUserId;
                const matchesUserByFlag = exactMatch.isUser;
                const matchesUserByName = currentUserName && exactMatch.name.toLowerCase() === currentUserName;
                if (matchesUserById || matchesUserByFlag || matchesUserByName) {
                    // Treat as "You": set isUser, avoid Linked badge
                    updated.forEach(p => { p.isUser = false; });
                    updated[idx].isUser = true;
                    updated[idx].linkedPlayerId = exactMatch.id;
                    updated[idx].handicap = exactMatch.handicap ?? (profile as any)?.handicap ?? currentUser?.handicap;
                } else {
                    updated[idx].linkedPlayerId = exactMatch.id;
                    updated[idx].handicap = exactMatch.handicap;
                }
            }
            return updated;
        });
    };

    const handleEditPlayerHandicapById = (playerId: string, handicapStr: string) => {
        const handicap = parseFloat(handicapStr);
        setDetectedPlayers(prev => prev.map(p => p.id === playerId ? { ...p, handicap: isNaN(handicap) ? undefined : handicap } : p));
    };

    const handleMarkAsUserById = (playerId: string) => {
        setDetectedPlayers(prev => prev.map(p => ({ ...p, isUser: p.id === playerId ? !p.isUser : false })));
        setListVersion(v => v + 1);
    };

    const handleLinkPlayerById = (playerId: string) => {
        setSelectedPlayerId(playerId);
        const idx = detectedPlayers.findIndex(p => p.id === playerId);
        setSelectedPlayerIndex(idx >= 0 ? idx : null);
        setLinkingWasRemoved(false);
        setShowPlayerLinking(true);
    };

    const handleSelectExistingPlayer = (existingPlayerId: string, playerName: string, handicap?: number) => {
        const idx = selectedPlayerId ? detectedPlayers.findIndex(p => p.id === selectedPlayerId) : selectedPlayerIndex ?? -1;
        if (idx === null || idx < 0) return;
        setDetectedPlayers(prev => {
            const updated = [...prev];
            const current = { ...updated[idx] };
            current.linkedPlayerId = existingPlayerId;
            current.name = playerName;
            current.handicap = handicap;
            updated[idx] = current;
            return updated;
        });
        setListVersion(v => v + 1);
        setShowPlayerLinking(false);
        setSelectedPlayerIndex(null);
        setSelectedPlayerId(null);
    };

    const handleEditScore = (playerIndex: number, holeNumber: number, strokes: number) => {
        setDetectedPlayers(prev => {
            const updated = [...prev];
            updated[playerIndex] = {
                ...updated[playerIndex],
                scores: updated[playerIndex].scores.map(s => s.holeNumber === holeNumber ? { ...s, strokes } : s),
            };
            return updated;
        });
    };

    const getConfidenceStyle = (confidence?: number) => {
        if (confidence === undefined || confidence >= 0.8) return {};
        if (confidence >= 0.5) return { backgroundColor: 'rgba(255, 193, 7, 0.1)' };
        return { backgroundColor: 'rgba(244, 67, 54, 0.1)' };
    };

    const validateForm = () => {
        if (detectedPlayers.length === 0) {
            Alert.alert('Error', 'Please add at least one player.');
            return false;
        }
        if (!selectedCourse && !selectedApiCourse) {
            Alert.alert('Error', 'Please select a course.');
            return false;
        }
        return true;
    };

    const handleSaveRound = async () => {
        if (!validateForm() || isSaving) return;
        setIsSaving(true);

        try {
            let finalCourseId = selectedCourse as string;
            let finalCourseName = 'Unknown Course';

            if (selectedApiCourse) {
                const { apiCourse, selectedTee } = selectedApiCourse;
                const deterministicId = getDeterministicCourseId(apiCourse, selectedTee);
                let matchedCourse = courses.find(c => c.id === deterministicId);

                if (matchedCourse) {
                    finalCourseId = matchedCourse.id;
                    finalCourseName = matchedCourse.name;
                } else {
                    const newLocalCourse = await convertApiCourseToLocal(apiCourse, { selectedTee, fetchImage: true });
                    addCourse(newLocalCourse);
                    finalCourseId = newLocalCourse.id;
                    finalCourseName = newLocalCourse.name;
                }
            } else {
                const course = courses.find(c => c.id === selectedCourse);
                if (course) finalCourseName = course.name;
            }

            const roundId = generateUniqueId();
            const playerData = detectedPlayers.map(dp => {
                let playerId = dp.linkedPlayerId;
                if (!playerId) {
                    const newPlayer: Player = { id: generateUniqueId(), name: dp.name, isUser: dp.isUser || false, handicap: dp.handicap };
                    addPlayer(newPlayer);
                    playerId = newPlayer.id;
                }
                return {
                    playerId,
                    name: dp.name,
                    handicap: dp.handicap,
                    teeColor: dp.teeColor,
                    teeGender: dp.teeGender,
                    isUser: dp.isUser || false,
                    scores: dp.scores,
                };
            });

            const holeCount = detectedPlayers[0]?.scores.length || 18;
            const playersWithTotals = playerData.map(p => ({
                ...p,
                totalScore: p.scores.reduce((sum, s) => sum + s.strokes, 0)
            }));

            const newRound = {
                id: roundId,
                date,
                courseId: finalCourseId,
                courseName: finalCourseName,
                holeCount,
                players: playersWithTotals.map(p => ({
                    playerId: p.playerId,
                    playerName: p.name,
                    totalScore: p.totalScore,
                    handicapUsed: p.handicap,
                    teeColor: p.teeColor,
                    teeGender: p.teeGender,
                    isUser: p.isUser,
                    scores: p.scores.map(s => ({ holeNumber: s.holeNumber, strokes: s.strokes })),
                })),
                notes,
                syncStatus: 'pending',
            };

            addRound(newRound as any);
            markActiveScanReviewed();
            Alert.alert('Success', 'Round saved!', [{ text: 'OK', onPress: handleClose }]);
        } catch (error) {
            console.error('Failed to save round:', error);
            Alert.alert('Error', 'Failed to save round. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    // Player linking screen
    if (showPlayerLinking) {
        const selectedLinkedId = (() => {
            if (selectedPlayerId) {
                const p = detectedPlayers.find(dp => dp.id === selectedPlayerId);
                return p?.linkedPlayerId;
            }
            if (selectedPlayerIndex !== null && detectedPlayers[selectedPlayerIndex]) {
                return detectedPlayers[selectedPlayerIndex].linkedPlayerId;
            }
            return undefined;
        })();

        const handleUnlinkSelectedPlayer = () => {
            if (selectedPlayerIndex === null) return;
            setDetectedPlayers(prev => {
                const updated = [...prev];
                const current = { ...updated[selectedPlayerIndex] };
                current.linkedPlayerId = undefined;
                updated[selectedPlayerIndex] = current;
                return updated;
            });
            setLinkingWasRemoved(true);
        };

        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <Stack.Screen
                    options={{
                        title: "Link to Existing Player",
                        headerStyle: { backgroundColor: colors.background },
                        headerTitleStyle: { color: colors.text },
                        headerTintColor: colors.text,
                        headerLeft: () => (
                            <TouchableOpacity
                                onPress={() => {
                                    setShowPlayerLinking(false);
                                    setSelectedPlayerIndex(null);
                                    setSelectedPlayerId(null);
                                    setLinkingWasRemoved(false);
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={styles.headerButton}
                            >
                                <Text style={styles.headerButtonText}>{linkingWasRemoved ? 'Back' : 'Cancel'}</Text>
                            </TouchableOpacity>
                        ),
                        headerRight: () => (
                            selectedLinkedId ? (
                                <TouchableOpacity
                                    onPress={handleUnlinkSelectedPlayer}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={styles.headerButton}
                                >
                                    <Text style={styles.headerButtonText}>Remove Link</Text>
                                </TouchableOpacity>
                            ) : null
                        )
                    }}
                />
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <Text style={styles.linkingTitle}>
                        Select an existing player to link with{" "}
                        <Text style={styles.highlightText}>
                            {(() => {
                                const p = selectedPlayerId ? detectedPlayers.find(dp => dp.id === selectedPlayerId) : (selectedPlayerIndex !== null ? detectedPlayers[selectedPlayerIndex] : null);
                                return p ? p.name : "";
                            })()}
                        </Text>
                    </Text>
                    {linkablePlayers.length > 0 ? (
                        linkablePlayers.filter(p => !p.isUser).map((player, idx) => {
                            const isSelected = selectedLinkedId === player.id;
                            return (
                                <TouchableOpacity
                                    key={player.id || `${player.name}-${idx}`}
                                    style={[styles.playerLinkItem, isSelected && styles.playerLinkItemSelected]}
                                    onPress={() => handleSelectExistingPlayer(player.id, player.name, player.handicap)}
                                >
                                    <View style={styles.playerLinkAvatar}>
                                        <Text style={styles.playerLinkInitial}>{player.name.charAt(0)}</Text>
                                    </View>
                                    <View style={styles.playerLinkInfo}>
                                        <Text style={styles.playerLinkName}>{player.name}</Text>
                                        {player.handicap !== undefined && (
                                            <Text style={styles.playerLinkHandicap}>Scandicap: {player.handicap}</Text>
                                        )}
                                    </View>
                                    {isSelected ? (
                                        <Check size={20} color={colors.primary} />
                                    ) : (
                                        <LinkIcon size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    ) : (
                        <View style={styles.noPlayersContainer}>
                            <Text style={styles.noPlayersText}>No existing players found.</Text>
                            <Text style={styles.noPlayersSubtext}>Continue without linking to create a new player profile.</Text>
                            <Button
                                title="Continue Without Linking"
                                onPress={() => {
                                    setShowPlayerLinking(false);
                                    setSelectedPlayerIndex(null);
                                }}
                                style={styles.noPlayersButton}
                            />
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (!processingComplete) {
        return (
            <View style={styles.container}>
                <Stack.Screen options={{ title: "Loading...", headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTitleStyle: { color: colors.text }, headerTintColor: colors.text, headerLeft: () => <TouchableOpacity onPress={handleClose} style={styles.headerButton}><X size={24} color={colors.text} /></TouchableOpacity> }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading scan results...</Text>
                </View>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen
                options={{
                    title: "Scorecard Results",
                    headerShown: true,
                    headerStyle: { backgroundColor: colors.background },
                    headerTitleStyle: { color: colors.text, fontWeight: '600' },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    gestureEnabled: activeTab !== 'players',
                    headerLeft: () => (
                        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                            <X size={24} color={colors.text} />
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity onPress={handleSaveRound} style={styles.headerButton} disabled={isSaving}>
                            <Text style={[styles.headerButtonText, isSaving && { opacity: 0.5 }]}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </Text>
                        </TouchableOpacity>
                    ),
                }}
            />

            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'players' && styles.tabActive]} onPress={() => setActiveTab('players')}>
                    <User size={18} color={activeTab === 'players' ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}>Players</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'scores' && styles.tabActive]} onPress={() => setActiveTab('scores')}>
                    <Users size={18} color={activeTab === 'scores' ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'scores' && styles.tabTextActive]}>Scores</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'details' && styles.tabActive]} onPress={() => setActiveTab('details')}>
                    <MapPin size={18} color={activeTab === 'details' ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>Details</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'players' && (
                <View style={{ flex: 1 }}>
                    <DraggableFlatList
                        data={detectedPlayers}
                        extraData={listVersion}
                        keyExtractor={(item: DetectedPlayer) => item.id}
                        activationDistance={6}
                        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                        bounces={false}
                        scrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                        onDragBegin={() => { preDragPlayersRef.current = detectedPlayers.map(p => ({ ...p })); setIsDragging(true); }}
                        onDragEnd={({ data }: { data: DetectedPlayer[] }) => { setDetectedPlayers(data); setIsDragging(false); }}
                        ListHeaderComponent={
                            <View style={[styles.sectionHeader, isDragging && { pointerEvents: 'none' }]}>
                                <Text style={styles.sectionTitle}>Detected Players</Text>
                                <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer} disabled={isDragging}>
                                    <Plus size={16} color={colors.primary} />
                                    <Text style={styles.addPlayerText}>Add Player</Text>
                                </TouchableOpacity>
                            </View>
                        }
                        ListFooterComponent={
                            <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                                <Text style={styles.infoTitle}>Player Management</Text>
                                <Text style={styles.infoText}>• Drag to reorder players if they were detected incorrectly</Text>
                                <Text style={styles.infoText}>• Edit names by clicking on them and changing the text</Text>
                                <Text style={styles.infoText}>• Link players to existing profiles using the link icon</Text>
                                <Text style={styles.infoText}>• Mark yourself using the user icon</Text>
                                <Text style={styles.infoText}>• Set Scandicaps and tee colors for accurate scoring</Text>
                                <Text style={styles.infoText}>• Tap tee color to cycle through available options</Text>
                            </View>
                        }
                        renderItem={({ item: player, index, drag, isActive }: any) => (
                            <TouchableOpacity
                                activeOpacity={1}
                                onLongPress={drag}
                                delayLongPress={120}
                                style={[styles.playerCard, player.isUser && styles.userPlayerCard, isActive && styles.draggingPlayerCard]}
                            >
                                <View style={styles.playerHeaderRow}>
                                    <TouchableOpacity style={styles.dragHandle} onLongPress={drag} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                                        <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            style={[styles.playerNameInline, getConfidenceStyle(player.nameConfidence)]}
                                            value={player.name}
                                            onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                                            editable={!player.linkedPlayerId}
                                            placeholder="Player Name"
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                    </View>
                                    <View style={styles.headerRightRow}>
                                        {player.isUser && <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>}
                                        {player.linkedPlayerId && !player.isUser && <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>}
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleLinkPlayerById(player.id)}>
                                            <LinkIcon size={18} color={player.isUser ? colors.primary : player.linkedPlayerId ? colors.text : colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleMarkAsUserById(player.id)}>
                                            <User size={18} color={player.isUser ? colors.text : colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleRemovePlayerById(player.id)}>
                                            <X size={18} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.playerDetailsRow}>
                                    <View style={styles.handicapContainer}>
                                        <Text style={styles.handicapLabel}>Scandicap:</Text>
                                        <TextInput
                                            style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                                            value={player.handicap !== undefined ? String(player.handicap) : ''}
                                            onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                                            placeholder="Not set"
                                            placeholderTextColor={colors.text}
                                            keyboardType="numeric"
                                            editable={!player.isUser}
                                        />
                                    </View>
                                    <View style={styles.teeColorContainer}>
                                        <Text style={styles.teeColorLabel}>Tee:</Text>
                                        <TouchableOpacity style={styles.teeColorSelector} onPress={() => openTeePicker(player.id, index)} activeOpacity={0.9}>
                                            <Text style={styles.teeColorText}>{player.teeColor || 'Select'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {activeTab === 'scores' && (
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.sectionHeaderColumn}>
                        <Text style={styles.sectionTitle}>Scores</Text>
                        <Text style={styles.sectionSubtitle}>Review and edit scores for each hole</Text>
                        <View style={styles.retakeRow}>
                            <RotateCcw size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                            <Text style={styles.retakeRowText}>Scores look off? Retake a clearer photo.</Text>
                            <Button title="Retake" variant="outline" size="small" onPress={handleClose} style={styles.retakeButton} />
                        </View>
                    </View>

                    <View style={styles.scoresTable}>
                        <View style={styles.scoresTableHeader}>
                            <Text style={[styles.scoresTableHeaderCell, styles.holeBandCell, styles.holeHeaderLabel]}>HOLE</Text>
                            <Text style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}>PAR</Text>
                            {detectedPlayers.map(player => (
                                <Text key={player.id} numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.playerScoreCell, styles.headerLabel]}>
                                    {player.name}{player.isUser ? " (You)" : ""}
                                </Text>
                            ))}
                        </View>

                        {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                            const localCourse = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
                            const localHole = localCourse ? localCourse.holes.find(h => h.number === score.holeNumber) : null;
                            const par = localHole?.par ?? 4;

                            return (
                                <View key={score.holeNumber} style={styles.scoresTableRow}>
                                    <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>{score.holeNumber}</Text>
                                    <Text style={[styles.scoresTableCell, styles.holeParCell]}>{par}</Text>
                                    {detectedPlayers.map((player, playerIndex) => {
                                        const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                                        const strokes = playerScore?.strokes || 0;
                                        let scoreColor = colors.text;
                                        if (strokes > 0) {
                                            if (strokes < par) scoreColor = colors.success;
                                            else if (strokes > par) scoreColor = colors.error;
                                        }

                                        return (
                                            <TextInput
                                                key={player.id}
                                                style={[styles.scoresTableCell, styles.playerScoreCell, styles.scoreInput, { color: scoreColor }]}
                                                value={strokes > 0 ? strokes.toString() : ""}
                                                onChangeText={(text) => {
                                                    const newStrokes = parseInt(text, 10);
                                                    if (!isNaN(newStrokes)) handleEditScore(playerIndex, score.holeNumber, newStrokes);
                                                    else if (text === '') handleEditScore(playerIndex, score.holeNumber, 0);
                                                }}
                                                keyboardType="number-pad"
                                                maxLength={2}
                                                placeholder="-"
                                                placeholderTextColor={colors.inactive}
                                            />
                                        );
                                    })}
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            )}

            {activeTab === 'details' && (
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Course</Text>
                        <TouchableOpacity style={styles.courseSelector} onPress={() => setShowCourseSearchModal(true)}>
                            <Text style={selectedCourse ? styles.selectedCourseText : styles.placeholderText}>{getSelectedCourseName()}</Text>
                            <ChevronDown size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Date</Text>
                        <View style={styles.dateContainer}>
                            <Calendar size={20} color={colors.textSecondary} style={styles.dateIcon} />
                            <TextInput style={styles.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
                        </View>
                    </View>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Notes</Text>
                        <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes} placeholder="Add notes about this round..." placeholderTextColor={colors.textSecondary} multiline numberOfLines={4} textAlignVertical="top" />
                    </View>
                </ScrollView>
            )}

            <View style={styles.bottomBar}>
                <Button title={isSaving ? "Saving..." : "Save Round"} onPress={handleSaveRound} style={styles.saveButton} disabled={isSaving} />
            </View>

            <Modal visible={showTeePicker} animationType="slide" transparent onRequestClose={() => setShowTeePicker(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTeePicker(false)}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select a Tee</Text>
                            <View style={styles.genderTabs}>
                                <TouchableOpacity style={[styles.genderTab, teePickerGenderTab === 'M' && styles.genderTabActive]} onPress={() => setTeePickerGenderTab('M')}>
                                    <Text style={[styles.genderTabText, teePickerGenderTab === 'M' && styles.genderTabTextActive]}>Men</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.genderTab, teePickerGenderTab === 'F' && styles.genderTabActive]} onPress={() => setTeePickerGenderTab('F')}>
                                    <Text style={[styles.genderTabText, teePickerGenderTab === 'F' && styles.genderTabTextActive]}>Women</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {getAvailableTeeSets().filter((t: any) => !t.gender || t.gender === teePickerGenderTab).map((tee: any) => (
                                <TouchableOpacity key={`${tee.gender ?? 'U'}-${tee.name}`} style={styles.teeOption} onPress={() => handleSelectTee(tee.name, (tee.gender as 'M' | 'F') || teePickerGenderTab)}>
                                    <Text style={styles.teeOptionName}>{tee.name}</Text>
                                    {tee.rating && <Text style={styles.teeOptionInfo}>{tee.rating}/{tee.slope}</Text>}
                                </TouchableOpacity>
                            ))}
                            {getAvailableTeeSets().length === 0 && <Text style={styles.emptyTeeText}>No tee data available.</Text>}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {showCourseSearchModal && (
                <CourseSearchModal
                    visible={showCourseSearchModal}
                    testID="review-course-modal"
                    onClose={() => setShowCourseSearchModal(false)}
                    onSelectCourse={handleSelectCourse}
                    onAddManualCourse={handleAddCourseManually}
                    showMyCoursesTab={true}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 16, color: colors.text, fontSize: 16 },
    headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
    headerButtonText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
    tabContainer: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 22, backgroundColor: 'rgba(29, 90, 84, 0.10)', padding: 4, borderWidth: 1, borderColor: 'rgba(29, 90, 84, 0.12)', overflow: 'hidden' },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 18, backgroundColor: 'transparent' },
    tabActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    tabText: { fontSize: 14, color: colors.text, fontWeight: '600', marginLeft: 6 },
    tabTextActive: { color: colors.text, fontWeight: '700' },
    scrollView: { flex: 1 },
    contentContainer: { padding: 16, paddingBottom: 100 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionHeaderColumn: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 },
    sectionSubtitle: { fontSize: 14, color: colors.textSecondary },
    addPlayerButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: `${colors.primary}15`, borderRadius: 8 },
    addPlayerText: { fontSize: 14, color: colors.primary, fontWeight: '600', marginLeft: 4 },
    playerCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    userPlayerCard: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: `${colors.primary}08` },
    draggingPlayerCard: { opacity: 0.95, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
    playerHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    dragHandle: { padding: 4, marginRight: 8 },
    playerNameInline: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, marginRight: 8 },
    headerRightRow: { flexDirection: 'row', alignItems: 'center' },
    userBadge: { backgroundColor: `${colors.primary}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
    userBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary },
    linkedBadge: { backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
    linkedBadgeText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
    playerAction: { padding: 8 },
    playerDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    handicapContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    handicapLabel: { fontSize: 14, color: colors.text, marginRight: 8 },
    handicapInput: { flex: 1, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, fontSize: 14, color: colors.text },
    handicapInputDisabled: { backgroundColor: '#f5f5f5', color: colors.textSecondary },
    teeColorContainer: { flexDirection: 'row', alignItems: 'center' },
    teeColorLabel: { fontSize: 14, color: colors.text, marginRight: 8 },
    teeColorSelector: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, minWidth: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    teeColorText: { fontSize: 13, fontWeight: '600', color: colors.text },
    retakeRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.card, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border },
    retakeRowText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
    retakeButton: { minHeight: 32 },
    scoresTable: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    scoresTableHeader: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.03)', borderBottomWidth: 1, borderBottomColor: colors.border },
    scoresTableHeaderCell: { paddingVertical: 10, paddingHorizontal: 8, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.text },
    holeBandCell: { width: 50, backgroundColor: colors.text },
    holeParCell: { width: 45 },
    playerScoreCell: { flex: 1, minWidth: 50 },
    holeHeaderLabel: { color: '#FFF', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
    headerLabel: { color: colors.textSecondary, fontWeight: '600', fontSize: 11 },
    scoresTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
    scoresTableCell: { paddingVertical: 10, paddingHorizontal: 8, textAlign: 'center', fontSize: 14, color: colors.text },
    holeNumberText: { fontWeight: '600', color: '#FFF' },
    scoreInput: { textAlign: 'center', fontSize: 14, fontWeight: '500' },
    detailSection: { marginBottom: 20 },
    detailLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    courseSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    selectedCourseText: { fontSize: 15, color: colors.text, fontWeight: '500' },
    placeholderText: { fontSize: 15, color: colors.textSecondary },
    dateContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    dateIcon: { marginRight: 10 },
    dateInput: { flex: 1, fontSize: 15, color: colors.text },
    notesInput: { backgroundColor: colors.card, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 15, color: colors.text, minHeight: 100 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
    saveButton: { width: '100%' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
    genderTabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 2 },
    genderTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
    genderTabActive: { backgroundColor: colors.card },
    genderTabText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    genderTabTextActive: { color: colors.text },
    modalList: { padding: 16 },
    teeOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    teeOptionName: { fontSize: 16, color: colors.text, fontWeight: '500' },
    teeOptionInfo: { fontSize: 14, color: colors.textSecondary },
    infoBox: { backgroundColor: `${colors.text}10`, borderRadius: 10, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#E6EAE9' },
    infoTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
    infoText: { fontSize: 14, color: colors.text, marginBottom: 4 },
    emptyTeeText: { textAlign: 'center', color: colors.textSecondary, marginTop: 20, fontSize: 14 },
    // Linking screen styles
    linkingTitle: { fontSize: 16, color: colors.text, marginBottom: 16 },
    highlightText: { fontWeight: '600', color: colors.primary },
    playerLinkItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    playerLinkItemSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}08` },
    playerLinkAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    playerLinkInitial: { fontSize: 18, fontWeight: '600', color: colors.primary },
    playerLinkInfo: { flex: 1 },
    playerLinkName: { fontSize: 16, fontWeight: '500', color: colors.text },
    playerLinkHandicap: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    noPlayersContainer: { alignItems: 'center', padding: 24 },
    noPlayersText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
    noPlayersSubtext: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
    noPlayersButton: { marginTop: 8 },
});
