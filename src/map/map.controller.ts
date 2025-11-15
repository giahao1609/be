import { Controller, Get, Query, Body } from "@nestjs/common";
import { MapService } from "./map.service";
import { NearbyDto } from "./dto/nearby.dto";

@Controller("map")
export class MapController {
  constructor(private readonly mapService: MapService) {}

  /** 🧭 Địa chỉ → Tọa độ */
  @Get("geocode")
  async geocode(@Query("address") address: string) {
    return this.mapService.geocode(address);
  }

  /** 📍 Tọa độ → Địa chỉ */
  @Get("reverse")
  async reverse(@Query("lat") lat: string, @Query("lon") lon: string) {
    return this.mapService.reverse(lat, lon);
  }

  /** 🍽️ Địa điểm gần bạn */
  @Get("nearby")
  async nearby(@Query() query: NearbyDto) {
    return this.mapService.nearbyPlaces(query);
  }
}
