import fs from "fs";
import path from "path";
import type { AccountKind, FbPage, MediaFile } from "../shared/types";
import { MEDIA_DIR } from "./store";

// Thin wrapper over the official Graph API. Only Pages can be posted to by
// apps; personal timelines are not writable through the API.

export class FbError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
  }
  // 190 = invalid/expired token, 102 = session error
  get isAuth() {
    return this.code === 190 || this.code === 102;
  }
}

const API_TIMEOUT = 60_000;
const UPLOAD_TIMEOUT = 15 * 60_000;

const base = (v: string, video = false) => `https://graph${video ? "-video" : ""}.facebook.com/${v}`;

async function graph<T = any>(url: string, init?: RequestInit, timeout = API_TIMEOUT): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (e: any) {
    const reason = e?.name === "TimeoutError" ? "quá thời gian chờ" : e?.message ?? String(e);
    throw new FbError(`Không kết nối được Facebook (${reason})`);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    throw new FbError(err.error_user_msg || err.message || `Facebook trả về HTTP ${res.status}`, err.code, err.error_subcode);
  }
  return json as T;
}

export interface TokenInfo {
  id: string;
  name: string;
  picture?: string;
  kind: AccountKind;
}

export async function inspectToken(token: string, v: string): Promise<TokenInfo> {
  const q = new URLSearchParams({ fields: "id,name,picture.type(large)", metadata: "1", access_token: token });
  const me = await graph(`${base(v)}/me?${q}`);
  return {
    id: me.id,
    name: me.name,
    picture: me.picture?.data?.url,
    kind: me.metadata?.type === "page" ? "page" : "user",
  };
}

// Pages the user manages, each with its own page token
export async function fetchPages(token: string, v: string): Promise<FbPage[]> {
  const pages: FbPage[] = [];
  let url: string | undefined =
    `${base(v)}/me/accounts?` +
    new URLSearchParams({ fields: "id,name,category,access_token,picture.type(large)", limit: "100", access_token: token });
  for (let guard = 0; url && guard < 20; guard++) {
    const r: any = await graph(url);
    for (const p of r.data ?? []) {
      pages.push({
        id: p.id,
        name: p.name,
        category: p.category,
        picture: p.picture?.data?.url,
        accessToken: p.access_token,
        enabled: true,
      });
    }
    url = r.paging?.next;
  }
  return pages;
}

// Best effort: only works when the token belongs to a developer of the app
export async function tokenExpiry(token: string, v: string): Promise<string | null | undefined> {
  try {
    const q = new URLSearchParams({ input_token: token, access_token: token });
    const r: any = await graph(`${base(v)}/debug_token?${q}`);
    const exp = r.data?.expires_at;
    if (exp === 0) return null;
    return exp ? new Date(exp * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

export async function exchangeLongLived(token: string, appId: string, appSecret: string, v: string) {
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token,
  });
  const r: any = await graph(`${base(v)}/oauth/access_token?${q}`);
  return {
    token: r.access_token as string,
    expiresAt: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
  };
}

export interface PublishInput {
  message: string;
  link?: string;
  media: MediaFile[];
}

async function fileBlob(m: MediaFile) {
  return fs.openAsBlob(path.join(MEDIA_DIR, path.basename(m.filename)), { type: m.mime });
}

// Returns the id of the created post
export async function publishToPage(pageId: string, pageToken: string, input: PublishInput, v: string): Promise<string> {
  const images = input.media.filter((m) => m.type === "image");
  const video = input.media.find((m) => m.type === "video");
  // Photo and video posts have no link field, so the link goes into the text
  const textWithLink = input.link && input.media.length ? `${input.message}\n\n${input.link}`.trim() : input.message;

  if (video) {
    const fd = new FormData();
    fd.set("access_token", pageToken);
    fd.set("description", textWithLink);
    fd.set("source", await fileBlob(video), video.originalName);
    const r: any = await graph(`${base(v, true)}/${pageId}/videos`, { method: "POST", body: fd }, UPLOAD_TIMEOUT);
    return r.id;
  }

  if (images.length === 1) {
    const fd = new FormData();
    fd.set("access_token", pageToken);
    fd.set("message", textWithLink);
    fd.set("source", await fileBlob(images[0]), images[0].originalName);
    const r: any = await graph(`${base(v)}/${pageId}/photos`, { method: "POST", body: fd }, UPLOAD_TIMEOUT);
    return r.post_id ?? r.id;
  }

  const form = new URLSearchParams({ access_token: pageToken, message: textWithLink });
  if (images.length > 1) {
    // Upload unpublished photos first, then attach them all to one feed post
    for (let i = 0; i < images.length; i++) {
      const fd = new FormData();
      fd.set("access_token", pageToken);
      fd.set("published", "false");
      fd.set("source", await fileBlob(images[i]), images[i].originalName);
      const r: any = await graph(`${base(v)}/${pageId}/photos`, { method: "POST", body: fd }, UPLOAD_TIMEOUT);
      form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: r.id }));
    }
  } else if (input.link) {
    form.set("link", input.link);
  }
  const r: any = await graph(`${base(v)}/${pageId}/feed`, { method: "POST", body: form });
  return r.id;
}

// Demo accounts: no network, short delay, occasional failure to show retries
export async function demoPublish(pageId: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 1300));
  if (Math.random() < 0.1) throw new FbError("(Demo) Facebook tạm thời từ chối yêu cầu, hãy thử lại");
  return `${pageId}_${Date.now()}`;
}

// ---------- Reading Page posts (post hunting) ----------

export interface PageInfo {
  id: string;
  name: string;
  picture?: string;
  fans?: number;
}

export async function resolvePage(idOrSlug: string, token: string, v: string): Promise<PageInfo> {
  const q = new URLSearchParams({ fields: "id,name,picture.type(large),fan_count", access_token: token });
  const r: any = await graph(`${base(v)}/${encodeURIComponent(idOrSlug)}?${q}`);
  return { id: r.id, name: r.name, picture: r.picture?.data?.url, fans: r.fan_count };
}

export interface RawPagePost {
  id: string;
  message: string;
  createdTime: string;
  permalink?: string;
  images: string[];
  hasVideo: boolean;
  likes: number;
  comments: number;
  shares: number;
}

const POST_FIELDS = [
  "id",
  "message",
  "created_time",
  "permalink_url",
  "full_picture",
  "attachments{media_type,type,media{image{src}},subattachments.limit(10){type,media{image{src}}}}",
  "shares",
  "reactions.summary(total_count).limit(0)",
  "comments.summary(total_count).limit(0)",
].join(",");

function imagesOf(p: any): { images: string[]; hasVideo: boolean } {
  const images: string[] = [];
  let hasVideo = false;
  for (const a of p.attachments?.data ?? []) {
    if (String(a.media_type ?? a.type).includes("video")) hasVideo = true;
    const subs = a.subattachments?.data ?? [];
    for (const s of subs) {
      if (String(s.type).includes("video")) hasVideo = true;
      if (s.media?.image?.src) images.push(s.media.image.src);
    }
    if (!subs.length && a.media?.image?.src) images.push(a.media.image.src);
  }
  if (!images.length && p.full_picture) images.push(p.full_picture);
  return { images: [...new Set(images)].slice(0, 10), hasVideo };
}

// Newest first, following pagination until `limit` posts or the end
export async function fetchPagePosts(pageId: string, token: string, limit: number, v: string): Promise<RawPagePost[]> {
  const out: RawPagePost[] = [];
  let url: string | undefined =
    `${base(v)}/${encodeURIComponent(pageId)}/posts?` + new URLSearchParams({ fields: POST_FIELDS, limit: String(Math.min(50, limit)), access_token: token });
  for (let guard = 0; url && out.length < limit && guard < 20; guard++) {
    const r: any = await graph(url);
    for (const p of r.data ?? []) {
      const media = imagesOf(p);
      out.push({
        id: p.id,
        message: p.message ?? "",
        createdTime: p.created_time,
        permalink: p.permalink_url,
        ...media,
        likes: p.reactions?.summary?.total_count ?? 0,
        comments: p.comments?.summary?.total_count ?? 0,
        shares: p.shares?.count ?? 0,
      });
      if (out.length >= limit) break;
    }
    url = r.paging?.next;
  }
  return out;
}
