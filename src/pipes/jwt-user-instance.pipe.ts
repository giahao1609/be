import {
  ArgumentMetadata,
  ForbiddenException,
  Injectable,
  PipeTransform,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtUserInstancePipe implements PipeTransform {
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

    // if (Number(dataUser.role) === UserRoleConstant.BAN) {
    //   throw new ForbiddenException(ERROR.USER_BANNED);
    // }
    return dataUser;
  }
}
