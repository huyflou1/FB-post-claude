// Spintax + variables, used by the scheduler and by the composer preview.
//   {Chào|Xin chào|Hello} bạn  -> one option picked at random, nesting allowed
//   {{page}} {{account}} {{date}} {{time}} -> replaced per target page

export interface RenderVars {
  page?: string;
  account?: string;
  now?: Date;
}

export const VARIABLES = [
  { key: "page", label: "Tên trang" },
  { key: "account", label: "Tên nick" },
  { key: "date", label: "Ngày" },
  { key: "time", label: "Giờ" },
] as const;

const SPIN_GROUP = /\{([^{}]*\|[^{}]*)\}/;

export function renderContent(text: string, vars: RenderVars = {}, rand: () => number = Math.random): string {
  const now = vars.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const values: Record<string, string> = {
    page: vars.page ?? "",
    account: vars.account ?? "",
    date: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };

  let out = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => (key in values ? values[key] : m));
  // Innermost groups first, so nested spintax resolves outward
  for (let guard = 0; SPIN_GROUP.test(out) && guard < 1000; guard++) {
    out = out.replace(SPIN_GROUP, (_, group: string) => {
      const options = group.split("|");
      return options[Math.floor(rand() * options.length)];
    });
  }
  return out;
}

// Rough number of distinct texts (flat groups only), for the composer hint
export function countVariants(text: string): number {
  let total = 1;
  const flat = text.replace(/\{\{\s*\w+\s*\}\}/g, "");
  for (const m of flat.matchAll(/\{([^{}]*\|[^{}]*)\}/g)) {
    total *= m[1].split("|").length;
    if (total > 99999) return 99999;
  }
  return total;
}

// Small deterministic RNG so the preview stays stable until the user re-rolls
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
