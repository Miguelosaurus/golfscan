import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/constants/colors';
import {
    Target,
    Swords,
    Flag,
    Sparkles,
    Info
} from 'lucide-react-native';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GameType = 'stroke_play' | 'match_play' | 'nassau' | 'skins';

interface GameTypeOption {
    type: GameType;
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

interface GameTypeGridProps {
    selected: GameType | null;
    onSelect: (type: GameType) => void;
    onShowRules?: (type: GameType) => void;
    playerCount?: number; // Number of players to determine availability
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME TYPE OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

const GAME_TYPES: GameTypeOption[] = [
    {
        type: 'stroke_play',
        name: 'Stroke Play',
        description: 'Lowest total score wins',
        icon: <Target size={28} color="#1E6059" />,
        color: '#E8F5E9',
    },
    {
        type: 'match_play',
        name: 'Match Play',
        description: 'Win the most holes',
        icon: <Swords size={28} color="#1565C0" />,
        color: '#E3F2FD',
    },
    {
        type: 'nassau',
        name: 'Nassau',
        description: 'Front 9 + Back 9 + Overall',
        icon: <Flag size={28} color="#7B1FA2" />,
        color: '#F3E5F5',
    },
    {
        type: 'skins',
        name: 'Skins',
        description: 'Win each hole individually',
        icon: <Sparkles size={28} color="#FF8F00" />,
        color: '#FFF3E0',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GameTypeGrid({ selected, onSelect, onShowRules, playerCount = 0 }: GameTypeGridProps) {
    // Determine if a game type is available based on player count
    const getAvailability = (type: GameType): { available: boolean; reason?: string } => {
        if (type === 'match_play' || type === 'nassau') {
            // Match Play and Nassau require exactly 2 players (1v1) or 4 players (2v2)
            if (playerCount !== 2 && playerCount !== 4) {
                return {
                    available: false,
                    reason: playerCount > 4
                        ? 'Max 4 players supported'
                        : 'Requires 2 or 4 players'
                };
            }
        }
        // Stroke Play and Skins work with any number of players (2+)
        return { available: true };
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Choose Game Type</Text>
            <View style={styles.grid}>
                {GAME_TYPES.map((game) => {
                    const isSelected = selected === game.type;
                    const { available, reason } = getAvailability(game.type);

                    return (
                        <TouchableOpacity
                            key={game.type}
                            style={[
                                styles.card,
                                { backgroundColor: game.color },
                                isSelected && styles.cardSelected,
                                !available && styles.cardDisabled,
                            ]}
                            onPress={() => available && onSelect(game.type)}
                            activeOpacity={available ? 0.7 : 1}
                            disabled={!available}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.iconContainer, !available && styles.iconDisabled]}>
                                    {game.icon}
                                </View>
                                {onShowRules && (
                                    <TouchableOpacity
                                        style={styles.infoButton}
                                        onPress={() => onShowRules(game.type)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Info size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={[styles.cardTitle, !available && styles.textDisabled]}>
                                {game.name}
                            </Text>
                            <Text style={[styles.cardDescription, !available && styles.textDisabled]}>
                                {available ? game.description : reason}
                            </Text>
                            {isSelected && available && <View style={styles.selectedIndicator} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME RULES (for GameRulesModal)
// ═══════════════════════════════════════════════════════════════════════════

export const GAME_RULES: Record<GameType, { title: string; rules: string[] }> = {
    stroke_play: {
        title: 'Stroke Play',
        rules: [
            'Each player counts every stroke taken during the round.',
            'The player with the lowest total net score wins.',
            'Net score = Gross score - Handicap strokes received.',
            'Ties are usually split or decided by a playoff.',
        ],
    },
    match_play: {
        title: 'Match Play',
        rules: [
            'Players compete hole by hole.',
            'The player with the lowest net score on each hole wins that hole.',
            'The player who wins the most holes wins the match.',
            'Strokes are given based on the difference between handicaps.',
            'If tied after 18 holes, the match is "all square" (tie).',
        ],
    },
    nassau: {
        title: 'Nassau',
        rules: [
            'Three separate bets in one: Front 9, Back 9, and Overall 18.',
            'Each segment is essentially a mini match play competition.',
            'Win the most holes in each segment to win that bet.',
            '"Press" option: If losing by 2+ holes, you can start a new bet.',
            'Common format is "2-2-2" (same bet on each segment).',
        ],
    },
    skins: {
        title: 'Skins',
        rules: [
            'Each hole has a "skin" worth a set value.',
            'The player with the lowest net score wins the skin.',
            'If two or more players tie, the skin carries over to the next hole.',
            'Carryovers can make later holes worth multiple skins.',
            'Unclaimed skins at the end are usually split or replayed.',
        ],
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
    container: {
        paddingVertical: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 16,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
    },
    card: {
        width: '48%',
        marginHorizontal: '1%',
        marginBottom: 12,
        borderRadius: 16,
        padding: 16,
        minHeight: 120,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    cardSelected: {
        borderColor: colors.primary,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    infoButton: {
        padding: 4,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 4,
    },
    cardDescription: {
        fontSize: 12,
        color: colors.textSecondary,
        opacity: 0.8,
    },
    cardDisabled: {
        opacity: 0.5,
    },
    iconDisabled: {
        opacity: 0.5,
    },
    textDisabled: {
        color: '#A0A0A0',
    },
    selectedIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        borderWidth: 3,
        borderColor: 'white',
    },
});
