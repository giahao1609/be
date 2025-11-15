export type JwtUser = {
  id: string;
  displayName: string;
  username?: string;
  email: string;
  roles: string[];
  phone?: string;
  secondaryEmail?: string;
  avatarUrl?: string;
  addresses?: any[];
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};