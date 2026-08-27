import DOMPurify from 'isomorphic-dompurify'

// Allowlist matches exactly what the Tiptap config in
// components/rich-text-editor.tsx can produce (StarterKit + underline,
// link, text-align, task list, table) — nothing more. Runs server-side on
// every write of findings.notes / text_records.body, since that HTML is
// persisted and later re-rendered (and eventually fed into DOCX export).
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'strong', 'em', 'u', 's', 'a', 'code',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'label', 'input',
      'blockquote', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'colspan', 'rowspan', 'style',
      'data-type', 'data-checked',
      'type', 'checked', 'disabled',
    ],
  })
}
