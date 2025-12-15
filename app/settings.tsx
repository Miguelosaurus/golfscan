import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  Linking,
  Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { 
  HelpCircle, 
  Globe, 
  FileText, 
  Shield, 
  LogOut,
  ChevronRight,
  Bell,
  Moon,
  Smartphone
} from 'lucide-react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useGolfStore } from '@/store/useGolfStore';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, isSignedIn } = useAuth();
  const { user } = useUser();
  const profile = useQuery(api.users.getProfile);
  const devMode = useGolfStore((s) => s.devMode);
  const setDevMode = useGolfStore((s) => s.setDevMode);

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
  
  const handleHelp = () => {
    Alert.alert(
      'Help & Support',
      'Need help with ScanCaddie? Contact our support team.',
      [
        { text: 'Email Support', onPress: () => Linking.openURL('mailto:support@golfscan.ai') },
        { text: 'FAQ', onPress: () => console.log('Open FAQ') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handleLanguage = () => {
    Alert.alert(
      'Language',
      'Select your preferred language',
      [
        { text: 'English', onPress: () => console.log('English selected') },
        { text: 'Spanish', onPress: () => console.log('Spanish selected') },
        { text: 'French', onPress: () => console.log('French selected') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handleNotifications = () => {
    Alert.alert(
      'Notifications',
      'Manage your notification preferences',
      [
        { text: 'Enable All', onPress: () => console.log('Enable all notifications') },
        { text: 'Disable All', onPress: () => console.log('Disable all notifications') },
        { text: 'Customize', onPress: () => console.log('Customize notifications') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handleTheme = () => {
    Alert.alert(
      'Theme',
      'Choose your preferred theme',
      [
        { text: 'Light', onPress: () => console.log('Light theme selected') },
        { text: 'Dark', onPress: () => console.log('Dark theme selected') },
        { text: 'System', onPress: () => console.log('System theme selected') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handleTerms = () => {
    Alert.alert(
      'Terms & Conditions',
      'View our terms and conditions',
      [
        { text: 'View Online', onPress: () => Linking.openURL('https://golfscan.ai/terms') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handlePrivacy = () => {
    Alert.alert(
      'Privacy Policy',
      'View our privacy policy',
      [
        { text: 'View Online', onPress: () => Linking.openURL('https://golfscan.ai/privacy') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const handleAbout = () => {
    Alert.alert(
      'About ScanCaddie',
      `Version 1.0.0

ScanCaddie uses advanced machine learning to scan and analyze your golf scorecards, providing detailed insights into your game.

© 2025 ScanCaddie. All rights reserved.`,
      [{ text: 'OK' }]
    );
  };
  
  const handleLogout = () => {
    if (!isSignedIn) {
      Alert.alert("Not signed in", "You are not currently signed in.");
      return;
    }
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            signOut()
              .then(() => {
                // After signing out, send the user back to the
                // auth landing screen instead of leaving them
                // inside the signed-in tab flow.
                router.replace("/");
              })
              .catch(() => {});
          }
        }
      ]
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: "Settings",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
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
            <Text style={styles.menuSectionTitle}>Account</Text>
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
          <Text style={styles.menuSectionTitle}>Preferences</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleNotifications}>
            <Bell size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Notifications</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleTheme}>
            <Moon size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Theme</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleLanguage}>
            <Globe size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Language</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Developer</Text>
          
          <View style={[styles.menuItem, styles.menuItemNoBorder]}>
            <Smartphone size={20} color={colors.text} />
            <View style={styles.menuItemDevTextWrap}>
              <Text style={styles.menuItemText}>Dev Mode</Text>
              <Text style={styles.menuItemSubtext}>Simulate scan responses locally</Text>
            </View>
            <Switch
              value={devMode}
              onValueChange={setDevMode}
              trackColor={{ false: '#DADFE0', true: '#CDE7E2' }}
              thumbColor={devMode ? colors.primary : '#f4f3f4'}
            />
          </View>
        </View>
        
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Support</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleHelp}>
            <HelpCircle size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Help & Support</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleAbout}>
            <Smartphone size={20} color={colors.text} />
            <Text style={styles.menuItemText}>About</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Legal</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleTerms}>
            <FileText size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Terms & Conditions</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handlePrivacy}>
            <Shield size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Privacy Policy</Text>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        
        <Button
          title={isSignedIn ? "Logout" : "Sign in"}
          onPress={isSignedIn ? handleLogout : () => router.push('/')}
          variant="outline"
          style={styles.logoutButton}
        />
        
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>ScanCaddie v1.0.0</Text>
        </View>
      </ScrollView>
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
  logoutButton: {
    marginBottom: 24,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  versionText: {
    fontSize: 14,
    color: colors.text,
  },
});
