// src/restaurants/dto/payment-config.dto.ts
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BankPaymentMethodDto {
  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  qrImagePath?: string; // path/url ảnh QR đã upload

  @IsOptional()
  @IsString()
  note?: string;
}

export class EWalletPaymentMethodDto {
  @IsOptional()
  @IsString()
  provider?: string; // momo, zalopay,...

  @IsOptional()
  @IsString()
  walletId?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  qrImagePath?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PaymentConfigDto {
  @IsOptional()
  @IsBoolean()
  cashEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankPaymentMethodDto)
  bankTransfers?: BankPaymentMethodDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EWalletPaymentMethodDto)
  ewallets?: EWalletPaymentMethodDto[];

  @IsOptional()
  @IsString()
  generalNote?: string;
}
