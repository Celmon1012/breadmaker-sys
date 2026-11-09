/** The funnel page as blocks: what the Puck editor in the Hub edits and the site template builds from. */
export type BlockType = 'Hero' | 'Section' | 'Features' | 'Steps' | 'FAQ' | 'CallToAction' | 'Enquiry';

export interface PageBlock {
  type: BlockType;
  props: Record<string, string> & { id: string };
}

export interface PageData {
  /** The page-wide look: accent colour, font and corner style, each a name from a short list. */
  root: { props: Record<string, string> };
  content: PageBlock[];
}

/** What the model proposed for a chat request: a summary of the change, and the whole updated page. Nothing is saved yet. */
export interface PageProposal {
  summary: string;
  page: PageData;
}
