import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { PreRoundFlowModal } from '../components/PreRoundFlowModal';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewRoundScreen() {
  const router = useRouter();

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <PreRoundFlowModal
        visible={true}
        onClose={handleClose}
        embedded={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
