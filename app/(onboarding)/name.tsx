import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useT } from '@/lib/i18n';

export default function NameScreen() {
    const router = useRouter();
    const { displayName, setDisplayName, setCurrentStep } = useOnboardingStore();
    const [name, setName] = useState(displayName ?? '');
    const t = useT();

    const trimmed = useMemo(() => name.trim(), [name]);
    const canContinue = trimmed.length > 0;

    const handleContinue = () => {
        if (!canContinue) return;
        setDisplayName(trimmed);
        setCurrentStep('age');
        router.push('/(onboarding)/age');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <OnboardingProgress currentStep="name" />

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
                        <Text style={styles.title}>{t('What should we call you?')}</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.inputLabel}>{t('Your name')}</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                            returnKeyType="done"
                            maxLength={24}
                            autoFocus
                        />
                    </View>
                </ScrollView>

                <View style={styles.bottomSection}>
                    <OnboardingButton
                        title={t('Continue')}
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
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.border,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 10,
    },
    input: {
        height: 52,
        borderRadius: 12,
        paddingHorizontal: 14,
        backgroundColor: '#F7F7F5',
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 16,
        color: colors.text,
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
