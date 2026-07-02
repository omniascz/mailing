import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { loadCredentials } from '@/lib/auth';

export default function Index() {
  useEffect(() => {
    loadCredentials().then((creds) => {
      router.replace(creds ? '/(tabs)' : '/login');
    });
  }, []);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
});
