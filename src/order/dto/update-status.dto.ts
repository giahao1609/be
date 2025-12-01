// src/pre-order/dto/update-status.dto.ts
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdatePreOrderStatusDto {
  @IsIn(['CONFIRMED', 'REJECTED', 'CANCELLED'])
  status!: 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  ownerNote?: string;
}



export class RequestDepositDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  depositPercent: number; // % trên totalAmount

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean = true;

  @IsOptional()
  @IsEmail()
  overrideEmail?: string; // nếu muốn gửi tới email khác

  @IsOptional()
  @IsString()
  emailNote?: string; // note thêm trong email cho khách
}

// src/pre-order/dto/mark-paid.dto.ts

export class MarkPaidDto {
  @IsOptional()
  @IsString()
  paymentReference?: string; // mã giao dịch từ cổng thanh toán
}
