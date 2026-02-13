import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import {
    HelpCircle,
    FileText,
    Shield,
    LogOut,
    ChevronRight,
    Bell,
    Smartphone,
    RotateCcw,
    Ruler,
    Languages,
    Trash2,
} from 'lucide-react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useGolfStore } from '@/store/useGolfStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { resetAnalytics } from '@/lib/analytics';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import { useT } from '@/lib/i18n';

export default function SettingsScreen() {
    const router = useRouter();
    const t = useT();
    const { signOut, isSignedIn } = useAuth();
    const { user } = useUser();
    const profile = useQuery(api.users.getProfile);
    const setPreferredAiModel = useMutation(api.users.setPreferredAiModel);
    const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);
    const distanceUnit = useOnboardingStore((s) => s.distanceUnit);
    const setDistanceUnit = useOnboardingStore((s) => s.setDistanceUnit);
    const language = useOnboardingStore((s) => s.language);
    const setLanguage = useOnboardingStore((s) => s.setLanguage);
    const deleteAccount = useMutation(api.users.deleteAccount);
    const [showDeveloperSection, setShowDeveloperSection] = useState(false);
    const devTapCountRef = useRef(0);
    const devTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const devTapLastRef = useRef(0);

    const displayName =
        profile?.name ||
        user?.fullName ||
        user?.username ||
        'ScanCaddie Golfer';
    const email =
        profile?.email ||
        user?.primaryEmailAddress?.emailAddress ||
        'Signed in with Clerk';
    const initial = displayName?.charAt(0) || 'S';

    const appVersion = useMemo(() => {
        const expoConfig = (Constants as any).expoConfig;
        const manifest = (Constants as any).manifest;
        return expoConfig?.version || manifest?.version || '1.0.0';
    }, []);

    const buildNumber = useMemo(() => {
        const expoConfig = (Constants as any).expoConfig;
        const manifest = (Constants as any).manifest;
        const iosBuild = expoConfig?.ios?.buildNumber || manifest?.ios?.buildNumber;
        const androidBuild = expoConfig?.android?.versionCode || manifest?.android?.versionCode;
        return iosBuild || androidBuild || null;
    }, []);

    const handleHelp = () => {
        Alert.alert(
            t('Help & Support'),
            t('Need help with ScanCaddie? Contact our support team.'),
            [
                { text: t('Email Support'), onPress: () => Linking.openURL('mailto:support@golfscan.ai') },
                { text: t('Cancel'), style: 'cancel' }
            ]
        );
    };

    const handleNotifications = async () => {
        try {
            await Linking.openSettings();
        } catch {
            Alert.alert(t('Notifications'), t('Open iOS Settings → Notifications → ScanCaddie to manage alerts.'));
        }
    };

    const handleUnits = () => {
        const current = distanceUnit === 'yards' ? t('Yards') : t('Meters');
        Alert.alert(t('Units'), t('Current: {{current}}', { current }), [
            {
                text: t('Yards'),
                onPress: () => setDistanceUnit('yards'),
            },
            {
                text: t('Meters'),
                onPress: () => setDistanceUnit('meters'),
            },
            { text: t('Cancel'), style: 'cancel' },
        ]);
    };

    const handleTerms = () => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');

    const handlePrivacy = () => {
        Alert.alert(
            t('Privacy Policy'),
            t('View our privacy policy'),
            [
                { text: t('View Online'), onPress: () => Linking.openURL('https://golfscan.ai/privacy') },
                { text: t('Cancel'), style: 'cancel' }
            ]
        );
    };

    const handleAbout = () => {
        Alert.alert(
            t('About ScanCaddie'),
            `${t('Version')} ${appVersion}${buildNumber ? ` (${buildNumber})` : ''}

${t('ScanCaddie uses advanced machine learning to scan and analyze your golf scorecards, providing detailed insights into your game.')}

© 2026 ScanCaddie. ${t('All rights reserved.')}`,
            [{ text: t('OK') }]
        );
    };

    const handleLogout = () => {
        if (!isSignedIn) {
            Alert.alert(t("Not signed in"), t("You are not currently signed in."));
            return;
        }
        Alert.alert(
            t("Logout"),
            t("Are you sure you want to logout?"),
            [
                {
                    text: t("Cancel"),
                    style: "cancel"
                },
                {
                    text: t("Logout"),
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await signOut();
                            resetAnalytics();
                            await useGolfStore.persist.clearStorage();
                            useGolfStore.getState().resetGolfStore();
                            // After signing out, send the user back to the
                            // auth landing screen instead of leaving them
                            // inside the signed-in tab flow.
                            router.replace("/");
                        } catch {
                            // no-op
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteAccount = () => {
        if (!isSignedIn) {
            Alert.alert(t("Not signed in"), t("You are not currently signed in."));
            return;
        }

        Alert.alert(
            t('Delete Account'),
            t('This will permanently delete your ScanCaddie account and associated data. This cannot be undone.'),
            [
                { text: t('Cancel'), style: 'cancel' },
                {
                    text: t('Delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteAccount({});
                        } catch {
                            Alert.alert(t('Error'), t('Could not delete your account. Please try again.'));
                            return;
                        }

                        try {
                            await user?.delete();
                        } catch {
                            // no-op (still sign out and clear local state)
                        }

                        try {
                            await signOut();
                        } catch {
                            // no-op
                        }

                        resetAnalytics();
                        await useGolfStore.persist.clearStorage();
                        useGolfStore.getState().resetGolfStore();
                        router.replace("/");
                    },
                },
            ]
        );
    };

    const handleReplayOnboarding = () => {
        Alert.alert(
            t('Replay Onboarding'),
            t('This will reset your onboarding preferences and show the welcome screens again.'),
            [
                { text: t('Cancel'), style: 'cancel' },
                {
                    text: t('Replay'),
                    onPress: () => {
                        resetOnboarding();
                        router.replace('/(onboarding)/welcome');
                    },
                },
            ]
        );
    };

    const handleDevUnlockTap = useCallback(() => {
        const now = Date.now();
        const tooSlow = now - devTapLastRef.current > 650;
        devTapLastRef.current = now;

        if (tooSlow) devTapCountRef.current = 0;
        devTapCountRef.current += 1;

        if (devTapTimerRef.current) clearTimeout(devTapTimerRef.current);
        devTapTimerRef.current = setTimeout(() => {
            devTapCountRef.current = 0;
        }, 900);

        if (devTapCountRef.current >= 5) {
            devTapCountRef.current = 0;
            setShowDeveloperSection(true);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (devTapTimerRef.current) clearTimeout(devTapTimerRef.current);
        };
    }, []);

    useFocusEffect(
        useCallback(() => {
            return () => setShowDeveloperSection(false);
        }, [])
    );

    const aiModelLabel =
        (profile?.preferredAiModel ?? 'gemini-3-flash-preview') === 'gemini-3-flash-preview'
            ? t('Gemini 3 Flash (faster)')
            : t('Gemini 3 Pro (best quality)');

    const handleLanguage = () => {
        Alert.alert(t('Select Language'), undefined, [
            { text: t('English'), onPress: () => setLanguage('en') },
            { text: t('Spanish'), onPress: () => setLanguage('es') },
            { text: t('Cancel'), style: 'cancel' },
        ]);
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0.3, 0.8, 1]}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
                <Stack.Screen
                    options={{
                        title: t("Settings"),
                        headerStyle: { backgroundColor: colors.background },
                        headerTitleStyle: { color: colors.text },
                        headerTintColor: colors.text,
                    }}
                />

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                >
                    {user && (
                        <View style={styles.menuSection}>
                            <Text style={styles.menuSectionTitle}>{t('Account')}</Text>
                            <View style={styles.accountRow}>
                                <View style={styles.accountAvatar}>
                                    <Text style={styles.accountInitial}>{initial}</Text>
                                </View>
                                <View style={styles.accountInfo}>
                                    <Text style={styles.accountName}>{displayName}</Text>
                                    <Text style={styles.accountEmail}>{email}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>{t('Preferences')}</Text>

                        <TouchableOpacity style={styles.menuItem} onPress={handleNotifications}>
                            <Bell size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Notifications')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.menuItem, styles.menuItemNoBorder]} onPress={handleUnits}>
                            <Ruler size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Units')}</Text>
                            <Text style={styles.menuItemValue}>
                                {distanceUnit === 'yards' ? t('Yards') : t('Meters')}
                            </Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>{t('Support')}</Text>

                        <TouchableOpacity style={styles.menuItem} onPress={handleHelp}>
                            <HelpCircle size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Help & Support')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.menuItem, styles.menuItemNoBorder]} onPress={handleAbout}>
                            <Smartphone size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('About')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>{t('Legal')}</Text>

                        <TouchableOpacity style={styles.menuItem} onPress={handleTerms}>
                            <FileText size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Terms & Conditions')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.menuItem, styles.menuItemNoBorder]} onPress={handlePrivacy}>
                            <Shield size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Privacy Policy')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>{t('Language')}</Text>

                        <TouchableOpacity style={[styles.menuItem, styles.menuItemNoBorder]} onPress={handleLanguage}>
                            <Languages size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{t('Language')}</Text>
                            <Text style={styles.menuItemValue}>
                                {language === 'es' ? t('Spanish') : t('English')}
                            </Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    {showDeveloperSection && (
                        <View style={styles.menuSection}>
                            <Text style={styles.menuSectionTitle}>{t('Developer')}</Text>

                            <View style={[styles.menuItem, styles.menuItemNoBorder]}>
                                <Smartphone size={20} color={colors.text} />
                                <View style={styles.menuItemDevTextWrap}>
                                    <Text style={styles.menuItemText}>{t('AI Model')}</Text>
                                    <Text style={styles.menuItemSubtext}>{aiModelLabel}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.modelPickerButton}
                                    onPress={() => {
                                        Alert.alert(
                                            t('Select AI Model'),
                                            t('Choose the model for scorecard scanning'),
                                            [
                                                {
                                                    text: t('Gemini 3 Pro (best quality)'),
                                                    onPress: async () => {
                                                        try {
                                                            await setPreferredAiModel({ model: 'gemini-3-pro-preview' });
                                                        } catch {
                                                            // no-op
                                                        }
                                                    },
                                                },
                                                {
                                                    text: t('Gemini 3 Flash (faster)'),
                                                    onPress: async () => {
                                                        try {
                                                            await setPreferredAiModel({ model: 'gemini-3-flash-preview' });
                                                        } catch {
                                                            // no-op
                                                        }
                                                    },
                                                },
                                                { text: t('Cancel'), style: 'cancel' },
                                            ]
                                        );
                                    }}
                                >
                                    <Text style={styles.modelPickerText}>{t('Change')}</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity style={styles.menuItem} onPress={handleReplayOnboarding}>
                                <RotateCcw size={20} color={colors.text} />
                                <Text style={styles.menuItemText}>{t('Replay Onboarding')}</Text>
                                <ChevronRight size={20} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>{t('Account Actions')}</Text>

                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={isSignedIn ? handleLogout : () => router.push('/')}
                        >
                            <LogOut size={20} color={colors.text} />
                            <Text style={styles.menuItemText}>{isSignedIn ? t('Sign Out') : t('Sign in')}</Text>
                            <ChevronRight size={20} color={colors.text} />
                        </TouchableOpacity>

                        {isSignedIn && (
                            <TouchableOpacity
                                style={[styles.menuItem, styles.menuItemNoBorder]}
                                onPress={handleDeleteAccount}
                            >
                                <Trash2 size={20} color={colors.text} />
                                <Text style={styles.menuItemText}>{t('Delete Account')}</Text>
                                <ChevronRight size={20} color={colors.text} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.versionContainer}
                        onPress={handleDevUnlockTap}
                    >
                        <Text style={styles.versionText}>
                            {t('ScanCaddie Version')} {appVersion}
                            {buildNumber ? ` (${buildNumber})` : ''}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    menuSection: {
        marginBottom: 32,
    },
    menuSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 12,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    menuItemNoBorder: {
        borderBottomWidth: 0,
    },
    menuItemText: {
        flex: 1,
        fontSize: 16,
        color: colors.text,
        marginLeft: 12,
    },
    menuItemValue: {
        fontSize: 14,
        color: colors.textSecondary,
        marginRight: 8,
    },
    menuItemSubtext: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 12,
        marginTop: 2,
    },
    menuItemDevTextWrap: {
        flex: 1,
        marginLeft: 12,
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    accountAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    accountInitial: {
        color: colors.card,
        fontWeight: '700',
        fontSize: 20,
    },
    accountInfo: {
        flex: 1,
    },
    accountName: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
    accountEmail: {
        color: colors.textSecondary,
        fontSize: 14,
        marginTop: 2,
    },
    versionContainer: {
        alignItems: 'center',
        paddingVertical: 14,
    },
    versionText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    modelPickerButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    modelPickerText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
});
