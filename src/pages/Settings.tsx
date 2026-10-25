import React, { useEffect, useState } from "react";
import { AI_PROVIDERS } from "../../shared/ai";
import { Save } from "lucide-react";
import type { Settings } from "../../shared/types";
import { api, useApp } from "../lib";
import { Badge, Block, Button, Emo, inputCls, Label } from "../components/ui";

export default function SettingsPage() {
  const { state, run } = useApp();
  const [s, setS] = useState<Settings>(state.settings);
  const [busy, setBusy] = useState(false);
  const [dataDir, setDataDir] = useState("");
  const set = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));

  useEffect(() => {
    api.get<{ dataDir: string }>("/api/info").then((r) => setDataDir(r.dataDir), () => {});
  }, []);

  const typedKeys = Object.values(s.aiKeys ?? {}).some((v) => !!v);
  const dirty = JSON.stringify({ ...s, appSecret: "", aiKeys: {} }) !== JSON.stringify({ ...state.settings, appSecret: "", aiKeys: {} }) || !!s.appSecret || typedKeys;
  const keysSet = new Set(state.settings.aiKeysSet ?? []);

  const save = async () => {
    setBusy(true);
    const out = await run(() => api.put<Settings>("/api/settings", s), "Đã lưu cài đặt");
    setBusy(false);
    if (out) setS(out);
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-start max-w-5xl">
      <Block emoji="🛡️" tone="mint" title="Đăng an toàn" subtitle="Giúp trang hoạt động tự nhiên, tránh bị hạn chế">
        <div className="space-y-4">
          <div>
            <Label hint="giây">Giãn cách mặc định giữa các trang</Label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={3600} value={s.defaultDelayMin} onChange={(e) => set({ defaultDelayMin: num(e.target.value) })} className={`${inputCls} no-spin text-center`} aria-label="Tối thiểu" />
              <span className="text-faint font-bold">–</span>
              <input type="number" min={0} max={3600} value={s.defaultDelayMax} onChange={(e) => set({ defaultDelayMax: num(e.target.value) })} className={`${inputCls} no-spin text-center`} aria-label="Tối đa" />
            </div>
          </div>
          <div>
            <Label htmlFor="cap" hint="0 = không giới hạn">
              Tối đa số bài mỗi trang mỗi ngày
            </Label>
            <input id="cap" type="number" min={0} max={100} value={s.maxPerPagePerDay} onChange={(e) => set({ maxPerPagePerDay: num(e.target.value) })} className={`${inputCls} no-spin`} />
            <p className="text-[11px] text-faint font-semibold mt-1.5">Khi đủ số bài, các lượt đăng tiếp theo của trang đó trong ngày sẽ được bỏ qua.</p>
          </div>
        </div>
      </Block>

      <Block emoji="🧩" tone="blue" title="Facebook App" subtitle="Cần để đổi token sang loại dài hạn">
        <div className="space-y-4">
          <div>
            <Label htmlFor="app-id">App ID</Label>
            <input id="app-id" value={s.appId} onChange={(e) => set({ appId: e.target.value })} className={`${inputCls} font-mono text-[13px]`} placeholder="1234567890" autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="app-secret" hint={state.settings.hasAppSecret ? <Badge tone="mint">Đã lưu</Badge> : undefined}>
              App Secret
            </Label>
            <input
              id="app-secret"
              type="password"
              value={s.appSecret}
              onChange={(e) => set({ appSecret: e.target.value })}
              className={`${inputCls} font-mono text-[13px]`}
              placeholder={state.settings.hasAppSecret ? "•••••••• (để trống nếu không đổi)" : "Dán App Secret"}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="graph">Phiên bản Graph API</Label>
            <input id="graph" value={s.graphVersion} onChange={(e) => set({ graphVersion: e.target.value })} className={`${inputCls} font-mono text-[13px]`} placeholder="v21.0" />
          </div>
        </div>
      </Block>

      <Block emoji="✨" tone="violet" title="Trợ lý AI" subtitle="API key để tự viết bài trong mục Soạn bài · chỉ cần 1 nhà cung cấp" className="lg:col-span-2">
        <div className="grid md:grid-cols-2 gap-3">
          {AI_PROVIDERS.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line bg-raised p-3">
              <div className="flex items-center gap-2.5 mb-2">
                <Emo e={p.emoji} tone={p.tone} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-ink flex items-center gap-1.5">
                    {p.name} {(keysSet.has(p.id) || !p.needsKey) && <Badge tone="mint">{p.needsKey ? "Đã lưu key" : "Không cần key"}</Badge>}
                  </p>
                  <p className="text-[11px] text-faint font-semibold truncate">{p.note}</p>
                </div>
                {p.keyUrl && (
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-brand-ink hover:underline shrink-0">
                    {p.needsKey ? "Lấy key ↗" : "Tải Ollama ↗"}
                  </a>
                )}
              </div>
              {p.needsKey ? (
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={s.aiKeys?.[p.id] ?? ""}
                    onChange={(e) => set({ aiKeys: { ...s.aiKeys, [p.id]: e.target.value } })}
                    placeholder={keysSet.has(p.id) ? "•••••••• (để trống nếu không đổi)" : "Dán API key"}
                    className={`${inputCls} py-2 font-mono text-[13px]`}
                    autoComplete="off"
                    aria-label={`API key ${p.name}`}
                  />
                  {keysSet.has(p.id) && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="h-auto"
                      onClick={() => run(() => api.put("/api/settings", { aiKeys: { [p.id]: null } }), `Đã xoá key ${p.name}`)}
                    >
                      Xoá
                    </Button>
                  )}
                </div>
              ) : (
                <input value={s.ollamaUrl} onChange={(e) => set({ ollamaUrl: e.target.value })} className={`${inputCls} py-2 font-mono text-[13px]`} aria-label="Địa chỉ Ollama" placeholder="http://localhost:11434" />
              )}
            </div>
          ))}
        </div>
      </Block>

      <Block emoji="💾" tone="gray" title="Dữ liệu" subtitle="Mọi thứ chỉ lưu trên máy này" className="lg:col-span-2">
        <p className="text-sm text-soft">
          Nick, token, bài viết và ảnh nằm trong thư mục <code className="font-mono text-[12px] text-ink bg-field rounded-lg px-1.5 py-0.5 break-all">{dataDir || "storage"}</code>. Sao lưu thư mục này để chuyển sang máy khác. Đừng chia sẻ nó vì có chứa token.
        </p>
      </Block>

      <div className="lg:col-span-2 flex justify-end">
        <Button variant="primary" size="lg" icon={<Save className="w-4 h-4" />} onClick={save} loading={busy} disabled={!dirty}>
          Lưu cài đặt
        </Button>
      </div>
    </div>
  );
}
