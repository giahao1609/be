import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Review extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  restaurantId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  images: string[]; // ✅ danh sách ảnh review

  @Prop({ default: 0 })
  rating: number;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
