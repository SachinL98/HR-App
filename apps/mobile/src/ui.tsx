import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { Colors } from './theme';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export function Card({ c, children, title, sub, action }: { c: Colors; children?: ReactNode; title?: string; sub?: string; action?: ReactNode }) {
  return (
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.line, borderRadius: c.radius }]}>
      {(title || action) && (
        <View style={s.cardHead}>
          <View style={{ flex: 1 }}>
            {!!title && <Text style={[s.cardTitle, { color: c.ink }]}>{title}</Text>}
            {!!sub && <Text style={{ color: c.muted, fontSize: 13 }}>{sub}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Button({ c, label, onPress, variant = 'primary', disabled, busy, small }: {
  c: Colors; label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; busy?: boolean; small?: boolean;
}) {
  const off = disabled || busy;
  const bg = variant === 'primary' ? c.primary : 'transparent';
  const fg = variant === 'primary' ? c.primaryFg : variant === 'danger' ? c.bad : c.ink;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} accessibilityLabel={label}
      onPress={onPress} disabled={off} hitSlop={6}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: bg, borderRadius: c.radius, borderWidth: variant === 'primary' ? 0 : 1, borderColor: variant === 'danger' ? c.bad : c.line, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ c, label, hint, ...p }: { c: Colors; label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.ink, fontWeight: '600', fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label} placeholderTextColor={c.muted}
        style={[s.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, borderRadius: c.radius }]}
        {...p}
      />
      {!!hint && <Text style={{ color: c.muted, fontSize: 12, marginTop: 5 }}>{hint}</Text>}
    </View>
  );
}

export function Badge({ c, tone = 'neutral', label }: { c: Colors; tone?: Tone; label: string }) {
  const map = { neutral: [c.surface2, c.muted], good: [c.goodBg, c.good], warn: [c.warnBg, c.warn], bad: [c.badBg, c.bad], info: [c.infoBg, c.info] }[tone];
  return (
    <View style={[s.badge, { backgroundColor: map[0] }]}>
      <Text style={{ color: map[1], fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Notice({ c, tone, children }: { c: Colors; tone: Exclude<Tone, 'neutral'>; children: ReactNode }) {
  const map = { good: [c.goodBg, c.good], warn: [c.warnBg, c.warn], bad: [c.badBg, c.bad], info: [c.infoBg, c.info] }[tone];
  return (
    <View accessibilityRole="alert" style={[s.notice, { backgroundColor: map[0], borderColor: map[1], borderRadius: c.radius }]}>
      <Text style={{ color: map[1], fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Empty({ c, children }: { c: Colors; children: ReactNode }) {
  return <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 18, fontSize: 14 }}>{children}</Text>;
}

export function Heading({ c, children, sub }: { c: Colors; children: ReactNode; sub?: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 }}>{children}</Text>
      {!!sub && <Text style={{ color: c.muted, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

/** Row of choices, one selected (used for request type and leave type). */
export function Choice<T extends string>({ c, value, options, onChange }: { c: Colors; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)}
            style={[s.chip, { borderRadius: c.radius, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primary : c.surface }]}>
            <Text style={{ color: on ? c.primaryFg : c.ink, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const logoImage = require('../assets/splash-icon.png') as number;
export function Logo({ size = 44 }: { size?: number }) {
  return <Image source={logoImage} accessibilityLabel="Seamless Source HR" style={{ width: size, height: size }} resizeMode="contain" />;
}

export const s = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, alignSelf: 'stretch' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  btn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 16, minHeight: 46 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, minHeight: 46 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  notice: { borderWidth: 1, paddingVertical: 11, paddingHorizontal: 14 },
  chip: { borderWidth: 1, paddingVertical: 9, paddingHorizontal: 14 },
});
