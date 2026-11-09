// Logs and tool output can contain secrets. Everything an agent reads, and everything stored in a run, passes through here.
const PATTERNS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt]'],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[key]'],
  [/\b\d{1,3}\|[A-Za-z0-9]{30,}\b/g, '[token]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[github-token]'],
  [/(authorization|bearer)\s*[:=]?\s*[A-Za-z0-9._~+/=-]{16,}/gi, '$1 [redacted]'],
  [/\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS))\s*[=:]\s*\S+/g, '$1=[redacted]'],
  [/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[redacted]@'],
];

export function redact(text: string): string {
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

export function clip(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}\n[...${text.length - max} more characters cut]` : text;
}

/** Make any value safe to store or show: JSON, redacted, clipped. */
export function safe(value: unknown, max = 4000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return clip(redact(text), max);
}
