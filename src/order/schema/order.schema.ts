import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { MenuItem, Money, MoneySchema } from 'src/menu/schema/menu.schema';
import { User } from 'src/users/schema/user.schema';

export type PreOrderDocument = HydratedDocument<PreOrder>;

export type PreOrderStatus =
  | 'PENDING'          
  | 'AWAITING_PAYMENT'  
  | 'PAID'              
  | 'CONFIRMED'         
  | 'REJECTED'
  | 'CANCELLED';

@Schema({ _id: false })
export class PreOrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: MenuItem.name, required: true })
  menuItemId!: Types.ObjectId;

  @Prop({ trim: true })
  menuItemName?: string;

  @Prop({ type: MoneySchema, required: true })
  unitPrice!: Money;

  @Prop({ type: Number, min: 1, required: true })
  quantity!: number;

  @Prop({ type: MoneySchema, required: true })
  lineTotal!: Money;

  @Prop({ trim: true })
  note?: string;
}
export const PreOrderItemSchema = SchemaFactory.createForClass(PreOrderItem);

@Schema({ timestamps: true })
export class PreOrder {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, index: true, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true, required: true })
  restaurantId!: Types.ObjectId;

  @Prop({ type: [PreOrderItemSchema], default: [] })
  items!: PreOrderItem[];

  @Prop({ type: MoneySchema, required: true })
  totalAmount!: Money;

  @Prop({ type: Number, min: 0, max: 100 })
  depositPercent?: number; // VD: 30 = 30% tổng tiền

  // Số tiền cọc/Thanh toán yêu cầu (đã tính theo phần trăm tại thời điểm owner quyết định)
  @Prop({ type: MoneySchema })
  requiredDepositAmount?: Money;

  @Prop({ type: Number, min: 1, required: true })
  guestCount!: number;

  @Prop({ type: Date, required: true })
  arrivalTime!: Date;

  @Prop({ trim: true, required: true })
  contactName!: string;

  @Prop({ trim: true, required: true })
  contactPhone!: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({
    type: String,
    enum: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'CONFIRMED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  })
  status!: PreOrderStatus;

  @Prop({ type: Date })
  paymentEmailSentAt?: Date;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ trim: true })
  paymentReference?: string;

  @Prop({ trim: true })
  ownerNote?: string;
}

export const PreOrderSchema = SchemaFactory.createForClass(PreOrder);

PreOrderSchema.index({ restaurantId: 1, arrivalTime: 1 });
PreOrderSchema.index({ userId: 1, createdAt: -1 });
