import { IsNumber, IsString, IsOptional } from "class-validator";

export class NearbyDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lon: number;

  @IsString()
  @IsOptional()
  keyword?: string; // ví dụ: "quán ăn", "cafe", "restaurant"

  @IsNumber()
  @IsOptional()
  radius?: number; // đơn vị mét (mặc định 1000)
}
