import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { api, ApiError, WEB_URL } from '../api';
import type { Colors } from '../theme';
import { Button, Field, Logo, Notice } from '../ui';
import { LOCALES, useI18n } from '../i18n';

interface LoginResult { accessToken?: string; mfaRequired?: boolean; challenge?: string }

/** Email and password, then (if two-factor is on) the 6-digit code. */
export function SignIn({ c, onToken }: { c: Colors; onToken: (tok: string) => Promise<void> }) {
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [askCompany, setAskCompany] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The person belongs to several companies: ask which one.
        setAskCompany(true);
        const opts = (e.body as { options?: { slug: string; name: string }[] } | undefined)?.options ?? [];
        setError(t('signin.several', { ids: opts.map((o) => o.slug).join(', ') }));
      } else {
        setError(e instanceof ApiError ? e.message : t('signin.wentWrong'));
      }
    } finally { setBusy(false); }
  };

  const login = () => run(async () => {
    const r = await api<LoginResult>('/auth/login', { body: { email: email.trim(), password, tenantSlug: tenantSlug.trim() || undefined } });
    if (r.mfaRequired && r.challenge) { setChallenge(r.challenge); return; }
    if (r.accessToken) await onToken(r.accessToken);
  });
  const verify = () => run(async () => {
    const r = await api<{ accessToken: string }>('/auth/mfa', { body: { challenge, code: code.trim() } });
    await onToken(r.accessToken);
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Logo size={72} />
          <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', marginTop: 10 }}>{t('signin.app')}</Text>
        </View>
        <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{challenge ? t('signin.codeTitle') : t('signin.welcome')}</Text>
        <Text style={{ color: c.muted, marginTop: 2, marginBottom: 18 }}>
          {challenge ? t('signin.codeSub') : t('signin.sub')}
        </Text>
        {!!error && <View style={{ marginBottom: 14 }}><Notice c={c} tone="bad">{error}</Notice></View>}

        {challenge ? (
          <>
            <Field c={c} label={t('signin.code')} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false}
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={12} onSubmitEditing={verify} />
            <Button c={c} label={t('signin.verify')} onPress={verify} busy={busy} disabled={code.trim().length < 6} />
            <View style={{ height: 10 }} />
            <Button c={c} label={t('common.back')} variant="ghost" onPress={() => { setChallenge(''); setCode(''); setError(''); }} />
          </>
        ) : (
          <>
            <Field c={c} label={t('signin.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
              autoComplete="email" keyboardType="email-address" textContentType="username" />
            <Field c={c} label={t('signin.password')} value={password} onChangeText={setPassword} secureTextEntry
              autoComplete="current-password" textContentType="password" onSubmitEditing={login} />
            {askCompany && <Field c={c} label={t('signin.companyId')} value={tenantSlug} onChangeText={setTenantSlug} autoCapitalize="none" autoCorrect={false} />}
            <Button c={c} label={t('signin.button')} onPress={login} busy={busy} disabled={!email || !password} />
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_URL}/forgot-password`)} style={{ alignSelf: 'center', padding: 14 }}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>{t('signin.forgot')}</Text>
            </Pressable>
          </>
        )}
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 18 }}>
          {LOCALES.map((l) => (
            <Pressable key={l.id} accessibilityRole="radio" accessibilityState={{ selected: l.id === locale }} onPress={() => void setLocale(l.id)} hitSlop={8}>
              <Text style={{ color: l.id === locale ? c.primary : c.muted, fontWeight: l.id === locale ? '700' : '500' }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
