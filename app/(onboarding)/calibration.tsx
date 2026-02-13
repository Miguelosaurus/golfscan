import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Image,
    ImageSourcePropType,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { HandwritingStyle } from '@/types/onboarding';
import { Check } from 'lucide-react-native';
import { useT } from '@/lib/i18n';

// Import handwriting sample images
const HANDWRITING_IMAGES = {
    neat: require('@/assets/images/handwriting_neat.jpg'),
    average: require('@/assets/images/handwriting_average.jpg'),
    rushed: require('@/assets/images/handwriting_rushed.jpg'),
};

interface StyleCardProps {
    title: string;
    subtitle: string;
    sampleImage: ImageSourcePropType;
    selected: boolean;
    onPress: () => void;
}

const StyleCard: React.FC<StyleCardProps> = ({
    title,
    subtitle,
    sampleImage,
    selected,
    onPress,
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 0.97,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 5,
                useNativeDriver: true,
            }),
        ]).start();
        onPress();
    };

    return (
        <TouchableOpacity onPress={handlePress} activeOpacity={1}>
            <Animated.View
                style={[
                    styles.styleCard,
                    selected && styles.styleCardSelected,
                    { transform: [{ scale: scaleAnim }] },
                ]}
            >
                <View style={styles.styleCardContent}>
                    <View style={styles.styleCardHeader}>
                        <View>
                            <Text style={[styles.styleTitle, selected && styles.styleTitleSelected]}>
                                {title}
                            </Text>
                            <Text style={styles.styleSubtitle}>{subtitle}</Text>
                        </View>
                        {selected && (
                            <View style={styles.checkCircle}>
                                <Check size={16} color="#FFFFFF" strokeWidth={3} />
                            </View>
                        )}
                    </View>

                    {/* Sample handwriting image */}
                    <View style={styles.sampleContainer}>
                        <Image
                            source={sampleImage}
                            style={styles.sampleImage}
                            resizeMode="contain"
                        />
                    </View>
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
};

const HANDWRITING_STYLE_KEYS: {
    value: HandwritingStyle;
    titleKey: string;
    subtitleKey: string;
    sampleImage: ImageSourcePropType;
}[] = [
        {
            value: 'neat',
            titleKey: 'Neat',
            subtitleKey: 'Clear, well-formed numbers',
            sampleImage: HANDWRITING_IMAGES.neat,
        },
        {
            value: 'average',
            titleKey: 'Average',
            subtitleKey: 'Typical everyday handwriting',
            sampleImage: HANDWRITING_IMAGES.average,
        },
        {
            value: 'rushed',
            titleKey: 'Rushed',
            subtitleKey: 'Quick scribbles, harder to read',
            sampleImage: HANDWRITING_IMAGES.rushed,
        },
    ];

export default function CalibrationScreen() {
    const router = useRouter();
    const { handwritingStyle, setHandwritingStyle, setCurrentStep } = useOnboardingStore();
    const [selected, setSelected] = useState<HandwritingStyle | undefined>(handwritingStyle);
    const t = useT();

    const handleSelect = (style: HandwritingStyle) => {
        setSelected(style);
        setHandwritingStyle(style);
    };

    const handleContinue = () => {
        if (selected) {
            setCurrentStep('configuring');
            router.push('/(onboarding)/configuring');
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="calibration" />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>{t('One Photo. Everything Captured.')}</Text>
                    <Text style={styles.subtitle}>
                        {t('Just snap your scorecard at the end of the round. Select your handwriting style for 99% accuracy.')}
                    </Text>
                </View>

                <View style={styles.cardsContainer}>
                    {HANDWRITING_STYLE_KEYS.map((style) => (
                        <StyleCard
                            key={style.value}
                            title={t(style.titleKey)}
                            subtitle={t(style.subtitleKey)}
                            sampleImage={style.sampleImage}
                            selected={selected === style.value}
                            onPress={() => handleSelect(style.value)}
                        />
                    ))}
                </View>
            </ScrollView>

            <View style={styles.bottomSection}>
                <OnboardingButton
                    title={t('Continue')}
                    onPress={handleContinue}
                    disabled={!selected}
                    variant="primary"
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    header: {
        marginTop: 24,
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    cardsContainer: {
        gap: 12,
    },
    styleCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    styleCardSelected: {
        borderColor: colors.primary,
        backgroundColor: '#FFF8F5',
    },
    styleCardContent: {
        gap: 12,
    },
    styleCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    styleTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.text,
    },
    styleTitleSelected: {
        color: colors.primary,
    },
    styleSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sampleContainer: {
        backgroundColor: '#FAFAFA',
        borderRadius: 10,
        overflow: 'hidden',
    },
    sampleImage: {
        width: '100%',
        height: 56,
    },
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 16,
        paddingTop: 12,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
});
