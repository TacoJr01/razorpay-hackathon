/**
 * Real GSTIN format + checksum validation (15 characters):
 *   2-digit state code, 10-char PAN, 1-digit entity code, literal 'Z',
 *   1 check digit computed over the first 14 characters via the
 *   documented mod-36 algorithm GSTN itself uses.
 * Not just a regex - a below-floor-style "looks right" string still fails
 * the checksum, the same defense-in-depth spirit as bounds.ts re-fetching
 * real prices instead of trusting what a buyer (or a product listing) claims.
 */
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function computeCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const value = CHARS.indexOf(first14[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkCodeValue = (36 - (sum % 36)) % 36;
  return CHARS[checkCodeValue];
}

export function isValidGSTIN(value: string): { valid: boolean; reason: string } {
  const gstin = value.trim().toUpperCase();

  if (!FORMAT.test(gstin)) {
    return { valid: false, reason: `"${value}" is not a well-formed GSTIN (expected 15 characters: state code, PAN, entity code, 'Z', check digit).` };
  }

  const expected = computeCheckDigit(gstin.slice(0, 14));
  if (expected !== gstin[14]) {
    return { valid: false, reason: `"${value}" has an invalid GSTIN checksum - this looks like a fabricated or mistyped number.` };
  }

  return { valid: true, reason: `${gstin} is a well-formed, checksum-valid GSTIN.` };
}
