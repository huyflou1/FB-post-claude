import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { fmtDateTime, fmtRelative, POST_STATUS, snippet, startOfToday, useApp, type PageKey } from "../lib";
import { Badge, Block, Button, Emo, EmptyState, type Tone } from "../components/ui";
import { LogRow } from "./Logs";
import { compact, useReuse, useScraped } from "../components/ScrapedCard";
import { engagement } from "../../shared/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return { text: "Chào buổi sáng", emoji: "🌤️" };
  if (h < 14) return { text: "Chào buổi trưa", emoji: "🍜" };
  if (h < 18) return { text: "Chào buổi chiều", emoji: "☕" };
  return { text: "Chào buổi tối", emoji: "🌙" };
}

function Stat({ emoji, tone, value, label, onClick }: { emoji: string; tone: Tone; value: number | string; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover-wiggle text-left bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:-translate-y-0.5 transition focus-ring min-w-0"
    >
      <Emo e={emoji} tone={tone} size="md" />
      <div className="min-w-0">
        <p className="text-2xl sm:text-[28px] font-black text-ink leading-none tabular-nums">{value}</p>
        <p className="text-xs font-bold text-soft mt-1 truncate">{label}</p>
      </div>
    </button>
  );
}

// Successful / failed page posts per day for the last 7 days
function WeekChart() {
  const { state } = useApp();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return { start: d.getTime(), label: d.toLocaleDateString("vi-VN", { weekday: "short" }), ok: 0, fail: 0 };
  });
  for (const p of state.posts) {
    for (const t of p.targets) {
      if (!t.at || (t.status !== "success" && t.status !== "failed")) continue;
      const ts = Date.parse(t.at);
      const day = days.findLast((d) => ts >= d.start);
      if (!day || ts >= day.start + 86_400_000) continue;
      if (t.status === "success") day.ok++;
      else day.fail++;
    }
  }
  const max = Math.max(1, ...days.map((d) => d.ok + d.fail));
  const total = days.reduce((n, d) => n + d.ok, 0);

  return (
    <Block emoji="📊" tone="blue" title="7 ngày qua" subtitle={`${total} lượt đăng thành công`}>
      <div className="flex items-end gap-2 sm:gap-3 h-36 pt-2">
        {days.map((d, i) => {
          const h = ((d.ok + d.fail) / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full min-w-0" title={`${d.ok} thành công · ${d.fail} lỗi`}>
              <span className="text-[10px] font-bold text-soft tabular-nums">{d.ok + d.fail || ""}</span>
              <div className="w-full max-w-9 flex-1 flex flex-col justify-end">
                <div className="w-full rounded-xl overflow-hidden flex flex-col-reverse bg-field" style={{ height: `${Math.max(h, 4)}%` }}>
                  <div className="bg-indigo-400" style={{ height: `${(d.ok / Math.max(1, d.ok + d.fail)) * 100}%` }} />
                  <div className="bg-pink-300" style={{ height: `${(d.fail / Math.max(1, d.ok + d.fail)) * 100}%` }} />
                </div>
              </div>
              <span className={`text-[11px] font-bold ${i === 6 ? "text-brand-ink" : "text-faint"}`}>{i === 6 ? "Nay" : d.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-[11px] font-bold text-soft">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-indigo-400" /> Thành công
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-pink-300" /> Lỗi
        </span>
      </div>
    </Block>
  );
}

function HotPosts() {
  const { go, state } = useApp();
  const { items } = useScraped({ sort: "hot", limit: 4 });
  const { reuse, busyId } = useReuse();
  return (
    <Block
      emoji="🔥"
      tone="pink"
      title="Bài hot vừa săn"
      subtitle={state.sources.length ? `Từ ${state.sources.length} nguồn đang theo dõi` : "Chưa theo dõi nguồn nào"}
      actions={
        <Button size="sm" variant="ghost" onClick={() => go("hunt")}>
          Săn bài <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      }
      bodyClassName="p-2 sm:p-3"
    >
      {items.length === 0 ? (
        <EmptyState emoji="🔎" tone="pink" title="Chưa có bài nào" text="Thêm Fanpage làm nguồn để tìm bài nhiều tương tác." action={<Button variant="primary" onClick={() => go("hunt")}>Đi săn bài</Button>} />
      ) : (
        <ul>
          {items.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-field">
              {p.images[0] ? (
                <img src={p.images[0]} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-field" />
              ) : (
                <span className="emoji w-12 h-12 rounded-xl bg-pink-50 dark:bg-pink-400/10 flex items-center justify-center text-xl shrink-0">{["🥇", "🥈", "🥉", "✨"][i]}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink truncate">{snippet(p.message, 90) || "(bài chỉ có ảnh)"}</p>
                <p className="text-[11px] text-soft font-semibold">
                  {p.sourceName} · 🔥 {compact(engagement(p))} · ❤️ {compact(p.likes)}
                </p>
              </div>
              <Button size="sm" variant="soft" onClick={() => reuse(p, true)} loading={busyId === p.id + ":ai"} disabled={!!busyId}>
                <span className="emoji">✨</span> <span className="hidden sm:inline">Viết lại</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Onboarding() {
  const { state, go } = useApp();
  const steps: { done: boolean; emoji: string; title: string; text: string; page: PageKey; cta: string }[] = [
    { done: state.accounts.length > 0, emoji: "👥", title: "Thêm nick Facebook", text: "Dán access token hoặc dùng thử nick demo", page: "accounts", cta: "Thêm nick" },
    { done: state.posts.length > 0, emoji: "✍️", title: "Soạn bài đầu tiên", text: "Chọn các trang và viết nội dung", page: "compose", cta: "Soạn bài" },
    { done: state.posts.some((p) => p.status === "done" || p.status === "partial"), emoji: "🚀", title: "Đăng hoặc hẹn giờ", text: "Xem kết quả từng trang ở Lịch đăng", page: "queue", cta: "Mở lịch" },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Block emoji="🧭" tone="violet" title="Bắt đầu trong 3 bước" subtitle="Làm lần lượt nhé, mất chưa tới 1 phút">
      <ol className="grid sm:grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <li key={i} className={`rounded-2xl border p-4 flex flex-col gap-3 ${s.done ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/20 dark:bg-emerald-400/5" : "border-line bg-raised"}`}>
            <div className="flex items-center gap-3">
              <Emo e={s.done ? "✅" : s.emoji} tone={s.done ? "mint" : "gray"} />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-ink">
                  {i + 1}. {s.title}
                </p>
                <p className="text-xs text-soft">{s.text}</p>
              </div>
            </div>
            {!s.done && (
              <Button size="sm" variant={steps.findIndex((x) => !x.done) === i ? "primary" : "soft"} onClick={() => go(s.page)} className="self-start">
                {s.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
            {s.done && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Đã xong
              </span>
            )}
          </li>
        ))}
      </ol>
    </Block>
  );
}

export default function Dashboard() {
  const { state, go, now } = useApp();
  const g = greeting();
  const today = startOfToday();

  const enabledPages = state.accounts.reduce((n, a) => n + a.pages.filter((p) => p.enabled).length, 0);
  const queued = state.posts.filter((p) => p.status === "scheduled" || p.status === "running");
  let okToday = 0;
  let failToday = 0;
  for (const p of state.posts)
    for (const t of p.targets)
      if (t.at && Date.parse(t.at) >= today) {
        if (t.status === "success") okToday++;
        else if (t.status === "failed") failToday++;
      }

  const upcoming = [...queued].sort((a, b) => (a.status === "running" ? -1 : b.status === "running" ? 1 : Date.parse(a.scheduleAt ?? "0") - Date.parse(b.scheduleAt ?? "0"))).slice(0, 5);
  const badAccounts = state.accounts.filter((a) => a.status === "error");

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3 pt-1">
        <span className="emoji text-3xl">{g.emoji}</span>
        <div>
          <p className="font-black text-lg text-ink">{g.text}!</p>
          <p className="text-xs font-semibold text-soft">{new Date(now).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
      </div>

      {badAccounts.length > 0 && (
        <button
          type="button"
          onClick={() => go("accounts")}
          className="w-full flex items-center gap-3 rounded-3xl bg-rose-50 border border-rose-200 dark:bg-rose-400/10 dark:border-rose-400/20 p-4 text-left focus-ring"
        >
          <Emo e="🔑" tone="pink" />
          <span className="flex-1 text-sm font-bold text-rose-700 dark:text-rose-200">
            {badAccounts.map((a) => a.name).join(", ")} cần token mới để tiếp tục đăng bài
          </span>
          <ArrowRight className="w-4 h-4 text-rose-500" />
        </button>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat emoji="👥" tone="mint" value={state.accounts.length} label={`Nick · ${enabledPages} trang bật`} onClick={() => go("accounts")} />
        <Stat emoji="⏰" tone="sky" value={queued.length} label="Bài đang chờ đăng" onClick={() => go("queue")} />
        <Stat emoji="💌" tone="violet" value={okToday} label="Lượt đăng hôm nay" onClick={() => go("queue")} />
        <Stat emoji="🙀" tone="pink" value={failToday} label="Lỗi hôm nay" onClick={() => go("logs")} />
      </div>

      <Onboarding />

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-start">
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <Block
            emoji="📅"
            tone="sky"
            title="Sắp đăng"
            subtitle={queued.length ? `${queued.length} bài trong hàng chờ` : "Hàng chờ đang trống"}
            actions={
              <Button size="sm" variant="ghost" onClick={() => go("queue")}>
                Xem hết <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            }
            bodyClassName="p-2 sm:p-3"
          >
            {upcoming.length === 0 ? (
              <EmptyState emoji="🛋️" tone="sky" title="Chưa có bài nào chờ đăng" text="Soạn bài rồi chọn Hẹn giờ để app tự đăng đúng lúc." action={<Button variant="primary" onClick={() => go("compose")}>Soạn bài</Button>} />
            ) : (
              <ul>
                {upcoming.map((p) => {
                  const st = POST_STATUS[p.status];
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => go("queue")} className="w-full flex items-center gap-3 rounded-2xl p-2.5 hover:bg-field text-left focus-ring">
                        <Emo e={st.emoji} tone={st.tone} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-ink truncate">{snippet(p.content, 80) || "(chỉ có ảnh/video)"}</p>
                          <p className="text-xs text-soft">
                            {p.targets.length} trang · {p.status === "running" ? "đang đăng" : p.scheduleAt ? `${fmtDateTime(p.scheduleAt)} (${fmtRelative(p.scheduleAt, now)})` : "ngay bây giờ"}
                          </p>
                        </div>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>
          <WeekChart />
        </div>

        <div className="space-y-4 sm:space-y-5 min-w-0">
        <HotPosts />
        <Block
          emoji="📜"
          tone="peach"
          title="Hoạt động gần đây"
          actions={
            <Button size="sm" variant="ghost" onClick={() => go("logs")}>
              Nhật ký <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          }
          bodyClassName="p-2 sm:p-3"
        >
          {state.logs.length === 0 ? (
            <EmptyState emoji="🍃" tone="peach" title="Yên ắng quá" text="Mọi hoạt động đăng bài sẽ hiện ở đây." />
          ) : (
            <ul>
              {state.logs.slice(0, 9).map((l) => (
                <LogRow key={l.id} log={l} compact />
              ))}
            </ul>
          )}
        </Block>
        </div>
      </div>
    </div>
  );
}
