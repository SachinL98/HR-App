import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { api, ApiError, clearToken, loadToken, saveToken, type Me, type Member, type Org } from './src/api';
import { DEFAULT_THEME, resolveColors, type Colors } from './src/theme';

interface Session { token: string; me: Me; org: Org; people: number }

export default function App() {
  const scheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  const open = useCallback(async (token: string) => {
    const [me, org, members] = await Promise.all([
      api<Me>('/me', { token }), api<Org>('/org', { token }), api<Member[]>('/members', { token }),
    ]);
    setSession({ token, me, org, people: members.length });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await loadToken();
        if (t) await open(t);
      } catch {
        await clearToken(); // expired, revoked or suspended
      } finally {
        setBooting(false);
      }
    })();
  }, [open]);

  // The company's admin-set theme once signed in; the default look before that.
  const colors = resolveColors(session?.org ?? DEFAULT_THEME, scheme);

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.bg === '#0e1118' ? 'light' : 'dark'} />
      {booting ? (
        <View style={[s.fill, s.center]}><ActivityIndicator color={colors.primary} /></View>
      ) : session ? (
        <Home c={colors} session={session} onSignOut={async () => { await clearToken(); setSession(null); }} />
      ) : (
        <SignIn c={colors} onToken={async (t) => { await saveToken(t); await open(t); }} />
      )}
    </SafeAreaView>
  );
}

function SignIn({ c, onToken }: { c: Colors; onToken: (t: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<{ accessToken: string }>('/auth/login', { body: { email: email.trim(), password } });
      await onToken(r.accessToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[s.fill, s.center, { padding: 24 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.logo, { backgroundColor: c.primary, borderRadius: c.radius }]}>
        <Text style={{ color: c.primaryFg, fontSize: 22, fontWeight: '700' }}>H</Text>
      </View>
      <Text style={[s.h1, { color: c.ink }]}>Welcome back</Text>
      <Text style={{ color: c.muted, marginBottom: 20 }}>Sign in to your company workspace.</Text>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.line, borderRadius: c.radius }]}>
        <TextInput
          accessibilityLabel="Work email" placeholder="Work email" placeholderTextColor={c.muted}
          autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          value={email} onChangeText={setEmail}
          style={[s.input, { color: c.ink, borderColor: c.line, borderRadius: c.radius }]}
        />
        <TextInput
          accessibilityLabel="Password" placeholder="Password" placeholderTextColor={c.muted}
          secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword}
          style={[s.input, { color: c.ink, borderColor: c.line, borderRadius: c.radius }]}
        />
        {!!error && <Text accessibilityRole="alert" style={{ color: '#dc2626', marginBottom: 8 }}>{error}</Text>}
        <Pressable
          accessibilityRole="button" onPress={submit} disabled={busy || !email || !password}
          style={[s.btn, { backgroundColor: c.primary, borderRadius: c.radius, opacity: busy || !email || !password ? 0.5 : 1 }]}
        >
          <Text style={{ color: c.primaryFg, fontWeight: '600' }}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Home({ c, session, onSignOut }: { c: Colors; session: Session; onSignOut: () => void }) {
  const { me, org, people } = session;
  const sub = org.subscription;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={s.row}>
        <View style={[s.logo, { backgroundColor: c.primary, borderRadius: c.radius, marginBottom: 0 }]}>
          <Text style={{ color: c.primaryFg, fontSize: 18, fontWeight: '700' }}>{org.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.h2, { color: c.ink }]}>{org.displayName}</Text>
          <Text style={{ color: c.muted }}>{me.isOwner ? 'Owner' : (me.jobRole?.name ?? 'Member')}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onSignOut} style={[s.ghost, { borderColor: c.line, borderRadius: c.radius }]}>
          <Text style={{ color: c.ink }}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={[s.h1, { color: c.ink }]}>Hi {me.firstName}</Text>
      <View style={s.row}>
        <Stat c={c} label="People" value={String(people)} />
        <Stat c={c} label="Plan" value={sub ? sub.tier[0] + sub.tier.slice(1).toLowerCase() : '—'} />
      </View>
      {sub?.status === 'TRIALING' && org.trialDaysLeft !== null && (
        <View style={[s.pill, { backgroundColor: c.accent, borderRadius: c.radius }]}>
          <Text style={{ color: c.accentFg, fontWeight: '600' }}>{org.trialDaysLeft} days of trial left</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ c, label, value }: { c: Colors; label: string; value: string }) {
  return (
    <View style={[s.card, { flex: 1, backgroundColor: c.surface, borderColor: c.line, borderRadius: c.radius }]}>
      <Text style={{ color: c.muted }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 28, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  h1: { fontSize: 24, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600' },
  card: { borderWidth: 1, padding: 16, alignSelf: 'stretch' },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12, fontSize: 16 },
  btn: { alignItems: 'center', paddingVertical: 14 },
  ghost: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  pill: { paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' },
});
