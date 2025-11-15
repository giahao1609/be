// src/auth/roles/owner.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { roles?: string[] } }>();
    return Array.isArray(req.user?.roles) && req.user!.roles.includes('owner');
  }
}