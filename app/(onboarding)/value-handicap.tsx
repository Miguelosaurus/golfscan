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
import { useT } from '@/lib/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ValueHandicapScreen() {
    const router = useRouter();
    const t = useT();

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const imageSlide = useRef(new Animated.Value(100)).current;
    const imageScale = useRef(new Animated.Value(0.85)).current;
    const imageRotate = useRef(new Animated.Value(-5)).current;

    useEffect(() => {
        // Staggered entrance animations
        Animated.sequence([
            // First: title and subtitle fade in
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
            // Then: image slides in with slight rotation and scale
            Animated.parallel([
                Animated.spring(imageSlide, {
                    toValue: 0,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(imageScale, {
                    toValue: 1,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(imageRotate, {
                    toValue: 0,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    const handleContinue = () => {
        router.push('/(onboarding)/calibration');
    };

    const rotateInterpolate = imageRotate.interpolate({
        inputRange: [-5, 0],
        outputRange: ['-5deg', '0deg'],
    });

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="configuring" />

            <View style={styles.content}>
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }]
                    }}
                >
                    <Text style={styles.title}>Scandicap™</Text>
                    <Text style={styles.subtitle}>
                        {t('Your official handicap index, calculated automatically after every round using the World Handicap System.')}
                    </Text>
                </Animated.View>

                {/* Phone mockup with Scandicap UI */}
                <Animated.View
                    style={[
                        styles.phoneContainer,
                        {
                            transform: [
                                { translateY: imageSlide },
                                { scale: imageScale },
                                { rotate: rotateInterpolate },
                            ],
                        },
                    ]}
                >
                    <Image
                        source={require('@/assets/images/scandicap_preview.png')}
                        style={styles.phoneImage}
                        resizeMode="contain"
                    />
                </Animated.View>
            </View>

            <View style={styles.buttonContainer}>
                <OnboardingButton
                    title={t('Continue')}
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
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: colors.text,
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 23,
        paddingHorizontal: 8,
        marginBottom: 24,
    },
    phoneContainer: {
        flex: 1,
        width: SCREEN_WIDTH * 0.95,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.25,
        shadowRadius: 30,
        elevation: 15,
    },
    phoneImage: {
        width: '100%',
        height: '100%',
        maxHeight: 520,
    },
    buttonContainer: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
});
