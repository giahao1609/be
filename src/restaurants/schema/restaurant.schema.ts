// src/schemas/restaurant.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type RestaurantDocument = HydratedDocument<Restaurant>;

@Schema({ _id: false })
class Address {
  @Prop({ trim: true }) street?: string;
  @Prop({ trim: true }) ward?: string;
  @Prop({ trim: true }) district?: string;
  @Prop({ trim: true }) city?: string;
  @Prop({ trim: true, default: 'VN' }) country?: string;
  @Prop({ trim: true }) postalCode?: string;

  // để là string cho đơn giản
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  locationType?: string;

  @Prop({ type: [Number], default: undefined })
  coordinates?: number[];

  @Prop({ trim: true }) formatted?: string;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ _id: false })
class OpeningPeriod {
  @Prop({ required: true }) opens!: string;
  @Prop({ required: true }) closes!: string;
}
export const OpeningPeriodSchema = SchemaFactory.createForClass(OpeningPeriod);

@Schema({ _id: false })
class OpeningDay {
  @Prop({ required: false }) day?: string;
  @Prop({ type: [OpeningPeriodSchema], default: [] }) periods!: OpeningPeriod[];
  @Prop({ type: Boolean, default: false }) closed!: boolean;
  @Prop({ type: Boolean, default: false }) is24h!: boolean;
}
export const OpeningDaySchema = SchemaFactory.createForClass(OpeningDay);

@Schema({ _id: false })
class GeoPoint {
  @Prop({ type: String, default: 'Point' }) type?: string;
  @Prop({ type: [Number] }) coordinates?: number[];
}
export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

//
// ====================== PAYMENT SCHEMAS ======================
//

@Schema({ _id: false })
class PaymentQr {
  @Prop({ trim: true })
  imageUrl?: string;          // link ảnh QR

  @Prop({ trim: true })
  rawContent?: string;        // mã QR raw (nếu có)

  @Prop({ trim: true })
  description?: string;       // text mô tả
}
export const PaymentQrSchema = SchemaFactory.createForClass(PaymentQr);

@Schema({ _id: false })
class BankTransferInfo {
  @Prop({ trim: true }) bankCode?: string;      // ví dụ: "VCB"
  @Prop({ trim: true }) bankName?: string;      // "Vietcombank"
  @Prop({ trim: true }) accountName?: string;   // Tên chủ TK
  @Prop({ trim: true }) accountNumber?: string; // Số TK
  @Prop({ trim: true }) branch?: string;        // Chi nhánh (optional)

  @Prop({ type: PaymentQrSchema, default: {} })
  qr?: PaymentQr;                               // QR chuyển khoản

  @Prop({ trim: true })
  note?: string;                                // ghi chú thêm
}
export const BankTransferInfoSchema = SchemaFactory.createForClass(BankTransferInfo);

@Schema({ _id: false })
class EWalletInfo {
  @Prop({ type: String, enum: ['MOMO', 'ZALOPAY', 'VIETTELPAY', 'VNPAY', 'OTHER'], default: 'MOMO' })
  provider?: 'MOMO' | 'ZALOPAY' | 'VIETTELPAY' | 'VNPAY' | 'OTHER';

  @Prop({ trim: true })
  displayName?: string;       // tên hiển thị

  @Prop({ trim: true })
  phoneNumber?: string;       // số ĐT ví (Momo…)

  @Prop({ trim: true })
  accountId?: string;         // nếu có ID tài khoản riêng

  @Prop({ type: PaymentQrSchema, default: {} })
  qr?: PaymentQr;             // QR thanh toán ví

  @Prop({ trim: true })
  note?: string;
}
export const EWalletInfoSchema = SchemaFactory.createForClass(EWalletInfo);

@Schema({ _id: false })
class PaymentConfig {
  @Prop({ type: Boolean, default: true })
  allowCash?: boolean;        // cho phép thanh toán tiền mặt tại quán

  @Prop({ type: Boolean, default: true })
  allowBankTransfer?: boolean;

  @Prop({ type: Boolean, default: true })
  allowEWallet?: boolean;

  @Prop({ type: [BankTransferInfoSchema], default: [] })
  bankTransfers?: BankTransferInfo[];

  @Prop({ type: [EWalletInfoSchema], default: [] })
  eWallets?: EWalletInfo[];

  @Prop({ trim: true })
  generalNote?: string;       // ghi chú chung về thanh toán
}
export const PaymentConfigSchema = SchemaFactory.createForClass(PaymentConfig);

//
// ====================== RESTAURANT ======================
//

@Schema({ timestamps: true })
export class Restaurant {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    index: true,
    required: true,
  })
  ownerId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  categoryId?: Types.ObjectId;

  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ trim: true, index: true }) shortName?: string;
  @Prop({ trim: true, lowercase: true, index: true }) slug?: string;

  @Prop({ trim: true, index: true }) registrationNumber?: string;
  @Prop({ trim: true, index: true }) taxCode?: string;

  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true }) website?: string;
  @Prop({ trim: true }) email?: string;

  @Prop({ trim: true }) logoUrl?: string;
  @Prop({ trim: true }) coverImageUrl?: string;
  @Prop({ type: [String], default: [] }) gallery?: string[];

  @Prop({ type: AddressSchema, default: {} }) address?: Address;

  @Prop({
    type: GeoPointSchema,
    default: { type: 'Point', coordinates: undefined },
  })
  location?: GeoPoint;

  @Prop({ type: [String], default: [] }) cuisine?: string[];
  @Prop({ type: String, default: '' }) priceRange?: string;
  @Prop({ type: Number, default: null }) rating?: number;
  @Prop({ type: [String], default: [] }) amenities?: string[];

  @Prop({ type: [OpeningDaySchema], default: [] }) openingHours?: OpeningDay[];

  @Prop({ type: String, default: '' }) metaTitle?: string;
  @Prop({ type: String, default: '' }) metaDescription?: string;
  @Prop({ type: [String], default: [] }) keywords?: string[];
  @Prop({ type: [String], default: [] }) tags?: string[];
  @Prop({ type: [String], default: [] }) searchTerms?: string[];

  // 🔥 CẤU HÌNH THANH TOÁN (QR + thông tin bank / ví)
  @Prop({ type: PaymentConfigSchema, default: {} })
  paymentConfig?: PaymentConfig;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  extra?: Record<string, any>;

  @Prop({ default: true }) isActive?: boolean;
}

export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);

RestaurantSchema.index({ location: '2dsphere' });

RestaurantSchema.index({
  name: 'text',
  'address.formatted': 'text',
  tags: 'text',
  cuisine: 'text',
  searchTerms: 'text',
});
