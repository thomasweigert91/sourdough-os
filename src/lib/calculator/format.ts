// Zahleneingabe und -anzeige des Rechners (F010): Komma und Punkt als Dezimaltrenner,
// Anzeige im deutschen Format ohne Tausendertrennzeichen.

const DECIMAL_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** "" (nach trim) → null; "2,5" und "2.5" → 2.5; "-5" → -5; "2," → 2; sonst NaN. Kein Tausendertrenner. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!DECIMAL_PATTERN.test(trimmed)) return Number.NaN;
  return Number(trimmed.replace(",", "."));
}

const INCOMPLETE_DECIMAL_PATTERN = /^[+-]?[.,]?$/;

/** Angefangene Eingabe ohne Ziffer ("-", "+", ",", ".", "-,"): beim Tippen noch kein Fehler. "" zählt nicht dazu. */
export function isIncompleteDecimal(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== "" && INCOMPLETE_DECIMAL_PATTERN.test(trimmed);
}

const formatters = new Map<number, Intl.NumberFormat>();

function formatter(fractionDigits: number): Intl.NumberFormat {
  let cached = formatters.get(fractionDigits);
  if (!cached) {
    cached = new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    });
    formatters.set(fractionDigits, cached);
  }
  return cached;
}

/** de-DE, feste Nachkommastellen, ohne Gruppierung; -0 → "0"; NaN/Infinity → "". */
export function formatDecimal(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return "";
  const text = formatter(fractionDigits).format(value);
  // Werte, die auf 0 gerundet werden (z. B. -0,04 bei einer Stelle), ohne Minuszeichen anzeigen.
  return /^[-−]0(,0+)?$/.test(text) ? text.slice(1) : text;
}
