import { SUPPORT_KINDS, type SupportTicket } from '@okulpano/shared/issues';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { IconName } from './icons.tsx';
import { StatusPill, timeText } from './issues.tsx';
import { Text } from './text.tsx';
import { colors, tiles, type TileTone } from './theme.ts';
import { Icon } from './ui.tsx';

export const KIND_LOOK: Record<SupportTicket['kind'], { icon: IconName; tone: TileTone }> = {
  problem: { icon: 'bug', tone: 'rose' },
  suggestion: { icon: 'bulb', tone: 'sun' },
  question: { icon: 'help-circle-outline', tone: 'sky' },
};

/** Destek talebi satırı: okul ekranında ve platform listesinde ortak */
export function TicketRow({ t, platform }: { t: SupportTicket; platform?: boolean }) {
  const look = KIND_LOOK[t.kind];
  const tile = tiles[look.tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(platform ? `/talep/${t.id}?p=1` : `/talep/${t.id}`)}
      style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tile.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={look.icon} size={20} color={tile.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {t.subject}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
            {SUPPORT_KINDS[t.kind]} · {platform ? `${t.schoolName} · ` : ''}
            {t.userName} · {timeText(t.updatedAt)}
          </Text>
        </View>
        <StatusPill status={t.status} />
      </View>
      {t.lastMessage ? (
        <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={2}>
          {t.lastMessage}
        </Text>
      ) : null}
    </Pressable>
  );
}
