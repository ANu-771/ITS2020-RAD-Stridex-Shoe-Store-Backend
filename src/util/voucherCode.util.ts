import crypto from 'crypto';

/**
 * Generates a cryptographically secure STRIDEX Digital Gift Voucher code.
 * Format: STRIDEX-XXXX-XXXX-XXXX (e.g. STRIDEX-7A4B-9F21-C83E)
 */
export function generateVoucherCode(): string {
  const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const segment3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `STRIDEX-${segment1}-${segment2}-${segment3}`;
}
