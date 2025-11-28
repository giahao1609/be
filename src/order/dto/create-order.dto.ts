import {
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsMongoId,
  IsInt,
  Min,
  IsDateString,
  IsString,
  IsOptional,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePreOrderItemDto {
  @IsMongoId()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

export class CreatePreOrderDto {
  @IsMongoId()
  restaurantId!: string;

  @IsInt()
  @Min(1)
  guestCount!: number;

  @IsDateString()
  arrivalTime!: string; // ISO string

  @IsString()
  @Length(1, 100)
  contactName!: string;

  @IsString()
  @Length(8, 20)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePreOrderItemDto)
  items!: CreatePreOrderItemDto[];
}
