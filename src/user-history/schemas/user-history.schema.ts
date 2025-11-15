import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class UserHistory extends Document {
  @Prop({ required: true, index: true }) // thêm index giúp truy vấn nhanh hơn
  userId: string;

  @Prop({ required: true })
  role: "user" | "bot";

  @Prop({ required: true })
  text: string;
}

export const UserHistorySchema = SchemaFactory.createForClass(UserHistory);
