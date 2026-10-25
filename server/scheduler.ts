import { renderContent } from "../shared/spintax";
import type { Post, Settings, TargetResult } from "../shared/types";
import { demoPublish, FbError, publishToPage } from "./facebook";
import { addLog, getDB, save, uid } from "./store";

// Polls for due posts and publishes them one page at a time, with a random
// pause between pages so a batch never hits many Pages in the same second.

const TICK_MS = 5000;
const active = new Set<string>();

export function isRunning(id: string) {
  return active.has(id);
}

export function startScheduler() {
  // A post that was mid-run when the app stopped resumes where it left off
  for (const p of getDB().posts) {
    if (p.status === "running") {
      p.status = "scheduled";
      p.scheduleAt = new Date().toISOString();
    }
  }
  save();
  setInterval(tick, TICK_MS);
  tick();
}

function tick() {
  const now = Date.now();
  for (const p of getDB().posts) {
    if (p.status === "scheduled" && !active.has(p.id) && (!p.scheduleAt || Date.parse(p.scheduleAt) <= now)) {
      void runPost(p.id);
    }
  }
}

export function postLabel(post: Post) {
  const first = post.content.replace(/\s+/g, " ").trim();
  if (!first) return post.media.length ? `${post.media.length} tệp đính kèm` : "(trống)";
  return first.length > 40 ? first.slice(0, 40) + "…" : first;
}

function postedToday(pageId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let n = 0;
  for (const p of getDB().posts) {
    for (const t of p.targets) {
      if (t.pageId === pageId && t.status === "success" && t.at && Date.parse(t.at) >= start.getTime()) n++;
    }
  }
  return n;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pause(post: Post) {
  const min = Math.max(0, post.delayMin);
  const max = Math.max(min, post.delayMax);
  const until = Date.now() + (min + Math.random() * (max - min)) * 1000;
  while (Date.now() < until && !post.cancelRequested) await sleep(Math.min(500, until - Date.now()));
}

async function publishTarget(post: Post, t: TargetResult, settings: Settings) {
  const acc = getDB().accounts.find((a) => a.id === t.accountId);
  const page = acc?.pages.find((p) => p.id === t.pageId);
  t.at = new Date().toISOString();

  if (!acc || !page) {
    t.status = "failed";
    t.error = "Nick hoặc trang không còn trong danh sách";
    addLog("error", `✗ ${t.pageName}: ${t.error}`, post.id);
    return;
  }
  if (settings.maxPerPagePerDay > 0 && postedToday(page.id) >= settings.maxPerPagePerDay) {
    t.status = "skipped";
    t.error = `Trang đã đủ ${settings.maxPerPagePerDay} bài hôm nay`;
    addLog("warn", `⏭ ${page.name}: ${t.error}`, post.id);
    return;
  }

  const message = renderContent(post.content, { page: page.name, account: acc.name });
  t.message = message;
  try {
    t.fbPostId =
      acc.status === "demo"
        ? await demoPublish(page.id)
        : await publishToPage(page.id, page.accessToken ?? "", { message, link: post.link, media: post.media }, settings.graphVersion);
    t.status = "success";
    t.error = undefined;
    addLog("success", `✓ Đã đăng lên ${page.name}`, post.id);
  } catch (e: any) {
    t.status = "failed";
    t.error = e?.message ?? String(e);
    if (e instanceof FbError && e.isAuth && acc.status !== "demo") {
      acc.status = "error";
      acc.error = "Token hết hạn hoặc đã bị thu hồi, hãy dán token mới";
    }
    addLog("error", `✗ ${page.name}: ${t.error}`, post.id);
  }
  t.at = new Date().toISOString();
}

export async function runPost(id: string) {
  const post = getDB().posts.find((p) => p.id === id);
  if (!post || active.has(id)) return;
  active.add(id);

  const queue = post.targets.filter((t) => t.status !== "success");
  post.status = "running";
  post.startedAt = new Date().toISOString();
  post.cancelRequested = false;
  for (const t of queue) {
    t.status = "pending";
    t.error = undefined;
  }
  addLog("info", `🚀 Bắt đầu đăng "${postLabel(post)}" lên ${queue.length} trang`, post.id);

  try {
    for (let i = 0; i < queue.length; i++) {
      if (post.cancelRequested || !getDB().posts.includes(post)) break;
      await publishTarget(post, queue[i], getDB().settings);
      save();
      if (i < queue.length - 1) await pause(post);
    }
  } finally {
    active.delete(id);
    finish(post);
  }
}

function finish(post: Post) {
  if (!getDB().posts.includes(post)) return;
  const ok = post.targets.filter((t) => t.status === "success").length;
  const total = post.targets.length;
  post.finishedAt = new Date().toISOString();

  if (post.cancelRequested && post.targets.some((t) => t.status === "pending")) {
    post.status = "cancelled";
    addLog("warn", `⏸ Đã dừng "${postLabel(post)}" (${ok}/${total} trang)`, post.id);
  } else {
    post.status = ok === total ? "done" : ok === 0 ? "failed" : "partial";
    addLog(ok === total ? "success" : ok === 0 ? "error" : "warn", `🏁 Xong "${postLabel(post)}": ${ok}/${total} trang thành công`, post.id);
  }
  post.cancelRequested = false;

  if (post.repeat !== "none" && post.status !== "cancelled") scheduleRepeat(post);
  save();
}

// Recurring posts: queue a fresh copy for the next slot, the finished one stays as history
function scheduleRepeat(post: Post) {
  const step = post.repeat === "daily" ? 86_400_000 : 7 * 86_400_000;
  let next = Date.parse(post.scheduleAt ?? post.startedAt ?? new Date().toISOString()) + step;
  while (next <= Date.now()) next += step;
  const now = new Date().toISOString();
  getDB().posts.push({
    ...post,
    id: uid(),
    status: "scheduled",
    scheduleAt: new Date(next).toISOString(),
    targets: post.targets.map((t) => ({ accountId: t.accountId, pageId: t.pageId, pageName: t.pageName, status: "pending" })),
    createdAt: now,
    updatedAt: now,
    startedAt: undefined,
    finishedAt: undefined,
  });
  post.repeat = "none";
  addLog("info", `🔁 Đã lên lịch lặp lại "${postLabel(post)}" lúc ${new Date(next).toLocaleString("vi-VN")}`);
}
