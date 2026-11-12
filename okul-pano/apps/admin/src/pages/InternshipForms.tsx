import { mondayOf, trDate } from "@okulpano/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown } from "../components/icons.tsx";
import { useToast } from "../components/Toast.tsx";
import { Alert, Button, Field, Input, Modal, MonthPicker, Spinner } from "../components/ui.tsx";
import { api, downloadFile } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolPath } from "../lib/data.ts";

/*
 * İşletmelerde mesleki eğitim formları: günlük rehberlik formu (hafta), aylık devam-devamsızlık çizelgesi ve aylık
 * rehberlik raporu (ay). Görev tarihleri işletmenin görev gününden gelir; PDF'te her form A5, ikisi bir A4'te.
 */

export const VISIT_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
const VISIT_SHORT = ["Pt", "Sa", "Ça", "Pe", "Cu"];

/** Görev günü seçimi: haftada bir gün; seçili güne yeniden basınca kalkar */
export function VisitDayPicker({
  value,
  editable,
  onChange,
}: {
  value: number | null;
  editable: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Görev günü">
      {VISIT_SHORT.map((d, i) => {
        const on = value === i + 1;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            title={VISIT_DAYS[i]}
            disabled={!editable}
            onClick={() => onChange(on ? null : i + 1)}
            className={clsx(
              "grid size-7 place-items-center rounded-lg border text-[11px] font-extrabold transition-colors",
              on
                ? "border-ink bg-ink text-surface"
                : "border-slate-200 bg-surface text-slate-400",
              editable && !on && "hover:border-slate-400 hover:text-slate-700",
              !editable && "cursor-default",
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

type FormType = "daily" | "attendance" | "report";

interface FormItem {
  id: string;
  name: string;
  coordinatorName: string | null;
  students: number;
  visitWeekday: number | null;
  date?: string | null;
  holiday?: string | null;
  dates?: string[];
}

interface FormsData {
  settings: { programName: string; district: string; city: string; canEdit: boolean };
  monday?: string;
  friday?: string;
  month?: string;
  items: FormItem[];
}

const TYPES: { id: FormType; label: string }[] = [
  { id: "daily", label: "Günlük rehberlik formu" },
  { id: "attendance", label: "Aylık devam çizelgesi" },
  { id: "report", label: "Aylık rehberlik raporu" },
];

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const weekText = (mon: string, fri: string) =>
  mon.slice(5, 7) === fri.slice(5, 7)
    ? `${Number(mon.slice(8, 10))}–${dayMonth(fri)} ${fri.slice(0, 4)}`
    : `${dayMonth(mon)} – ${dayMonth(fri)} ${fri.slice(0, 4)}`;

export function FormsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship");
  const toast = useToast();
  const [type, setType] = useState<FormType>("daily");
  const [week, setWeek] = useState(() => mondayOf(localToday()));
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const daily = type === "daily";
  const q = useQuery({
    queryKey: [schoolId, "internship", "forms", daily ? "daily" : "monthly", daily ? week : month],
    queryFn: () => api<FormsData>(`${path}/forms?type=${daily ? "daily" : "report"}&${daily ? `week=${week}` : `month=${month}`}`),
    enabled: open,
  });
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const usable = (b: FormItem) => (daily ? Boolean(b.date) : Boolean(b.dates?.length));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Varsayılan seçim: görevi olan ve tatile denk gelmeyenler
  useEffect(() => {
    setPicked(new Set(items.filter((b) => usable(b) && !b.holiday).map((b) => b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const shown = items.filter(usable).sort((a, b) => (daily ? (a.date ?? '').localeCompare(b.date ?? '') : 0));
  const noDay = items.filter((b) => !b.visitWeekday).length;
  const chosen = shown.filter((b) => picked.has(b.id));
  const formCount =
    type === "attendance" ? chosen.reduce((n, b) => n + Math.max(1, Math.ceil(b.students / 5)), 0) : chosen.length;
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const period = daily ? `week=${week}` : `month=${month}`;
      const label = daily
        ? `Günlük Rehberlik Formu ${trDate(week)}`
        : `${type === "attendance" ? "Aylık Devam Çizelgesi" : "Aylık Rehberlik Raporu"} ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
      await downloadFile(`${path}/forms.pdf?type=${type}&${period}&ids=${chosen.map((b) => b.id).join(",")}`, `${label}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Form yazdır"
      description="Her form A5 boyutundadır; iki form bir A4 kâğıda sığar. Yazdırırken ölçeği “Gerçek boyut” (%100) seçin."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon={<FileDown className="size-4" />} loading={busy} disabled={!formCount} onClick={() => void download()}>
            PDF indir{formCount ? ` · ${formCount} form, ${Math.ceil(formCount / 2)} sayfa` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={clsx(
                "flex-1 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors",
                type === t.id ? "bg-ink text-surface" : "text-slate-600 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {daily ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" aria-label="Önceki hafta" icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(week, -7))} />
            <span className="min-w-44 text-center text-sm font-bold">{weekText(week, addDays(week, 4))}</span>
            <Button variant="secondary" size="sm" aria-label="Sonraki hafta" icon={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(week, 7))} />
          </div>
        ) : (
          <div className="w-60">
            <MonthPicker value={month} onChange={setMonth} />
          </div>
        )}

        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <Alert tone="red">{q.error.message}</Alert>
        ) : !shown.length ? (
          <Alert>
            {items.length
              ? daily
                ? "Bu hafta görev günü olan işletme yok."
                : "Bu ayda görev tarihi olan işletme yok."
              : "Henüz işletme yok."}
          </Alert>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
            {shown.map((b) => {
              const on = picked.has(b.id);
              return (
                <li key={b.id} className={clsx(b.holiday && "bg-red-50 dark:bg-red-500/10")}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (on) n.delete(b.id);
                          else n.add(b.id);
                          return n;
                        })
                      }
                      className="size-4 accent-ink"
                    />
                    {daily && (
                      <span className="w-28 shrink-0 text-sm font-extrabold">
                        {trDate(b.date).slice(0, 5)} {VISIT_DAYS[(b.visitWeekday ?? 1) - 1]}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-bold">{b.name}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {b.coordinatorName ?? "Koordinatör seçilmedi"} · {b.students} öğrenci
                      </span>
                      {b.holiday && <span className="block text-xs font-semibold text-red-700 dark:text-red-300">Tatil: {b.holiday}</span>}
                      {!daily && (
                        <span className="block text-xs text-slate-500">
                          Görev tarihleri: {b.dates!.map((d) => Number(d.slice(8, 10))).join(", ")} {MONTHS[Number(month.slice(5, 7)) - 1]}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {noDay > 0 && (
          <p className="text-xs text-slate-500">
            Görev günü seçilmemiş {noDay} işletme listede yok. Görev günü İşletmeler tablosundan seçilir.
          </p>
        )}
        {type === "attendance" && (
          <p className="text-xs text-slate-500">
            Çizelgeye İşletmede Devam sayfasındaki işaretler aktarılır; kontrol edilmemiş (?) günler boş kalır. Bir çizelgeye 5 öğrenci sığar.
          </p>
        )}
        {q.data && <FormSettings settings={q.data.settings} />}
      </div>
    </Modal>
  );
}

/** Formlardaki okul satırı: program adı ve ilçe (yönetim değiştirir) */
function FormSettings({ settings }: { settings: FormsData["settings"] }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship");
  const qc = useQueryClient();
  const toast = useToast();
  const [programName, setProgramName] = useState(settings.programName);
  const [district, setDistrict] = useState(settings.district);
  useEffect(() => {
    setProgramName(settings.programName);
    setDistrict(settings.district);
  }, [settings.programName, settings.district]);
  const save = useMutation({
    mutationFn: () => api(`${path}/form-settings`, { method: "PUT", body: { programName, district } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, "internship", "forms"] });
      toast.success("Form bilgileri kaydedildi");
    },
    onError: (e) => toast.error(e.message),
  });
  const dirty = programName !== settings.programName || district !== settings.district;
  if (!settings.canEdit)
    return (
      <p className="text-xs text-slate-500">
        Okul satırı: {settings.programName || "program adı yok"} · {[settings.district, settings.city].filter(Boolean).join("/") || "ilçe girilmemiş"}
      </p>
    );
  return (
    <details className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/10">
      <summary className="cursor-pointer text-sm font-bold">Form bilgileri</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Program adı" help="Günlük formda okul adının yanına yazılır.">
          {(id) => <Input id={id} value={programName} maxLength={80} onChange={(e) => setProgramName(e.target.value)} />}
        </Field>
        <Field label="İlçe" help={`Raporda “İlçe/${settings.city || "İl"}” olarak yazılır.`}>
          {(id) => <Input id={id} value={district} maxLength={60} onChange={(e) => setDistrict(e.target.value)} />}
        </Field>
        <Button variant="secondary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()} className="sm:mb-6">
          Kaydet
        </Button>
      </div>
    </details>
  );
}
