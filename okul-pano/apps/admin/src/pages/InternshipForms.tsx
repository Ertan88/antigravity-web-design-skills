import { mondayOf, trDate } from "@okulpano/shared";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Printer } from "../components/icons.tsx";
import { useToast } from "../components/Toast.tsx";
import { Link, useNavigate } from "react-router-dom";
import { choose } from "../components/confirm.tsx";
import { Alert, Button, MonthPicker, PageHeader, Select, Spinner } from "../components/ui.tsx";
import { api, fetchBlob, saveBlob } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolPath } from "../lib/data.ts";

/*
 * İşletmelerde mesleki eğitim formları: günlük rehberlik formu (hafta), aylık devam-devamsızlık çizelgesi ve aylık
 * rehberlik raporu (ay). Görev tarihleri işletmenin görev gününden gelir; PDF'te her form A5, ikisi bir A4'te.
 */

const NO_COORD = "__none__";

/**
 * PDF'yi yazdırma penceresiyle açar: görünmez bir çerçevede yüklenir, tarayıcının yazdır penceresi açılır. Tarayıcı
 * çerçeveden yazdırmaya izin vermezse PDF yeni sekmede açılır (oradan yazdırılır).
 */
function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    // Yazdır penceresi kapanınca çerçeve ve bellek bırakılır
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
}

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
  /** Devam çizelgesi: kontrol edilmemiş (?) yarım günler */
  unchecked?: { halves: number; students: number } | null;
}

interface FormsData {
  settings: { programName: string; district: string; province: string; canEdit: boolean };
  monday?: string;
  friday?: string;
  month?: string;
  today?: string;
  monthOpen?: boolean;
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

/**
 * Formlar sayfası (3A): Mesleki Eğitim menüsünde İşletmede Devam'ın altında. Solda form türü, dönem ve işletmeler;
 * sağda geniş PDF önizlemesi.
 */
export function InternshipForms() {
  const open = true;
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship");
  const toast = useToast();
  const [type, setType] = useState<FormType>("daily");
  const [week, setWeek] = useState(() => mondayOf(localToday()));
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const daily = type === "daily";
  const navigate = useNavigate();
  const attendance = type === "attendance";
  const q = useQuery({
    queryKey: [schoolId, "internship", "forms", type, daily ? week : month],
    queryFn: () => api<FormsData>(`${path}/forms?type=${type}&${daily ? `week=${week}` : `month=${month}`}`),
    enabled: open,
  });
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  // Devam çizelgesi görev gününe bağlı değildir: öğrencisi olan her işletme
  const usable = (b: FormItem) => (daily ? Boolean(b.date) : attendance ? b.students > 0 : Boolean(b.dates?.length));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Varsayılan seçim: görevi olan ve tatile denk gelmeyenler
  useEffect(() => {
    setPicked(new Set(items.filter((b) => usable(b) && !b.holiday).map((b) => b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  // Koordinatör öğretmene göre süzme (1): seçilen öğretmenin işletmeleri önizlenir ve yazdırılır
  const [coord, setCoord] = useState("");
  const coordNames = [...new Set(items.filter(usable).map((b) => b.coordinatorName ?? ""))].sort((a, b) => a.localeCompare(b, "tr"));
  // Form türü ya da dönem değişince seçili öğretmenin işletmesi kalmadıysa hepsi gösterilir
  const coordOn = coord && coordNames.includes(coord === NO_COORD ? "" : coord) ? coord : "";
  const shown = items.filter((b) => usable(b) && (!coordOn || (b.coordinatorName ?? "") === (coordOn === NO_COORD ? "" : coordOn))).sort((a, b) => (daily ? (a.date ?? '').localeCompare(b.date ?? '') : 0));
  const noDay = attendance ? 0 : items.filter((b) => !b.visitWeekday).length;
  const chosen = shown.filter((b) => picked.has(b.id));
  const formCount =
    type === "attendance" ? chosen.reduce((n, b) => n + Math.max(1, Math.ceil(b.students / 5)), 0) : chosen.length;
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const period = daily ? `week=${week}` : `month=${month}`;
  const pdfPath = `${path}/forms.pdf?type=${type}&${period}&ids=${chosen.map((b) => b.id).join(",")}`;
  const label = daily
    ? `Günlük Rehberlik Formu ${trDate(week)}`
    : `${type === "attendance" ? "Aylık Devam Çizelgesi" : "Aylık Rehberlik Raporu"} ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  // Önizleme (B): seçim değiştikçe kısa bir beklemeden sonra PDF yeniden üretilir ve yanda gösterilir
  const [preview, setPreview] = useState<{ key: string; blob: Blob; url: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!open || !formCount) {
      setPreviewError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setPreviewing(true);
      fetchBlob(pdfPath, ctrl.signal)
        .then((blob) => {
          setPreviewError(null);
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old.url);
            return { key: pdfPath, blob, url: URL.createObjectURL(blob) };
          });
        })
        .catch((e: Error) => {
          if (!ctrl.signal.aborted) setPreviewError(e.message);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setPreviewing(false);
        });
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, pdfPath, formCount]);
  // Pencere kapanınca önizleme belleği bırakılır
  useEffect(() => {
    if (open) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  }, [open]);
  const current = preview && preview.key === pdfPath && formCount ? preview : null;

  const output = async (mode: "download" | "print") => {
    // Devam çizelgesinde boş kalacak günler: kontrol edilmemişler ve ay bitmediyse bugünden sonrası
    if (attendance) {
      const halves = chosen.reduce((n, b) => n + (b.unchecked?.halves ?? 0), 0);
      const open = Boolean(q.data?.monthOpen);
      if (halves || open) {
        const lines = [
          halves ? `${chosen.filter((b) => b.unchecked).length} işletmede ${halves / 2 === Math.floor(halves / 2) ? halves / 2 : String(halves / 2).replace(".", ",")} gün kontrol edilmedi; bu günler çizelgede boş kalır.` : null,
          open && q.data?.today ? `Ay henüz bitmedi: ${dayMonth(q.data.today)} sonrası boş kalır.` : null,
        ].filter(Boolean);
        const c = await choose({
          title: "Çizelgede boş günler kalacak",
          message: lines.join(" "),
          tone: "warning",
          cancelLabel: "Vazgeç",
          choices: [
            ...(halves ? [{ value: "go" as const, label: "İşletmede Devam'a git", kind: "secondary" as const }] : []),
            { value: "print" as const, label: "Yine de yazdır", kind: "primary" as const },
          ],
        });
        if (c === "go") {
          navigate(`/isletme-devam?ay=${month}`);
          return;
        }
        if (c !== "print") return;
      }
    }
    setBusy(mode);
    try {
      // Önizlemedeki dosya güncelse yeniden üretilmez
      const blob = current ? current.blob : await fetchBlob(pdfPath);
      if (mode === "download") saveBlob(blob, `${label}.pdf`);
      else printBlob(blob);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Formlar"
        description="Günlük rehberlik formu, aylık devam çizelgesi ve aylık rehberlik raporu. Her form A5 boyutundadır; iki form bir A4 kâğıda sığar. Yazdırırken ölçeği “Gerçek boyut” (%100) seçin."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Printer className="size-4" />} loading={busy === "print"} disabled={!formCount || Boolean(busy)} onClick={() => void output("print")}>
              Yazdır
            </Button>
            <Button icon={<FileDown className="size-4" />} loading={busy === "download"} disabled={!formCount || Boolean(busy)} onClick={() => void output("download")}>
              İndir{formCount ? ` · ${formCount} form, ${Math.ceil(formCount / 2)} sayfa` : ""}
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={clsx(
                "rounded-xl px-2 py-2 text-sm leading-tight font-bold transition-colors",
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

        {coordNames.length > 1 && (
          <div className="w-72 max-w-full">
            <Select value={coordOn} onChange={(e) => setCoord(e.target.value)} aria-label="Koordinatör öğretmen">
              <option value="">Bütün koordinatörler</option>
              {coordNames.map((n) => (
                <option key={n || NO_COORD} value={n || NO_COORD}>
                  {n || "Koordinatörü seçilmemiş"}
                </option>
              ))}
            </Select>
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
                      {attendance && b.unchecked && (
                        <span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {b.unchecked.students} öğrencide {b.unchecked.halves} yarım gün kontrol edilmedi
                        </span>
                      )}
                      {type === "report" && (
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
        {attendance && q.data?.monthOpen && q.data.today && (
          <Alert>Ay henüz bitmedi: {dayMonth(q.data.today)} sonrası çizelgede boş kalır.</Alert>
        )}
        {attendance && (
          <p className="text-xs text-slate-500">
            Çizelgeye İşletmede Devam sayfasındaki işaretler aktarılır. Bir çizelgeye 5 öğrenci sığar.
          </p>
        )}
        {q.data && !attendance && <FormSettings settings={q.data.settings} report={type === "report"} />}
      </div>
      <FormPreview url={current?.url ?? preview?.url ?? null} loading={previewing || (Boolean(formCount) && !current && !previewError)} error={previewError} empty={!formCount} />
      </div>
    </div>
  );
}

/** Önizleme alanı: tarayıcının PDF görüntüleyicisi; seçim değişirken eski önizleme soluk kalır */
function FormPreview({ url, loading, error, empty }: { url: string | null; loading: boolean; error: string | null; empty: boolean }) {
  return (
    <div className="relative hidden min-h-[75vh] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 lg:block dark:bg-white/5 dark:ring-white/10">
      {empty ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-slate-500">Önizleme için listeden işletme seçin.</p>
      ) : error ? (
        <div className="p-4">
          <Alert tone="red">{error}</Alert>
        </div>
      ) : url ? (
        <iframe title="Form önizlemesi" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className={clsx("absolute inset-0 size-full bg-white transition-opacity", loading && "opacity-50")} />
      ) : null}
      {loading && !error && !empty && (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-elevated px-3 py-1 text-xs font-bold text-slate-600 shadow ring-1 ring-slate-200 dark:text-slate-300 dark:ring-white/15">Önizleme hazırlanıyor…</span>
        </div>
      )}
    </div>
  );
}

/** Formlardaki okul bilgileri Okul Ayarları'ndan gelir; eksikse uyarı */
function FormSettings({ settings, report }: { settings: FormsData["settings"]; report: boolean }) {
  const missing = report ? !settings.province || !settings.district : !settings.programName;
  const text = report
    ? `Raporda yer: ${[settings.district, settings.province].filter(Boolean).join("/") || "girilmemiş"}`
    : `Okul satırında program: ${settings.programName || "yazılmıyor"}`;
  return (
    <p className={clsx("text-xs", missing ? "font-semibold text-amber-700 dark:text-amber-300" : "text-slate-500")}>
      {text}.{" "}
      {settings.canEdit ? (
        <Link to="/ayarlar" className="font-semibold underline">
          Okul Ayarları'ndan değiştirilir
        </Link>
      ) : (
        "Okul Ayarları'ndan değiştirilir"
      )}
      {missing && report ? "; il ve ilçe girilmezse raporda boş kalır." : "."}
    </p>
  );
}
