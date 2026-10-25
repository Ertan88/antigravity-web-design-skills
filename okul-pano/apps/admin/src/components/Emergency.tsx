import { EMERGENCY_INFO, EMERGENCY_TYPES, type EmergencyType } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CloudLightning, Flame, Lock, LogOut, OctagonAlert, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { timeAgo } from '../lib/format.ts';
import { useToast } from './Toast.tsx';
import { Button, Field, Input, Modal, Toggle } from './ui.tsx';

interface ActiveEmergency {
  type: EmergencyType;
  message: string | null;
  sound: boolean;
  startedAt: string;
  startedBy: string | null;
}

const ICONS: Record<EmergencyType, LucideIcon> = {
  earthquake: CloudLightning,
  fire: Flame,
  evacuation: LogOut,
  lockdown: Lock,
  custom: OctagonAlert,
};

/** Okulun etkin acil durumu; paneldeki herkes görür, sık yoklanır */
function useEmergency() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [schoolId, 'emergency'],
    queryFn: () => api<ActiveEmergency | null>(`/api/schools/${schoolId}/emergency`),
    enabled: Boolean(schoolId),
    refetchInterval: 10_000,
  });
}

function useEmergencyMutations() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'emergency'] });
  const start = useMutation({
    mutationFn: (body: { type: EmergencyType; message: string | null; sound: boolean }) => api(`/api/schools/${schoolId}/emergency`, { method: 'POST', body }),
    onSuccess: () => {
      refresh();
      toast.success('Acil durum uyarısı bütün panolarda yayında');
    },
    onError: (e) => toast.error(e.message),
  });
  const stop = useMutation({
    mutationFn: () => api(`/api/schools/${schoolId}/emergency`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Acil durum sona erdi; panolar normale döndü');
    },
    onError: (e) => toast.error(e.message),
  });
  return { start, stop };
}

/** Üst bardaki kırmızı düğme: acil durum başlatma penceresi */
export function EmergencyButton() {
  const { can, schoolId } = useAuth();
  const active = useEmergency();
  const { start } = useEmergencyMutations();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EmergencyType>('earthquake');
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(true);
  if (!schoolId || !can('emergency.manage') || active.data) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-bold text-white shadow-[0_1px_2px_rgba(220,38,38,0.4)] transition hover:bg-red-700"
      >
        <Siren className="size-4" />
        <span className="hidden sm:inline">Acil durum</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Acil durum uyarısı"
        description="Bütün panolar anında tam ekran kırmızı uyarıya geçer; siz bitirene kadar öyle kalır."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              icon={<Siren className="size-4" />}
              loading={start.isPending}
              onClick={() =>
                start.mutate(
                  { type, message: message.trim() || null, sound },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setMessage('');
                    },
                  },
                )
              }
            >
              Bütün panolarda başlat
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EMERGENCY_TYPES.map((x) => {
              const Icon = ICONS[x];
              return (
                <button
                  key={x}
                  type="button"
                  onClick={() => setType(x)}
                  className={clsx(
                    'flex flex-col items-center gap-2 rounded-xl p-3 text-sm font-semibold ring-1 transition',
                    type === x ? 'bg-red-50 text-red-700 ring-2 ring-red-500' : 'text-slate-600 ring-slate-200 hover:ring-slate-300',
                  )}
                >
                  <Icon className="size-6" />
                  {EMERGENCY_INFO[x].label}
                </button>
              );
            })}
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <div className="mb-1 font-bold text-red-700">{EMERGENCY_INFO[type].title}</div>
            {EMERGENCY_INFO[type].instructions.join(' · ')}
          </div>
          <Field label="Ek mesaj (isteğe bağlı)" help="ör. Toplanma alanı: arka bahçe">
            {(id) => <Input id={id} value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} />}
          </Field>
          <Toggle
            checked={sound}
            onChange={setSound}
            label="Sesli uyarı (siren)"
            description="Panoya bağlı hoparlörden siren çalar. Tarayıcının otomatik oynatma izni gerekir (Panolar sayfasındaki kiosk komutu)."
          />
        </div>
      </Modal>
    </>
  );
}

/** Acil durum yayındayken panelin en üstünde kırmızı bant */
export function EmergencyBanner() {
  const { can } = useAuth();
  const active = useEmergency();
  const { stop } = useEmergencyMutations();
  const e = active.data;
  if (!e) return null;
  return (
    <div className="bg-red-600 text-white">
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-2 font-bold">
          <TriangleAlert className="size-5 animate-pulse" />
          ACİL DURUM YAYINDA: {EMERGENCY_INFO[e.type].title}
        </span>
        <span className="text-sm text-red-100">
          {e.message && <>“{e.message}” · </>}
          {e.startedBy ?? 'Bir yönetici'} · {timeAgo(e.startedAt)} başlattı{e.sound ? ' · siren açık' : ''}
        </span>
        {can('emergency.manage') && (
          <button
            type="button"
            disabled={stop.isPending}
            onClick={() => stop.mutate()}
            className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow transition hover:bg-red-50 disabled:opacity-60"
          >
            Acil durumu bitir
          </button>
        )}
      </div>
    </div>
  );
}
