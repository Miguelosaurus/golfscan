import * as React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");

  const onSignInPress = async () => {
    if (!isLoaded) return;
    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        console.error("Sign-in incomplete", JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err) {
      console.error("Sign-in error", JSON.stringify(err, null, 2));
    }
  };

  return (
    <View style={{ padding: 24 }}>
      <Text>Sign in</Text>
      <TextInput
        autoCapitalize="none"
        value={emailAddress}
        placeholder="Enter email"
        onChangeText={setEmailAddress}
        style={{ borderWidth: 1, marginTop: 12, padding: 8 }}
      />
      <TextInput
        value={password}
        placeholder="Enter password"
        secureTextEntry
        onChangeText={setPassword}
        style={{ borderWidth: 1, marginTop: 12, padding: 8 }}
      />
      <TouchableOpacity onPress={onSignInPress} style={{ marginTop: 12 }}>
        <Text>Continue</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: "row", gap: 3, marginTop: 12 }}>
        <Text>Don't have an account?</Text>
        <Link href="/(auth)/sign-up">
          <Text>Sign up</Text>
        </Link>
      </View>
    </View>
  );
}

