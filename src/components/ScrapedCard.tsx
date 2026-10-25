import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, PenLine, Sparkles, Star, Trash2 } from "lucide-react";
import type { MediaFile, ScrapedPage, ScrapedPost, ScrapedQuery } from "../../shared/types";
import { engagement } from "../../shared/types";
import { api, fmtRelative, useApp } from "../lib";
import { Badge, Button, Checkbox, IconButton } from "./ui";

// Loads scraped posts for a query and reloads whenever the server says they changed
export function useScraped(query: ScrapedQuery) {
  const { state } = useApp();
  const [data, setData] = useState<ScrapedPage>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "" || v === false) continue;
      params.set(k, v === true ? "1" : String(v));
    }
    if (query.saved === false) params.set("saved", "0");
    try {
      const r = await api.get<ScrapedPage>(`/api/scraped?${params}`);
      if (n === seq.current) setData(r);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // key captures every query field
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load, state.scrapedVersion]);

  return { ...data, loading, reload: load };
}

export function compact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "tr";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Copy the post's images locally, then open the composer with them
export function useReuse() {
  const { openComposer, toast } = useApp();
  const [busyId, setBusyId] = useState("");
  const reuse = async (p: ScrapedPost, ai: boolean) => {
    setBusyId(p.id + (ai ? ":ai" : ""));
    try {
      const media = p.images.length ? await api.post<MediaFile[]>(`/api/scraped/${encodeURIComponent(p.id)}/import`) : [];
      if (p.images.length && media.length < p.images.length) toast(`Lấy được ${media.length}/${p.images.length} ảnh`, "info", "🖼️");
      openComposer({ kind: "reuse", content: p.message, media, ai });
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusyId("");
    }
  };
  return { reuse, busyId };
}

interface CardProps {
  post: ScrapedPost;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  showSource?: boolean;
  rank?: number;
}

export function ScrapedCard({ post: p, selected, onSelect, showSource = true, rank }: CardProps) {
  const { run, now } = useApp();
  const { reuse, busyId } = useReuse();
  const [expanded, setExpanded] = useState(false);
  const long = p.message.length > 220;
  const hot = engagement(p);

  const toggleSave = () => run(() => api.post("/api/scraped/bulk", { ids: [p.id], action: p.saved ? "unsave" : "save" }), p.saved ? "Đã bỏ lưu" : "Đã lưu vào Kho nội dung");

  return (
    <article className={`group bg-block rounded-3xl border shadow-[var(--shadow-block)] overflow-hidden flex flex-col transition ${selected ? "border-brand ring-4 ring-indigo-400/15" : "border-line"}`}>
      {p.images.length > 0 && (
        <div className="relative aspect-[3/2] bg-field overflow-hidden">
          <img src={p.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300" />
          {p.images.length > 1 && <span className="absolute right-2 bottom-2 text-[11px] font-black text-white bg-black/55 rounded-lg px-2 py-0.5">+{p.images.length - 1} ảnh</span>}
          {p.hasVideo && <span className="absolute left-2 bottom-2 emoji text-sm bg-black/55 rounded-lg px-1.5 py-0.5">🎬</span>}
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {onSelect && <Checkbox checked={!!selected} onChange={onSelect} label="Chọn bài này" />}
          {rank !== undefined && rank < 3 && <span className="emoji text-base">{["🥇", "🥈", "🥉"][rank]}</span>}
          <div className="min-w-0 flex-1">
            {showSource && <p className="text-[12px] font-extrabold text-ink truncate">{p.sourceName}</p>}
            <p className="text-[11px] text-faint font-semibold">{fmtRelative(p.createdTime, now)}</p>
          </div>
          {p.usedAt && <Badge tone="mint">Đã dùng</Badge>}
          <IconButton label={p.saved ? "Bỏ lưu" : "Lưu vào kho"} onClick={toggleSave} className={p.saved ? "text-amber-500 hover:text-amber-600" : ""}>
            <Star className="w-4 h-4" fill={p.saved ? "currentColor" : "none"} />
          </IconButton>
        </div>

        <p className={`text-[13.5px] leading-relaxed text-ink whitespace-pre-line break-words ${expanded ? "" : "line-clamp-5"}`}>
          {p.message || <span className="text-faint italic">(bài chỉ có ảnh/video)</span>}
        </p>
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="self-start text-[11px] font-bold text-brand-ink hover:underline">
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        )}

        <div className="mt-auto flex items-center gap-3 text-[12px] font-bold text-soft pt-1">
          <span title="Cảm xúc">❤️ {compact(p.likes)}</span>
          <span title="Bình luận">💬 {compact(p.comments)}</span>
          <span title="Chia sẻ">🔁 {compact(p.shares)}</span>
          <span className="ml-auto" title="Điểm tương tác = cảm xúc + bình luận×2 + chia sẻ×3">
            <Badge tone={hot > 2000 ? "pink" : hot > 500 ? "peach" : "gray"}>🔥 {compact(hot)}</Badge>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 pb-3">
        <Button size="sm" variant="primary" icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => reuse(p, true)} loading={busyId === p.id + ":ai"} disabled={!!busyId}>
          AI viết lại
        </Button>
        <Button size="sm" variant="soft" icon={<PenLine className="w-3.5 h-3.5" />} onClick={() => reuse(p, false)} loading={busyId === p.id} disabled={!!busyId}>
          Dùng
        </Button>
        <div className="ml-auto flex items-center">
          {p.permalink && (
            <a href={p.permalink} target="_blank" rel="noreferrer" title="Xem bài gốc" aria-label="Xem bài gốc" className="w-8 h-8 inline-flex items-center justify-center rounded-xl text-soft hover:bg-field hover:text-ink focus-ring">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <IconButton label="Xoá khỏi danh sách" onClick={() => run(() => api.post("/api/scraped/bulk", { ids: [p.id], action: "delete" }))} className="hover:text-rose-500">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      </div>
    </article>
  );
}
