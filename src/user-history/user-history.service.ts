import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserHistory } from "./schemas/user-history.schema";

@Injectable()
export class UserHistoryService {
  constructor(
    @InjectModel(UserHistory.name)
    private readonly historyModel: Model<UserHistory>
  ) {}

  /** 🟢 Lưu tin nhắn */
  async saveMessage(userId: string, role: "user" | "bot", text: string) {
    return this.historyModel.create({ userId, role, text });
  }

  /** 🟢 Lấy lịch sử gần đây của user (client chatbot dùng) */
  async getRecentHistory(userId: string, limit = 6) {
    const items = await this.historyModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return items.reverse();
  }

  /** 🟢 Lấy toàn bộ lịch sử chat của user (dành cho admin) */
  async getAllByUser(userId: string) {
    return this.historyModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /** 🟢 Thống kê lượt chat theo ngày (cho Dashboard) */
  async getChatStats() {
    const stats = await this.historyModel.aggregate([
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          chats: { $sum: 1 },
        },
      },
      { $sort: { "_id": 1 } },
    ]);

    // map thứ -> tên ngày
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return stats.map((d) => ({
      date: days[d._id - 1],
      chats: d.chats,
    }));
  }

  /** 🟢 Xóa toàn bộ lịch sử chat của user */
  async clearHistory(userId: string): Promise<void> {
    await this.historyModel.deleteMany({ userId });
  }
}
