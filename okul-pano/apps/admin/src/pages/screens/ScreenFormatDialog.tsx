import { resolveScreenDisplay, type ScreenDisplay } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Grid2x2, Images, LayoutDashboard, RectangleHorizontal, RectangleVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BoardPreview } from '../../components/BoardPreview.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Field, Modal, Segmented, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath, type Screen } from '../../lib/data.ts';

const MODES: { value: ScreenDisplay['mode']; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'board', label: 'Tam pano', description: 'Duyurular, nöbet, zil, dersler…', icon: LayoutDashboard },
  { value: 'slides', label: 'Yalnızca duyurular', description: 'Tam ekran slayt, köşede saat', icon: Images },
  { value: 'wall', label: 'Video duvarı', description: 'Birden çok TV tek büyük ekran', icon: Grid2x2 },
];

/** Ekran biçimi özeti (pano kartında) */
export function formatLabel(d: ScreenDisplay): string {
  const o = d.orientation === 'portrait' ? 'Dikey' : 'Yatay';
  if (d.mode === 'slides') return `${o} · Yalnızca duyurular`;
  if (d.mode === 'wall') return `Video duvarı ${d.wallCols}×${d.wallRows} · ${d.wallRow * d.wallCols + d.wallCol + 1}. TV`;
  return `${o} · Tam pano`;
}

/** Panonun ekran biçimi: yatay / dikey TV, yalnızca duyurular ya da video duvarının bir parçası */
export function ScreenFormatDialog({ screen, onClose }: { screen: Screen | null; onClose: () => void }) {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('screens.manage');
  const [d, setD] = useState<ScreenDisplay>(resolveScreenDisplay(screen?.display));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (screen) setD(resolveScreenDisplay(screen.display));
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
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
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
            {d.mode === 'wall' && (
              <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sütun (yan yana TV)">
                    {(id) => (
                      <Select id={id} value={d.wallCols} disabled={!editable} onChange={(e) => set({ wallCols: Number(e.target.value) })}>
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Satır (üst üste TV)">
                    {(id) => (
                      <Select id={id} value={d.wallRows} disabled={!editable} onChange={(e) => set({ wallRows: Number(e.target.value) })}>
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">Bu TV duvarın neresinde? (tıklayın)</div>
                  <div className="grid w-fit gap-1.5" style={{ gridTemplateColumns: `repeat(${d.wallCols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: d.wallRows * d.wallCols }, (_, i) => {
                      const col = i % d.wallCols;
                      const row = Math.floor(i / d.wallCols);
                      const active = col === d.wallCol && row === d.wallRow;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!editable}
                          onClick={() => set({ wallCol: col, wallRow: row })}
                          className={clsx(
                            'flex items-center justify-center rounded-md text-xs font-bold transition',
                            d.orientation === 'portrait' ? 'h-16 w-9' : 'h-9 w-16',
                            active ? 'bg-brand-500 text-white shadow' : 'bg-surface text-slate-400 ring-1 ring-slate-200 hover:ring-brand-300',
                          )}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Duvardaki her TV'yi ayrı bir pano olarak ekleyin ve burada yerini seçin. Slaytlar saate bağlı aktığı için bütün TV'ler aynı anda aynı slaytı gösterir.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Önizleme {dirty && <span className="text-xs font-normal text-amber-600">· kaydedince güncellenir</span>}</div>
            <BoardPreview screenId={screen.id} compact portrait={resolveScreenDisplay(screen.display).orientation === 'portrait' && resolveScreenDisplay(screen.display).mode !== 'wall'} />
          </div>
        </div>
      )}
    </Modal>
  );
}
