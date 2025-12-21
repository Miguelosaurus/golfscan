import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/constants/colors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Hole {
    number: number;
    par: number;
    hcp: number;
}

interface PlayerAllocation {
    playerId: string;
    name: string;
    courseHandicap: number;
    strokesByHole: number[]; // 18 elements
}

interface StrokeAllocationChartProps {
    holes: Hole[];
    players: PlayerAllocation[];
    holeSelection: '18' | 'front_9' | 'back_9';
    format?: 'usga' | 'modified';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function StrokeAllocationChart({
    holes,
    players,
    holeSelection,
    format = 'usga',
}: StrokeAllocationChartProps) {
    // Filter holes based on selection
    const displayHoles = holes.filter((h) => {
        if (holeSelection === 'front_9') return h.number <= 9;
        if (holeSelection === 'back_9') return h.number >= 10;
        return true;
    });

    // Get stroke index for display
    const getStrokeIndexForHole = (holeIndex: number): number => {
        return displayHoles[holeIndex]?.hcp || 0;
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Stroke Allocation</Text>
                <Text style={styles.formatBadge}>
                    {format === 'usga' ? 'Based on Best Player' : 'Full Handicap'}
                </Text>
            </View>

            {/* Scrollable Chart */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chartContainer}>
                    {/* Column Headers (Hole Numbers) */}
                    <View style={styles.row}>
                        <View style={styles.labelCell}>
                            <Text style={styles.labelText}>Hole</Text>
                        </View>
                        {displayHoles.map((hole) => (
                            <View key={`h-${hole.number}`} style={styles.cell}>
                                <Text style={styles.headerText}>{hole.number}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Par Row */}
                    <View style={styles.row}>
                        <View style={styles.labelCell}>
                            <Text style={styles.labelText}>Par</Text>
                        </View>
                        {displayHoles.map((hole) => (
                            <View key={`p-${hole.number}`} style={styles.cell}>
                                <Text style={styles.parText}>{hole.par}</Text>
                            </View>
                        ))}
                    </View>

                    {/* HCP (Stroke Index) Row */}
                    <View style={styles.row}>
                        <View style={styles.labelCell}>
                            <Text style={styles.labelText}>HCP</Text>
                        </View>
                        {displayHoles.map((hole) => (
                            <View key={`hcp-${hole.number}`} style={styles.cell}>
                                <Text style={styles.hcpText}>{hole.hcp}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Player Rows */}
                    {players.map((player) => {
                        const strokesForDisplay = holeSelection === 'back_9'
                            ? player.strokesByHole.slice(9, 18)
                            : holeSelection === 'front_9'
                                ? player.strokesByHole.slice(0, 9)
                                : player.strokesByHole;

                        return (
                            <View key={player.playerId} style={styles.playerRow}>
                                <View style={styles.playerLabelCell}>
                                    <Text style={styles.playerName} numberOfLines={1}>
                                        {player.name}
                                    </Text>
                                    <Text style={styles.playerCH}>CH {player.courseHandicap}</Text>
                                </View>
                                {strokesForDisplay.map((strokes, idx) => (
                                    <View key={`${player.playerId}-${idx}`} style={styles.cell}>
                                        {strokes > 0 && (
                                            <View style={styles.strokeDotsContainer}>
                                                {Array.from({ length: strokes }).map((_, dotIdx) => (
                                                    <View key={dotIdx} style={styles.strokeDot} />
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Legend */}
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={styles.strokeDot} />
                    <Text style={styles.legendText}>Get Strokes</Text>
                </View>
            </View>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const CELL_WIDTH = 36;

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginVertical: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.text,
    },
    formatBadge: {
        fontSize: 12,
        color: colors.textSecondary,
        backgroundColor: colors.background,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    chartContainer: {
        flexDirection: 'column',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    labelCell: {
        width: 60,
        paddingRight: 8,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    playerLabelCell: {
        width: 80,
        paddingRight: 8,
        justifyContent: 'center',
    },
    cell: {
        width: CELL_WIDTH,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 1,
        borderRightColor: colors.border,
    },
    labelText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    headerText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    parText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    hcpText: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    playerName: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    playerCH: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 8,
    },
    strokeDotsContainer: {
        flexDirection: 'row',
        gap: 3,
    },
    strokeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    legend: {
        flexDirection: 'row',
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
});
