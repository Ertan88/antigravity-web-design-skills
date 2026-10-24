import { resolveLayout, type BoardLayout } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LayoutEditor } from '../../components/LayoutEditor.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Modal, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type Screen } from '../../lib/data.ts';

/** Bir panoya özel kart düzeni (ör. kantindeki panoda yalnızca duyurular ve zil) */
export function ScreenLayoutDialog({ screen, onClose }: { screen: Screen | null; onClose: () => void }) {
  const { schoolId } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const schoolLayout = school.data ? resolveLayout(school.data.settings) : null;
  const [custom, setCustom] = useState(false);
  const [layout, setLayout] = useState<BoardLayout | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!screen) return;
    setCustom(Boolean(screen.layout));
    setLayout(screen.layout ?? schoolLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const save = async () => {
    if (!screen) return;
    setSaving(true);
    try {
      await api(`${path}/${screen.id}`, { method: 'PUT', body: { name: screen.name, location: screen.location, layout: custom ? layout : null } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'screens'] });
      toast.success(custom ? `${screen.name} için özel düzen kaydedildi` : `${screen.name} okulun varsayılan düzenini kullanacak`);
      onClose();
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
      title={`${screen?.name ?? ''} · pano düzeni`}
      description="Bu panoda hangi kartların nerede görüneceği"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Toggle
          checked={custom}
          onChange={(x) => {
            setCustom(x);
            if (x && !layout && schoolLayout) setLayout(schoolLayout);
          }}
          label="Bu panoya özel düzen"
          description="Kapalıyken okulun varsayılan düzeni kullanılır (Pano düzeni sekmesi)."
        />
        {layout && <LayoutEditor value={custom ? layout : (schoolLayout ?? layout)} onChange={setLayout} disabled={!custom} />}
      </div>
    </Modal>
  );
}
