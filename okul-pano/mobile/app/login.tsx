import { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import { Text } from '../src/text.tsx';
import { DEFAULT_SERVER, normalizeServer } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Button, Card, Field, Icon, Screen, T, type IconName } from '../src/ui.tsx';

/** Logodaki marka rengi (yazı logosunda "yayın") */
const BRAND = colors.brand;

const FEATURES: { label: string; icon: IconName; tone: TileTone }[] = [
  { label: 'Duyurular', icon: 'megaphone', tone: 'sun' },
  { label: 'Panolar', icon: 'tv', tone: 'sky' },
  { label: 'Nöbetler', icon: 'shield-checkmark', tone: 'mint' },
];

/**
 * Giriş: panel hesabıyla, yalnızca e-posta ve şifre. Sunucu adresi uygulamaya derlemede verilir (EXPO_PUBLIC_API_URL);
 * web sürümünde açıldığı adrestir. Kendi sunucusunu kuran okullar için "Farklı sunucu" ile değiştirilebilir.
 */
export default function Login() {
  const { signIn, server: saved } = useAuth();
  const [server, setServer] = useState(saved || DEFAULT_SERVER);
  const [editServer, setEditServer] = useState(!(saved || DEFAULT_SERVER));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!server.trim()) {
      setEditServer(true);
      return setError('Sunucu adresini yazın (Okulyayın panelini açtığınız adres).');
    }
    setBusy(true);
    try {
      await signIn(server, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 18, paddingTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('../assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 14 }} accessibilityIgnoresInvertColors />
          <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.ink }} accessibilityRole="header">
            okul<Text style={{ color: BRAND }}>yayın</Text>
          </Text>
        </View>
        <Text style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, color: colors.ink }}>
          Okulunuzun her anı,<Text style={{ color: colors.subtle }}>{'\n'}tek ekranda.</Text>
        </Text>
        {/* Uygulamanın ne yaptığını üç renkli kutuyla anlatır */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FEATURES.map((f) => (
            <View key={f.label} style={{ flex: 1, backgroundColor: tiles[f.tone].bg, borderRadius: 20, padding: 12, gap: 18 }}>
              <Icon name={f.icon} size={20} color={tiles[f.tone].fg} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: tiles[f.tone].fg }}>{f.label}</Text>
            </View>
          ))}
        </View>
        <T color={colors.muted} size={14}>
          Panel hesabınızla giriş yapın. Hesabınız yoksa okul yöneticinizden isteyin.
        </T>

        <Card>
          {editServer && (
            <Field
              label="Sunucu adresi"
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="ör. pano.okulunuz.k12.tr"
              help="Okulyayın panelini açtığınız adres"
            />
          )}
          <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" />
          <View>
            <Field
              label="Şifre"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
              onPress={() => setShow((s) => !s)}
              style={{ position: 'absolute', right: 6, top: 26, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
          {error && (
            <T color={colors.danger} weight="600" size={14}>
              {error}
            </T>
          )}
          <Button size="lg" loading={busy} disabled={!email || !password} onPress={() => void submit()}>
            Giriş yap
          </Button>
        </Card>
        {Boolean(server.trim()) && (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${normalizeServer(server)}/admin/kayit`)}
            style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
          >
            <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>
              Okulunuz Okulyayın kullanmıyor mu? <Text style={{ color: colors.ink, fontWeight: '800', textDecorationLine: 'underline' }}>Web'den ücretsiz deneyin</Text>
            </Text>
          </Pressable>
        )}
        {!editServer && (
          <Pressable accessibilityRole="button" onPress={() => setEditServer(true)} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Okulunuzun kendi sunucusu mu var? <Text style={{ color: colors.ink, fontWeight: '800', textDecorationLine: 'underline' }}>Farklı sunucu</Text>
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
