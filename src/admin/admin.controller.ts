import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  // UseGuards,
} from '@nestjs/common';
// import { Roles } from 'src/auth/guards/roles.decorator';
import { UsersService } from 'src/users/users.service';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { CurrentUserAdmin } from 'src/decorators/current-user-admin.decorator';

type AuthUser = { sub?: string; id?: string; roles?: string[] };

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

@Controller('admin/users')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('email/:email/roles')
  // @Roles('admin')
  async updateRolesByEmail(
    @Param('email') emailParam: string,
    @Body() body: UpdateRolesDto,
    @Req() req: { user?: AuthUser },
    @CurrentUserAdmin() currentUser: any,
  ) {
    if (!emailParam) throw new BadRequestException('Missing email');
    const email = normalizeEmail(emailParam);
    if (!isEmail(email)) throw new BadRequestException('Invalid email');

    const requesterId: string | undefined = req.user?.sub ?? req.user?.id;

    return this.usersService.updateRolesByEmail(email, body.roles, requesterId);
  }

  @Post('email/:email/promote-to-owner')
  // @Roles('admin')
  async promoteToOwnerByEmail(
    @Param('email') emailParam: string,
    @Req() req: { user?: AuthUser },
    @CurrentUserAdmin() currentUser: any,
  ) {
    if (!emailParam) throw new BadRequestException('Missing email');
    const email = normalizeEmail(emailParam);
    if (!isEmail(email)) throw new BadRequestException('Invalid email');

    const requesterId: string | undefined = req.user?.sub ?? req.user?.id;
    return this.usersService.promoteToOwnerByEmail(email, requesterId);
  }
}
