import { resolveLayout, type BoardLayout } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LayoutEditor } from '../../components/LayoutEditor.tsx';
import { SaveBar } from '../../components/SaveBar.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Modal, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type Screen } from '../../lib/data.ts';

/**
 * Bir panoya özel kart düzeni (ör. kantindeki panoda yalnızca duyurular ve zil).
 * Kapalıyken pano okulun varsayılan düzenini kullanır.
 */
export function ScreenLayoutPanel({ screen, editable, onDone }: { screen: Screen; editable: boolean; onDone?: () => void }) {
  const { schoolId } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const schoolLayout = school.data ? resolveLayout(school.data.settings) : null;
  const [custom, setCustom] = useState(Boolean(screen.layout));
  const [layout, setLayout] = useState<BoardLayout | null>(screen.layout ?? schoolLayout);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCustom(Boolean(screen.layout));
    setLayout(screen.layout ?? schoolLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id, screen.layout]);

  const dirty = custom !== Boolean(screen.layout) || (custom && JSON.stringify(layout) !== JSON.stringify(screen.layout));

  const save = async () => {
    setSaving(true);
    try {
      await api(`${path}/${screen.id}`, { method: 'PUT', body: { name: screen.name, location: screen.location, layout: custom ? layout : null } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'screens'] });
      toast.success(custom ? `${screen.name} için özel düzen kaydedildi` : `${screen.name} okulun varsayılan düzenini kullanacak`);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Toggle
          checked={custom}
          onChange={(x) => {
            setCustom(x);
            if (x && !layout && schoolLayout) setLayout(schoolLayout);
          }}
          label={`${screen.name} panosuna özel düzen`}
          description="Kapalıyken okulun varsayılan düzeni kullanılır."
        />
        {editable && onDone && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onDone}>
              Vazgeç
            </Button>
            <Button disabled={!dirty} loading={saving} onClick={() => void save()}>
              Kaydet
            </Button>
          </div>
        )}
      </div>
      {layout && <LayoutEditor value={custom ? layout : (schoolLayout ?? layout)} onChange={setLayout} disabled={!custom || !editable} />}
      {!onDone && (
        <SaveBar
          show={editable && dirty}
          saving={saving}
          onSave={() => void save()}
          onCancel={() => {
            setCustom(Boolean(screen.layout));
            setLayout(screen.layout ?? schoolLayout);
          }}
        />
      )}
    </div>
  );
}

export function ScreenLayoutDialog({ screen, onClose }: { screen: Screen | null; onClose: () => void }) {
  const { can } = useAuth();
  return (
    <Modal open={Boolean(screen)} onClose={onClose} size="xl" title={`${screen?.name ?? ''} · pano düzeni`} description="Bu panoda hangi kartların nerede görüneceği">
      {screen && <ScreenLayoutPanel screen={screen} editable={can('screens.manage')} onDone={onClose} />}
    </Modal>
  );
}
