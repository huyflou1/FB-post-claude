import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Account, LogEntry, LogLevel, Post, ScrapedPost, ScrapeSource, Settings, Template } from "../shared/types";

// Everything lives in one JSON file under ./storage, written atomically

export const DATA_DIR = path.resolve(process.cwd(), "storage");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_LOGS = 2000;

fs.mkdirSync(MEDIA_DIR, { recursive: true });

export interface DB {
  sources: ScrapeSource[];
  scraped: ScrapedPost[];
  scrapedVersion: number;
  accounts: Account[];
  posts: Post[];
  templates: Template[];
  logs: LogEntry[];
  settings: Settings;
}

export const defaultSettings: Settings = {
  graphVersion: "v21.0",
  appId: "",
  appSecret: "",
  defaultDelayMin: 30,
  defaultDelayMax: 90,
  maxPerPagePerDay: 10,
  aiKeys: {},
  ollamaUrl: "http://localhost:11434",
};

const starterTemplates: Omit<Template, "id" | "createdAt">[] = [
  {
    emoji: "🌞",
    title: "Chào buổi sáng",
    content: "{Chào buổi sáng|Good morning|Ngày mới tốt lành} cả nhà {☀️|🌻|💛}\n{{page}} chúc mọi người một ngày {thật vui|tràn đầy năng lượng|suôn sẻ}!",
  },
  {
    emoji: "🛍️",
    title: "Giới thiệu sản phẩm",
    content: "{🔥|✨|🎉} {Hàng mới về|Sản phẩm mới|Siêu phẩm} tại {{page}}!\n\n👉 Inbox ngay để được tư vấn\n📦 Giao hàng toàn quốc",
  },
  {
    emoji: "🎁",
    title: "Minigame / Giveaway",
    content: "🎁 MINIGAME {{date}} 🎁\n\n{Like + Share|Thả tim + Chia sẻ} bài viết và comment {số may mắn|tên một người bạn} để nhận quà nhé!\n⏰ Kết thúc lúc 20:00 hôm nay.",
  },
];

let db: DB = load();
const listeners = new Set<() => void>();
let saveTimer: NodeJS.Timeout | null = null;

function load(): DB {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return {
      sources: raw.sources ?? [],
      scraped: raw.scraped ?? [],
      scrapedVersion: raw.scrapedVersion ?? 0,
      accounts: raw.accounts ?? [],
      posts: raw.posts ?? [],
      templates: raw.templates ?? [],
      logs: raw.logs ?? [],
      settings: { ...defaultSettings, ...raw.settings },
    };
  } catch {
    const now = new Date().toISOString();
    return {
      sources: [],
      scraped: [],
      scrapedVersion: 0,
      accounts: [],
      posts: [],
      templates: starterTemplates.map((t) => ({ ...t, id: uid(), createdAt: now })),
      logs: [],
      settings: { ...defaultSettings },
    };
  }
}

function writeNow() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function getDB(): DB {
  return db;
}

// Debounced write + change notification for the live UI
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeNow();
    } catch (e) {
      console.error("Không ghi được db.json:", e);
    }
  }, 150);
  for (const fn of listeners) fn();
}

export function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeNow();
}

export function onChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function addLog(level: LogLevel, message: string, postId?: string) {
  db.logs.unshift({ id: uid(), at: new Date().toISOString(), level, message, postId });
  if (db.logs.length > MAX_LOGS) db.logs.length = MAX_LOGS;
  save();
}
