import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Puck, type Config, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { ArrowDown, ArrowUp, Check, ExternalLink, ImageUp, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import { PortalView, portal } from '../../lib/portal';
import { PageData, PageProposal } from '../../lib/page';
import { ACCENTS, FUNNEL_CSS } from '../../lib/funnel-css';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/lms';
import { Button, Chip, Loading, Notice, TextArea } from './lms-ui';

/**
 * The funnel's page as blocks, edited two ways: by hand in Puck (every block, every colour, images, video, embeds,
 * custom code, a phone/tablet/desktop preview), or by chatting. A chat request goes to the model, which proposes a
 * whole edited page; the member sees what it changed and applies or discards it. Nothing is saved until Publish,
 * and a paid, deployed site is rebuilt from what is saved. The preview draws the blocks with the same style sheet
 * as the live site (src/lib/funnel-css.ts), so the two look alike.
 */

type P = Record<string, string>;

const UploadContext = createContext<((file: File) => Promise<string>) | null>(null);

// ---- field helpers ---------------------------------------------------------------------------------------------

/** Puck labels its own field types but not custom ones, so a custom field draws its own label. */
const Labelled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>{label}</span>
    {children}
  </div>
);

const text = (label: string) => ({ type: 'text' as const, label });
const area = (label: string) => ({ type: 'textarea' as const, label });
const choice = (label: string, options: [string, string][]) => ({
  type: 'select' as const,
  label,
  options: options.map(([name, value]) => ({ label: name, value })),
});

const TONE = choice('Style', [['Plain', 'plain'], ['Tinted', 'alt'], ['Dark', 'dark'], ['Accent colour', 'accent']]);
const SPACE = choice('Spacing', [['Normal', 'normal'], ['Compact', 'compact'], ['Roomy', 'roomy']]);

/** A colour: a picker, the hex value, a few swatches, and "default" to clear it. */
function ColorInput({ value, onChange, allowEmpty = true }: { value: string; onChange: (value: string) => void; allowEmpty?: boolean }) {
  const shown = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#ffffff';
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={shown.length === 4 ? `#${shown[1]}${shown[1]}${shown[2]}${shown[2]}${shown[3]}${shown[3]}` : shown} onChange={(event) => onChange(event.target.value)} style={{ width: 44, height: 34, padding: 0, border: '1px solid #ccc', borderRadius: 6 }} />
        <input type="text" value={value} placeholder={allowEmpty ? 'Default' : '#1D6A58'} onChange={(event) => onChange(event.target.value.trim())} style={{ flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid #ccc', borderRadius: 6, font: 'inherit' }} />
        {allowEmpty && value && (
          <button type="button" onClick={() => onChange('')} style={{ padding: '6px 9px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Reset</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(ACCENTS).map(([name, hex]) => (
          <button key={name} type="button" title={name} aria-label={name} onClick={() => onChange(hex)} style={{ width: 22, height: 22, borderRadius: '50%', border: value.toLowerCase() === hex.toLowerCase() ? '2px solid #000' : '1px solid #ccc', background: hex, cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  );
}
const color = (label: string, allowEmpty = true) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <Labelled label={label}><ColorInput value={value ?? ''} onChange={onChange} allowEmpty={allowEmpty} /></Labelled>
  ),
});

/** An image: upload one, or paste an address. */
function ImageInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const upload = useContext(UploadContext);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file || !upload) return;
    setBusy(true);
    setProblem(null);
    try {
      onChange(await upload(file));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {value && /^https:\/\//i.test(value) && <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }} />}
      <input type="text" value={value} placeholder="https://… (or upload)" onChange={(event) => onChange(event.target.value.trim())} style={{ padding: '7px 9px', border: '1px solid #ccc', borderRadius: 6, font: 'inherit' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void pick(event.target.files?.[0])} />
        <button type="button" disabled={busy || !upload} onClick={() => input.current?.click()} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: upload ? 'pointer' : 'not-allowed' }}>
          <ImageUp size={15} /> {busy ? 'Uploading…' : upload ? 'Upload an image' : 'Sign in to upload'}
        </button>
        {value && <button type="button" onClick={() => onChange('')} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Remove</button>}
      </div>
      {problem && <p style={{ color: '#b42318', fontSize: 13, margin: 0 }}>{problem}</p>}
    </div>
  );
}
const image = (label: string) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <Labelled label={label}><ImageInput value={value ?? ''} onChange={onChange} /></Labelled>
  ),
});

/** Rows of cells, stored as lines of "a | b | c". The first cell is one line; the others can be longer. */
function RowsInput({ value, onChange, cells, max }: { value: string; onChange: (value: string) => void; cells: string[]; max: number }) {
  const rows = String(value ?? '').split('\n').filter((line) => line.trim() !== '').map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    return cells.map((_, i) => (i === cells.length - 1 ? parts.slice(i).join(' / ') : parts[i] ?? ''));
  });
  const save = (next: string[][]) => onChange(next.map((row) => row.map((cell) => cell.replace(/\|/g, '/')).join(' | ').replace(/( \| )+$/, '')).join('\n'));
  const edit = (r: number, c: number, cell: string) => save(rows.map((row, i) => (i === r ? row.map((old, j) => (j === c ? cell : old)) : row)));
  const move = (r: number, by: number) => {
    const next = [...rows];
    const target = r + by;
    if (target < 0 || target >= next.length) return;
    [next[r], next[target]] = [next[target], next[r]];
    save(next);
  };
  const small = { padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, font: 'inherit', width: '100%', boxSizing: 'border-box' as const };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
          {cells.map((label, c) =>
            c === 0 ? (
              <input key={c} value={row[c]} placeholder={label} onChange={(event) => edit(r, c, event.target.value)} style={small} />
            ) : (
              <textarea key={c} rows={2} value={row[c]} placeholder={label} onChange={(event) => edit(r, c, event.target.value)} style={small} />
            ),
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" aria-label="Move up" onClick={() => move(r, -1)} style={{ padding: 4, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}><ArrowUp size={14} /></button>
            <button type="button" aria-label="Move down" onClick={() => move(r, 1)} style={{ padding: 4, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}><ArrowDown size={14} /></button>
            <button type="button" aria-label="Remove" onClick={() => save(rows.filter((_, i) => i !== r))} style={{ padding: 4, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer', marginLeft: 'auto' }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" onClick={() => save([...rows, cells.map((_, i) => (i === 0 ? 'New item' : ''))])} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifySelf: 'start', padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
          <Plus size={14} /> Add
        </button>
      )}
    </div>
  );
}
const rows = (label: string, cells: string[], max: number) => ({
  type: 'custom' as const,
  label,
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <Labelled label={label}><RowsInput value={value ?? ''} onChange={onChange} cells={cells} max={max} /></Labelled>
  ),
});

// ---- drawing the blocks: the same markup and class names as the site template ----------------------------------

const hex = (v: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v ?? '') ? v : '');
const tone = (p: P, fallback = 'plain') => `tone-${['plain', 'alt', 'dark', 'accent'].includes(p.tone) ? p.tone : fallback}`;
const looks = (p: P): React.CSSProperties => ({
  ...(hex(p.bg) ? { background: hex(p.bg) } : {}),
  ...(hex(p.ink) ? ({ color: hex(p.ink), ['--body' as string]: hex(p.ink) } as React.CSSProperties) : {}),
});
const space = (p: P) => (p.space && p.space !== 'normal' ? p.space : undefined);
const rowsOf = (value: string) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('|').map((part) => part.trim()));
const paragraphs = (value: string) => String(value ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
const okUrl = (v: string) => /^https:\/\/[^\s"'<>]+$/i.test(v ?? '');

const Heading = ({ p, intro }: { p: P; intro?: string }) => (
  <>
    {p.eyebrow && <p className="eyebrow">{p.eyebrow}</p>}
    {p.title && <h2>{p.title}</h2>}
    {intro && <p className="intro">{intro}</p>}
  </>
);

const Placeholder = ({ label, url }: { label: string; url?: string }) => (
  <div className="media video" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.08)', color: '#57534a', textAlign: 'center', padding: 16, fontSize: 15 }}>
    <span>{label}{url ? <><br /><small style={{ wordBreak: 'break-all' }}>{url}</small></> : null}<br /><small>Shown on the live page</small></span>
  </div>
);

const block = (fields: Record<string, unknown>, defaultProps: P, render: (p: P) => React.ReactNode, extra: Record<string, unknown> = {}) => ({
  fields: { ...fields, bg: color('Background colour'), ink: color('Text colour'), space: SPACE },
  defaultProps: { bg: '', ink: '', space: 'normal', ...defaultProps },
  render: (props: P) => render(props),
  ...extra,
});

const config = {
  categories: {
    layout: { title: 'Layout', components: ['Hero', 'Section', 'Features', 'Steps', 'CallToAction', 'Spacer'] },
    proof: { title: 'Proof', components: ['Testimonials', 'Stats', 'FAQ'] },
    media: { title: 'Media', components: ['Image', 'Video', 'Embed', 'Code'] },
    forms: { title: 'Lead form', components: ['Enquiry'] },
  },
  root: {
    fields: {
      accent: color('Accent colour', false),
      bg: color('Page background'),
      ink: color('Text colour'),
      font: choice('Font', [['Clean sans-serif', 'sans'], ['Classic serif', 'serif'], ['Rounded', 'rounded'], ['Monospace', 'mono']]),
      radius: choice('Corners', [['Soft', 'soft'], ['Round', 'round'], ['Square', 'square']]),
      headerButton: choice('Button in the top bar', [['Show', 'yes'], ['Hide', 'no']]),
      seoTitle: text('Search result title'),
      seoDescription: area('Search result description'),
    },
    defaultProps: { accent: '#1D6A58', bg: '', ink: '', font: 'sans', radius: 'soft', headerButton: 'yes', seoTitle: '', seoDescription: '' },
    render: ({ children, ...p }: { children: React.ReactNode } & P) => (
      <div
        className="fp"
        data-font={p.font || 'sans'}
        data-radius={p.radius || 'soft'}
        style={{ ['--accent' as string]: hex(p.accent) || '#1D6A58', ...(hex(p.bg) ? { ['--bg' as string]: hex(p.bg) } : {}), ...(hex(p.ink) ? { ['--ink' as string]: hex(p.ink) } : {}) } as React.CSSProperties}
      >
        <style>{FUNNEL_CSS}</style>
        <header className="top">
          <div className="wrap">
            <span className="logo">Your business</span>
            {p.headerButton !== 'no' && <span className="btn">Get in touch</span>}
          </div>
        </header>
        {children}
        <footer className="foot"><div className="wrap">© Your business. Built with Breadmaker Launchpad.</div></footer>
      </div>
    ),
  },
  components: {
    Hero: block(
      {
        eyebrow: text('Small label above the headline'),
        headline: text('Headline'),
        subheadline: area('Subheadline'),
        buttonLabel: text('Button text'),
        buttonLink: text('Button goes to (#enquire = the form)'),
        secondLabel: text('Second button text'),
        secondLink: text('Second button goes to'),
        image: image('Image'),
        imageAlt: text('Image description'),
        align: choice('Alignment', [['Left', 'left'], ['Centred', 'center']]),
        tone: TONE,
      },
      { eyebrow: '', headline: 'Your headline', subheadline: '', buttonLabel: 'Get in touch', buttonLink: '#enquire', secondLabel: '', secondLink: '', image: '', imageAlt: '', align: 'left', tone: 'plain' },
      (p) => (
        <section className={`hero ${tone(p)} ${p.align === 'center' ? 'center' : ''}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap">
            <div className={`hero-grid ${okUrl(p.image) ? 'has-img' : ''}`}>
              <div>
                {p.eyebrow && <p className="eyebrow">{p.eyebrow}</p>}
                <h1>{p.headline}</h1>
                {p.subheadline && <p className="lead">{p.subheadline}</p>}
                <div className="row">
                  {p.buttonLabel && <span className="btn">{p.buttonLabel}</span>}
                  {p.secondLabel && <span className="btn ghost">{p.secondLabel}</span>}
                </div>
              </div>
              {okUrl(p.image) && <img className="shot" src={p.image} alt={p.imageAlt} />}
            </div>
          </div>
        </section>
      ),
    ),
    Section: block(
      {
        title: text('Title'),
        body: area('Text (a blank line starts a new paragraph)'),
        bullets: area('Bullet points (one per line)'),
        image: image('Image'),
        imageAlt: text('Image description'),
        imageSide: choice('Image on the', [['Right', 'right'], ['Left', 'left']]),
        align: choice('Alignment', [['Left', 'left'], ['Centred', 'center']]),
        tone: TONE,
      },
      { title: 'A new section', body: 'Write about one thing here.', bullets: '', image: '', imageAlt: '', imageSide: 'right', align: 'left', tone: 'plain' },
      (p) => {
        const pic = okUrl(p.image);
        const bullets = paragraphs(p.bullets);
        return (
          <section className={`band ${tone(p)} ${p.align === 'center' ? 'center' : ''}`} data-space={space(p)} style={looks(p)}>
            <div className={`wrap ${pic ? '' : 'narrow'}`}>
              <div className={`split ${pic ? 'has-img' : ''} ${p.imageSide === 'left' ? 'rev' : ''}`}>
                <div>
                  {p.title && <h2>{p.title}</h2>}
                  {paragraphs(p.body).map((line, i) => <p key={i}>{line}</p>)}
                  {bullets.length > 0 && <ul className="ticks">{bullets.map((line, i) => <li key={i}>{line}</li>)}</ul>}
                </div>
                {pic && <img className="shot pic" src={p.image} alt={p.imageAlt} />}
              </div>
            </div>
          </section>
        );
      },
    ),
    Features: block(
      {
        title: text('Title'),
        intro: area('Intro'),
        items: rows('Cards', ['Title', 'Text', 'Icon or emoji (optional)'], 24),
        columns: choice('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
        tone: TONE,
      },
      { title: 'What you get', intro: '', items: 'First point | What it means for you\nSecond point | What it means for you\nThird point | What it means for you', columns: '3', tone: 'alt' },
      (p) => (
        <section className={`band ${tone(p, 'alt')}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap">
            <Heading p={p} intro={p.intro} />
            <div className={`cards c${['2', '3', '4'].includes(p.columns) ? p.columns : '3'}`}>
              {rowsOf(p.items).map(([t, d, icon], i) => (
                <div className="card" key={i}><span className="ico">{icon || i + 1}</span><h3>{t}</h3>{d && <p>{d}</p>}</div>
              ))}
            </div>
          </div>
        </section>
      ),
    ),
    Steps: block(
      { title: text('Title'), intro: area('Intro'), items: rows('Steps', ['Title', 'Text'], 20), tone: TONE },
      { title: 'How it works', intro: '', items: 'Tell us what you need | A short sentence\nWe get to work | A short sentence\nYou see the result | A short sentence', tone: 'plain' },
      (p) => (
        <section className={`band ${tone(p)}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap narrow">
            <Heading p={p} intro={p.intro} />
            <ol className="steps">{rowsOf(p.items).map(([t, d], i) => <li key={i}><h3>{t}</h3>{d && <p>{d}</p>}</li>)}</ol>
          </div>
        </section>
      ),
    ),
    Testimonials: block(
      { title: text('Title'), items: rows('Quotes (only real ones)', ['Quote', 'Name', 'Role or company'], 12), tone: TONE },
      { title: 'What customers say', items: '', tone: 'alt' },
      (p) => (
        <section className={`band ${tone(p, 'alt')}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap">
            <Heading p={p} />
            <div className="quotes">
              {rowsOf(p.items).map(([q, name, role], i) => (
                <blockquote key={i}><p>“{q}”</p>{(name || role) && <footer>{name && <b>{name}</b>} {role}</footer>}</blockquote>
              ))}
            </div>
          </div>
        </section>
      ),
    ),
    Stats: block(
      { title: text('Title'), items: rows('Numbers (only real ones)', ['Value, for example 120+', 'Label'], 8), tone: TONE },
      { title: '', items: '', tone: 'dark' },
      (p) => (
        <section className={`band ${tone(p, 'dark')}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap center">
            <Heading p={p} />
            <div className="stats">{rowsOf(p.items).map(([v, l], i) => <div className="stat" key={i}><b>{v}</b><span>{l}</span></div>)}</div>
          </div>
        </section>
      ),
    ),
    FAQ: block(
      { title: text('Title'), items: rows('Questions', ['Question', 'Answer'], 40), tone: TONE },
      { title: 'Questions', items: 'A common question? | The answer, in a sentence or two.', tone: 'plain' },
      (p) => (
        <section className={`band ${tone(p)}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap narrow">
            <Heading p={p} />
            {rowsOf(p.items).map(([q, ...a], i) => <details key={i} open={i === 0}><summary>{q}</summary><p>{a.join(' | ')}</p></details>)}
          </div>
        </section>
      ),
    ),
    Image: block(
      {
        image: image('Image'),
        imageAlt: text('Image description'),
        caption: text('Caption'),
        link: text('Click goes to (optional)'),
        width: choice('Width', [['Narrow', 'narrow'], ['Wide', 'wide'], ['Full width', 'full']]),
        tone: TONE,
      },
      { image: '', imageAlt: '', caption: '', link: '', width: 'wide', tone: 'plain' },
      (p) => {
        const fig = okUrl(p.image) ? (
          <figure><img src={p.image} alt={p.imageAlt} />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>
        ) : (
          <Placeholder label="Add an image" />
        );
        return (
          <section className={`band tight ${tone(p)}`} data-space={space(p)} style={looks(p)}>
            {p.width === 'full' ? fig : <div className={`wrap ${p.width === 'narrow' ? 'narrow' : ''}`}>{fig}</div>}
          </section>
        );
      },
    ),
    Video: block(
      { url: text('Video address (YouTube, Vimeo or a video file)'), title: text('Title (optional)'), tone: TONE },
      { url: '', title: '', tone: 'plain' },
      (p) => (
        <section className={`band ${tone(p)}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap narrow">{p.title && <h2>{p.title}</h2>}<Placeholder label="Video" url={p.url} /></div>
        </section>
      ),
    ),
    Embed: block(
      { url: text('Address to embed (booking calendar, form, map…)'), title: text('Title (optional)'), height: text('Height in pixels'), tone: TONE },
      { url: '', title: '', height: '600', tone: 'plain' },
      (p) => (
        <section className={`band ${tone(p)}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap">{p.title && <h2>{p.title}</h2>}<Placeholder label="Embedded page" url={p.url} /></div>
        </section>
      ),
    ),
    Code: block(
      { html: area('Custom HTML (runs in a sandbox, apart from the rest of the page)'), title: text('Title (optional)'), height: text('Height in pixels'), tone: TONE },
      { html: '', title: '', height: '300', tone: 'plain' },
      (p) => (
        <section className={`band ${tone(p)}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap">
            {p.title && <h2>{p.title}</h2>}
            {p.html ? (
              <div className="media frame" style={{ ['--h' as string]: `${Number(p.height) || 300}px` } as React.CSSProperties}>
                <iframe title="Custom code" sandbox="allow-scripts allow-forms allow-popups" srcDoc={p.html} />
              </div>
            ) : (
              <Placeholder label="Custom code" />
            )}
          </div>
        </section>
      ),
    ),
    CallToAction: block(
      { title: text('Title'), text: area('Text'), buttonLabel: text('Button text'), buttonLink: text('Button goes to (#enquire = the form)'), tone: TONE },
      { title: 'Ready when you are', text: '', buttonLabel: 'Get in touch', buttonLink: '#enquire', tone: 'accent' },
      (p) => (
        <section className={`cta ${tone(p, 'accent')}`} data-space={space(p)} style={looks(p)}>
          <div className="wrap narrow">
            {p.title && <h2>{p.title}</h2>}
            {p.text && <p className="intro">{p.text}</p>}
            {p.buttonLabel && <span className="btn">{p.buttonLabel}</span>}
          </div>
        </section>
      ),
    ),
    Spacer: block(
      { height: text('Height in pixels'), tone: TONE },
      { height: '48', tone: 'plain' },
      (p) => <div className={tone(p)} style={{ height: Math.min(400, Math.max(8, Number(p.height) || 48)), ...looks(p) }} />,
    ),
    Enquiry: block(
      {
        title: text('Title'),
        intro: area('Intro'),
        button: text('Button text'),
        success: text('Message after sending'),
        showPhone: choice('Ask for a phone number', [['Yes', 'yes'], ['No', 'no']]),
        showMessage: choice('Ask for a message', [['Yes', 'yes'], ['No', 'no']]),
        tone: TONE,
      },
      { title: 'Tell us what you need', intro: '', button: 'Send', success: 'Thanks. We will reply shortly.', showPhone: 'yes', showMessage: 'yes', tone: 'alt' },
      (p) => {
        const field = (label: string, tall = false) => (
          <div style={{ background: '#fefdf8', border: '1px solid rgba(28,27,22,.25)', borderRadius: 10, padding: '11px 13px', color: '#57534a', minHeight: tall ? 72 : undefined }}>{label}</div>
        );
        return (
          <section className={`band ${tone(p, 'alt')}`} data-space={space(p)} style={looks(p)}>
            <div className="wrap narrow">
              <h2>{p.title}</h2>
              {p.intro && <p>{p.intro}</p>}
              <div style={{ display: 'grid', gap: 12 }}>
                {field('Your name')}
                {field('Email')}
                {p.showPhone !== 'no' && field('Phone or WhatsApp')}
                {p.showMessage !== 'no' && field('Message', true)}
                <span className="btn" style={{ justifySelf: 'start' }}>{p.button}</span>
              </div>
            </div>
          </section>
        );
      },
      // One lead form per page: it carries the form's script, so it cannot be duplicated.
      { permissions: { duplicate: false } },
    ),
  },
} as unknown as Config;

// ---- the editor ------------------------------------------------------------------------------------------------

export default function PageEditor({ token, onClose, onChanged }: { token: string; onClose: () => void; onChanged: (view: PortalView) => void }) {
  const [data, setData] = useState<PageData | null>(null);
  const [view, setView] = useState<PortalView | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState<PageProposal | null>(null);
  const [before, setBefore] = useState<PageData | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    portal('page', token)
      .then((next) => {
        setView(next);
        setData(next.page ?? null);
      })
      .catch((err) => setError(errorMessage(err)));
    supabase.auth.getSession().then(({ data: session }) => setSignedIn(!!session.session));
  }, [token]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlimited = !!view?.unlimited;
  const left = view ? (view.paid ? view.paidChangesLeft : view.freeChangesLeft) : 0;

  const upload = view && signedIn
    ? async (file: File) => {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Use a JPEG, PNG, WebP or GIF image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('That image is over 5 MB. Please use a smaller one.');
        const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
        const path = `${view.jobId}/${crypto.randomUUID()}.${ext}`;
        const { error: failed } = await supabase.storage.from('breadmaker-funnel-assets').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (failed) throw new Error(/bucket|not found/i.test(failed.message) ? 'Image uploads are not set up yet.' : failed.message);
        return supabase.storage.from('breadmaker-funnel-assets').getPublicUrl(path).data.publicUrl;
      }
    : null;

  const save = async (page: PageData) => {
    setError(null);
    setNotice(null);
    try {
      const next = await portal('page_save', token, { page });
      setView(next);
      onChanged(next);
      if (next.rebuildError) setError(`Saved, but the site did not rebuild: ${next.rebuildError}`);
      else if (next.rebuilding) setNotice('Published. Your site is rebuilding from this page; it can take a few minutes to show on the live site.');
      else if (next.deployed && !next.paid) setNotice('Saved. Your live preview updates when you approve and deploy.');
      else setNotice('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const ask = async () => {
    if (!data || message.trim().length < 5) return;
    setAsking(true);
    setError(null);
    setNotice(null);
    try {
      const next = await portal('page_chat', token, { message, page: data });
      setView(next);
      onChanged(next);
      setProposal(next.proposal ?? null);
      setMessage('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAsking(false);
    }
  };

  const apply = () => {
    if (!proposal || !data) return;
    setBefore(data);
    setData(proposal.page);
    setVersion((current) => current + 1);
    setProposal(null);
    setNotice('Applied. Publish to save it.');
  };

  const undo = () => {
    if (!before) return;
    setData(before);
    setVersion((current) => current + 1);
    setBefore(null);
    setNotice('Undone. Publish to save the page as it was.');
  };

  const reset = async () => {
    if (!window.confirm('Start the page again from your brief? Your edits to the page will be replaced.')) return;
    setError(null);
    try {
      const next = await portal('page_reset', token);
      setView(next);
      setBefore(data);
      setData(next.page ?? null);
      setVersion((current) => current + 1);
      setNotice('Started again from your brief. Publish to save it.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--pg-bg,#f4f1e8)]" role="dialog" aria-modal="true" aria-label="Edit your page">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pg-line-soft,#ddd)] bg-[var(--pg-card,#fff)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-editorial text-[20px] font-semibold">Edit your page</h2>
          {view && <Chip>{unlimited ? 'Unlimited chat' : `${left} ${left === 1 ? 'revision' : 'revisions'} left for chat`}</Chip>}
        </div>
        <div className="flex items-center gap-2">
          {view?.siteUrl && (
            <a href={view.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--pg-accent,#1D6A58)] underline underline-offset-4">
              View live site <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <Button variant="ghost" onClick={onClose}><X className="mr-1 h-4 w-4" aria-hidden="true" /> Close</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {!data ? (
            error ? <div className="p-6"><Notice tone="error">{error}</Notice></div> : <Loading label="Opening your page…" />
          ) : (
            <UploadContext.Provider value={upload}>
              <Puck
                key={version}
                config={config}
                data={data as unknown as Data}
                onChange={(next) => setData(next as unknown as PageData)}
                onPublish={(next) => void save(next as unknown as PageData)}
                headerTitle="Your funnel page"
                viewports={[
                  { width: 1280, height: 'auto', label: 'Desktop', icon: 'Monitor' },
                  { width: 820, height: 'auto', label: 'Tablet', icon: 'Tablet' },
                  { width: 390, height: 'auto', label: 'Phone', icon: 'Smartphone' },
                ]}
              />
            </UploadContext.Provider>
          )}
        </div>

        <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-[var(--pg-line-soft,#ddd)] bg-[var(--pg-card,#fff)] p-4 lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0">
          <div>
            <h3 className="font-editorial text-[18px] font-semibold">Ask for a change</h3>
            <p className="mt-1 text-[14px] leading-[1.5] text-[var(--pg-body,#57534a)]">
              Describe it in your own words: new sections, colours, wording, order. We show you what we would change before anything happens. {unlimited ? 'Chat is unlimited for you.' : 'Each request uses a revision; editing by hand is free.'}
            </p>
          </div>
          {!view ? null : unlimited || left > 0 ? (
            <>
              <TextArea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: make it darker with a gold accent, add a section on how it works, and a video under the headline." disabled={asking || !data} />
              <Button busy={asking} disabled={message.trim().length < 5 || !data} onClick={() => void ask()}>Show me the change</Button>
            </>
          ) : (
            <Notice tone="info">You have used the revisions for chat. You can still edit the page by hand.</Notice>
          )}

          {proposal && (
            <div className="rounded-[12px] border border-[var(--pg-accent,#1D6A58)]/40 bg-[var(--pg-alt,#eae4d4)]/50 p-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent,#1D6A58)]">Proposed change</p>
              <p className="mt-1.5 text-[14.5px] leading-[1.5]">{proposal.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={apply}><Check className="mr-1 h-4 w-4" aria-hidden="true" /> Apply to the page</Button>
                <Button variant="ghost" onClick={() => setProposal(null)}>Discard</Button>
              </div>
            </div>
          )}
          {before && !proposal && (
            <Button variant="ghost" onClick={undo}><Undo2 className="mr-1 h-4 w-4" aria-hidden="true" /> Undo the last change</Button>
          )}

          {error && data && <Notice tone="error">{error}</Notice>}
          {notice && <Notice tone="success">{notice}</Notice>}

          <div className="mt-auto grid gap-2">
            <Button variant="ghost" onClick={() => void reset()} disabled={!view}><RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" /> Start again from my brief</Button>
            <p className="text-[13px] leading-[1.5] text-[var(--pg-body,#57534a)]">Use Publish in the editor to save. The preview uses the live site's styles, so it should look the same.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
