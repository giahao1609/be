import { Injectable } from "@nestjs/common";

@Injectable()
export class SituationSuggestionService {
  suggestBySituation(who: "alone" | "friends" | "healthy" = "alone"): string {
    switch (who) {
      case "alone":
        return "Bạn ăn một mình à? Vậy thử món cơm trộn Hàn Quốc đi, làm nhanh gọn mà vẫn đủ chất.";
      case "friends":
        return "Tối nay có bạn bè tụ tập hả? Vậy phải làm món gì 'hoành tráng' một chút. Làm một nồi lẩu hải sản hay gà nướng muối ớt cho xôm tụ?";
      case "healthy":
        return "Bạn đang cần ăn gì 'healthy' để giữ dáng à? Vậy một phần salad ức gà áp chảo hoặc ức gà cuộn măng tây là 'chuẩn bài' đó.";
      default:
        return "Tối nay ăn gì cho vui nè? 😄";
    }
  }
}
