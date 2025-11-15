import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import fetch from "node-fetch";
import { Storage } from "@google-cloud/storage";
import * as path from "path";
import { WeatherService } from ".//weather.service";
import { EmbeddingsService } from ".//embeddings.service";
import { VectorStoreService } from ".//vector-store.service";

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type?: string;
    data?: string;
  };
}
interface GeminiContent {
  parts?: GeminiPart[];
}
interface GeminiCandidate {
  content?: GeminiContent;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GoogleTtsResponse {
  audioContent?: string;
}

@Injectable()
export class ChatService {
  private readonly GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
  private readonly TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
  private readonly GEMINI_MODEL = "models/gemini-2.0-flash";
  private readonly bucketName = process.env.GCS_BUCKET || "foodmap-secure";
  private storage: Storage;

  constructor(
    private readonly weatherService: WeatherService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorStoreService: VectorStoreService
  ) {
    const keyPath = path.join(process.cwd(), "src/config/gcs-key.json");
    this.storage = new Storage({ keyFilename: keyPath });
  }

  /**
   * 💬 Gọi Gemini sinh câu trả lời (Pika – trợ lý ảo tư vấn món ăn/quán ăn)
   */
  async getReply(
    message: string,
    context?: {
      weatherInfo?: string;
      gender?: "MALE" | "FEMALE";
      languageCode?: string;
    }
  ): Promise<{ reply: string; audioUrl?: string; mime?: string }> {
    let reply = "❌ Xin lỗi, em chưa rõ câu hỏi của anh/chị.";

    const basePrompt = `
Bạn là **Pika**, một trợ lý ảo thân thiện, chuyên tư vấn món ăn và quán ăn tại Việt Nam 🇻🇳.
Luôn xưng “em”, nói chuyện tự nhiên, lễ phép, vui vẻ, có cảm xúc.

⚠️ QUY TẮC QUAN TRỌNG:
- Trả lời tròn câu, trọn ý, không được dừng giữa chừng dù giới hạn từ thấp.
- Nếu cần, hãy **tóm gọn lại nội dung** để vẫn đủ ý trong phạm vi ngắn.
- Độ dài tối đa: khoảng 100 từ (tương đương 150 tokens).
- Không viết dở dang hoặc ngắt ngang câu cuối.
- Ưu tiên câu ngắn, dễ hiểu, tự nhiên, không liệt kê quá dài.

Ngữ cảnh thêm:
${context?.weatherInfo ? `Thời tiết hiện tại: ${context.weatherInfo}` : ""}
Khách hỏi: "${message}"
`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${this.GEMINI_MODEL}:generateContent?key=${this.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: basePrompt }],
              },
            ],
            generationConfig: { maxOutputTokens: 180 },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as GeminiResponse;
      reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "Dạ để em kiểm tra lại giúp anh/chị ạ.";
    } catch (err) {
      console.error("❌ Lỗi gọi Gemini:", err);
    }

    // 2️⃣ Tạo giọng nói (Google Cloud TTS)
    try {
      const ttsRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.TTS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: reply },
            voice: {
              languageCode: context?.languageCode || "vi-VN",
              name:
                context?.gender === "MALE"
                  ? "vi-VN-Wavenet-B"
                  : "vi-VN-Wavenet-A",
              ssmlGender: context?.gender || "FEMALE",
            },
            audioConfig: { audioEncoding: "MP3" },
          }),
        }
      );

      if (!ttsRes.ok) {
        throw new Error(`Google TTS error ${ttsRes.status}`);
      }

      const ttsData = (await ttsRes.json()) as GoogleTtsResponse;

      if (ttsData?.audioContent) {
        const fileName = `uploads/voice/${Date.now()}.mp3`;
        const bucket = this.storage.bucket(this.bucketName);
        const blob = bucket.file(fileName);

        await blob.save(Buffer.from(ttsData.audioContent, "base64"), {
          contentType: "audio/mpeg",
        });

        const [audioUrl] = await blob.getSignedUrl({
          action: "read",
          expires: Date.now() + 6 * 60 * 60 * 1000, // 6h
        });

        return { reply, audioUrl, mime: "audio/mpeg" };
      }
    } catch (err) {
      console.error("❌ Lỗi Google TTS:", err);
    }

    return { reply };
  }

  /**
   * 🌦 Trả lời thông minh – dùng lat/lon nếu có, fallback TP.HCM nếu không
   */
  async smartWeather(message: string, lat?: number, lon?: number) {
    let weatherInfo = "";

    try {
      const weather = lat && lon
        ? await this.weatherService.getWeather(lat, lon)
        : await this.weatherService.getWeatherHCM();

      const temp = Number(weather.temperature.replace("°C", ""));
      let foodSuggestion = "";

      if (weather.condition.includes("mưa")) {
        foodSuggestion =
          "Trời mưa nhẹ thế này, ăn gì nóng như phở bò, bún bò hoặc hủ tiếu sẽ ấm bụng hơn đó ạ 🍜.";
      } else if (weather.condition.includes("nắng") || temp >= 32) {
        foodSuggestion =
          "Thời tiết nóng bức quá, anh/chị thử món gì mát như gỏi cuốn, chè khúc bạch hay nước sâm nha 🧊.";
      } else if (weather.condition.includes("mây")) {
        foodSuggestion =
          "Trời nhiều mây dễ chịu, anh/chị có thể ăn nhẹ nhàng như cơm tấm hoặc bánh mì nướng cũng ngon lắm 😋.";
      } else {
        foodSuggestion =
          "Thời tiết dễ chịu, món nào cũng hợp hết ạ, em gợi ý phở hoặc cơm tấm nha 🍚.";
      }

      weatherInfo = `Hiện tại ở ${weather.location} ${weather.condition}, nhiệt độ khoảng ${weather.temperature} (cảm giác như ${weather.feels_like}), độ ẩm ${weather.humidity}. ${foodSuggestion}`;
    } catch {
      weatherInfo = "Em chưa lấy được dữ liệu thời tiết ạ.";
    }

    return this.getReply(message, { weatherInfo });
  }

  /** 🍜 Gợi ý món ăn nhanh nếu chỉ nhập từ khoá */
  async suggestFood(prompt: string) {
    const foods = [
      "Phở bò",
      "Cơm tấm sườn bì chả",
      "Bún chả Hà Nội",
      "Hủ tiếu Nam Vang",
      "Bánh mì thịt nướng",
      "Bún bò Huế",
      "Gỏi cuốn tôm thịt",
      "Chè khúc bạch",
    ];
    const keyword = prompt.toLowerCase();
    const matched = foods.filter((f) => f.toLowerCase().includes(keyword));
    return { suggestions: matched.length ? matched : foods.slice(0, 3) };
  }

  /** 🧠 Chat có tri thức (RAG / knowledge base) – thêm TTS */
  async askWithKnowledge(message: string, lat?: number, lng?: number) {
    try {
      const embedding = await this.embeddingsService.createEmbedding(message);
      const context = await this.vectorStoreService.query(embedding);

      // 🛰️ Thêm thông tin thời tiết nếu có
      let weatherText = "";
      if (lat && lng) {
        try {
          const weather = await this.weatherService.getWeather(lat, lng);
          weatherText = `Thời tiết gần bạn hiện là ${weather?.temperature} (${weather?.condition}). `;
        } catch {
          weatherText = "Không lấy được dữ liệu thời tiết hiện tại. ";
        }
      }

      // 🧠 Gửi sang Gemini
      const fullPrompt = `
Bạn là **Pika**, trợ lý ảo thân thiện tư vấn món ăn & quán ăn Việt Nam 🇻🇳.
Dưới đây là thông tin em biết:
${context}

${weatherText}
Người dùng hỏi: "${message}"

➡ Trả lời tự nhiên, thân thiện, 2–3 câu, không khô khan, không cắt ngang.
`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${this.GEMINI_MODEL}:generateContent?key=${this.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: 200 },
          }),
        }
      );

      if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
      const data = (await res.json()) as GeminiResponse;
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "Dạ để em kiểm tra lại giúp anh/chị ạ.";

      // 🎙️ Gọi Google TTS để sinh giọng nói
      try {
        const ttsRes = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.TTS_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text: reply },
              voice: {
                languageCode: "vi-VN",
                name: "vi-VN-Wavenet-A",
                ssmlGender: "FEMALE",
              },
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        );

        if (!ttsRes.ok) throw new Error(`Google TTS error ${ttsRes.status}`);
        const ttsData = (await ttsRes.json()) as GoogleTtsResponse;

        if (ttsData?.audioContent) {
          const fileName = `uploads/voice/${Date.now()}.mp3`;
          const bucket = this.storage.bucket(this.bucketName);
          const blob = bucket.file(fileName);

          await blob.save(Buffer.from(ttsData.audioContent, "base64"), {
            contentType: "audio/mpeg",
          });

          const [audioUrl] = await blob.getSignedUrl({
            action: "read",
            expires: Date.now() + 6 * 60 * 60 * 1000,
          });

          return { reply, audioUrl, mime: "audio/mpeg" };
        }
      } catch (ttsErr) {
        console.error("❌ Lỗi TTS:", ttsErr);
      }

      return { reply };
    } catch (err) {
      console.error("❌ Lỗi askWithKnowledge:", err);
      throw new InternalServerErrorException("Không thể tạo phản hồi.");
    }
  }
}
