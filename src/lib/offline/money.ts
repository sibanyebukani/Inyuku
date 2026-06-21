/** Format integer ZAR cents as a display string, e.g. 1250 -> "R 12.50". */
export function centsToZAR(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const rands = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  const grouped = rands.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}R ${grouped}.${remainder}`;
}

/** Parse a user-entered ZAR string to integer cents. Throws RangeError on invalid input. */
export function zarToCents(input: string): number {
  const cleaned = input.replace(/[R\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new RangeError(`Invalid ZAR amount: "${input}"`);
  }
  const [rands, frac = ''] = cleaned.split('.');
  const cents = Number(rands) * 100 + Number(frac.padEnd(2, '0'));
  return cents;
}
