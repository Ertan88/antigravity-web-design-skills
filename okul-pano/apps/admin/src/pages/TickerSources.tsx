import { quoteOfDay, todayInHistory, type SchoolSettings } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Rss, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SaveBar } from '../components/SaveBar.tsx';
import { useToast } from '../components/Toast.tsx';
import { Card, IconButton, Input, Toggle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';

type Sources = Pick<SchoolSettings, 'tickerHistory' | 'tickerQuote' | 'tickerWeatherAlerts' | 'rssFeeds'>;

const pick = (s: SchoolSettings): Sources => ({
  tickerHistory: s.tickerHistory,
  tickerQuote: s.tickerQuote,
  tickerWeatherAlerts: s.tickerWeatherAlerts,
  rssFeeds: s.rssFeeds,
});

/**
 * Kayan yazının ek kaynakları: hava durumu uyarıları, "Bugün tarihte", günün sözü ve RSS başlıkları
 * (ör. MEB ya da il millî eğitim duyuruları). Okulun kendi metinleriyle birlikte akar.
 */
export function TickerSources() {
  const { schoolId, can } = useAuth();
  const school = useSchool();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('settings.manage');
  const [v, setV] = useState<Sources | null>(null);
  useEffect(() => {
    if (school.data) setV(pick(school.data.settings));
  }, [school.data]);
  const save = useMutation({
    mutationFn: (settings: Sources) => api<School>(path, { method: 'PATCH', body: { settings } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      toast.success('Kayan yazı kaynakları kaydedildi');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!school.data || !v) return null;
  const dirty = JSON.stringify(v) !== JSON.stringify(pick(school.data.settings));
  const today = new Date();
  const md = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const history = todayInHistory(md);
  const quote = quoteOfDay(today.toISOString().slice(0, 10));
  const setFeed = (i: number, patch: Partial<Sources['rssFeeds'][number]>) =>
    setV({ ...v, rssFeeds: v.rssFeeds.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink">Ek kaynaklar</h2>
      <p className="mb-4 text-sm text-slate-500">Okulun metinleriyle birlikte kayan yazıda akar.{!editable && ' Değiştirmek için okul ayarları yetkisi gerekir.'}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Toggle
            checked={v.tickerWeatherAlerts}
            onChange={(x) => editable && setV({ ...v, tickerWeatherAlerts: x })}
            label="Hava durumu uyarıları"
            description="Yoğun kar (olası kar tatili), aşırı sıcak / soğuk, fırtına: bugün ve yarın için, en başta akar."
          />
          <Toggle
            checked={v.tickerHistory}
            onChange={(x) => editable && setV({ ...v, tickerHistory: x })}
            label="Bugün tarihte"
            description={history.length ? `Bugün: ${history.join(' · ')}` : 'O güne kayıtlı önemli bir olay yoksa bir şey eklenmez.'}
          />
          <Toggle checked={v.tickerQuote} onChange={(x) => editable && setV({ ...v, tickerQuote: x })} label="Günün sözü" description={`Bugün: “${quote.text}” — ${quote.by}`} />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <Rss className="size-4 text-orange-500" /> RSS başlıkları
          </div>
          <p className="mb-3 text-xs text-slate-500">
            MEB, il / ilçe millî eğitim müdürlüğü ya da okulunuzun sitesindeki RSS adresini ekleyin. Başlıklar 30 dakikada bir yenilenir; “Kaynak · başlık” olarak akar.
          </p>
          <div className="space-y-2">
            {v.rssFeeds.map((f, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-32 shrink-0" value={f.label} maxLength={30} disabled={!editable} placeholder="MEB" onChange={(e) => setFeed(i, { label: e.target.value })} aria-label="Kaynak adı" />
                <Input value={f.url} disabled={!editable} placeholder="https://…/rss.xml" onChange={(e) => setFeed(i, { url: e.target.value.trim() })} aria-label="RSS adresi" />
                {editable && (
                  <IconButton label="Kaldır" onClick={() => setV({ ...v, rssFeeds: v.rssFeeds.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
            ))}
            {editable && v.rssFeeds.length < 5 && (
              <button
                type="button"
                onClick={() => setV({ ...v, rssFeeds: [...v.rssFeeds, { label: v.rssFeeds.length ? '' : 'MEB', url: '' }] })}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                <Plus className="size-4" /> RSS kaynağı ekle
              </button>
            )}
          </div>
        </div>
      </div>
      <SaveBar
        show={editable && dirty}
        saving={save.isPending}
        onSave={() => save.mutate({ ...v, rssFeeds: v.rssFeeds.filter((f) => f.url) })}
        onCancel={() => setV(pick(school.data!.settings))}
      />
    </Card>
  );
}
