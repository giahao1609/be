import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./service/chat.service";
import { EmbeddingsService } from "./service/embeddings.service";
import { VectorStoreService } from "./service/vector-store.service";
import { WeatherService } from "./service/weather.service";
import { WeatherController } from "./service/weather.controller";

// Gợi ý
import { ContextSuggestionService } from "./service/suggestion/context-suggestion.service";
import { FeelingSuggestionService } from "./service/suggestion/feeling-suggestion.service";
import { VividSuggestionService } from "./service/suggestion/vivid-suggestion.service";
import { SituationSuggestionService } from "./service/suggestion/situation-suggestion.service";
import { HistorySuggestionService } from "./service/suggestion/history-suggestion.service";
import { SuggestionManagerService } from "./service/suggestion/suggestion-manager.service";

@Module({
  controllers: [ChatController,WeatherController],
  providers: [
    ChatService,
    EmbeddingsService,
    VectorStoreService,
    WeatherService,
    ContextSuggestionService,
    FeelingSuggestionService,
    VividSuggestionService,
    SituationSuggestionService,
    HistorySuggestionService,
    SuggestionManagerService,
  ],
    exports: [VectorStoreService, EmbeddingsService], // 👈 THÊM DÒNG NÀY

})
export class ChatModule {}
