import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";

export interface AuthPayload {
  uid: string;
  roles: string[];
}

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is missing");
  return s;
}

export function signJwt(payload: AuthPayload, opts?: SignOptions): string {
  const secret = getSecret();
  const options: SignOptions = {
    expiresIn: process.env.JWT_TTL ?? "2d",
    issuer: "resto-mvp",
    ...opts,
  };
  return jwt.sign(payload, secret, options);
}

export function verifyJwt<T extends object = JwtPayload>(token: string): T {
  return jwt.verify(token, getSecret()) as T;
}
