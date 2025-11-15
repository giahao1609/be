import {
  ArgumentMetadata,
  ForbiddenException,
  Injectable,
  PipeTransform,
  UnauthorizedException,
} from '@nestjs/common';
import { RoleEnumObject } from 'src/users/schema/user.schema';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtUserInstanceAdminPipe implements PipeTransform {
  constructor(
    private readonly usersService: UsersService,
  ) {}
  async transform(
    value: any,
    metadata: ArgumentMetadata,
  ) {


    const dataUser = await this.usersService.findById(value);

    if (!dataUser) {
      throw new UnauthorizedException("INVALID_SECURITY_PIN_TOKEN");
    }

    if (Array(dataUser.roles).includes([RoleEnumObject.customer])) {
      throw new ForbiddenException("ForbiddenException");
    }
    return dataUser;
  }
}
