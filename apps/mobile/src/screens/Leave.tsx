import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { ApiError, type Call, type LeaveRequest, type LeaveType } from '../api';
import type { Colors } from '../theme';
import { Badge, Button, Card, Choice, Empty, Field, Heading, Notice, type Tone } from '../ui';
import { useI18n } from '../i18n';

const TONE: Record<LeaveRequest['status'], Tone> = { APPROVED: 'good', PENDING: 'warn', CHANGES_REQUESTED: 'warn', REJECTED: 'bad', CANCELED: 'neutral', DRAFT: 'neutral' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function Leave({ c, call, onChanged }: { c: Colors; call: Call; onChanged: () => void }) {
  const { t: tr, tn, tag } = useI18n();
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<'LEAVE' | 'WFH'>('LEAVE');
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, lt] = await Promise.all([call<LeaveRequest[]>('/requests/mine'), call<LeaveType[]>('/leave-types')]);
      setMine(m); const active = lt.filter((x) => x.active); setTypes(active);
      setTypeId((cur) => cur || active[0]?.id || '');
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : tr('common.couldNotLoad') }); }
  }, [call, tr]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!DAY.test(from) || (to && !DAY.test(to))) { setMsg({ tone: 'bad', text: tr('leave.badDate') }); return; }
    setBusy(true); setMsg(null);
    try {
      await call('/requests', { body: { type: kind, leaveTypeId: kind === 'LEAVE' ? typeId : undefined, startDate: from, endDate: to || from, reason: reason.trim() || undefined } });
      setMsg({ tone: 'good', text: tr('leave.sent') }); setFrom(''); setTo(''); setReason('');
      await load(); onChanged();
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError ? e.message : tr('leave.sendFailed') }); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    try { await call(`/requests/${id}/cancel`, { method: 'POST', body: {} }); await load(); onChanged(); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : tr('leave.cancelFailed') }); }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Heading c={c} sub={tr('leave.sub')}>{tr('leave.title')}</Heading>
      {msg && <Notice c={c} tone={msg.tone}>{msg.text}</Notice>}

      <Card c={c} title={tr('leave.newRequest')}>
        <Choice c={c} value={kind} onChange={setKind} options={[{ id: 'LEAVE', label: tr('leave.typeLeave') }, { id: 'WFH', label: tr('leave.typeWfh') }]} />
        {kind === 'LEAVE' && <Choice c={c} value={typeId} onChange={setTypeId} options={types.map((x) => ({ id: x.id, label: x.name }))} />}
        <Field c={c} label={tr('leave.from')} value={from} onChangeText={setFrom} placeholder="2026-12-24" keyboardType="numbers-and-punctuation" autoCapitalize="none" maxLength={10} />
        <Field c={c} label={tr('leave.to')} hint={tr('leave.toHint')} value={to} onChangeText={setTo} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" autoCapitalize="none" maxLength={10} />
        <Field c={c} label={tr('leave.reason')} value={reason} onChangeText={setReason} maxLength={500} />
        <Button c={c} label={tr('leave.send')} onPress={submit} busy={busy} disabled={!from || (kind === 'LEAVE' && !typeId)} />
      </Card>

      <Card c={c} title={tr('leave.myRequests')}>
        {mine.length === 0 ? <Empty c={c}>{tr('leave.none')}</Empty> : mine.map((r) => (
          <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: c.ink, fontWeight: '600', flex: 1 }}>
                {r.type === 'WFH' ? tr('leave.typeWfh') : (types.find((x) => x.id === r.leaveTypeId)?.name ?? tr('leave.typeLeave'))} · {tn('leave.days', Number(r.days))}
              </Text>
              <Badge c={c} tone={TONE[r.status]} label={tr(`status.${r.status}`)} />
            </View>
            <Text style={{ color: c.muted, fontSize: 13 }}>{r.startDate.slice(0, 10)}{r.endDate !== r.startDate ? ` to ${r.endDate.slice(0, 10)}` : ''}</Text>
            {r.actions.filter((a) => a.comment).map((a) => <Text key={a.id} style={{ color: c.muted, fontSize: 13 }}>“{a.comment}”</Text>)}
            {['PENDING', 'APPROVED', 'CHANGES_REQUESTED'].includes(r.status) && (
              <View style={{ alignSelf: 'flex-start' }}><Button c={c} small variant="ghost" label={tr('leave.cancelRequest')} onPress={() => void cancel(r.id)} /></View>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
