import { Injectable, InternalServerErrorException } from "@nestjs/common";
import axios from "axios";

interface OpenWeatherResponse {
  name: string;
  sys: { country: string };
  main: { temp: number; feels_like: number; humidity: number };
  weather: { description: string; icon: string; main: string }[];
}

@Injectable()
export class WeatherService {
  private readonly apiKey = process.env.OPENWEATHER_API_KEY;
  private readonly apiUrl = "https://api.openweathermap.org/data/2.5/weather";

  /** 🌤️ Lấy thời tiết tại vị trí cụ thể */
  async getWeather(lat: number, lon: number) {
    try {
      const res = await axios.get<OpenWeatherResponse>(this.apiUrl, {
        params: {
          lat,
          lon,
          units: "metric",
          lang: "vi",
          appid: this.apiKey,
        },
      });

      const data = res.data;
      const weather = data.weather[0];
      const emoji = this.getWeatherEmoji(weather.main);

      return {
        location: `${data.name}, ${data.sys.country}`,
        temperature: `${Math.round(data.main.temp)}°C`,
        feels_like: `${Math.round(data.main.feels_like)}°C`,
        humidity: `${data.main.humidity}%`,
        condition: `${emoji} ${weather.description}`,
        icon: `https://openweathermap.org/img/wn/${weather.icon}@2x.png`,
      };
    } catch (error) {
      console.error("❌ Weather API error:", error.message);
      throw new InternalServerErrorException("Không thể lấy dữ liệu thời tiết theo vị trí.");
    }
  }

  /** 🌆 Lấy thời tiết toàn TP.HCM */
  async getWeatherHCM() {
    try {
      const res = await axios.get<OpenWeatherResponse>(this.apiUrl, {
        params: {
          q: "Ho Chi Minh City,VN",
          units: "metric",
          lang: "vi",
          appid: this.apiKey,
        },
      });

      const data = res.data;
      const weather = data.weather[0];
      const emoji = this.getWeatherEmoji(weather.main);

      return {
        location: `${data.name}, ${data.sys.country}`,
        temperature: `${Math.round(data.main.temp)}°C`,
        feels_like: `${Math.round(data.main.feels_like)}°C`,
        humidity: `${data.main.humidity}%`,
        condition: `${emoji} ${weather.description}`,
        icon: `https://openweathermap.org/img/wn/${weather.icon}@2x.png`,
      };
    } catch (error) {
      console.error("❌ Weather API error:", error.message);
      throw new InternalServerErrorException("Không thể lấy dữ liệu thời tiết TP.HCM.");
    }
  }

  /** 🌈 Biểu tượng thời tiết theo điều kiện */
  private getWeatherEmoji(main: string): string {
    switch (main.toLowerCase()) {
      case "clear":
        return "☀️";
      case "clouds":
        return "☁️";
      case "rain":
      case "drizzle":
        return "🌧️";
      case "thunderstorm":
        return "⛈️";
      case "snow":
        return "❄️";
      case "mist":
      case "fog":
      case "haze":
        return "🌫️";
      default:
        return "🌤️";
    }
  }
}
