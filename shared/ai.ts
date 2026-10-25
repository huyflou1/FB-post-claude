// AI writing assistant: providers, options and the request/response shapes

export type AiProviderId = "anthropic" | "openai" | "gemini" | "deepseek" | "openrouter" | "ollama";

export interface AiProviderMeta {
  id: AiProviderId;
  name: string;
  emoji: string;
  tone: "peach" | "mint" | "blue" | "sky" | "violet" | "lemon";
  note: string;
  needsKey: boolean;
  keyUrl?: string;
  // First entry is the default; the field also accepts any model id typed in
  models: { id: string; label: string }[];
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: "anthropic",
    name: "Claude",
    emoji: "🧡",
    tone: "peach",
    note: "Anthropic · viết tiếng Việt tự nhiên",
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 · chất lượng cao" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 · nhanh, cân bằng" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 · rẻ nhất" },
      { id: "claude-fable-5-1", label: "Claude Fable 5.1 · mạnh nhất" },
    ],
  },
  {
    id: "openai",
    name: "ChatGPT",
    emoji: "💚",
    tone: "mint",
    note: "OpenAI",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4.1", label: "gpt-4.1" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    emoji: "💙",
    tone: "blue",
    note: "Google AI Studio",
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    emoji: "🐳",
    tone: "sky",
    note: "Giá rẻ",
    needsKey: true,
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    emoji: "🌐",
    tone: "violet",
    note: "Một key, hàng trăm mô hình",
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-sonnet-5-5", label: "anthropic/claude-sonnet-5-5" },
      { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "meta-llama/llama-3.3-70b-instruct" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    emoji: "🦙",
    tone: "lemon",
    note: "Chạy trên máy · miễn phí",
    needsKey: false,
    keyUrl: "https://ollama.com/download",
    models: [
      { id: "qwen2.5:7b", label: "qwen2.5:7b" },
      { id: "llama3.1:8b", label: "llama3.1:8b" },
      { id: "gemma2:9b", label: "gemma2:9b" },
    ],
  },
];

export const AI_TONES = [
  { id: "friendly", label: "Thân thiện", emoji: "😊" },
  { id: "sales", label: "Bán hàng", emoji: "🛍️" },
  { id: "funny", label: "Hài hước", emoji: "🤣" },
  { id: "pro", label: "Chuyên nghiệp", emoji: "💼" },
  { id: "inspire", label: "Truyền cảm hứng", emoji: "🌟" },
  { id: "story", label: "Kể chuyện", emoji: "📖" },
] as const;

export const AI_LENGTHS = [
  { id: "short", label: "Ngắn", hint: "2–3 câu" },
  { id: "medium", label: "Vừa", hint: "1 đoạn" },
  { id: "long", label: "Dài", hint: "nhiều đoạn" },
] as const;

export type AiTone = (typeof AI_TONES)[number]["id"];
export type AiLength = (typeof AI_LENGTHS)[number]["id"];

export interface AiRequest {
  provider: AiProviderId;
  model: string;
  mode: "topic" | "rewrite";
  topic: string;
  // Existing composer text, used by "rewrite"
  source?: string;
  tone: AiTone;
  length: AiLength;
  language: "vi" | "en";
  count: number;
  emoji: boolean;
  hashtags: boolean;
  cta: boolean;
  spintax: boolean;
  notes?: string;
}

export interface AiResponse {
  posts: string[];
  model: string;
  // Set when the provider served the request with a different model (e.g. a Claude fallback)
  servedBy?: string;
}
