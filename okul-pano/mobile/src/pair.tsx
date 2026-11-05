import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';
import { colors } from './theme.ts';
import { Button, Card, Field, T } from './ui.tsx';

/** QR'daki adres ya da düz kod → 6 karakterlik eşleştirme kodu ("okulpano://eslestir/K7M2QX") */
export function codeFromQr(data: string): string | null {
  const m = /eslestir\/([A-Za-z0-9]{6})\b/.exec(data) ?? /^\s*([A-Za-z0-9]{6})\s*$/.exec(data);
  return m ? m[1]!.toUpperCase() : null;
}

/** Yeni pano: televizyonda görünen 6 haneli kodla eşleştirme */
export function PairCard({ initialCode, onDone }: { initialCode?: string; onDone?: () => void }) {
  const { school } = useAuth();
  const path = useSchoolPath('screens/pair');
  const qc = useQueryClient();
  const [open, setOpen] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Platform.OS !== 'web' && (
          <Button icon="qr-code-outline" style={{ flex: 1 }} onPress={() => router.push('/qr')}>
            QR ile bağla
          </Button>
        )}
        <Button variant="secondary" icon="keypad-outline" style={{ flex: 1 }} onPress={() => setOpen(true)}>
          Kodla bağla
        </Button>
      </View>
    );
  }
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { code, name } });
      await qc.invalidateQueries({ queryKey: [school?.id, 'screens'] });
      setOpen(false);
      setCode('');
      setName('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlanamadı');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 12 }}>
      <T weight="700">Yeni pano bağla</T>
      <T size={13} color={colors.muted}>
        {initialCode ? 'Kod QR’dan okundu. Panoya bir ad verin.' : 'Televizyonda pano adresini açın; ekranda görünen 6 haneli kodu yazın.'}
      </T>
      <Field
        label="Ekrandaki kod"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={7}
        placeholder="ör. K7M2QX"
      />
      <Field label="Pano adı" value={name} onChangeText={setName} placeholder="ör. Giriş holü" maxLength={60} />
      {error && <T color={colors.danger}>{error}</T>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="secondary" style={{ flex: 1 }} onPress={() => (onDone ? onDone() : setOpen(false))}>
          Vazgeç
        </Button>
        <Button style={{ flex: 1 }} loading={busy} disabled={code.length < 6 || !name.trim()} onPress={() => void submit()}>
          Bağla
        </Button>
      </View>
    </Card>
  );
}
