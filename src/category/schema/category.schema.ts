import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  restaurantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, lowercase: true })
  slug!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: String, trim: true })
  image?: string;

  // Cây phân cấp
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null, index: true })
  parentId?: Types.ObjectId | null;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [], index: true })
  ancestors?: Types.ObjectId[];

  @Prop({ type: Number, default: 0, index: true })
  depth?: number;

  @Prop({ type: String, trim: true, default: '' })
  path?: string; // ví dụ: "root/appetizers/hot"

  // Hiển thị & sắp xếp
  @Prop({ type: Boolean, default: true, index: true })
  isActive?: boolean;

  @Prop({ type: Number, default: 0 })
  sortIndex?: number;

  // số item thuộc category (tuỳ bạn có cập nhật hay không)
  @Prop({ type: Number, default: 0 })
  itemsCount?: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  extra?: Record<string, any>;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// ===== Indexes =====
CategorySchema.index(
  { restaurantId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);
CategorySchema.index({ restaurantId: 1, parentId: 1, sortIndex: 1 });
CategorySchema.index({ name: 'text', description: 'text' });
