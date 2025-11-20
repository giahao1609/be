import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  })
  name!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 500,
  })
  description?: string;

  @Prop({
    type: String,
    trim: true,
  })
  image?: string;

  // ====== TREE ======
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true,
  })
  parentId?: Types.ObjectId | null;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: 'Category',
    default: [],
  })
  ancestors?: Types.ObjectId[];

  @Prop({
    type: Number,
    default: 0,
  })
  depth?: number;

  @Prop({
    type: String,
    trim: true,
    index: true,
  })
  path?: string;

  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isActive!: boolean;

  @Prop({
    type: Number,
    default: 0,
    index: true,
  })
  sortIndex!: number;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: {},
  })
  extra?: Record<string, any>;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Nếu có search text
CategorySchema.index({ name: 'text', description: 'text' });
