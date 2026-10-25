import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, MediaFile, Post, PostStatus, ResultStatus } from "../shared/types";
import { Button, Modal, type Tone } from "./components/ui";

// ---------- API ----------

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Lỗi máy chủ (${res.status})`);
  return json as T;
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T,>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T,>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T,>(url: string) => request<T>("DELETE", url),
};

// ---------- Navigation ----------

export type PageKey = "home" | "hunt" | "library" | "compose" | "queue" | "logs" | "accounts" | "settings";

export interface NavItem {
  key: PageKey;
  label: string;
  emoji: string;
  tone: Tone;
  hint: string;
  // Position in the content workflow, shown as a small step number
  step?: number;
}

// Grouped by the order work actually flows: find -> keep -> write -> publish
export const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ key: "home", label: "Tổng quan", emoji: "🏡", tone: "violet", hint: "Mọi thứ trong nháy mắt" }] },
  {
    title: "Nội dung",
    items: [
      { key: "hunt", label: "Săn bài", emoji: "🔎", tone: "sky", hint: "Cào bài từ các Fanpage, lọc bài hot", step: 1 },
      { key: "library", label: "Kho nội dung", emoji: "🗃️", tone: "lemon", hint: "Bài đã lưu và mẫu viết sẵn", step: 2 },
      { key: "compose", label: "Soạn bài", emoji: "✍️", tone: "pink", hint: "Viết tay hoặc nhờ AI, đăng lên nhiều trang", step: 3 },
    ],
  },
  {
    title: "Đăng bài",
    items: [
      { key: "queue", label: "Lịch đăng", emoji: "📅", tone: "blue", hint: "Hàng chờ, hẹn giờ và kết quả", step: 4 },
      { key: "logs", label: "Nhật ký", emoji: "📜", tone: "peach", hint: "Ghi lại từng lần đăng và cào" },
    ],
  },
  {
    title: "Thiết lập",
    items: [
      { key: "accounts", label: "Nick & Trang", emoji: "👥", tone: "mint", hint: "Thêm nick, chọn trang được đăng" },
      { key: "settings", label: "Cài đặt", emoji: "⚙️", tone: "gray", hint: "Đăng an toàn, App Facebook, API key AI" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// ---------- Status display ----------

export const POST_STATUS: Record<PostStatus, { label: string; emoji: string; tone: Tone }> = {
  draft: { label: "Nháp", emoji: "📝", tone: "gray" },
  scheduled: { label: "Chờ đăng", emoji: "⏰", tone: "sky" },
  running: { label: "Đang đăng", emoji: "🚀", tone: "violet" },
  done: { label: "Hoàn tất", emoji: "✅", tone: "mint" },
  partial: { label: "Một phần", emoji: "⚠️", tone: "peach" },
  failed: { label: "Thất bại", emoji: "❌", tone: "pink" },
  cancelled: { label: "Đã dừng", emoji: "⏸️", tone: "gray" },
};

export const RESULT_STATUS: Record<ResultStatus, { label: string; tone: Tone }> = {
  pending: { label: "Chờ", tone: "gray" },
  success: { label: "Thành công", tone: "mint" },
  failed: { label: "Lỗi", tone: "pink" },
  skipped: { label: "Bỏ qua", tone: "lemon" },
};

// ---------- Formatting ----------

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function fmtRelative(iso?: string | null, now = Date.now()) {
  if (!iso) return "";
  // The shared clock only ticks every 15s, so never let it lag behind real time
  const diff = Date.parse(iso) - Math.max(now, Date.now());
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const unit = m < 1 ? "vài giây" : m < 60 ? `${m} phút` : m < 1440 ? `${Math.round(m / 60)} giờ` : `${Math.round(m / 1440)} ngày`;
  return diff >= 0 ? `sau ${unit}` : `${unit} trước`;
}

export function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function snippet(text: string, max = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function postStats(p: Post) {
  let ok = 0,
    failed = 0,
    pending = 0;
  for (const t of p.targets) {
    if (t.status === "success") ok++;
    else if (t.status === "failed" || t.status === "skipped") failed++;
    else pending++;
  }
  return { ok, failed, pending, total: p.targets.length };
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function safeStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStorage(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// ---------- App context ----------

interface Toast {
  id: number;
  emoji: string;
  text: string;
  tone: "ok" | "err" | "info";
}

interface ConfirmOptions {
  title: string;
  text?: React.ReactNode;
  emoji?: string;
  confirmLabel?: string;
  danger?: boolean;
}

// What the composer should open with when another screen sends the user there
export type ComposerSeed =
  | { kind: "edit"; post: Post }
  | { kind: "template"; content: string }
  // From a hunted post: its text and copied images, optionally straight into an AI rewrite
  | { kind: "reuse"; content: string; media: MediaFile[]; ai?: boolean }
  | null;

interface AppCtx {
  state: AppState;
  refresh: () => Promise<void>;
  online: boolean;
  page: PageKey;
  go: (p: PageKey) => void;
  toast: (text: string, tone?: Toast["tone"], emoji?: string) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  // Runs an action, toasts its error, returns undefined when it failed
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  seed: ComposerSeed;
  openComposer: (s: ComposerSeed) => void;
  clearSeed: () => void;
  now: number;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

function readHash(): PageKey {
  const h = location.hash.replace("#", "") as PageKey;
  return NAV_ITEMS.some((i) => i.key === h) ? h : "home";
}

export function AppProvider({ children, loading }: { children: React.ReactNode; loading: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [online, setOnline] = useState(true);
  const [page, setPage] = useState<PageKey>(readHash);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seed, setSeed] = useState<ComposerSeed>(null);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [now, setNow] = useState(Date.now());
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<AppState>("/api/state"));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    let timer: number | undefined;
    const es = new EventSource("/api/events");
    es.onmessage = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    };
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    const poll = window.setInterval(refresh, 30_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      es.close();
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((p: PageKey) => {
    if (location.hash !== `#${p}`) location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok", emoji?: string) => {
    const id = ++toastId.current;
    const e = emoji ?? (tone === "ok" ? "🎉" : tone === "err" ? "😿" : "💡");
    setToasts((t) => [...t.slice(-3), { id, emoji: e, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "err" ? 6000 : 3500);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string) => {
      try {
        const r = await fn();
        if (okText) toast(okText);
        refresh();
        return r;
      } catch (e: any) {
        toast(e?.message ?? String(e), "err");
        return undefined;
      }
    },
    [toast, refresh],
  );

  const openComposer = useCallback(
    (s: ComposerSeed) => {
      setSeed(s);
      go("compose");
    },
    [go],
  );
  const clearSeed = useCallback(() => setSeed(null), []);

  const value = useMemo<AppCtx | null>(
    () => (state ? { state, refresh, online, page, go, toast, confirm, run, seed, openComposer, clearSeed, now } : null),
    [state, refresh, online, page, go, toast, confirm, run, seed, openComposer, clearSeed, now],
  );

  const closeDialog = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <>
      {value ? <Ctx.Provider value={value}>{children}</Ctx.Provider> : loading}

      <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-pop flex items-start gap-2.5 max-w-sm rounded-2xl px-4 py-3 shadow-[var(--shadow-pop)] border text-sm font-bold ${
              t.tone === "err"
                ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200"
                : "bg-block border-line text-ink"
            }`}
          >
            <span className="emoji text-lg">{t.emoji}</span>
            <span className="pt-0.5">{t.text}</span>
          </div>
        ))}
      </div>

      <Modal
        open={!!dialog}
        onClose={() => closeDialog(false)}
        title={dialog?.title ?? ""}
        emoji={dialog?.emoji ?? (dialog?.danger ? "🗑️" : "🤔")}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => closeDialog(false)}>
              Thôi
            </Button>
            <Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => closeDialog(true)} autoFocus>
              {dialog?.confirmLabel ?? "Đồng ý"}
            </Button>
          </>
        }
      >
        {dialog?.text && <div className="text-sm text-soft">{dialog.text}</div>}
      </Modal>
    </>
  );
}
