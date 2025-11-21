import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class Money {
  @Prop({ type: String, uppercase: true, trim: true, default: 'VND' })
  currency?: string;

  @Prop({ type: Number, min: 0, default: 0 })
  amount!: number; 
}
export const MoneySchema = SchemaFactory.createForClass(Money);

@Schema({ _id: false })
class MenuVariant {
  @Prop({ trim: true }) code?: string;   
  @Prop({ trim: true }) label?: string; 
  @Prop({ type: MoneySchema, required: true }) price!: Money;
  @Prop({ type: MoneySchema }) compareAtPrice?: Money; 
  @Prop({ trim: true }) sku?: string;
  @Prop({ type: Boolean, default: true }) isAvailable?: boolean;
  @Prop({ type: Number, default: 0 }) sortIndex?: number;
}
export const MenuVariantSchema = SchemaFactory.createForClass(MenuVariant);

@Schema({ _id: false })
class MenuOption {
  @Prop({ trim: true, required: true }) name!: string;
  @Prop({ type: MoneySchema, default: () => ({ currency: 'VND', amount: 0 }) })
  priceDelta?: Money;
  @Prop({ type: Boolean, default: false }) isDefault?: boolean;
  @Prop({ type: [String], default: [] }) tags?: string[];
}
export const MenuOptionSchema = SchemaFactory.createForClass(MenuOption);

@Schema({ _id: false })
class MenuOptionGroup {
  @Prop({ trim: true, required: true }) name!: string;
  @Prop({ type: Number, default: 0 }) minSelect?: number;
  @Prop({ type: Number, default: 1 }) maxSelect?: number;
  @Prop({ type: Boolean, default: false }) required?: boolean;
  @Prop({ type: [MenuOptionSchema], default: [] }) options?: MenuOption[];
}
export const MenuOptionGroupSchema = SchemaFactory.createForClass(MenuOptionGroup);

@Schema({ _id: false })
class ItemPromotion {
  @Prop({ type: String, enum: ['PERCENT', 'FIXED'], required: true })
  type!: 'PERCENT' | 'FIXED';
  @Prop({ type: Number, required: true, min: 0 })
  value!: number; 
  @Prop({ type: Number, min: 1, default: 1 }) minQty?: number;
  @Prop({ type: Date }) startAt?: Date;
  @Prop({ type: Date }) endAt?: Date;
  @Prop({ trim: true }) code?: string;
  @Prop({ trim: true }) label?: string;
}
export const ItemPromotionSchema = SchemaFactory.createForClass(ItemPromotion);

export type MenuItemDocument = HydratedDocument<MenuItem>;

@Schema({ timestamps: true })
export class MenuItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    index: true,
    required: true,
  })
  restaurantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  categoryId?: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true }) name!: string;
  @Prop({ trim: true, lowercase: true, index: true }) slug?: string;
  @Prop({ trim: true }) description?: string;

  @Prop({ type: [String], default: [] }) images?: string[];
  @Prop({ type: [String], default: [] }) tags?: string[];        
  @Prop({ type: [String], default: [] }) cuisines?: string[];     
  @Prop({ type: String, enum: ['food', 'drink', 'dessert', 'other'], default: 'food' })
  itemType?: 'food' | 'drink' | 'dessert' | 'other';

  @Prop({ type: MoneySchema, required: true }) basePrice!: Money; 
  @Prop({ type: MoneySchema }) compareAtPrice?: Money;           

  @Prop({ type: [MenuVariantSchema], default: [] }) variants?: MenuVariant[];
  @Prop({ type: [MenuOptionGroupSchema], default: [] }) optionGroups?: MenuOptionGroup[];
  @Prop({ type: [ItemPromotionSchema], default: [] }) promotions?: ItemPromotion[];

  @Prop({ type: Boolean, default: false }) vegetarian?: boolean;
  @Prop({ type: Boolean, default: false }) vegan?: boolean;
  @Prop({ type: Boolean, default: false }) halal?: boolean;
  @Prop({ type: Boolean, default: false }) glutenFree?: boolean;
  @Prop({ type: [String], default: [] }) allergens?: string[];
  @Prop({ type: Number, min: 0, max: 3, default: 0 }) spicyLevel?: number; 

  @Prop({ type: Boolean, default: true }) isAvailable?: boolean;
  @Prop({ type: Number, default: 0 }) sortIndex?: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) extra?: Record<string, any>;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

MenuItemSchema.index(
  { restaurantId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);
MenuItemSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  cuisines: 'text',
});
