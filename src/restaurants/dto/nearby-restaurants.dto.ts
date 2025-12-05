// nearby-restaurants.dto.ts
import { Type } from 'class-transformer';
import { IsNumber, IsNumberString, IsOptional, IsString, Max, Min } from 'class-validator';

export class NearbyRestaurantsQueryDto {
  @IsNumber()
  @Type(() => Number)
  lat!: number; // vĩ độ (latitude) – 10.77653

  @IsNumber()
  @Type(() => Number)
  lng!: number; // kinh độ (longitude) – 106.70098

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDistanceMeters?: number; // bán kính tìm (m). Default 5000 = 5km

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number; // số nhà hàng trả về. Default 20
}


export class QueryRestaurantsHomeDto {
  // phân trang
  @IsOptional()
  @IsNumberString()
  page?: string; // mặc định 1

  @IsOptional()
  @IsNumberString()
  limit?: string; // mặc định 12

  // Khoảng giá (FE có thể gửi: cheap | medium | expensive | ... tuỳ convention)
  // map thẳng với trường priceRange trong schema
  @IsOptional()
  @IsString()
  priceRange?: string;

  // Quận/Huyện...
  @IsOptional()
  @IsString()
  district?: string;

  // Món ăn (ví dụ: phở, sushi) / keyword
  @IsOptional()
  @IsString()
  q?: string;
}