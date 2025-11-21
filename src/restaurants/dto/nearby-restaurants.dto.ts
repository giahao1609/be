// nearby-restaurants.dto.ts
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

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
