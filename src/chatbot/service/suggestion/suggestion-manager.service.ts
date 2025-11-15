import { Injectable } from "@nestjs/common";
import { ContextSuggestionService } from "./context-suggestion.service";
import { FeelingSuggestionService } from "./feeling-suggestion.service";
import { VividSuggestionService } from "./vivid-suggestion.service";
import { SituationSuggestionService } from "./situation-suggestion.service";
import { HistorySuggestionService } from "./history-suggestion.service";

@Injectable()
export class SuggestionManagerService {
  constructor(
    private readonly contextSg: ContextSuggestionService,
    private readonly feelingSg: FeelingSuggestionService,
    private readonly vividSg: VividSuggestionService,
    private readonly situationSg: SituationSuggestionService,
    private readonly historySg: HistorySuggestionService
  ) {}

  async getSuggestions(lat?: number, lng?: number): Promise<string[]> {
    const list: string[] = [];
    const context = await this.contextSg.suggestByContext(lat, lng);
    if (context) list.push(context);

    list.push(this.feelingSg.suggestByFeeling());
    list.push(this.vividSg.getVividExamples());
    list.push(this.situationSg.suggestBySituation());
    return list;
  }
}
