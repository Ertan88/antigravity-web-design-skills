import { errorText } from '@okulpano/shared';
import {
  INTERN_HALF_SHORT,
  INTERN_LEGEND,
  MEB_VOCATIONAL_AREAS,
  businessSchema,
  formatDays,
  internLetter,
  internPickable,
  trCompare,
  type InternCell,
  type InternDay,
  type InternHalf,
  type InternTotals,
} from "@okulpano/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Building2,
  CheckCheck,
  Send,
  GraduationCap,
  Plus,
  Printer,
  Search,
  Trash2,
  Undo2,
  Users,
} from '../components/icons.tsx';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast.tsx";
import {
  Alert,
  Badge,
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  Input,
  Modal,
  MonthPicker,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
} from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useList, useSchoolPath, type Teacher } from "../lib/data.ts";

/*
 * İşletmelerde mesleki eğitim: işletmeler ve aylık işletmede devam çizelgesi. Okul günleri ders programından,
 * tatiller okulun takviminden kendiliğinden dolar; koordinatör öğretmen X (işletmede), D, İ, R, H, T ve K işaretler;
 * işaretsiz geçmiş gün "?" (kontrol edilmedi) görünür. İşaret tıklanınca hemen kaydedilir (Geri al ile düzeltilir);
 * devamsızlık müdür yardımcısına koordinatör "Gönder" deyince gider (turuncu nokta: henüz gönderilmedi).
 */

interface Business {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  contactName: string | null;
  trainerName: string | null;
  email: string | null;
  field: string | null;
  notes: string | null;
  areaId: string | null;
  areaName: string | null;
  coordinatorTeacherId: string | null;
  coordinatorName: string | null;
  isActive: boolean;
  students: number;
  canEdit: boolean;
  canManage: boolean;
}

interface Area {
  id: string;
  name: string;
  vocational: boolean | null;
  isVocational: boolean;
  businesses: number;
  teachers: number;
}
interface AreasData {
  areas: Area[];
  branches: Area[];
  unbranched: {
    id: string;
    fullName: string;
    share: number;
    likely: boolean;
  }[];
}

interface SheetStudent {
  id: string;
  fullName: string;
  schoolNo: string;
  listNo: number | null;
  classId: string | null;
  className: string | null;
  businessId: string;
  businessName: string;
  areaId: string | null;
  editable: boolean;
  cells: [InternCell, InternCell][];
  /** Gönderilmemiş devamsızlıklar: "YYYY-AA-GG|am" */
  unsent?: string[];
  totals: InternTotals;
}

interface PendingMark {
  id: string;
  studentId: string;
  fullName: string;
  className: string | null;
  businessName: string | null;
  date: string;
  half: InternHalf;
  code: "D" | "İ" | "R" | "H";
  userName: string;
}

interface Sheet {
  month: string;
  today: string;
  days: InternDay[];
  classes: { id: string; name: string }[];
  businesses: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  managerAssigned: boolean;
  students: SheetStudent[];
}

const WD_SHORT = ["", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];
const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const monthTitle = (m: string) =>
  `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayTitle = (iso: string) =>
  `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/*
 * Koyu temada panelin renk ölçeği dönüştürülür (açık tonlar saydamlaşır); hücreler bu yüzden koyu temada sabit, yüksek
 * kontrastlı renklerle çizilir: koyu zemin, açık harf.
 */
export const CELL_CLASS: Record<InternCell, string> = {
  O: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-[#123d2c] dark:text-[#a7f3d0] dark:border-[#1f6b4d]",
  X: "bg-white text-slate-700 border-slate-400 dark:bg-[#26231f] dark:text-[#f5f3ef] dark:border-[#a8a29e]",
  D: "bg-red-500 text-white border-red-500 dark:bg-[#dc2626] dark:text-white dark:border-[#dc2626]",
  İ: "bg-teal-200 text-teal-900 border-teal-300 dark:bg-[#134e4a] dark:text-[#99f6e4] dark:border-[#0f766e]",
  R: "bg-violet-200 text-violet-900 border-violet-300 dark:bg-[#3b2a6b] dark:text-[#ddd6fe] dark:border-[#7c3aed]",
  H: "bg-orange-200 text-orange-900 border-orange-300 dark:bg-[#5a2a10] dark:text-[#fed7aa] dark:border-[#c2410c]",
  TA: "bg-sky-200 text-sky-900 border-sky-200 dark:bg-[#0c3a5a] dark:text-[#bae6fd] dark:border-[#0c3a5a]",
  T: "bg-sky-200 text-sky-900 border-sky-700 border-2 dark:bg-[#0c3a5a] dark:text-[#bae6fd] dark:border-[#38bdf8]",
  K: "bg-amber-200 text-amber-900 border-amber-300 dark:bg-[#5a430c] dark:text-[#fde68a] dark:border-[#b45309]",
  "?": "bg-white text-slate-400 border-dashed border-slate-300 dark:bg-transparent dark:text-[#d6d1c8] dark:border-[#8a837b]",
  W: "border-transparent bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_4px,var(--color-slate-200)_4px_8px)]",
  "": "bg-white border-slate-200 dark:bg-transparent dark:border-[#4d4740]",
};

/** Kodların açıklaması (çizelgenin altında) */
export function InternLegend() {
  return (
    <div className="space-y-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {INTERN_LEGEND.map((l) => (
          <span key={l.code} className="flex items-center gap-1.5">
            <b
              className={clsx(
                "inline-flex h-5 w-6 items-center justify-center rounded border text-[11px] font-extrabold",
                CELL_CLASS[l.code],
              )}
            >
              {l.letter}
            </b>
            {l.text}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <b
            className={clsx("inline-flex h-5 w-6 rounded border", CELL_CLASS.W)}
          />
          Hafta sonu
        </span>
      </div>
      <p className="text-slate-500">
        Her gün iki bölümdür: S (sabah) ve Ö (öğle); her bölüm yarım gün
        sayılır. İzinli (İ), raporlu (R) ve hasta sevkli (H) özürlü, devamsız
        (D) özürsüz devamsızlığa eklenir. Arifede öğleden sonra kendiliğinden
        tatildir. İşletmede (X) de koordinatörün koyduğu işarettir; işaretsiz
        geçmiş gün “?” kontrol edilmedi görünür. Turuncu nokta: devamsızlık
        henüz müdür yardımcısına gönderilmedi. Hücreye tıklayıp harfe basmak da
        yeter (X, D, İ, R, H, K, T; işareti silmek için Backspace).
      </p>
    </div>
  );
}

/* ---------- İşletmede devam çizelgesi ---------- */

interface Picked {
  student: SheetStudent;
  day: InternDay;
  half: InternHalf;
  cell: InternCell;
  rect: DOMRect;
}

/** "-": işareti kaldırır (kontrol edilmedi) */
type MarkCode = "-" | "X" | "D" | "İ" | "R" | "H" | "T" | "K";
interface MarkBody {
  date: string;
  until?: string;
  items: { studentId: string; half: InternHalf; code: MarkCode }[];
}
/** Geri al: kaydedilen işaretlerin önceki kodları */
interface UndoState {
  label: string;
  body: MarkBody;
}

const prevCode = (c: InternCell): MarkCode =>
  c === "?" || c === "" || c === "O" || c === "TA" || c === "W" ? "-" : c;

export function InternshipSheet() {
  const { schoolId } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("ay") ?? "")
    ? params.get("ay")!
    : thisMonth();
  const [classId, setClassId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const path = useSchoolPath("internship");
  const qc = useQueryClient();
  const toast = useToast();
  const sheet = useQuery({
    queryKey: [schoolId, "internship", "sheet", month],
    queryFn: () => api<Sheet>(`${path}/sheet?month=${month}`),
  });
  const pending = useQuery({
    queryKey: [schoolId, "internship", "pending"],
    queryFn: () => api<PendingMark[]>(`${path}/pending`),
  });
  const [filling, setFilling] = useState(false);
  const [sending, setSending] = useState(false);
  const setMonth = (m: string) =>
    setParams((p) => (p.set("ay", m), p), { replace: true });

  const save = useMutation({
    mutationFn: (v: { body: MarkBody; undo?: UndoState | null }) =>
      api<{ changed: number; pending?: number }>(`${path}/marks`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
      setUndo(v.undo ?? null);
    },
    onError: (e) => toast.error(e.message),
  });
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const data = sheet.data;
  const visible = useMemo(
    () =>
      (data?.students ?? []).filter(
        (s) =>
          (!classId || s.classId === classId) &&
          (!businessId || s.businessId === businessId) &&
          (!areaId || s.areaId === areaId),
      ),
    [data, classId, businessId, areaId],
  );
  const className = data?.classes.find((c) => c.id === classId)?.name;

  return (
    <div>
      <style>{`@media print {
        @page { size: A4 landscape; margin: 8mm; }
        body * { visibility: hidden; }
        #intern-print, #intern-print * { visibility: visible; }
        #intern-print { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; }
        #intern-print .no-print { display: none; }
      }`}</style>
      <PageHeader
        title="İşletmede Devam"
        description="İşletmelerde mesleki eğitim gören öğrencilerin aylık devam çizelgesi. Okul günleri ve tatiller kendiliğinden dolar; kontrol ettiğiniz günleri X (işletmede) ya da devamsızlık olarak işaretleyin. Devamsızlıklar siz gönderince müdür yardımcısına gider."
        actions={
          <>
          <Button
            variant="secondary"
            icon={<CheckCheck className="size-4" />}
            onClick={() => setFilling(true)}
            disabled={!visible.some((s) => s.editable)}
          >
            İşaretsizleri İşletmede yap
          </Button>
          <Button
            variant="secondary"
            icon={<Printer className="size-4" />}
            onClick={() => window.print()}
            disabled={!visible.length}
          >
            Yazdır / PDF
          </Button>
          </>
        }
      />
      {Boolean(pending.data?.length) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-[#b45309] dark:bg-[#2e2208] dark:text-[#fde68a]">
          <span className="size-2.5 rounded-full bg-amber-500" />
          <div className="mr-auto">
            <div className="font-extrabold">
              {pending.data!.length / 2 >= 1 ? `${formatDays(pending.data!.length / 2)} günlük` : "Yarım günlük"} devamsızlık
              gönderilmedi ({new Set(pending.data!.map((p) => p.studentId)).size} öğrenci)
            </div>
            <div className="text-xs">
              Kontrol edip müdür yardımcısına gönderin; gönderilmeden
              bildirim gitmez.
            </div>
          </div>
          <Button icon={<Send className="size-4" />} onClick={() => setSending(true)}>
            Gönder…
          </Button>
        </div>
      )}
      {data && !data.managerAssigned && (
        <div className="mb-4">
          <Alert>
            Koordinatör müdür yardımcısı seçilmemiş: devamsızlık ve rapor
            bildirimleri kimseye gitmiyor. Genel Ayarlar › Modüller bölümünden
            seçin.
          </Alert>
        </div>
      )}
      <Card className="overflow-hidden">
        <div id="intern-print">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="mr-auto">
              <div className="text-lg font-extrabold tracking-tight">
                {monthTitle(month)}
                {className ? ` · ${className}` : ""}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                İşletmelerde Mesleki Eğitim Devam Çizelgesi
              </div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <MonthPicker value={month} onChange={setMonth} />
              {Boolean(data?.areas.length) && (
                <Select
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  aria-label="Alan"
                  className="w-48!"
                >
                  <option value="">Bütün alanlar</option>
                  {data!.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                aria-label="Sınıf"
                className="w-40!"
              >
                <option value="">Bütün sınıflar</option>
                {data?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                aria-label="İşletme"
                className="w-48!"
              >
                <option value="">Bütün işletmeler</option>
                {data?.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {sheet.isLoading ? (
            <Spinner />
          ) : sheet.error ? (
            <div className="p-5">
              <Alert tone="red">{sheet.error.message}</Alert>
            </div>
          ) : !visible.length ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title={
                data?.students.length
                  ? "Bu süzgeçte öğrenci yok"
                  : "İşletmeye bağlı öğrenci yok"
              }
              description={
                data?.students.length
                  ? undefined
                  : "İşletmeler sayfasından işletmeleri ekleyip öğrencilerini seçin."
              }
            />
          ) : (
            <SheetTable
              days={data!.days}
              rows={visible}
              picked={picked}
              onPick={setPicked}
            />
          )}
          <InternLegend />
        </div>
      </Card>
      {picked && data && (
        <CellMenu
          key={`${picked.student.id}|${picked.day.date}|${picked.half}`}
          picked={picked}
          today={data.today}
          busy={save.isPending}
          onClose={() => setPicked(null)}
          onSave={(body, label) => {
            const undoBody: MarkBody = {
              date: body.date,
              items: body.until
                ? body.items.map((i) => ({ ...i, code: "-" as const }))
                : body.items.map((i) => {
                    const cell =
                      picked.student.cells[Number(body.date.slice(8)) - 1]![
                        i.half === "am" ? 0 : 1
                      ];
                    return { ...i, code: prevCode(cell) };
                  }),
              ...(body.until ? { until: body.until } : {}),
            };
            save.mutate({ body, undo: { label, body: undoBody } });
            setPicked(null);
          }}
        />
      )}
      {filling && data && (
        <FillDialog
          month={month}
          today={data.today}
          businesses={data.businesses}
          businessId={businessId}
          onClose={() => setFilling(false)}
          onDone={(n) => {
            setFilling(false);
            void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
            toast.success(n ? `${formatDays(n / 2)} gün “İşletmede” işaretlendi.` : "İşaretsiz gün yoktu.");
          }}
        />
      )}
      {sending && pending.data && (
        <SendDialog
          rows={pending.data}
          onClose={() => setSending(false)}
          onDone={(n) => {
            setSending(false);
            void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
            toast.success(`${formatDays(n / 2)} günlük devamsızlık müdür yardımcısına gönderildi.`);
          }}
        />
      )}
      {undo && (
        <div className="no-print fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface shadow-2xl">
          {undo.label}
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-bold hover:bg-white/25"
            onClick={() => {
              save.mutate({ body: undo.body, undo: null });
              setUndo(null);
            }}
          >
            <Undo2 className="size-3.5" /> Geri al
          </button>
        </div>
      )}
    </div>
  );
}

function SheetTable({
  days,
  rows,
  picked,
  onPick,
}: {
  days: InternDay[];
  rows: SheetStudent[];
  picked: Picked | null;
  onPick: (p: Picked) => void;
}) {
  return (
    <div className="overflow-x-auto px-3 py-3">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-slate-500">
            <th rowSpan={2} className="px-1.5 text-center font-bold">
              S.No
            </th>
            <th rowSpan={2} className="px-2 text-left font-bold">
              No
            </th>
            <th rowSpan={2} className="px-2 text-left font-bold">
              Sınıf
            </th>
            <th rowSpan={2} className="px-2 text-left font-bold">
              Adı Soyadı
            </th>
            <th rowSpan={2} />
            {days.map((d) => (
              <th
                key={d.date}
                rowSpan={2}
                className={clsx(
                  "w-[27px] px-px pb-1 text-center font-semibold",
                  d.weekday >= 6 && "text-slate-400",
                )}
                title={d.holiday ?? d.halfDay ?? undefined}
              >
                <span
                  className={clsx(
                    "block text-[13px] font-extrabold",
                    d.weekday >= 6 ? "text-slate-400" : "text-ink",
                  )}
                >
                  {Number(d.date.slice(8))}
                </span>
                {WD_SHORT[d.weekday]}
              </th>
            ))}
            <th
              colSpan={2}
              className="border-b border-slate-200 px-1 pb-1 text-center text-[10px] leading-tight font-extrabold tracking-wide text-slate-600"
            >
              TOPLAM
              <br />
              DEVAMSIZLIK
            </th>
          </tr>
          <tr className="text-[10px] font-extrabold tracking-wide text-slate-500">
            <th className="px-1 pt-1">ÖZÜRLÜ</th>
            <th className="px-1 pt-1">ÖZÜRSÜZ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            // İki satır: üstte No · Sınıf · Ad, altta bütün öğrenci bilgilerinin altında işletme adı; günler iki satırı kaplar
            <Fragment key={s.id}>
            <tr>
              <td rowSpan={2} className="border-b border-slate-100 px-1.5 text-center font-bold text-slate-400">
                {i + 1}
              </td>
              <td className="px-2 pt-1.5 align-bottom text-[13px] font-bold whitespace-nowrap text-slate-500 tabular-nums">
                {s.schoolNo}
              </td>
              <td className="px-2 pt-1.5 align-bottom text-[13px] font-bold whitespace-nowrap text-slate-600">
                {s.className ?? "–"}
              </td>
              <td className="px-2 pt-1.5 align-bottom text-[13px] font-extrabold whitespace-nowrap">
                {s.fullName}
              </td>
              <td rowSpan={2} className="border-b border-slate-100 pr-1 text-right text-[9px] leading-[21px] font-bold text-slate-400">
                {INTERN_HALF_SHORT.am}
                <br />
                {INTERN_HALF_SHORT.pm}
              </td>
              {days.map((d, di) => (
                <td
                  key={d.date}
                  rowSpan={2}
                  className="border-b border-slate-100 px-px py-1"
                >
                  {s.cells[di]!.map((c, hi) => {
                    const half: InternHalf = hi ? "pm" : "am";
                    // Gelecek işletme günleri (boş) de seçilebilir: ileri tarihli rapor, izin, tatil, işletme kapalı
                    const can = s.editable && internPickable(c);
                    const unsent = s.unsent?.includes(`${d.date}|${half}`);
                    const on =
                      picked?.student.id === s.id &&
                      picked.day.date === d.date &&
                      picked.half === half;
                    return (
                      <button
                        key={half}
                        type="button"
                        disabled={!can}
                        title={`${s.fullName} · ${dayTitle(d.date)} ${half === "am" ? "sabah" : "öğle"}${d.holiday ? ` · ${d.holiday}` : d.halfDay && hi ? ` · ${d.halfDay}` : ""}`}
                        onClick={(e) =>
                          onPick({
                            student: s,
                            day: d,
                            half,
                            cell: c,
                            rect: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        className={clsx(
                          "relative my-px flex h-[19px] w-[25px] items-center justify-center rounded border text-[11px] font-extrabold",
                          CELL_CLASS[c],
                          can
                            ? "cursor-pointer hover:ring-2 hover:ring-ink/60"
                            : "cursor-default",
                          on && "ring-2 ring-ink",
                        )}
                      >
                        {internLetter(c)}
                        {unsent && (
                          <span
                            title="Müdür yardımcısına gönderilmedi"
                            className="absolute -top-1 -right-1 size-2 rounded-full border border-white bg-amber-500"
                          />
                        )}
                      </button>
                    );
                  })}
                </td>
              ))}
              <td
                rowSpan={2}
                className="border-b border-slate-100 px-2 text-center text-[13px] font-extrabold text-violet-700 dark:text-violet-300"
                title={`İzinli ${formatDays(s.totals.permitted)} · Raporlu ${formatDays(s.totals.report)} · Sevkli ${formatDays(s.totals.referred)}`}
              >
                {s.totals.excused ? formatDays(s.totals.excused) : "–"}
              </td>
              <td rowSpan={2} className="border-b border-slate-100 px-2 text-center text-[13px] font-extrabold text-red-600">
                {s.totals.unexcused ? formatDays(s.totals.unexcused) : "–"}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="border-b border-slate-100 px-2 pb-1.5 align-top text-[11px] font-medium whitespace-nowrap text-slate-400">
                {s.businessName}
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHOICES: {
  code: MarkCode;
  label: string;
  cell: InternCell;
  title: string;
}[] = [
  { code: "X", label: "X", cell: "X", title: "İşletmede" },
  { code: "D", label: "D", cell: "D", title: "Özürsüz devamsız" },
  { code: "İ", label: "İ", cell: "İ", title: "İzinli" },
  { code: "R", label: "R", cell: "R", title: "Raporlu" },
  { code: "H", label: "H", cell: "H", title: "Hasta sevkli" },
  {
    code: "K",
    label: "K",
    cell: "K",
    title: "İşletme kapalı (işletmedeki bütün öğrenciler)",
  },
  { code: "T", label: "T", cell: "T", title: "Tatil (bütün öğrenciler)" },
];

/** Klavye kısayolu: harf -> kod */
const KEY_CODE: Record<string, MarkCode> = {
  d: "D",
  i: "İ",
  i̇: "İ",
  ı: "İ",
  r: "R",
  h: "H",
  k: "K",
  t: "T",
  x: "X",
  backspace: "-",
  delete: "-",
};

/** Hücreye tıklayınca: kod seçilir seçilmez kaydedilir; bölüm (S, Ö, tam gün) ve birkaç günlük aralık seçilebilir */
function CellMenu({
  picked,
  today,
  busy,
  onClose,
  onSave,
}: {
  picked: Picked;
  today: string;
  busy: boolean;
  onClose: () => void;
  onSave: (body: MarkBody, label: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const other: InternHalf = picked.half === "am" ? "pm" : "am";
  const otherCell =
    picked.student.cells[Number(picked.day.date.slice(8)) - 1]![
      other === "am" ? 0 : 1
    ];
  const [scope, setScope] = useState<"one" | "day">("one");
  const [until, setUntil] = useState(picked.day.date);
  const [rangeOpen, setRangeOpen] = useState(false);
  const future = picked.day.date > today;
  // İleri tarihte "işletmede" ve "devamsız" anlamsız; işaret "Sil" ile kaldırılır
  const choices = CHOICES.filter(
    (c) => !(future && (c.code === "D" || c.code === "X")),
  );
  const marked = picked.cell !== "?" && picked.cell !== "";

  const commit = useCallback(
    (code: MarkCode, clear = false) => {
      if (future && code === "D") return;
      const range = rangeOpen && until > picked.day.date;
      const halves: InternHalf[] =
        range || (scope === "day" && internPickable(otherCell))
          ? ["am", "pm"]
          : [picked.half];
      const what = CHOICES.find((c) => c.code === code)?.title.split(" (")[0] ?? "";
      const when = range
        ? `${dayTitle(picked.day.date)} – ${dayTitle(until)}`
        : `${dayTitle(picked.day.date)} ${halves.length === 2 ? "tam gün" : picked.half === "am" ? "sabah" : "öğle"}`;
      onSave(
        {
          date: picked.day.date,
          ...(range ? { until } : {}),
          items: halves.map((half) => ({
            studentId: picked.student.id,
            half,
            code,
          })),
        },
        `${picked.student.fullName}: ${when} · ${clear ? "işaret silindi" : what}`,
      );
    },
    [future, rangeOpen, until, scope, otherCell, picked, onSave],
  );

  useEffect(() => {
    const close = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && onClose();
    const keys = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") return onClose();
      const code =
        KEY_CODE[e.key.toLocaleLowerCase("tr-TR")] ??
        KEY_CODE[e.key.toLowerCase()];
      if (code) {
        e.preventDefault();
        commit(code, e.key === "Backspace" || e.key === "Delete");
      }
    };
    setTimeout(() => document.addEventListener("mousedown", close));
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", keys);
    };
  }, [onClose, commit]);

  const left = Math.min(
    Math.max(8, picked.rect.left - 140),
    window.innerWidth - 330,
  );
  const below = picked.rect.bottom + 280 < window.innerHeight;
  const top = below ? picked.rect.bottom + 8 : picked.rect.top - 8;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="İşaret seç"
      className="fixed z-50 w-[320px] rounded-2xl border border-slate-200 bg-surface p-3.5 text-sm shadow-2xl"
      style={{ left, top, transform: below ? undefined : "translateY(-100%)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate font-extrabold">
          {picked.student.fullName} · {dayTitle(picked.day.date)}
        </div>
        {busy && <span className="text-xs text-slate-400">Kaydediliyor…</span>}
      </div>
      <div className="mt-2 mb-2.5 flex gap-1 text-xs font-bold">
        {(["one", "day"] as const).map((v) => (
          <button
            key={v}
            type="button"
            disabled={v === "day" && !internPickable(otherCell)}
            onClick={() => setScope(v)}
            className={clsx(
              "rounded-full px-3 py-1 disabled:opacity-40",
              scope === v ? "bg-ink text-surface" : "bg-slate-100 text-slate-600",
            )}
          >
            {v === "one"
              ? picked.half === "am"
                ? "S · Sabah"
                : "Ö · Öğle"
              : "Tam gün"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRangeOpen((x) => !x)}
          className={clsx(
            "ml-auto rounded-full px-3 py-1",
            rangeOpen ? "bg-ink text-surface" : "bg-slate-100 text-slate-600",
          )}
        >
          Birkaç gün
        </button>
      </div>
      {rangeOpen && (
        <label className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-slate-600">
          Bitiş
          <Input
            type="date"
            value={until}
            min={picked.day.date}
            onChange={(e) => e.target.value && setUntil(e.target.value)}
            className="h-8! w-40! text-xs"
          />
          <span className="text-slate-400">tam gün</span>
        </label>
      )}
      <div
        className={clsx(
          "grid gap-1",
          choices.length === 7 ? "grid-cols-7" : "grid-cols-6",
        )}
      >
        {choices.map((c) => (
          <button
            key={c.code}
            type="button"
            title={c.title}
            disabled={busy}
            onClick={() => commit(c.code)}
            className={clsx(
              "h-10 rounded-lg border text-sm font-extrabold transition-transform hover:scale-105",
              CELL_CLASS[c.cell],
              picked.cell === c.cell &&
                "outline-3 outline-offset-1 outline-ink",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || !marked}
        onClick={() => commit("-", true)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-bold text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 className="size-3.5" /> İşareti sil
      </button>
      <div className="mt-2 text-[11px] leading-snug text-slate-500">
        Tıklayınca kaydedilir; yanlış işareti "İşareti sil" ile kaldırın
        (klavyede Backspace). K bu işletmedeki, T bütün öğrencilere işlenir.
        {future
          ? " İleri tarihe D girilemez."
          : " Devamsızlık, siz “Gönder” deyince müdür yardımcısına gider."}
      </div>
    </div>
  );
}

/** Toplu "İşletmede": aralıktaki işaretsiz (?) günler X olur; konan işaretlere dokunulmaz */
function FillDialog({
  month,
  today,
  businesses,
  businessId,
  onClose,
  onDone,
}: {
  month: string;
  today: string;
  businesses: { id: string; name: string }[];
  businessId: string;
  onClose: () => void;
  onDone: (changed: number) => void;
}) {
  const path = useSchoolPath("internship");
  const toast = useToast();
  const start = `${month}-01`;
  const [from, setFrom] = useState(start <= today ? start : today);
  const [until, setUntil] = useState(today.startsWith(month) || today < start ? today : `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`);
  const [biz, setBiz] = useState(businessId);
  const run = useMutation({
    mutationFn: () =>
      api<{ changed: number }>(`${path}/marks/fill`, {
        method: "POST",
        body: { from, until: until > today ? today : until, businessId: biz || null },
      }),
    onSuccess: (r) => onDone(r.changed),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="İşaretsizleri “İşletmede” yap"
      description="Seçilen günlerde yalnızca “?” (kontrol edilmedi) olan bölümler X olur. Koyduğunuz devamsızlık ve diğer işaretlere dokunulmaz. Önce devamsızlıkları işaretleyin."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={run.isPending} disabled={!from || !until || from > until || from > today} onClick={() => run.mutate()}>
            İşletmede işaretle
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Başlangıç">
          {(id) => <Input id={id} type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label="Bitiş" help="Bugünden sonrası işaretlenmez">
          {(id) => <Input id={id} type="date" value={until} min={from} max={today} onChange={(e) => setUntil(e.target.value)} />}
        </Field>
        <Field label="Öğrenciler" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={biz} onChange={(e) => setBiz(e.target.value)}>
              <option value="">İşaretleyebildiğim bütün işletmeler</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  );
}

const PENDING_TEXT: Record<PendingMark["code"], string> = { D: "özürsüz devamsız", İ: "izinli", R: "raporlu", H: "hasta sevkli" };

/** Gönderilmemiş devamsızlıklar: öğrenci ve koda göre gruplanır, seçilenler müdür yardımcısına gönderilir */
function SendDialog({ rows, onClose, onDone }: { rows: PendingMark[]; onClose: () => void; onDone: (sent: number) => void }) {
  const path = useSchoolPath("internship");
  const toast = useToast();
  const groups = useMemo(() => {
    const m = new Map<string, PendingMark[]>();
    for (const r of rows) m.set(`${r.studentId}|${r.code}`, [...(m.get(`${r.studentId}|${r.code}`) ?? []), r]);
    return [...m.entries()].map(([key, list]) => ({ key, list }));
  }, [rows]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const ids = groups.filter((g) => !off.has(g.key)).flatMap((g) => g.list.map((r) => r.id));
  const send = useMutation({
    mutationFn: () => api<{ sent: number }>(`${path}/send`, { method: "POST", body: { ids, note: note.trim() || undefined } }),
    onSuccess: (r) => onDone(r.sent),
    onError: (e) => toast.error(e.message),
  });
  const when = (list: PendingMark[]) => {
    const days = [...new Set(list.map((r) => r.date))].sort();
    const half = days.length === 1 && list.length === 1 ? (list[0]!.half === "am" ? " sabah" : " öğle") : days.length === 1 ? " tam gün" : "";
    return days.length === 1 ? `${dayTitle(days[0]!)}${half}` : `${dayTitle(days[0]!)} – ${dayTitle(days[days.length - 1]!)} · ${formatDays(list.length / 2)} gün`;
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Müdür yardımcısına gönder"
      description="Gönderilmemiş devamsızlıklar. Kontrol edip göndermek istediklerinizi seçin; seçmedikleriniz sonra gönderilmek üzere bekler."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon={<Send className="size-4" />} loading={send.isPending} disabled={!ids.length} onClick={() => send.mutate()}>
            {ids.length ? `${formatDays(ids.length / 2)} günü gönder` : "Seçim yok"}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {groups.map((g) => {
          const r = g.list[0]!;
          const on = !off.has(g.key);
          return (
            <li key={g.key}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setOff((s) => {
                    const n = new Set(s);
                    if (on) n.add(g.key);
                    else n.delete(g.key);
                    return n;
                  })}
                  className="size-4 accent-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {r.fullName}
                    {r.className ? ` · ${r.className}` : ""}
                    {r.businessName ? <span className="font-medium text-slate-500"> · {r.businessName}</span> : null}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {when(g.list)} · işaretleyen {r.userName}
                  </span>
                </span>
                <b className={clsx("rounded-full px-2.5 py-0.5 text-xs", CELL_CLASS[r.code])}>
                  {r.code} · {PENDING_TEXT[r.code]}
                </b>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <Field label="Not (isteğe bağlı)">
          {(id) => <Textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Veli ile görüşüldü, rapor işletmeye teslim edildi" />}
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- İşletmeler ---------- */

interface StudentOption {
  id: string;
  fullName: string;
  schoolNo: string;
  listNo: number | null;
  classId: string | null;
  className: string | null;
  businessId: string | null;
}
interface StudentList {
  students: StudentOption[];
  classes: { id: string; name: string; withLesson: boolean }[];
  fallback: boolean;
}

function useAreas() {
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship/areas");
  return useQuery({
    queryKey: [schoolId, "internship", "areas"],
    queryFn: () => api<AreasData>(path),
  });
}

export function Businesses() {
  const { schoolId, can, school } = useAuth();
  const manager = can("internship.manage");
  const path = useSchoolPath("internship/businesses");
  const list = useQuery({
    queryKey: [schoolId, "internship", "businesses"],
    queryFn: () => api<Business[]>(path),
  });
  const areas = useAreas();
  const [editing, setEditing] = useState<Business | "new" | null>(null);
  const [assigning, setAssigning] = useState<Business | null>(null);
  const [viewing, setViewing] = useState<Business | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);
  const [area, setArea] = useState<string>("");
  const [coordinator, setCoordinator] = useState("");
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
      toast.success("İşletme silindi");
    },
    onError: (e) => toast.error(e.message),
  });

  const all = list.data ?? [];
  const coordinators = [
    ...new Map(
      all
        .filter((b) => b.coordinatorTeacherId)
        .map((b) => [b.coordinatorTeacherId!, b.coordinatorName ?? ""]),
    ).entries(),
  ].sort((a, b) => trCompare(a[1], b[1]));
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  const shown = all.filter(
    (b) =>
      (!area || (area === "none" ? !b.areaId : b.areaId === area)) &&
      (!coordinator ||
        (coordinator === "none"
          ? !b.coordinatorTeacherId
          : b.coordinatorTeacherId === coordinator)) &&
      (!needle ||
        [b.name, b.field, b.contactName, b.address].some((x) =>
          x?.toLocaleLowerCase("tr-TR").includes(needle),
        )),
  );
  const areaChips = (areas.data?.areas ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    n: all.filter((b) => b.areaId === a.id).length,
  }));
  const noArea = all.filter((b) => !b.areaId).length;

  return (
    <div>
      <PageHeader
        title="İşletmeler"
        description={
          manager
            ? "Öğrencilerin mesleki eğitim gördüğü işletmeler; okulun meslek alanlarına göre. Koordinatör öğretmen kendi işletmelerindeki öğrencilerin devamını işaretler."
            : "Eklediğiniz ve koordinatörü olduğunuz işletmeler. Eklediğiniz işletmenin alanı branşınızdan gelir, koordinatörü siz olursunuz."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {manager && (
              <Button
                variant="secondary"
                icon={<GraduationCap className="size-4" />}
                onClick={() => setAreasOpen(true)}
              >
                Alanlar ve meslek öğretmenleri
              </Button>
            )}
            {(manager || school?.teacherId) && (
              <Button
                icon={<Plus className="size-4" />}
                onClick={() => setEditing("new")}
              >
                İşletme ekle
              </Button>
            )}
          </div>
        }
      />
      {manager && areas.data && !areas.data.areas.length && (
        <div className="mb-4">
          <Alert>
            Okulda meslek alanı tanınmadı: öğretmenlerin branşı girilmemiş
            olabilir. "Alanlar ve meslek öğretmenleri" penceresinden meslek
            öğretmenlerinin branşını girin.
          </Alert>
        </div>
      )}
      {(areaChips.length > 0 || noArea > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { id: "", name: "Tümü", n: all.length },
            ...areaChips,
            ...(noArea && areaChips.length
              ? [{ id: "none", name: "Alanı seçilmemiş", n: noArea }]
              : []),
          ].map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              onClick={() => setArea(c.id)}
              className={clsx(
                "rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors",
                area === c.id
                  ? "border-ink bg-ink text-surface"
                  : "border-slate-200 bg-surface text-slate-700 hover:border-slate-400",
              )}
            >
              {c.name}{" "}
              <span
                className={clsx(
                  "ml-1 font-semibold",
                  area === c.id ? "text-white/70" : "text-slate-400",
                )}
              >
                {c.n}
              </span>
            </button>
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        {all.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="İşletme, yetkili, adres ara"
                className="pl-9"
              />
            </div>
            {manager && (
              <Select
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
                aria-label="Koordinatör öğretmen"
                className="w-60!"
              >
                <option value="">Bütün koordinatörler</option>
                {coordinators.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
                <option value="none">Koordinatörü seçilmemiş</option>
              </Select>
            )}
          </div>
        )}
        {list.isLoading ? (
          <Spinner />
        ) : list.error ? (
          <div className="p-5">
            <Alert tone="red">{list.error.message}</Alert>
          </div>
        ) : !shown.length ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title={all.length ? "Bu süzgeçte işletme yok" : "Henüz işletme yok"}
            description={
              all.length
                ? undefined
                : manager
                  ? "İşletme ekleyip alanını, koordinatör öğretmenini ve öğrencilerini seçin."
                  : "İşletme ekleyip öğrencilerinizi seçin."
            }
          />
        ) : (
          <Table head={["İşletme", "Koordinatör öğretmen", "Öğrenci", ""]}>
            {shown.map((b) => (
              <tr key={b.id}>
                <Td>
                  {/* İşletme bilgileri adına tıklayınca açılır (görüntüleme; altta Düzenle) */}
                  <button
                    type="button"
                    onClick={() => setViewing(b)}
                    className="text-left font-bold hover:underline"
                  >
                    {b.name}
                  </button>
                </Td>
                <Td>
                  {b.coordinatorName ?? <Badge tone="amber">Seçilmedi</Badge>}
                </Td>
                <Td>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Users className="size-3.5" />}
                    onClick={() => setAssigning(b)}
                    disabled={!b.canEdit}
                  >
                    {b.students} öğrenci
                  </Button>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {b.canManage && (
                    <DeleteButton
                      onConfirm={() => remove.mutate(b.id)}
                      what={`${b.name} işletmesi`}
                    />
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <BusinessView
        business={viewing}
        onClose={() => setViewing(null)}
        onEdit={(b) => {
          setViewing(null);
          setEditing(b);
        }}
      />
      <BusinessForm
        editing={editing}
        manager={manager}
        areas={areas.data?.areas ?? []}
        onClose={() => setEditing(null)}
        onOpenAreas={() => setAreasOpen(true)}
      />
      <AssignStudents
        business={assigning}
        businesses={all}
        onClose={() => setAssigning(null)}
      />
      {manager && (
        <AreasDialog open={areasOpen} onClose={() => setAreasOpen(false)} />
      )}
    </div>
  );
}

/** İşletme bilgileri (görüntüleme); düzenleme yetkisi olan altta "Düzenle" ile forma geçer */
function BusinessView({
  business: b,
  onClose,
  onEdit,
}: {
  business: Business | null;
  onClose: () => void;
  onEdit: (b: Business) => void;
}) {
  const rows: [string, string | null | undefined][] = b
    ? [
        ["Alan", b.areaName],
        ["Koordinatör öğretmen", b.coordinatorName],
        ["Öğrenci", `${b.students} öğrenci`],
        ["İşletme yetkilisi", b.contactName],
        ["Usta öğretici / eğitici personel", b.trainerName],
        ["Telefon", b.phone],
        ["E-posta", b.email],
        ["Adres", b.address],
        ["Notlar", b.notes],
      ]
    : [];
  return (
    <Modal
      open={Boolean(b)}
      onClose={onClose}
      title={b?.name ?? ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {b?.canEdit && <Button onClick={() => onEdit(b)}>Düzenle</Button>}
        </>
      }
    >
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-2.5">
            <dt className="font-semibold text-slate-500">{k}</dt>
            <dd
              className={clsx(
                "whitespace-pre-line",
                v ? "text-ink" : "text-slate-400",
              )}
            >
              {k === "Telefon" && v ? (
                <a
                  href={`tel:${v.replace(/[^\d+]/g, "")}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {v}
                </a>
              ) : k === "E-posta" && v ? (
                <a
                  href={`mailto:${v}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {v}
                </a>
              ) : (
                (v ?? "Girilmemiş")
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

interface Candidates {
  fallback: boolean;
  teachers: {
    id: string;
    fullName: string;
    areaId: string | null;
    branchName: string | null;
    vocational: boolean;
    coordinator: boolean;
  }[];
}

function BusinessForm({
  editing,
  manager,
  areas,
  onClose,
  onOpenAreas,
}: {
  editing: Business | "new" | null;
  manager: boolean;
  areas: Area[];
  onClose: () => void;
  onOpenAreas: () => void;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship/businesses");
  const candPath = useSchoolPath("internship/coordinator-candidates");
  const candidates = useQuery({
    queryKey: [schoolId, "internship", "candidates"],
    queryFn: () => api<Candidates>(candPath),
    enabled: manager && Boolean(editing),
  });
  const allTeachers = useList<Teacher>("teachers");
  const qc = useQueryClient();
  const toast = useToast();
  const EMPTY_FORM = {
    name: "",
    areaId: "",
    field: "",
    contactName: "",
    trainerName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    coordinatorTeacherId: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const isNew = editing === "new";
  // Öğretmen var olan işletmenin yalnızca bilgilerini düzenler (alan ve koordinatör idarede)
  const infoOnly = !manager && !isNew;
  useEffect(() => {
    if (!editing) return;
    const b = editing === "new" ? null : editing;
    setForm(
      b
        ? {
            name: b.name,
            areaId: b.areaId ?? "",
            field: b.field ?? "",
            contactName: b.contactName ?? "",
            trainerName: b.trainerName ?? "",
            phone: b.phone ?? "",
            email: b.email ?? "",
            address: b.address ?? "",
            notes: b.notes ?? "",
            coordinatorTeacherId: b.coordinatorTeacherId ?? "",
          }
        : EMPTY_FORM,
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const parsed = businessSchema.safeParse({
        ...form,
        areaId: form.areaId || null,
        coordinatorTeacherId: form.coordinatorTeacherId || null,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin.",
        );
      const body = parsed.data;
      if (isNew) return api(path, { method: "POST", body });
      const id = (editing as Business).id;
      if (infoOnly) {
        const {
          name,
          field,
          contactName,
          trainerName,
          phone,
          email,
          address,
          notes,
        } = body;
        return api(`${path}/${id}/info`, {
          method: "PATCH",
          body: {
            name,
            field,
            contactName,
            trainerName,
            phone,
            email,
            address,
            notes,
          },
        });
      }
      return api(`${path}/${id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
      toast.success(isNew ? "İşletme eklendi" : "İşletme güncellendi");
      onClose();
    },
    onError: (e) => setError(errorText(e, "Kaydedilemedi.")),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Koordinatör adayları: meslek branşlı öğretmenler (alana göre gruplu); seçili alanın öğretmenleri önce
  const cand = candidates.data;
  const listAll = cand?.fallback;
  const groups = useMemo(() => {
    if (!cand) return [];
    const teachers = listAll
      ? (allTeachers.data ?? [])
          .filter((t) => t.isActive)
          .map((t) => ({
            id: t.id,
            fullName: t.fullName,
            branchName: t.branch,
            areaId: null as string | null,
          }))
      : cand.teachers;
    const by = new Map<string, typeof teachers>();
    for (const t of teachers) {
      const g = t.branchName ?? "Branşı girilmemiş";
      by.set(g, [...(by.get(g) ?? []), t]);
    }
    const selectedArea = areas.find((a) => a.id === form.areaId)?.name;
    return [...by.entries()]
      .map(([g, list]) => ({
        g,
        list: list.sort((a, b) => trCompare(a.fullName, b.fullName)),
      }))
      .sort(
        (a, b) =>
          Number(b.g === selectedArea) - Number(a.g === selectedArea) ||
          trCompare(a.g, b.g),
      );
  }, [cand, listAll, allTeachers.data, areas, form.areaId]);

  return (
    <Modal
      open={Boolean(editing)}
      onClose={onClose}
      title={isNew ? "İşletme ekle" : "İşletmeyi düzenle"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            loading={save.isPending}
            disabled={!form.name.trim()}
            onClick={() => save.mutate()}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="İşletme adı">
          {(id) => (
            <Input id={id} value={form.name} onChange={set("name")} autoFocus />
          )}
        </Field>
        {manager ? (
          <>
            <Field
              label="Alan"
              help="Okulun meslek alanları (öğretmen branşlarından)."
            >
              {(id) => (
                <Select id={id} value={form.areaId} onChange={set("areaId")}>
                  <option value="">Seçilmedi</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Koordinatör öğretmen"
              help="Bu işletmedeki öğrencilerin devamını işaretler (mobil uygulamada ziyaret kaydı)."
            >
              {(id) => (
                <>
                  <Select
                    id={id}
                    value={form.coordinatorTeacherId}
                    onChange={set("coordinatorTeacherId")}
                  >
                    <option value="">Seçilmedi</option>
                    {groups.map(({ g, list }) => (
                      <optgroup key={g} label={g}>
                        {list.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fullName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  {cand?.fallback ? (
                    <div className="mt-1.5 text-xs text-amber-700">
                      Meslek branşı girilmiş öğretmen yok; bütün öğretmenler
                      listelendi.{" "}
                      <button
                        type="button"
                        className="font-bold underline"
                        onClick={onOpenAreas}
                      >
                        Branşları girin
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </Field>
          </>
        ) : (
          isNew && (
            <Alert tone="blue">
              İşletmenin alanı öğretmen kadrosundaki branşınızdan gelir;
              koordinatörü siz olursunuz.
            </Alert>
          )
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="İşletme yetkilisi">
            {(id) => (
              <Input
                id={id}
                value={form.contactName}
                onChange={set("contactName")}
              />
            )}
          </Field>
          <Field label="Usta öğretici / eğitici personel">
            {(id) => (
              <Input
                id={id}
                value={form.trainerName}
                onChange={set("trainerName")}
              />
            )}
          </Field>
          <Field label="Telefon">
            {(id) => (
              <Input
                id={id}
                value={form.phone}
                onChange={set("phone")}
                inputMode="tel"
              />
            )}
          </Field>
          <Field label="E-posta">
            {(id) => (
              <Input
                id={id}
                value={form.email}
                onChange={set("email")}
                inputMode="email"
              />
            )}
          </Field>
        </div>
        <Field label="Adres">
          {(id) => (
            <Textarea
              id={id}
              value={form.address}
              onChange={set("address")}
              rows={2}
            />
          )}
        </Field>
        <Field
          label="Notlar"
          help="Giriş saati, servis, iş güvenliği gibi koordinatörün bilmesi gerekenler."
        >
          {(id) => (
            <Textarea
              id={id}
              value={form.notes}
              onChange={set("notes")}
              rows={3}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

/** Alanlar (meslek alanı olan branşlar) ve branşı girilmemiş öğretmenler */
function AreasDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { schoolId } = useAuth();
  const base = useSchoolPath("internship");
  const areas = useAreas();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Record<string, string>>({});
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
  const toggle = useMutation({
    mutationFn: (v: { id: string; vocational: boolean | null }) =>
      api(`${base}/areas/${v.id}`, {
        method: "PATCH",
        body: { vocational: v.vocational },
      }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const setBranch = useMutation({
    mutationFn: (v: { id: string; value: string }) =>
      api(`${base}/teachers/${v.id}/branch`, {
        method: "PUT",
        body: v.value.startsWith("id:")
          ? { branchId: v.value.slice(3) }
          : { newBranch: v.value },
      }),
    onSuccess: (_r, v) => {
      setPending((p) => {
        const n = { ...p };
        delete n[v.id];
        return n;
      });
      refresh();
      void qc.invalidateQueries({ queryKey: [schoolId, "teachers"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const d = areas.data;
  const branches = [...(d?.branches ?? [])].sort(
    (a, b) =>
      Number(b.isVocational) - Number(a.isVocational) ||
      trCompare(a.name, b.name),
  );
  const known = new Set(branches.map((b) => b.name.toLocaleLowerCase("tr-TR")));
  const suggestions = MEB_VOCATIONAL_AREAS.filter(
    (n) => !known.has(n.toLocaleLowerCase("tr-TR")),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Alanlar ve meslek öğretmenleri"
      description="Meslek öğretmeni, Öğretmen Kadrosu'ndaki branşından anlaşılır. MEB alan adları kendiliğinden tanınır; gerekirse açıp kapatın."
    >
      {!d ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-extrabold">Branşlar</div>
            <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{b.name}</div>
                    <div className="text-xs text-slate-500">
                      {b.teachers} öğretmen ·{" "}
                      {b.vocational === null ? "otomatik" : "okul ayarı"}
                    </div>
                  </div>
                  <Select
                    value={
                      b.vocational === null
                        ? "auto"
                        : b.vocational
                          ? "yes"
                          : "no"
                    }
                    onChange={(e) =>
                      toggle.mutate({
                        id: b.id,
                        vocational:
                          e.target.value === "auto"
                            ? null
                            : e.target.value === "yes",
                      })
                    }
                    className={clsx(
                      "w-44! text-xs",
                      b.isVocational && "font-bold",
                    )}
                    aria-label={`${b.name} meslek alanı`}
                  >
                    <option value="auto">
                      Otomatik:{" "}
                      {b.vocational === null && b.isVocational
                        ? "evet"
                        : "hayır"}
                    </option>
                    <option value="yes">Meslek alanı</option>
                    <option value="no">Meslek alanı değil</option>
                  </Select>
                </div>
              ))}
              {!branches.length && (
                <div className="p-4 text-center text-sm text-slate-500">
                  Branş yok.
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 text-sm font-extrabold">
              Branşı girilmemiş öğretmenler · {d.unbranched.length}
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Ders programında meslek dersi okutanlar üstte (yalnızca sıralama
              ipucu). Branşı seçin ya da MEB alan adını yazın. Öğretmen
              Kadrosu'ndan Excel ile de toplu girilebilir.
            </p>
            <datalist id="meb-areas">
              {suggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {d.unbranched.map((t) => (
                <div key={t.id} className="space-y-1.5 px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.fullName}</span>
                    {t.likely && (
                      <Badge tone="green">Meslek dersi okutuyor</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      list="meb-areas"
                      value={pending[t.id] ?? ""}
                      onChange={(e) =>
                        setPending((p) => ({ ...p, [t.id]: e.target.value }))
                      }
                      placeholder="Branş"
                      className="h-9! flex-1 text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        setBranch.mutate({
                          id: t.id,
                          value: `id:${e.target.value}`,
                        })
                      }
                      className="h-9! w-10! px-1! text-xs"
                      aria-label={`${t.fullName} branş seç`}
                      title="Var olan branştan seç"
                    >
                      <option value=""></option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      disabled={!(pending[t.id] ?? "").trim()}
                      loading={
                        setBranch.isPending && setBranch.variables?.id === t.id
                      }
                      onClick={() =>
                        setBranch.mutate({
                          id: t.id,
                          value: pending[t.id]!.trim(),
                        })
                      }
                    >
                      Kaydet
                    </Button>
                  </div>
                </div>
              ))}
              {!d.unbranched.length && (
                <div className="p-4 text-center text-sm text-slate-500">
                  Bütün öğretmenlerin branşı girilmiş.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AssignStudents({
  business,
  businesses,
  onClose,
}: {
  business: Business | null;
  businesses: Business[];
  onClose: () => void;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath("internship");
  const qc = useQueryClient();
  const toast = useToast();
  const students = useQuery({
    queryKey: [schoolId, "internship", "students"],
    queryFn: () => api<StudentList>(`${path}/students`),
    enabled: Boolean(business),
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classId, setClassId] = useState("");
  const [q, setQ] = useState("");
  const list = students.data?.students;
  useEffect(() => {
    if (business && list) {
      setPicked(
        new Set(
          list.filter((s) => s.businessId === business.id).map((s) => s.id),
        ),
      );
      const first = list.find((s) => s.businessId === business.id);
      setClassId(first?.classId ?? "");
      setQ("");
    }
  }, [business, list]);
  const names = new Map(businesses.map((b) => [b.id, b.name]));
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  const shown = (list ?? []).filter(
    (s) =>
      (!classId || s.classId === classId) &&
      (!needle ||
        s.fullName.toLocaleLowerCase("tr-TR").includes(needle) ||
        s.schoolNo.includes(needle)),
  );
  const save = useMutation({
    mutationFn: () =>
      api(`${path}/businesses/${business!.id}/students`, {
        method: "PUT",
        body: { studentIds: [...picked] },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, "internship"] });
      toast.success(`${business!.name}: ${picked.size} öğrenci`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Modal
      open={Boolean(business)}
      onClose={onClose}
      size="lg"
      title={business ? `${business.name} · öğrenciler` : ""}
      description="İşletmelerde mesleki eğitim dersi olan sınıflar ve 12. sınıflar listelenir. Başka işletmedeki bir öğrenci seçilirse o işletmeden çıkar."
      footer={
        <>
          <span className="mr-auto text-sm font-semibold text-slate-500">
            {picked.size} öğrenci seçili
          </span>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Kaydet
          </Button>
        </>
      }
    >
      {students.data?.fallback && (
        <div className="mb-3">
          <Alert>
            Ders programında işletme dersi ya da 12. sınıf bulunamadı; bütün
            sınıflar listelendi.
          </Alert>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="w-56!"
          aria-label="Sınıf"
        >
          <option value="">Bütün sınıflar</option>
          {(students.data?.classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.withLesson ? "" : " (programda işletme dersi yok)"}
            </option>
          ))}
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad ya da okul no"
            className="pl-9"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="h-10"
          onClick={() =>
            setPicked(
              (p) =>
                new Set([
                  ...p,
                  ...shown
                    .filter((s) => s.businessId !== "other")
                    .map((s) => s.id),
                ]),
            )
          }
          disabled={!shown.length}
        >
          Listedekilerin hepsi
        </Button>
      </div>
      {students.isLoading ? (
        <Spinner />
      ) : (
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {shown.map((s) => {
            const locked = s.businessId === "other";
            const elsewhere = locked
              ? "Başka işletmede"
              : s.businessId && s.businessId !== business?.id
                ? names.get(s.businessId)
                : null;
            return (
              <label
                key={s.id}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  locked ? "opacity-60" : "cursor-pointer hover:bg-slate-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={picked.has(s.id)}
                  disabled={locked}
                  onChange={() => toggle(s.id)}
                  className="size-4 accent-ink"
                />
                <span className="w-10 text-xs font-bold text-slate-400">
                  {s.schoolNo}
                </span>
                <span className="w-20 text-xs font-semibold text-slate-500">
                  {s.className}
                </span>
                <span className="flex-1 font-semibold">{s.fullName}</span>
                {elsewhere && (
                  <Badge tone={picked.has(s.id) ? "amber" : "slate"}>
                    {elsewhere}
                  </Badge>
                )}
              </label>
            );
          })}
          {!shown.length && (
            <div className="p-4 text-center text-sm text-slate-500">
              Öğrenci bulunamadı.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
