export function guestOwner(device: string): string {
  return `g:${device}`;
}

export function accountOwner(userId: string): string {
  return `u:${userId}`;
}

export function isAccountOwner(owner: string): boolean {
  return owner.startsWith('u:');
}
