import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    Alert,
    TextInput,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useOAuth, useSignIn, useSignUp, useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SeedRoundsStory } from '@/components/onboarding/SeedRoundsStory';

export default function CompleteScreen() {
    const router = useRouter();
    const { completeOnboarding, existingHandicap, hasExistingHandicap, displayName } = useOnboardingStore();
    const appleOAuth = useOAuth({ strategy: 'oauth_apple' });
    const googleOAuth = useOAuth({ strategy: 'oauth_google' });
    const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
    const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
    const syncUser = useMutation(api.auth.syncUser);
    const updateProfile = useMutation(api.users.updateProfile);
    const seedHandicap = useMutation(api.handicap.seedHandicap);
    const { isSignedIn, signOut } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [pendingVerification, setPendingVerification] = useState(false);
    const [code, setCode] = useState('');
    const [seedOverlayVisible, setSeedOverlayVisible] = useState(false);
    const [seedPhase, setSeedPhase] = useState<'sync' | 'seed' | 'calc' | 'done' | 'error'>('sync');
    const [seedErrorMessage, setSeedErrorMessage] = useState<string | null>(null);
    const seedCounterAnim = useRef(new Animated.Value(0)).current;
    const seedOverlayOpacity = useRef(new Animated.Value(0)).current;

    // Animations
    const checkScale = useRef(new Animated.Value(0)).current;
    const contentOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance animation
        Animated.sequence([
            Animated.spring(checkScale, {
                toValue: 1,
                tension: 50,
                friction: 5,
                useNativeDriver: true,
            }),
            Animated.timing(contentOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const showSeedOverlay = () => {
        setSeedOverlayVisible(true);
        seedOverlayOpacity.setValue(0);
        Animated.timing(seedOverlayOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
        }).start();
    };

    const hideSeedOverlay = () => {
        Animated.timing(seedOverlayOpacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) setSeedOverlayVisible(false);
        });
    };

    const runHandicapSeedingIfNeeded = async () => {
        if (!hasExistingHandicap || existingHandicap === null || existingHandicap === undefined) return;

        setSeedPhase('seed');
        seedCounterAnim.setValue(0);

        const counterLoop = Animated.loop(
            Animated.timing(seedCounterAnim, {
                toValue: 20,
                duration: 1600,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            })
        );
        counterLoop.start();

        try {
            await seedHandicap({ initialHandicap: existingHandicap });
            setSeedPhase('calc');
        } finally {
            counterLoop.stop();
        }
    };

    const handleSeedAndComplete = async () => {
        showSeedOverlay();
        setSeedErrorMessage(null);
        setSeedPhase('sync');

        try {
            const desiredName = displayName?.trim();
            // Convex auth can lag slightly behind Clerk session activation; wait until
            // Convex sees an identity before attempting authenticated mutations.
            let syncedUserId: any = null;
            for (let attempt = 0; attempt < 12; attempt++) {
                // Ensure the Convex user record exists before any handicap operations.
                // Returns null when identity isn't ready yet.
                syncedUserId = await syncUser({});
                if (syncedUserId) break;
                await new Promise(resolve => setTimeout(resolve, 250));
            }

            if (!syncedUserId) {
                throw new Error('Could not authenticate. Please try again.');
            }

            if (desiredName) {
                // Ensure the new account uses the onboarding-provided name (not the previous user / email fallback).
                try {
                    await updateProfile({ name: desiredName });
                } catch (nameErr) {
                    console.warn('[Onboarding] Failed to set name:', nameErr);
                }
            }

            // If user entered an existing handicap, seed their history with 20 ghost rounds.
            await runHandicapSeedingIfNeeded();

            setSeedPhase('done');
            await new Promise(resolve => setTimeout(resolve, 250));
        } catch (seedError: any) {
            console.error('[Onboarding] Seeding failed:', seedError);
            setSeedErrorMessage(seedError?.message ?? 'Could not finish setup.');
            setSeedPhase('error');
            await new Promise(resolve => setTimeout(resolve, 600));
        } finally {
            hideSeedOverlay();
        }

        completeOnboarding();
        router.replace('/(tabs)');
    };

    const handleOAuth = async (provider: 'apple' | 'google') => {
        const client = provider === 'apple' ? appleOAuth : googleOAuth;
        setIsLoading(true);

        try {
            // Sign out first if there's an existing session to avoid conflicts
            if (isSignedIn) {
                await signOut();
                // Small delay to ensure sign out is complete
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            const result = await client.startOAuthFlow();
            const { createdSessionId, setActive } = result;

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                await handleSeedAndComplete();
            } else {
                console.warn(`${provider} OAuth flow did not complete - no session created`);
                Alert.alert('Sign In Failed', 'No session was created. Please try again.');
            }
        } catch (err: any) {
            console.error(`${provider} sign-in failed:`, err);
            const message = err?.errors?.[0]?.message || err?.message || 'Please try again.';
            Alert.alert('Sign In Failed', message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailContinue = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email address.');
            return;
        }

        if (!signInLoaded || !signUpLoaded) {
            Alert.alert('Loading', 'Please wait a moment and try again.');
            return;
        }

        setIsLoading(true);

        try {
            // Try to sign in first with email code
            const signInAttempt = await signIn!.create({
                identifier: email,
            });

            // Prepare for email code verification
            await signInAttempt.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: (signInAttempt.supportedFirstFactors?.find(
                    (f: any) => f.strategy === 'email_code'
                ) as any)?.emailAddressId,
            });

            setPendingVerification(true);
        } catch (err: any) {
            // If user doesn't exist, try to sign up
            if (err?.errors?.[0]?.code === 'form_identifier_not_found') {
                try {
                    await signUp!.create({
                        emailAddress: email,
                    });

                    await signUp!.prepareEmailAddressVerification({
                        strategy: 'email_code',
                    });

                    setPendingVerification(true);
                } catch (signUpErr) {
                    console.error('Sign up error', signUpErr);
                    Alert.alert('Error', 'Could not send verification code. Please try again.');
                }
            } else {
                console.error('Sign in error', err);
                Alert.alert('Error', 'Could not send verification code. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code.trim()) {
            Alert.alert('Code Required', 'Please enter the verification code from your email.');
            return;
        }

        setIsLoading(true);

        try {
            // Try sign in verification first
            if (signIn?.status === 'needs_first_factor') {
                const result = await signIn!.attemptFirstFactor({
                    strategy: 'email_code',
                    code,
                });

                if (result.status === 'complete' && setSignInActive) {
                    await setSignInActive({ session: result.createdSessionId });
                    await handleSeedAndComplete();
                    return;
                }
            }

            // Try sign up verification
            const result = await signUp!.attemptEmailAddressVerification({ code });

            if (result.status === 'complete' && setSignUpActive) {
                await setSignUpActive({ session: result.createdSessionId });
                await handleSeedAndComplete();
            } else {
                Alert.alert('Verification Failed', 'Please try again.');
            }
        } catch (err) {
            console.error('Verification error', err);
            Alert.alert('Invalid Code', 'Please check the code and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkipSignIn = () => {
        // Complete onboarding without account
        completeOnboarding();
        router.replace('/(tabs)');
    };

    // Verification code entry screen
    if (pendingVerification) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                />
                <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                    <OnboardingProgress currentStep="login" />
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <ScrollView
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.content}>
                                <View style={styles.checkContainer}>
                                    <View style={styles.checkCircle}>
                                        <Check size={48} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                </View>

                                <Text style={styles.title}>Check your email</Text>
                                <Text style={styles.subtitle}>
                                    We sent a verification code to {email}
                                </Text>

                                <View style={styles.authContainer}>
                                    <TextInput
                                        style={styles.emailInput}
                                        placeholder="Enter code"
                                        placeholderTextColor={colors.textSecondary}
                                        value={code}
                                        onChangeText={setCode}
                                        autoCapitalize="none"
                                        keyboardType="number-pad"
                                        textAlign="center"
                                    />

                                    <TouchableOpacity
                                        style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
                                        onPress={handleVerifyCode}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                    >
                                        {isLoading ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.continueButtonText}>Verify</Text>
                                        )}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.backButton}
                                        onPress={() => {
                                            setPendingVerification(false);
                                            setCode('');
                                        }}
                                    >
                                        <Text style={styles.backButtonText}>Back</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <OnboardingProgress currentStep="login" />
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.content}>
                            {/* Success check */}
                            <Animated.View
                                style={[
                                    styles.checkContainer,
                                    { transform: [{ scale: checkScale }] },
                                ]}
                            >
                                <View style={styles.checkCircle}>
                                    <Check size={48} color="#FFFFFF" strokeWidth={3} />
                                </View>
                            </Animated.View>

                            <Animated.View style={[styles.textContent, { opacity: contentOpacity }]}>
                                <Text style={styles.title}>You're all set!</Text>
                                <Text style={styles.subtitle}>
                                    Sign in to save rounds, sync your Scandicap, access your history anywhere, and to pull in your handicap.
                                </Text>

                                {/* Sign in options */}
                                <View style={styles.authContainer}>
                                    <TouchableOpacity
                                        style={styles.oauthButton}
                                        onPress={() => handleOAuth('apple')}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.oauthText}>Continue with Apple</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.oauthButton}
                                        onPress={() => handleOAuth('google')}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.oauthText}>Continue with Google</Text>
                                    </TouchableOpacity>

                                    {/* Or divider */}
                                    <View style={styles.dividerRow}>
                                        <View style={styles.dividerLine} />
                                        <Text style={styles.dividerText}>or</Text>
                                        <View style={styles.dividerLine} />
                                    </View>

                                    {/* Email input */}
                                    <Text style={styles.emailLabel}>Email</Text>
                                    <TextInput
                                        style={styles.emailInput}
                                        placeholder="you@example.com"
                                        placeholderTextColor={colors.textSecondary}
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        textContentType="emailAddress"
                                    />

                                    <TouchableOpacity
                                        style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
                                        onPress={handleEmailContinue}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                    >
                                        {isLoading ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.continueButtonText}>Continue</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </Animated.View>
                        </View>

                        {/* Skip option */}
                        <Animated.View style={[styles.bottomSection, { opacity: contentOpacity }]}>
                            <TouchableOpacity
                                style={styles.skipButton}
                                onPress={handleSkipSignIn}
                            >
                                <Text style={styles.skipText}>Skip for now</Text>
                            </TouchableOpacity>
                            <Text style={styles.skipHint}>
                                You can sign in later from Settings
                            </Text>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {seedOverlayVisible && (
                <Animated.View style={[styles.seedOverlay, { opacity: seedOverlayOpacity }]}>
                    <View style={styles.seedCard}>
                        <Text style={styles.seedTitle}>
                            {seedPhase === 'sync' && 'Setting up your account'}
                            {seedPhase === 'seed' && 'Creating your seed rounds'}
                            {seedPhase === 'calc' && 'Calculating your Scandicap™'}
                            {seedPhase === 'done' && 'Ready to go'}
                            {seedPhase === 'error' && 'Almost there'}
                        </Text>

                        <Text style={styles.seedSubtitle}>
                            {seedPhase === 'sync' && 'Syncing your profile…'}
                            {seedPhase === 'seed' && 'Seeding 20 ghost rounds from your handicap…'}
                            {seedPhase === 'calc' && 'Building your starting handicap history…'}
                            {seedPhase === 'done' && 'Opening the app…'}
                            {seedPhase === 'error' &&
                                (seedErrorMessage ??
                                    'We’ll finish setup in the background. You can continue now.')}
                        </Text>

                        {seedPhase === 'seed' && (
                            <View style={styles.seedProgressRow}>
                                <SeedRoundsStory handicap={existingHandicap ?? 0} variant="overlay" />
                            </View>
                        )}

                        {(seedPhase === 'sync' || seedPhase === 'calc') && (
                            <View style={styles.seedSpinnerRow}>
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}
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
    seedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(17, 24, 39, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    seedCard: {
        width: '100%',
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
        padding: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
        elevation: 12,
    },
    seedTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        textAlign: 'center',
        marginBottom: 6,
    },
    seedSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },
    seedProgressRow: {
        marginTop: 14,
        alignItems: 'center',
        gap: 10,
    },
    seedSpinnerRow: {
        marginTop: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    checkContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    checkCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    textContent: {
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
        paddingHorizontal: 16,
    },
    authContainer: {
        width: '100%',
        alignItems: 'stretch',
    },
    oauthButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    oauthText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 16,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    dividerText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginHorizontal: 16,
    },
    emailLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
        marginBottom: 8,
    },
    emailInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        fontSize: 16,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
    },
    continueButton: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    continueButtonDisabled: {
        opacity: 0.7,
    },
    continueButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    backButton: {
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    backButtonText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        alignItems: 'center',
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    skipText: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    skipHint: {
        fontSize: 13,
        color: colors.textSecondary,
        opacity: 0.7,
        marginTop: 4,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
    },
});
