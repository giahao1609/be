import { Injectable } from "@nestjs/common";

@Injectable()
export class HistorySuggestionService {
  async suggestFromHistory(
    recentSearches: string[] = [],
    clickedShops: string[] = []
  ): Promise<string> {
    if (clickedShops.length) {
      const lastShop = clickedShops[clickedShops.length - 1];
      return `Hôm trước bạn có ghé ${lastShop}, muốn ăn lại chỗ đó hay thử quán tương tự gần đây không?`;
    }

    if (recentSearches.length) {
      const lastSearch = recentSearches[recentSearches.length - 1];
      return `Bạn vừa tìm "${lastSearch}", em có vài món tương tự muốn gợi ý nha 😋.`;
    }

    return "Hôm nay mình ăn gì khác một chút nha, cho đổi gió?";
  }
}
