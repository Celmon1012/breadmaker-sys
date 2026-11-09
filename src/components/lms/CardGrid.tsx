import React, { useState } from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { CARD } from './lms-ui';

/**
 * One way to show a set of things the member can pick from (integrations, agent templates): a grid of
 * cards, or a compact list. The choice is remembered on this device and shared by every page that uses it.
 */

export type View = 'cards' | 'list';
const VIEW_KEY = 'bm-item-view';

export function useView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
    } catch {
      return 'cards';
    }
  });
  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice just resets next visit */
    }
  };
  return [view, choose];
}

const SEGMENT = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors cursor-pointer';

/** A small pill-shaped switch between a few options, such as All / Connected or Cards / List. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[11px] bg-[var(--pg-alt)] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`${SEGMENT} ${value === option.value ? 'bg-[var(--pg-card)] text-[var(--pg-ink)]' : 'text-[var(--pg-body)] hover:text-[var(--pg-ink)]'}`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <Segmented
      label="Layout"
      value={view}
      onChange={onChange}
      options={[
        { value: 'cards', label: 'Cards', icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" /> },
        { value: 'list', label: 'List', icon: <Rows3 className="h-4 w-4" aria-hidden="true" /> },
      ]}
    />
  );
}

/** The container: a responsive grid for cards, a divided stack for the list. */
export function ItemGrid({ view, children, label }: { view: View; children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className={view === 'cards' ? 'grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3' : `${CARD} divide-y divide-[var(--pg-line-soft)] overflow-hidden`}>
      {children}
    </ul>
  );
}

/** An official brand mark (from the simple-icons set), in the brand's own colour on a light tint of it. */
export function brandTile(icon: { path: string; hex: string; title: string }): { icon: React.ReactNode; tileStyle: React.CSSProperties } {
  return {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" role="img" aria-label={icon.title} fill={`#${icon.hex}`}>
        <path d={icon.path} />
      </svg>
    ),
    tileStyle: { backgroundColor: `#${icon.hex}1A` },
  };
}

export function ItemCard({
  view,
  icon,
  tileStyle,
  title,
  body,
  meta,
  status,
  action,
}: {
  view: View;
  icon: React.ReactNode;
  /** overrides the default tint behind the icon, for brand marks */
  tileStyle?: React.CSSProperties;
  title: string;
  body: string;
  /** a small line under the text, such as "4 steps" */
  meta?: string;
  /** a chip or label on the right of the title */
  status?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const tile = (
    <span style={tileStyle} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[var(--pg-accent)] transition-transform duration-200 motion-safe:group-hover:scale-105 ${tileStyle ? '' : 'bg-[var(--pg-alt)]'}`}>
      {icon}
    </span>
  );

  if (view === 'list') {
    return (
      <li className="group flex flex-wrap items-center gap-x-4 gap-y-3 p-4 transition-colors duration-200 hover:bg-[var(--pg-alt)]/50">
        {tile}
        <div className="min-w-0 flex-1 basis-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-tight">{title}</p>
            {status}
          </div>
          <p className="mt-1 text-[14px] leading-[1.5] text-[var(--pg-body)]">{body}</p>
          {meta && <p className="mt-1 text-[12.5px] text-[var(--pg-body)]">{meta}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </li>
    );
  }

  return (
    <li className={`${CARD} group flex flex-col p-4 transition-[transform,border-color] duration-200 hover:border-[var(--pg-accent)] motion-safe:hover:-translate-y-0.5 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        {tile}
        {status}
      </div>
      <p className="mt-4 text-[16px] font-semibold leading-tight">{title}</p>
      <p className="mt-1.5 flex-1 text-[14px] leading-[1.55] text-[var(--pg-body)]">{body}</p>
      {meta && <p className="mt-3 text-[12.5px] text-[var(--pg-body)]">{meta}</p>}
      {action && <div className="mt-4">{action}</div>}
    </li>
  );
}
