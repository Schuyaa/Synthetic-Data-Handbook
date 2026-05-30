import DOMPurify from "dompurify";

/**
 * Sanitizes HTML snippet, allowing only safe highlight tags.
 * Used for search results where ts_headline returns <mark>.
 */
export function sanitizeSnippet(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["mark", "b", "i", "em", "strong"],
    ALLOWED_ATTR: [],
  });
}
