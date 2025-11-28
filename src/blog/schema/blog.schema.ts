// src/blog/schema/blog.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from 'src/users/schema/user.schema';

export type BlogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type BlogDocument = HydratedDocument<BlogPost>;

@Schema({ timestamps: true })
export class BlogPost {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    index: true,
    required: true,
  })
  authorId!: Types.ObjectId;

  @Prop({ trim: true, required: true })
  title!: string;

  @Prop({ trim: true })
  subtitle?: string;

  @Prop({ trim: true, lowercase: true, unique: true, index: true })
  slug!: string;

  @Prop({ trim: true })
  excerpt?: string;

  // nội dung HTML (render từ editor)
  @Prop()
  contentHtml?: string;

  // optional: lưu JSON (editor state) để FE dùng lại
  @Prop({ type: MongooseSchema.Types.Mixed })
  contentJson?: any;

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ type: [String], default: [] })
  categories?: string[];

  // ảnh cover ở card
  @Prop({ trim: true })
  heroImageUrl?: string;

  // nhiều ảnh trong bài
  @Prop({ type: [String], default: [] })
  gallery?: string[];

  // thời gian đọc ước tính (phút)
  @Prop({ type: Number, default: 3 })
  readingMinutes?: number;

  // trạng thái bài
  @Prop({
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    default: 'DRAFT',
    index: true,
  })
  status!: BlogStatus;

  @Prop({ type: Date })
  publishedAt?: Date;

  // SEO
  @Prop({ type: String, default: '' })
  metaTitle?: string;

  @Prop({ type: String, default: '' })
  metaDescription?: string;

  @Prop({ type: [String], default: [] })
  keywords?: string[];

  // search nhanh
  @Prop({ type: [String], default: [] })
  searchTerms?: string[];

  // stats đơn giản
  @Prop({ type: Number, default: 0 })
  viewCount?: number;

  @Prop({ type: Number, default: 0 })
  likeCount?: number;

  @Prop({ type: Boolean, default: false })
  isFeatured?: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  extra?: Record<string, any>;
}

export const BlogSchema = SchemaFactory.createForClass(BlogPost);

// index text để search
BlogSchema.index({
  title: 'text',
  subtitle: 'text',
  excerpt: 'text',
  tags: 'text',
  categories: 'text',
  searchTerms: 'text',
});
