import Anthropic from "@anthropic-ai/sdk";
import { AI_LENGTHS, AI_PROVIDERS, AI_TONES, type AiProviderId, type AiRequest, type AiResponse } from "../shared/ai";
import type { Settings } from "../shared/types";

// Turns a topic (or an existing draft) into ready-to-post Facebook texts using
// whichever model the user picked. Claude goes through the official SDK; the
// others are plain HTTP calls to their public chat endpoints.

export class AiError extends Error {}

const SEPARATOR = "===";
const TIMEOUT = 120_000;

// OpenAI-style /chat/completions endpoints
const CHAT_BASE: Partial<Record<AiProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

// Claude models that accept server-side refusal fallbacks
const CLAUDE_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

function buildPrompt(r: AiRequest) {
  const tone = AI_TONES.find((t) => t.id === r.tone)?.label ?? "Thân thiện";
  const length = AI_LENGTHS.find((l) => l.id === r.length);
  const lang = r.language === "en" ? "English" : "tiếng Việt";

  const system = [
    "You write Facebook Page posts that people actually stop scrolling for.",
    `Write in ${lang}, sounding like a real person running the Page, not like an ad generator.`,
    "Output only the post texts themselves: no titles, no numbering, no commentary before or after, no markdown (Facebook shows ** and # literally).",
    `When asked for several posts, make each one take a clearly different angle, and put a line containing only ${SEPARATOR} between posts.`,
  ].join("\n");

  const rules = [
    `Giọng văn: ${tone}.`,
    `Độ dài: ${length?.label ?? "Vừa"} (${length?.hint ?? "1 đoạn"}).`,
    r.emoji ? "Dùng emoji vừa phải để bài sinh động." : "Không dùng emoji.",
    r.hashtags ? "Kết thúc bằng 3–5 hashtag liên quan." : "Không dùng hashtag.",
    r.cta ? "Có một lời kêu gọi hành động rõ ràng (bình luận, inbox, chia sẻ...)." : "",
    r.spintax
      ? "Viết một số cụm từ dưới dạng spintax {lựa chọn 1|lựa chọn 2|lựa chọn 3} để mỗi trang nhận câu chữ hơi khác nhau; các lựa chọn phải thay thế được cho nhau trong câu."
      : "",
    "Có thể dùng {{page}} ở nơi cần nhắc tên trang; app sẽ tự thay bằng tên trang thật.",
    r.notes?.trim() ? `Yêu cầu thêm: ${r.notes.trim()}` : "",
  ].filter(Boolean);

  const task =
    r.mode === "rewrite"
      ? `Viết lại bài sau thành ${r.count} phiên bản hay hơn, giữ đúng ý chính${r.topic.trim() ? ` (định hướng: ${r.topic.trim()})` : ""}:\n\n<bai_goc>\n${r.source ?? ""}\n</bai_goc>`
      : `Viết ${r.count} bài đăng Facebook về chủ đề: ${r.topic.trim()}`;

  return { system, user: `${task}\n\n${rules.join("\n")}` };
}

function splitPosts(text: string, count: number): string[] {
  const parts = text
    .split(new RegExp(`^\\s*${SEPARATOR}+\\s*$`, "m"))
    .map((p) => p.replace(/\*\*(.+?)\*\*/g, "$1").trim())
    .filter(Boolean);
  return (parts.length ? parts : [text.trim()]).slice(0, Math.max(1, count));
}

async function http(url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (e: any) {
    const reason = e?.name === "TimeoutError" ? "quá thời gian chờ" : e?.cause?.code === "ECONNREFUSED" ? "không kết nối được" : e?.message;
    throw new AiError(`Không gọi được mô hình (${reason})`);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error ?? json?.message ?? `HTTP ${res.status}`;
    throw new AiError(res.status === 401 || res.status === 403 ? `API key không hợp lệ (${msg})` : String(msg));
  }
  return json;
}

async function callClaude(key: string, model: string, system: string, user: string) {
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT, maxRetries: 1 });
  const useFallback = CLAUDE_FALLBACK_MODELS.has(model);
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
      // Short marketing copy does not need deep reasoning
      output_config: { effort: "low" },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new AiError("Claude từ chối viết nội dung này, hãy đổi chủ đề hoặc cách diễn đạt");
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, servedBy: res.model !== model ? res.model : undefined };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("API key Claude không hợp lệ");
    if (e instanceof Anthropic.NotFoundError) throw new AiError(`Không tìm thấy mô hình ${model}`);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude đang giới hạn tốc độ, thử lại sau ít phút");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude báo lỗi: ${e.message}`);
    throw new AiError(`Không gọi được Claude (${(e as Error)?.message ?? e})`);
  }
}

async function callChat(base: string, key: string, model: string, system: string, user: string, extraHeaders: Record<string, string> = {}) {
  const json = await http(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  return { text: String(json?.choices?.[0]?.message?.content ?? ""), servedBy: json?.model && json.model !== model ? String(json.model) : undefined };
}

async function callGemini(key: string, model: string, system: string, user: string) {
  const json = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });
  const cand = json?.candidates?.[0];
  if (!cand && json?.promptFeedback?.blockReason) throw new AiError("Gemini chặn yêu cầu này, hãy đổi chủ đề");
  return { text: (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("") };
}

export async function generatePosts(r: AiRequest, settings: Settings): Promise<AiResponse> {
  const meta = AI_PROVIDERS.find((p) => p.id === r.provider);
  if (!meta) throw new AiError("Nhà cung cấp AI không hợp lệ");
  const model = r.model.trim() || meta.models[0].id;
  const key = settings.aiKeys?.[r.provider]?.trim() ?? "";
  if (meta.needsKey && !key) throw new AiError(`Chưa có API key cho ${meta.name}. Thêm ở Cài đặt → Trợ lý AI.`);
  if (r.mode === "topic" && !r.topic.trim()) throw new AiError("Hãy nhập chủ đề bài viết");
  if (r.mode === "rewrite" && !r.source?.trim()) throw new AiError("Ô nội dung đang trống, chưa có gì để viết lại");

  const count = Math.min(5, Math.max(1, Math.round(r.count) || 1));
  const { system, user } = buildPrompt({ ...r, count });

  let out: { text: string; servedBy?: string };
  switch (r.provider) {
    case "anthropic":
      out = await callClaude(key, model, system, user);
      break;
    case "gemini":
      out = await callGemini(key, model, system, user);
      break;
    case "ollama":
      try {
        out = await callChat(`${(settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "")}/v1`, "", model, system, user);
      } catch (e) {
        if (e instanceof AiError && e.message.includes("không kết nối được")) {
          throw new AiError(`Ollama chưa chạy. Mở ứng dụng Ollama rồi chạy "ollama pull ${model}" một lần.`);
        }
        throw e;
      }
      break;
    case "openrouter":
      out = await callChat(CHAT_BASE.openrouter!, key, model, system, user, { "X-Title": "FB Scrat & AutoPost by HuyFlou" });
      break;
    default:
      out = await callChat(CHAT_BASE[r.provider]!, key, model, system, user);
  }

  const posts = splitPosts(out.text, count);
  if (!posts.join("").trim()) throw new AiError("Mô hình không trả về nội dung, hãy thử lại");
  return { posts, model, servedBy: out.servedBy };
}
