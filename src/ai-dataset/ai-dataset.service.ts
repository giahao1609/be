// src/ai-dataset/ai-dataset.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

import {
  BlogPost,
  BlogDocument,
} from 'src/blog/schema/blog.schema'; // chỉnh path nếu khác

import { UploadService } from 'src/upload/upload.service'; // chỉnh path nếu khác
import {
  Restaurant,
  RestaurantDocument,
} from 'src/restaurants/schema/restaurant.schema';
import { MenuItem, MenuItemDocument } from 'src/menu/schema/menu.schema';
import { Review, ReviewDocument } from 'src/review/schema/review.schema';
import { Category, CategoryDocument } from 'src/category/schema/category.schema';

@Injectable()
export class AiDatasetService {
  private readonly logger = new Logger(AiDatasetService.name);
  private readonly datasetPath: string;
  private readonly legalMetaPath: string;
  private readonly restaurantBaseUrl: string;
  private lastSnapshot: any | null = null;

  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(BlogPost.name)
    private readonly blogModel: Model<BlogDocument>,
    private readonly uploadService: UploadService,
  ) {
    this.datasetPath = path.join(process.cwd(), 'storage', 'ai-dataset.json');
    this.legalMetaPath = path.join(
      process.cwd(),
      'storage',
      'ai-legal-metadata.json',
    );

    // Base URL web của FoodMap, có thể override bằng env
    this.restaurantBaseUrl =
      process.env.FOODMAP_WEB_BASE_URL || 'https://www.food-map.online';
  }

  // ========= HELPERS: convert path -> full URL cho mọi ảnh =========

  private mapImageUrl(value?: string | null): string {
    if (!value) return '';
    return this.uploadService.toPublicUrl(value);
  }

  private mapImageArray(values?: string[] | null): string[] {
    if (!values || !Array.isArray(values)) return [];
    return values.map((v) => this.mapImageUrl(v)).filter(Boolean);
  }

  // ✅ Build link đúng route: /categories/restaurants/:id
  private buildRestaurantUrl(id: string): string {
    const base = this.restaurantBaseUrl.replace(/\/$/, ''); // bỏ / cuối nếu có
    return `${base}/categories/restaurants/${id}`;
  }

  // ========= HELPER: đọc file metadata (Điều khoản + Privacy + credits) =========

  private async loadLegalMetadata(): Promise<any | null> {
    try {
      const raw = await fs.promises.readFile(this.legalMetaPath, 'utf8');
      return JSON.parse(raw);
    } catch (err: any) {
      this.logger.warn(
        `Không đọc được file legal metadata (${this.legalMetaPath}): ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Merge core snapshot với legal metadata.
   * Kết quả sẽ được cache vào this.lastSnapshot.
   */
  private async buildFinalDataset(coreSnapshot: any): Promise<any> {
    const legalMeta = await this.loadLegalMetadata();

    const merged = {
      ...coreSnapshot,
      legalMeta: legalMeta ?? null,
    };

    this.lastSnapshot = merged;
    return merged;
  }

  // ========= CRON: rebuild định kỳ =========

  // mỗi 10 phút rebuild (0 */10 * * * *)
  @Cron('0 */10 * * * *')
  async rebuildDatasetCron() {
    try {
      this.logger.log('Rebuilding AI dataset (cron)...');
      await this.rebuildDataset();
      this.logger.log('Rebuild AI dataset DONE');
    } catch (err: any) {
      this.logger.error(
        `Rebuild AI dataset FAILED: ${err?.message}`,
        err?.stack,
      );
    }
  }

  // ========= CORE: rebuild snapshot =========

  async rebuildDataset(): Promise<any> {
    // 1. Load data từ Mongo
    const [restaurants, menuItems, reviews, categories, blogs] =
      await Promise.all([
        this.restaurantModel.find({ isActive: true }).lean().exec(),
        this.menuItemModel.find({ isAvailable: true }).lean().exec(),
        this.reviewModel.find({}).lean().exec(),
        this.categoryModel.find({ isActive: true }).lean().exec(),
        this.blogModel
          .find({ status: 'PUBLISHED' }) // chỉ bài public
          .lean()
          .exec(),
      ]);

    // 2. Group menuItems & reviews theo restaurantId
    const menuByRestaurant: Record<string, any[]> = {};
    for (const item of menuItems) {
      const rid = item.restaurantId?.toString();
      if (!rid) continue;
      if (!menuByRestaurant[rid]) menuByRestaurant[rid] = [];
      menuByRestaurant[rid].push(item);
    }

    const reviewsByRestaurant: Record<string, any[]> = {};
    for (const rv of reviews) {
      const rid = rv.restaurantId?.toString();
      if (!rid) continue;
      if (!reviewsByRestaurant[rid]) reviewsByRestaurant[rid] = [];
      reviewsByRestaurant[rid].push(rv);
    }

    // 3. Categories DTO (có image)
    const categoriesDto = categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description ?? '',
      image: this.mapImageUrl(c.image), // 🖼️
      parentId: c.parentId ? c.parentId.toString() : null,
      ancestors: (c.ancestors || []).map((a) => a.toString()),
      depth: c.depth ?? 0,
      path: c.path ?? '',
      sortIndex: c.sortIndex ?? 0,
    }));

    // 4. Restaurant DTO + menuItems + reviews
    const restaurantsDto = restaurants.map((r) => {
      const rid = r._id.toString();
      const menus = menuByRestaurant[rid] || [];
      const rvs = reviewsByRestaurant[rid] || [];

      const reviewCount = rvs.length;
      const avgRating =
        reviewCount > 0
          ? rvs.reduce((acc, x) => acc + (x.rating ?? 0), 0) / reviewCount
          : null;

      return {
        id: rid,
        ownerId: r.ownerId?.toString(),
        categoryId: r.categoryId ? r.categoryId.toString() : null,

        name: r.name,
        shortName: r.shortName ?? '',
        slug: r.slug ?? '',
        registrationNumber: r.registrationNumber ?? '',
        taxCode: r.taxCode ?? '',

        // ✅ Link chi tiết quán đúng route mới
        detailUrl: this.buildRestaurantUrl(rid),

        phone: r.phone ?? '',
        website: r.website ?? '',
        email: r.email ?? '',

        // 🖼️ convert path -> full URL
        logoUrl: this.mapImageUrl(r.logoUrl),
        coverImageUrl: this.mapImageUrl(r.coverImageUrl),
        gallery: this.mapImageArray(r.gallery),

        address: {
          street: r.address?.street ?? '',
          ward: r.address?.ward ?? '',
          district: r.address?.district ?? '',
          city: r.address?.city ?? '',
          country: r.address?.country ?? 'VN',
          formatted: r.address?.formatted ?? '',
        },

        location: (() => {
          const coords =
            r.location?.coordinates || r.address?.coordinates || undefined;
          if (!coords || coords.length < 2) return null;
          return {
            lng: coords[0],
            lat: coords[1],
          };
        })(),

        cuisine: r.cuisine ?? [],
        priceRange: r.priceRange ?? '',
        rating: typeof r.rating === 'number' ? r.rating : null,
        amenities: r.amenities ?? [],
        tags: r.tags ?? [],
        searchTerms: r.searchTerms ?? [],

        paymentConfig: r.paymentConfig
          ? {
              allowCash: r.paymentConfig.allowCash ?? true,
              allowBankTransfer: r.paymentConfig.allowBankTransfer ?? true,
              allowEWallet: r.paymentConfig.allowEWallet ?? true,
              bankTransfers: (r.paymentConfig.bankTransfers ?? []).map((b) => ({
                bankCode: b.bankCode ?? '',
                bankName: b.bankName ?? '',
                accountName: b.accountName ?? '',
                accountNumber: b.accountNumber ?? '',
                branch: b.branch ?? '',
                note: b.note ?? '',
                qr: b.qr
                  ? {
                      imageUrl: this.mapImageUrl(b.qr.imageUrl), // 🖼️
                      rawContent: b.qr.rawContent ?? '',
                      description: b.qr.description ?? '',
                    }
                  : null,
              })),
              eWallets: (r.paymentConfig.eWallets ?? []).map((w) => ({
                provider: w.provider ?? 'MOMO',
                displayName: w.displayName ?? '',
                phoneNumber: w.phoneNumber ?? '',
                accountId: w.accountId ?? '',
                note: w.note ?? '',
                qr: w.qr
                  ? {
                      imageUrl: this.mapImageUrl(w.qr.imageUrl), // 🖼️
                      rawContent: w.qr.rawContent ?? '',
                      description: w.qr.description ?? '',
                    }
                  : null,
              })),
              generalNote: r.paymentConfig.generalNote ?? '',
            }
          : null,

        // ===== MENU ITEMS (ảnh) =====
        menuItems: menus.map((m) => ({
          id: m._id.toString(),
          restaurantId: m.restaurantId?.toString(),
          categoryId: m.categoryId ? m.categoryId.toString() : null,

          name: m.name,
          slug: m.slug ?? '',
          description: m.description ?? '',

          images: this.mapImageArray(m.images), // 🖼️

          tags: m.tags ?? [],
          cuisines: m.cuisines ?? [],
          itemType: m.itemType ?? 'food',

          basePrice: m.basePrice
            ? {
                currency: m.basePrice.currency ?? 'VND',
                amount: m.basePrice.amount ?? 0,
              }
            : null,
          compareAtPrice: m.compareAtPrice
            ? {
                currency: m.compareAtPrice.currency ?? 'VND',
                amount: m.compareAtPrice.amount ?? 0,
              }
            : null,

          variants: (m.variants ?? []).map((v) => ({
            code: v.code ?? '',
            label: v.label ?? '',
            price: {
              currency: v.price?.currency ?? 'VND',
              amount: v.price?.amount ?? 0,
            },
            compareAtPrice: v.compareAtPrice
              ? {
                  currency: v.compareAtPrice.currency ?? 'VND',
                  amount: v.compareAtPrice.amount ?? 0,
                }
              : null,
            sku: v.sku ?? '',
            isAvailable: v.isAvailable ?? true,
            sortIndex: v.sortIndex ?? 0,
          })),

          optionGroups: (m.optionGroups ?? []).map((g) => ({
            name: g.name,
            minSelect: g.minSelect ?? 0,
            maxSelect: g.maxSelect ?? 1,
            required: g.required ?? false,
            options: (g.options ?? []).map((o) => ({
              name: o.name,
              priceDelta: {
                currency: o.priceDelta?.currency ?? 'VND',
                amount: o.priceDelta?.amount ?? 0,
              },
              isDefault: o.isDefault ?? false,
              tags: o.tags ?? [],
            })),
          })),

          promotions: (m.promotions ?? []).map((p) => ({
            type: p.type,
            value: p.value,
            minQty: p.minQty ?? 1,
            startAt: p.startAt ?? null,
            endAt: p.endAt ?? null,
            code: p.code ?? '',
            label: p.label ?? '',
          })),

          flags: {
            vegetarian: m.vegetarian ?? false,
            vegan: m.vegan ?? false,
            halal: m.halal ?? false,
            glutenFree: m.glutenFree ?? false,
            spicyLevel: m.spicyLevel ?? 0,
          },

          isAvailable: m.isAvailable ?? true,
          sortIndex: m.sortIndex ?? 0,
        })),

        // ===== REVIEWS (ảnh) =====
        reviews: rvs.map((rv) => ({
          id: rv._id.toString(),
          userId: rv.userId,
          rating: rv.rating ?? 0,
          content: rv.content,
          images: this.mapImageArray(rv.images), // 🖼️
          createdAt: rv.createdAt,
        })),

        reviewStats: {
          count: reviewCount,
          avgRating,
        },
      };
    });

    // 5. Blogs (ảnh)
    const blogsDto = blogs.map((b) => ({
      id: b._id.toString(),
      authorId: b.authorId?.toString(),
      title: b.title,
      subtitle: b.subtitle ?? '',
      slug: b.slug,
      excerpt: b.excerpt ?? '',
      contentHtml: b.contentHtml ?? '',
      contentJson: b.contentJson ?? null,
      tags: b.tags ?? [],
      categories: b.categories ?? [],
      heroImageUrl: this.mapImageUrl(b.heroImageUrl), // 🖼️
      gallery: this.mapImageArray(b.gallery), // 🖼️
      readingMinutes: b.readingMinutes ?? 3,
      status: b.status,
      publishedAt: b.publishedAt,
      keywords: b.keywords ?? [],
      searchTerms: b.searchTerms ?? [],
      viewCount: b.viewCount ?? 0,
      likeCount: b.likeCount ?? 0,
      isFeatured: b.isFeatured ?? false,
    }));

    const snapshot = {
      generatedAt: new Date().toISOString(),
      version: 1,
      restaurants: restaurantsDto,
      categories: categoriesDto,
      blogs: blogsDto,
    };

    // 6. Ghi file JSON core dataset
    await fs.promises.mkdir(path.dirname(this.datasetPath), {
      recursive: true,
    });
    await fs.promises.writeFile(
      this.datasetPath,
      JSON.stringify(snapshot, null, 2),
      'utf8',
    );

    // 7. Merge với legal metadata và cache
    return this.buildFinalDataset(snapshot);
  }

  // ========= API dùng =========

  async getCurrentDataset(): Promise<any> {
    // Nếu đã có cache merged (core + legalMeta) thì dùng luôn
    if (this.lastSnapshot) return this.lastSnapshot;

    try {
      // Đọc core dataset từ file
      const raw = await fs.promises.readFile(this.datasetPath, 'utf8');
      const coreSnapshot = JSON.parse(raw);

      // Gắn thêm legal metadata mỗi lần app khởi động lại
      return this.buildFinalDataset(coreSnapshot);
    } catch {
      // chưa có file -> build lần đầu (bên trong đã tự merge legalMeta)
      return this.rebuildDataset();
    }
  }
}
