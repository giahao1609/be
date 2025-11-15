import { ChromaClient } from "chromadb";

async function main() {
  const client = new ChromaClient({
    host: "34.126.164.114",
    port: 8000,
    ssl: false,
  });

  console.log("🧠 Connecting to Chroma...");
  console.log(await client.heartbeat());

  const collections = await client.listCollections();
  console.log("📦 Collections:", collections.map((c) => c.name));

  // 🗑️ Xóa collection "foodmap-ai" nếu tồn tại
  const exists = collections.find((c) => c.name === "foodmap-ai");
  if (exists) {
    await client.deleteCollection({ name: "foodmap-ai" });
    console.log("🗑️ Deleted old collection 'foodmap-ai'");
  } else {
    console.log("⚠️ Collection 'foodmap-ai' not found.");
  }

  // 🧠 Kiểm tra lại danh sách sau khi xóa
  const after = await client.listCollections();
  console.log("📦 Collections after delete:", after.map((c) => c.name));
}

main().catch((err) => console.error("❌ Error:", err));
