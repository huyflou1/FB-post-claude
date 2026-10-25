import fs from "fs";
import path from "path";
import type { MediaFile, ScrapedPost, ScrapedQuery, ScrapeSource } from "../shared/types";
import { engagement } from "../shared/types";
import { FbError, fetchPagePosts, resolvePage, type RawPagePost } from "./facebook";
import { addLog, getDB, MEDIA_DIR, save, uid } from "./store";

// Post hunting: read posts from Facebook Pages through the Graph API, keep
// them locally with their engagement numbers, and hand good ones to the
// composer. Pages the user manages work with their page token; any other
// public Page needs an app with Page Public Content Access.

export class ScrapeError extends Error {}

const MAX_SCRAPED = 5000;
const AUTO_TICK_MS = 60_000;
const busy = new Set<string>();

export function isFetching(id: string) {
  return busy.has(id);
}

// "https://facebook.com/shopabc", "fb.com/profile.php?id=123", "123", "@shopabc" -> id or slug
export function parsePageInput(input: string): string {
  let s = input.trim().replace(/^@/, "");
  if (!s) throw new ScrapeError("Hãy nhập link, tên người dùng hoặc ID của trang");
  if (/^\d+$/.test(s)) return s;
  if (!/^https?:\/\//i.test(s) && /facebook\.com|fb\.com/i.test(s)) s = "https://" + s;
  if (/^https?:\/\//i.test(s)) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new ScrapeError("Link không hợp lệ");
    }
    if (!/(^|\.)(facebook|fb)\.com$/i.test(u.hostname)) throw new ScrapeError("Chỉ nhận link facebook.com");
    const id = u.searchParams.get("id");
    if (id && /^\d+$/.test(id)) return id;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "pages") {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return last;
      const tail = last.match(/-(\d{6,})$/);
      if (tail) return tail[1];
    }
    if (parts[0] && !["groups", "people", "watch", "share", "story.php", "permalink.php"].includes(parts[0])) return parts[0];
    throw new ScrapeError("Không đọc được trang từ link này. Hãy dán link trang chính (VD: facebook.com/tentrang)");
  }
  if (/^[\w.\-]+$/.test(s)) return s;
  throw new ScrapeError("Không đọc được trang từ nội dung này");
}

function managedPage(pageId: string) {
  for (const a of getDB().accounts) {
    const p = a.pages.find((x) => x.id === pageId);
    if (p && a.status !== "demo" && p.accessToken) return { account: a, page: p };
  }
  return null;
}

// Real tokens to try for Pages the user does not manage, best first
function readerTokens(): string[] {
  const out: string[] = [];
  for (const a of getDB().accounts) {
    if (a.status === "demo" || !a.token) continue;
    if (a.kind === "user") out.unshift(a.token);
    else out.push(a.token);
  }
  return out;
}

function permissionHint(e: unknown) {
  if (e instanceof FbError && (e.code === 10 || e.code === 100 || e.code === 200 || e.code === 803)) {
    return "Không đọc được trang này. Trang không thuộc nick nào của bạn, và App chưa có quyền Page Public Content Access (Facebook phải duyệt) để đọc trang công khai khác.";
  }
  return (e as Error)?.message ?? String(e);
}

// ---------- Demo data ----------

const DEMO_TEXTS = [
  "☕ Sáng thứ Hai cần gì? Một ly cà phê sữa đá thật đậm và một playlist chill! Bạn thích uống gì để bắt đầu tuần mới? 👇",
  "🔥 FLASH SALE 12h trưa nay: giảm 30% toàn bộ áo thun basic. Số lượng có hạn, inbox ngay để giữ size nhé!",
  "Mẹo nhỏ: bảo quản rau thơm trong hộp kín có lót khăn giấy, để được cả tuần vẫn tươi xanh 🌿 Lưu lại kẻo quên!",
  "Cảm ơn hơn 10.000 khách hàng đã đồng hành cùng shop trong năm qua 💖 Tặng mã CAMON10 giảm 10% cho mọi đơn tuần này.",
  "Bạn là team trà sữa trân châu đen hay trân châu trắng? 🥤 Comment để xem team nào đông hơn!",
  "📦 Hàng mới về: bộ bình giữ nhiệt pastel siêu xinh, giữ lạnh 24h. Có 5 màu, bạn chọn màu nào?",
  "5 thói quen buổi tối giúp ngủ ngon hơn: 1) Tắt màn hình trước 30 phút 2) Uống nước ấm 3) Đọc sách 4) Phòng tối 5) Ngủ đúng giờ 😴",
  "Chuyện nhỏ cuối tuần: hôm nay một bạn nhỏ đến quán, để lại tờ giấy vẽ ly cà phê kèm chữ 'ngon lắm ạ' 🥹 Cảm ơn bạn nhiều!",
  "🎁 MINIGAME: Like trang + share bài + tag 2 người bạn để có cơ hội nhận voucher 200K. Công bố 20h Chủ Nhật!",
  "Công thức bánh flan mềm mịn không rỗ: 4 trứng, 400ml sữa, 80g đường, hấp lửa nhỏ 25 phút. Thử ngay cuối tuần này nhé 🍮",
  "Trời mưa rồi, ship vẫn chạy nha cả nhà ☔ Đặt trước 15h nhận trong ngày nội thành.",
  "Review thật từ khách: 'Đóng gói cẩn thận, giao nhanh, sản phẩm y hình' ⭐⭐⭐⭐⭐ Cảm ơn chị Lan đã tin tưởng!",
];
const DEMO_COLORS = [
  ["#ffd6e0", "#ffb3c6"],
  ["#d0f4de", "#a9def9"],
  ["#fcf6bd", "#ffd6a5"],
  ["#e4c1f9", "#cdb4db"],
  ["#bde0fe", "#a2d2ff"],
];
const DEMO_EMOJI = ["☕", "👕", "🌿", "💖", "🥤", "🍹", "😴", "🥹", "🎁", "🍮", "☔", "⭐"];

function demoImage(i: number) {
  const [a, b] = DEMO_COLORS[i % DEMO_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="150" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${DEMO_EMOJI[i % DEMO_EMOJI.length]}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function demoPosts(pageId: string, limit: number): RawPagePost[] {
  const now = Date.now();
  return Array.from({ length: Math.min(limit, DEMO_TEXTS.length) }, (_, i) => {
    const likes = Math.round(20 + Math.random() * 2000);
    return {
      id: `${pageId}_demo${i}`,
      message: DEMO_TEXTS[i],
      createdTime: new Date(now - (i * 26 + Math.random() * 20) * 3600_000).toISOString(),
      images: i % 4 === 3 ? [] : i % 5 === 0 ? [demoImage(i), demoImage(i + 1), demoImage(i + 2)] : [demoImage(i)],
      hasVideo: false,
      likes,
      comments: Math.round(likes * (0.05 + Math.random() * 0.2)),
      shares: Math.round(likes * Math.random() * 0.1),
    };
  });
}

// ---------- Sources ----------

export async function addSource(input: string): Promise<ScrapeSource> {
  const db = getDB();
  const slug = parsePageInput(input);
  const v = db.settings.graphVersion;
  const now = new Date().toISOString();
  const base = { id: uid(), autoEveryHours: 0, addedAt: now, postCount: 0 };

  const existing = db.sources.find((s) => s.pageId === slug || s.name.toLowerCase() === slug.toLowerCase());
  if (existing) throw new ScrapeError(`Nguồn "${existing.name}" đã có trong danh sách`);

  // A page from a demo nick, or no real nick at all: demo source
  const demoPage = db.accounts.flatMap((a) => (a.status === "demo" ? a.pages : [])).find((p) => p.id === slug);
  const tokens = readerTokens();
  if (demoPage || !tokens.length) {
    const src: ScrapeSource = { ...base, pageId: demoPage?.id ?? `demo_${slug}`, name: demoPage?.name ?? slug, kind: "demo", fans: Math.round(1000 + Math.random() * 50000) };
    db.sources.push(src);
    save();
    return src;
  }

  const own = managedPage(slug);
  let info;
  let lastErr: unknown;
  for (const t of own ? [own.page.accessToken!] : tokens) {
    try {
      info = await resolvePage(slug, t, v);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!info) throw new ScrapeError(permissionHint(lastErr));
  if (db.sources.some((s) => s.pageId === info.id)) throw new ScrapeError(`Nguồn "${info.name}" đã có trong danh sách`);

  const src: ScrapeSource = { ...base, pageId: info.id, name: info.name, picture: info.picture, fans: info.fans, kind: managedPage(info.id) ? "own" : "public" };
  db.sources.push(src);
  save();
  return src;
}

function upsert(src: ScrapeSource, raw: RawPagePost[]) {
  const db = getDB();
  const now = new Date().toISOString();
  const byId = new Map(db.scraped.map((p) => [p.id, p]));
  let added = 0;
  for (const r of raw) {
    const old = byId.get(r.id);
    if (old) {
      Object.assign(old, { message: r.message, images: r.images, hasVideo: r.hasVideo, likes: r.likes, comments: r.comments, shares: r.shares, permalink: r.permalink, fetchedAt: now, sourceName: src.name });
    } else {
      const p: ScrapedPost = { ...r, sourceId: src.id, sourceName: src.name, fetchedAt: now, saved: false };
      db.scraped.push(p);
      byId.set(p.id, p);
      added++;
    }
  }
  // Over the cap: drop the oldest unsaved posts first
  if (db.scraped.length > MAX_SCRAPED) {
    const drop = new Set(
      db.scraped
        .filter((p) => !p.saved)
        .sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime))
        .slice(0, db.scraped.length - MAX_SCRAPED)
        .map((p) => p.id),
    );
    db.scraped = db.scraped.filter((p) => !drop.has(p.id));
  }
  return added;
}

function recount() {
  const db = getDB();
  const counts = new Map<string, number>();
  for (const p of db.scraped) counts.set(p.sourceId, (counts.get(p.sourceId) ?? 0) + 1);
  for (const s of db.sources) s.postCount = counts.get(s.id) ?? 0;
  db.scrapedVersion++;
}

export async function fetchSource(id: string, limit = 25): Promise<{ added: number; total: number }> {
  const db = getDB();
  const src = db.sources.find((s) => s.id === id);
  if (!src) throw new ScrapeError("Không tìm thấy nguồn này");
  if (busy.has(id)) throw new ScrapeError(`"${src.name}" đang được cào`);
  busy.add(id);
  save();
  const n = Math.min(100, Math.max(1, Math.round(limit) || 25));
  try {
    let raw: RawPagePost[];
    if (src.kind === "demo") {
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
      raw = demoPosts(src.pageId, n);
    } else {
      const own = managedPage(src.pageId);
      const tokens = own ? [own.page.accessToken!] : readerTokens();
      if (!tokens.length) throw new ScrapeError("Chưa có nick thật nào để đọc trang, hãy thêm nick ở mục Nick & Trang");
      let lastErr: unknown;
      raw = [];
      let ok = false;
      for (const t of tokens) {
        try {
          raw = await fetchPagePosts(src.pageId, t, n, db.settings.graphVersion);
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ok) throw new ScrapeError(permissionHint(lastErr));
    }
    const added = upsert(src, raw);
    src.lastFetchedAt = new Date().toISOString();
    src.error = undefined;
    recount();
    addLog("success", `🔎 Cào ${src.name}: ${raw.length} bài (${added} bài mới)`);
    return { added, total: raw.length };
  } catch (e: any) {
    src.error = e?.message ?? String(e);
    src.lastFetchedAt = new Date().toISOString();
    addLog("error", `🔎 Cào ${src.name} lỗi: ${src.error}`);
    throw e instanceof ScrapeError ? e : new ScrapeError(src.error!);
  } finally {
    busy.delete(id);
    save();
  }
}

export function removeSource(id: string, keepSaved: boolean) {
  const db = getDB();
  db.sources = db.sources.filter((s) => s.id !== id);
  db.scraped = db.scraped.filter((p) => p.sourceId !== id || (keepSaved && p.saved));
  recount();
  save();
}

export function startAutoFetch() {
  setInterval(() => {
    const now = Date.now();
    for (const s of getDB().sources) {
      if (!s.autoEveryHours || busy.has(s.id)) continue;
      const last = s.lastFetchedAt ? Date.parse(s.lastFetchedAt) : 0;
      if (now - last >= s.autoEveryHours * 3600_000) fetchSource(s.id).catch(() => {});
    }
  }, AUTO_TICK_MS);
}

// ---------- Scraped posts ----------

export function queryScraped(q: ScrapedQuery) {
  const needle = q.q?.trim().toLowerCase();
  let items = getDB().scraped.filter(
    (p) =>
      (!q.sourceId || p.sourceId === q.sourceId) &&
      (q.saved === undefined || p.saved === q.saved) &&
      (!q.withImages || p.images.length > 0) &&
      (!needle || p.message.toLowerCase().includes(needle) || p.sourceName.toLowerCase().includes(needle)),
  );
  const key: Record<string, (p: ScrapedPost) => number> = {
    new: (p) => Date.parse(p.createdTime),
    hot: engagement,
    likes: (p) => p.likes,
    comments: (p) => p.comments,
    shares: (p) => p.shares,
  };
  const k = key[q.sort ?? "new"] ?? key.new;
  items = items.sort((a, b) => k(b) - k(a));
  return { items: items.slice(0, Math.min(500, q.limit ?? 120)), total: items.length };
}

export function updateScraped(ids: string[], action: "save" | "unsave" | "delete" | "used") {
  const db = getDB();
  const set = new Set(ids);
  const now = new Date().toISOString();
  if (action === "delete") db.scraped = db.scraped.filter((p) => !set.has(p.id));
  for (const p of db.scraped) {
    if (!set.has(p.id)) continue;
    if (action === "save") Object.assign(p, { saved: true, savedAt: now });
    if (action === "unsave") Object.assign(p, { saved: false, savedAt: undefined });
    if (action === "used") p.usedAt = now;
  }
  recount();
  save();
}

export function clearUnsaved(sourceId?: string) {
  const db = getDB();
  const before = db.scraped.length;
  db.scraped = db.scraped.filter((p) => p.saved || (sourceId && p.sourceId !== sourceId));
  recount();
  save();
  return before - db.scraped.length;
}

// Copies a scraped post's images into local media so the composer can post them
export async function importMedia(postId: string): Promise<MediaFile[]> {
  const post = getDB().scraped.find((p) => p.id === postId);
  if (!post) throw new ScrapeError("Không tìm thấy bài này");
  const out: MediaFile[] = [];
  for (const [i, url] of post.images.slice(0, 10).entries()) {
    try {
      let buf: Buffer;
      let mime: string;
      if (url.startsWith("data:")) {
        const m = url.match(/^data:([^;,]+)(;base64)?,(.*)$/);
        if (!m) continue;
        mime = m[1];
        buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
      } else {
        if (!/^https:\/\//i.test(url)) continue;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        mime = (res.headers.get("content-type") ?? "").split(";")[0];
        if (!res.ok || !mime.startsWith("image/")) continue;
        buf = Buffer.from(await res.arrayBuffer());
      }
      if (buf.length > 15 * 1024 * 1024) continue;
      const ext = { "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg" }[mime] ?? ".jpg";
      const filename = uid() + ext;
      fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
      out.push({ id: uid(), filename, originalName: `${post.sourceName}-${i + 1}${ext}`, url: `/media/${filename}`, mime, type: "image", size: buf.length });
    } catch {
      // A broken image should not block reusing the text
    }
  }
  updateScraped([postId], "used");
  return out;
}
