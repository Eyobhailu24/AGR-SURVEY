import sanitize from 'sanitize-html'

// Deliberately a DOM-free sanitizer. The previous implementation used
// isomorphic-dompurify, which pulls in jsdom; jsdom reads data files from its
// own package directory at import time, and those files don't survive Next's
// production bundling/tracing — so importing this module threw on Vercel and
// took down every route that imports it (findings GET/POST/PATCH,
// text-records, CSV import) with an empty 500, while dev worked fine.
// `sanitize-html` parses with htmlparser2 instead: pure JS, no DOM, no data
// files to trace, so there is nothing left to bundle wrong.
//
// Allowlist matches exactly what the Tiptap config in
// components/rich-text-editor.tsx can produce (StarterKit + underline,
// link, text-align, task list, table) — nothing more. Runs server-side on
// every write of findings.notes / text_records.body, since that HTML is
// persisted and later re-rendered (and eventually fed into DOCX export).
export function sanitizeRichText(html: string): string {
  return sanitize(html, {
    allowedTags: [
      'p', 'br', 'hr',
      'strong', 'em', 'u', 's', 'a', 'code',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'label', 'input',
      'blockquote', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span',
    ],
    // Scoped per tag rather than one global list: same attributes the editor
    // emits, but e.g. `href` can't ride in on a <span>.
    allowedAttributes: {
      '*': ['style', 'data-type', 'data-checked'],
      a: ['href', 'target', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      input: ['type', 'checked', 'disabled'],
    },
    // TextAlign is the only extension configured to emit inline CSS, so that
    // is the only property allowed through — an open `style` attribute is a
    // UI-redressing vector even with no script in it.
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center|justify)$/] },
    },
    // No javascript:/data: URLs in links.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  })
}
