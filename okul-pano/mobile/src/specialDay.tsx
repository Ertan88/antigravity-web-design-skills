import { absoluteUrl } from './api.ts';
import { specialDayFor, type ActiveSpecialDay, type SpecialDayArt, type SpecialDaySettings } from '@okulpano/shared/specialDays';
import { shortSchoolName } from '@okulpano/shared/schoolName';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { useAuth } from './auth.tsx';
import { useSchoolInfo } from './data.ts';
import { localIso } from './day.ts';
import { storage } from './storage.ts';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Icon } from './ui.tsx';

/*
 * Özel günler (mobil): ana sayfanın üstünde ince şerit ve kullanıcı başına bir kez açılan mesaj penceresi.
 * Kutlama günlerinde canlı renk ve konfeti, anma günlerinde gri ton ve sade görünüm. Okul panelden kapatabilir,
 * başlık / mesaj / görsel değiştirebilir (Genel Ayarlar › Özel gün mesajları).
 */

/** Bugünün özel günü (okul ayarlarıyla); yoksa null */
export function useSpecialDay(): (ActiveSpecialDay & { signature: string }) | null {
  const info = useSchoolInfo();
  const s = info.data?.settings?.specialDays as Partial<SpecialDaySettings> | undefined;
  if (!info.data) return null;
  const day = specialDayFor(localIso(), s);
  if (!day) return null;
  const school = shortSchoolName(info.data.name, info.data.settings?.schoolType);
  return { ...day, signature: s?.signature?.trim() || `${school} · Okul Müdürlüğü` };
}

function Flag({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * 100) / 150} viewBox="0 0 150 100">
      <Rect width={150} height={100} rx={6} fill="#e30a17" />
      <Circle cx={53.125} cy={50} r={25} fill="#fff" />
      <Circle cx={59.375} cy={50} r={20} fill="#e30a17" />
      <Polygon fill="#fff" points="72.92,50 95.53,57.35 81.55,38.11 81.55,61.89 95.53,42.65" />
    </Svg>
  );
}

const RIBBON = 'M50 6C29 6 20 27 29 49L57 132L72 120L45 53C39 37 43 24 50 24C57 24 61 37 55 53L28 120L43 132L71 49C80 27 71 6 50 6Z';

/**
 * Yas kurdelesi: tek parça siluet. Koyu zeminde seçilsin diye arkada açık renkli kalın bir kontur çizilir, dolgu
 * üstüne gelir; böylece yalnızca dış hat görünür (kesişen kollarda iç çizgi oluşmaz).
 */
function Ribbon({ height, outline }: { height: number; outline?: string }) {
  return (
    <Svg width={(height * 100) / 140} height={height} viewBox="0 0 100 140">
      <Defs>
        <LinearGradient id="rib" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#3a3a3a" />
          <Stop offset="0.5" stopColor="#050505" />
          <Stop offset="1" stopColor="#2a2a2a" />
        </LinearGradient>
      </Defs>
      {outline ? <Path d={RIBBON} fill="none" stroke={outline} strokeWidth={7} strokeLinejoin="round" /> : null}
      <Path fill="url(#rib)" d={RIBBON} />
    </Svg>
  );
}

function Crescent({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={(size * 100) / 120} viewBox="0 0 120 100">
      <Path fill={color} d="M52 8a42 42 0 1 0 34 66A34 34 0 1 1 52 8z" />
      <Polygon fill={color} points="92,30 95.5,40.5 106.5,40.5 97.5,47 101,57.5 92,51 83,57.5 86.5,47 77.5,40.5 88.5,40.5" />
    </Svg>
  );
}

/** Şeritteki küçük işaret */
function SmallMark({ art, fg }: { art: SpecialDayArt; fg: string }) {
  if (art === 'flag') return <Flag width={20} />;
  if (art === 'ribbon') return <Ribbon height={16} outline="rgba(255,255,255,0.75)" />;
  if (art === 'crescent') return <Crescent size={18} color={fg} />;
  return <Icon name={art === 'cap' ? 'school-outline' : 'sunny-outline'} size={15} color={fg} strokeWidth={2.2} />;
}

/** Ana sayfanın üstündeki ince şerit (her rolün ana sayfası) */
export function SpecialDayStrip() {
  const day = useSpecialDay();
  if (!day) return null;
  const { bg, fg } = day.def.colors;
  return (
    <View
      accessibilityRole="text"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bg, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12 }}
    >
      <SmallMark art={day.def.art} fg={fg} />
      <Text style={{ color: fg, fontSize: 11.5, fontWeight: '800', letterSpacing: 1 }} numberOfLines={1}>
        {day.strip.toLocaleUpperCase('tr-TR')}
      </Text>
    </View>
  );
}

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 92}%`, rot: `${(i * 41) % 180}deg`, c: i % 3 }));

/** Pencerenin üstündeki büyük görsel alanı */
function Art({ day }: { day: ActiveSpecialDay }) {
  const celebration = day.def.kind === 'celebration';
  const { bg } = day.def.colors;
  const confetti = celebration && day.def.art !== 'crescent' ? ['#fbbf24', '#ffffff', day.def.art === 'cap' ? '#be123c' : '#fecaca'] : null;
  return (
    <View style={{ height: 170, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {confetti &&
        CONFETTI.map((p, i) => (
          <View
            key={i}
            style={{ position: 'absolute', left: p.left as `${number}%`, top: p.top as `${number}%`, width: 7, height: 12, borderRadius: 2, opacity: 0.85, backgroundColor: confetti[p.c], transform: [{ rotate: p.rot }] }}
          />
        ))}
      {day.imageUrl ? (
        <Image source={{ uri: absoluteUrl(day.imageUrl)! }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : day.def.art === 'flag' ? (
        <View style={{ shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <Flag width={140} />
        </View>
      ) : day.def.art === 'ribbon' ? (
        <Ribbon height={104} outline="rgba(255,255,255,0.7)" />
      ) : day.def.art === 'crescent' ? (
        <Crescent size={110} color="#fde68a" />
      ) : (
        <View style={{ width: 96, height: 96, borderRadius: 30, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={day.def.art === 'cap' ? 'school-outline' : 'sunny-outline'} size={54} color={bg} strokeWidth={1.6} />
        </View>
      )}
    </View>
  );
}

/**
 * Özel gün penceresi: her özel gün (bayram süresince bir kez) kullanıcı başına bir kez açılır. Kapatınca
 * o kutlama için bir daha çıkmaz. Acil durum sürerken açılmaz.
 */
export function SpecialDayPopup() {
  const day = useSpecialDay();
  const { school, me } = useAuth();
  const info = useSchoolInfo();
  const [open, setOpen] = useState(false);
  const key = day && school ? `special-day:${school.id}:${me?.user.id ?? ''}:${day.occurrence}` : null;
  const emergency = Boolean((info.data as { emergency?: unknown } | undefined)?.emergency);

  useEffect(() => {
    if (!key || emergency) return;
    let alive = true;
    void storage.get(key).then((seen) => alive && !seen && setOpen(true));
    return () => {
      alive = false;
    };
  }, [key, emergency]);

  if (!day) return null;
  const close = () => {
    setOpen(false);
    if (key) void storage.set(key, '1');
  };
  const celebration = day.def.kind === 'celebration';
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderRadius: 28, overflow: 'hidden' }}>
          <Art day={day} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={close}
            hitSlop={10}
            style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={17} color="#1c1917" />
          </Pressable>
          <View style={{ padding: 20, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 21, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 }} accessibilityRole="header">
              {day.title}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center' }}>{day.message}</Text>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.faint, letterSpacing: 0.6, marginTop: 4, textAlign: 'center' }}>
              {day.signature.toLocaleUpperCase('tr-TR')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => ({
                alignSelf: 'stretch',
                height: 50,
                borderRadius: 16,
                marginTop: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: celebration ? day.def.colors.bg : colors.primarySoft,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: celebration ? day.def.colors.fg : colors.ink }}>{celebration ? 'Teşekkürler' : 'Kapat'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
