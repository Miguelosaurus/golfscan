import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Animated,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import {
    Check,
    Crown,
    Camera,
    TrendingUp,
    Target,
    History,
    Zap,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useT } from '@/lib/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURE_KEYS = [
    { icon: Camera, labelKey: 'Unlimited scorecard scans' },
    { icon: TrendingUp, labelKey: 'Automatic Scandicap™ tracking' },
    { icon: Target, labelKey: 'Bet settlement calculator' },
    { icon: History, labelKey: 'Full round history' },
    { icon: Zap, labelKey: 'Strokes Gained analytics' },
];

const PLANS = [
    {
        id: 'weekly',
        nameKey: 'Weekly',
        price: '$2.99',
        periodKey: '/week',
        badgeKey: null,
        savingsKey: null,
    },
    {
        id: 'annual',
        nameKey: 'Annual',
        price: '$29.99',
        periodKey: '/year',
        badgeKey: 'Best Value',
        savingsKey: 'Save 80%',
    },
    {
        id: 'lifetime',
        nameKey: 'Lifetime',
        price: '$79.99',
        periodKey: 'one-time',
        badgeKey: null,
        savingsKey: null,
    },
];

export default function PaywallScreen() {
    const router = useRouter();
    const { setCurrentStep, completeOnboarding } = useOnboardingStore();
    const [selectedPlan, setSelectedPlan] = React.useState('annual');
    const t = useT();

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleSubscribe = () => {
        // TODO: Integrate Superwall here
        console.log('Subscribe to plan:', selectedPlan);
        setCurrentStep('login');
        router.push('/(onboarding)/complete');
    };

    const handleSkip = () => {
        setCurrentStep('login');
        router.push('/(onboarding)/complete');
    };

    const handleClose = () => {
        // Allow closing to continue with limited features
        handleSkip();
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1E6059', '#2D8B7A', '#1E6059']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <OnboardingProgress currentStep="paywall" />

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View
                        style={[
                            styles.content,
                            {
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }],
                            },
                        ]}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.crownContainer}>
                                <Crown size={40} color="#FFD700" fill="#FFD700" />
                            </View>
                            <Text style={styles.title}>{t('Unlock ScanCaddie Pro')}</Text>
                            <Text style={styles.subtitle}>
                                {t('Get unlimited access to all features')}
                            </Text>
                        </View>

                        {/* Features list */}
                        <View style={styles.featuresContainer}>
                            {FEATURE_KEYS.map((feature, index) => (
                                <View key={index} style={styles.featureRow}>
                                    <View style={styles.featureCheck}>
                                        <Check size={16} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                    <Text style={styles.featureText}>{t(feature.labelKey)}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Pricing plans */}
                        <View style={styles.plansContainer}>
                            {PLANS.map((plan) => (
                                <TouchableOpacity
                                    key={plan.id}
                                    style={[
                                        styles.planCard,
                                        selectedPlan === plan.id && styles.planCardSelected,
                                    ]}
                                    onPress={() => setSelectedPlan(plan.id)}
                                    activeOpacity={0.8}
                                >
                                    {(plan as any).badgeKey && (
                                        <View style={styles.planBadge}>
                                            <Text style={styles.planBadgeText}>{t((plan as any).badgeKey)}</Text>
                                        </View>
                                    )}

                                    <View style={styles.planContent}>
                                        <Text style={[
                                            styles.planName,
                                            selectedPlan === plan.id && styles.planNameSelected,
                                        ]}>
                                            {t((plan as any).nameKey)}
                                        </Text>
                                        <View style={styles.planPricing}>
                                            <Text style={[
                                                styles.planPrice,
                                                selectedPlan === plan.id && styles.planPriceSelected,
                                            ]}>
                                                {plan.price}
                                            </Text>
                                            <Text style={styles.planPeriod}>{t((plan as any).periodKey)}</Text>
                                        </View>
                                        {(plan as any).savingsKey && (
                                            <Text style={styles.planSavings}>{t((plan as any).savingsKey)}</Text>
                                        )}
                                    </View>

                                    <View style={[
                                        styles.planRadio,
                                        selectedPlan === plan.id && styles.planRadioSelected,
                                    ]}>
                                        {selectedPlan === plan.id && (
                                            <View style={styles.planRadioInner} />
                                        )}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Animated.View>
                </ScrollView>

                {/* Bottom CTA */}
                <View style={styles.bottomSection}>
                    <TouchableOpacity
                        style={styles.subscribeButton}
                        onPress={handleSubscribe}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={['#FC661A', '#E55A15']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.subscribeGradient}
                        >
                            <Text style={styles.subscribeText}>{t('Start Free Trial')}</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                        <Text style={styles.skipText}>{t('Continue with limited features')}</Text>
                    </TouchableOpacity>

                    <Text style={styles.termsText}>
                        {t('Cancel anytime. Terms apply.')}
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 24,
    },
    content: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 20,
    },
    crownContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    featuresContainer: {
        marginBottom: 32,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    featureCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    featureText: {
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    plansContainer: {
        gap: 12,
    },
    planCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 18,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    planCardSelected: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderColor: '#FFD700',
    },
    planBadge: {
        position: 'absolute',
        top: -10,
        right: 16,
        backgroundColor: '#FFD700',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    planBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1E6059',
    },
    planContent: {
        flex: 1,
    },
    planName: {
        fontSize: 16,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 4,
    },
    planNameSelected: {
        color: '#FFFFFF',
    },
    planPricing: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    planPrice: {
        fontSize: 24,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.9)',
    },
    planPriceSelected: {
        color: '#FFFFFF',
    },
    planPeriod: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginLeft: 4,
    },
    planSavings: {
        fontSize: 13,
        color: '#4CAF50',
        fontWeight: '600',
        marginTop: 4,
    },
    planRadio: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    planRadioSelected: {
        borderColor: '#FFD700',
    },
    planRadioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FFD700',
    },
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 16,
        paddingTop: 12,
    },
    subscribeButton: {
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    subscribeGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    subscribeText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    skipButton: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    skipText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
    },
    termsText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
});
