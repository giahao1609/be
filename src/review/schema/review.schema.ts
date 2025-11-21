import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Restaurant } from '../../restaurants/schema/restaurant.schema';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ required: true })
  userId!: string; // có thể là userId từ auth (string)

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Restaurant.name,
    required: true,
    index: true,
  })
  restaurantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content!: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  rating!: number;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
