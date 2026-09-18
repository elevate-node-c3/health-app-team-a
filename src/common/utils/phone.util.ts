export function normalizePhone(phone: string): string {
  if (!phone) return phone;
  // Remove spaces or dashes if any
  let normalized = phone.replace(/[\s-]/g, '');
  // Convert local format 01... to international +201...
  if (normalized.startsWith('01') && normalized.length === 11) {
    normalized = '+20' + normalized.substring(1);
  }
  // If it starts with 201... without the plus
  if (normalized.startsWith('201') && normalized.length === 12) {
    normalized = '+' + normalized;
  }
  return normalized;
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 5) return phone;
  const start = phone.substring(0, 3); // e.g. +20
  const end = phone.substring(phone.length - 2); // e.g. 67
  const maskLength = phone.length - start.length - end.length;
  return `${start}${'*'.repeat(Math.max(maskLength, 0))}${end}`;
}
