import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { api, type Campaign } from '@/lib/api';
import { clearCredentials } from '@/lib/auth';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await api.listCampaigns());
    } catch {
      setError('Could not load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sent = campaigns.filter((c) => c.status === 'sent');
  const totalSent = sent.reduce((a, c) => a + c.totalSent, 0);
  const totalOpens = sent.reduce((a, c) => a + c.totalOpens, 0);
  const totalClicks = sent.reduce((a, c) => a + c.totalClicks, 0);
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '—';
  const clickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '—';

  async function signOut() {
    await clearCredentials();
    router.replace('/login');
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.grid}>
        <Kpi label="Campaigns sent" value={String(sent.length)} />
        <Kpi label="Emails sent" value={totalSent.toLocaleString()} />
        <Kpi label="Open rate" value={openRate === '—' ? '—' : `${openRate}%`} />
        <Kpi label="Click rate" value={clickRate === '—' ? '—' : `${clickRate}%`} />
      </View>

      <Text style={styles.section}>Recent campaigns</Text>
      {sent.slice(0, 5).map((c) => (
        <TouchableOpacity
          key={c.id}
          style={styles.row}
          onPress={() => router.push(`/campaign/${c.id}`)}
        >
          <Text style={styles.rowTitle} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={styles.rowMeta}>{c.totalSent.toLocaleString()} sent</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  kpiLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  kpiValue: { fontSize: 24, fontWeight: '700', color: '#111827', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 24, marginBottom: 8 },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 15, color: '#111827', flex: 1, marginRight: 8 },
  rowMeta: { fontSize: 13, color: '#6b7280' },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12 },
  signOut: { marginTop: 28, marginBottom: 40, alignItems: 'center' },
  signOutText: { color: '#dc2626', fontSize: 15 },
});
