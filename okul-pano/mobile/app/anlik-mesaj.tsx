import { FLASH_STYLE_LABEL, FLASH_STYLES, type FlashStyle } from '@okulpano/shared/control';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useFlash, useMeToday, useScreens } from '../src/data.ts';
import { clock, teacherDay } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Button, Card, Chip, Choice, Field, Icon, Screen, SectionTitle, T, ToggleRow } from '../src/ui.tsx';

type Duration = '10' | 'lesson' | 'day' | '60';

/**
 * Panoya hemen yaz (tasarım 9): onaya takılmadan seçilen süre boyunca panolarda görünür, süre bitince kalkar.
 * Hazır mesajlar okulun kendi geçmişinden gelir (en sık kullanılanlar); koda gömülü metin yoktur.
 */
export default function AnlikMesaj() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('flash');
  const flash = useFlash();
  const screens = useScreens();
  const today = useMeToday();
  const [text, setText] = useState('');
  const [style, setStyle] = useState<FlashStyle>('banner');
  const [duration, setDuration] = useState<Duration>('lesson');
  const [warning, setWarning] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "1 ders": şu anki dersin (ya da teneffüsün) bitişine kadar; ders yoksa 40 dakika
  const endsAt = (): string => {
    const now = new Date();
    if (duration === '10') return new Date(now.getTime() + 10 * 60_000).toISOString();
    if (duration === '60') return new Date(now.getTime() + 60 * 60_000).toISOString();
    if (duration === 'day') {
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      return end.toISOString();
    }
    const day = today.data ? teacherDay(today.data, now) : null;
    const remaining = day && (day.bell.kind === 'lesson' || day.bell.kind === 'break') ? day.bell.remainingSec : 40 * 60;
    return new Date(now.getTime() + Math.max(5 * 60, remaining) * 1000).toISOString();
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { text: text.trim(), style, tone: warning ? 'warning' : 'info', endsAt: endsAt(), screenIds: selected.length ? selected : null } });
      await Promise.all(['flash', 'control-center'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yayınlanamadı');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await api(`${path}/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await Promise.all(['flash', 'control-center'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
  };

  if (!can('board.control')) {
    return (
      <Screen back title="Panoya hemen yaz">
        <Card>
          <T>Bu işlem için "Panoları uzaktan yönetme" yetkisi gerekir.</T>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Panoya hemen yaz"
      footer={
        <>
          {error && <T color={colors.danger}>{error}</T>}
          <Button size="lg" loading={busy} disabled={text.trim().length < 2} onPress={() => void publish()}>
            Şimdi yayınla
          </Button>
        </>
      }
    >
      <T color={colors.muted} size={14}>
        Onaya takılmadan, seçtiğiniz süre boyunca panolarda görünür. Süre bitince kendiliğinden kalkar.
      </T>

      {(flash.data?.active.length ?? 0) > 0 && (
        <Card tone="primary" style={{ gap: 8 }}>
          <T size={12} weight="700" color="#fff">
            ŞU AN PANOLARDA
          </T>
          {flash.data!.active.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T color="#fff" weight="700" style={{ flex: 1 }}>
                {f.text} <T color="#fff" size={12}>· {clock(f.endsAt)}'e kadar</T>
              </T>
              <Button size="sm" variant="secondary" onPress={() => void remove(f.id)}>
                Kaldır
              </Button>
            </View>
          ))}
        </Card>
      )}

      <Field label="Mesaj" value={text} onChangeText={setText} multiline maxLength={200} placeholder="ör. 10-B öğrencileri 4. derste konferans salonuna" />

      {(flash.data?.presets.length ?? 0) > 0 && (
        <View style={{ gap: 8 }}>
          <T size={13} weight="600">
            Daha önce gönderdikleriniz
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {flash.data!.presets.map((p) => (
              <Chip key={p} label={p} onPress={() => setText(p)} />
            ))}
          </View>
        </View>
      )}

      <SectionTitle>Görünüm</SectionTitle>
      <Choice value={style} onChange={setStyle} options={FLASH_STYLES.map((s) => ({ value: s, label: FLASH_STYLE_LABEL[s] }))} columns={3} />

      <SectionTitle>Ne kadar süre</SectionTitle>
      <Choice
        value={duration}
        onChange={setDuration}
        options={[
          { value: '10', label: '10 dk' },
          { value: 'lesson', label: 'Bu ders' },
          { value: '60', label: '1 saat' },
          { value: 'day', label: 'Bugün' },
        ]}
        columns={4}
      />

      <Card style={{ paddingVertical: 6, gap: 0 }}>
        <ToggleRow label="Uyarı rengi" description="Turuncu zemin: önemli / acil olmayan uyarılar için" value={warning} onChange={setWarning} />
      </Card>

      <SectionTitle>Panolar</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Tüm panolar" icon={selected.length ? undefined : 'checkmark'} selected={!selected.length} onPress={() => setSelected([])} />
        {(screens.data ?? []).map((s) => {
          const on = selected.includes(s.id);
          return <Chip key={s.id} label={s.name} selected={on} onPress={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])} />;
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="information-circle-outline" size={16} color={colors.muted} />
        <T size={12} color={colors.muted} style={{ flex: 1 }}>
          Gerçek bir tehlikede bunun yerine Acil durum ekranını kullanın: panolarda siren çalar ve herkesin telefonuna bildirim gider.
        </T>
      </View>
    </Screen>
  );
}
