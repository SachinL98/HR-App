import { Linking, ScrollView, Text, View } from 'react-native';
import { WEB_URL, type Call, type Me, type Org } from '../api';
import { LOCALES, useI18n, type Locale } from '../i18n';
import type { Colors } from '../theme';
import { Badge, Button, Card, Choice, Heading, Logo, Notice } from '../ui';

export function Account({ c, call, me, org, onSignOut }: { c: Colors; call: Call; me: Me; org: Org; onSignOut: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const plan = org.plan?.tier ?? org.subscription?.tier;
  // Remember the choice on the phone straight away, and on the account so it follows the person to other devices.
  const pick = (l: Locale) => { void setLocale(l); void call('/account/locale', { method: 'PUT', body: { locale: l } }).catch(() => undefined); };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}>
      <Heading c={c} sub={me.workEmail}>{me.firstName} {me.lastName}</Heading>
      <Card c={c} title={org.displayName} sub={me.isOwner ? t('home.owner') : (me.jobRole?.name ?? t('home.member'))}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {!!plan && <Badge c={c} tone="info" label={t('acct.plan', { plan: `${plan[0]}${plan.slice(1).toLowerCase()}` })} />}
          {me.account && <Badge c={c} tone={me.account.mfaEnabled ? 'good' : 'warn'} label={me.account.mfaEnabled ? t('acct.mfaOn') : t('acct.mfaOff')} />}
          {me.account && !me.account.emailVerified && <Badge c={c} tone="warn" label={t('acct.emailNot')} />}
        </View>
      </Card>
      <Card c={c} title={t('acct.languageTitle')} sub={t('acct.languageSub')}>
        <Choice c={c} value={locale} onChange={pick} options={LOCALES.map((l) => ({ id: l.id, label: l.label }))} />
      </Card>
      {me.account && !me.account.mfaEnabled && (me.isOwner || me.permissions.includes('payroll.manage')) && (
        <Notice c={c} tone="info">{t('acct.mfaNotice')}</Notice>
      )}
      <Card c={c} title={t('acct.securityTitle')} sub={t('acct.securitySub')}>
        <Button c={c} variant="ghost" label={t('acct.openWeb')} onPress={() => void Linking.openURL(`${WEB_URL}/account`)} />
      </Card>
      <Button c={c} variant="danger" label={t('acct.signOut')} onPress={onSignOut} />
      <View style={{ alignItems: 'center', marginTop: 10, gap: 4 }}>
        <Logo size={36} />
        <Text style={{ color: c.muted, fontSize: 12 }}>Seamless Source HR</Text>
      </View>
    </ScrollView>
  );
}
