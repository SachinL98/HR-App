import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import type { Balance, Calendar, Call, LeaveRequest, Me, Org, Task } from '../api';
import type { Colors } from '../theme';
import { Badge, Button, Card, Empty, Heading, Notice } from '../ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function Home({ c, call, me, org, go, onChanged }: { c: Colors; call: Call; me: Me; org: Org; go: (tab: 'leave' | 'approvals') => void; onChanged: () => void }) {
  const { t, tn, tag } = useI18n();
  const nice = (d: string) => new Date(d).toLocaleDateString(tag, { weekday: 'short', day: 'numeric', month: 'short' });
  const [balances, setBalances] = useState<Balance[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<LeaveRequest[]>([]);
  const [away, setAway] = useState<{ name: string; dates: string[]; kind: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const from = iso(new Date());
      const to = iso(new Date(Date.now() + 6 * 86400_000));
      const [b, tk, i, cal] = await Promise.all([
        call<Balance[]>('/balances/me'), call<Task[]>('/checklists/mine'), call<LeaveRequest[]>('/requests/inbox'),
        call<Calendar>(`/calendar?from=${from}&to=${to}`),
      ]);
      setBalances(b.filter((x) => x.entitled !== null)); setTasks(tk); setInbox(i);
      const map = new Map<string, { name: string; dates: string[]; kind: string }>();
      for (const d of cal.days.filter((x) => x.type === 'LEAVE' || x.type === 'OUT_OF_OFFICE')) {
        const p = cal.members.find((m) => m.id === d.memberId);
        if (!p) continue;
        const cur = map.get(p.id) ?? { name: `${p.firstName} ${p.lastName}`, dates: [], kind: d.type === 'LEAVE' ? t('home.onLeave') : t('home.outOfOffice') };
        cur.dates.push(d.date.slice(0, 10));
        map.set(p.id, cur);
      }
      setAway([...map.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0])));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.couldNotLoad'));
    }
  }, [call, t]);
  useEffect(() => { void load(); }, [load]);

  const done = async (id: string) => {
    setTasks((cur) => cur.filter((t) => t.id !== id));
    try { await call(`/checklist-tasks/${id}/done`, { body: { done: true } }); onChanged(); } catch { void load(); }
  };

  const plan = org.plan;
  const banner = !plan || !(me.isOwner || me.permissions.includes('billing.manage')) ? null
    : plan.state === 'trial_grace' ? t('home.bannerGrace')
    : plan.state === 'trial_ended' || plan.state === 'canceled' ? t('home.bannerFree', { n: plan.seatLimit })
    : plan.state === 'past_due' ? t('home.bannerPastDue')
    : plan.state === 'trial' && org.trialDaysLeft !== null && org.trialDaysLeft <= 3 ? tn('home.bannerTrial', org.trialDaysLeft) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Heading c={c} sub={`${org.displayName} · ${me.isOwner ? t('home.owner') : (me.jobRole?.name ?? t('home.member'))}`}>{t('home.hi', { name: me.firstName })}</Heading>
      {!!banner && <Notice c={c} tone={plan?.state === 'trial' ? 'info' : 'warn'}>{banner}</Notice>}
      {!!error && <Notice c={c} tone="bad">{error}</Notice>}

      {inbox.length > 0 && (
        <Card c={c} title={t('home.waitingApproval', { n: inbox.length })} action={<Button c={c} small label={t('home.review')} onPress={() => go('approvals')} />} />
      )}

      <Card c={c} title={t('home.myTimeOff')} sub={t('home.whatLeft')} action={<Button c={c} small variant="ghost" label={t('home.request')} onPress={() => go('leave')} />}>
        {balances.length === 0 ? <Empty c={c}>{t('home.noAllowances')}</Empty> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {balances.map((b) => (
              <View key={b.key} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1, borderRadius: c.radius, padding: 12 }}>
                <Text style={{ color: c.muted, fontSize: 13 }}>{b.label}</Text>
                <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{b.remaining}<Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}> {t('home.ofN', { n: b.entitled ?? 0 })}</Text></Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: c.line, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ width: `${b.entitled ? Math.max(0, Math.min(100, ((b.remaining ?? 0) / b.entitled) * 100)) : 0}%`, height: 5, backgroundColor: c.primary }} />
                </View>
                {b.carriedLeft > 0 && <Text style={{ color: c.muted, fontSize: 11, marginTop: 5 }}>{t('home.carried', { n: b.carriedLeft })}</Text>}
              </View>
            ))}
          </View>
        )}
      </Card>

      {tasks.length > 0 && (
        <Card c={c} title={t('home.myTasks')} sub={t('home.toDo', { n: tasks.length })}>
          {tasks.slice(0, 6).map((task) => (
            <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: '600' }}>{task.title}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{task.checklist}: {task.member.firstName} {task.member.lastName}{task.dueDate ? ` · ${t('home.due', { date: nice(task.dueDate) })}` : ''}</Text>
              </View>
              <Button c={c} small variant="ghost" label={t('common.done')} onPress={() => void done(task.id)} />
            </View>
          ))}
        </Card>
      )}

      <Card c={c} title={t('home.awayTitle')} sub={t('home.awaySub')}>
        {away.length === 0 ? <Empty c={c}>{t('home.everyoneIn')}</Empty> : away.slice(0, 8).map((a) => {
          const days = [...new Set(a.dates)].sort();
          return (
            <View key={a.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line }}>
              <Text style={{ color: c.ink, fontWeight: '600', flex: 1 }}>{a.name}</Text>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Badge c={c} tone="neutral" label={a.kind} />
                <Text style={{ color: c.muted, fontSize: 12 }}>{nice(days[0])}{days.length > 1 ? ` to ${nice(days[days.length - 1])}` : ''}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
