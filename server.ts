import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import type { Account, AppState, FbPage, MediaFile, Post, PostInput, ScrapedSort, Settings, TargetResult } from "./shared/types";
import { addLog, DATA_DIR, flush, getDB, MEDIA_DIR, onChange, save, uid } from "./server/store";
import { exchangeLongLived, FbError, fetchPages, inspectToken, tokenExpiry } from "./server/facebook";
import { isRunning, postLabel, runPost, startScheduler } from "./server/scheduler";
import { AiError, generatePosts } from "./server/ai";
import { addSource, clearUnsaved, fetchSource, importMedia, isFetching, queryScraped, removeSource, ScrapeError, startAutoFetch, updateScraped } from "./server/scraper";
import { AI_PROVIDERS, type AiProviderId, type AiRequest } from "./shared/ai";

const PORT = Number(process.env.PORT) || 3100;
// Tokens live on this machine, so the server only listens locally
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/media", express.static(MEDIA_DIR, { maxAge: "7d" }));

const ACCOUNT_COLORS = ["#7c9cff", "#ff8fb1", "#5fd4a8", "#ffb86b", "#b392ff", "#4cc9f0", "#f7c948"];
const nowIso = () => new Date().toISOString();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wraps async handlers so thrown errors become JSON responses
const h =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

function maskToken(t: string) {
  return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-4)}` : "••••";
}

function publicAccount(a: Account): Account {
  const { token, ...rest } = a;
  return { ...rest, pages: a.pages.map(({ accessToken, ...p }) => p) };
}

function publicSettings(s: Settings): Settings {
  const aiKeysSet = (Object.keys(s.aiKeys ?? {}) as AiProviderId[]).filter((k) => s.aiKeys[k]);
  return { ...s, appSecret: "", hasAppSecret: !!s.appSecret, aiKeys: {}, aiKeysSet };
}

function findAccount(id: string) {
  const a = getDB().accounts.find((x) => x.id === id);
  if (!a) throw new HttpError(404, "Không tìm thấy nick này");
  return a;
}

function findPost(id: string) {
  const p = getDB().posts.find((x) => x.id === id);
  if (!p) throw new HttpError(404, "Không tìm thấy bài viết");
  return p;
}

// ---------- State + live updates ----------

app.get("/api/state", (_req, res) => {
  const db = getDB();
  const state: AppState = {
    sources: db.sources.map((s) => ({ ...s, fetching: isFetching(s.id) })),
    scrapedVersion: db.scrapedVersion,
    scrapedCount: db.scraped.length,
    savedCount: db.scraped.filter((p) => p.saved).length,
    accounts: db.accounts.map(publicAccount),
    posts: db.posts,
    templates: db.templates,
    logs: db.logs.slice(0, 500),
    settings: publicSettings(db.settings),
    serverTime: nowIso(),
  };
  res.json(state);
});

const sseClients = new Set<Response>();
let notifyTimer: NodeJS.Timeout | null = null;
onChange(() => {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const c of sseClients) c.write("data: change\n\n");
  }, 250);
});
setInterval(() => {
  for (const c of sseClients) c.write(": ping\n\n");
}, 25_000);

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("data: hello\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ---------- Accounts ----------

function demoAccount(): Account {
  const n = getDB().accounts.filter((a) => a.status === "demo").length + 1;
  const fbId = `demo${n}_${uid().slice(0, 4)}`;
  const pageNames = [
    ["Shop Mèo Mập", "Cửa hàng"],
    ["Góc Bếp Nhà Mình", "Ẩm thực"],
    ["Tin Công Nghệ 24h", "Truyền thông"],
  ];
  return {
    id: uid(),
    fbId,
    name: `Nick Demo ${n}`,
    label: "Tài khoản dùng thử",
    kind: "user",
    status: "demo",
    color: ACCOUNT_COLORS[getDB().accounts.length % ACCOUNT_COLORS.length],
    tokenPreview: "demo",
    tokenExpiresAt: null,
    token: "demo",
    pages: pageNames.map(([name, category], i) => ({
      id: `demo_${fbId}_${i + 1}`,
      name: n > 1 ? `${name} ${n}` : name,
      category,
      enabled: true,
      accessToken: "demo",
    })),
    addedAt: nowIso(),
    checkedAt: nowIso(),
  };
}

// Reads the token owner and their Pages; keeps on/off choices for known Pages
async function loadFromToken(token: string, previous?: FbPage[]) {
  const v = getDB().settings.graphVersion;
  const me = await inspectToken(token, v);
  let pages: FbPage[];
  if (me.kind === "page") {
    pages = [{ id: me.id, name: me.name, picture: me.picture, enabled: true, accessToken: token }];
  } else {
    pages = await fetchPages(token, v);
  }
  for (const p of pages) {
    const old = previous?.find((x) => x.id === p.id);
    if (old) p.enabled = old.enabled;
  }
  const expiresAt = me.kind === "page" ? null : await tokenExpiry(token, v);
  return { me, pages, expiresAt };
}

app.post(
  "/api/accounts",
  h(async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    const label = String(req.body?.label ?? "").trim();
    if (!token) throw new HttpError(400, "Hãy dán access token");

    const db = getDB();
    if (token.toLowerCase() === "demo") {
      const acc = demoAccount();
      if (label) acc.label = label;
      db.accounts.push(acc);
      addLog("info", `👤 Đã thêm ${acc.name} (demo) với ${acc.pages.length} trang`);
      return res.json(publicAccount(acc));
    }

    const existing = db.accounts.find((a) => a.token === token);
    const { me, pages, expiresAt } = await loadFromToken(token, existing?.pages);
    const same = existing ?? db.accounts.find((a) => a.fbId === me.id && a.status !== "demo");

    if (same) {
      // Pasting a new token for a known nick refreshes it instead of duplicating
      Object.assign(same, {
        token,
        tokenPreview: maskToken(token),
        name: me.name,
        picture: me.picture,
        kind: me.kind,
        status: "ok",
        error: undefined,
        tokenExpiresAt: expiresAt,
        pages: pages.map((p) => ({ ...p, enabled: same.pages.find((x) => x.id === p.id)?.enabled ?? true })),
        checkedAt: nowIso(),
      });
      if (label) same.label = label;
      save();
      addLog("info", `🔑 Đã cập nhật token cho ${me.name} (${pages.length} trang)`);
      return res.json(publicAccount(same));
    }

    const acc: Account = {
      id: uid(),
      fbId: me.id,
      name: me.name,
      label,
      picture: me.picture,
      kind: me.kind,
      status: "ok",
      color: ACCOUNT_COLORS[db.accounts.length % ACCOUNT_COLORS.length],
      token,
      tokenPreview: maskToken(token),
      tokenExpiresAt: expiresAt,
      pages,
      addedAt: nowIso(),
      checkedAt: nowIso(),
    };
    db.accounts.push(acc);
    save();
    addLog("info", `👤 Đã thêm ${acc.name} với ${pages.length} trang`);
    if (me.kind === "user" && pages.length === 0) {
      addLog("warn", `${acc.name} chưa có trang nào. Token cần quyền pages_show_list và pages_manage_posts.`);
    }
    res.json(publicAccount(acc));
  }),
);

app.post(
  "/api/accounts/:id/refresh",
  h(async (req, res) => {
    const acc = findAccount(req.params.id);
    if (acc.status === "demo") {
      acc.checkedAt = nowIso();
      save();
      return res.json(publicAccount(acc));
    }
    try {
      const { me, pages, expiresAt } = await loadFromToken(acc.token ?? "", acc.pages);
      Object.assign(acc, { name: me.name, picture: me.picture, pages, status: "ok", error: undefined, checkedAt: nowIso() });
      if (expiresAt !== undefined) acc.tokenExpiresAt = expiresAt;
      addLog("info", `🔄 Đã làm mới ${acc.name}: ${pages.length} trang`);
    } catch (e: any) {
      acc.status = "error";
      acc.error = e.message;
      acc.checkedAt = nowIso();
      addLog("error", `${acc.name}: ${e.message}`);
    }
    save();
    res.json(publicAccount(acc));
  }),
);

app.post(
  "/api/accounts/:id/extend",
  h(async (req, res) => {
    const acc = findAccount(req.params.id);
    const { appId, appSecret, graphVersion } = getDB().settings;
    if (acc.status === "demo") throw new HttpError(400, "Tài khoản demo không cần gia hạn");
    if (acc.kind === "page") throw new HttpError(400, "Token trang lấy từ token dài hạn vốn không hết hạn");
    if (!appId || !appSecret) throw new HttpError(400, "Hãy nhập App ID và App Secret trong Cài đặt trước");
    const long = await exchangeLongLived(acc.token ?? "", appId, appSecret, graphVersion);
    // Page tokens fetched with a long-lived user token do not expire
    const pages = await fetchPages(long.token, graphVersion);
    for (const p of pages) p.enabled = acc.pages.find((x) => x.id === p.id)?.enabled ?? true;
    Object.assign(acc, {
      token: long.token,
      tokenPreview: maskToken(long.token),
      tokenExpiresAt: long.expiresAt,
      pages,
      status: "ok",
      error: undefined,
      checkedAt: nowIso(),
    });
    save();
    addLog("success", `⏳ Đã đổi ${acc.name} sang token dài hạn`);
    res.json(publicAccount(acc));
  }),
);

app.patch("/api/accounts/:id", (req, res) => {
  const acc = findAccount(req.params.id);
  if (typeof req.body?.label === "string") acc.label = req.body.label.trim().slice(0, 60);
  if (typeof req.body?.color === "string" && /^#[0-9a-f]{6}$/i.test(req.body.color)) acc.color = req.body.color;
  save();
  res.json(publicAccount(acc));
});

app.patch("/api/accounts/:id/pages", (req, res) => {
  const acc = findAccount(req.params.id);
  const ids: string[] | "all" = req.body?.pageIds ?? "all";
  const enabled = !!req.body?.enabled;
  for (const p of acc.pages) if (ids === "all" || ids.includes(p.id)) p.enabled = enabled;
  save();
  res.json(publicAccount(acc));
});

app.delete("/api/accounts/:id", (req, res) => {
  const db = getDB();
  const acc = findAccount(req.params.id);
  const busy = db.posts.some((p) => p.status === "running" && p.targets.some((t) => t.accountId === acc.id));
  if (busy) throw new HttpError(409, "Nick đang có bài đang đăng, hãy dừng bài đó trước");
  db.accounts = db.accounts.filter((a) => a.id !== acc.id);
  save();
  addLog("warn", `🗑 Đã xoá nick ${acc.name}`);
  res.json({ ok: true });
});

// ---------- Media ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => cb(null, uid() + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "")),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

app.post("/api/upload", upload.array("files", 10), (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, "Chỉ nhận tệp ảnh hoặc video");
  const out: MediaFile[] = files.map((f) => ({
    id: uid(),
    filename: f.filename,
    originalName: Buffer.from(f.originalname, "latin1").toString("utf8"),
    url: `/media/${f.filename}`,
    mime: f.mimetype,
    type: f.mimetype.startsWith("video/") ? "video" : "image",
    size: f.size,
  }));
  res.json(out);
});

// ---------- Posts ----------

function clampDelay(n: unknown, fallback: number) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(3600, Math.max(0, Math.round(v))) : fallback;
}

function buildPost(input: PostInput, prev?: Post): Post {
  const db = getDB();
  const content = String(input.content ?? "").slice(0, 63206);
  const media: MediaFile[] = Array.isArray(input.media)
    ? input.media
        .filter((m) => m && typeof m.filename === "string" && fs.existsSync(path.join(MEDIA_DIR, path.basename(m.filename))))
        .slice(0, 10)
    : [];
  if (!content.trim() && !media.length && !input.link) throw new HttpError(400, "Bài viết đang trống");
  if (media.some((m) => m.type === "video") && media.length > 1) throw new HttpError(400, "Mỗi bài chỉ đăng được 1 video, không kèm ảnh");

  let link = String(input.link ?? "").trim();
  if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;

  const seen = new Set<string>();
  const targets: TargetResult[] = [];
  for (const t of input.targets ?? []) {
    const key = `${t.accountId}:${t.pageId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const page = db.accounts.find((a) => a.id === t.accountId)?.pages.find((p) => p.id === t.pageId);
    if (page) targets.push({ accountId: t.accountId, pageId: t.pageId, pageName: page.name, status: "pending" });
  }
  if (input.mode !== "draft" && !targets.length) throw new HttpError(400, "Hãy chọn ít nhất 1 trang để đăng");

  let scheduleAt: string | null = null;
  if (input.mode === "schedule") {
    const t = Date.parse(String(input.scheduleAt ?? ""));
    if (!Number.isFinite(t)) throw new HttpError(400, "Thời gian hẹn không hợp lệ");
    scheduleAt = new Date(t).toISOString();
  } else if (input.mode === "draft" && input.scheduleAt) {
    const t = Date.parse(String(input.scheduleAt));
    scheduleAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const delayMin = clampDelay(input.delayMin, db.settings.defaultDelayMin);
  const delayMax = Math.max(delayMin, clampDelay(input.delayMax, db.settings.defaultDelayMax));
  const now = nowIso();

  return {
    id: prev?.id ?? uid(),
    content,
    link: link || undefined,
    media,
    targets,
    status: input.mode === "draft" ? "draft" : "scheduled",
    scheduleAt: input.mode === "now" ? null : scheduleAt,
    repeat: input.repeat === "daily" || input.repeat === "weekly" ? input.repeat : "none",
    delayMin,
    delayMax,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}

function announce(post: Post, verb: string) {
  const when =
    post.status === "draft"
      ? "vào nháp"
      : post.scheduleAt && Date.parse(post.scheduleAt) > Date.now()
        ? `lúc ${new Date(post.scheduleAt).toLocaleString("vi-VN")}`
        : "để đăng ngay";
  addLog("info", `📝 ${verb} "${postLabel(post)}" ${when}`, post.id);
}

app.post("/api/posts", (req, res) => {
  const post = buildPost(req.body as PostInput);
  getDB().posts.push(post);
  save();
  announce(post, "Đã tạo bài");
  if (post.status === "scheduled" && !post.scheduleAt) void runPost(post.id);
  res.json(post);
});

app.put("/api/posts/:id", (req, res) => {
  const db = getDB();
  const prev = findPost(req.params.id);
  if (prev.status === "running" || isRunning(prev.id)) throw new HttpError(409, "Bài đang được đăng, hãy dừng trước khi sửa");
  const post = buildPost(req.body as PostInput, prev);
  db.posts[db.posts.indexOf(prev)] = post;
  save();
  announce(post, "Đã cập nhật bài");
  if (post.status === "scheduled" && !post.scheduleAt) void runPost(post.id);
  res.json(post);
});

app.post("/api/posts/:id/run", (req, res) => {
  const post = findPost(req.params.id);
  if (post.status === "running") throw new HttpError(409, "Bài đang được đăng");
  if (!post.targets.length) throw new HttpError(400, "Bài chưa chọn trang nào, hãy sửa bài để chọn trang");
  if (post.targets.every((t) => t.status === "success")) throw new HttpError(400, "Bài đã đăng thành công lên mọi trang");
  post.status = "scheduled";
  post.scheduleAt = null;
  save();
  void runPost(post.id);
  res.json(post);
});

app.post("/api/posts/:id/retry", (req, res) => {
  const post = findPost(req.params.id);
  if (post.status === "running") throw new HttpError(409, "Bài đang được đăng");
  const failed = post.targets.filter((t) => t.status === "failed" || t.status === "skipped" || t.status === "pending");
  if (!failed.length) throw new HttpError(400, "Không có trang nào lỗi để thử lại");
  post.status = "scheduled";
  post.scheduleAt = null;
  save();
  addLog("info", `🔁 Thử lại ${failed.length} trang của "${postLabel(post)}"`, post.id);
  void runPost(post.id);
  res.json(post);
});

app.post("/api/posts/:id/cancel", (req, res) => {
  const post = findPost(req.params.id);
  if (post.status === "running") {
    post.cancelRequested = true;
  } else if (post.status === "scheduled") {
    post.status = "draft";
    addLog("warn", `⏸ Đã huỷ lịch "${postLabel(post)}", bài chuyển về nháp`, post.id);
  }
  save();
  res.json(post);
});

app.post("/api/posts/:id/duplicate", (req, res) => {
  const src = findPost(req.params.id);
  const now = nowIso();
  const copy: Post = {
    ...structuredClone(src),
    id: uid(),
    status: "draft",
    scheduleAt: null,
    targets: src.targets.map((t) => ({ accountId: t.accountId, pageId: t.pageId, pageName: t.pageName, status: "pending" })),
    createdAt: now,
    updatedAt: now,
    startedAt: undefined,
    finishedAt: undefined,
    cancelRequested: false,
  };
  getDB().posts.push(copy);
  save();
  addLog("info", `📄 Đã nhân bản "${postLabel(src)}" thành bản nháp`, copy.id);
  res.json(copy);
});

app.delete("/api/posts/:id", (req, res) => {
  const db = getDB();
  const post = findPost(req.params.id);
  if (post.status === "running") throw new HttpError(409, "Bài đang được đăng, hãy dừng trước khi xoá");
  db.posts = db.posts.filter((p) => p.id !== post.id);
  save();
  res.json({ ok: true });
});

app.post("/api/posts/clear-finished", (_req, res) => {
  const db = getDB();
  const before = db.posts.length;
  db.posts = db.posts.filter((p) => p.status !== "done");
  save();
  res.json({ removed: before - db.posts.length });
});

// ---------- Templates ----------

function templateBody(body: any) {
  const title = String(body?.title ?? "").trim().slice(0, 80);
  const content = String(body?.content ?? "");
  if (!title || !content.trim()) throw new HttpError(400, "Mẫu cần có tên và nội dung");
  return { title, content, emoji: String(body?.emoji ?? "📝").slice(0, 8) || "📝" };
}

app.post("/api/templates", (req, res) => {
  const t = { id: uid(), createdAt: nowIso(), ...templateBody(req.body) };
  getDB().templates.unshift(t);
  save();
  res.json(t);
});

app.put("/api/templates/:id", (req, res) => {
  const t = getDB().templates.find((x) => x.id === req.params.id);
  if (!t) throw new HttpError(404, "Không tìm thấy mẫu");
  Object.assign(t, templateBody(req.body));
  save();
  res.json(t);
});

app.delete("/api/templates/:id", (req, res) => {
  const db = getDB();
  db.templates = db.templates.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Post hunting ----------

// Scraper errors are user-facing messages, not crashes
const s400 =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch((e) => next(e instanceof ScrapeError ? new HttpError(400, e.message) : e));

app.post(
  "/api/sources",
  s400(async (req, res) => {
    const src = await addSource(String(req.body?.input ?? ""));
    addLog("info", `🔎 Đã thêm nguồn ${src.name}`);
    // Pull the first batch right away so the user sees posts immediately
    fetchSource(src.id, 25).catch(() => {});
    res.json(src);
  }),
);

app.patch("/api/sources/:id", (req, res) => {
  const src = getDB().sources.find((s) => s.id === req.params.id);
  if (!src) throw new HttpError(404, "Không tìm thấy nguồn này");
  const h = Number(req.body?.autoEveryHours);
  if ([0, 3, 6, 12, 24].includes(h)) src.autoEveryHours = h;
  save();
  res.json(src);
});

app.post(
  "/api/sources/:id/fetch",
  s400(async (req, res) => res.json(await fetchSource(req.params.id, Number(req.body?.limit) || 25))),
);

app.post(
  "/api/sources/fetch-all",
  s400(async (_req, res) => {
    const ids = getDB().sources.filter((s) => !isFetching(s.id)).map((s) => s.id);
    // One page at a time keeps well under Graph API rate limits
    (async () => {
      for (const id of ids) await fetchSource(id).catch(() => {});
    })();
    res.json({ started: ids.length });
  }),
);

app.delete("/api/sources/:id", (req, res) => {
  removeSource(req.params.id, req.query.keepSaved !== "0");
  res.json({ ok: true });
});

app.get("/api/scraped", (req, res) => {
  const q = req.query;
  res.json(
    queryScraped({
      sourceId: typeof q.sourceId === "string" && q.sourceId ? q.sourceId : undefined,
      q: typeof q.q === "string" ? q.q : undefined,
      saved: q.saved === "1" ? true : q.saved === "0" ? false : undefined,
      withImages: q.withImages === "1",
      sort: (typeof q.sort === "string" ? q.sort : "new") as ScrapedSort,
      limit: Number(q.limit) || undefined,
    }),
  );
});

app.post("/api/scraped/bulk", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const action = req.body?.action;
  if (!["save", "unsave", "delete"].includes(action)) throw new HttpError(400, "Thao tác không hợp lệ");
  updateScraped(ids, action);
  res.json({ ok: true, count: ids.length });
});

app.post("/api/scraped/clear", (req, res) => {
  res.json({ removed: clearUnsaved(typeof req.body?.sourceId === "string" ? req.body.sourceId : undefined) });
});

app.post(
  "/api/scraped/:id/import",
  s400(async (req, res) => res.json(await importMedia(req.params.id))),
);

// ---------- AI writer ----------

app.post(
  "/api/ai/generate",
  h(async (req, res) => {
    try {
      const out = await generatePosts(req.body as AiRequest, getDB().settings);
      const meta = AI_PROVIDERS.find((p) => p.id === req.body?.provider);
      addLog("info", `✨ ${meta?.name ?? "AI"} (${out.servedBy ?? out.model}) đã viết ${out.posts.length} bài`);
      res.json(out);
    } catch (e) {
      throw e instanceof AiError ? new HttpError(400, e.message) : e;
    }
  }),
);

// ---------- Logs + settings ----------

app.delete("/api/logs", (_req, res) => {
  getDB().logs = [];
  save();
  res.json({ ok: true });
});

app.put("/api/settings", (req, res) => {
  const s = getDB().settings;
  const b = req.body ?? {};
  if (typeof b.graphVersion === "string" && /^v\d+\.\d+$/.test(b.graphVersion.trim())) s.graphVersion = b.graphVersion.trim();
  if (typeof b.appId === "string") s.appId = b.appId.trim();
  if (typeof b.appSecret === "string" && b.appSecret.trim()) s.appSecret = b.appSecret.trim();
  if (b.appSecret === null) s.appSecret = "";
  s.defaultDelayMin = clampDelay(b.defaultDelayMin, s.defaultDelayMin);
  s.defaultDelayMax = Math.max(s.defaultDelayMin, clampDelay(b.defaultDelayMax, s.defaultDelayMax));
  const cap = Number(b.maxPerPagePerDay);
  if (Number.isFinite(cap)) s.maxPerPagePerDay = Math.min(100, Math.max(0, Math.round(cap)));
  // Keys: a non-empty string sets, null clears, anything else leaves the stored key alone
  if (b.aiKeys && typeof b.aiKeys === "object") {
    s.aiKeys = { ...(s.aiKeys ?? {}) };
    for (const p of AI_PROVIDERS) {
      const v = b.aiKeys[p.id];
      if (typeof v === "string" && v.trim()) s.aiKeys[p.id] = v.trim();
      if (v === null) delete s.aiKeys[p.id];
    }
  }
  if (typeof b.ollamaUrl === "string" && /^https?:\/\/[^\s]+$/i.test(b.ollamaUrl.trim())) s.ollamaUrl = b.ollamaUrl.trim();
  save();
  res.json(publicSettings(s));
});

app.get("/api/info", (_req, res) => res.json({ dataDir: DATA_DIR }));

app.use("/api", (_req, _res, next) => next(new HttpError(404, "Không có API này")));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Facebook rejections (bad token, missing permission) are the caller's problem, not a crash
  const status = err instanceof HttpError ? err.status : err instanceof multer.MulterError || err instanceof FbError ? 400 : 500;
  const message =
    err instanceof multer.MulterError
      ? err.code === "LIMIT_FILE_SIZE"
        ? "Tệp quá lớn (tối đa 1 GB)"
        : `Tải tệp lỗi: ${err.message}`
      : err?.message || "Lỗi không xác định";
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

// ---------- Boot ----------

async function main() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  startScheduler();
  startAutoFetch();
  app.listen(PORT, HOST, () => console.log(`FB Scrat & AutoPost by HuyFlou đang chạy tại http://localhost:${PORT}`));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    try {
      flush();
    } finally {
      process.exit(0);
    }
  });
}

main();
