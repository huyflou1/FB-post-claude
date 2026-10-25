import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dices, Globe2, ImagePlus, Link2, Loader2, MoreHorizontal, Save, Search, Send, ThumbsUp, MessageCircle, Share2, X } from "lucide-react";
import type { MediaFile, Post, PostInput, Repeat, Template } from "../../shared/types";
import { countVariants, renderContent, seededRandom, VARIABLES } from "../../shared/spintax";
import { api, fmtSize, safeStorage, saveStorage, toLocalInput, useApp } from "../lib";
import { Avatar, Badge, Block, Button, Checkbox, Emo, EmptyState, inputCls, Label, Modal, Segmented } from "../components/ui";
import AiWriter from "../components/AiWriter";

type Mode = PostInput["mode"];

interface Draft {
  content: string;
  link: string;
  media: MediaFile[];
  selected: string[];
  mode: Mode;
  scheduleAt: string;
  repeat: Repeat;
  delayMin: number;
  delayMax: number;
}

const DRAFT_KEY = "composer-draft";
const EMOJIS = "😀 😍 🥰 😘 😂 🤣 😎 🤩 🥳 😇 🤗 🤔 😴 😭 😡 👍 👏 🙏 💪 👉 👇 ✌️ 🤝 ❤️ 🧡 💛 💚 💙 💜 🖤 🔥 ✨ 🌟 ⭐ 🎉 🎁 🎈 🛍️ 💰 💸 📦 🚚 📣 📢 ✅ ❌ ⚡ 💯 🆕 🆓 ☀️ 🌈 🌸 🍀 ☕ 🍜 🐶 🐱".split(" ");
const key = (accountId: string, pageId: string) => `${accountId}:${pageId}`;

function blankDraft(delayMin: number, delayMax: number): Draft {
  return { content: "", link: "", media: [], selected: [], mode: "now", scheduleAt: "", repeat: "none", delayMin, delayMax };
}

function draftFromPost(p: Post): Draft {
  return {
    content: p.content,
    link: p.link ?? "",
    media: p.media,
    selected: p.targets.map((t) => key(t.accountId, t.pageId)),
    mode: p.scheduleAt ? "schedule" : p.status === "draft" ? "draft" : "now",
    scheduleAt: p.scheduleAt ? toLocalInput(new Date(p.scheduleAt)) : "",
    repeat: p.repeat,
    delayMin: p.delayMin,
    delayMax: p.delayMax,
  };
}

// ---------- Editor ----------

function EditorBlock({
  d,
  set,
  onSaveTemplate,
  aiOpen,
  setAiOpen,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  onSaveTemplate: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
}) {
  const { state } = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const variants = countVariants(d.content);

  // Inserts at the caret; with a selection, spin wraps it as the first option
  const insert = (text: string, wrapSpin = false) => {
    const el = ref.current;
    const start = el?.selectionStart ?? d.content.length;
    const end = el?.selectionEnd ?? d.content.length;
    const selected = d.content.slice(start, end);
    const piece = wrapSpin ? `{${selected || "lựa chọn 1"}|lựa chọn 2}` : text;
    const next = d.content.slice(0, start) + piece + d.content.slice(end);
    set({ content: next });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + piece.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <Block
      emoji="✍️"
      tone="pink"
      title="Nội dung"
      subtitle="Hỗ trợ spintax {a|b} và biến {{page}}"
      actions={
        <>
          <Button size="sm" variant="soft" onClick={() => setAiOpen(true)}>
            <span className="emoji">✨</span> Viết bằng AI
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTplOpen(true)}>
            <span className="emoji">📚</span> <span className="hidden sm:inline">Dùng mẫu</span>
          </Button>
        </>
      }
    >
      <div className="rounded-2xl border border-line bg-field focus-within:border-brand focus-within:ring-4 focus-within:ring-indigo-400/15 transition">
        <textarea
          ref={ref}
          value={d.content}
          onChange={(e) => set({ content: e.target.value })}
          placeholder="Hôm nay bạn muốn chia sẻ điều gì? ✨"
          rows={8}
          className="w-full bg-transparent resize-y min-h-40 px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          aria-label="Nội dung bài viết"
        />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <div className="relative">
            <Button size="xs" variant="ghost" onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen}>
              <span className="emoji text-sm">😊</span> Emoji
            </Button>
            {emojiOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEmojiOpen(false)} />
                <div className="absolute z-20 left-0 bottom-9 w-[280px] p-2 rounded-2xl bg-block border border-line shadow-[var(--shadow-pop)] grid grid-cols-8 gap-0.5 animate-pop">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => insert(e)} className="emoji text-xl h-8 rounded-lg hover:bg-field focus-ring">
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button size="xs" variant="ghost" onClick={() => insert("", true)} title="Bôi đen chữ rồi bấm để tạo các lựa chọn ngẫu nhiên">
            <Dices className="w-3.5 h-3.5" /> Spin
          </Button>
          <span className="w-px h-4 bg-line mx-1" />
          {VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insert(`{{${v.key}}}`)}
              title={`Chèn ${v.label.toLowerCase()}`}
              className="h-7 px-2 rounded-lg text-[11px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 dark:text-violet-300 dark:bg-violet-400/10 dark:hover:bg-violet-400/20 focus-ring"
            >
              {v.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-2 text-[11px] font-bold text-faint pr-1">
            {variants > 1 && <Badge tone="violet">≈ {variants >= 99999 ? "99k+" : variants.toLocaleString("vi-VN")} biến thể</Badge>}
            <span className="tabular-nums">{d.content.length.toLocaleString("vi-VN")} ký tự</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Link2 className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={d.link} onChange={(e) => set({ link: e.target.value })} placeholder="Gắn link (không bắt buộc)" className={`${inputCls} pl-10`} aria-label="Đường link" />
        </div>
        <Button variant="ghost" icon={<Save className="w-4 h-4" />} onClick={onSaveTemplate} disabled={!d.content.trim()}>
          Lưu thành mẫu
        </Button>
      </div>

      <AiWriter
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        current={d.content}
        onUse={(text, how) => set({ content: how === "append" && d.content.trim() ? `${d.content.trimEnd()}

${text}` : text })}
      />

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Chọn mẫu nội dung" emoji="📚" width="max-w-2xl">
        {state.templates.length === 0 ? (
          <EmptyState emoji="📭" tone="lemon" title="Chưa có mẫu nào" text="Viết nội dung rồi bấm Lưu thành mẫu để dùng lại sau." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {state.templates.map((t: Template) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  set({ content: d.content.trim() ? `${d.content}\n\n${t.content}` : t.content });
                  setTplOpen(false);
                }}
                className="text-left rounded-2xl border border-line p-3 hover:border-brand hover:bg-field transition focus-ring"
              >
                <p className="font-extrabold text-sm text-ink flex items-center gap-2">
                  <span className="emoji">{t.emoji}</span> {t.title}
                </p>
                <p className="text-xs text-soft mt-1 line-clamp-3 whitespace-pre-line">{t.content}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </Block>
  );
}

// ---------- Media ----------

function MediaBlock({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hasVideo = d.media.some((m) => m.type === "video");

  const upload = async (files: File[]) => {
    const picked = files.filter((f) => /^(image|video)\//.test(f.type));
    if (!picked.length) return toast("Chỉ nhận tệp ảnh hoặc video", "err");
    const videos = picked.filter((f) => f.type.startsWith("video/"));
    if (videos.length > 1 || (videos.length && (picked.length > 1 || d.media.length))) return toast("Mỗi bài chỉ kèm 1 video và không kèm ảnh khác", "err");
    if (hasVideo) return toast("Bài đã có video, hãy gỡ video trước khi thêm ảnh", "err");
    if (d.media.length + picked.length > 10) return toast("Tối đa 10 ảnh mỗi bài", "err");
    const fd = new FormData();
    picked.forEach((f) => fd.append("files", f));
    setBusy(true);
    try {
      const out = await api.post<MediaFile[]>("/api/upload", fd);
      set({ media: [...d.media, ...out] });
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block emoji="🖼️" tone="peach" title="Ảnh / Video" subtitle="Tối đa 10 ảnh hoặc 1 video">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={`grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-2xl ${drag ? "ring-4 ring-indigo-400/30" : ""}`}
      >
        {d.media.map((m) => (
          <div key={m.id} className="relative aspect-square rounded-2xl overflow-hidden bg-field group">
            {m.type === "image" ? <img src={m.url} alt={m.originalName} className="w-full h-full object-cover" /> : <video src={m.url} className="w-full h-full object-cover" muted />}
            {m.type === "video" && <span className="absolute left-1.5 bottom-1.5 emoji text-sm bg-black/50 rounded-md px-1">🎬</span>}
            <span className="absolute right-1.5 bottom-1.5 text-[10px] font-bold text-white bg-black/50 rounded-md px-1.5">{fmtSize(m.size)}</span>
            <button
              type="button"
              aria-label={`Gỡ ${m.originalName}`}
              onClick={() => set({ media: d.media.filter((x) => x.id !== m.id) })}
              className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition focus-ring"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {!hasVideo && d.media.length < 10 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-soft hover:text-brand-ink hover:border-brand transition focus-ring ${
              drag ? "border-brand bg-indigo-50 dark:bg-indigo-400/10" : "border-line"
            } ${d.media.length === 0 ? "col-span-3 sm:col-span-5 aspect-auto h-32" : ""}`}
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
            <span className="text-xs font-bold">{busy ? "Đang tải lên…" : d.media.length ? "Thêm" : "Kéo thả hoặc bấm để chọn ảnh, video"}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </Block>
  );
}

// ---------- Target pages ----------

function TargetsBlock({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const { state, go } = useApp();
  const [q, setQ] = useState("");
  const selected = new Set(d.selected);
  const hiddenPages = state.accounts.reduce((n, a) => n + a.pages.filter((p) => !p.enabled).length, 0);

  const groups = state.accounts
    .map((a) => ({ acc: a, pages: a.pages.filter((p) => p.enabled && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || a.name.toLowerCase().includes(q.toLowerCase()))) }))
    .filter((g) => g.pages.length);
  const allKeys = groups.flatMap((g) => g.pages.map((p) => key(g.acc.id, p.id)));

  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    set({ selected: [...next] });
  };

  return (
    <Block
      emoji="🎯"
      tone="mint"
      title="Đăng lên trang nào?"
      subtitle={`Đã chọn ${selected.size} trang`}
      actions={
        allKeys.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => toggle(allKeys, !allKeys.every((k) => selected.has(k)))}>
            {allKeys.every((k) => selected.has(k)) ? "Bỏ chọn" : "Chọn tất cả"}
          </Button>
        )
      }
    >
      {state.accounts.length === 0 ? (
        <EmptyState emoji="🙈" tone="mint" title="Chưa có nick nào" text="Thêm nick Facebook để chọn trang đăng bài." action={<Button variant="primary" onClick={() => go("accounts")}>Thêm nick</Button>} />
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trang hoặc nick…" className={`${inputCls} pl-10 py-2`} aria-label="Tìm trang" />
          </div>
          <div className="space-y-3 max-h-[420px] overflow-y-auto scroll-thin -mx-1 px-1">
            {groups.map(({ acc, pages }) => {
              const keys = pages.map((p) => key(acc.id, p.id));
              const n = keys.filter((k) => selected.has(k)).length;
              return (
                <div key={acc.id} className="rounded-2xl border border-line overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2 bg-raised cursor-pointer" onClick={() => toggle(keys, n !== keys.length)}>
                    <Checkbox checked={n === keys.length} indeterminate={n > 0 && n < keys.length} onChange={(v) => toggle(keys, v)} label={`Chọn mọi trang của ${acc.name}`} />
                    <Avatar src={acc.picture} name={acc.name} color={acc.color} size={24} />
                    <span className="text-sm font-extrabold text-ink truncate flex-1">{acc.name}</span>
                    {acc.status === "error" && <Badge tone="pink">Token lỗi</Badge>}
                    {acc.status === "demo" && <Badge tone="lemon">Demo</Badge>}
                    <span className="text-[11px] font-bold text-faint tabular-nums">
                      {n}/{keys.length}
                    </span>
                  </div>
                  <ul className="grid sm:grid-cols-2 gap-1 p-1.5">
                    {pages.map((p) => {
                      const k = key(acc.id, p.id);
                      const on = selected.has(k);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => toggle([k], !on)}
                            aria-pressed={on}
                            className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition focus-ring ${on ? "bg-indigo-50 dark:bg-indigo-400/10" : "hover:bg-field"}`}
                          >
                            <Checkbox checked={on} label={p.name} visualOnly />
                            <Avatar src={p.picture} name={p.name} color={acc.color} size={28} />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-bold text-ink truncate">{p.name}</span>
                              {p.category && <span className="block text-[11px] text-faint truncate">{p.category}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {groups.length === 0 && <p className="text-sm text-soft text-center py-6">Không tìm thấy trang nào.</p>}
          </div>
          {hiddenPages > 0 && (
            <p className="text-[11px] text-faint font-semibold mt-3">
              {hiddenPages} trang đang ẩn ·{" "}
              <button type="button" className="text-brand-ink font-bold hover:underline" onClick={() => go("accounts")}>
                bật trong Nick & Trang
              </button>
            </p>
          )}
        </>
      )}
    </Block>
  );
}

// ---------- Schedule ----------

function quickTimes() {
  const at = (h: number, m: number, addDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const tonight = at(20, 0);
  return [
    { label: "+30 phút", date: new Date(Date.now() + 30 * 60_000) },
    { label: "+2 giờ", date: new Date(Date.now() + 2 * 3600_000) },
    { label: tonight.getTime() > Date.now() ? "Tối nay 20:00" : "Mai 20:00", date: tonight.getTime() > Date.now() ? tonight : at(20, 0, 1) },
    { label: "Sáng mai 8:00", date: at(8, 0, 1) },
  ];
}

function ScheduleBlock({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <Block emoji="⏰" tone="sky" title="Thời gian đăng">
      <Segmented
        value={d.mode}
        onChange={(mode) => set({ mode, scheduleAt: mode === "schedule" && !d.scheduleAt ? toLocalInput(new Date(Date.now() + 3600_000)) : d.scheduleAt })}
        className="w-full"
        options={[
          { value: "now", label: "Đăng ngay", emoji: "🚀" },
          { value: "schedule", label: "Hẹn giờ", emoji: "⏰" },
          { value: "draft", label: "Lưu nháp", emoji: "📝" },
        ]}
      />

      {d.mode === "schedule" && (
        <div className="mt-4 space-y-3 animate-pop">
          <div>
            <Label htmlFor="schedule-at">Đăng lúc</Label>
            <input id="schedule-at" type="datetime-local" value={d.scheduleAt} onChange={(e) => set({ scheduleAt: e.target.value })} className={inputCls} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickTimes().map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => set({ scheduleAt: toLocalInput(t.date) })}
                  className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-400/10 dark:text-sky-300 focus-ring"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Lặp lại</Label>
            <Segmented
              size="sm"
              value={d.repeat}
              onChange={(repeat) => set({ repeat })}
              className="w-full"
              options={[
                { value: "none", label: "Không" },
                { value: "daily", label: "Hằng ngày" },
                { value: "weekly", label: "Hằng tuần" },
              ]}
            />
          </div>
        </div>
      )}

      <div className="mt-4">
        <Label hint="giây, ngẫu nhiên">Giãn cách giữa các trang</Label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={3600}
            value={d.delayMin}
            onChange={(e) => set({ delayMin: Number(e.target.value) })}
            className={`${inputCls} no-spin text-center`}
            aria-label="Giãn cách tối thiểu (giây)"
          />
          <span className="text-faint font-bold">–</span>
          <input
            type="number"
            min={0}
            max={3600}
            value={d.delayMax}
            onChange={(e) => set({ delayMax: Number(e.target.value) })}
            className={`${inputCls} no-spin text-center`}
            aria-label="Giãn cách tối đa (giây)"
          />
        </div>
        <p className="text-[11px] text-faint font-semibold mt-1.5">Đăng lần lượt từng trang, nghỉ ngẫu nhiên trong khoảng này để tự nhiên hơn.</p>
      </div>
    </Block>
  );
}

// ---------- Preview ----------

function PreviewBlock({ d }: { d: Draft }) {
  const { state } = useApp();
  const [seed, setSeed] = useState(1);
  const [pick, setPick] = useState(0);

  const targets = d.selected
    .map((k) => {
      const [accId, pageId] = k.split(":");
      const acc = state.accounts.find((a) => a.id === accId);
      const page = acc?.pages.find((p) => p.id === pageId);
      return acc && page ? { acc, page } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const t = targets[Math.min(pick, targets.length - 1)];
  const text = renderContent(d.content, { page: t?.page.name ?? "Tên trang", account: t?.acc.name ?? "Tên nick" }, seededRandom(seed));
  const images = d.media.filter((m) => m.type === "image");
  const video = d.media.find((m) => m.type === "video");

  return (
    <Block
      emoji="👀"
      tone="violet"
      title="Xem trước"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)} title="Xem một biến thể khác của spintax">
          <Dices className="w-3.5 h-3.5" /> Biến thể khác
        </Button>
      }
    >
      {targets.length > 1 && (
        <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className={`${inputCls} py-2 mb-3`} aria-label="Xem trước cho trang">
          {targets.map((x, i) => (
            <option key={i} value={i}>
              {x.page.name}
            </option>
          ))}
        </select>
      )}
      <article className="rounded-2xl border border-line bg-white dark:bg-[#242526] overflow-hidden text-[#050505] dark:text-[#e4e6eb]">
        <header className="flex items-center gap-2.5 px-3 pt-3">
          <Avatar src={t?.page.picture} name={t?.page.name ?? "T"} color={t?.acc.color ?? "#6c8cff"} size={38} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold truncate">{t?.page.name ?? "Tên trang của bạn"}</p>
            <p className="text-[12px] text-[#65676b] dark:text-[#b0b3b8] flex items-center gap-1">
              {d.mode === "schedule" && d.scheduleAt ? new Date(d.scheduleAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "Vừa xong"} ·{" "}
              <Globe2 className="w-3 h-3" />
            </p>
          </div>
          <MoreHorizontal className="w-5 h-5 text-[#65676b]" />
        </header>
        <p className="px-3 py-2.5 text-[14px] leading-snug whitespace-pre-wrap break-words">{text || <span className="text-[#65676b]">Nội dung bài viết sẽ hiện ở đây…</span>}</p>
        {video && <video src={video.url} controls className="w-full max-h-80 bg-black" />}
        {images.length > 0 && (
          <div className={`grid gap-0.5 ${images.length === 1 ? "" : "grid-cols-2"}`}>
            {images.slice(0, 4).map((m, i) => (
              <div key={m.id} className={`relative bg-black/5 ${images.length === 1 ? "" : "aspect-square"} ${images.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : ""}`}>
                <img src={m.url} alt="" className={`w-full ${images.length === 1 ? "max-h-96 object-contain" : "h-full object-cover"}`} />
                {i === 3 && images.length > 4 && <span className="absolute inset-0 bg-black/50 text-white text-2xl font-black flex items-center justify-center">+{images.length - 4}</span>}
              </div>
            ))}
          </div>
        )}
        {d.link && !d.media.length && (
          <div className="mx-3 mb-2 rounded-lg bg-[#f0f2f5] dark:bg-[#3a3b3c] px-3 py-2.5">
            <p className="text-[11px] uppercase text-[#65676b] dark:text-[#b0b3b8] truncate">{d.link.replace(/^https?:\/\//, "").split("/")[0]}</p>
            <p className="text-[14px] font-bold truncate">{d.link}</p>
          </div>
        )}
        <footer className="mx-3 border-t border-black/10 dark:border-white/10 grid grid-cols-3 text-[13px] font-semibold text-[#65676b] dark:text-[#b0b3b8]">
          {[
            [ThumbsUp, "Thích"],
            [MessageCircle, "Bình luận"],
            [Share2, "Chia sẻ"],
          ].map(([Icon, label]: any) => (
            <span key={label} className="flex items-center justify-center gap-1.5 py-2">
              <Icon className="w-4 h-4" /> {label}
            </span>
          ))}
        </footer>
      </article>
    </Block>
  );
}

// ---------- Page ----------

export default function Composer() {
  const { state, seed, clearSeed, run, toast, go } = useApp();
  const { defaultDelayMin, defaultDelayMax } = state.settings;
  const [editing, setEditing] = useState<Post | null>(null);
  const [d, setD] = useState<Draft>(() => safeStorage<Draft>(DRAFT_KEY, blankDraft(defaultDelayMin, defaultDelayMax)));
  const [busy, setBusy] = useState(false);
  const [tplModal, setTplModal] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  // Another screen sent us a post to edit or a template to start from
  useEffect(() => {
    if (!seed) return;
    if (seed.kind === "edit") {
      setEditing(seed.post);
      setD(draftFromPost(seed.post));
    } else if (seed.kind === "reuse") {
      // A hunted post starts a fresh draft: its text, its images, nothing else carried over
      setEditing(null);
      setD((x) => ({ ...blankDraft(defaultDelayMin, defaultDelayMax), selected: x.selected, content: seed.content, media: seed.media }));
      if (seed.ai) setAiOpen(true);
    } else {
      setEditing(null);
      setD((x) => ({ ...x, content: seed.content }));
    }
    clearSeed();
  }, [seed, clearSeed]);

  // Unsent new posts survive a reload; edits of existing posts do not
  useEffect(() => {
    if (!editing) saveStorage(DRAFT_KEY, d);
  }, [d, editing]);

  // Drop selections whose page was removed or hidden
  const validKeys = useMemo(() => new Set(state.accounts.flatMap((a) => a.pages.filter((p) => p.enabled).map((p) => key(a.id, p.id)))), [state.accounts]);
  const selected = d.selected.filter((k) => validKeys.has(k));

  const reset = () => {
    setEditing(null);
    setD(blankDraft(defaultDelayMin, defaultDelayMax));
    saveStorage(DRAFT_KEY, null);
  };

  const submit = async () => {
    if (!d.content.trim() && !d.media.length && !d.link.trim()) return toast("Bài viết đang trống", "err", "📝");
    if (d.mode !== "draft" && !selected.length) return toast("Hãy chọn ít nhất 1 trang", "err", "🎯");
    if (d.mode === "schedule") {
      const t = Date.parse(d.scheduleAt);
      if (!Number.isFinite(t)) return toast("Hãy chọn thời gian đăng", "err", "⏰");
      if (t < Date.now() - 60_000) return toast("Thời gian hẹn đã qua, hãy chọn lại", "err", "⏰");
    }
    const body: PostInput = {
      content: d.content,
      link: d.link,
      media: d.media,
      targets: selected.map((k) => {
        const [accountId, pageId] = k.split(":");
        return { accountId, pageId };
      }),
      mode: d.mode,
      scheduleAt: d.mode === "schedule" && d.scheduleAt ? new Date(d.scheduleAt).toISOString() : null,
      repeat: d.mode === "schedule" ? d.repeat : "none",
      delayMin: d.delayMin,
      delayMax: d.delayMax,
    };
    setBusy(true);
    const ok = await run(
      () => (editing ? api.put<Post>(`/api/posts/${editing.id}`, body) : api.post<Post>("/api/posts", body)),
      d.mode === "now" ? "Đã bắt đầu đăng bài!" : d.mode === "schedule" ? "Đã hẹn giờ đăng bài!" : "Đã lưu nháp",
    );
    setBusy(false);
    if (ok) {
      reset();
      go("queue");
    }
  };

  const saveTemplate = async () => {
    const title = tplTitle.trim() || d.content.trim().split("\n")[0].slice(0, 40);
    const ok = await run(() => api.post("/api/templates", { title, content: d.content, emoji: "📝" }), "Đã lưu vào Kho mẫu");
    if (ok) {
      setTplModal(false);
      setTplTitle("");
    }
  };

  const cta = d.mode === "now" ? `Đăng lên ${selected.length} trang` : d.mode === "schedule" ? "Hẹn giờ đăng" : "Lưu nháp";
  const dd = { ...d, selected };

  return (
    <div className="space-y-4">
      {editing && (
        <div className="flex items-center gap-3 rounded-3xl bg-amber-50 border border-amber-200 dark:bg-amber-400/10 dark:border-amber-400/20 px-4 py-3">
          <Emo e="✏️" tone="lemon" />
          <p className="flex-1 text-sm font-bold text-amber-800 dark:text-amber-200">Đang sửa một bài đã có. Lưu lại sẽ thay thế bài cũ và đặt lại kết quả đăng.</p>
          <Button size="sm" variant="ghost" onClick={reset}>
            Huỷ sửa
          </Button>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] gap-4 sm:gap-5 items-start">
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <EditorBlock d={dd} set={set} onSaveTemplate={() => setTplModal(true)} aiOpen={aiOpen} setAiOpen={setAiOpen} />
          <MediaBlock d={dd} set={set} />
          <TargetsBlock d={dd} set={set} />
        </div>

        <div className="space-y-4 sm:space-y-5 xl:sticky xl:top-20 min-w-0">
          <ScheduleBlock d={dd} set={set} />
          <PreviewBlock d={dd} />
          <div className="bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] p-3 flex items-center gap-2 sticky bottom-3 xl:static z-20">
            <Button variant="ghost" onClick={reset} disabled={busy}>
              {editing ? "Huỷ" : "Làm mới"}
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={submit} loading={busy} icon={<Send className="w-4 h-4" />}>
              {cta}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={tplModal}
        onClose={() => setTplModal(false)}
        title="Lưu thành mẫu"
        emoji="💾"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTplModal(false)}>
              Thôi
            </Button>
            <Button variant="primary" onClick={saveTemplate}>
              Lưu mẫu
            </Button>
          </>
        }
      >
        <Label htmlFor="tpl-title">Tên mẫu</Label>
        <input id="tpl-title" autoFocus value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder={d.content.trim().split("\n")[0].slice(0, 40)} className={inputCls} onKeyDown={(e) => e.key === "Enter" && saveTemplate()} />
      </Modal>
    </div>
  );
}
