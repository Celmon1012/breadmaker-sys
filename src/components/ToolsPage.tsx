import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Route } from '../types';
import { STACK_TOOLS, StackTool } from '../lib/tools';
import LeadCapture from './LeadCapture';
import { BREADMAKER_THEME, LeakTestBand, H1, H2, Label, Pill, Section, TextLink, themeStyle } from './program-ui';

interface ToolsPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

function ToolCard({ tool }: { tool: StackTool; key?: React.Key }) {
  return (
    <div className="flex h-full flex-col rounded-[17px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-9">
      <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
        {tool.category}
      </p>
      <h3 className="mt-3 font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        {tool.name}
      </h3>
      <p className="mt-3.5 text-[16px] leading-[1.6] text-[var(--pg-body)]">{tool.body}</p>
      <div className="mt-auto pt-7">
        <a
          href={`https://${tool.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-label text-[13px] font-medium text-[var(--pg-ink)] underline underline-offset-[6px] transition-opacity hover:opacity-70"
        >
          {tool.domain}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

export default function ToolsPage({ onNavigate, openPath }: ToolsPageProps) {
  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <section>
        <div className="mx-auto max-w-[1312px] px-6 pb-12 pt-12 lg:pb-16 lg:pt-16">
          <Label>Toolstack</Label>
          <H1 className="mt-5 max-w-none lg:whitespace-nowrap">The tools I build with.</H1>
          <p className="mt-6 max-w-[720px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[22px]">
            Everything we use to build and run Breadmaker, and what we teach in Launchpad and Foundry. We list a
            tool only if we use it ourselves. Links go straight to each tool’s own site.
          </p>
        </div>
      </section>

      <Section pad="bottom">
        <div className="grid gap-[30px] md:grid-cols-2 lg:grid-cols-3">
          {STACK_TOOLS.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      </Section>

      <Section tone="alt" pad="default">
        <div className="mx-auto max-w-[820px] text-center">
          <Label className="text-center">Why this stack</Label>
          <H2 className="mt-7">You own it, so you can leave it.</H2>
          <p className="mt-6 text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[20px]">
            Your code is in your GitHub, your data is in your database and your server is yours. Each tool does one
            job and can be swapped out. Costs change, so check each tool’s own pricing before you commit.
          </p>
          <div className="mt-8 flex justify-center">
            <TextLink onClick={() => openPath('/guides/own-the-systems-your-business-runs-on')}>
              Read: Own the systems your business runs on
            </TextLink>
          </div>
        </div>
      </Section>

      <LeadCapture source="tools" />

      <LeakTestBand onNavigate={onNavigate} />
    </div>
  );
}
