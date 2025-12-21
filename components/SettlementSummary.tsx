import React from 'react';
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

    const handleShare = async () => {
        if (onShare) {
            onShare();
            return;
        }

        // Build share message
        let message = `🏌️ ${gameType.replace('_', ' ').toUpperCase()} Results\n\n`;

        if (segmentResults && segmentResults.length > 0) {
            for (const seg of segmentResults) {
                message += `${seg.segment}: ${seg.winnerName} won ${formatCents(seg.amountCents)}\n`;
            }
            message += '\n';
        }

        message += `My Balance: ${isPositive ? '+' : ''}${formatCents(netBalance)}`;

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

            {/* Who Owes Whom */}
            <View style={styles.transactionsContainer}>
                <Text style={styles.sectionLabel}>Who Owes Whom:</Text>
                {transactions.map((tx, idx) => (
                    <View key={idx} style={styles.transactionRow}>
                        <Text style={styles.transactionFrom}>{tx.fromPlayerName}</Text>
                        <Text style={styles.transactionArrow}>→</Text>
                        <Text style={styles.transactionTo}>{tx.toPlayerName}</Text>
                        <Text style={styles.transactionAmount}>
                            {formatCents(tx.amountCents)}
                        </Text>
                    </View>
                ))}
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
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
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
