import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { colors } from '@/constants/colors';
import { DollarSign, TrendingUp, TrendingDown, Share2 } from 'lucide-react-native';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Transaction {
    fromPlayerName: string;
    toPlayerName: string;
    amountCents: number;
    reason: string;
}

interface SegmentResult {
    segment: string;
    winnerName: string;
    amountCents: number;
}

interface SettlementSummaryProps {
    gameType: string;
    myPlayerName: string;
    segmentResults?: SegmentResult[];
    transactions: Transaction[];
    onShare?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function calculateNetBalance(
    transactions: Transaction[],
    myName: string
): number {
    let balance = 0;
    for (const tx of transactions) {
        if (tx.toPlayerName === myName) {
            balance += tx.amountCents;
        }
        if (tx.fromPlayerName === myName) {
            balance -= tx.amountCents;
        }
    }
    return balance;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SettlementSummary({
    gameType,
    myPlayerName,
    segmentResults,
    transactions,
    onShare,
}: SettlementSummaryProps) {
    const netBalance = calculateNetBalance(transactions, myPlayerName);
    const isPositive = netBalance >= 0;

    // Consolidate transactions: net amounts per player pair with combined reasons
    const consolidatedTransactions = useMemo(() => {
        // Group by player pair (always order alphabetically to ensure same key for A→B and B→A)
        const pairMap = new Map<string, {
            player1: string;
            player2: string;
            netAmount: number; // Positive = player1 owes player2
            reasons: string[];
        }>();

        for (const tx of transactions) {
            const [first, second] = [tx.fromPlayerName, tx.toPlayerName].sort();
            const key = `${first}|${second}`;

            if (!pairMap.has(key)) {
                pairMap.set(key, {
                    player1: first,
                    player2: second,
                    netAmount: 0,
                    reasons: [],
                });
            }

            const entry = pairMap.get(key)!;
            // If fromPlayer is player1, they owe player2 (positive)
            // If fromPlayer is player2, player2 owes player1 (negative from player1's perspective)
            if (tx.fromPlayerName === entry.player1) {
                entry.netAmount += tx.amountCents;
            } else {
                entry.netAmount -= tx.amountCents;
            }

            // Add reason if not already included
            if (tx.reason && !entry.reasons.includes(tx.reason)) {
                entry.reasons.push(tx.reason);
            }
        }

        // Convert to final format: who actually owes whom based on net
        const result: { from: string; to: string; amount: number; reasons: string[] }[] = [];

        pairMap.forEach((entry) => {
            if (entry.netAmount === 0) return; // No debt

            if (entry.netAmount > 0) {
                // player1 owes player2
                result.push({
                    from: entry.player1,
                    to: entry.player2,
                    amount: entry.netAmount,
                    reasons: entry.reasons,
                });
            } else {
                // player2 owes player1
                result.push({
                    from: entry.player2,
                    to: entry.player1,
                    amount: Math.abs(entry.netAmount),
                    reasons: entry.reasons,
                });
            }
        });

        return result;
    }, [transactions]);

    const handleShare = async () => {
        if (onShare) {
            onShare();
            return;
        }

        // Build share message
        let message = `🏌️ ${gameType.replace('_', ' ').toUpperCase()} Results\n\n`;

        // Add consolidated settlements
        message += `💵 Settlement:\n`;
        for (const tx of consolidatedTransactions) {
            message += `• ${tx.from} owes ${tx.to}: ${formatCents(tx.amount)}\n`;
            if (tx.reasons.length > 0) {
                message += `  (${tx.reasons.join(', ')})\n`;
            }
        }

        try {
            await Share.share({ message });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <DollarSign size={20} color={colors.primary} />
                    <Text style={styles.title}>Settlement</Text>
                </View>
                <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                    <Share2 size={18} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Segment Results (for Nassau) */}
            {segmentResults && segmentResults.length > 0 && (
                <View style={styles.segmentsContainer}>
                    <Text style={styles.sectionLabel}>Results:</Text>
                    {segmentResults.map((seg, idx) => (
                        <View key={idx} style={styles.segmentRow}>
                            <Text style={styles.segmentName}>{seg.segment}</Text>
                            <Text style={styles.segmentWinner}>
                                {seg.winnerName} won
                            </Text>
                            <Text style={styles.segmentAmount}>
                                {formatCents(seg.amountCents)}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Who Owes Whom - Consolidated */}
            <View style={styles.transactionsContainer}>
                <Text style={styles.sectionLabel}>Who Owes Whom:</Text>
                {consolidatedTransactions.length === 0 ? (
                    <Text style={styles.noDebtText}>All settled up! 🎉</Text>
                ) : (
                    consolidatedTransactions.map((tx, idx) => (
                        <View key={idx} style={styles.transactionRow}>
                            <View style={styles.transactionHeader}>
                                <View style={styles.transactionParties}>
                                    <Text style={styles.transactionFrom}>{tx.from}</Text>
                                    <Text style={styles.transactionArrow}>→</Text>
                                    <Text style={styles.transactionTo}>{tx.to}</Text>
                                </View>
                                <Text style={styles.transactionAmount}>
                                    {formatCents(tx.amount)}
                                </Text>
                            </View>
                            {tx.reasons.length > 0 && (
                                <Text style={styles.transactionReason}>
                                    {tx.reasons.join(' + ')}
                                </Text>
                            )}
                        </View>
                    ))
                )}
            </View>

            {/* Net Balance Card */}
            <View style={[styles.balanceCard, isPositive ? styles.positiveCard : styles.negativeCard]}>
                <View style={styles.balanceIcon}>
                    {isPositive ? (
                        <TrendingUp size={24} color={isPositive ? '#2E7D32' : '#D32F2F'} />
                    ) : (
                        <TrendingDown size={24} color={isPositive ? '#2E7D32' : '#D32F2F'} />
                    )}
                </View>
                <View style={styles.balanceContent}>
                    <Text style={styles.balanceLabel}>Your Balance</Text>
                    <Text style={[styles.balanceAmount, isPositive ? styles.positiveText : styles.negativeText]}>
                        {isPositive ? '+' : ''}{formatCents(netBalance)}
                    </Text>
                </View>
                {isPositive && netBalance > 0 && (
                    <Text style={styles.balanceEmoji}>🎉</Text>
                )}
            </View>

            {/* Share Button */}
            <TouchableOpacity style={styles.shareResultsButton} onPress={handleShare}>
                <Share2 size={18} color="white" />
                <Text style={styles.shareResultsText}>Share Results</Text>
            </TouchableOpacity>
        </View>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 20,
        marginVertical: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    shareButton: {
        padding: 8,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    segmentsContainer: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    segmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    segmentName: {
        width: 80,
        fontSize: 14,
        color: colors.textSecondary,
    },
    segmentWinner: {
        flex: 1,
        fontSize: 14,
        color: colors.text,
    },
    segmentAmount: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    transactionsContainer: {
        marginBottom: 16,
    },
    transactionRow: {
        flexDirection: 'column',
        backgroundColor: colors.background,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    transactionFrom: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    transactionArrow: {
        fontSize: 14,
        color: colors.textSecondary,
        marginHorizontal: 8,
    },
    transactionTo: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    transactionAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primary,
        marginLeft: 8,
    },
    transactionParties: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    balanceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
    },
    positiveCard: {
        backgroundColor: '#E8F5E9',
    },
    negativeCard: {
        backgroundColor: '#FFEBEE',
    },
    balanceIcon: {
        marginRight: 12,
    },
    balanceContent: {
        flex: 1,
    },
    balanceLabel: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    balanceAmount: {
        fontSize: 24,
        fontWeight: '700',
    },
    positiveText: {
        color: '#2E7D32',
    },
    negativeText: {
        color: '#D32F2F',
    },
    balanceEmoji: {
        fontSize: 28,
    },
    breakdownContainer: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    breakdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    breakdownIcon: {
        fontSize: 18,
        marginRight: 10,
    },
    breakdownLabel: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        fontWeight: '500',
    },
    breakdownAmount: {
        fontSize: 16,
        fontWeight: '700',
    },
    transactionReason: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 6,
        textAlign: 'right',
    },
    noDebtText: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 16,
    },
    shareResultsButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.primary,
        borderRadius: 12,
        padding: 14,
        gap: 8,
    },
    shareResultsText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});
