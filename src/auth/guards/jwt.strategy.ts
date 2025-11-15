// src/auth/strategies/jwt-full.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/users/schema/user.schema';

type JwtPayload = { sub: string; roles: string[] };

@Injectable()
export class JwtFullStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      secretOrKey: config.get<string>('jwt.secretKey') ?? process.env.JWT_SECRET!,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    });
    // console.log('[JwtFullStrategy] init');
  }

  async validate(payload: JwtPayload) {
    // console.log('[JwtFullStrategy.validate]', payload);
    const user = await this.userModel
      .findById(payload.sub)
      .select('_id displayName username email roles phone secondaryEmail avatarUrl addresses emailVerified phoneVerified isActive createdAt updatedAt')
      .lean();

    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');
    if (!user.isActive) throw new UnauthorizedException('USER_DISABLED');

    return {
      id: String(user._id),
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      roles: user.roles as string[],
      phone: user.phone,
      secondaryEmail: user.secondaryEmail,
      avatarUrl: user.avatarUrl,
      addresses: user.addresses,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      isActive: user.isActive,

    };
  }
}
