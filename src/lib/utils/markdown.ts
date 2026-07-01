/**
 * Single newlines in Markdown are normally collapsed. Convert an isolated newline
 * into a hard break (two trailing spaces) so one Enter in a Canari bio renders as
 * one line break, while double newlines keep their paragraph meaning. Mirrors
 * Canari's bio rendering so a bio reads the same on Sky.
 */
export function normalizeBioLineBreaks(md: string): string {
  const normalized = md.replace(/\r\n/g, "\n");
  return normalized.replace(/(?<!\n)\n(?!\n)/g, "  \n");
}
