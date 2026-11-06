import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import type { Call, Note } from '../api';
import type { Colors } from '../theme';
import { Button, Card, Empty, Heading, Notice } from '../ui';
import { useI18n } from '../i18n';

export function Alerts({ c, call, onChanged }: { c: Colors; call: Call; onChanged: () => void }) {
  const { t: tr, tag } = useI18n();
  const [items, setItems] = useState<Note[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems((await call<{ items: Note[] }>('/notifications')).items); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : tr('common.couldNotLoad')); }
  }, [call, tr]);
  useEffect(() => { void load(); }, [load]);

  const unread = items.filter((n) => !n.readAt).length;
  const open = async (n: Note) => {
    if (n.readAt) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    try { await call(`/notifications/${n.id}/read`, { body: {} }); onChanged(); } catch { void load(); }
  };
  const readAll = async () => {
    try { await call('/notifications/read-all', { body: {} }); await load(); onChanged(); } catch { /* shown on next refresh */ }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Heading c={c} sub={unread ? tr('alerts.unread', { n: unread }) : tr('alerts.caughtUp')}>{tr('alerts.title')}</Heading>
      {!!error && <Notice c={c} tone="bad">{error}</Notice>}
      {unread > 0 && <View style={{ alignSelf: 'flex-start' }}><Button c={c} small variant="ghost" label={tr('alerts.markAll')} onPress={() => void readAll()} /></View>}
      <Card c={c}>
        {items.length === 0 ? <Empty c={c}>{tr('alerts.none')}</Empty> : items.map((n, i) => (
          <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={n.title} onPress={() => void open(n)}
            style={{ flexDirection: 'row', gap: 10, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.readAt ? 'transparent' : c.primary }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.ink, fontWeight: n.readAt ? '400' : '700' }}>{n.title}</Text>
              {!!n.body && <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{n.body}</Text>}
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{new Date(n.createdAt).toLocaleString(tag, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
            </View>
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}
