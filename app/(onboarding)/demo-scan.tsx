import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    Image,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { useGolfStore } from '@/store/useGolfStore';
import { generateUniqueId, getLocalDateString } from '@/utils/helpers';
import { ScorecardScanResult } from '@/types';
import { Camera, Check, Sparkles, RotateCcw, ArrowRight } from 'lucide-react-native';

// Demo scorecard data - actual scores from the provided scorecard image
// Players: ALEX (Gross), BEN (Net), CHRIS (Net)
const DEMO_PLAYERS = [
    { name: 'ALEX', scores: [6, 5, 4, 7, 4, 3, 5, 5, 6] },
    { name: 'BEN', scores: [5, 4, 4, 4, 5, 4, 4, 5, 5] },
    { name: 'CHRIS', scores: [4, 3, 5, 4, 4, 4, 5, 4, 5] },
];

// Demo scorecard image
const DEMO_SCORECARD = require('@/assets/images/demo_scorecard.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type DemoStage = 'camera' | 'confirm' | 'processing';

export default function DemoScanScreen() {
    const router = useRouter();
    const { setActiveScanJob } = useGolfStore();
    const [permission, requestPermission] = useCameraPermissions();

    const [stage, setStage] = useState<DemoStage>('camera');

    // Animation refs
    const scanAnim = useRef(new Animated.Value(0)).current;
    const processingAnim = useRef(new Animated.Value(0)).current;
    const flashAnim = useRef(new Animated.Value(0)).current;

    // Request camera permissions on mount
    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    // Start scan line animation when in camera stage
    useEffect(() => {
        if (stage === 'camera') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scanAnim, {
                        toValue: 1,
                        duration: 1800,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scanAnim, {
                        toValue: 0,
                        duration: 1800,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [stage]);

    // Processing animation
    useEffect(() => {
        if (stage === 'processing') {
            Animated.timing(processingAnim, {
                toValue: 1,
                duration: 3000,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            }).start(() => {
                // Create demo scan result and navigate to review
                const demoResult: ScorecardScanResult = {
                    courseName: 'Demo Golf Club',
                    courseNameConfidence: 0.95,
                    date: getLocalDateString(),
                    dateConfidence: 0.95,
                    overallConfidence: 0.92,
                    players: DEMO_PLAYERS.map(player => ({
                        name: player.name,
                        nameConfidence: 0.95,
                        scores: player.scores.map((score, index) => ({
                            hole: index + 1,
                            score: score,
                            confidence: 0.95,
                        })),
                    })),
                };

                // Set up the active scan job with demo data (no API call)
                setActiveScanJob({
                    id: generateUniqueId(),
                    status: 'complete',
                    stage: 'complete',
                    progress: 100,
                    message: 'Demo scan complete',
                    requiresReview: true,
                    result: demoResult,
                } as any);

                // Navigate to scan-review with onboarding mode
                router.push('/scan-review?onboardingMode=true&onboardingDemo=true');
            });
        }
    }, [stage]);

    const handleCapture = () => {
        // Flash animation
        Animated.sequence([
            Animated.timing(flashAnim, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(flashAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        // Go to confirm stage
        setTimeout(() => setStage('confirm'), 200);
    };

    const handleRetake = () => {
        setStage('camera');
    };

    const handleAnalyze = () => {
        setStage('processing');
    };

    const scanTranslateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 200],
    });

    const processingProgress = processingAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    // Camera stage - show real camera with scorecard overlay
    if (stage === 'camera') {
        return (
            <View style={styles.container}>
                {/* Real camera feed */}
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                />

                {/* Demo scorecard overlay - semi-transparent */}
                <View style={styles.overlayContainer}>
                    <View style={styles.scanFrame}>
                        <Image
                            source={DEMO_SCORECARD}
                            style={styles.scorecardOverlay}
                            resizeMode="contain"
                        />

                        {/* Scan line animation */}
                        <Animated.View
                            style={[
                                styles.scanLine,
                                { transform: [{ translateY: scanTranslateY }] }
                            ]}
                        />

                        {/* Corner brackets */}
                        <View style={[styles.bracket, styles.bracketTopLeft]} />
                        <View style={[styles.bracket, styles.bracketTopRight]} />
                        <View style={[styles.bracket, styles.bracketBottomLeft]} />
                        <View style={[styles.bracket, styles.bracketBottomRight]} />
                    </View>
                </View>

                {/* Flash effect */}
                <Animated.View
                    style={[
                        styles.flashOverlay,
                        { opacity: flashAnim }
                    ]}
                    pointerEvents="none"
                />

                {/* Header */}
                <SafeAreaView style={styles.header} edges={['top']}>
                    <OnboardingProgress currentStep="scan-demo" />
                    <View style={styles.headerContent}>
                        <Text style={styles.headerTitle}>Demo: Position scorecard</Text>
                        <Text style={styles.headerSubtitle}>
                            This is a sample scorecard - tap capture when ready
                        </Text>
                    </View>
                </SafeAreaView>

                {/* Capture button */}
                <SafeAreaView style={styles.captureSection} edges={['bottom']}>
                    <TouchableOpacity
                        style={styles.captureButton}
                        onPress={handleCapture}
                        activeOpacity={0.8}
                    >
                        <View style={styles.captureInner} />
                    </TouchableOpacity>
                    <Text style={styles.captureHint}>Tap to capture</Text>
                </SafeAreaView>
            </View>
        );
    }

    // Confirm stage - show captured image with analyze button
    if (stage === 'confirm') {
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.confirmContainer} edges={['top', 'bottom']}>
                    <OnboardingProgress currentStep="scan-demo" />

                    <View style={styles.previewContainer}>
                        <Image
                            source={DEMO_SCORECARD}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />
                        <View style={styles.checkBadge}>
                            <Check size={24} color="#FFFFFF" />
                        </View>
                    </View>

                    <View style={styles.confirmContent}>
                        <Text style={styles.confirmTitle}>Scorecard captured!</Text>
                        <Text style={styles.confirmSubtitle}>
                            Ready to analyze with our AI
                        </Text>
                    </View>

                    <View style={styles.confirmButtons}>
                        <TouchableOpacity
                            style={styles.analyzeButton}
                            onPress={handleAnalyze}
                            activeOpacity={0.8}
                        >
                            <Sparkles size={20} color="#FFFFFF" />
                            <Text style={styles.analyzeButtonText}>Analyze Scorecard</Text>
                            <ArrowRight size={20} color="#FFFFFF" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={handleRetake}
                            activeOpacity={0.8}
                        >
                            <RotateCcw size={18} color={colors.textSecondary} />
                            <Text style={styles.retakeButtonText}>Retake</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Processing stage - show progress with explanation
    if (stage === 'processing') {
        return (
            <SafeAreaView style={styles.processingContainer} edges={['top', 'bottom']}>
                <OnboardingProgress currentStep="scan-demo" showBack={false} />

                <View style={styles.processingContent}>
                    <View style={styles.iconContainer}>
                        <Sparkles size={48} color={colors.primary} />
                    </View>

                    <Text style={styles.processingTitle}>Reading your scorecard...</Text>
                    <Text style={styles.processingSubtitle}>
                        Our AI is extracting player names and scores
                    </Text>

                    <View style={styles.progressContainer}>
                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    { width: processingProgress }
                                ]}
                            />
                        </View>
                    </View>

                    <View style={styles.processingSteps}>
                        <Text style={styles.stepText}>✓ Image captured</Text>
                        <Text style={styles.stepText}>✓ Detecting scorecard layout</Text>
                        <Text style={[styles.stepText, styles.stepActive]}>
                            → Reading handwritten scores...
                        </Text>
                    </View>

                    {/* Explanation box */}
                    <View style={styles.explanationBox}>
                        <Text style={styles.explanationTitle}>💡 How it works</Text>
                        <Text style={styles.explanationText}>
                            ScanCaddie uses AI to read handwritten scorecards, identify players,
                            and automatically calculate your stats - all in seconds!
                        </Text>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    // Camera stage styles
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanFrame: {
        width: SCREEN_WIDTH - 48,
        aspectRatio: 1.5,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    scorecardOverlay: {
        width: '100%',
        height: '100%',
        opacity: 0.85,
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
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 4,
    },
    bracket: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderColor: colors.primary,
    },
    bracketTopLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 12,
    },
    bracketTopRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 12,
    },
    bracketBottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 12,
    },
    bracketBottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 12,
    },
    flashOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#FFFFFF',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    headerContent: {
        alignItems: 'center',
        paddingHorizontal: 24,
        marginTop: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        marginTop: 4,
    },
    captureSection: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingBottom: 32,
    },
    captureButton: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
    },
    captureInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#FFFFFF',
    },
    captureHint: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 12,
    },
    // Confirm stage styles
    confirmContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    previewContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    previewImage: {
        width: SCREEN_WIDTH - 48,
        height: undefined,
        aspectRatio: 1.5,
        borderRadius: 16,
    },
    checkBadge: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -28,
        marginLeft: -28,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    confirmContent: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 24,
    },
    confirmTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    confirmSubtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    confirmButtons: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        gap: 12,
    },
    analyzeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderRadius: 14,
        paddingVertical: 16,
        gap: 10,
    },
    analyzeButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F5F3EF',
        borderRadius: 14,
        paddingVertical: 14,
        gap: 8,
    },
    retakeButtonText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    // Processing stage styles
    processingContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    processingContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#FFF5F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    processingTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    processingSubtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 32,
    },
    progressContainer: {
        width: '100%',
        marginBottom: 24,
    },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.border,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 4,
    },
    processingSteps: {
        alignSelf: 'flex-start',
        marginBottom: 32,
    },
    stepText: {
        fontSize: 15,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    stepActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    explanationBox: {
        backgroundColor: '#F0F9FF',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    explanationTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    explanationText: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
    },
});
