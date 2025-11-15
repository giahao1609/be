// src/auth/roles/user.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
@Injectable()
export class UserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const roles = ctx.switchToHttp().getRequest<{ user?: { roles?: string[] } }>().user?.roles ?? [];
    // “user” bao gồm cả owner/admin
    return roles.includes('customer') || roles.includes('owner') || roles.includes('admin');
  }
}