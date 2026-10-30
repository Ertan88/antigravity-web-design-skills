import { useState } from 'react';
import { changePassword } from '../../src/api.ts';
import { colors } from '../../src/theme.ts';
import { Button, Field, Screen, T } from '../../src/ui.tsx';

/** Şifre değiştir: diğer cihazlardaki oturumlar kapanır, bu telefon açık kalır */
export default function Sifre() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (next.length < 8) return setMessage({ ok: false, text: 'Yeni şifre en az 8 karakter olmalı.' });
    if (next !== again) return setMessage({ ok: false, text: 'Yeni şifreler aynı değil.' });
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setMessage({ ok: true, text: 'Şifreniz değişti. Diğer cihazlarda yeniden giriş yapmanız gerekecek.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Değiştirilemedi' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Şifre değiştir"
      footer={
        <>
          {message && (
            <T size={13} weight="600" color={message.ok ? colors.success : colors.danger} style={{ textAlign: 'center' }}>
              {message.text}
            </T>
          )}
          <Button size="lg" loading={busy} disabled={!current || !next} onPress={() => void save()}>
            Şifreyi değiştir
          </Button>
        </>
      }
    >
      <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field
        label="Yeni şifre"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        help="En az 8 karakter; harf, rakam ve işaret karışık olursa daha güçlü olur."
      />
      <Field label="Yeni şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
    </Screen>
  );
}
