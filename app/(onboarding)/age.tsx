import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { AgeGroup } from '@/types/onboarding';

const AGE_OPTIONS: { value: AgeGroup; label: string; emoji: string }[] = [
    { value: '18-24', label: '18-24', emoji: '🏌️' },
    { value: '25-34', label: '25-34', emoji: '⛳' },
    { value: '35-44', label: '35-44', emoji: '🏆' },
    { value: '45-54', label: '45-54', emoji: '🎯' },
    { value: '55-64', label: '55-64', emoji: '🌟' },
    { value: '65+', label: '65+', emoji: '👑' },
];

export default function AgeScreen() {
    const router = useRouter();
    const { ageGroup, setAgeGroup, setCurrentStep } = useOnboardingStore();
    const [selectedAge, setSelectedAge] = useState<AgeGroup | undefined>(ageGroup);

    const handleSelect = (age: AgeGroup) => {
        setSelectedAge(age);
    };

    const handleContinue = () => {
        if (selectedAge) {
            setAgeGroup(selectedAge);
            setCurrentStep('handicap');
            router.push('/(onboarding)/handicap');
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="age" />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>What's your age range?</Text>
                    <Text style={styles.subtitle}>
                        This helps us tailor insights to golfers like you
                    </Text>
                </View>

                <View style={styles.optionsContainer}>
                    {AGE_OPTIONS.map((option) => (
                        <OnboardingOption
                            key={option.value}
                            title={option.label}
                            icon={<Text style={styles.optionEmoji}>{option.emoji}</Text>}
                            selected={selectedAge === option.value}
                            onPress={() => handleSelect(option.value)}
                        />
                    ))}
                </View>
            </ScrollView>

            <View style={styles.bottomSection}>
                <OnboardingButton
                    title="Continue"
                    onPress={handleContinue}
                    disabled={!selectedAge}
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
        gap: 12,
    },
    optionEmoji: {
        fontSize: 24,
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
