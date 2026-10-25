import React, { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Star, Trash2, X } from "lucide-react";
import type { ScrapedSort, ScrapeSource } from "../../shared/types";
import { api, fmtRelative, useApp } from "../lib";
import { compact, ScrapedCard, useScraped } from "../components/ScrapedCard";
import { Avatar, Badge, Block, Button, EmptyState, IconButton, inputCls, Segmented, Toggle, type Tone } from "../components/ui";

const KIND: Record<ScrapeSource["kind"], { label: string; tone: Tone }> = {
  own: { label: "Trang của tôi", tone: "mint" },
  public: { label: "Công khai", tone: "sky" },
  demo: { label: "Demo", tone: "lemon" },
};

const AUTO = [
  { value: 0, label: "Thủ công" },
  { value: 3, label: "Mỗi 3 giờ" },
  { value: 6, label: "Mỗi 6 giờ" },
  { value: 12, label: "Mỗi 12 giờ" },
  { value: 24, label: "Mỗi ngày" },
];

const SORTS: { value: ScrapedSort; label: string; emoji: string }[] = [
  { value: "new", label: "Mới", emoji: "🆕" },
  { value: "hot", label: "Hot", emoji: "🔥" },
  { value: "likes", label: "Cảm xúc", emoji: "❤️" },
  { value: "comments", label: "Bình luận", emoji: "💬" },
  { value: "shares", label: "Chia sẻ", emoji: "🔁" },
];

function AddSource() {
  const { state, run, toast } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const known = new Set(state.sources.map((s) => s.pageId));
  const ownPages = state.accounts.flatMap((a) => a.pages.map((p) => ({ ...p, demo: a.status === "demo", color: a.color }))).filter((p) => !known.has(p.id) && !known.has(`demo_${p.id}`));

  const add = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    const src = await run(() => api.post<ScrapeSource>("/api/sources", { input: value }));
    setBusy(false);
    if (src) {
      setInput("");
      toast(`Đã thêm ${src.name}, đang cào bài…`, "ok", "🔎");
    }
  };

  return (
    <Block emoji="➕" tone="sky" title="Thêm nguồn" subtitle="Fanpage muốn lấy bài">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(input)}
          placeholder="facebook.com/tentrang hoặc ID"
          className={`${inputCls} py-2`}
          aria-label="Link hoặc ID trang"
        />
        <Button variant="primary" onClick={() => add(input)} loading={busy} disabled={!input.trim()} icon={<Plus className="w-4 h-4" />} aria-label="Thêm nguồn" />
      </div>
      {ownPages.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold text-faint mb-1.5">Thêm nhanh trang của bạn</p>
          <div className="flex flex-wrap gap-1.5">
            {ownPages.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p.id)}
                disabled={busy}
                className="h-8 pl-1 pr-2.5 rounded-full border border-line bg-raised hover:border-brand flex items-center gap-1.5 text-[12px] font-bold text-ink focus-ring disabled:opacity-50"
              >
                <Avatar src={p.picture} name={p.name} color={p.color} size={22} />
                <span className="truncate max-w-32">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-faint font-semibold mt-3 leading-relaxed">
        Trang do nick của bạn quản lý cào được ngay. Trang công khai khác cần App Facebook có quyền <b>Page Public Content Access</b>.
      </p>
    </Block>
  );
}

function SourceRow({ s, active, onPick }: { s: ScrapeSource; active: boolean; onPick: () => void }) {
  const { run, confirm, now } = useApp();
  const kind = KIND[s.kind];

  const del = async () => {
    if (await confirm({ title: `Xoá nguồn ${s.name}?`, text: "Các bài chưa lưu của nguồn này sẽ bị xoá, bài đã lưu trong kho vẫn giữ lại.", danger: true, confirmLabel: "Xoá nguồn" }))
      run(() => api.del(`/api/sources/${s.id}`), "Đã xoá nguồn");
  };

  return (
    <li className={`rounded-2xl border p-2.5 transition ${active ? "border-brand bg-indigo-50/60 dark:bg-indigo-400/10" : "border-line hover:bg-field"}`}>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={onPick} className="flex items-center gap-2.5 min-w-0 flex-1 text-left focus-ring rounded-xl" aria-pressed={active}>
          <Avatar src={s.picture} name={s.name} color="#7c9cff" size={36} />
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold text-ink truncate">{s.name}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-faint font-semibold">
              <Badge tone={kind.tone} className="!text-[10px] !px-1.5">
                {kind.label}
              </Badge>
              {s.postCount} bài{s.fans ? ` · ${compact(s.fans)} theo dõi` : ""}
            </span>
          </span>
        </button>
        <IconButton label="Cào ngay" onClick={() => run(() => api.post(`/api/sources/${s.id}/fetch`, { limit: 25 }))} disabled={s.fetching}>
          {s.fetching ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : <RefreshCw className="w-4 h-4" />}
        </IconButton>
        <IconButton label="Xoá nguồn" onClick={del} className="hover:text-rose-500">
          <Trash2 className="w-4 h-4" />
        </IconButton>
      </div>
      {s.error && <p className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-400/10 rounded-xl px-2.5 py-1.5">{s.error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <select
          value={s.autoEveryHours}
          onChange={(e) => run(() => api.patch(`/api/sources/${s.id}`, { autoEveryHours: Number(e.target.value) }))}
          className="h-7 rounded-lg bg-field border border-line text-[11px] font-bold text-soft px-1.5 focus:outline-none focus:border-brand"
          aria-label="Tự động cào"
        >
          {AUTO.map((a) => (
            <option key={a.value} value={a.value}>
              {a.value ? `🔁 ${a.label}` : a.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-faint font-semibold ml-auto">{s.fetching ? "Đang cào…" : s.lastFetchedAt ? `Cào ${fmtRelative(s.lastFetchedAt, now)}` : "Chưa cào"}</span>
      </div>
    </li>
  );
}

export default function Hunt() {
  const { state, run, confirm } = useApp();
  const [sourceId, setSourceId] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ScrapedSort>("hot");
  const [withImages, setWithImages] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { items, total, loading } = useScraped({ sourceId: sourceId || undefined, q, sort, withImages, limit: 150 });
  const anyFetching = state.sources.some((s) => s.fetching);
  const activeSource = state.sources.find((s) => s.id === sourceId);

  const visibleIds = useMemo(() => items.map((p) => p.id), [items]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));

  const bulk = async (action: "save" | "delete") => {
    const ids = selectedVisible;
    if (action === "delete" && !(await confirm({ title: `Xoá ${ids.length} bài khỏi danh sách?`, danger: true, confirmLabel: "Xoá" }))) return;
    const ok = await run(() => api.post("/api/scraped/bulk", { ids, action }), action === "save" ? `Đã lưu ${ids.length} bài vào kho` : `Đã xoá ${ids.length} bài`);
    if (ok) setSelected(new Set());
  };

  const clearUnsaved = async () => {
    if (await confirm({ title: activeSource ? `Dọn bài chưa lưu của ${activeSource.name}?` : "Dọn mọi bài chưa lưu?", text: "Bài đã lưu trong Kho nội dung vẫn được giữ.", danger: true, confirmLabel: "Dọn dẹp" }))
      run(() => api.post("/api/scraped/clear", { sourceId: sourceId || undefined }), "Đã dọn bài chưa lưu");
  };

  return (
    <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-4 sm:gap-5 items-start">
      {/* Sources: on narrow screens they move below the feed once set up, so posts come first */}
      <div className={`space-y-4 sm:space-y-5 xl:sticky xl:top-20 ${state.sources.length ? "order-last xl:order-none" : ""}`}>
        <AddSource />
        <Block
          emoji="📡"
          tone="violet"
          title="Nguồn đang theo dõi"
          subtitle={`${state.sources.length} trang · ${state.scrapedCount} bài`}
          actions={
            state.sources.length > 0 && (
              <Button size="sm" variant="ghost" icon={<RefreshCw className={`w-3.5 h-3.5 ${anyFetching ? "animate-spin" : ""}`} />} onClick={() => run(() => api.post("/api/sources/fetch-all"), "Đang cào tất cả nguồn")} disabled={anyFetching}>
                Cào hết
              </Button>
            )
          }
          bodyClassName="p-3"
        >
          {state.sources.length === 0 ? (
            <EmptyState emoji="📡" tone="violet" title="Chưa có nguồn nào" text="Thêm một Fanpage ở trên để bắt đầu săn bài." />
          ) : (
            <ul className="space-y-2 max-h-[52vh] overflow-y-auto scroll-thin -mx-1 px-1">
              <li>
                <button
                  type="button"
                  onClick={() => setSourceId("")}
                  className={`w-full rounded-2xl border px-3 py-2 text-left text-[13px] font-extrabold transition focus-ring ${!sourceId ? "border-brand bg-indigo-50/60 dark:bg-indigo-400/10 text-ink" : "border-line text-soft hover:bg-field"}`}
                >
                  <span className="emoji mr-1.5">🗂️</span> Tất cả nguồn
                </button>
              </li>
              {state.sources.map((s) => (
                <SourceRow key={s.id} s={s} active={s.id === sourceId} onPick={() => setSourceId(s.id === sourceId ? "" : s.id)} />
              ))}
            </ul>
          )}
        </Block>
      </div>

      {/* Feed */}
      <div className="space-y-4 min-w-0">
        <Block bodyClassName="p-3 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <Segmented value={sort} onChange={setSort} options={SORTS} />
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm từ khoá trong bài…" className={`${inputCls} pl-10`} aria-label="Tìm bài" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-soft">
            {activeSource && (
              <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-indigo-50 text-brand-ink dark:bg-indigo-400/10">
                {activeSource.name}
                <button type="button" onClick={() => setSourceId("")} aria-label="Bỏ lọc nguồn" className="w-5 h-5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-400/20 flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <label className="inline-flex items-center gap-2">
              <Toggle checked={withImages} onChange={setWithImages} label="Chỉ bài có ảnh" /> Chỉ bài có ảnh
            </label>
            <span className="ml-auto">{total} bài</span>
            {state.scrapedCount > state.savedCount && (
              <Button size="xs" variant="ghost" onClick={clearUnsaved}>
                Dọn bài chưa lưu
              </Button>
            )}
          </div>
        </Block>

        {selectedVisible.length > 0 && (
          <div className="sticky top-[72px] z-20 flex items-center gap-2 rounded-2xl bg-ink text-block px-4 py-2.5 shadow-[var(--shadow-pop)] animate-pop">
            <span className="text-sm font-extrabold flex-1">Đã chọn {selectedVisible.length} bài</span>
            <Button size="sm" variant="primary" icon={<Star className="w-3.5 h-3.5" />} onClick={() => bulk("save")}>
              Lưu vào kho
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => bulk("delete")}>
              Xoá
            </Button>
            <Button size="sm" variant="ghost" className="!text-block/70 hover:!bg-white/10" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <Block>
            {loading || anyFetching ? (
              <EmptyState emoji="🛰️" tone="sky" title="Đang cào bài…" text="Bài mới sẽ hiện ra ngay khi lấy xong." />
            ) : state.sources.length === 0 ? (
              <EmptyState emoji="🔎" tone="sky" title="Bắt đầu săn bài" text="Thêm Fanpage làm nguồn, app sẽ lấy bài mới nhất kèm lượt thích, bình luận, chia sẻ để bạn chọn bài hot." />
            ) : (
              <EmptyState emoji="🍃" tone="sky" title="Không có bài nào khớp" text="Thử đổi bộ lọc hoặc bấm Cào hết để lấy bài mới." />
            )}
          </Block>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1">
              <button
                type="button"
                className="text-xs font-bold text-brand-ink hover:underline"
                onClick={() => setSelected(selectedVisible.length === visibleIds.length ? new Set() : new Set(visibleIds))}
              >
                {selectedVisible.length === visibleIds.length ? "Bỏ chọn tất cả" : "Chọn tất cả bài đang hiện"}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
              {items.map((p, i) => (
                <ScrapedCard
                  key={p.id}
                  post={p}
                  rank={sort === "new" ? undefined : i}
                  selected={selected.has(p.id)}
                  onSelect={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      v ? n.add(p.id) : n.delete(p.id);
                      return n;
                    })
                  }
                />
              ))}
            </div>
          </>
        )}

        <p className="text-[11px] text-faint font-semibold px-1 leading-relaxed">
          <span className="emoji">💡</span> Chỉ đăng lại nội dung bạn có quyền sử dụng. Nên bấm <b>AI viết lại</b> để có bài của riêng mình, và ghi nguồn khi dùng ảnh của người khác.
        </p>
      </div>
    </div>
  );
}
