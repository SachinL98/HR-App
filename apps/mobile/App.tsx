import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, View, useColorScheme } from 'react-native';
import {
  api, ApiError, clearToken, loadToken, saveToken,
  type Call, type LeaveRequest, type Me, type Note, type Org,
} from './src/api';
import { LocaleProvider, isLocale, useI18n } from './src/i18n';
import { DEFAULT_THEME, resolveColors } from './src/theme';
import { Account } from './src/screens/Account';
import { Alerts } from './src/screens/Alerts';
import { Approvals } from './src/screens/Approvals';
import { Home } from './src/screens/Home';
import { Leave } from './src/screens/Leave';
import { SignIn } from './src/screens/SignIn';

type Tab = 'home' | 'leave' | 'approvals' | 'alerts' | 'account';
const TABS: { id: Tab; glyph: string }[] = [
  { id: 'home', glyph: '⌂' },
  { id: 'leave', glyph: '◷' },
  { id: 'approvals', glyph: '✓' },
  { id: 'alerts', glyph: '◔' },
  { id: 'account', glyph: '☺' },
];

interface Session { token: string; me: Me; org: Org }

export default function App() {
  return <LocaleProvider><AppInner /></LocaleProvider>;
}

function AppInner() {
  const { setLocale } = useI18n();
  const scheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  const open = useCallback(async (token: string) => {
    const [me, org] = await Promise.all([api<Me>('/me', { token }), api<Org>('/org', { token })]);
    // The language saved on the account wins, so it follows the person to a new phone.
    if (isLocale(me.account?.locale)) void setLocale(me.account.locale);
    setSession({ token, me, org });
  }, [setLocale]);

  const signOut = useCallback(async () => {
    // End the sign-in on the server too, so the saved token stops working everywhere.
    if (session) await api('/account/logout', { token: session.token, body: {} }).catch(() => undefined);
    await clearToken();
    setSession(null);
  }, [session]);

  useEffect(() => {
    (async () => {
      try {
        const t = await loadToken();
        if (t) await open(t);
      } catch {
        await clearToken(); // expired, signed out elsewhere, or suspended
      } finally {
        setBooting(false);
      }
    })();
  }, [open]);

  // The company's admin-set theme once signed in; the default look before that.
  const colors = resolveColors(session?.org ?? DEFAULT_THEME, scheme);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={colors.dark ? 'light' : 'dark'} />
      {booting ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : session ? (
        <Shell session={session} colors={colors} onSignOut={signOut} onExpired={() => { void clearToken(); setSession(null); }} />
      ) : (
        <SignIn c={colors} onToken={async (t) => { await saveToken(t); await open(t); }} />
      )}
    </SafeAreaView>
  );
}

function Shell({ session, colors: c, onSignOut, onExpired }: {
  session: Session; colors: ReturnType<typeof resolveColors>; onSignOut: () => void; onExpired: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('home');
  const [counts, setCounts] = useState({ approvals: 0, alerts: 0 });
  const [version, setVersion] = useState(0); // bumping this makes the visible screen reload

  // Every call carries the token, and a "signed out" answer sends the person back to sign in.
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const call = useMemo<Call>(
    () => async (path, init = {}) => {
      try {
        return await api(path, { ...init, token: session.token });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) expired.current();
        throw e;
      }
    },
    [session.token],
  );

  const refreshCounts = useCallback(async () => {
    try {
      const [inbox, notes] = await Promise.all([call<LeaveRequest[]>('/requests/inbox'), call<{ items: Note[]; unreadCount: number }>('/notifications?unread=1')]);
      setCounts({ approvals: inbox.length, alerts: notes.unreadCount });
    } catch { /* the badges stay as they were */ }
  }, [call]);
  useEffect(() => { void refreshCounts(); }, [refreshCounts, tab, version]);
  const changed = useCallback(() => { setVersion((v) => v + 1); }, []);

  const props = { c, call, onChanged: changed } as const;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} key={`${tab}-${tab === 'home' ? version : 0}`}>
        {tab === 'home' && <Home {...props} me={session.me} org={session.org} go={(t) => setTab(t)} />}
        {tab === 'leave' && <Leave {...props} />}
        {tab === 'approvals' && <Approvals {...props} />}
        {tab === 'alerts' && <Alerts {...props} />}
        {tab === 'account' && <Account c={c} call={call} me={session.me} org={session.org} onSignOut={onSignOut} />}
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        {TABS.map((tb) => {
          const on = tb.id === tab;
          const n = tb.id === 'approvals' ? counts.approvals : tb.id === 'alerts' ? counts.alerts : 0;
          return (
            <Pressable key={tb.id} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={n ? t('tab.waiting', { label: t(`tab.${tb.id}`), n }) : t(`tab.${tb.id}`)} onPress={() => setTab(tb.id)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, minHeight: 56 }}>
              <View>
                <Text style={{ fontSize: 20, color: on ? c.primary : c.muted }}>{tb.glyph}</Text>
                {n > 0 && (
                  <View style={{ position: 'absolute', top: -2, right: -12, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: c.primaryFg, fontSize: 10, fontWeight: '700' }}>{n > 99 ? '99+' : n}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11, marginTop: 2, color: on ? c.primary : c.muted, fontWeight: on ? '700' : '500' }}>{t(`tab.${tb.id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
