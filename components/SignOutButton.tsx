import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { useClerk } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { useGolfStore } from "@/store/useGolfStore";
import { useT } from "@/lib/i18n";

export const SignOutButton = () => {
  const { signOut } = useClerk();
  const t = useT();

  const handleSignOut = async () => {
    try {
      await signOut();
      await useGolfStore.persist.clearStorage();
      useGolfStore.getState().resetGolfStore();
      Linking.openURL(Linking.createURL("/"));
    } catch (err) {
      console.error("Sign out error", JSON.stringify(err, null, 2));
    }
  };

  return (
    <TouchableOpacity onPress={handleSignOut}>
      <Text>{t("Sign Out")}</Text>
    </TouchableOpacity>
  );
};
