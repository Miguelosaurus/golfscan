import * as React from "react";
import { Text, TextInput, TouchableOpacity, View, StyleSheet, Alert } from "react-native";
import { useSignUp } from "@clerk/clerk-expo";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "@/constants/colors";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const [emailAddress, setEmailAddress] = React.useState(params.email ?? "");
  const [password, setPassword] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState("");

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: any) {
      // Friendly handling for Clerk errors (e.g., breached passwords)
      const clerkErrors: string[] =
        err?.errors?.map((e: any) => e.longMessage || e.message).filter(Boolean) ?? [];
      const message =
        clerkErrors.join("\n") ||
        err?.longMessage ||
        err?.message ||
        "Sign up failed. Please try again.";
      Alert.alert("Sign up error", message);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({ code });
      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/");
      } else {
        console.error("Verification incomplete", JSON.stringify(signUpAttempt, null, 2));
      }
    } catch (err) {
      console.error("Verify error", JSON.stringify(err, null, 2));
    }
  };

  if (pendingVerification) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Verify your email</Text>
          <TextInput
            value={code}
            placeholder="Verification code"
            onChangeText={setCode}
            style={styles.input}
          />
          <TouchableOpacity onPress={onVerifyPress} style={[styles.button, styles.primaryButton]}>
            <Text style={styles.primaryButtonText}>Verify</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Create your account</Text>
        <TextInput
          autoCapitalize="none"
          value={emailAddress}
          placeholder="Email"
          keyboardType="email-address"
          onChangeText={setEmailAddress}
          style={styles.input}
        />
        <TextInput
          value={password}
          placeholder="Password"
          secureTextEntry
          onChangeText={setPassword}
          style={styles.input}
        />
        <TouchableOpacity onPress={onSignUpPress} style={[styles.button, styles.primaryButton]}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      <View style={styles.linkRow}>
        <Text style={styles.linkText}>Already have an account?</Text>
        <Link href="/">
          <Text style={[styles.linkText, styles.linkHighlight]}>Sign in</Text>
        </Link>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 16,
    textAlign: "left",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.textSecondary + "55",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
    marginBottom: 12,
    backgroundColor: "#F7F7F7",
  },
  button: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  linkHighlight: {
    marginLeft: 4,
    color: colors.primary,
    fontWeight: "600",
  },
});
