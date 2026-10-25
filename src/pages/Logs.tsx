import React, { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { LogEntry, LogLevel } from "../../shared/types";
import { api, fmtRelative, useApp } from "../lib";
import { Block, Button, Emo, EmptyState, inputCls, Segmented, type Tone } from "../components/ui";

const LEVEL: Record<LogLevel, { emoji: string; tone: Tone; label: string }> = {
  info: { emoji: "💬", tone: "sky", label: "Thông tin" },
  success: { emoji: "✅", tone: "mint", label: "Thành công" },
  warn: { emoji: "⚠️", tone: "lemon", label: "Cảnh báo" },
  error: { emoji: "❌", tone: "pink", label: "Lỗi" },
};

export function LogRow({ log, compact }: { log: LogEntry; compact?: boolean }) {
  const { now } = useApp();
  const lv = LEVEL[log.level];
  return (
    <li className={`flex items-start gap-3 rounded-2xl ${compact ? "p-2" : "p-2.5 hover:bg-field"}`}>
      <Emo e={lv.emoji} tone={lv.tone} size={compact ? "xs" : "sm"} className={compact ? "mt-0.5" : ""} />
      <div className="min-w-0 flex-1">
        <p className={`text-ink break-words ${compact ? "text-[13px] font-semibold" : "text-sm font-semibold"}`}>{log.message}</p>
        <p className="text-[11px] text-faint font-semibold" title={new Date(log.at).toLocaleString("vi-VN")}>
          {compact ? fmtRelative(log.at, now) : new Date(log.at).toLocaleString("vi-VN")}
        </p>
      </div>
    </li>
  );
}

export default function Logs() {
  const { state, run, confirm } = useApp();
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state.logs.length };
    for (const l of state.logs) c[l.level] = (c[l.level] ?? 0) + 1;
    return c;
  }, [state.logs]);

  const list = state.logs.filter((l) => (level === "all" || l.level === level) && (!q || l.message.toLowerCase().includes(q.toLowerCase())));

  const clear = async () => {
    if (await confirm({ title: "Xoá toàn bộ nhật ký?", text: "Chỉ xoá các dòng ghi chép, bài viết và kết quả đăng vẫn giữ nguyên.", danger: true, confirmLabel: "Xoá nhật ký" }))
      run(() => api.del("/api/logs"), "Đã dọn sạch nhật ký");
  };

  return (
    <Block bodyClassName="p-3 sm:p-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-3">
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: "all", label: "Tất cả", count: counts.all },
            ...(Object.keys(LEVEL) as LogLevel[]).map((k) => ({ value: k, label: LEVEL[k].label, emoji: LEVEL[k].emoji, count: counts[k] })),
          ]}
        />
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong nhật ký…" className={`${inputCls} pl-10`} aria-label="Tìm trong nhật ký" />
        </div>
        <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={clear} disabled={!state.logs.length}>
          Dọn nhật ký
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState emoji="🍃" tone="peach" title={state.logs.length ? "Không có dòng nào khớp" : "Nhật ký trống"} text="Mỗi lần đăng, thử lại hay lỗi đều được ghi lại ở đây." />
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, 400).map((l) => (
            <LogRow key={l.id} log={l} />
          ))}
        </ul>
      )}
    </Block>
  );
}
