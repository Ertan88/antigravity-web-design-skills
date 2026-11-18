import { View } from 'react-native';
import { formatTL, Kurus } from '../core/money';
import { AppText } from './primitives';

/** Fiziksel kart görünümü — kart listesi, detay ve kart ekleme ekranında ortak. */
export function CardVisual({
  name,
  last4,
  color,
  cutDay,
  dueDay,
  limit,
  used,
}: {
  name: string;
  last4: string;
  color: string;
  cutDay: number;
  dueDay: number;
  limit: Kurus;
  used?: Kurus;
}) {
  const usage = limit && used !== undefined ? Math.min(1, used / limit) : null;
  return (
    <View style={{ borderRadius: 22, backgroundColor: color, padding: 18, gap: 14, overflow: 'hidden', minHeight: 170, justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', right: -50, top: -70, width: 210, height: 210, borderRadius: 105, borderWidth: 30, borderColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name || 'Kart adı'}
        </AppText>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
          <AppText variant="caption" color="#FFFFFF" style={{ fontSize: 11 }}>
            Kesim {cutDay} · Son ödeme {dueDay}
          </AppText>
        </View>
      </View>
      <AppText variant="money" color="#FFFFFF" style={{ fontSize: 18, letterSpacing: 2.5 }}>
        •••• •••• •••• {last4 || '0000'}
      </AppText>
      {usage !== null ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color="#FFFFFF">
              Kullanılan {formatTL(used!)}
            </AppText>
            <AppText variant="caption" color="#FFFFFF">
              Limit {formatTL(limit)}
            </AppText>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <View style={{ width: `${usage * 100}%`, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
          </View>
        </View>
      ) : (
        <AppText variant="caption" color="#FFFFFF">
          {limit ? `Limit ${formatTL(limit)}` : ' '}
        </AppText>
      )}
    </View>
  );
}
