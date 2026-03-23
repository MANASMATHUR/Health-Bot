import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, TextInput, Modal,
} from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMeals, Meal } from '../../hooks/useMeals';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { deleteMeal, updateMeal, getTelegramId } from '../../lib/api';


export default function MealsScreen() {
  const telegramId = getTelegramId()!;

  usePushNotifications(telegramId);

  const { meals, loading, reload } = useMeals(telegramId);

  const [editModal, setEditModal]   = useState(false);
  const [editing, setEditing]       = useState<Meal | null>(null);
  const [editName, setEditName]     = useState('');
  const [editCals, setEditCals]     = useState('');

  const todayMeals = meals.filter((m) => {
    const d = new Date(m.logged_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const olderMeals = meals.filter((m) => {
    const d = new Date(m.logged_at);
    const now = new Date();
    return d.toDateString() !== now.toDateString();
  });

  const totalCal = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);

  const handleDelete = useCallback((meal: Meal) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete meal', `Delete "${meal.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteMeal(meal.id, telegramId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          reload();
        },
      },
    ]);
  }, [telegramId, reload]);

  const openEdit = useCallback((meal: Meal) => {
    Haptics.selectionAsync();
    setEditing(meal);
    setEditName(meal.name);
    setEditCals(meal.calories ? String(meal.calories) : '');
    setEditModal(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    await updateMeal(editing.id, telegramId, {
      name: editName,
      calories: editCals ? parseInt(editCals, 10) : null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditModal(false);
    reload();
  }, [editing, editName, editCals, telegramId, reload]);

  const renderMeal = ({ item }: { item: Meal }) => {
    const time = new Date(item.logged_at).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={styles.mealCard}>
        <View style={styles.mealLeft}>
          <Text style={styles.mealName}>{item.name}</Text>
          <Text style={styles.mealMeta}>
            {time}{item.calories ? ` · ${item.calories} kcal` : ''}
          </Text>
        </View>
        <View style={styles.mealActions}>
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
            <Ionicons name="pencil-outline" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={16} color="#f87171" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <LinearGradient
        colors={['#14532d', '#166534', '#15803d']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>System Log</Text>
            <Text style={styles.headerSubtitle}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <View style={styles.headerStats}>
            <Text style={styles.headerCount}>{totalCal}</Text>
            <Text style={styles.headerLabel}>kcal</Text>
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={[
          ...(todayMeals.length > 0 ? [{ type: 'header', title: "Active Logs" }] : [{ type: 'empty' }]),
          ...todayMeals.map(m => ({ type: 'meal', ...m })),
          ...(olderMeals.length > 0 ? [{ type: 'header', title: 'Archive' }] : []),
          ...olderMeals.map(m => ({ type: 'meal', ...m })),
        ]}
        keyExtractor={(item: any) => item.id ? String(item.id) : item.title || item.type}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor="#22c55e" />}
        renderItem={({ item }: any) => {
          if (item.type === 'header') {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }
          if (item.type === 'empty') {
            return (
              <View style={styles.empty}>
                <Ionicons name="analytics" size={48} color="#e5e7eb" />
                <Text style={styles.emptyText}>Zero activity detected</Text>
                <Text style={styles.emptyHint}>Log your first meal via Telegram</Text>
              </View>
            );
          }
          return renderMeal({ item: item as Meal });
        }}
        contentContainerStyle={{ paddingBottom: 32 }}
      />

      {/* Edit Modal — Glassmorphism style */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Entry</Text>
            <Text style={styles.inputLabel}>IDENTIFIER</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholderTextColor="#9ca3af"
              placeholder="e.g. Protein Shake"
            />
            <Text style={styles.inputLabel}>CALORIC VALUE</Text>
            <TextInput
              style={styles.input}
              value={editCals}
              onChangeText={setEditCals}
              keyboardType="numeric"
              placeholderTextColor="#9ca3af"
              placeholder="0"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={styles.cancelBtnText}>Abort</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Commit Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: {
    paddingTop: 60, paddingBottom: 30, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 24, fontFamily: 'Outfit_800ExtraBold', letterSpacing: -0.5 },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  headerStats: { alignItems: 'flex-end' },
  headerCount: { color: '#fff', fontSize: 28, fontFamily: 'Outfit_800ExtraBold' },
  headerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Outfit_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 },
  
  sectionHeader: { fontSize: 11, fontFamily: 'Outfit_600SemiBold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1.5, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 12 },
  
  mealCard: {
    backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 6,
    borderRadius: 16, padding: 18, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1,
  },
  mealLeft:    { flex: 1 },
  mealName:    { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#111827' },
  mealMeta:    { fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6b7280', marginTop: 3 },
  mealActions: { flexDirection: 'row', gap: 4 },
  iconBtn:     { padding: 8 },
  
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#9ca3af', marginTop: 16 },
  emptyHint: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#d1d5db', marginTop: 4 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32 },
  modalTitle: { fontSize: 20, fontFamily: 'Outfit_800ExtraBold', color: '#111827', marginBottom: 24 },
  inputLabel: { fontSize: 10, fontFamily: 'Outfit_600SemiBold', color: '#9ca3af', marginBottom: 8, letterSpacing: 1 },
  input: { backgroundColor: '#f9fafb', borderRadius: 14, padding: 16, fontSize: 15, fontFamily: 'Outfit_400Regular', marginBottom: 20, color: '#111827', borderWidth: 1, borderColor: '#f3f4f6' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
  cancelBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtnText: { color: '#6b7280', fontFamily: 'Outfit_600SemiBold' },
  saveBtn: { flex: 2, backgroundColor: '#166534', borderRadius: 14, padding: 16, alignItems: 'center', shadowColor: '#166534', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  saveBtnText: { color: '#fff', fontFamily: 'Outfit_600SemiBold' },
});
