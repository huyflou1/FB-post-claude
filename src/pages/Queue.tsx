import React, { useMemo, useState } from "react";
import { ChevronDown, Copy, ExternalLink, Pause, Pencil, Play, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import type { Post, PostStatus } from "../../shared/types";
import { api, fmtDateTime, fmtRelative, POST_STATUS, postStats, RESULT_STATUS, snippet, useApp } from "../lib";
import { Avatar, Badge, Block, Button, Emo, EmptyState, IconButton, inputCls, ProgressBar, Segmented } from "../components/ui";

type Filter = "all" | "waiting" | "running" | "finished" | "problem" | "draft";

const FILTERS: { value: Filter; label: string; emoji: string; match: (s: PostStatus) => boolean }[] = [
  { value: "all", label: "Tất cả", emoji: "🗂️", match: () => true },
  { value: "waiting", label: "Chờ đăng", emoji: "⏰", match: (s) => s === "scheduled" },
  { value: "running", label: "Đang đăng", emoji: "🚀", match: (s) => s === "running" },
  { value: "finished", label: "Hoàn tất", emoji: "✅", match: (s) => s === "done" },
  { value: "problem", label: "Có lỗi", emoji: "⚠️", match: (s) => s === "failed" || s === "partial" || s === "cancelled" },
  { value: "draft", label: "Nháp", emoji: "📝", match: (s) => s === "draft" },
];

// Running first, then upcoming by time, drafts, then history newest first
function order(p: Post) {
  if (p.status === "running") return [0, 0];
  if (p.status === "scheduled") return [1, Date.parse(p.scheduleAt ?? p.createdAt)];
  if (p.status === "draft") return [2, -Date.parse(p.updatedAt)];
  return [3, -Date.parse(p.finishedAt ?? p.updatedAt)];
}

function fbUrl(id: string) {
  return `https://www.facebook.com/${id}`;
}

function PostCard({ post }: { post: Post }) {
  const { state, run, confirm, openComposer, now } = useApp();
  const [open, setOpen] = useState(post.status === "running");
  const st = POST_STATUS[post.status];
  const s = postStats(post);
  const accName = (id: string) => state.accounts.find((a) => a.id === id);

  const when =
    post.status === "running"
      ? `Đang đăng · ${s.ok + s.failed}/${s.total} trang`
      : post.status === "scheduled"
        ? post.scheduleAt
          ? `Đăng lúc ${fmtDateTime(post.scheduleAt)} · ${fmtRelative(post.scheduleAt, now)}`
          : "Sắp đăng"
        : post.status === "draft"
          ? `Sửa ${fmtRelative(post.updatedAt, now)}`
          : `Xong ${fmtRelative(post.finishedAt, now)}`;

  const del = async () => {
    if (await confirm({ title: "Xoá bài viết này?", text: "Bài đã đăng trên Facebook vẫn giữ nguyên, chỉ xoá khỏi app.", danger: true, confirmLabel: "Xoá bài" }))
      run(() => api.del(`/api/posts/${post.id}`), "Đã xoá bài");
  };

  const runNow = async () => {
    if (post.status === "draft" || post.status === "scheduled") {
      const ok = await confirm({ title: "Đăng ngay bây giờ?", emoji: "🚀", text: `Bài sẽ được đăng lần lượt lên ${s.total} trang.`, confirmLabel: "Đăng ngay" });
      if (!ok) return;
    }
    run(() => api.post(`/api/posts/${post.id}/run`), "Đã bắt đầu đăng");
  };

  return (
    <li className="bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] overflow-hidden">
      <div className="p-4 flex gap-3 sm:gap-4">
        <Emo e={st.emoji} tone={st.tone} size="md" className={post.status === "running" ? "animate-pulse" : ""} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="text-sm font-bold text-ink line-clamp-2 flex-1 break-words">{snippet(post.content, 220) || <span className="text-soft italic">(không có chữ)</span>}</p>
            <Badge tone={st.tone} className="shrink-0">
              {st.label}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs font-semibold text-soft">
            <span>{when}</span>
            <span>🎯 {s.total} trang</span>
            {post.media.length > 0 && <span>{post.media.some((m) => m.type === "video") ? "🎬 1 video" : `🖼️ ${post.media.length} ảnh`}</span>}
            {post.link && <span>🔗 Có link</span>}
            {post.repeat !== "none" && <Badge tone="violet">🔁 {post.repeat === "daily" ? "Hằng ngày" : "Hằng tuần"}</Badge>}
          </div>
          {s.total > 0 && post.status !== "draft" && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <ProgressBar ok={s.ok} failed={s.failed} total={s.total} running={post.status === "running"} />
              </div>
              <span className="text-[11px] font-bold text-soft tabular-nums whitespace-nowrap">
                <span className="text-emerald-600 dark:text-emerald-300">{s.ok}</span> / {s.total}
                {s.failed > 0 && <span className="text-rose-500"> · {s.failed} lỗi</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 pb-3 flex-wrap">
        {post.status === "running" ? (
          <Button size="sm" variant="danger" icon={<Pause className="w-3.5 h-3.5" />} onClick={() => run(() => api.post(`/api/posts/${post.id}/cancel`), "Sẽ dừng sau trang đang đăng")} disabled={post.cancelRequested}>
            {post.cancelRequested ? "Đang dừng…" : "Dừng"}
          </Button>
        ) : (
          <>
            {(post.status === "draft" || post.status === "scheduled") && (
              <Button size="sm" variant="primary" icon={<Play className="w-3.5 h-3.5" />} onClick={runNow} disabled={!s.total}>
                Đăng ngay
              </Button>
            )}
            {(post.status === "failed" || post.status === "partial" || post.status === "cancelled") && (
              <Button size="sm" variant="primary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => run(() => api.post(`/api/posts/${post.id}/retry`), "Đang thử lại các trang lỗi")}>
                Thử lại {s.total - s.ok} trang
              </Button>
            )}
            {post.status === "scheduled" && (
              <Button size="sm" variant="soft" icon={<Pause className="w-3.5 h-3.5" />} onClick={() => run(() => api.post(`/api/posts/${post.id}/cancel`), "Đã huỷ lịch, bài chuyển về nháp")}>
                Huỷ lịch
              </Button>
            )}
            {s.ok === 0 && (
              <Button size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => openComposer({ kind: "edit", post })}>
                Sửa
              </Button>
            )}
          </>
        )}
        <Button size="sm" variant="ghost" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => run(() => api.post(`/api/posts/${post.id}/duplicate`), "Đã nhân bản thành bản nháp")}>
          Nhân bản
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {post.status !== "running" && (
            <IconButton label="Xoá bài" onClick={del} className="hover:text-rose-500">
              <Trash2 className="w-4 h-4" />
            </IconButton>
          )}
          {s.total > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              Chi tiết <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {open && s.total > 0 && (
        <ul className="border-t border-line bg-raised divide-y divide-line animate-pop">
          {post.targets.map((t) => {
            const acc = accName(t.accountId);
            const page = acc?.pages.find((p) => p.id === t.pageId);
            const rs = RESULT_STATUS[t.status];
            const live = post.status === "running" && t.status === "pending";
            return (
              <li key={`${t.accountId}:${t.pageId}`} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar src={page?.picture} name={t.pageName} color={acc?.color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink truncate">{t.pageName}</p>
                  <p className={`text-[11px] font-semibold truncate ${t.error ? "text-rose-500" : "text-faint"}`} title={t.error}>
                    {t.error ?? `${acc?.name ?? "Nick đã xoá"}${t.at ? ` · ${fmtDateTime(t.at)}` : ""}`}
                  </p>
                </div>
                {t.fbPostId && acc?.status !== "demo" && (
                  <a href={fbUrl(t.fbPostId)} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-ink hover:underline flex items-center gap-1 shrink-0">
                    Xem <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <Badge tone={live ? "violet" : rs.tone} className="shrink-0">
                  {live ? "Đang chờ lượt" : rs.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default function Queue() {
  const { state, go, run, confirm } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of FILTERS) c[f.value] = state.posts.filter((p) => f.match(p.status)).length;
    return c;
  }, [state.posts]);

  const match = FILTERS.find((f) => f.value === filter)!.match;
  const list = state.posts
    .filter((p) => match(p.status) && (!q || p.content.toLowerCase().includes(q.toLowerCase()) || p.targets.some((t) => t.pageName.toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => {
      const [ga, va] = order(a);
      const [gb, vb] = order(b);
      return ga - gb || va - vb;
    });

  const clearDone = async () => {
    if (await confirm({ title: `Xoá ${counts.finished} bài đã hoàn tất?`, text: "Chỉ xoá khỏi danh sách trong app, bài trên Facebook không bị ảnh hưởng.", danger: true, confirmLabel: "Dọn dẹp" }))
      run(() => api.post("/api/posts/clear-finished"), "Đã dọn các bài hoàn tất");
  };

  return (
    <div className="space-y-4">
      <Block bodyClassName="p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
        <Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, emoji: f.emoji, count: counts[f.value] }))} />
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo nội dung hoặc tên trang…" className={`${inputCls} pl-10`} aria-label="Tìm bài viết" />
        </div>
        {counts.finished > 0 && (
          <Button variant="ghost" icon={<Sparkles className="w-4 h-4" />} onClick={clearDone}>
            Dọn bài xong
          </Button>
        )}
      </Block>

      {list.length === 0 ? (
        <Block>
          <EmptyState
            emoji={state.posts.length ? "🔍" : "📭"}
            tone="sky"
            title={state.posts.length ? "Không có bài nào ở mục này" : "Chưa có bài viết nào"}
            text={state.posts.length ? "Thử chọn mục khác hoặc đổi từ khoá." : "Soạn bài đầu tiên, chọn trang và đăng ngay hoặc hẹn giờ."}
            action={
              <Button variant="primary" onClick={() => go("compose")}>
                Soạn bài
              </Button>
            }
          />
        </Block>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
