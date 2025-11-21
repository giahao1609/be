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