import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { DEFAULT_SERVER } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Field, Icon, Screen, T } from '../src/ui.tsx';

/** Giriş: okulun panel hesabıyla. Sunucu adresi kurulumdan kuruluma değişir; web sürümünde kendiliğinden dolar. */
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
    if (!server.trim()) return setError('Sunucu adresini yazın (okulunuzun Okul Pano adresi).');
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
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="tv-outline" size={36} color="#fff" />
          </View>
          <T size={26} weight="800">
            Okul Pano
          </T>
          <T color={colors.muted} style={{ textAlign: 'center' }}>
            Panel hesabınızla giriş yapın. Hesabınız yoksa okul yöneticinizden isteyin.
          </T>
        </View>

        <Card>
          {editServer ? (
            <Field
              label="Sunucu adresi"
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="ör. pano.okulunuz.k12.tr"
              help="Okul Pano yönetim panelini açtığınız adres"
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setEditServer(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="server-outline" size={18} color={colors.muted} />
              <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }} numberOfLines={1}>
                {server.replace(/^https?:\/\//, '')}
              </Text>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Değiştir</Text>
            </Pressable>
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
      </KeyboardAvoidingView>
    </Screen>
  );
}
