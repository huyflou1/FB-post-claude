// Types shared by the server and the React app

import type { AiProviderId } from "./ai";

export type AccountStatus = "ok" | "error" | "demo";
export type AccountKind = "user" | "page";

export interface FbPage {
  id: string;
  name: string;
  category?: string;
  picture?: string;
  // Pages switched off here are hidden from the composer
  enabled: boolean;
  // Server only, never sent to the browser
  accessToken?: string;
}

export interface Account {
  id: string;
  fbId: string;
  name: string;
  label: string;
  picture?: string;
  kind: AccountKind;
  status: AccountStatus;
  error?: string;
  color: string;
  tokenPreview: string;
  tokenExpiresAt?: string | null;
  // Server only, never sent to the browser
  token?: string;
  pages: FbPage[];
  addedAt: string;
  checkedAt?: string;
}

export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  mime: string;
  type: "image" | "video";
  size: number;
}

export interface Target {
  accountId: string;
  pageId: string;
}

export type ResultStatus = "pending" | "success" | "failed" | "skipped";

export interface TargetResult extends Target {
  pageName: string;
  status: ResultStatus;
  fbPostId?: string;
  error?: string;
  message?: string;
  at?: string;
}

export type PostStatus = "draft" | "scheduled" | "running" | "done" | "partial" | "failed" | "cancelled";
export type Repeat = "none" | "daily" | "weekly";

export interface Post {
  id: string;
  content: string;
  link?: string;
  media: MediaFile[];
  targets: TargetResult[];
  status: PostStatus;
  scheduleAt: string | null;
  repeat: Repeat;
  delayMin: number;
  delayMax: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequested?: boolean;
}

export interface Template {
  id: string;
  title: string;
  emoji: string;
  content: string;
  createdAt: string;
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: string;
  at: string;
  level: LogLevel;
  message: string;
  postId?: string;
}

export interface Settings {
  graphVersion: string;
  appId: string;
  // Write only from the browser; reads come back empty with hasAppSecret set
  appSecret: string;
  hasAppSecret?: boolean;
  defaultDelayMin: number;
  defaultDelayMax: number;
  maxPerPagePerDay: number;
  // Write only from the browser, like appSecret; reads list which ones are set
  aiKeys: Partial<Record<AiProviderId, string>>;
  aiKeysSet?: AiProviderId[];
  ollamaUrl: string;
}

export interface AppState {
  sources: ScrapeSource[];
  // Bumped whenever scraped posts change, so screens know to reload them
  scrapedVersion: number;
  scrapedCount: number;
  savedCount: number;
  accounts: Account[];
  posts: Post[];
  templates: Template[];
  logs: LogEntry[];
  settings: Settings;
  serverTime: string;
}

// Body of POST /api/posts and PUT /api/posts/:id
export interface PostInput {
  content: string;
  link?: string;
  media: MediaFile[];
  targets: Target[];
  mode: "now" | "schedule" | "draft";
  scheduleAt?: string | null;
  repeat?: Repeat;
  delayMin?: number;
  delayMax?: number;
}

// ---------- Post hunting (scraper) ----------

export type SourceKind = "own" | "public" | "demo";

export interface ScrapeSource {
  id: string;
  pageId: string;
  name: string;
  picture?: string;
  kind: SourceKind;
  fans?: number;
  // 0 = manual only
  autoEveryHours: number;
  addedAt: string;
  lastFetchedAt?: string;
  error?: string;
  postCount: number;
  // Live flag, set by the server while a fetch runs
  fetching?: boolean;
}

export interface ScrapedPost {
  // Facebook post id, unique across sources
  id: string;
  sourceId: string;
  sourceName: string;
  message: string;
  createdTime: string;
  permalink?: string;
  images: string[];
  hasVideo: boolean;
  likes: number;
  comments: number;
  shares: number;
  fetchedAt: string;
  saved: boolean;
  savedAt?: string;
  usedAt?: string;
}

export type ScrapedSort = "new" | "hot" | "likes" | "comments" | "shares";

export interface ScrapedQuery {
  sourceId?: string;
  q?: string;
  saved?: boolean;
  withImages?: boolean;
  sort?: ScrapedSort;
  limit?: number;
}

export interface ScrapedPage {
  items: ScrapedPost[];
  total: number;
}

export function engagement(p: Pick<ScrapedPost, "likes" | "comments" | "shares">) {
  return p.likes + p.comments * 2 + p.shares * 3;
}
