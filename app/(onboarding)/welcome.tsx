import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Dimensions,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { Camera, TrendingUp, Target } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WelcomeScreen() {
    const router = useRouter();
    const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

    // Animations
    const logoScale = useRef(new Animated.Value(0.8)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const cardsOpacity = useRef(new Animated.Value(0)).current;
    const cardsTranslateY = useRef(new Animated.Value(30)).current;
    const buttonOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Staggered entrance animation
        Animated.sequence([
            Animated.parallel([
                Animated.spring(logoScale, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.timing(logoOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),
            Animated.timing(titleOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.parallel([
                Animated.timing(cardsOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(cardsTranslateY, {
                    toValue: 0,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]),
            Animated.timing(buttonOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleGetStarted = () => {
        setCurrentStep('name');
        router.push('/(onboarding)/name');
    };

    const features = [
        {
            icon: <Camera size={24} color={colors.primary} />,
            title: 'Snap your scorecard',
            description: 'AI reads your scores instantly',
        },
        {
            icon: <TrendingUp size={24} color={colors.primary} />,
            title: 'Track your Scandicap™',
            description: 'Watch your handicap evolve',
        },
        {
            icon: <Target size={24} color={colors.primary} />,
            title: 'Settle bets fairly',
            description: 'Automatic stroke calculations',
        },
    ];

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <View style={styles.content}>
                    {/* Logo Section */}
                    <Animated.View
                        style={[
                            styles.logoContainer,
                            {
                                opacity: logoOpacity,
                                transform: [{ scale: logoScale }],
                            },
                        ]}
                    >
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoEmoji}>⛳</Text>
                        </View>
                    </Animated.View>

                    {/* Title */}
                    <Animated.View style={[styles.titleContainer, { opacity: titleOpacity }]}>
                        <Text style={styles.title}>ScanCaddie</Text>
                        <Text style={styles.subtitle}>
                            The smartest way to track your golf game
                        </Text>
                    </Animated.View>

                    {/* Feature Cards */}
                    <Animated.View
                        style={[
                            styles.featuresContainer,
                            {
                                opacity: cardsOpacity,
                                transform: [{ translateY: cardsTranslateY }],
                            },
                        ]}
                    >
                        {features.map((feature, index) => (
                            <View key={index} style={styles.featureCard}>
                                <View style={styles.featureIcon}>{feature.icon}</View>
                                <View style={styles.featureContent}>
                                    <Text style={styles.featureTitle}>{feature.title}</Text>
                                    <Text style={styles.featureDescription}>{feature.description}</Text>
                                </View>
                            </View>
                        ))}
                    </Animated.View>
                </View>

                {/* Bottom Section */}
                <Animated.View style={[styles.bottomSection, { opacity: buttonOpacity }]}>
                    <OnboardingButton
                        title="Get Started"
                        onPress={handleGetStarted}
                        variant="primary"
                    />

                    <Text style={styles.termsText}>
                        By continuing, you agree to our Terms of Service
                    </Text>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    logoCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 8,
    },
    logoEmoji: {
        fontSize: 48,
    },
    titleContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 36,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 18,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 26,
    },
    featuresContainer: {
        gap: 12,
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    featureIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#FFF5F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    featureContent: {
        flex: 1,
    },
    featureTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 2,
    },
    featureDescription: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    termsText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 16,
    },
});
