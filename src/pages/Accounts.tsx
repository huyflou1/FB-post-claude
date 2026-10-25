import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Hourglass, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Account } from "../../shared/types";
import { api, fmtDateTime, fmtRelative, useApp } from "../lib";
import { Avatar, Badge, Block, Button, Emo, EmptyState, IconButton, inputCls, Toggle } from "../components/ui";

interface LoginInfo {
  ready: boolean;
  redirectUri: string;
  scopes: string[];
}

function FbLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-1.5">
      <code className="flex-1 min-w-0 truncate bg-field border border-line rounded-xl px-3 py-2 text-[12px] font-mono text-ink">{value}</code>
      <Button
        size="sm"
        variant="soft"
        className="h-auto"
        icon={done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            /* clipboard blocked: the text is still selectable */
          }
        }}
      >
        {done ? "Đã chép" : "Chép"}
      </Button>
    </div>
  );
}

// Step-by-step setup of the user's own Facebook App, shown until App ID + Secret are saved
function AppSetup({ info, onSaved }: { info: LoginInfo; onSaved: () => void }) {
  const { run } = useApp();
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await run(() => api.put("/api/settings", { appId, appSecret: secret }), "Đã lưu App, giờ có thể đăng nhập");
    setBusy(false);
    if (ok) onSaved();
  };

  const steps: [string, string, React.ReactNode][] = [
    [
      "🧩",
      "Tạo App Facebook (làm 1 lần)",
      <>
        Vào{" "}
        <a className="text-brand-ink font-bold hover:underline" href="https://developers.facebook.com/apps/creation/" target="_blank" rel="noreferrer">
          developers.facebook.com/apps
        </a>{" "}
        → Tạo ứng dụng, chọn mục đích quản lý Trang (loại Business).
      </>,
    ],
    [
      "🔗",
      "Bật Facebook Login",
      <>
        Thêm sản phẩm <b>Facebook Login</b> → Cài đặt → dán địa chỉ này vào <b>Valid OAuth Redirect URIs</b>:
        <span className="block mt-1.5">
          <CopyField value={info.redirectUri} />
        </span>
      </>,
    ],
    ["🔑", "Nhập App ID và App Secret", <>Lấy ở Cài đặt ứng dụng → Thông tin cơ bản.</>],
  ];

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map(([e, t, d], i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-raised border border-line p-3">
            <Emo e={e} tone="blue" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink">
                {i + 1}. {t}
              </p>
              <div className="text-xs text-soft mt-0.5 leading-relaxed">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="App ID" className={`${inputCls} font-mono text-[13px]`} aria-label="App ID" autoComplete="off" />
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="App Secret" className={`${inputCls} font-mono text-[13px]`} aria-label="App Secret" autoComplete="off" />
      </div>
      <Button variant="primary" className="w-full" onClick={save} loading={busy} disabled={!appId.trim() || !secret.trim()}>
        Lưu và bật đăng nhập Facebook
      </Button>
    </div>
  );
}

function FacebookLogin() {
  const { run, toast, refresh, state } = useApp();
  const [info, setInfo] = useState<LoginInfo | null>(null);
  const [label, setLabel] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const popup = useRef<Window | null>(null);

  const loadInfo = useCallback(() => {
    api.get<LoginInfo>("/api/auth/facebook/info").then(setInfo, () => {});
  }, []);
  // Settings saved elsewhere (Cài đặt) also unlock the button
  useEffect(loadInfo, [loadInfo, state.settings.appId, state.settings.hasAppSecret]);

  // The popup reports back through postMessage when Facebook sends the user home
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "fb-login") return;
      setWaiting(false);
      toast(e.data.message, e.data.ok ? "ok" : "err", e.data.ok ? "🎉" : "😿");
      if (e.data.ok) {
        setLabel("");
        refresh();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [toast, refresh]);

  // Closing the popup without finishing should not leave the button spinning
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => {
      if (popup.current?.closed) setWaiting(false);
    }, 700);
    return () => window.clearInterval(t);
  }, [waiting]);

  const login = () => {
    const url = `/auth/facebook/start?label=${encodeURIComponent(label.trim())}`;
    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    popup.current = window.open(url, "fb-login", `width=${w},height=${h},left=${left},top=${top}`);
    // Popup blocked: go through the same flow in this tab
    if (!popup.current) location.href = url;
    else setWaiting(true);
  };

  const addDemo = async () => {
    setDemoBusy(true);
    const acc = await run(() => api.post<Account>("/api/accounts", { token: "demo" }));
    setDemoBusy(false);
    if (acc) toast(`Đã thêm ${acc.name} · ${acc.pages.length} trang`);
  };

  return (
    <Block emoji="🔐" tone="blue" title="Đăng nhập Facebook" subtitle="Đăng nhập trên trang của Facebook, app không thấy mật khẩu">
      {!info ? (
        <div className="h-24 rounded-2xl bg-field animate-pulse" />
      ) : info.ready ? (
        <div className="space-y-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ghi chú cho nick (tuỳ chọn), VD: Nick bán hàng" className={inputCls} aria-label="Ghi chú cho nick" />
          <button
            type="button"
            onClick={login}
            disabled={waiting}
            className="w-full h-12 rounded-2xl bg-[#1877F2] hover:bg-[#166fe5] active:bg-[#1464d0] text-white font-extrabold text-[15px] flex items-center justify-center gap-2.5 shadow-[0_8px_20px_-8px_#1877F2] transition focus-ring disabled:opacity-80"
          >
            {waiting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FbLogo />}
            {waiting ? "Đang chờ bạn đăng nhập trong cửa sổ Facebook…" : "Đăng nhập bằng Facebook"}
          </button>
          <ul className="text-[12px] text-soft font-semibold space-y-1.5 leading-relaxed">
            <li>
              <span className="emoji">✅</span> Khi Facebook hỏi, hãy <b>chọn các Trang</b> muốn đăng bài và cho phép mọi quyền.
            </li>
            <li>
              <span className="emoji">👥</span> Thêm nick khác: trong cửa sổ Facebook chọn <b>Đăng nhập tài khoản khác</b> (hoặc đăng xuất Facebook trước).
            </li>
            <li>
              <span className="emoji">🧪</span> App đang ở chế độ Development thì chỉ nick có vai trò trong App (Admin, Developer, Tester) đăng nhập được.
            </li>
          </ul>
        </div>
      ) : (
        <AppSetup info={info} onSaved={loadInfo} />
      )}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-line">
        <span className="text-[11px] text-faint font-semibold flex-1">Chưa sẵn sàng? Thử app với dữ liệu giả lập trước.</span>
        <Button size="sm" variant="ghost" onClick={addDemo} loading={demoBusy}>
          <span className="emoji">✨</span> Thêm nick demo
        </Button>
      </div>
    </Block>
  );
}

// Fallback for people who already have a token (Graph API Explorer, other tools)
function TokenLogin() {
  const { run, toast } = useApp();
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!token.trim()) return;
    setBusy(true);
    const acc = await run(() => api.post<Account>("/api/accounts", { token, label }));
    setBusy(false);
    if (acc) {
      setToken("");
      setLabel("");
      toast(`Đã kết nối ${acc.name} · ${acc.pages.length} trang`);
    }
  };

  return (
    <Block emoji="🗝️" tone="lemon" title="Cách khác: dán access token" subtitle="Dành cho ai đã có sẵn token" collapsible defaultOpen={false}>
      <div className="space-y-3">
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="EAAG… (token người dùng hoặc token trang)"
            className={`${inputCls} pr-11 font-mono text-[13px]`}
            autoComplete="off"
            spellCheck={false}
            aria-label="Access token"
          />
          <IconButton label={show ? "Ẩn token" : "Hiện token"} className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </IconButton>
        </div>
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className={inputCls} aria-label="Ghi chú" />
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={add} loading={busy} disabled={!token.trim()}>
            Kết nối
          </Button>
        </div>
        <p className="text-xs text-soft leading-relaxed">
          Lấy token ở{" "}
          <a className="text-brand-ink font-bold hover:underline" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
            Graph API Explorer
          </a>
          : chọn App, tích <code className="font-bold">pages_show_list</code>, <code className="font-bold">pages_read_engagement</code>, <code className="font-bold">pages_manage_posts</code> rồi bấm Generate Access Token. Dán token mới của nick đã có sẽ cập nhật nick đó.
        </p>
        <p className="text-xs text-soft leading-relaxed">
          <span className="emoji">ℹ️</span> Facebook chỉ cho ứng dụng đăng lên <b>Trang (Fanpage)</b> mà nick quản lý. Trang cá nhân và nhóm không đăng được qua API chính thức.
        </p>
      </div>
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
        <FacebookLogin />
        <TokenLogin />
      </div>
      {state.accounts.length === 0 ? (
        <Block>
          <EmptyState emoji="🐥" tone="mint" title="Chưa có nick nào" text="Bấm Đăng nhập bằng Facebook ở trên, hoặc thêm nick demo để xem app hoạt động thế nào." />
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
