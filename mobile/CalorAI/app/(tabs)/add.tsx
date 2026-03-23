import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { createMeal, getTelegramId } from '../../lib/api';


const QUICK_MEALS = [
  { name: 'Oatmeal', calories: 300 },
  { name: 'Chicken salad', calories: 420 },
  { name: 'Greek yogurt', calories: 150 },
  { name: 'Banana', calories: 90 },
  { name: 'Protein shake', calories: 200 },
  { name: 'Rice & veggies', calories: 380 },
];

export default function AddMealScreen() {
  const telegramId = getTelegramId()!; // set by SetupScreen on first launch

  const [name, setName]       = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a meal name.');
      return;
    }
    setSaving(true);
    try {
      await createMeal(
        telegramId,
        name.trim(),
        calories ? parseInt(calories, 10) : null,
        notes.trim() || undefined,
      );
      setName('');
      setCalories('');
      setNotes('');
      router.replace('/(tabs)/');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyQuick = (meal: typeof QUICK_MEALS[0]) => {
    setName(meal.name);
    setCalories(String(meal.calories));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Quick add</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow}>
          {QUICK_MEALS.map((m) => (
            <TouchableOpacity key={m.name} style={styles.quickChip} onPress={() => applyQuick(m)}>
              <Text style={styles.quickName}>{m.name}</Text>
              <Text style={styles.quickCal}>{m.calories} kcal</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.section}>Meal details</Text>

        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Grilled chicken"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Calories</Text>
        <TextInput
          style={styles.input}
          value={calories}
          onChangeText={setCalories}
          placeholder="e.g. 450"
          keyboardType="numeric"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes..."
          multiline
          numberOfLines={3}
          placeholderTextColor="#9ca3af"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : '+ Log Meal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll:    { padding: 20, paddingBottom: 40 },
  section:   { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, marginTop: 8 },
  quickRow:  { marginBottom: 24, marginHorizontal: -20, paddingHorizontal: 20 },
  quickChip: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 10, borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  quickName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  quickCal:  { fontSize: 12, color: '#6b7280', marginTop: 2 },
  label:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 14, fontSize: 15, color: '#111827', marginBottom: 16,
  },
  textarea:  { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: '#22c55e', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#22c55e', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
