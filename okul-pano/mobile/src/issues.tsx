import type { IssueCategory, IssueMessage } from '@okulpano/shared/issues';
import { View } from 'react-native';
import type { IconName } from './icons.tsx';
import { Text } from './text.tsx';
import { colors, tiles, type TileTone } from './theme.ts';

/*
 * Okul sorunları ve destek talepleri için ortak mobil parçalar: kategori simgeleri, durum rozetleri, yazışma.
 * Tipler ve şemalar @okulpano/shared/issues'tan gelir.
 */

export const CATEGORY_LOOK: Record<IssueCategory, { icon: IconName; tone: TileTone }> = {
  repair: { icon: 'tool', tone: 'peach' },
  cleaning: { icon: 'spray', tone: 'mint' },
  heating: { icon: 'temperature', tone: 'rose' },
  electric: { icon: 'bolt', tone: 'sun' },
  it: { icon: 'wifi', tone: 'sky' },
  security: { icon: 'shield-outline', tone: 'lilac' },
  water: { icon: 'droplet', tone: 'sky' },
  furniture: { icon: 'desk', tone: 'paper' },
  other: { icon: 'dots', tone: 'paper' },
};

export const STATUS_LOOK: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: 'Yeni', bg: colors.dangerSoft, fg: colors.danger },
  in_progress: { label: 'İşlemde', bg: colors.warningSoft, fg: colors.warning },
  resolved: { label: 'Çözüldü', bg: colors.successSoft, fg: colors.success },
  answered: { label: 'Yanıtlandı', bg: colors.warningSoft, fg: colors.warning },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_LOOK[status] ?? STATUS_LOOK.new!;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '800', color: s.fg }}>{s.label}</Text>
    </View>
  );
}

export const tileOf = (c: IssueCategory) => tiles[CATEGORY_LOOK[c].tone];

export function timeText(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (days < 1 && d.getDate() === new Date().getDate()) return `Bugün ${hm}`;
  if (days < 2) return `Dün ${hm}`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(d);
}

/** Yazışma balonları: kendi mesajı sağda koyu, karşı tarafınki solda; sistem satırları ortada soluk */
export function ThreadView({ messages }: { messages: IssueMessage[] }) {
  return (
    <View style={{ gap: 8 }}>
      {messages.map((m) =>
        m.system ? (
          <Text key={m.id} style={{ textAlign: 'center', fontSize: 11.5, color: colors.faint }}>
            {m.body} · {timeText(m.at)}
          </Text>
        ) : (
          <View
            key={m.id}
            style={{
              maxWidth: '86%',
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              backgroundColor: m.mine ? colors.primary : colors.card,
              borderWidth: m.mine ? 0 : 1,
              borderColor: colors.border,
              borderRadius: 16,
              borderBottomRightRadius: m.mine ? 5 : 16,
              borderBottomLeftRadius: m.mine ? 16 : 5,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: m.mine ? colors.onPrimary : colors.muted, opacity: 0.75, marginBottom: 2 }}>
              {m.userName} · {timeText(m.at)}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: m.mine ? colors.onPrimary : colors.ink }}>{m.body}</Text>
          </View>
        ),
      )}
    </View>
  );
}
