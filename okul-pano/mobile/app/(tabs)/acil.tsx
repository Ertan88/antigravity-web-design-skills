import { EMERGENCY_INFO, EMERGENCY_TYPES, type EmergencyType } from '@okulpano/shared/emergency';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useControlCenter } from '../../src/data.ts';
import { clock } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Card, Chip, Field, Icon, Screen, T, ToggleRow } from '../../src/ui.tsx';

const HOLD_MS = 3000;

/**
 * Acil durum (tasarım 6): tür seçilir, büyük düğmeye 3 saniye basılı tutulur (yanlışlıkla başlamasın).
 * Bütün panolar kırmızı uyarıya geçer, siren çalar, okuldaki herkesin telefonuna bildirim gider.
 */
export default function Acil() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('emergency');
  const center = useControlCenter();
  const active = center.data?.emergency ?? null;
  const [type, setType] = useState<EmergencyType>('earthquake');
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: [school?.id, 'control-center'] });
  const start = async () => {
    setError(null);
    try {
      await api(path, { method: 'POST', body: { type, message: message.trim() || null, sound } });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Başlatılamadı');
    }
  };
  const stop = async () => {
    setError(null);
    try {
      await api(path, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bitirilemedi');
    }
  };

  if (!can('emergency.manage')) {
    return (
      <Screen title="Acil durum" tone="danger">
        <Card>
          <T>Acil durum uyarısını yalnızca yetkili kişiler başlatabilir.</T>
        </Card>
      </Screen>
    );
  }

  if (active) {
    return (
      <Screen title="Acil durum" tone="danger">
        <Card style={{ backgroundColor: colors.danger, borderColor: colors.danger, gap: 6 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.6 }}>UYARI SÜRÜYOR</Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{EMERGENCY_INFO[active.type].label}</Text>
          <Text style={{ color: '#fff', opacity: 0.9 }}>
            {clock(active.startedAt)} · {active.startedBy ?? ''}
          </Text>
          {active.message && <Text style={{ color: '#fff', marginTop: 4 }}>{active.message}</Text>}
        </Card>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <HoldButton label="UYARIYI BİTİR" sub="3 saniye basılı tutun" tone="dark" onComplete={() => void stop()} />
        </View>
        {error && <T color={colors.danger}>{error}</T>}
        <T size={13} color={colors.muted} style={{ textAlign: 'center' }}>
          Bitirince panolar normal görünümüne döner.
        </T>
      </Screen>
    );
  }

  return (
    <Screen title="Acil durum" tone="danger">
      <T color={colors.muted} size={14}>
        Tür seçin. Bütün panolar anında kırmızı uyarıya geçer ve siren çalar.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMERGENCY_TYPES.map((t) => (
          <Chip key={t} label={EMERGENCY_INFO[t].label} selected={t === type} onPress={() => setType(t)} />
        ))}
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <HoldButton label="BASILI TUT" sub="3 saniye" onComplete={() => void start()} />
      </View>
      {error && <T color={colors.danger}>{error}</T>}
      <Field label="Ek mesaj (isteğe bağlı)" value={message} onChangeText={setMessage} maxLength={200} placeholder="ör. Bahçedeki toplanma alanına çıkın" />
      <Card style={{ paddingVertical: 6, gap: 0 }}>
        <ToggleRow label="Sesli uyarı (siren)" value={sound} onChange={setSound} />
      </Card>
      <Card tone="danger" style={{ gap: 4 }}>
        <T weight="700" size={13}>
          Uyarı başlayınca
        </T>
        <T size={13} color={colors.muted}>
          Tüm panolar · okuldaki herkesin telefonuna bildirim · bitirmek için yine basılı tutulur
        </T>
      </Card>
    </Screen>
  );
}

/** Basılı tutunca dolan halka: süre dolmadan bırakılırsa iptal olur */
function HoldButton({ label, sub, onComplete, tone = 'red' }: { label: string; sub: string; onComplete: () => void; tone?: 'red' | 'dark' }) {
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const begin = () => {
    setHolding(true);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      setHolding(false);
      progress.setValue(0);
      onComplete();
    }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };
  const bg = tone === 'red' ? colors.danger : '#1c1917';
  const ring = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ width: 220, height: 220, borderRadius: 110, backgroundColor: tone === 'red' ? colors.dangerSoft : colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ring, backgroundColor: tone === 'red' ? '#f8b4b4' : '#9ca3af' }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${sub}`}
        onPressIn={begin}
        onPressOut={cancel}
        style={{ width: 172, height: 172, borderRadius: 86, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon name="warning" size={36} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{holding ? 'TUTMAYA DEVAM' : label}</Text>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.9 }}>{sub}</Text>
      </Pressable>
    </View>
  );
}
