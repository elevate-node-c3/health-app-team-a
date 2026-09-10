export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeEgyptianPhone(phone: string): string {
  const digits = phone.replace(/[\s()-]/g, '').replace(/^00/, '+');

  if (digits.startsWith('+20')) return `0${digits.slice(3)}`;
  if (digits.startsWith('20')) return `0${digits.slice(2)}`;

  return digits;
}

export function isEgyptianMobile(phone: string): boolean {
  return /^(010|011|012|015)\d{8}$/.test(normalizeEgyptianPhone(phone));
}

export function maskEmail(email: string): string {
  const [localPart, domain] = normalizeEmail(email).split('@');
  const visible = localPart.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(2, localPart.length - 1))}@${domain}`;
}
