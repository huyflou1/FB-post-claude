import React, { useState } from "react";
import { Search } from "lucide-react";
import type { ScrapedSort } from "../../shared/types";
import { safeStorage, saveStorage, useApp } from "../lib";
import { ScrapedCard, useScraped } from "../components/ScrapedCard";
import { Block, Button, EmptyState, inputCls, Segmented } from "../components/ui";
import Templates from "./Templates";

type Tab = "saved" | "templates";

function SavedPosts() {
  const { state, go } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ScrapedSort>("new");
  const [sourceId, setSourceId] = useState("");
  const { items, total } = useScraped({ saved: true, q, sort, sourceId: sourceId || undefined, limit: 300 });
  const sources = state.sources.filter((s) => s.postCount > 0);

  return (
    <div className="space-y-4">
      <Block bodyClassName="p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "new", label: "Mới đăng", emoji: "🆕" },
            { value: "hot", label: "Hot nhất", emoji: "🔥" },
          ]}
        />
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${inputCls} lg:w-56 py-2`} aria-label="Lọc theo nguồn">
          <option value="">Mọi nguồn</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong bài đã lưu…" className={`${inputCls} pl-10`} aria-label="Tìm bài đã lưu" />
        </div>
        <span className="text-xs font-bold text-soft whitespace-nowrap">{total} bài</span>
      </Block>

      {items.length === 0 ? (
        <Block>
          <EmptyState
            emoji="⭐"
            tone="lemon"
            title={state.savedCount ? "Không có bài nào khớp" : "Chưa lưu bài nào"}
            text="Ở mục Săn bài, bấm ngôi sao trên bài hay để cất vào đây, dùng dần khi cần."
            action={
              !state.savedCount && (
                <Button variant="primary" onClick={() => go("hunt")}>
                  <span className="emoji">🔎</span> Đi săn bài
                </Button>
              )
            }
          />
        </Block>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {items.map((p) => (
            <ScrapedCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Library() {
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>(() => safeStorage<Tab>("library-tab", "saved"));
  const pick = (t: Tab) => {
    setTab(t);
    saveStorage("library-tab", t);
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={pick}
        options={[
          { value: "saved", label: "Bài đã lưu", emoji: "⭐", count: state.savedCount },
          { value: "templates", label: "Mẫu viết", emoji: "📝", count: state.templates.length },
        ]}
      />
      {tab === "saved" ? <SavedPosts /> : <Templates />}
    </div>
  );
}
