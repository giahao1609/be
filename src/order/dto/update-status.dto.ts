// src/pre-order/dto/update-status.dto.ts
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdatePreOrderStatusDto {
  @IsIn(['CONFIRMED', 'REJECTED', 'CANCELLED'])
  status!: 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  ownerNote?: string;
}
