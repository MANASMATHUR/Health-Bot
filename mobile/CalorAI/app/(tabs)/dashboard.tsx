import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, Dimensions,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard } from '../../lib/api';

const SCREEN_W = Dimensions.get('window').width;
const BAR_MAX_W = SCREEN_W - 80;

interface DashboardData {
  dailyMeals: { date: string; count: number }[];
  abDistribution: { control: number; test: number };
  onboardingFunnel: { step: string; count: number }[];
}

export default function DashboardScreen() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchDashboard();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data && loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading analytics…</Text>
      </View>
    );
  }

  const maxMeals = Math.max(...(data?.dailyMeals.map((d) => d.count) || [1]), 1);
  const totalUsers = (data?.abDistribution.control || 0) + (data?.abDistribution.test || 0);
  const funnelMax = data?.onboardingFunnel[0]?.count || 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#22c55e" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSub}>Last 7 days</Text>
      </View>

      {/* Daily meals chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily meal logs</Text>
        <View style={styles.barChart}>
          {data?.dailyMeals.map((d) => {
            const barH = Math.max((d.count / maxMeals) * 120, d.count > 0 ? 8 : 2);
            const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <View key={d.date} style={styles.barCol}>
                <Text style={styles.barValue}>{d.count > 0 ? d.count : ''}</Text>
                <View style={[styles.bar, { height: barH, backgroundColor: d.count > 0 ? '#22c55e' : '#e5e7eb' }]} />
                <Text style={styles.barLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* A/B Distribution */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>A/B test groups</Text>
        <View style={styles.abRow}>
          <View style={styles.abBlock}>
            <Text style={[styles.abCount, { color: '#6366f1' }]}>{data?.abDistribution.control ?? 0}</Text>
            <Text style={styles.abLabel}>Control</Text>
          </View>
          <View style={styles.abDivider} />
          <View style={styles.abBlock}>
            <Text style={[styles.abCount, { color: '#22c55e' }]}>{data?.abDistribution.test ?? 0}</Text>
            <Text style={styles.abLabel}>Test</Text>
          </View>
          <View style={styles.abDivider} />
          <View style={styles.abBlock}>
            <Text style={styles.abCount}>{totalUsers}</Text>
            <Text style={styles.abLabel}>Total</Text>
          </View>
        </View>
        {totalUsers > 0 && (
          <View style={styles.progressBar}>
            <View style={[
              styles.progressControl,
              { flex: data?.abDistribution.control || 1 }
            ]} />
            <View style={[
              styles.progressTest,
              { flex: data?.abDistribution.test || 1 }
            ]} />
          </View>
        )}
        <View style={styles.progressLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
            <Text style={styles.legendText}>Control ({totalUsers > 0 ? Math.round((data?.abDistribution.control || 0) / totalUsers * 100) : 0}%)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendText}>Test ({totalUsers > 0 ? Math.round((data?.abDistribution.test || 0) / totalUsers * 100) : 0}%)</Text>
          </View>
        </View>
      </View>

      {/* Onboarding funnel */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Onboarding funnel (test group)</Text>
        {data?.onboardingFunnel.map((step, i) => {
          const pct = funnelMax > 0 ? step.count / funnelMax : 0;
          const colors = ['#22c55e', '#16a34a', '#15803d', '#14532d'];
          return (
            <View key={step.step} style={styles.funnelRow}>
              <Text style={styles.funnelLabel} numberOfLines={1}>{step.step}</Text>
              <View style={styles.funnelBarBg}>
                <View style={[styles.funnelBar, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: colors[i] }]} />
              </View>
              <Text style={styles.funnelCount}>{step.count}</Text>
            </View>
          );
        })}
        {(!data?.onboardingFunnel.length || data.onboardingFunnel.every(s => s.count === 0)) && (
          <Text style={styles.noData}>No test users yet</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content:   { padding: 16, paddingBottom: 40 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9ca3af', fontSize: 15 },
  header:     { marginBottom: 20 },
  headerTitle:{ fontSize: 26, fontWeight: '800', color: '#111827' },
  headerSub:  { fontSize: 14, color: '#6b7280', marginTop: 2 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Bar chart
  barChart:  { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 6 },
  barCol:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:       { width: '80%', borderRadius: 4, minHeight: 2 },
  barValue:  { fontSize: 11, fontWeight: '700', color: '#374151', marginBottom: 4, height: 16 },
  barLabel:  { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  // A/B
  abRow:     { flexDirection: 'row', marginBottom: 16 },
  abBlock:   { flex: 1, alignItems: 'center' },
  abCount:   { fontSize: 28, fontWeight: '800', color: '#111827' },
  abLabel:   { fontSize: 13, color: '#6b7280', marginTop: 2 },
  abDivider: { width: 1, backgroundColor: '#e5e7eb' },
  progressBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressControl: { backgroundColor: '#6366f1' },
  progressTest:    { backgroundColor: '#22c55e' },
  progressLegend:  { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: '#6b7280' },
  // Funnel
  funnelRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  funnelLabel: { width: 110, fontSize: 12, color: '#374151', fontWeight: '500', textTransform: 'capitalize' },
  funnelBarBg: { flex: 1, height: 20, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  funnelBar:   { height: '100%', borderRadius: 4 },
  funnelCount: { width: 28, fontSize: 13, fontWeight: '700', color: '#374151', textAlign: 'right' },
  noData:      { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});
