import { Injectable } from "@nestjs/common";

@Injectable()
export class VividSuggestionService {
  getVividExamples(): string {
    const examples = [
      "Hay là mình làm món sườn xào chua ngọt đi? Tưởng tượng miếng sườn mềm, thấm đẫm sốt chua ngọt, ăn với cơm trắng nóng hổi thì 'bay' nồi cơm luôn.",
      "Nghĩ tới cảnh cắn miếng bánh xèo giòn rụm, bên trong có tôm, thịt, giá đỗ, cuốn với rau sống, chấm nước mắm chua ngọt... Trời ơi, thèm thực sự. Bạn thử món này không?",
    ];
    return examples[Math.floor(Math.random() * examples.length)];
  }
}
