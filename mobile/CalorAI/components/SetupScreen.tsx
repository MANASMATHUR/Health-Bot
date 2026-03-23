import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTelegramId } from '../lib/api';

interface Props {
  onDone: () => void;
}

export default function SetupScreen({ onDone }: Props) {
  const [telegramId, setInput] = useState('');
  const [error, setError]      = useState('');

  const handleContinue = async () => {
    const id = parseInt(telegramId.trim(), 10);
    if (!id || isNaN(id) || id <= 0) {
      setError('Please enter your numeric Telegram user ID.');
      return;
    }
    setTelegramId(id);
    try {
      await AsyncStorage.setItem('telegram_id', String(id));
    } catch {}
    onDone();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>🥗 CalorAI</Text>
        <Text style={styles.title}>Link your Telegram account</Text>
        <Text style={styles.sub}>
          Enter your Telegram user ID to sync meals between this app and the bot.
          {'\n\n'}To find your ID, message <Text style={styles.bold}>@userinfobot</Text> on Telegram.
        </Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={telegramId}
          onChangeText={(v) => { setInput(v); setError(''); }}
          placeholder="e.g. 123456789"
          keyboardType="numeric"
          placeholderTextColor="#9ca3af"
          autoFocus
        />
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity style={styles.btn} onPress={handleContinue}>
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Your ID is stored only on this device and used to fetch your meal data.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  inner: { flex: 1, justifyContent: 'center', padding: 32 },
  logo:  { fontSize: 40, textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 12 },
  sub:   { fontSize: 15, color: '#6b7280', lineHeight: 22, textAlign: 'center', marginBottom: 32 },
  bold:  { fontWeight: '700', color: '#111827' },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 16, fontSize: 18, color: '#111827',
    textAlign: 'center', marginBottom: 8, letterSpacing: 2,
  },
  inputError:  { borderColor: '#ef4444' },
  errorText:   { color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  btn: {
    backgroundColor: '#22c55e', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 24,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },
});
