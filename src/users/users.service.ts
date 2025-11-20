import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { RoleEnum, User, UserDocument, UserRole } from './schema/user.schema';
import { QueryUsersDto } from './dto/query-users.dto';

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



    async findMany(q: QueryUsersDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<UserDocument> = {};

    // lọc theo role
    if (q.role) {
      filter.roles = q.role;
    }

    // lọc theo isActive
    if (q.isActive === 'true') filter.isActive = true;
    if (q.isActive === 'false') filter.isActive = false;

    // tìm kiếm full-text đơn giản
    if (q.q && q.q.trim()) {
      const regex = new RegExp(q.q.trim(), 'i');
      filter.$or = [
        { displayName: regex },
        { email: regex },
        { phone: regex },
        { username: regex },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('-passwordHash -resetExpires') 
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    };
  }
}
