// src/orders/schema/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Schema as MongooseSchema,
  Types,
} from 'mongoose';
import { Money, MoneySchema } from 'src/menu/schema/menu.schema';


export type OrderDocument = HydratedDocument<Order>;

export type OrderStatus =
  | 'PENDING'   // mới tạo, chưa gọi ZaloPay / hoặc đang chờ
  | 'CREATED'   // đã tạo order bên ZaloPay, chờ user thanh toán
  | 'PAID'      // thanh toán thành công
  | 'FAILED'    // thanh toán thất bại
  | 'CANCELLED' // user/owner cancel
  | 'REFUNDED'; // đã refund

export type PaymentMethod = 'ZALOPAY';

@Schema({ _id: false })
class OrderItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  menuItemId!: Types.ObjectId;

  @Prop({ trim: true, required: true })
  name!: string; // snapshot name

  // snapshot giá tại thời điểm đặt
  @Prop({ type: MoneySchema, required: true })
  unitPrice!: Money;

  @Prop({ type: Number, min: 1, required: true })
  quantity!: number;

  // nếu sau này anh cần variant/options thì thêm ở đây
  @Prop({ type: [String], default: [] })
  selectedOptions?: string[];

  @Prop({ type: MoneySchema, required: true })
  lineTotal!: Money; // unitPrice.amount * quantity
}
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true })
export class Order {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    index: true,
    required: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    index: true,
    required: true,
  })
  restaurantId!: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ type: MoneySchema, required: true })
  subtotal!: Money;

  @Prop({ type: MoneySchema, required: true })
  total!: Money;

  @Prop({ trim: true })
  note?: string;

  @Prop({
    type: String,
    enum: ['PENDING', 'CREATED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'],
    default: 'PENDING',
    index: true,
  })
  status!: OrderStatus;

  @Prop({
    type: String,
    enum: ['ZALOPAY'],
    default: 'ZALOPAY',
  })
  paymentMethod!: PaymentMethod;

  // lưu thông tin ZaloPay: app_trans_id, zp_trans_id, order_url...
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  paymentMetadata?: Record<string, any>;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, createdAt: -1 });
