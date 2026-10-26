import { DAY_MODE_INFO, DAY_MODES, dayPlanLabel, type DayMode } from '@okulpano/shared/control';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useDayPlan, useMeToday, useNow } from '../src/data.ts';
import { teacherDay } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Choice, Field, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

/**
 * Bugünün modu (tasarım 11): tek dokunuşla bütün panoları ve zil saatlerini bugüne göre ayarlar
 * (kısaltılmış gün, sınav, tören, okul tatil); zil kaydırma. Yarın kendiliğinden normale döner.
 */
export default function GunModu() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('day-plan');
  const plan = useDayPlan();
  const today = useMeToday();
  const now = useNow(30_000);
  const [mode, setMode] = useState<DayMode>('normal');
  const [lessonMin, setLessonMin] = useState('30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!plan.data) return;
    setMode(plan.data.mode);
    setLessonMin(String(plan.data.lessonMin ?? 30));
    setNote(plan.data.note ?? '');
  }, [plan.data]);

  const refresh = () => Promise.all(['day-plan', 'control-center', 'me/today'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      await refresh();
      setMessage(ok);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  };

  if (!can('schedule.manage')) {
    return (
      <Screen back title="Bugünün modu">
        <Card>
          <T>Bu işlem için "Zil saatleri ve ders programı" yetkisi gerekir.</T>
        </Card>
      </Screen>
    );
  }
  const label = dayPlanLabel(plan.data);
  const day = today.data ? teacherDay(today.data, now) : null;
  const current = day && (day.bell.kind === 'lesson' || day.bell.kind === 'break') ? day.bell : null;

  return (
    <Screen
      back
      title="Bugünün modu"
      footer={
        <>
          {message && (
            <T size={13} color={colors.muted} style={{ textAlign: 'center' }}>
              {message}
            </T>
          )}
          <Button
            size="lg"
            loading={busy === 'apply'}
            onPress={() =>
              void run(
                'apply',
                () => api(path, { method: 'PUT', body: { mode, note: note.trim() || null, lessonMin: mode === 'short' ? Number(lessonMin) || 30 : null } }),
                `${DAY_MODE_INFO[mode].label} uygulandı · yarın kendiliğinden normale döner`,
              )
            }
          >
            Uygula
          </Button>
        </>
      }
    >
      <T color={colors.muted} size={14}>
        Tek dokunuşla bütün panoları ve zil saatlerini bugüne göre ayarlayın. Yarın kendiliğinden normale döner.
      </T>
      {plan.isLoading ? (
        <Loading />
      ) : (
        <>
          {label && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={13} color={colors.muted}>
                Şu an:
              </T>
              <Badge tone="primary">{label}</Badge>
            </View>
          )}
          <Choice value={mode} onChange={setMode} columns={1} options={DAY_MODES.map((m) => ({ value: m, label: DAY_MODE_INFO[m].label, description: DAY_MODE_INFO[m].description }))} />
          {mode === 'short' && <Field label="Ders süresi (dakika)" value={lessonMin} onChangeText={setLessonMin} keyboardType="number-pad" maxLength={2} />}
          <Field label="Panoda görünecek not (isteğe bağlı)" value={note} onChangeText={setNote} maxLength={80} placeholder="ör. Tören 10.00'da bahçede" />

          <SectionTitle>Zili kaydır</SectionTitle>
          <Card style={{ gap: 10 }}>
            <T size={13} color={colors.muted}>
              {current
                ? `Şu andan sonraki bütün zil saatleri kayar (ör. tören uzadı). Süren ${current.kind === 'lesson' ? 'dersin' : 'teneffüsün'} bitişi de kayar.`
                : 'Şu andan sonraki bütün zil saatleri kayar (ör. tören uzadı).'}
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[-5, 5, 10, 15].map((m) => (
                <Button
                  key={m}
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1, paddingHorizontal: 4 }}
                  loading={busy === `shift${m}`}
                  onPress={() => void run(`shift${m}`, () => api(`${path}/shift`, { method: 'POST', body: { minutes: m } }), `Zil saatleri ${m > 0 ? '+' : '−'}${Math.abs(m)} dk kaydırıldı`)}
                >
                  {m > 0 ? `+${m}` : `−${Math.abs(m)}`} dk
                </Button>
              ))}
            </View>
            {(plan.data?.shifts.length ?? 0) > 0 && (
              <T size={12} color={colors.muted}>
                Bugünkü kaydırmalar: {plan.data!.shifts.map((s) => `${s.from} ${s.minutes > 0 ? '+' : '−'}${Math.abs(s.minutes)} dk`).join(', ')}
              </T>
            )}
          </Card>

          {(plan.data?.mode !== 'normal' || (plan.data?.shifts.length ?? 0) > 0) && (
            <Button variant="ghost" loading={busy === 'reset'} onPress={() => void run('reset', () => api(path, { method: 'DELETE' }), 'Gün normale döndü')}>
              Normale döndür
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
