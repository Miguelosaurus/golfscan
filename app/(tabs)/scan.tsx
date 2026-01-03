import React, { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePathname } from 'expo-router';

// This is a placeholder file since we handle scan navigation in the tab button
export default function ScanScreen() {
  const pathname = usePathname();

  useEffect(() => {
    console.log('[tabs/scan] mount', { pathname });
    return () => console.log('[tabs/scan] unmount', { pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[tabs/scan] focus', { pathname });
      return () => console.log('[tabs/scan] blur', { pathname });
    }, [pathname])
  );

  return <View />;
}
