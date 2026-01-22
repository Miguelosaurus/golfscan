import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { Check, TrendingUp, Sparkles } from 'lucide-react-native';
import { SeedRoundsStory } from '@/components/onboarding/SeedRoundsStory';

export default function HandicapScreen() {
    const router = useRouter();
    const {
        hasExistingHandicap,
        existingHandicap,
        setHasExistingHandicap,
        setExistingHandicap,
        setCurrentStep
    } = useOnboardingStore();

    const [hasHandicap, setHasHandicap] = useState<boolean | null>(
        hasExistingHandicap === true ? true : hasExistingHandicap === false ? false : null
    );
    const [handicapValue, setHandicapValue] = useState(
        existingHandicap?.toString() || ''
    );

    const handleSelectYes = () => {
        setHasHandicap(true);
    };

    const handleSelectNo = () => {
        setHasHandicap(false);
    };

    const handleHandicapChange = (text: string) => {
        // Only allow numbers and one decimal point
        const cleaned = text.replace(/[^0-9.]/g, '');
        const parts = cleaned.split('.');
        if (parts.length > 2) return;
        if (parts[1] && parts[1].length > 1) return;

        const num = parseFloat(cleaned);
        if (cleaned && (isNaN(num) || num < 0 || num > 54)) return;

        setHandicapValue(cleaned);
    };

    const handleContinue = () => {
        if (hasHandicap === null) return;

        setHasExistingHandicap(hasHandicap);
        if (hasHandicap && handicapValue !== '') {
            setExistingHandicap(parseFloat(handicapValue));
        }

        setCurrentStep('handicap');
        router.push('/(onboarding)/value-handicap');
    };

    const canContinue = hasHandicap === false || (hasHandicap === true && handicapValue !== '');

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="handicap" />

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Do you have an established handicap?</Text>
                        <Text style={styles.subtitle}>
                            We can pick up right where you left off
                        </Text>
                    </View>

                    <View style={styles.optionsContainer}>
                        {/* Yes Option */}
                        <TouchableOpacity
                            style={[
                                styles.optionCard,
                                hasHandicap === true && styles.optionCardSelected,
                            ]}
                            onPress={handleSelectYes}
                            activeOpacity={0.8}
                        >
                            <View style={styles.optionHeader}>
                                <View style={styles.optionIconContainer}>
                                    <TrendingUp size={24} color={hasHandicap === true ? colors.primary : colors.text} />
                                </View>
                                <View style={styles.optionContent}>
                                    <Text style={[
                                        styles.optionTitle,
                                        hasHandicap === true && styles.optionTitleSelected
                                    ]}>
                                        Yes, I have a handicap
                                    </Text>
                                    <Text style={styles.optionSubtitle}>
                                        Import your current index
                                    </Text>
                                </View>
                                {hasHandicap === true && (
                                    <View style={styles.checkCircle}>
                                        <Check size={18} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                )}
                            </View>

                            {hasHandicap === true && (
                                <View style={styles.handicapInputContainer}>
                                    <Text style={styles.inputLabel}>Your handicap index</Text>
                                    <TextInput
                                        style={styles.handicapInput}
                                        value={handicapValue}
                                        onChangeText={handleHandicapChange}
                                        placeholder="e.g. 15.4"
                                        placeholderTextColor={colors.textSecondary}
                                        keyboardType="decimal-pad"
                                        maxLength={4}
                                        autoFocus
                                    />
                                    <Text style={styles.inputHint}>
                                        This will be your starting Scandicap™
                                    </Text>

                                    {handicapValue !== '' && (
                                        <SeedRoundsStory handicap={parseFloat(handicapValue)} />
                                    )}
                                </View>
                            )}
                        </TouchableOpacity>

                        {/* No Option */}
                        <TouchableOpacity
                            style={[
                                styles.optionCard,
                                hasHandicap === false && styles.optionCardSelected,
                            ]}
                            onPress={handleSelectNo}
                            activeOpacity={0.8}
                        >
                            <View style={styles.optionHeader}>
                                <View style={styles.optionIconContainer}>
                                    <Sparkles size={24} color={hasHandicap === false ? colors.primary : colors.text} />
                                </View>
                                <View style={styles.optionContent}>
                                    <Text style={[
                                        styles.optionTitle,
                                        hasHandicap === false && styles.optionTitleSelected
                                    ]}>
                                        No, I'm new or casual
                                    </Text>
                                    <Text style={styles.optionSubtitle}>
                                        We'll build your Scandicap™ from your rounds
                                    </Text>
                                </View>
                                {hasHandicap === false && (
                                    <View style={styles.checkCircle}>
                                        <Check size={18} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                <View style={styles.bottomSection}>
                    <OnboardingButton
                        title="Continue"
                        onPress={handleContinue}
                        disabled={!canContinue}
                        variant="primary"
                    />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboardView: {
        flex: 1,
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
        marginBottom: 32,
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
    optionsContainer: {
        gap: 16,
    },
    optionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        borderWidth: 2,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: '#FFF8F5',
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F5F3EF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    optionContent: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 2,
    },
    optionTitleSelected: {
        color: colors.primary,
    },
    optionSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    checkCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    handicapInputContainer: {
        marginTop: 18,
        paddingTop: 18,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
        marginBottom: 8,
    },
    handicapInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: colors.primary,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
    },
    inputHint: {
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
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
