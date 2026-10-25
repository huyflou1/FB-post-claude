import React, { useEffect, useState } from "react";
import { Check, Copy, CornerDownLeft, Plus, RotateCcw, Sparkles } from "lucide-react";
import { AI_LENGTHS, AI_PROVIDERS, AI_TONES, type AiProviderId, type AiRequest, type AiResponse } from "../../shared/ai";
import { api, safeStorage, saveStorage, useApp } from "../lib";
import { Badge, Button, Emo, inputCls, Label, Modal, Segmented, Toggle } from "./ui";

type Prefs = Omit<AiRequest, "topic" | "source" | "notes" | "mode"> & { models: Partial<Record<AiProviderId, string>> };

const PREFS_KEY = "ai-writer";
const IDEAS = ["Khai trương cửa hàng", "Flash sale cuối tuần", "Mẹo vặt cuộc sống", "Cảm ơn khách hàng", "Giới thiệu sản phẩm mới", "Câu hỏi tương tác"];

const defaultPrefs: Prefs = {
  provider: "anthropic",
  model: "",
  models: {},
  tone: "friendly",
  length: "medium",
  language: "vi",
  count: 3,
  emoji: true,
  hashtags: true,
  cta: true,
  spintax: false,
};

function OptionRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-field border border-line px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-ink">{label}</span>
        <span className="block text-[11px] text-faint">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export default function AiWriter({ open, onClose, current, onUse }: { open: boolean; onClose: () => void; current: string; onUse: (text: string, how: "replace" | "append") => void }) {
  const { state, go, toast } = useApp();
  const [p, setP] = useState<Prefs>(() => ({ ...defaultPrefs, ...safeStorage<Partial<Prefs>>(PREFS_KEY, {}) }));
  const [mode, setMode] = useState<AiRequest["mode"]>("topic");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [copied, setCopied] = useState(-1);
  const set = (x: Partial<Prefs>) => setP((v) => ({ ...v, ...x }));

  useEffect(() => saveStorage(PREFS_KEY, p), [p]);
  useEffect(() => {
    if (open) setMode(current.trim() && !topic ? "rewrite" : "topic");
    // Only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const meta = AI_PROVIDERS.find((x) => x.id === p.provider) ?? AI_PROVIDERS[0];
  const model = p.models[meta.id] ?? meta.models[0].id;
  const keysSet = new Set(state.settings.aiKeysSet ?? []);
  const ready = !meta.needsKey || keysSet.has(meta.id);

  const generate = async () => {
    if (!ready) return;
    if (mode === "topic" && !topic.trim()) return toast("Hãy nhập chủ đề bài viết", "err", "💭");
    setBusy(true);
    try {
      const body: AiRequest = { ...p, provider: meta.id, model, mode, topic, notes, source: current };
      setResult(await api.post<AiResponse>("/api/ai/generate", body));
    } catch (e: any) {
      toast(e.message, "err", "🤖");
    } finally {
      setBusy(false);
    }
  };

  const use = (text: string, how: "replace" | "append") => {
    onUse(text, how);
    onClose();
    toast(how === "replace" ? "Đã đưa bài vào ô nội dung" : "Đã chèn thêm vào cuối bài", "ok", "✨");
  };

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    } catch {
      toast("Không sao chép được", "err");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Trợ lý viết bài AI" emoji="✨" width="max-w-5xl">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5">
        {/* Left: what to write */}
        <div className="space-y-4 min-w-0">
          <div>
            <Label>Mô hình AI</Label>
            <div className="grid grid-cols-3 gap-2">
              {AI_PROVIDERS.map((x) => {
                const active = x.id === meta.id;
                const hasKey = !x.needsKey || keysSet.has(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => set({ provider: x.id })}
                    aria-pressed={active}
                    className={`hover-wiggle relative flex flex-col items-center gap-1 rounded-2xl border p-2.5 transition focus-ring ${
                      active ? "border-brand bg-indigo-50 dark:bg-indigo-400/10 ring-2 ring-indigo-400/30" : "border-line hover:bg-field"
                    }`}
                  >
                    <Emo e={x.emoji} tone={x.tone} size="sm" />
                    <span className="text-xs font-extrabold text-ink">{x.name}</span>
                    <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${hasKey ? "bg-emerald-400" : "bg-slate-300 dark:bg-white/20"}`} title={hasKey ? "Sẵn sàng" : "Chưa có API key"} />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2 items-center">
              <input
                list={`models-${meta.id}`}
                value={model}
                onChange={(e) => set({ models: { ...p.models, [meta.id]: e.target.value } })}
                className={`${inputCls} py-2 font-mono text-[13px]`}
                aria-label="Tên mô hình"
                placeholder={meta.models[0].id}
              />
              <datalist id={`models-${meta.id}`}>
                {meta.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </datalist>
            </div>
            <p className="text-[11px] text-faint font-semibold mt-1.5">
              {meta.note} · chọn gợi ý hoặc gõ tên mô hình bất kỳ
            </p>
            {!ready && (
              <div className="mt-2 rounded-2xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 p-3 flex items-center gap-3">
                <span className="emoji text-xl">🔑</span>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-200 flex-1">Chưa có API key cho {meta.name}.</p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onClose();
                    go("settings");
                  }}
                >
                  Thêm key
                </Button>
              </div>
            )}
          </div>

          <Segmented
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "topic", label: "Viết theo chủ đề", emoji: "💡" },
              { value: "rewrite", label: "Viết lại bài đang có", emoji: "🔁" },
            ]}
          />

          {mode === "topic" ? (
            <div>
              <Label htmlFor="ai-topic">Chủ đề</Label>
              <textarea
                id="ai-topic"
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && generate()}
                placeholder="VD: Ra mắt trà sữa vị xoài, giảm 20% tuần đầu"
                className={`${inputCls} resize-none`}
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {IDEAS.map((i) => (
                  <button key={i} type="button" onClick={() => setTopic(i)} className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-400/10 dark:text-violet-300 focus-ring">
                    {i}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-field border border-line p-3">
              <p className="text-[11px] font-bold text-soft mb-1">Bài hiện tại</p>
              <p className="text-[13px] text-ink whitespace-pre-line line-clamp-4">{current.trim() || <span className="text-faint">Ô nội dung đang trống, hãy viết vài ý trước.</span>}</p>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Định hướng thêm (tuỳ chọn): ngắn gọn hơn, vui hơn…" className={`${inputCls} py-2 mt-2`} aria-label="Định hướng viết lại" />
            </div>
          )}

          <div>
            <Label>Giọng văn</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {AI_TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ tone: t.id })}
                  aria-pressed={p.tone === t.id}
                  className={`h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition focus-ring ${
                    p.tone === t.id ? "border-brand bg-indigo-50 text-brand-ink dark:bg-indigo-400/10" : "border-line text-soft hover:bg-field"
                  }`}
                >
                  <span className="emoji">{t.emoji}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Độ dài</Label>
              <Segmented size="sm" className="w-full" value={p.length} onChange={(length) => set({ length })} options={AI_LENGTHS.map((l) => ({ value: l.id, label: l.label }))} />
            </div>
            <div>
              <Label>Ngôn ngữ</Label>
              <Segmented
                size="sm"
                className="w-full"
                value={p.language}
                onChange={(language) => set({ language })}
                options={[
                  { value: "vi", label: "Tiếng Việt" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
          </div>

          <div>
            <Label hint="mỗi bài một hướng khác nhau">Số phiên bản</Label>
            <Segmented size="sm" className="w-full" value={String(p.count)} onChange={(v) => set({ count: Number(v) })} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <OptionRow label="Emoji" hint="Sinh động hơn" checked={p.emoji} onChange={(emoji) => set({ emoji })} />
            <OptionRow label="Hashtag" hint="3–5 thẻ cuối bài" checked={p.hashtags} onChange={(hashtags) => set({ hashtags })} />
            <OptionRow label="Kêu gọi hành động" hint="Inbox, bình luận…" checked={p.cta} onChange={(cta) => set({ cta })} />
            <OptionRow label="Spintax {a|b}" hint="Mỗi trang một kiểu chữ" checked={p.spintax} onChange={(spintax) => set({ spintax })} />
          </div>

          <div>
            <Label htmlFor="ai-notes" hint="tuỳ chọn">
              Ghi chú thêm
            </Label>
            <input id="ai-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: nhắc địa chỉ 12 Lê Lợi, hotline 0909…" className={inputCls} />
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={generate} loading={busy} disabled={!ready} icon={<Sparkles className="w-4 h-4" />}>
            {busy ? `${meta.name} đang viết…` : result ? "Viết lại lượt mới" : "Viết bài"}
          </Button>
        </div>

        {/* Right: results */}
        <div className="min-w-0 lg:border-l lg:border-line lg:pl-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-extrabold text-soft">Kết quả</p>
            {result && (
              <Badge tone="violet">
                {meta.emoji} {result.servedBy ?? result.model}
              </Badge>
            )}
          </div>

          {busy && !result && (
            <div className="space-y-3">
              {Array.from({ length: p.count }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-line p-4 space-y-2 animate-pulse">
                  <div className="h-3 rounded bg-field w-11/12" />
                  <div className="h-3 rounded bg-field w-4/5" />
                  <div className="h-3 rounded bg-field w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!busy && !result && (
            <div className="h-full min-h-60 flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-line p-6">
              <span className="emoji text-5xl mb-3">🤖</span>
              <p className="font-extrabold text-ink">Chọn mô hình, nhập chủ đề rồi bấm Viết bài</p>
              <p className="text-xs text-soft mt-1 max-w-xs">Bạn sẽ nhận vài phiên bản khác nhau để chọn. Mẹo: Ctrl + Enter để viết nhanh.</p>
            </div>
          )}

          {result && (
            <ul className={`space-y-3 max-h-[64vh] overflow-y-auto scroll-thin pr-1 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              {result.posts.map((text, i) => (
                <li key={i} className="rounded-2xl border border-line bg-raised p-4 animate-pop">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge tone="blue">Phiên bản {i + 1}</Badge>
                    <span className="text-[11px] text-faint font-semibold">{text.length} ký tự</span>
                  </div>
                  <p className="text-[14px] text-ink whitespace-pre-wrap break-words leading-relaxed">{text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <Button size="sm" variant="primary" icon={<CornerDownLeft className="w-3.5 h-3.5" />} onClick={() => use(text, "replace")}>
                      Dùng bài này
                    </Button>
                    {current.trim() && (
                      <Button size="sm" variant="soft" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => use(text, "append")}>
                        Chèn thêm
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={copied === i ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={() => copy(text, i)}>
                      {copied === i ? "Đã chép" : "Sao chép"}
                    </Button>
                  </div>
                </li>
              ))}
              <li>
                <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={generate} disabled={busy}>
                  Viết thêm lượt khác
                </Button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
