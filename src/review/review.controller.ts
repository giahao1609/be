import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ReviewService } from "./review.service";

@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /** 🆕 Tạo review mới (có rating & ảnh) */
  @Post(":userId/:restaurantId")
  @UseInterceptors(FilesInterceptor("files", 10))
  async createReview(
    @Param("userId") userId: string,
    @Param("restaurantId") restaurantId: string,
    @Body("content") content: string,
    @Body("rating") rating: number,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    return this.reviewService.createReview(userId, restaurantId, content, Number(rating), files);
  }

  /** ✏️ Cập nhật review (bao gồm rating, ảnh, nội dung) */
  @Put(":id")
  @UseInterceptors(FilesInterceptor("files", 10))
  async updateReview(
    @Param("id") id: string,
    @Body("content") content: string,
    @Body("rating") rating: number,
    @Body("keepImages") keepImages: string[] | string,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    // Nếu keepImages là chuỗi JSON (do form gửi), parse lại
    let parsedImages: string[] = [];
    if (typeof keepImages === "string") {
      try {
        parsedImages = JSON.parse(keepImages);
      } catch {
        parsedImages = [];
      }
    } else if (Array.isArray(keepImages)) {
      parsedImages = keepImages;
    }

    return this.reviewService.updateReview(id, content, Number(rating), parsedImages, files);
  }

  /** 🗑️ Xoá review */
  @Delete(":id")
  async deleteReview(@Param("id") id: string) {
    return this.reviewService.deleteReview(id);
  }

  /** 📋 Lấy danh sách review theo quán (mới nhất trước) */
  @Get("restaurant/:restaurantId")
  async getByRestaurant(@Param("restaurantId") restaurantId: string) {
    return this.reviewService.getReviewsByRestaurant(restaurantId);
  }
}
