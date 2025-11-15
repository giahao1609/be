import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 🧠 EmbeddingsService – tạo vector embedding bằng Gemini
 * Dùng để lưu và truy vấn kiến thức (RAG / Vector Search)
 */
@Injectable()
export class EmbeddingsService {
  private readonly modelName = "text-embedding-004";
  private readonly genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("❌ Missing GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    console.log("🌟 Gemini Embedding Service initialized:", this.modelName);
  }

  /**
   * ✂️ Cắt văn bản dài thành các đoạn nhỏ (chunk) an toàn cho Gemini
   * Mỗi chunk < 30KB (đề phòng giới hạn của text-embedding-004)
   */
  private chunkText(text: string, maxBytes = 30000): string[] {
    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of text.split(/(?<=[.!?。！？\n])\s*/)) {
      const bytes = encoder.encode(currentChunk + sentence).length;
      if (bytes > maxBytes) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + " ";
      }
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }

  /**
   * 🧩 Tạo embedding từ văn bản (có chia nhỏ nếu quá dài)
   * Trả về 1 vector duy nhất bằng trung bình cộng các chunk.
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      if (!text || !text.trim()) {
        throw new InternalServerErrorException("Text input is empty");
      }

      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const chunks = this.chunkText(text);

      const embeddings: number[][] = [];

      for (const chunk of chunks) {
        try {
          const result = await model.embedContent(chunk);
          const vector = result?.embedding?.values;
          if (Array.isArray(vector) && vector.length > 0) {
            embeddings.push(vector);
          } else {
            console.warn("⚠️ Gemini trả về embedding rỗng cho chunk:", chunk.slice(0, 50));
          }
        } catch (err) {
          console.error("❌ Lỗi khi gọi Gemini embedContent:", err.message || err);
        }
      }

      if (embeddings.length === 0) {
        throw new InternalServerErrorException("Gemini returned no embeddings");
      }

      // 🧮 Gộp trung bình các vector chunk để thành 1 embedding duy nhất
      const dimension = embeddings[0].length;
      const avg = new Array(dimension).fill(0);

      for (const v of embeddings) {
        v.forEach((val, i) => (avg[i] += val / embeddings.length));
      }

      return avg;
    } catch (err) {
      console.error("❌ Lỗi tạo embedding Gemini:", err?.message || err);
      throw new InternalServerErrorException("Failed to create embedding");
    }
  }
}
