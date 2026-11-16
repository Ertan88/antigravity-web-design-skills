import { useEffect, useState } from 'react';
import { deviceAccount } from './api.ts';
import { Modal, Pressable, View } from 'react-native';
import type { SavedAccount } from './accounts.ts';
import { useAuth } from './auth.tsx';
import { Sheet } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors, radius } from './theme.ts';
import { Avatar, confirm, DeleteIconButton, Icon, T } from './ui.tsx';

/** Hesap türü rozeti: platform ve okul hesabı (KVKK: ikisi ayrı hesaptır) */
export function AccountKind({ kind }: { kind: SavedAccount['kind'] }) {
  const platform = kind === 'platform';
  return (
    <View style={{ backgroundColor: platform ? colors.infoSoft : colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: platform ? colors.info : colors.success }}>{platform ? 'Platform' : 'Okul'}</Text>
    </View>
  );
}

/** Tek hesap satırı: dokununca o hesaba geçilir; etkin hesap işaretli */
export function AccountRow({ a, active, busy, unread, onPress, onForget }: { a: SavedAccount; active: boolean; busy?: boolean; unread?: number; onPress: () => void; onForget?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active, busy }}
        accessibilityLabel={`${a.fullName}, ${a.kind === 'platform' ? 'platform hesabı' : 'okul hesabı'}, ${a.email}${active ? ', etkin hesap' : ''}`}
        onPress={onPress}
        disabled={active || busy}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: active ? colors.borderStrong : 'transparent',
          backgroundColor: active ? colors.card : pressed ? colors.primarySoft : 'transparent',
          opacity: busy ? 0.6 : 1,
        })}
      >
        <Avatar name={a.fullName} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
              {a.fullName}
            </Text>
            <AccountKind kind={a.kind} />
          </View>
          <T size={12.5} color={colors.muted} lines={1}>
            {a.email}
          </T>
          {a.kind === 'school' && a.detail ? (
            <T size={12.5} color={colors.faint} lines={2}>
              {a.detail}
            </T>
          ) : null}
          {!active && !a.refresh && (
            <T size={12} weight="700" color={colors.warning}>
              Oturum kapalı · şifreyle giriş gerekir
            </T>
          )}
        </View>
        {!active && unread ? (
          <View accessibilityLabel={`${unread} okunmamış bildirim`} style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>{unread > 99 ? '99+' : String(unread)}</Text>
          </View>
        ) : null}
        {active && <Icon name="checkmark" size={20} color={colors.ink} strokeWidth={3} />}
      </Pressable>
      {!active && onForget && <DeleteIconButton label={`${a.email} bu telefondan kaldırılsın`} onPress={onForget} />}
    </View>
  );
}

/**
 * Hesaplar (hızlı hesap geçişi A): bu telefonda kayıtlı hesaplar. Birine dokununca şifre sormadan geçilir;
 * "Hesap ekle" etkin hesabı saklayıp giriş ekranını açar.
 */
export function AccountsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, accounts, switchAccount, addAccount, forgetAccount } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = me?.user.id;
  // Açık olmayan hesapların okunmamış bildirim sayısı (sayfa her açıldığında)
  const [unread, setUnread] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    for (const a of accounts) {
      if (a.userId === activeId || !a.refresh) continue;
      void deviceAccount(a.server, a.refresh, 'summary')
        .then((r) => setUnread((m) => ({ ...m, [a.userId]: r.unread ?? 0 })))
        .catch(() => undefined);
    }
  }, [open, accounts, activeId]);
  const list = [...accounts].sort((a, b) => (a.userId === activeId ? -1 : b.userId === activeId ? 1 : 0));

  const go = async (a: SavedAccount) => {
    setError(null);
    if (!a.refresh) {
      onClose();
      await addAccount();
      return;
    }
    setBusy(a.userId);
    try {
      await switchAccount(a.userId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hesaba geçilemedi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Hesaplar</Text>
      <View style={{ gap: 4 }}>
        {list.map((a) => (
          <AccountRow
            key={`${a.server}|${a.userId}`}
            a={a}
            active={a.userId === activeId}
            busy={busy === a.userId}
            unread={unread[a.userId]}
            onPress={() => void go(a)}
            onForget={() =>
              void confirm('Hesap bu telefondan kaldırılsın mı?', `${a.email} listeden çıkar. Hesap silinmez; yeniden eklemek için şifreyle giriş yapılır.`, 'Kaldır').then(
                (ok) => {
                  if (ok) void forgetAccount(a.userId);
                },
              )
            }
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            void addAccount();
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: pressed ? colors.primarySoft : 'transparent' })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.subtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="add" size={22} color={colors.muted} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>Hesap ekle</Text>
        </Pressable>
      </View>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 6 }}>
          {error}
        </T>
      )}
      <T size={12} color={colors.faint} style={{ marginTop: 10 }}>
        Hesaplar yalnızca bu telefonda kayıtlıdır. Platform ve okul işlemleri birbirine karışmaz. Telefonunuzda ekran kilidi açık olsun.
      </T>
    </Sheet>
  );
}

/** Hesap değişirken ekranı kaplayan kısa bilgi: hangi hesaba geçildiği açıkça görünür */
export function SwitchingOverlay() {
  const { switching } = useAuth();
  if (!switching) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View accessibilityLiveRegion="polite" style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <Avatar name={switching.fullName} size={72} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{switching.fullName}</Text>
        <AccountKind kind={switching.kind} />
        <T color={colors.muted} style={{ textAlign: 'center' }}>
          {switching.kind === 'platform' ? 'Platform hesabına geçiliyor…' : 'Okul hesabına geçiliyor…'}
        </T>
        {switching.kind === 'school' && switching.detail ? (
          <T size={13} color={colors.faint} style={{ textAlign: 'center' }}>
            {switching.detail}
          </T>
        ) : null}
      </View>
    </Modal>
  );
}
