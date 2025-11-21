// src/orders/dto/create-order.dto.ts
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsMongoId()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  // FE có thể gửi note hoặc selectedOptions sau này
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptions?: string[];
}

export class CreateOrderDto {
  @IsMongoId()
  restaurantId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  note?: string;

  // nếu muốn redirect user sau khi thanh toán
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
