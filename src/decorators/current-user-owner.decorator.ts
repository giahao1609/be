import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtUserInstancePipe } from '../pipes/jwt-user-instance.pipe';
import { Request } from 'express';

import * as JwtDecode from 'jwt-decode';

//const jwtDecode = require('jwt-decode');

const JwtUser = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers['authorization'];
    if (!authorization || !authorization?.startsWith('Bearer')) {
      throw new UnauthorizedException("INVALID_SECURITY_PIN_TOKEN");
    }

    const decodedJWTToken = JwtDecode.jwtDecode(authorization) as any;
    if (!decodedJWTToken) {
      throw new UnauthorizedException("INVALID_SECURITY_PIN_TOKEN");
    }
    console.log("decodedJWTToken",decodedJWTToken)
    return decodedJWTToken.id;
  },
);

export const CurrentUserOwner = (additionalOptions?: any) =>
  JwtUser(additionalOptions, JwtUserInstancePipe);
