import React, { useEffect, useState } from "react";
import { Menu, Moon, PenLine, Sun, X } from "lucide-react";
import { AppProvider, NAV_GROUPS, NAV_ITEMS, startOfToday, useApp, type PageKey } from "./lib";
import { Button, Emo, IconButton } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import Composer from "./pages/Composer";
import Queue from "./pages/Queue";
import Library from "./pages/Library";
import Hunt from "./pages/Hunt";
import Logs from "./pages/Logs";
import Accounts from "./pages/Accounts";
import SettingsPage from "./pages/Settings";

const PAGES: Record<PageKey, React.ComponentType> = {
  home: Dashboard,
  hunt: Hunt,
  library: Library,
  compose: Composer,
  queue: Queue,
  logs: Logs,
  accounts: Accounts,
  settings: SettingsPage,
};

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const toggle = () =>
    setDark((d) => {
      try {
        localStorage.setItem("theme", d ? "light" : "dark");
      } catch {
        /* ignore */
      }
      return !d;
    });
  return { dark, toggle };
}

// Small counters shown next to menu items
function useBadges(): Partial<Record<PageKey, { n: number; tone: "info" | "warn" }>> {
  const { state } = useApp();
  const today = startOfToday();
  const queued = state.posts.filter((p) => p.status === "scheduled" || p.status === "running").length;
  const errorsToday = state.logs.filter((l) => l.level === "error" && Date.parse(l.at) >= today).length;
  const badAccounts = state.accounts.filter((a) => a.status === "error").length;
  const fetching = state.sources.filter((s) => s.fetching).length;
  return {
    hunt: fetching ? { n: fetching, tone: "info" } : undefined,
    library: state.savedCount ? { n: state.savedCount, tone: "info" } : undefined,
    queue: queued ? { n: queued, tone: "info" } : undefined,
    logs: errorsToday ? { n: errorsToday, tone: "warn" } : undefined,
    accounts: badAccounts ? { n: badAccounts, tone: "warn" } : undefined,
  };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { page, go, state, online } = useApp();
  const badges = useBadges();
  const pages = state.accounts.reduce((n, a) => n + a.pages.filter((p) => p.enabled).length, 0);

  return (
    <nav className="flex flex-col h-full" aria-label="Menu chính">
      <div className="flex items-center gap-3 px-3 pt-1 pb-5">
        <Emo e="🐣" tone="lemon" size="md" />
        <div className="min-w-0">
          <p className="font-black text-[15px] leading-tight text-ink">FB Scrat &amp; AutoPost</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-ink">by HuyFlou</p>
          <p className="text-[11px] text-soft font-semibold flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-400"}`} />
            {online ? `${state.accounts.length} nick · ${pages} trang` : "Mất kết nối máy chủ"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin space-y-4 -mx-1 px-1">
        {NAV_GROUPS.map((g, i) => (
          <div key={i}>
            {g.title && <p className="px-3 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-faint">{g.title}</p>}
            <ul className="space-y-1">
              {g.items.map((item) => {
                const active = page === item.key;
                const b = badges[item.key];
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        go(item.key);
                        onNavigate?.();
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`hover-wiggle w-full flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition focus-ring ${
                        active ? "bg-block shadow-[var(--shadow-block)] border border-line" : "border border-transparent hover:bg-block/60"
                      }`}
                    >
                      <span className="relative">
                        <Emo e={item.emoji} tone={item.tone} />
                        {item.step && (
                          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-block border border-line text-[9px] font-black text-soft flex items-center justify-center tabular-nums">
                            {item.step}
                          </span>
                        )}
                      </span>
                      <span className={`flex-1 text-sm truncate ${active ? "font-extrabold text-ink" : "font-bold text-soft"}`}>{item.label}</span>
                      {b && (
                        <span
                          className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${
                            b.tone === "warn" ? "bg-rose-400 text-white" : "bg-indigo-100 text-brand-ink dark:bg-indigo-400/20"
                          }`}
                        >
                          {b.n}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-3xl bg-gradient-to-br from-indigo-100 to-pink-100 dark:from-indigo-500/15 dark:to-pink-500/10 p-4">
        <p className="text-sm font-extrabold text-ink flex items-center gap-1.5">
          <span className="emoji">💡</span> Mẹo nhỏ
        </p>
        <p className="text-xs text-soft mt-1 leading-relaxed">
          Săn bài hot <span className="emoji">🔎</span> → lưu vào kho <span className="emoji">🗃️</span> → nhờ AI viết lại <span className="emoji">✨</span> → hẹn giờ đăng <span className="emoji">📅</span>.
        </p>
      </div>
    </nav>
  );
}

function Shell() {
  const { page, go } = useApp();
  const { dark, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const item = NAV_ITEMS.find((i) => i.key === page)!;
  const Page = PAGES[page];

  useEffect(() => {
    document.title = `${item.label} · FB Scrat & AutoPost`;
  }, [item]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="hidden lg:block sticky top-0 h-screen p-4 pr-2">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-app p-4 animate-pop">
            <IconButton label="Đóng menu" className="absolute right-3 top-3" onClick={() => setDrawer(false)}>
              <X className="w-4 h-4" />
            </IconButton>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-app/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-16 max-w-[1400px] w-full mx-auto">
            <IconButton label="Mở menu" className="lg:hidden" onClick={() => setDrawer(true)}>
              <Menu className="w-5 h-5" />
            </IconButton>
            <Emo e={item.emoji} tone={item.tone} className="lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1 className="font-black text-xl sm:text-2xl text-ink truncate leading-tight">{item.label}</h1>
              <p className="hidden sm:block text-xs text-soft font-semibold truncate">{item.hint}</p>
            </div>
            <IconButton label={dark ? "Giao diện sáng" : "Giao diện tối"} onClick={toggle}>
              {dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </IconButton>
            {page !== "compose" && (
              // Wrapped so "hidden" is not fighting the button's own inline-flex; phones use the floating button
              <span className="hidden sm:block">
                <Button variant="primary" size="md" icon={<PenLine className="w-4 h-4" />} onClick={() => go("compose")}>
                  Soạn bài
                </Button>
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-24 pt-2 max-w-[1400px] w-full mx-auto">
          <div key={page} className="animate-pop">
            <Page />
          </div>
        </main>
      </div>

      {page !== "compose" && (
        <button
          type="button"
          onClick={() => go("compose")}
          aria-label="Soạn bài mới"
          className="sm:hidden fixed z-30 right-4 bottom-5 w-14 h-14 rounded-full bg-brand text-white shadow-[var(--shadow-pop)] flex items-center justify-center focus-ring"
        >
          <PenLine className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <span className="emoji text-5xl animate-bounce">🐣</span>
      <p className="text-sm font-bold text-soft">Đang khởi động…</p>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider loading={<Loading />}>
      <Shell />
    </AppProvider>
  );
}
