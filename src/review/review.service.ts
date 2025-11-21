import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  FilterQuery,
  Model,
  Types,
  UpdateQuery,
} from 'mongoose';
import { Review, ReviewDocument } from './schema/review.schema';
import { Restaurant } from '../restaurants/schema/restaurant.schema';
import { UploadService } from '../upload/upload.service';

type ImageFlags = {
  imagesMode?: 'append' | 'replace' | 'remove';
  removeAllImages?: boolean;
  imagesRemovePaths?: string[];
};

type CreateReviewInput = {
  content: string;
  rating: number;
};

type UpdateReviewInput = {
  content?: string;
  rating?: number;
};

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<Restaurant>,
    private readonly uploadService: UploadService,
  ) {}

  // ===== RATING AGGREGATION =====
  private async updateRestaurantRating(restaurantId: string) {
    const restObj = new Types.ObjectId(restaurantId);

    const stats = await this.reviewModel.aggregate([
      { $match: { restaurantId: restObj } },
      {
        $group: {
          _id: '$restaurantId',
          avgRating: { $avg: '$rating' },
          total: { $sum: 1 },
          star1: {
            $sum: {
              $cond: [{ $eq: ['$rating', 1] }, 1, 0],
            },
          },
          star2: {
            $sum: {
              $cond: [{ $eq: ['$rating', 2] }, 1, 0],
            },
          },
          star3: {
            $sum: {
              $cond: [{ $eq: ['$rating', 3] }, 1, 0],
            },
          },
          star4: {
            $sum: {
              $cond: [{ $eq: ['$rating', 4] }, 1, 0],
            },
          },
          star5: {
            $sum: {
              $cond: [{ $eq: ['$rating', 5] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!stats.length) {
      await this.restaurantModel.findByIdAndUpdate(restaurantId, {
        rating: 0,
        reviewsCount: 0,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
      return;
    }

    const s = stats[0];
    const avg = Number((s.avgRating || 0).toFixed(1));
    const total = s.total || 0;
    const breakdown = {
      1: s.star1 || 0,
      2: s.star2 || 0,
      3: s.star3 || 0,
      4: s.star4 || 0,
      5: s.star5 || 0,
    };

    await this.restaurantModel.findByIdAndUpdate(restaurantId, {
      rating: avg,
      reviewsCount: total,
      ratingBreakdown: breakdown,
    });
  }

  // ===== CREATE WITH UPLOADS =====
  async createWithUploads(
    userId: string,
    restaurantId: string,
    dto: CreateReviewInput,
    images: Express.Multer.File[] = [],
  ) {
    const restObj = new Types.ObjectId(restaurantId);

    let imagePaths: string[] = [];

    if (images.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        images,
        `restaurants/${restaurantId}/reviews/${userId}`,
      );
      imagePaths = up.paths ?? [];
    }

    const created = await this.reviewModel.create({
      userId,
      restaurantId: restObj,
      content: dto.content,
      rating: dto.rating,
      images: imagePaths,
    });

    await this.updateRestaurantRating(restaurantId);

    return created.toObject();
  }

  // ===== UPDATE WITH UPLOADS =====
  async updateWithUploads(
    restaurantId: string,
    id: string,
    dto: UpdateReviewInput,
    images: Express.Multer.File[] = [],
    flags?: ImageFlags,
  ) {
    const restObj = new Types.ObjectId(restaurantId);
    const filter: FilterQuery<ReviewDocument> = {
      _id: new Types.ObjectId(id),
      restaurantId: restObj,
    };

    const current = await this.reviewModel.findOne(filter).lean();
    if (!current) throw new NotFoundException('Review not found');

    const update: UpdateQuery<ReviewDocument> = { $set: {} as any };

    if (dto.content !== undefined) {
      (update.$set as any).content = dto.content;
    }
    if (dto.rating !== undefined) {
      (update.$set as any).rating = dto.rating;
    }

    const flagsSafe: ImageFlags = {
      imagesMode: flags?.imagesMode ?? 'append',
      removeAllImages: !!flags?.removeAllImages,
      imagesRemovePaths: Array.isArray(flags?.imagesRemovePaths)
        ? flags.imagesRemovePaths
        : [],
    };

    let nextImages = Array.isArray(current.images) ? [...current.images] : [];

    // remove / removeAll
    if (flagsSafe.imagesMode === 'remove' || flagsSafe.removeAllImages) {
      if (flagsSafe.removeAllImages) {
        nextImages = [];
      } else if (flagsSafe.imagesRemovePaths?.length) {
        const rm = new Set(flagsSafe.imagesRemovePaths);
        nextImages = nextImages.filter((p) => !rm.has(p));
      }
    }

    // replace
    if (flagsSafe.imagesMode === 'replace') {
      if (images.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          images,
          `restaurants/${restaurantId}/reviews/${current.userId}`,
        );
        nextImages = up.paths ?? [];
      } else if ((dto as any).images && Array.isArray((dto as any).images)) {
        nextImages = (dto as any).images as string[];
      } else {
        nextImages = [];
      }
    }

    // append
    if (flagsSafe.imagesMode === 'append') {
      if (images.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          images,
          `restaurants/${restaurantId}/reviews/${current.userId}`,
        );
        nextImages = [
          ...nextImages,
          ...((up.paths ?? []) as string[]),
        ];
      }

      if ((dto as any).images && Array.isArray((dto as any).images)) {
        nextImages = [
          ...nextImages,
          ...((dto as any).images as string[]),
        ];
      }

      if (flagsSafe.imagesRemovePaths?.length) {
        const rm = new Set(flagsSafe.imagesRemovePaths);
        nextImages = nextImages.filter((p) => !rm.has(p));
      }

      // uniq
      nextImages = [...new Set(nextImages)];
    }

    const changed =
      nextImages.length !== (current.images?.length ?? 0) ||
      nextImages.some((p, i) => p !== current.images?.[i]);

    if (changed) {
      (update.$set as any).images = nextImages;
    }

    (update.$set as any).updatedAt = new Date();

    const updated = await this.reviewModel
      .findOneAndUpdate(filter, update, { new: true, lean: true })
      .exec();
    if (!updated) throw new NotFoundException('Review not found');

    await this.updateRestaurantRating(restaurantId);

    return updated;
  }

  // ===== DELETE =====
  async deleteReview(restaurantId: string, id: string) {
    const restObj = new Types.ObjectId(restaurantId);
    const review = await this.reviewModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      restaurantId: restObj,
    });
    if (!review) throw new NotFoundException('Review not found');

    await this.updateRestaurantRating(restaurantId);

    return { message: 'Review deleted successfully' };
  }

  // ===== LIST BY RESTAURANT =====
  async getReviewsByRestaurant(restaurantId: string) {
    const restObj = new Types.ObjectId(restaurantId);
    return this.reviewModel
      .find({ restaurantId: restObj })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
