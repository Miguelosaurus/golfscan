import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  Linking
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

export default function SettingsScreen() {
  const router = useRouter();
  
  const handleHelp = () => {
    Alert.alert(
      'Help & Support',
      'Need help with GolfScan AI? Contact our support team.',
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
      'About GolfScan AI',
      `Version 1.0.0

GolfScan AI uses advanced machine learning to scan and analyze your golf scorecards, providing detailed insights into your game.

© 2025 GolfScan AI. All rights reserved.`,
      [{ text: 'OK' }]
    );
  };
  
  const handleLogout = () => {
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
            // Implement logout logic here
            console.log("User logged out");
            Alert.alert("Logged Out", "You have been successfully logged out.");
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
          title="Logout"
          onPress={handleLogout}
          variant="outline"
          style={styles.logoutButton}
        />
        
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>GolfScan AI v1.0.0</Text>
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
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
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