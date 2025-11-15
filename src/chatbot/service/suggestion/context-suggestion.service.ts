import { Injectable } from "@nestjs/common";
import { WeatherService } from "../weather.service";

@Injectable()
export class ContextSuggestionService {
  constructor(private readonly weatherService: WeatherService) {}

  async suggestByContext(lat?: number, lng?: number): Promise<string> {
    const now = new Date();
    const hour = now.getHours();

    const weather = lat && lng
      ? await this.weatherService.getWeather(lat, lng)
      : await this.weatherService.getWeatherHCM();

    const temp = Number(weather.temperature?.replace("°C", "")) || 30;
    let message = "";

    if (weather.condition.includes("mưa") || temp < 25) {
      message =
        "Trời se lạnh vầy mà có một nồi lẩu Thái bốc khói, hay một tô mì cay 7 cấp độ thì 'hết sẩy' luôn đó. Bạn thấy sao?";
    } else if (temp >= 32) {
      message =
        "Nóng thế này ăn cơm ngán lắm. Hay là mình kiếm gì mát mát giải nhiệt đi, như bún thịt nướng, gỏi cuốn hoặc một ly chè sâm bổ lượng?";
    } else if (hour >= 18) {
      message =
        "Tối rồi, bạn muốn ăn gì 'chắc bụng' (như cơm, phở) hay chỉ ăn gì 'nhẹ nhàng' (như súp, cháo) cho ấm bụng thôi?";
    } else if (hour < 10) {
      message =
        "Buổi sáng nè, ăn nhẹ thôi hen? Một ổ bánh mì trứng hay bún bò nóng cũng được á 😋.";
    }

    return message;
  }
}
