export function guestOwner(device: string): string {
  return `g:${device}`;
}

export function accountOwner(userId: string): string {
  return `u:${userId}`;
}

export function isAccountOwner(owner: string): boolean {
  return owner.startsWith('u:');
}

/**
 * The authenticated user ID behind an account owner key. Capabilities resolve
 * patient identity through this rather than through a model-supplied argument.
 */
export function accountUserId(owner: string): string {
  if (!isAccountOwner(owner)) throw new Error('Not an account owner');
  return owner.slice(2);
}
