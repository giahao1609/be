// src/auth/roles/role.utils.ts
export type Role = 'customer' | 'owner' | 'admin';

export function hasRole(roles: string[] | undefined, role: Role): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.includes(role);
}
export const isAdmin  = (roles?: string[]) => hasRole(roles, 'admin');
export const isOwner  = (roles?: string[]) => hasRole(roles, 'owner');
export const isUser   = (roles?: string[]) => hasRole(roles, 'customer') || isOwner(roles) || isAdmin(roles);
