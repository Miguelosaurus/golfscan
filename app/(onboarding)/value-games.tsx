import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
    Image,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { DollarSign, ArrowRight } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ValueGamesScreen() {
    const router = useRouter();
    const { setCurrentStep } = useOnboardingStore();

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const imageFade = useRef(new Animated.Value(0)).current;
    const imageScale = useRef(new Animated.Value(0.95)).current;

    useEffect(() => {
        // Staggered entrance animations
        Animated.sequence([
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 500,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]),
            Animated.parallel([
                Animated.timing(imageFade, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.spring(imageScale, {
                    toValue: 1,
                    tension: 40,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    const handleContinue = () => {
        setCurrentStep('scan-demo');
        router.push('/(onboarding)/scan-demo');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="configuring" />

            <View style={styles.content}>
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                        alignItems: 'center',
                    }}
                >
                    <Text style={styles.preTitle}>But if you want more...</Text>
                    <Text style={styles.title}>Game Day Ready</Text>
                    <Text style={styles.subtitle}>
                        Set up friendly games or bets before playing. We handle all the scoring — just scan at the end to settle everything.
                    </Text>
                </Animated.View>

                <Animated.View
                    style={[
                        styles.imageContainer,
                        {
                            opacity: imageFade,
                            transform: [{ scale: imageScale }]
                        }
                    ]}
                >
                    <Image
                        source={require('@/assets/images/games_preview.jpg')}
                        style={styles.gamesImage}
                        resizeMode="contain"
                    />
                </Animated.View>

                <Animated.View
                    style={[styles.betInfo, { opacity: fadeAnim }]}
                >
                    <View style={styles.betIconContainer}>
                        <DollarSign size={20} color={colors.success} />
                    </View>
                    <Text style={styles.betInfoText}>
                        Automatic bet settlement with handicap strokes applied
                    </Text>
                </Animated.View>

                <Animated.View
                    style={[styles.reassurance, { opacity: fadeAnim }]}
                >
                    <ArrowRight size={18} color={colors.textSecondary} />
                    <Text style={styles.reassuranceText}>
                        Optional — you can always just scan without setting up a game
                    </Text>
                </Animated.View>
            </View>

            <View style={styles.buttonContainer}>
                <OnboardingButton
                    title="Got It"
                    onPress={handleContinue}
                />
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
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    preTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    title: {
        fontSize: 34,
        fontWeight: '800',
        color: colors.text,
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 23,
        paddingHorizontal: 12,
        marginBottom: 15,
    },
    imageContainer: {
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH * 0.85,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 15,
    },
    gamesImage: {
        width: '100%',
        height: '100%',
    },
    betInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginTop: 15,
        alignSelf: 'stretch',
        marginHorizontal: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    betIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F8F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    betInfoText: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
        flex: 1,
        lineHeight: 22,
    },
    reassurance: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 25,
        paddingHorizontal: 16,
    },
    reassuranceText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginLeft: 8,
        fontStyle: 'italic',
    },
    buttonContainer: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
});
