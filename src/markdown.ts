import DOMPurify from 'dompurify';
import { marked } from 'marked';

const TAGS = [
  'p', 'br', 'u', 'b', 'i', 'strong', 'em', 'span', 'sub', 'sup',
  'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'div',
];

const ATTRS = ['href', 'src', 'alt', 'width', 'height', 'style', 'align', 'class', 'colspan', 'rowspan'];

// ponytail: 只允许安全协议，挡住 javascript:/data:text/html 等 XSS 载体
const ALLOWED_URI_REGEXP = /^(?:(?:https?|asset):|\/|#|mailto:|data:image\/)/i;

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(value: string): string {
  const html = marked.parse(value, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOWED_URI_REGEXP });
}

export function renderRich(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOWED_URI_REGEXP });
}

export function hasHtmlTag(value: string): boolean {
  return /<(p|br|u|b|i|strong|em|span|sub|sup|img|table|thead|tbody|tr|th|td|div)\b/i.test(value);
}
