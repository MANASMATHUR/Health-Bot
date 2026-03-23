import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import { setTelegramId } from '../lib/api';
import SetupScreen from '../components/SetupScreen';

export default function RootLayout() {
  const [ready, setReady]           = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_800ExtraBold,
  });

  useEffect(() => {
    AsyncStorage.getItem('telegram_id').then((stored) => {
      if (stored) {
        setTelegramId(parseInt(stored, 10));
        setReady(true);
      } else {
        setNeedsSetup(true);
        setReady(true);
      }
    });
  }, []);

  if (!ready || !fontsLoaded) return null;

  if (needsSetup) {
    return (
      <SafeAreaProvider>
        <SetupScreen onDone={() => setNeedsSetup(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}
