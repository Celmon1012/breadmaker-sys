const STYLE_ID = 'hide-evo-chat-widget';

/**
 * Hides the Evo CRM chat widget (loaded for every page from index.html) and returns a function
 * that brings it back. Used on pages that already carry their own assistant, so two chat
 * buttons never sit on top of each other.
 */
export function hideChatWidget(): () => void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '#evo-widget-holder, #evo-widget-bubble, #evo-widget-badge { display: none !important; }';
    document.head.appendChild(style);
  }
  return () => document.getElementById(STYLE_ID)?.remove();
}
