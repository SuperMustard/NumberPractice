// display → tts derivation (DESIGN.md §4). Keep every rule here so it can be tuned per voice.

export function deriveTts(display: string): string {
  return (
    display
      // Some French voices misread hyphenated numbers (dix-sept, quatre-vingts).
      .replace(/-/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim()
  );
}
