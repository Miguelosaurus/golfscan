import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";

export default function ModalScreen() {
  const t = useT();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("Modal")}</Text>
      <View style={styles.separator} />
      <Text>{t("This is an example modal. You can edit it in app/modal.tsx.")}</Text>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
});
