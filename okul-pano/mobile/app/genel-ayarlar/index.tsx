import { router } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../src/auth.tsx';
import { useInternshipAccess } from '../../src/data.ts';
import { SearchBox } from '../../src/internshipManage.tsx';
import { SETTINGS_CATEGORIES } from '../../src/settingsCategories.ts';
import { Card, Empty, ListRow, Screen } from '../../src/ui.tsx';

/**
 * Genel ayarlar (mobil, A): webdeki Genel Ayarlar'ın kategori listesi. Kategoriye dokununca kendi ekranı açılır.
 * Her kategori o işin yetkisi olana görünür: ayar yetkisi bütün kategorileri, koordinatör müdür yardımcısı yalnızca
 * Mesleki eğitim'i görür.
 */
export default function GenelAyarlar() {
  const { can, role, school, me } = useAuth();
  const internship = useInternshipAccess();
  const [q, setQ] = useState('');
  const full = can('settings.manage');
  // Destek erişimini yalnızca okul müdürü verir (destek erişimiyle girilen okulda ve platform hesabında çıkmaz)
  const ownerHere = role === 'owner' && !school?.support && !me?.user.isSuperAdmin;
  const list = SETTINGS_CATEGORIES.filter((c) => (c.key === 'mesleki' ? full || Boolean(internship.data?.manage) : c.key === 'destek' ? full && ownerHere : full));
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const shown = needle ? list.filter((c) => `${c.title} ${c.keywords}`.toLocaleLowerCase('tr-TR').includes(needle)) : list;
  return (
    <Screen back title="Genel ayarlar" subtitle="Okulun ayarları">
      <SearchBox value={q} onChange={setQ} placeholder="Ayar ara" />
      {!list.length ? (
        <Empty icon="key-outline" title="Yetkiniz yok" text="Okul ayarlarını okul müdürü ve ayar yetkisi verilen kişiler değiştirir." />
      ) : !shown.length ? (
        <Empty icon="search" title="Aramaya uyan ayar yok" />
      ) : (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {shown.map((c, i) => (
            <ListRow
              key={c.key}
              tile={{ icon: c.icon, tone: c.tone }}
              title={c.title}
              subtitle={c.hint}
              onPress={() => router.push((c.key === 'destek' ? '/destek' : `/genel-ayarlar/${c.key}`) as never)}
              last={i === shown.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
