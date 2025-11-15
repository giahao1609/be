import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export const RoleEnumObject = {
  customer:"customer",
  admin:"admin",
  owner:"owner"
} as const;
export const RoleEnum = ['customer', 'admin', 'owner'] as const;
export type UserRole = (typeof RoleEnum)[number];

@Schema({ _id: false })
class Address {
  @Prop({ trim: true }) fullName?: string;
  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true }) street?: string;
  @Prop({ trim: true }) ward?: string;
  @Prop({ trim: true }) district?: string;
  @Prop({ trim: true }) city?: string;
  @Prop({ trim: true, default: 'VN' }) country?: string;
  @Prop({ trim: true }) postalCode?: string;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
  })
  locationType?: string;

  @Prop({ type: [Number], default: undefined }) 
  coordinates?: number[];

  @Prop({ trim: true }) note?: string;
  @Prop({ default: false }) isDefault?: boolean;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ trim: true, unique: true, sparse: true })
  username?: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({
    type: [String],
    enum: RoleEnum,
    default: ['customer'],
    validate: [(arr: string[]) => Array.isArray(arr) && arr.length > 0, 'User must have at least one role'],
  })
  roles: UserRole[];

  @Prop({ trim: true, index: true })
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  secondaryEmail?: string;

  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ type: [Object], default: [] })
  addresses: Address[];

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ default: false })
  phoneVerified: boolean;

  @Prop({ type: Number, default: null })
  resetExpires?: number | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'addresses.coordinates': '2dsphere' });
UserSchema.index({ roles: 1 });

UserSchema.path('phone').validate(function (v: string | undefined) {
  if (!v) return true;
  return /^[+0-9\s\-]{8,20}$/.test(v);
}, 'Invalid phone number format');
