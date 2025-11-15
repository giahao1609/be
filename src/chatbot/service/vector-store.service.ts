import { Injectable, OnModuleInit } from "@nestjs/common";
import { ChromaClient, Collection } from "chromadb";
import { EmbeddingsService } from "./embeddings.service";

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private client: ChromaClient;
  private collection: Collection | null = null;

  constructor(private readonly embeddingsService: EmbeddingsService) {}

  async onModuleInit() {
    try {
      const chromaUrl = process.env.CHROMA_API_URL || "http://localhost:8000";
      const { host, port, protocol } = this.parseUrl(chromaUrl);

      this.client = new ChromaClient({
        host,
        port,
        ssl: protocol === "https",
      });

      await this.client.heartbeat();
      console.log(`💚 Connected to ChromaDB at ${chromaUrl}`);

      this.collection = await this.client.getOrCreateCollection({
        name: "foodmap-ai",
        embeddingFunction: {
          generate: async (texts: string[]) => {
            const vectors: number[][] = [];
            for (const text of texts) {
              const emb = await this.embeddingsService.createEmbedding(text);
              vectors.push(emb);
            }
            return vectors;
          },
        },
      });

      console.log("✅ VectorStore (Gemini Embedding) initialized!");
    } catch (error) {
      console.error("❌ VectorStore init failed:", error.message);
    }
  }

  /** ➕ Thêm document mới vào ChromaDB */
  async addDocument(doc: { id: string; content: string; sourceUrl?: string }) {
    if (!this.collection) throw new Error("❌ Collection chưa khởi tạo!");
    try {
      const embedding = await this.embeddingsService.createEmbedding(doc.content);
      await this.collection.add({
        ids: [doc.id],
        documents: [doc.content],
        embeddings: [embedding],
        metadatas: [{ sourceUrl: doc.sourceUrl || null }],
      });
      console.log("🧩 Document added:", doc.id);
    } catch (err) {
      console.error("❌ AddDocument error:", err.message);
    }
  }

  /** 🔍 Tìm vector tương tự */
  async querySimilar(text: string, limit = 3) {
    if (!this.collection) throw new Error("❌ Collection chưa khởi tạo!");
    const queryEmbedding = await this.embeddingsService.createEmbedding(text);
    return this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });
  }

  /** 🔍 Alias cho ChatService.askWithKnowledge() */
  async query(embedding: number[], limit = 3): Promise<string> {
    if (!this.collection) throw new Error("❌ Collection chưa khởi tạo!");
    const result = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
    });

    const docs = result?.documents?.[0];
    if (!docs || docs.length === 0) {
      return "Em chưa tìm thấy thông tin phù hợp ạ.";
    }

    // Gộp kết quả thành 1 đoạn văn bản
    return docs.join(" ");
  }

  /** 🧹 Xóa document theo ID */
  async deleteDocument(id: string) {
    if (!this.collection) throw new Error("❌ Collection chưa khởi tạo!");
    await this.collection.delete({ ids: [id] });
    console.log("🗑️ Deleted vector:", id);
  }

  /** ⚙️ Helper parse URL */
  private parseUrl(url: string) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 8000,
      protocol: parsed.protocol.replace(":", ""),
    };
  }
}
