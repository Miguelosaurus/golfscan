import * as SecureStore from "expo-secure-store";

// Plain token cache object for Clerk Expo
export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      return;
    }
  },
};

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  console.warn("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY for ClerkProvider");
}
