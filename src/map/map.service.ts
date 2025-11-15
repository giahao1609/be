import { Injectable, BadRequestException } from "@nestjs/common";
import axios from "axios";
import { NearbyDto } from "./dto/nearby.dto";

interface GeocodeResponse {
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    place_id: string;
  }>;
  status: string;
}

interface ReverseResponse {
  results: Array<{
    formatted_address: string;
    place_id: string;
  }>;
  status: string;
}

interface NearbyPlace {
  name: string;
  vicinity: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
  types?: string[];
  place_id: string;
}

interface NearbyResponse {
  results: NearbyPlace[];
  status: string;
}

@Injectable()
export class MapService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY;

  /** 🧭 Geocoding: chuyển từ địa chỉ -> tọa độ */
  async geocode(address: string) {
    if (!address) throw new BadRequestException("Thiếu địa chỉ cần tìm");

    const res = await axios.get<GeocodeResponse>(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address,
          key: this.apiKey,
          language: "vi",
        },
      }
    );

    if (!res.data.results?.length) {
      throw new BadRequestException("Không tìm thấy địa điểm này");
    }

    const result = res.data.results[0];
    return {
      address: result.formatted_address,
      lat: result.geometry.location.lat,
      lon: result.geometry.location.lng,
      place_id: result.place_id,
    };
  }

  /** 📍 Reverse Geocoding: tọa độ -> địa chỉ */
  async reverse(lat: string, lon: string) {
    if (!lat || !lon) throw new BadRequestException("Thiếu lat/lon");

    const res = await axios.get<ReverseResponse>(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          latlng: `${lat},${lon}`,
          key: this.apiKey,
          language: "vi",
        },
      }
    );

    if (!res.data.results?.length) {
      throw new BadRequestException("Không tìm thấy địa chỉ tương ứng");
    }

    const result = res.data.results[0];
    return {
      address: result.formatted_address,
      place_id: result.place_id,
    };
  }

  /** 🍽️ Nearby Places API */
  async nearbyPlaces(dto: NearbyDto) {
    const { lat, lon, keyword = "restaurant", radius = 1000 } = dto;

    const res = await axios.get<NearbyResponse>(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      {
        params: {
          location: `${lat},${lon}`,
          radius,
          keyword,
          key: this.apiKey,
          language: "vi",
        },
      }
    );

    if (!res.data.results?.length) {
      throw new BadRequestException("Không tìm thấy địa điểm nào gần bạn.");
    }

    return res.data.results.map((place) => ({
      name: place.name,
      address: place.vicinity,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      open_now: place.opening_hours?.open_now ?? null,
      types: place.types,
      place_id: place.place_id,
    }));
  }
}
