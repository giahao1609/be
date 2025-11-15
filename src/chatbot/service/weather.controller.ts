import { Controller, Post, Body } from "@nestjs/common";
import { WeatherService } from "./weather.service";

@Controller("api/weather")
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Post()
  async getWeather(@Body() body: { lat: number; lon: number }) {
    const { lat, lon } = body;
    if (!lat || !lon)
      return this.weatherService.getWeatherHCM();
    return this.weatherService.getWeather(lat, lon);
  }
}
