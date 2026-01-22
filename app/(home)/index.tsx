import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { SignedIn, SignedOut, useOAuth } from "@clerk/clerk-expo";
import { Redirect, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { useOnboardingStore } from "@/store/useOnboardingStore";

export default function HomeIndex() {
  const router = useRouter();
  const appleOAuth = useOAuth({ strategy: "oauth_apple" });
  const googleOAuth = useOAuth({ strategy: "oauth_google" });
  const [email, setEmail] = useState("");
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const { hasCompletedOnboarding } = useOnboardingStore();

  const handleOAuth = async (provider: "apple" | "google") => {
    const client = provider === "apple" ? appleOAuth : googleOAuth;
    try {
      const result = await client.startOAuthFlow();
      const { createdSessionId, setActive } = result;

      // If Clerk created a session, mark it active so SignedIn redirects into the app
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        console.warn(`${provider} OAuth flow did not complete`);
      }
    } catch (err) {
      console.error(`${provider} sign-in failed`, err);
    }
  };

  return (
    <View style={styles.screen}>
      <SignedIn>
        {/* If signed in, go straight into the main app */}
        <Redirect href="/(tabs)" />
      </SignedIn>

      <SignedOut>
        {/* If not signed in and hasn't completed onboarding, go to onboarding */}
        {!hasCompletedOnboarding ? (
          <Redirect href="/(onboarding)/welcome" />
        ) : (
          <View style={styles.container}>
            <View style={styles.card}>
              <Text style={styles.title}>ScanCaddie</Text>
              <Text style={styles.subtitle}>
                Sign in to save rounds, sync your Scandicap, and access your history anywhere.
              </Text>

              <TouchableOpacity
                style={[styles.button, styles.oauthButton]}
                onPress={() => handleOAuth("apple")}
              >
                <Text style={styles.oauthIcon}></Text>
                <Text style={styles.oauthButtonText}>Sign up with Apple</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.oauthButton]}
                onPress={() => handleOAuth("google")}
              >
                <Text style={styles.oauthIcon}>G</Text>
                <Text style={styles.oauthButtonText}>Sign up with Google</Text>
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>

              <View style={styles.emailSection}>
                <Text style={styles.emailLabel}>Email</Text>
                <TextInput
                  style={styles.emailInput}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.primaryButton,
                    !isEmailValid && styles.primaryButtonDisabled,
                  ]}
                  disabled={!isEmailValid}
                  onPress={() =>
                    router.push({
                      pathname: "/(auth)/sign-up",
                      params: { email },
                    })
                  }
                >
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SignedOut>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    alignItems: "stretch",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  oauthButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.textSecondary + "55",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  oauthButtonText: {
    color: colors.text,
    fontWeight: "500",
    fontSize: 15,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginVertical: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textSecondary + "33",
  },
  orText: {
    marginHorizontal: 8,
    color: colors.textSecondary,
    fontSize: 14,
  },
  oauthIcon: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: "700",
  },
  emailSection: {
    marginTop: 8,
  },
  emailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: colors.textSecondary + "55",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
    backgroundColor: "#F7F7F7",
  },
});
