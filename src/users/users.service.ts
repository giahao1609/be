import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RoleEnum, User, UserRole } from './schema/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(data: Partial<User>) {
    const user = new this.userModel(data);
    return user.save();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async update(id: string, data: Partial<User>) {
    return this.userModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }


  async setResetCode(email: string, code: string, expires: number) {
    return this.userModel.updateOne(
      { email },
      { resetCode: code, resetExpires: expires },
    );
  }

  async clearResetCode(email: string) {
    return this.userModel.updateOne(
      { email },
      { resetCode: null, resetExpires: null },
    );
  }


   async updateRolesByEmail(email: string, roles: UserRole[], requesterId?: string) {
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new BadRequestException('roles must be a non-empty array');
    }
    const uniqueRoles = Array.from(new Set(roles));
    const invalid = uniqueRoles.filter((r) => !RoleEnum.includes(r as UserRole));
    if (invalid.length) {
      throw new BadRequestException(`Invalid roles: ${invalid.join(', ')}`);
    }

    const updated = await this.userModel.findOneAndUpdate(
      { email }, 
      {
        $set: {
          roles: uniqueRoles,
          ...(requesterId ? { updatedBy: requesterId } : {}),
          updatedAt: new Date(),
        },
      },
      { new: true, lean: true },
    );

    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async promoteToOwnerByEmail(email: string, requesterId?: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new NotFoundException('User not found');

    if (Array.isArray(user.roles) && user.roles.includes('owner')) {
      if (requesterId) (user as any).updatedBy = requesterId;
      await user.save();
      return user.toObject();
    }

    user.roles = ['owner'];
    if (requesterId) (user as any).updatedBy = requesterId;
    user.set('updatedAt', new Date());
    await user.save();

    return user.toObject();
  }
}
