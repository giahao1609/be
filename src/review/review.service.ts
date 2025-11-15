import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Review } from "./schema/review.schema";
import { Restaurant } from "../restaurants/schema/restaurant.schema";
import { UploadService } from "../upload/upload.service";

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Restaurant.name) private readonly restaurantModel: Model<Restaurant>,
    private readonly uploadService: UploadService
  ) {}

  /** 🧮 Hàm cập nhật lại thống kê rating cho quán ăn */
  private async updateRestaurantRating(restaurantId: string) {
    const all = await this.reviewModel.find({ restaurantId });
    const total = all.length;

    if (total === 0) {
      await this.restaurantModel.findByIdAndUpdate(restaurantId, {
        rating: 0,
        reviewsCount: 0,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
      return;
    }

    const avg = all.reduce((sum, r) => sum + (r.rating || 0), 0) / total;
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of all) breakdown[r.rating]++;

    await this.restaurantModel.findByIdAndUpdate(restaurantId, {
      rating: Number(avg.toFixed(1)),
      reviewsCount: total,
      ratingBreakdown: breakdown,
    });
  }

  /** 🆕 Tạo review mới (có rating & ảnh) */
  async createReview(
    userId: string,
    restaurantId: string,
    content: string,
    rating: number,
    files: Express.Multer.File[]
  ) {
    let uploadedUrls: string[] = [];

    if (files && files.length > 0) {
      const upload = await this.uploadService.uploadMultipleToGCS(
        files,
        `review/${restaurantId}/${userId}`
      );
      uploadedUrls = upload.paths;
    }

    const review = await this.reviewModel.create({
      userId,
      restaurantId,
      content,
      rating,
      images: uploadedUrls,
    });

    // 🔄 Cập nhật lại thống kê rating cho quán ăn
    await this.updateRestaurantRating(restaurantId);

    return review;
  }

  /** ✏️ Sửa review (bao gồm nội dung, ảnh, rating) */
  async updateReview(
    id: string,
    content: string,
    rating: number,
    keepImages: string[],
    files: Express.Multer.File[]
  ) {
    const review = await this.reviewModel.findById(id);
    if (!review) throw new NotFoundException("Review not found");

    let uploadedUrls: string[] = [];
    if (files && files.length > 0) {
      const upload = await this.uploadService.uploadMultipleToGCS(
        files,
        `review/${review.restaurantId}/${review.userId}`
      );
      uploadedUrls = upload.paths;
    }

    const newImages = [...(keepImages || []), ...uploadedUrls];

    review.content = content;
    review.rating = rating;
    review.images = newImages;
    await review.save();

    // 🔄 Cập nhật lại thống kê rating
    await this.updateRestaurantRating(review.restaurantId);

    return review;
  }

  /** 🗑️ Xoá review */
  async deleteReview(id: string) {
    const review = await this.reviewModel.findByIdAndDelete(id);
    if (!review) throw new NotFoundException("Review not found");

    // 🔄 Cập nhật lại thống kê rating
    await this.updateRestaurantRating(review.restaurantId);

    return { message: "Review deleted successfully" };
  }

  /** 📋 Lấy danh sách review theo quán (mới nhất trước) */
  async getReviewsByRestaurant(restaurantId: string) {
    return this.reviewModel.find({ restaurantId }).sort({ createdAt: -1 });
  }
}
