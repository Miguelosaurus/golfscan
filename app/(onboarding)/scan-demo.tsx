import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { Camera, Play, Sparkles } from 'lucide-react-native';

// Demo scorecard data - actual scores from the provided scorecard image
// Players: ALEX (Gross), BEN (Net), CHRIS (Net)
// Pars: 4, 3, 4, 4, 4, 3, 4, 4, 5
const DEMO_PARS = [4, 3, 4, 4, 4, 3, 4, 4, 5];
const DEMO_PLAYERS = [
    { name: 'ALEX', scores: [6, 5, 4, 7, 4, 3, 5, 5, 6] },
    { name: 'BEN', scores: [5, 4, 4, 4, 5, 4, 4, 5, 5] },
    { name: 'CHRIS', scores: [4, 3, 5, 4, 4, 4, 5, 4, 5] },
];

export default function ScanDemoScreen() {
    const router = useRouter();
    const scanAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(scanAnim, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const scanTranslateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 150],
    });

    const handleScanReal = () => {
        // Navigate to actual scanner with onboarding mode flag
        router.push('/scan-scorecard?onboardingMode=true');
    };

    const handleTryDemo = () => {
        // Navigate to demo-scan for camera capture experience
        router.push('/(onboarding)/demo-scan');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="scan-demo" />

            <View style={styles.content}>
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <Sparkles size={32} color={colors.primary} />
                    </View>
                    <Text style={styles.title}>Ready to try it?</Text>
                    <Text style={styles.subtitle}>
                        See how fast we digitize your scorecards
                    </Text>
                </View>

                {/* Demo visual - shows actual scorecard preview */}
                <View style={styles.demoContainer}>
                    <View style={styles.cardPreview}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>Sample Scorecard</Text>
                        </View>
                        <View style={styles.cardContent}>
                            <View style={styles.scoreRow}>
                                <Text style={styles.holeLabel}>Hole</Text>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => (
                                    <Text key={hole} style={styles.holeNumber}>{hole}</Text>
                                ))}
                            </View>
                            <View style={styles.scoreRow}>
                                <Text style={styles.parLabel}>Par</Text>
                                {DEMO_PARS.map((par, i) => (
                                    <Text key={i} style={styles.parNumber}>{par}</Text>
                                ))}
                            </View>
                            <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>ALEX</Text>
                                {DEMO_PLAYERS[1].scores.map((score, i) => (
                                    <Text key={i} style={styles.scoreNumber}>{score}</Text>
                                ))}
                            </View>
                            <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>BEN</Text>
                                {DEMO_PLAYERS[2].scores.map((score, i) => (
                                    <Text key={i} style={styles.scoreNumber}>{score}</Text>
                                ))}
                            </View>
                        </View>
                    </View>

                    {/* Scan animation indicator */}
                    <Animated.View
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanTranslateY }] }
                        ]}
                    />
                </View>

                <View style={styles.optionsContainer}>
                    {/* Primary: I have a scorecard */}
                    <TouchableOpacity
                        style={styles.optionCard}
                        onPress={handleScanReal}
                        activeOpacity={0.8}
                    >
                        <View style={styles.optionIcon}>
                            <Camera size={28} color={colors.primary} />
                        </View>
                        <View style={styles.optionContent}>
                            <Text style={styles.optionTitle}>I have a scorecard ready</Text>
                            <Text style={styles.optionSubtitle}>
                                Scan it now and see your scores instantly
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Secondary: Try demo */}
                    <TouchableOpacity
                        style={[styles.optionCard, styles.optionCardSecondary]}
                        onPress={handleTryDemo}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.optionIcon, styles.optionIconSecondary]}>
                            <Play size={24} color={colors.textSecondary} />
                        </View>
                        <View style={styles.optionContent}>
                            <Text style={[styles.optionTitle, styles.optionTitleSecondary]}>
                                Try a demo scan
                            </Text>
                            <Text style={styles.optionSubtitle}>
                                See how it works with a sample scorecard
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    header: {
        alignItems: 'center',
        marginTop: 24,
        marginBottom: 32,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF5F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
    },
    demoContainer: {
        marginBottom: 32,
        position: 'relative',
    },
    cardPreview: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    cardHeader: {
        backgroundColor: colors.text,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    cardTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    cardContent: {
        padding: 12,
    },
    scoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    holeLabel: {
        width: 40,
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    holeNumber: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center',
    },
    parLabel: {
        width: 40,
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    parNumber: {
        flex: 1,
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    scoreLabel: {
        width: 40,
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
    },
    scoreNumber: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
    },
    scanLine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 10,
    },
    optionsContainer: {
        gap: 12,
        marginTop: 'auto',
        paddingBottom: 24,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        borderWidth: 2,
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    optionCardSecondary: {
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.04,
    },
    optionIcon: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: '#FFF5F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    optionIconSecondary: {
        backgroundColor: '#F5F3EF',
    },
    optionContent: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.primary,
        marginBottom: 2,
    },
    optionTitleSecondary: {
        color: colors.text,
    },
    optionSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});
