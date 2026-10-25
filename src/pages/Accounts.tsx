import React, { useState } from "react";
import { Eye, EyeOff, Hourglass, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Account } from "../../shared/types";
import { api, fmtDateTime, fmtRelative, useApp } from "../lib";
import { Avatar, Badge, Block, Button, Emo, EmptyState, IconButton, inputCls, Label, Toggle } from "../components/ui";

function AddAccount() {
  const { run, toast } = useApp();
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"" | "real" | "demo">("");

  const add = async (demo = false) => {
    if (!demo && !token.trim()) return;
    setBusy(demo ? "demo" : "real");
    const acc = await run(() => api.post<Account>("/api/accounts", { token: demo ? "demo" : token, label }));
    setBusy("");
    if (acc) {
      setToken("");
      setLabel("");
      toast(`Đã kết nối ${acc.name} · ${acc.pages.length} trang`);
    }
  };

  return (
    <Block emoji="🔌" tone="mint" title="Kết nối nick mới" subtitle="Mỗi nick dùng một access token riêng">
      <div className="grid md:grid-cols-[minmax(0,1fr)_220px] gap-3">
        <div>
          <Label htmlFor="token">Access token</Label>
          <div className="relative">
            <input
              id="token"
              type={show ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EAAG… (token người dùng hoặc token trang)"
              className={`${inputCls} pr-11 font-mono text-[13px]`}
              autoComplete="off"
              spellCheck={false}
            />
            <IconButton label={show ? "Ẩn token" : "Hiện token"} className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </IconButton>
          </div>
        </div>
        <div>
          <Label htmlFor="label" hint="tuỳ chọn">
            Ghi chú
          </Label>
          <input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VD: Nick bán hàng" className={inputCls} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => add()} loading={busy === "real"} disabled={!token.trim() || !!busy}>
          Kết nối
        </Button>
        <Button variant="soft" onClick={() => add(true)} loading={busy === "demo"} disabled={!!busy}>
          <span className="emoji">✨</span> Thêm nick demo để dùng thử
        </Button>
      </div>
      <p className="text-[11px] text-faint font-semibold mt-3">Dán token mới của một nick đã có sẽ cập nhật nick đó, không tạo trùng. Token chỉ lưu trên máy này.</p>
    </Block>
  );
}

function Guide() {
  const steps = [
    ["🧑‍💻", "Mở Graph API Explorer", <>Vào <a className="text-brand-ink font-bold hover:underline" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">developers.facebook.com/tools/explorer</a> và chọn App của bạn.</>],
    ["✅", "Thêm quyền", <>Tích <code className="font-bold">pages_show_list</code>, <code className="font-bold">pages_read_engagement</code>, <code className="font-bold">pages_manage_posts</code>.</>],
    ["🔑", "Tạo token", <>Bấm <b>Generate Access Token</b>, đăng nhập nick cần dùng, chọn các trang cho phép rồi copy token.</>],
    ["⏳", "Gia hạn (nên làm)", <>Nhập App ID + App Secret ở Cài đặt, rồi bấm <b>Gia hạn</b> trên thẻ nick: token trang sẽ không hết hạn.</>],
  ] as const;
  return (
    <Block emoji="🗺️" tone="lemon" title="Lấy token ở đâu?" subtitle="4 bước, làm một lần cho mỗi nick" collapsible defaultOpen={false}>
      <ol className="grid sm:grid-cols-2 gap-3">
        {steps.map(([e, t, d], i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-raised border border-line p-3">
            <Emo e={e} tone="lemon" />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink">
                {i + 1}. {t}
              </p>
              <p className="text-xs text-soft mt-0.5 leading-relaxed">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-soft mt-3 leading-relaxed">
        <span className="emoji">ℹ️</span> Facebook chỉ cho phép ứng dụng đăng lên <b>Trang (Fanpage)</b> mà nick đó quản lý. Trang cá nhân và nhóm không đăng được qua API chính thức.
      </p>
    </Block>
  );
}

function AccountCard({ acc }: { acc: Account }) {
  const { run, confirm, state, now } = useApp();
  const [busy, setBusy] = useState<"" | "refresh" | "extend">("");
  const enabled = acc.pages.filter((p) => p.enabled).length;
  const expSoon = acc.tokenExpiresAt && Date.parse(acc.tokenExpiresAt) - now < 7 * 86_400_000;

  const act = async (kind: "refresh" | "extend") => {
    setBusy(kind);
    await run(() => api.post(`/api/accounts/${acc.id}/${kind}`), kind === "refresh" ? "Đã làm mới danh sách trang" : "Đã đổi sang token dài hạn");
    setBusy("");
  };

  const del = async () => {
    const queued = state.posts.filter((p) => p.status === "scheduled" && p.targets.some((t) => t.accountId === acc.id)).length;
    const ok = await confirm({
      title: `Xoá ${acc.name}?`,
      text: queued ? `${queued} bài đang chờ có trang của nick này, các trang đó sẽ báo lỗi khi tới giờ đăng.` : "Token và danh sách trang của nick sẽ bị xoá khỏi máy này.",
      danger: true,
      confirmLabel: "Xoá nick",
    });
    if (ok) run(() => api.del(`/api/accounts/${acc.id}`), `Đã xoá ${acc.name}`);
  };

  return (
    <li className="bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] overflow-hidden flex flex-col">
      <div className="p-4 flex items-start gap-3">
        <Avatar src={acc.picture} name={acc.name} color={acc.color} size={48} ring />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-extrabold text-ink truncate">{acc.name}</p>
            {acc.status === "ok" && <Badge tone="mint">Hoạt động</Badge>}
            {acc.status === "error" && <Badge tone="pink">Cần token mới</Badge>}
            {acc.status === "demo" && <Badge tone="lemon">Demo</Badge>}
            {acc.kind === "page" && <Badge tone="sky">Token trang</Badge>}
          </div>
          {acc.label && <p className="text-xs text-soft font-semibold truncate">{acc.label}</p>}
          <p className="text-[11px] text-faint font-semibold mt-0.5">
            <span className="font-mono">{acc.tokenPreview}</span>
            {acc.tokenExpiresAt === null && acc.status !== "demo" && " · không hết hạn"}
            {acc.tokenExpiresAt && <span className={expSoon ? "text-rose-500 font-bold" : ""}> · hết hạn {fmtRelative(acc.tokenExpiresAt, now)}</span>}
          </p>
        </div>
        <IconButton label="Xoá nick" onClick={del} className="hover:text-rose-500">
          <Trash2 className="w-4 h-4" />
        </IconButton>
      </div>

      {acc.error && <p className="mx-4 mb-3 rounded-2xl bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-300 text-xs font-semibold px-3 py-2">{acc.error}</p>}

      <div className="px-4 flex items-center justify-between">
        <p className="text-xs font-extrabold text-soft">
          Trang được đăng · {enabled}/{acc.pages.length}
        </p>
        {acc.pages.length > 1 && (
          <button
            type="button"
            className="text-[11px] font-bold text-brand-ink hover:underline"
            onClick={() => run(() => api.patch(`/api/accounts/${acc.id}/pages`, { pageIds: "all", enabled: enabled !== acc.pages.length }))}
          >
            {enabled === acc.pages.length ? "Tắt hết" : "Bật hết"}
          </button>
        )}
      </div>
      <ul className="p-2 flex-1 max-h-64 overflow-y-auto scroll-thin">
        {acc.pages.length === 0 && <li className="text-xs text-soft text-center py-5 px-3">Chưa thấy trang nào. Kiểm tra quyền pages_show_list rồi bấm Làm mới.</li>}
        {acc.pages.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5 hover:bg-field">
            <Avatar src={p.picture} name={p.name} color={acc.color} size={30} />
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] font-bold truncate ${p.enabled ? "text-ink" : "text-faint"}`}>{p.name}</p>
              {p.category && <p className="text-[11px] text-faint truncate">{p.category}</p>}
            </div>
            <Toggle checked={p.enabled} label={`Cho phép đăng lên ${p.name}`} onChange={(v) => run(() => api.patch(`/api/accounts/${acc.id}/pages`, { pageIds: [p.id], enabled: v }))} />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-1.5 px-3 py-3 border-t border-line bg-raised">
        <Button size="sm" variant="soft" icon={<RefreshCw className={`w-3.5 h-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />} onClick={() => act("refresh")} disabled={!!busy}>
          Làm mới
        </Button>
        {acc.status !== "demo" && acc.kind === "user" && (
          <Button size="sm" variant="ghost" icon={<Hourglass className="w-3.5 h-3.5" />} onClick={() => act("extend")} loading={busy === "extend"} disabled={!!busy} title="Đổi sang token 60 ngày, token trang sẽ không hết hạn">
            Gia hạn
          </Button>
        )}
        <span className="ml-auto text-[11px] text-faint font-semibold">{acc.checkedAt ? `Kiểm tra ${fmtDateTime(acc.checkedAt)}` : ""}</span>
      </div>
    </li>
  );
}

export default function Accounts() {
  const { state } = useApp();
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        <AddAccount />
        <Guide />
      </div>
      {state.accounts.length === 0 ? (
        <Block>
          <EmptyState emoji="🐥" tone="mint" title="Chưa có nick nào" text="Dán access token ở trên, hoặc thêm nick demo để xem app hoạt động thế nào." />
        </Block>
      ) : (
        <ul className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5 items-start">
          {state.accounts.map((a) => (
            <AccountCard key={a.id} acc={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
