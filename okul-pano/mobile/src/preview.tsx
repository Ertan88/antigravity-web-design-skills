import { DESIGN_PALETTES, designTemplate, type AnnouncementDesign } from '@okulpano/shared/designs';
import { Image, View } from 'react-native';
import { Text } from './text.tsx';
import { absoluteUrl } from './api.ts';
import type { Announcement } from './data.ts';
import { Icon } from './ui.tsx';

/** Panodaki slaytın küçük önizlemesi (şablonlu duyuru, fotoğraflı duyuru ya da düz metin) */
export function AnnouncementPreview({
  kind,
  title,
  body,
  imageUrl,
  design,
  height = 170,
}: Pick<Announcement, 'kind' | 'title' | 'body' | 'imageUrl'> & { design: AnnouncementDesign | null; height?: number }) {
  if (kind === 'image' && imageUrl) {
    return (
      <View style={{ height, backgroundColor: '#0b1220' }}>
        <Image source={{ uri: absoluteUrl(imageUrl)! }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel={title} />
      </View>
    );
  }
  if (kind === 'design' && design) {
    const t = designTemplate(design.template);
    const p = DESIGN_PALETTES[design.palette] ?? DESIGN_PALETTES.petrol;
    const head = design.fields[t.headline.key]?.trim() || t.headline.placeholder;
    const sub = t.subline ? design.fields[t.subline.key]?.trim() : '';
    const info = t.info.map((f) => design.fields[f.key]?.trim()).filter(Boolean);
    return (
      <View style={{ height, backgroundColor: p.from, padding: 14, justifyContent: 'space-between' }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: p.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: p.from }}>{t.kicker.toLocaleUpperCase('tr-TR')}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', lineHeight: 23 }} numberOfLines={2}>
            {head}
          </Text>
          {sub ? <Text style={{ color: p.accent, fontSize: 14, fontWeight: '700' }}>{sub}</Text> : null}
          {info.length > 0 && (
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12 }} numberOfLines={1}>
              {info.join(' · ')}
            </Text>
          )}
        </View>
        <Text style={{ color: '#fff', opacity: 0.7, fontSize: 10 }}>Panodaki görünüm</Text>
      </View>
    );
  }
  return (
    <View style={{ height, backgroundColor: '#0d4f66', padding: 14, justifyContent: 'center', gap: 6 }}>
      <Icon name="megaphone-outline" size={26} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }} numberOfLines={2}>
        {title}
      </Text>
      {body ? (
        <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }} numberOfLines={2}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
