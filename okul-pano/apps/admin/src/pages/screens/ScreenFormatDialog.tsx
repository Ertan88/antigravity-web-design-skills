import { compareClassNames, MIN_SMOOTH_WEBVIEW, resolveScreenDisplay, type ScreenDisplay, errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Images, LayoutDashboard, RectangleHorizontal, RectangleVertical, type LucideIcon } from '../../components/icons.tsx';
import { useEffect, useState } from 'react';
import { BoardPreview } from '../../components/BoardPreview.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Field, Modal, Segmented } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, useSchoolPath, type ClassGroup, type Screen } from '../../lib/data.ts';

const MODES: { value: ScreenDisplay['mode']; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'board', label: 'Tam pano', description: 'Duyurular, nöbet, zil, dersler…', icon: LayoutDashboard },
  { value: 'slides', label: 'Yalnızca duyurular', description: 'Tam ekran slayt, köşede saat', icon: Images },
  { value: 'clock', label: 'Tam ekran saat', description: 'Büyük saat, tarih ve zil durumu', icon: Clock },
];

const ANIMATIONS: { value: ScreenDisplay['animations']; label: string; description: string }[] = [
  { value: 'auto', label: 'Otomatik', description: "TV'nin tarayıcı bileşeni güncelse açık, eskiyse hafif" },
  { value: 'on', label: 'Açık', description: 'Her zaman bütün animasyonlar' },
  { value: 'lite', label: 'Hafif', description: 'Kayan yazı ve video takılmasın diye kapalı' },
];

/** Panonun şu anki durumu: WebView sürümü ve hafif modda olup olmadığı (TV açıksa) */
function animationNow(live: Screen['live']): string | null {
  if (!live || live.lite === undefined) return null;
  const v = live.webview ? `WebView ${live.webview}${live.webview < MIN_SMOOTH_WEBVIEW ? ' (eski)' : ''}` : 'WebView sürümü bilinmiyor';
  return `Bu pano şu an: ${v} · animasyonlar ${live.lite ? 'kapalı (hafif mod)' : 'açık'}`;
}

/** Ekran biçimi özeti (pano kartında) */
export function formatLabel(d: ScreenDisplay): string {
  const o = d.orientation === 'portrait' ? 'Dikey' : 'Yatay';
  if (d.mode === 'slides') return `${o} · Yalnızca duyurular`;
  if (d.mode === 'clock') return `${o} · Tam ekran saat`;
  return `${o} · Tam pano`;
}

/** Panonun ekran biçimi: yatay / dikey TV, tam pano ya da yalnızca duyurular */
export function ScreenFormatDialog({ screen, onClose }: { screen: Screen | null; onClose: () => void }) {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('screens.manage');
  const [d, setD] = useState<ScreenDisplay>(resolveScreenDisplay(screen?.display));
  const [saving, setSaving] = useState(false);
  const classes = useList<ClassGroup>('classes');
  const sortedClasses = [...(classes.data ?? [])].sort((a, b) => compareClassNames(a.name, b.name));

  // Çoğu okulda pano bütün okulu gösterir; sınıf çipleri yalnızca "Yalnızca bazı sınıflar" seçilince açılır
  const [someClasses, setSomeClasses] = useState(() => resolveScreenDisplay(screen?.display).classIds.length > 0);

  useEffect(() => {
    if (screen) {
      setD(resolveScreenDisplay(screen.display));
      setSomeClasses(resolveScreenDisplay(screen.display).classIds.length > 0);
    }
  }, [screen]);

  const set = (patch: Partial<ScreenDisplay>) => setD((x) => resolveScreenDisplay({ ...x, ...patch }));
  const dirty = screen ? JSON.stringify(d) !== JSON.stringify(resolveScreenDisplay(screen.display)) : false;

  const save = async () => {
    if (!screen) return;
    setSaving(true);
    try {
      await api(`${path}/${screen.id}`, { method: 'PUT', body: { name: screen.name, location: screen.location, display: d } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'screens'] });
      toast.success(`${screen.name}: ekran biçimi kaydedildi`);
    } catch (err) {
      toast.error(errorText(err, 'Kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(screen)}
      onClose={onClose}
      size="xl"
      title={`${screen?.name ?? ''} · ekran biçimi`}
      description="TV'nin yönü ve bu panoda ne gösterileceği"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {editable && (
            <Button disabled={!dirty} loading={saving} onClick={() => void save()}>
              Kaydet
            </Button>
          )}
        </>
      }
    >
      {screen && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <Field label="TV'nin yönü">
              {() => (
                <Segmented
                  value={d.orientation}
                  onChange={(x) => set({ orientation: x })}
                  options={[
                    {
                      value: 'landscape',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <RectangleHorizontal className="size-4" /> Yatay
                        </span>
                      ),
                    },
                    {
                      value: 'portrait',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <RectangleVertical className="size-4" /> Dikey
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </Field>
            <Field label="Gösterim">
              {() => (
                <div className="grid gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      disabled={!editable}
                      onClick={() => set({ mode: m.value })}
                      className={clsx(
                        'flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition',
                        d.mode === m.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300',
                      )}
                    >
                      <span className={clsx('flex size-9 items-center justify-center rounded-lg', d.mode === m.value ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500')}>
                        <m.icon className="size-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-ink">{m.label}</span>
                        <span className="block text-xs text-slate-500">{m.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Animasyonlar" help={animationNow(screen.live) ?? 'Slayt ve kart geçişleri, "Şu an derste" çubuğundaki parıltı ve duyuruların altındaki ilerleme çubuğu.'}>
              {() => (
                <div className="grid gap-2 sm:grid-cols-3">
                  {ANIMATIONS.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      disabled={!editable}
                      aria-pressed={d.animations === a.value}
                      onClick={() => set({ animations: a.value })}
                      className={clsx('rounded-xl p-3 text-left ring-1 transition', d.animations === a.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300')}
                    >
                      <span className="block text-sm font-semibold text-ink">
                        {a.label}
                        {a.value === 'auto' && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-px text-[10.5px] font-bold text-emerald-700 dark:bg-[#14301f] dark:text-[#4ade80]">önerilen</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{a.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field
              label="Bu panoda gösterilen sınıflar"
              help={
                someClasses
                  ? 'Dersler ve zil yalnızca seçili sınıflara göre gösterilir (ör. aynı binadaki ortaokul ya da ayrı bir blok).'
                  : 'Pano bütün okulun derslerini ve zilini gösterir. Birden fazla bina ya da kademe varsa yalnızca bazı sınıfları seçebilirsiniz.'
              }
            >
              {() => (
                <div className="space-y-2">
                  <Segmented
                    value={someClasses ? 'some' : 'all'}
                    onChange={(v) => {
                      if (!editable) return;
                      setSomeClasses(v === 'some');
                      if (v === 'all') set({ classIds: [] });
                    }}
                    options={[
                      { value: 'all', label: 'Bütün okul' },
                      { value: 'some', label: 'Yalnızca bazı sınıflar' },
                    ]}
                  />
                  {someClasses && (
                    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                      {sortedClasses.map((c) => {
                        const on = d.classIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!editable}
                            aria-pressed={on}
                            onClick={() => set({ classIds: on ? d.classIds.filter((x) => x !== c.id) : [...d.classIds, c.id] })}
                            className={clsx('rounded-full px-3 py-1 text-xs font-bold transition', on ? 'bg-ink text-surface' : 'bg-surface text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300')}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                      {!sortedClasses.length && <span className="text-xs text-slate-500">Sınıf yok.</span>}
                    </div>
                  )}
                  {someClasses && !d.classIds.length && sortedClasses.length > 0 && (
                    <p className="text-xs font-medium text-amber-600">Sınıf seçilmedi; pano bütün okulu gösterir.</p>
                  )}
                </div>
              )}
            </Field>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Önizleme {dirty && <span className="text-xs font-normal text-amber-600">· kaydedince güncellenir</span>}</div>
            <BoardPreview screenId={screen.id} compact portrait={resolveScreenDisplay(screen.display).orientation === 'portrait'} />
          </div>
        </div>
      )}
    </Modal>
  );
}
