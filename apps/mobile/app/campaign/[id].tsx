import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { api, type Campaign, type CampaignStats } from '@/lib/api';

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([
        api.getCampaign(id),
        api.getCampaignStats(id).catch(() => null),
      ]);
      setCampaign(c);
      setStats(s);
    } catch {
      setError('Could not load this campaign.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }
  if (error || !campaign) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Not found.'}</Text>
      </View>
    );
  }

  const pct = (n?: number) => (typeof n === 'number' ? `${n.toFixed(1)}%` : '—');

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: campaign.name }} />
      <Text style={styles.title}>{campaign.name}</Text>
      {campaign.subject ? <Text style={styles.subject}>{campaign.subject}</Text> : null}

      <View style={styles.grid}>
        <Stat label="Sent" value={campaign.totalSent.toLocaleString()} />
        <Stat label="Opens" value={campaign.totalOpens.toLocaleString()} />
        <Stat label="Clicks" value={campaign.totalClicks.toLocaleString()} />
        <Stat label="Open rate" value={pct(stats?.openRate)} />
        <Stat label="Click rate" value={pct(stats?.clickRate)} />
        <Stat label="CTOR" value={pct(stats?.ctor)} />
        <Stat label="Bounce rate" value={pct(stats?.bounceRate)} />
        <Stat label="Unsub rate" value={pct(stats?.unsubRate)} />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subject: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#ffffff', borderRadius: 12, padding: 16 },
  statLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 4 },
  error: { color: '#dc2626', fontSize: 15 },
});
