// src/auth/roles/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import type { Role } from './role.utils';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
