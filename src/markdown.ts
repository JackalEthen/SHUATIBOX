import DOMPurify from 'dompurify';
import { marked } from 'marked';

const TAGS = [
  'p', 'br', 'u', 'b', 'i', 'strong', 'em', 'span', 'sub', 'sup',
  'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'div',
];

const ATTRS = ['href', 'src', 'alt', 'width', 'height', 'style', 'align', 'class', 'colspan', 'rowspan'];

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(value: string): string {
  const html = marked.parse(value, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS });
}

export function renderRich(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS });
}

export function hasHtmlTag(value: string): boolean {
  return /<(p|br|u|b|i|strong|em|span|sub|sup|img|table|thead|tbody|tr|th|td|div)\b/i.test(value);
}
