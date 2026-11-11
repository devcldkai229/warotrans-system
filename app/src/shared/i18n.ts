import { viServerErrors } from './i18n/serverErrors';
import { vi } from './i18n/vi';

export type Language = 'en' | 'vi';

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string; shortLabel: string }> = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'vi', label: 'Tiếng Việt', shortLabel: 'VI' },
];

const STORAGE_KEY = 'warotrans.language';
const listeners = new Set<(language: Language) => void>();

function readInitialLanguage(): Language {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'vi') return saved;
    }
  } catch {
    // Storage can be unavailable in restricted contexts or native runtime before hydration.
  }
  return 'en';
}

let current: Language = readInitialLanguage();

export function getLanguage(): Language {
  return current;
}

export function getLocale(): string {
  return current === 'vi' ? 'vi-VN' : 'en-US';
}

export function syncActiveLanguage(language: Language): void {
  current = language;
}

export function setLanguage(language: Language): void {
  if (language !== 'en' && language !== 'vi') return;
  const changed = current !== language;
  current = language;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = language;
    }
  } catch {
    // Ignore web storage errors on native or test environments.
  }
  if (changed) {
    listeners.forEach((listener) => {
      try {
        listener(language);
      } catch {
        // Ignore listener errors.
      }
    });
  }
}

export function setLanguageForTests(language: Language): void {
  current = language;
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function fill(
  template: string,
  values?: Record<string, string | number | null | undefined>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function t(
  text: string,
  values?: Record<string, string | number | null | undefined>,
): string {
  const template = current === 'vi' ? (vi[text] ?? text) : text;
  return fill(template, values);
}

/** Marks an English source string that will be passed to `t()` where it is rendered. */
export function msg<T extends string>(text: T): T {
  return text;
}

function quotedValues(message: string): Record<string, string> {
  const values: Record<string, string> = {};
  let index = 1;
  for (const match of message.matchAll(/'([^']*)'/g)) {
    values[`q${index++}`] = match[1];
  }
  return values;
}

export function localizeServerMessage(
  code: string | null | undefined,
  message: string,
): string {
  if (current !== 'vi') return message;
  const template = code ? viServerErrors[code] : undefined;
  if (template) return fill(template, quotedValues(message));
  return vi[message] ?? translateText(message);
}

// Precomputed lowercase lookup and template pattern rules for automatic UI translation
const viLower: Record<string, string> = {};
interface TemplateRule {
  regex: RegExp;
  keys: string[];
  target: string;
  literalLength: number;
}
const templateRules: TemplateRule[] = [];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

(function buildTranslationIndexes() {
  for (const [enKey, viVal] of Object.entries(vi)) {
    const lower = enKey.toLowerCase();
    if (!(lower in viLower)) {
      viLower[lower] = viVal;
    }

    if (enKey.includes('{') && /\{[a-zA-Z0-9_]+\}/.test(enKey)) {
      const keys: string[] = [];
      const parts = enKey.split(/(\{[a-zA-Z0-9_]+\})/g);
      let literalLength = 0;
      let pattern = '^';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const match = /^\{([a-zA-Z0-9_]+)\}$/.exec(part);
        if (match) {
          keys.push(match[1]);
          pattern += '([\\s\\S]+?)';
        } else {
          literalLength += part.length;
          pattern += escapeRegex(part);
        }
      }
      pattern += '$';
      if (literalLength >= 2) {
        try {
          templateRules.push({
            regex: new RegExp(pattern),
            keys,
            target: viVal,
            literalLength,
          });
        } catch {
          // Ignore malformed regex patterns
        }
      }
    }
  }

  // Sort more specific templates (longer literal text) first
  templateRules.sort((a, b) => b.literalLength - a.literalLength);
})();

export function translateText(text: string): string {
  if (current !== 'vi' || !text) return text;

  // Direct fast-path
  if (vi[text] !== undefined) return vi[text];

  // Preserve leading and trailing whitespace
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match) return text;
  const [, leading, core, trailing] = match;
  if (!core) return text;

  if (vi[core] !== undefined) {
    return `${leading}${vi[core]}${trailing}`;
  }

  const normalizedCore = core.replace(/\s+/g, ' ');
  if (vi[normalizedCore] !== undefined) {
    return `${leading}${vi[normalizedCore]}${trailing}`;
  }

  const lowerCore = core.toLowerCase();
  if (viLower[lowerCore] !== undefined) {
    return `${leading}${viLower[lowerCore]}${trailing}`;
  }

  // Match against parameterized templates
  for (let i = 0; i < templateRules.length; i++) {
    const rule = templateRules[i];
    const m = rule.regex.exec(core) ?? (normalizedCore !== core ? rule.regex.exec(normalizedCore) : null);
    if (m) {
      const values: Record<string, string> = {};
      for (let k = 0; k < rule.keys.length; k++) {
        const rawCapture = m[k + 1] ?? '';
        const trimmedCapture = rawCapture.trim();
        values[rule.keys[k]] = vi[trimmedCapture] ?? rawCapture;
      }
      return `${leading}${fill(rule.target, values)}${trailing}`;
    }
  }

  return text;
}

export function translateNode(node: unknown): unknown {
  if (current !== 'vi' || node == null || typeof node === 'boolean') {
    return node;
  }

  if (typeof node === 'string') {
    return translateText(node);
  }

  if (Array.isArray(node)) {
    const allPrimitives = node.every(
      (child) =>
        child == null ||
        typeof child === 'boolean' ||
        typeof child === 'string' ||
        typeof child === 'number',
    );
    if (allPrimitives) {
      const combined = node
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .map((child) => String(child))
        .join('');
      if (combined) {
        const translated = translateText(combined);
        if (translated !== combined) {
          return translated;
        }
      }
    }
    return node.map((child) => translateNode(child));
  }

  return node;
}

const TITLE_PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Job ([0-9a-f-]+) completed$/i, (m) => t('Job {id} completed', { id: m[1] })],
  [/^Job ([0-9a-f-]+) cancelled$/i, (m) => t('Job {id} cancelled', { id: m[1] })],
  [/^Job ([0-9a-f-]+) halted$/i, (m) => t('Job {id} halted', { id: m[1] })],
  [/^AMR (\S+) fault \(([^)]+)\)$/i, (m) => t('AMR {amr} fault ({code})', { amr: m[1], code: m[2] })],
  [
    /^Stock receipt (\S+) approved$/i,
    (m) => t('Stock receipt {code} approved', { code: m[1] }),
  ],
  [
    /^Stock receipt (\S+) rejected$/i,
    (m) => t('Stock receipt {code} rejected', { code: m[1] }),
  ],
  [
    /^Stock issue (\S+) approved$/i,
    (m) => t('Stock issue {code} approved', { code: m[1] }),
  ],
  [
    /^Stock issue (\S+) rejected$/i,
    (m) => t('Stock issue {code} rejected', { code: m[1] }),
  ],
];

const CONTENT_PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^AMR (\S+) delivered to (.+)\.$/i,
    (m) => t('AMR {amr} delivered to {destination}.', { amr: m[1], destination: m[2] }),
  ],
  [
    /^Cancelled by (\S+): (.+)$/i,
    (m) =>
      t('Cancelled by {actor}: {reason}', {
        actor: t(m[1]),
        reason: localizeServerMessage(null, m[2]),
      }),
  ],
  [
    /^Halted by (\S+): (.+)$/i,
    (m) =>
      t('Halted by {actor}: {reason}', {
        actor: t(m[1]),
        reason: localizeServerMessage(null, m[2]),
      }),
  ],
  [
    /^AMR (\S+) reported fault ([^.]+)\. Immediate operator attention required\.$/i,
    (m) =>
      t('AMR {amr} reported fault {code}. Immediate operator attention required.', {
        amr: m[1],
        code: m[2],
      }),
  ],
  [
    /^Approved by ([^.]+)\. Inventory quantities have been updated\.$/i,
    (m) =>
      t('Approved by {approver}. Inventory quantities have been updated.', {
        approver: m[1],
      }),
  ],
  [
    /^Rejected by ([^:]+): (.+)$/i,
    (m) =>
      t('Rejected by {approver}: {reason}', {
        approver: m[1],
        reason: localizeServerMessage(null, m[2]),
      }),
  ],
];

export function localizedNotificationText(notification: {
  title: string;
  content: string;
}): { title: string; content: string } {
  if (current !== 'vi') {
    return { title: notification.title, content: notification.content };
  }

  let title = translateText(notification.title);
  for (const [pattern, format] of TITLE_PATTERNS) {
    const match = notification.title.match(pattern);
    if (match) {
      title = format(match);
      break;
    }
  }

  const normalizedContent = notification.content
    .replace(/\b(\d+)\s+h\s+(\d+)\s+min\b/g, '$1 giờ $2 phút')
    .replace(/\b(\d+)\s+min\b/g, '$1 phút')
    .replace(/\b(\d+)\s+days\b/g, '$1 ngày');

  let content = translateText(normalizedContent);
  if (content === normalizedContent) {
    content = translateText(notification.content);
  }
  for (const [pattern, format] of CONTENT_PATTERNS) {
    const match = notification.content.match(pattern);
    if (match) {
      content = format(match);
      break;
    }
  }

  return { title, content };
}
