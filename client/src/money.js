// Amounts travel as whole paise in decimal strings. These convert to and from rupees with string and BigInt
// arithmetic only, so no amount ever passes through a floating-point number.
const RUPEES = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

export function toPaise(input) {
  const match = RUPEES.exec(input.trim());
  if (!match) return null;
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return paise > 0n ? paise.toString() : null;
}

export function formatPaise(paise) {
  const value = BigInt(paise);
  const rupees = value / 100n;
  const rest = (value % 100n).toString().padStart(2, '0');
  return `₹${rupees.toLocaleString('en-IN')}.${rest}`;
}
