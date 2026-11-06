import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { ApiError, type Call, type LeaveRequest, type LeaveType } from '../api';
import type { Colors } from '../theme';
import { Button, Card, Empty, Field, Heading, Notice } from '../ui';
import { useI18n } from '../i18n';

type Decision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export function Approvals({ c, call, onChanged }: { c: Colors; call: Call; onChanged: () => void }) {
  const { t: tr, tn, tag } = useI18n();
  const [inbox, setInbox] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, lt] = await Promise.all([call<LeaveRequest[]>('/requests/inbox'), call<LeaveType[]>('/leave-types')]);
      setInbox(i); setTypes(lt); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : tr('common.couldNotLoad')); }
  }, [call, tr]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, decision: Decision) => {
    const comment = (comments[id] ?? '').trim();
    if (decision !== 'APPROVED' && !comment) { setError(tr('appr.needComment')); return; }
    setBusy(id + decision); setError('');
    try {
      await call(`/requests/${id}/decision`, { body: { decision, comment: comment || undefined } });
      await load(); onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : tr('appr.saveFailed')); }
    finally { setBusy(''); }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Heading c={c} sub={inbox.length ? tr('appr.waitingN', { n: inbox.length }) : tr('appr.waiting')}>{tr('appr.title')}</Heading>
      {!!error && <Notice c={c} tone="bad">{error}</Notice>}
      {inbox.length === 0 && <Card c={c}><Empty c={c}>{tr('appr.caughtUp')}</Empty></Card>}
      {inbox.map((r) => (
        <Card key={r.id} c={c}>
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700' }}>{r.requester?.firstName} {r.requester?.lastName}</Text>
          <Text style={{ color: c.muted, marginTop: 2 }}>
            {r.type === 'WFH' ? tr('leave.typeWfh') : (types.find((x) => x.id === r.leaveTypeId)?.name ?? tr('leave.typeLeave'))} · {tn('leave.days', Number(r.days))}
          </Text>
          <Text style={{ color: c.ink, marginTop: 4, marginBottom: 10 }}>{r.endDate !== r.startDate ? tr('appr.range', { from: r.startDate.slice(0, 10), to: r.endDate.slice(0, 10) }) : r.startDate.slice(0, 10)}</Text>
          {r.teamOff && r.teamOff.off > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Notice c={c} tone={r.teamOff.off / r.teamOff.total >= 0.4 ? 'warn' : 'info'}>
                {tr('appr.teamOff', { off: r.teamOff.off, total: r.teamOff.total, verb: r.teamOff.off === 1 ? tr('appr.is') : tr('appr.are'), names: r.teamOff.names.join(', ') })}
              </Notice>
            </View>
          )}
          {!!r.reason && <Text style={{ color: c.ink, backgroundColor: c.surface2, padding: 10, borderRadius: c.radius, marginBottom: 12 }}>“{r.reason}”</Text>}
          <Field c={c} label={tr('appr.comment')} hint={tr('appr.commentHint')} value={comments[r.id] ?? ''} onChangeText={(t) => setComments((m) => ({ ...m, [r.id]: t }))} maxLength={500} />
          <View style={{ gap: 8 }}>
            <Button c={c} label={tr('appr.approve')} onPress={() => void decide(r.id, 'APPROVED')} busy={busy === r.id + 'APPROVED'} disabled={!!busy} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button c={c} variant="ghost" label={tr('appr.changes')} onPress={() => void decide(r.id, 'CHANGES_REQUESTED')} busy={busy === r.id + 'CHANGES_REQUESTED'} disabled={!!busy} /></View>
              <View style={{ flex: 1 }}><Button c={c} variant="danger" label={tr('appr.reject')} onPress={() => void decide(r.id, 'REJECTED')} busy={busy === r.id + 'REJECTED'} disabled={!!busy} /></View>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
