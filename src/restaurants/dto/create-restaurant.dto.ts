import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// =========== Address ===========

export class AddressDto {
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  coordinates?: number[];

  @IsOptional()
  @IsString()
  formatted?: string;
}

// =========== Opening Hours ===========

export class OpeningPeriodDto {
  @IsString()
  opens!: string;

  @IsString()
  closes!: string;
}

export class OpeningDayDto {
  @IsOptional()
  @IsString()
  day?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningPeriodDto)
  periods!: OpeningPeriodDto[];

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsBoolean()
  is24h?: boolean;
}

// =========== Payment ===========

export class PaymentQrDto {
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  rawContent?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BankTransferInfoDto {
  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentQrDto)
  qr?: PaymentQrDto;

  @IsOptional()
  @IsString()
  note?: string;
}

export class EWalletInfoDto {
  @IsOptional()
  @IsIn(['MOMO', 'ZALOPAY', 'VIETTELPAY', 'VNPAY', 'OTHER'])
  provider?: 'MOMO' | 'ZALOPAY' | 'VIETTELPAY' | 'VNPAY' | 'OTHER';

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentQrDto)
  qr?: PaymentQrDto;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PaymentConfigDto {
  @IsOptional()
  @IsBoolean()
  allowCash?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBankTransfer?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEWallet?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankTransferInfoDto)
  bankTransfers?: BankTransferInfoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EWalletInfoDto)
  eWallets?: EWalletInfoDto[];

  @IsOptional()
  @IsString()
  generalNote?: string;
}

// =========== Create / Update Restaurant ===========

export class CreateRestaurantDto {
  @IsMongoId()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gallery?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OpeningDayDto)
  openingHours?: OpeningDayDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cuisine?: string[];

  @IsOptional()
  @IsString()
  priceRange?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rating?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentConfigDto)
  paymentConfig?: PaymentConfigDto;
}

// Update cho phép partial
export class UpdateRestaurantDto extends CreateRestaurantDto {
  // các flag liên quan upload
  @IsOptional()
  removeLogo?: string | boolean;

  @IsOptional()
  removeCover?: string | boolean;

  @IsOptional()
  galleryMode?: 'append' | 'replace' | 'remove';

  @IsOptional()
  galleryRemovePaths?: string | string[];

  @IsOptional()
  removeAllGallery?: string | boolean;

}
