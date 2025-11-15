import { Injectable } from "@nestjs/common";

@Injectable()
export class FeelingSuggestionService {
  suggestByFeeling(): string {
    const options = [
      "Hôm nay bạn đang thèm vị gì? Thèm gì đó chua cay (như lẩu, bún Thái), hay béo ngậy (như gà rán), hay thanh đạm (như salad)?",
      "Bạn muốn ăn món gì 'hao cơm' (món mặn) hay ăn gì 'vui miệng' (ăn vặt) thôi?",
      "Nay bạn có 'ngán' cơm chưa? Hay mình 'đổi gió' qua món nước (bún, phở, hủ tiếu) hen?",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
}
