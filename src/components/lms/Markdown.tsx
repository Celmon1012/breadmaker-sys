import React from 'react';

/**
 * A small, safe renderer for what agents write: paragraphs, bullet and numbered lists, headings, **bold**, *italic*
 * and `code`. It builds React elements (never raw HTML), so nothing an agent returns can inject markup or script.
 * Links are shown as text, not followed.
 */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) parts.push(<code key={key} className="rounded bg-[var(--pg-alt)] px-1 font-mono text-[0.92em]">{token.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index! + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={key++} className="leading-[1.65]">
          {paragraph.flatMap((line, i) => (i === 0 ? inline(line, `p${key}-${i}`) : [<br key={`br${key}-${i}`} />, ...inline(line, `p${key}-${i}`)]))}
        </p>,
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={key++} className={`space-y-1 pl-5 leading-[1.6] ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
          {list.items.map((item, i) => <li key={i}>{inline(item, `l${key}-${i}`)}</li>)}
        </Tag>,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<p key={key++} className="font-semibold">{inline(heading[1], `h${key}`)}</p>);
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list = list ?? { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className={`space-y-3 ${className}`}>{blocks}</div>;
}
