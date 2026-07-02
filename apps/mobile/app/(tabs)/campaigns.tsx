import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { api, type Campaign } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  draft: '#6b7280',
  scheduled: '#2563eb',
  sending: '#d97706',
  sent: '#059669',
  paused: '#d97706',
  cancelled: '#dc2626',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await api.listCampaigns());
    } catch {
      setError('Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={campaigns}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No campaigns yet.</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(`/campaign/${item.id}`)}>
            <View style={styles.rowHead}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] ?? '#6b7280' }]}>
                {item.status}
              </Text>
            </View>
            {item.subject ? (
              <Text style={styles.subject} numberOfLines={1}>
                {item.subject}
              </Text>
            ) : null}
            {item.status === 'sent' ? (
              <Text style={styles.meta}>
                {item.totalSent.toLocaleString()} sent · {item.totalOpens.toLocaleString()} opens
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  row: { backgroundColor: '#ffffff', borderRadius: 10, padding: 14, marginBottom: 8 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  status: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  subject: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  error: { color: '#dc2626', fontSize: 14, padding: 16 },
});
