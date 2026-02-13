import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { Check } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useT } from '@/lib/i18n';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ConfiguringScreen() {
    const router = useRouter();
    const { handwritingStyle, distanceUnit, setCurrentStep } = useOnboardingStore();
    const t = useT();
    const messageCount = 4;

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [percentage, setPercentage] = useState(0);

    const progressAnim = useRef(new Animated.Value(0)).current;
    const checkScaleAnim = useRef(new Animated.Value(0)).current;
    const checkOpacityAnim = useRef(new Animated.Value(0)).current;

    // Circle progress properties
    const size = 120;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    useEffect(() => {
        // Listen for progress updates
        const listenerId = progressAnim.addListener(({ value }) => {
            setPercentage(Math.round(value * 100));
        });

        // Animate progress over 3 seconds
        Animated.timing(progressAnim, {
            toValue: 1,
            duration: 3000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start(() => {
            // Show completion
            setIsComplete(true);

            // Animate checkmark
            Animated.parallel([
                Animated.spring(checkScaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 5,
                    useNativeDriver: true,
                }),
                Animated.timing(checkOpacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();

            // Navigate after a brief pause
            setTimeout(() => {
                setCurrentStep('configuring');
                router.push('/(onboarding)/value-games');
            }, 1200);
        });

        // Cycle through messages
        const messageInterval = setInterval(() => {
            setCurrentMessageIndex((prev) =>
                prev < messageCount - 1 ? prev + 1 : prev
            );
        }, 750);

        return () => {
            clearInterval(messageInterval);
            progressAnim.removeListener(listenerId);
        };
    }, []);

    const strokeDashoffset = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference, 0],
    });

    // Dynamic messages based on user selections
    const getConfigMessage = (index: number): string => {
        const styleName =
            handwritingStyle === 'neat'
                ? t('Neat')
                : handwritingStyle === 'average'
                    ? t('Average')
                    : t('Rushed');
        const unitName = distanceUnit === 'yards' ? t('Yards') : t('Meters');

        const messages = [
            t('Saving preferences...'),
            t('Downloading {{style}} OCR model...', { style: styleName }),
            t('Configuring database...'),
            t('Optimizing for {{unit}}...', { unit: unitName }),
        ];
        return messages[index] || messages[0];
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="configuring" />
            <View style={styles.content}>
                {/* Progress Circle */}
                <View style={styles.circleContainer}>
                    <Svg width={size} height={size} style={styles.svg}>
                        {/* Background circle */}
                        <Circle
                            stroke={colors.border}
                            fill="transparent"
                            strokeWidth={strokeWidth}
                            r={radius}
                            cx={size / 2}
                            cy={size / 2}
                        />
                        {/* Progress circle */}
                        <AnimatedCircle
                            stroke={isComplete ? colors.success : colors.primary}
                            fill="transparent"
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={`${circumference} ${circumference}`}
                            strokeDashoffset={strokeDashoffset}
                            r={radius}
                            cx={size / 2}
                            cy={size / 2}
                            rotation="-90"
                            origin={`${size / 2}, ${size / 2}`}
                        />
                    </Svg>

                    {/* Center content */}
                    <View style={styles.centerContent}>
                        {isComplete ? (
                            <Animated.View
                                style={[
                                    styles.checkContainer,
                                    {
                                        opacity: checkOpacityAnim,
                                        transform: [{ scale: checkScaleAnim }],
                                    },
                                ]}
                            >
                                <Check size={48} color={colors.success} strokeWidth={3} />
                            </Animated.View>
                        ) : (
                            <Text style={styles.percentage}>
                                {percentage}%
                            </Text>
                        )}
                    </View>
                </View>

                {/* Status text */}
                <View style={styles.statusContainer}>
                    <Text style={[styles.statusTitle, isComplete && styles.statusTitleComplete]}>
                        {isComplete ? t('Configuration Complete') : t('Setting Up ScanCaddie')}
                    </Text>

                    {!isComplete && (
                        <Text style={styles.statusMessage}>
                            {getConfigMessage(currentMessageIndex)}
                        </Text>
                    )}
                </View>

                {/* Loading dots animation */}
                {!isComplete && (
                    <View style={styles.dotsContainer}>
                        {[0, 1, 2].map((i) => (
                            <Animated.View
                                key={i}
                                style={[
                                    styles.dot,
                                    {
                                        opacity: progressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.3, 1],
                                        }),
                                    },
                                ]}
                            />
                        ))}
                    </View>
                )}
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
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    circleContainer: {
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    svg: {
        position: 'absolute',
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    percentage: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
    },
    checkContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#E8F5E9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusContainer: {
        alignItems: 'center',
    },
    statusTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    statusTitleComplete: {
        color: colors.success,
    },
    statusMessage: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    dotsContainer: {
        flexDirection: 'row',
        marginTop: 32,
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
});
