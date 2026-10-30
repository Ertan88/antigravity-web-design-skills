import { useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Text } from '../src/text.tsx';
import { DEFAULT_SERVER, normalizeServer } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
// Marka kutusu temadan bağımsızdır (koyu turkuaz); üzerindeki etiketler her iki temada açık pastel renklerle
import { colors, LIGHT_TILES, type TileTone } from '../src/theme.ts';
import { Button, Card, Field, Icon, Screen, T, type IconName } from '../src/ui.tsx';

const FEATURES: { label: string; icon: IconName; tone: TileTone }[] = [
  { label: 'Duyurular', icon: 'megaphone', tone: 'sun' },
  { label: 'Nöbetler', icon: 'shield-checkmark', tone: 'mint' },
  { label: 'Panolar', icon: 'tv', tone: 'sky' },
];

/**
 * Giriş: yalnızca e-posta ve şifre. Sunucu adresi uygulamaya derlemede verilir (EXPO_PUBLIC_API_URL); web sürümünde
 * açıldığı adrestir. Kendi sunucusunu kuran okullar için "Farklı sunucu" ile değiştirilebilir.
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
    if (!email.trim() || !password) return setError('E-posta ve şifrenizi yazın.');
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
      <View style={{ gap: 22, paddingTop: 16 }}>
        {/* Marka kutusu: açılış ekranıyla aynı renk; logo, slogan ve uygulamanın renkli etiketleri */}
        <View style={{ backgroundColor: '#0E5E66', borderRadius: 28, padding: 22, gap: 14, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={require('../assets/icon.png')} style={{ width: 40, height: 40, borderRadius: 12 }} accessibilityIgnoresInvertColors />
            <Text style={{ fontSize: 21, fontWeight: '800', letterSpacing: -0.6, color: '#fff' }}>
              okul<Text style={{ color: '#F5B83D' }}>yayın</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.9, color: '#fff' }}>
            Okulunuzun her anı,{'\n'}
            <Text style={{ color: 'rgba(255,255,255,0.6)' }}>tek ekranda.</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {FEATURES.map((f) => (
              <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: LIGHT_TILES[f.tone].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Icon name={f.icon} size={13} color={LIGHT_TILES[f.tone].fg} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: LIGHT_TILES[f.tone].fg }}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Card style={{ gap: 14 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink }} accessibilityRole="header">
              Giriş yapın
            </Text>
            <T color={colors.muted} size={13.5}>
              Okulunuzun verdiği e-posta ve şifreyle.
            </T>
          </View>
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
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
          />
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
              style={{ paddingRight: 52 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
              onPress={() => setShow((s) => !s)}
              style={{ position: 'absolute', right: 4, top: 26, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
          {error && (
            <T color={colors.danger} weight="600" size={14}>
              {error}
            </T>
          )}
          <Button size="lg" loading={busy} onPress={() => void submit()}>
            Giriş yap
          </Button>
        </Card>

        <View style={{ alignItems: 'center', gap: 2 }}>
          {Boolean(server.trim()) && (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${normalizeServer(server)}/admin/kayit`)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Okulunuz için hesap yok mu? <Text style={{ color: colors.ink, fontWeight: '700' }}>Ücretsiz deneyin</Text>
              </Text>
            </Pressable>
          )}
          {!editServer && (
            <Pressable accessibilityRole="button" onPress={() => setEditServer(true)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ color: colors.faint, fontSize: 12.5 }}>Farklı sunucu</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}
