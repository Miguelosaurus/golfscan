import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/constants/colors';
import { Play, Users, MapPin, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SessionBannerProps {
    sessionId: string;
    courseName: string;
    gameType: string;
    playerCount: number;
    status: 'pending' | 'active';
    onResume?: () => void;
    onDismiss?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
    primaryGreen: '#1E6059',
    lightGreenBg: '#E8F3F1',
    accentOrange: '#FC661A',
    textMain: '#1A3330',
    textSub: '#5C706D',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SessionBanner({
    sessionId,
    courseName,
    gameType,
    playerCount,
    status,
    onResume,
    onDismiss,
}: SessionBannerProps) {
    const router = useRouter();

    const formatGameType = (type: string) => {
        return type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onResume}
            activeOpacity={0.85}
        >
            {/* Dismiss button */}
            {onDismiss && (
                <TouchableOpacity
                    style={styles.dismissButton}
                    onPress={onDismiss}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <X size={18} color={THEME.textMain} />
                </TouchableOpacity>
            )}

            {/* Left Side: Icon block matching scan card image size (80x80) */}
            <View style={styles.iconWrapper}>
                <View style={styles.iconContainer}>
                    <Play size={24} color="white" fill="white" />
                </View>
            </View>

            {/* Middle: Details */}
            <View style={styles.content}>
                <Text style={styles.statusLabel}>
                    {status === 'pending' ? 'Active Session' : 'Game In Progress'}
                </Text>
                <Text style={styles.gameType} numberOfLines={1}>
                    {formatGameType(gameType)}
                </Text>

                <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                        <Users size={12} color={THEME.textSub} />
                        <Text style={styles.detailText}>{playerCount} players</Text>
                    </View>
                    <View style={styles.detailItem}>
                        <MapPin size={12} color={THEME.textSub} />
                        <Text style={styles.detailText} numberOfLines={1}>{courseName}</Text>
                    </View>
                </View>
            </View>

            {/* Right: Action Indicator */}
            <View style={styles.action}>
                <Text style={styles.actionText}>View</Text>
            </View>
        </TouchableOpacity>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.lightGreenBg,
        borderRadius: 16,
        padding: 16,
        // Remove individual marginVertical to let ListHeaderComponent handle it
        borderWidth: 2,
        borderColor: THEME.primaryGreen,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 }, // Matched scanCard
        shadowOpacity: 0.08,                   // Matched scanCard
        shadowRadius: 8,                      // Matched scanCard
        elevation: 2,                        // Matched scanCard
        position: 'relative',
    },
    dismissButton: {
        position: 'absolute',
        top: 8,  // Matched scanCardDismiss
        right: 8, // Matched scanCardDismiss
        zIndex: 10,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.08)', // Matched scanCardDismiss
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrapper: {
        width: 80,  // Matched scanCardImageWrapper
        height: 80, // Matched scanCardImageWrapper
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: 16, // Matched scanCardImageWrapper
    },
    iconContainer: {
        width: '100%',
        height: '100%',
        backgroundColor: THEME.accentOrange,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    statusLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: THEME.primaryGreen,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 2,
    },
    gameType: {
        fontSize: 16,   // Matched scanCardTitle
        fontWeight: '600', // Matched scanCardTitle
        color: THEME.textMain,
        marginBottom: 4,  // Matched scanCardTitle
    },
    detailsRow: {
        flexDirection: 'column',
        gap: 2,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    detailText: {
        fontSize: 12, // Matched scanCardSubtext
        color: THEME.textSub,
        fontWeight: '500',
    },
    action: {
        backgroundColor: THEME.primaryGreen,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 10,
        marginRight: 24, // Separation from X button
    },
    actionText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
    },
});
