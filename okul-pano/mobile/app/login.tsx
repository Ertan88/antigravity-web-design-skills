import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { DEFAULT_SERVER } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Field, Icon, Screen, T } from '../src/ui.tsx';

/** Logodaki marka rengi (pano + okul'un ortak "o" harfi) */
const BRAND = '#0E5E66';

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
      return setError('Sunucu adresini yazın (Panokul panelini açtığınız adres).');
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 18, paddingTop: 32 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Image source={require('../assets/icon.png')} style={{ width: 76, height: 76, borderRadius: 20 }} accessibilityIgnoresInvertColors />
          <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.ink }} accessibilityRole="header">
            pan<Text style={{ color: BRAND }}>o</Text>kul
          </Text>
          <T color={colors.muted} style={{ textAlign: 'center' }}>
            Panel hesabınızla giriş yapın. Hesabınız yoksa okul yöneticinizden isteyin.
          </T>
        </View>

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
              help="Panokul panelini açtığınız adres"
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
        {!editServer && (
          <Pressable accessibilityRole="button" onPress={() => setEditServer(true)} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Okulunuzun kendi sunucusu mu var? <Text style={{ color: colors.primary, fontWeight: '700' }}>Farklı sunucu</Text>
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
