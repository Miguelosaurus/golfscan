import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { PROGRESS_STEPS, OnboardingStep } from '@/types/onboarding';
import { ChevronLeft } from 'lucide-react-native';

interface OnboardingProgressProps {
    currentStep: OnboardingStep;
    showBack?: boolean;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
    currentStep,
    showBack = true
}) => {
    const router = useRouter();
    const currentIndex = PROGRESS_STEPS.indexOf(currentStep);

    // If current step is welcome, definitely no progress bar or back button
    if (currentStep === 'welcome') {
        return null;
    }

    const handleBack = () => {
        router.back();
    };

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                {showBack ? (
                    <TouchableOpacity
                        onPress={handleBack}
                        style={styles.backButton}
                        activeOpacity={0.7}
                    >
                        <ChevronLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.placeholder} />
                )}

                {currentIndex >= 0 && (
                    <View style={styles.track}>
                        {PROGRESS_STEPS.map((step, index) => {
                            const isCompleted = index < currentIndex;
                            const isCurrent = index === currentIndex;

                            return (
                                <View key={step} style={styles.segmentWrapper}>
                                    <View
                                        style={[
                                            styles.segment,
                                            isCompleted && styles.segmentCompleted,
                                            isCurrent && styles.segmentCurrent,
                                        ]}
                                    />
                                </View>
                            );
                        })}
                    </View>
                )}

                {showBack && <View style={styles.placeholder} />}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F5F5F3',
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholder: {
        width: 40,
    },
    track: {
        flex: 1,
        flexDirection: 'row',
        gap: 4,
    },
    segmentWrapper: {
        flex: 1,
    },
    segment: {
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
    },
    segmentCompleted: {
        backgroundColor: colors.primary,
    },
    segmentCurrent: {
        backgroundColor: colors.primary,
        opacity: 0.6,
    },
});
