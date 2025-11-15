import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Strategy, VerifyCallback, StrategyOptions } from 'passport-google-oauth20';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: 'http://localhost:3001/auth/google/redirect',
      scope: ['email', 'profile'],
    } as StrategyOptions);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    console.log(' Google profile:', JSON.stringify(profile, null, 2));

    const picture =
      profile._json?.picture ||               
      profile._json?.image?.url ||            
      profile.photos?.[0]?.value ||           
      null;

    const user = {
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || profile._json?.name || 'Người dùng',
      picture,
    };

    console.log(' user tạo token:', user);

    done(null, user);
  }
}
