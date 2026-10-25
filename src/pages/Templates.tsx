import React, { useState } from "react";
import { Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import type { Template } from "../../shared/types";
import { api, useApp } from "../lib";
import { Block, Button, EmptyState, IconButton, inputCls, Label, Modal } from "../components/ui";

const EMOJI_CHOICES = "📝 🌞 🛍️ 🎁 🔥 🎉 💡 📣 🍜 ☕ 🐱 💖 🚀 📦 🌸 ⭐".split(" ");

type Editing = Partial<Template> | null;

export default function Templates() {
  const { state, run, confirm, openComposer } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [q, setQ] = useState("");

  const list = state.templates.filter((t) => !q || (t.title + t.content).toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    if (!editing) return;
    const body = { title: editing.title, content: editing.content, emoji: editing.emoji ?? "📝" };
    const ok = await run(() => (editing.id ? api.put(`/api/templates/${editing.id}`, body) : api.post("/api/templates", body)), "Đã lưu mẫu");
    if (ok) setEditing(null);
  };

  const del = async (t: Template) => {
    if (await confirm({ title: `Xoá mẫu "${t.title}"?`, danger: true, confirmLabel: "Xoá mẫu" })) run(() => api.del(`/api/templates/${t.id}`), "Đã xoá mẫu");
  };

  return (
    <div className="space-y-4">
      <Block bodyClassName="p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mẫu…" className={`${inputCls} pl-10`} aria-label="Tìm mẫu" />
        </div>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ emoji: "📝", title: "", content: "" })}>
          Mẫu mới
        </Button>
      </Block>

      {list.length === 0 ? (
        <Block>
          <EmptyState emoji="📚" tone="lemon" title={state.templates.length ? "Không có mẫu nào khớp" : "Kho mẫu trống"} text="Lưu những câu chữ hay dùng để soạn bài nhanh hơn." />
        </Block>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((t) => (
            <li key={t.id} className="hover-wiggle bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] p-4 flex flex-col">
              <div className="flex items-center gap-3">
                <span className="emoji text-3xl">{t.emoji}</span>
                <p className="font-extrabold text-ink flex-1 truncate">{t.title}</p>
                <IconButton label="Sửa mẫu" onClick={() => setEditing(t)}>
                  <Pencil className="w-4 h-4" />
                </IconButton>
                <IconButton label="Xoá mẫu" onClick={() => del(t)} className="hover:text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
              <p className="text-[13px] text-soft mt-3 whitespace-pre-line line-clamp-5 flex-1 break-words">{t.content}</p>
              <Button size="sm" variant="soft" className="mt-4 self-start" icon={<Send className="w-3.5 h-3.5" />} onClick={() => openComposer({ kind: "template", content: t.content })}>
                Dùng mẫu này
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Sửa mẫu" : "Mẫu mới"}
        emoji={editing?.emoji ?? "📝"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Thôi
            </Button>
            <Button variant="primary" onClick={save} disabled={!editing?.title?.trim() || !editing?.content?.trim()}>
              Lưu mẫu
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div>
              <Label>Biểu tượng</Label>
              <div className="flex flex-wrap gap-1">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEditing({ ...editing, emoji: e })}
                    aria-pressed={editing.emoji === e}
                    className={`emoji text-xl w-10 h-10 rounded-xl focus-ring ${editing.emoji === e ? "bg-indigo-100 ring-2 ring-brand dark:bg-indigo-400/20" : "hover:bg-field"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="tpl-name">Tên mẫu</Label>
              <input id="tpl-name" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} placeholder="VD: Chào buổi sáng" />
            </div>
            <div>
              <Label htmlFor="tpl-content" hint="hỗ trợ {a|b} và {{page}}">
                Nội dung
              </Label>
              <textarea id="tpl-content" rows={7} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} className={`${inputCls} resize-y`} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
