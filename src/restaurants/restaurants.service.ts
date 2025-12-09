import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PipelineStage, Types, UpdateQuery } from 'mongoose';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { Restaurant, RestaurantDocument } from './schema/restaurant.schema';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UploadService } from 'src/upload/upload.service';
import {
  OwnerRestaurantsQueryDto,
  QueryRestaurantsDetailDto,
  QueryRestaurantsDto,
} from './dto/query-restaurants.dto';
import { NearbyRestaurantsQueryDto, QueryRestaurantsHomeDto } from './dto/nearby-restaurants.dto';
import { UploadFiles } from './restaurants.controller';

type UploadFlags = {
  removeLogo?: boolean;
  removeCover?: boolean;
  galleryMode?: 'append' | 'replace' | 'remove';
  galleryRemovePaths?: string[];
  removeAllGallery?: boolean;
};
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly uploadService: UploadService,
  ) { }

  private slugify(s: string) {
    return s
      ?.toLowerCase()
      ?.normalize('NFD')
      ?.replace(/[\u0300-\u036f]/g, '')
      ?.replace(/[^a-z0-9]+/g, '-')
      ?.replace(/(^-|-$)+/g, '');
  }

  private uniqStrings(arr?: string[]) {
    return Array.from(
      new Set((arr ?? []).map((s) => s.trim()).filter(Boolean)),
    );
  }

  private tryParse(v: any) {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  }

  private normalizeCreateDto(dto: CreateRestaurantDto) {
    const data: any = dto ? { ...dto } : {};

    // parse các field có thể là JSON string
    data.address = this.tryParse(data.address);
    data.location = this.tryParse(data.location);
    data.openingHours = this.tryParse(data.openingHours);
    data.cuisine = this.tryParse(data.cuisine);
    data.amenities = this.tryParse(data.amenities);
    data.gallery = this.tryParse(data.gallery);
    data.keywords = this.tryParse(data.keywords);
    data.tags = this.tryParse(data.tags);
    data.searchTerms = this.tryParse(data.searchTerms);
    data.extra = this.tryParse(data.extra);

    // country -> upper-case
    if (data.address?.country) {
      data.address.country = String(data.address.country).toUpperCase();
    }

    // coordinates -> number array
    if (Array.isArray(data.address?.coordinates)) {
      data.address.coordinates = data.address.coordinates
        .map((x: any) => (typeof x === 'string' ? Number(x) : x))
        .filter((x: any) => Number.isFinite(x));
    }
    if (Array.isArray(data.location?.coordinates)) {
      data.location.coordinates = data.location.coordinates
        .map((x: any) => (typeof x === 'string' ? Number(x) : x))
        .filter((x: any) => Number.isFinite(x));
    }

    // openingHours: chuẩn hoá cấu trúc
    if (Array.isArray(data.openingHours)) {
      data.openingHours = data.openingHours.map((raw: any) => {
        const day =
          typeof raw?.day === 'string' && raw.day.trim().length
            ? raw.day.trim()
            : undefined;

        const rawPeriods = Array.isArray(raw?.periods) ? raw.periods : [];

        const periods = rawPeriods
          .map((p: any) => ({
            opens: p.opens ?? p.open ?? '',
            closes: p.closes ?? p.close ?? '',
          }))
          .filter((p) => p.opens && p.closes);

        return {
          day,
          periods,
          closed: !!raw.closed,
          is24h: !!raw.is24h,
        };
      });
    } else {
      data.openingHours = [];
    }

    // các list string: cuisine, amenities, gallery, keywords, tags, searchTerms
    const normalizeStrArray = (v: any): string[] => {
      if (Array.isArray(v)) return this.uniqStrings(v.map(String));
      return [];
    };

    data.cuisine = normalizeStrArray(data.cuisine);
    data.amenities = normalizeStrArray(data.amenities);
    data.gallery = normalizeStrArray(data.gallery);
    data.keywords = normalizeStrArray(data.keywords);
    data.tags = normalizeStrArray(data.tags);
    data.searchTerms = normalizeStrArray(data.searchTerms);

    return data;
  }

  private async ensureUniqueSlug(slug: string) {
    let final = slug;
    let i = 1;
    while (await this.restaurantModel.exists({ slug: final })) {
      final = `${slug}-${i++}`;
    }
    return final;
  }

  private buildSearchTerms(data: any) {
    const list = [
      data.name,
      data.shortName,
      ...(data.keywords ?? []),
      ...(data.tags ?? []),
      data.address?.street,
      data.address?.ward,
      data.address?.district,
      data.address?.city,
    ]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());
    return this.uniqStrings(list);
  }

  private async handleUploadsForRestaurant(
    slug: string,
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const results: {
      logoPath?: string;
      coverPath?: string;
      galleryPaths: string[];
    } = { galleryPaths: [] };

    if (!files) return results;

    if (files.logo?.length) {
      const [{ buffer, mimetype, originalname }] = files.logo;
      const r = await this.uploadService.uploadMultipleToGCS(
        [
          {
            buffer,
            mimetype,
            originalname,
            fieldname: 'logo',
            size: buffer.length,
          } as Express.Multer.File,
        ],
        `restaurants/${slug}/logo`,
      );
      results.logoPath = r.paths?.[0];
    }

    if (files.cover?.length) {
      const [{ buffer, mimetype, originalname }] = files.cover;
      const r = await this.uploadService.uploadMultipleToGCS(
        [
          {
            buffer,
            mimetype,
            originalname,
            fieldname: 'cover',
            size: buffer.length,
          } as Express.Multer.File,
        ],
        `restaurants/${slug}/cover`,
      );
      results.coverPath = r.paths?.[0];
    }

    if (files.gallery?.length) {
      const r = await this.uploadService.uploadMultipleToGCS(
        files.gallery,
        `restaurants/${slug}/gallery`,
      );
      results.galleryPaths = r.paths ?? [];
    }

    return results;
  }

  // private async expandSignedUrls(restaurant: any) {
  //   const out = { ...restaurant };

  //   const signed = async (p?: string | null) =>
  //     p ? (await this.uploadService.getSignedUrl(p)).url : null;

  //   out.logoUrlSigned = await signed(restaurant.logoUrl);
  //   out.coverImageUrlSigned = await signed(restaurant.coverImageUrl);

  //   if (Array.isArray(restaurant.gallery) && restaurant.gallery.length) {
  //     out.gallerySigned = await Promise.all(
  //       restaurant.gallery.map(async (p: string) => ({
  //         path: p,
  //         url: await signed(p),
  //       })),
  //     );
  //   } else {
  //     out.gallerySigned = [];
  //   }

  //   return out;
  // }

  private async expandSignedUrls(restaurant: any) {
    if (!restaurant) return restaurant;

    const r = { ...restaurant };

    // ==== logo / cover / gallery như cũ ====
    if (r.logoUrl) {
      r.logoUrl = await this.uploadService.getSignedUrl(r.logoUrl);
    } else {
      r.logoUrl = null;
    }

    if (r.coverImageUrl) {
      r.coverImageUrl = await this.uploadService.getSignedUrl(r.coverImageUrl);
    } else {
      r.coverImageUrl = null;
    }

    if (Array.isArray(r.gallery)) {
      r.gallery = await Promise.all(
        r.gallery.map((p: string) => this.uploadService.getSignedUrl(p)),
      );
    } else {
      r.gallery = [];
    }

    // ==== BANK TRANSFER QR ====
    if (r.paymentConfig?.bankTransfers?.length) {
      r.paymentConfig = { ...r.paymentConfig };
      r.paymentConfig.bankTransfers = await Promise.all(
        r.paymentConfig.bankTransfers.map(async (b: any) => {
          const bank = { ...b };

          if (bank.qr?.imageUrl) {
            bank.qr = {
              ...bank.qr,
              imageUrl: await this.uploadService.getSignedUrl(
                bank.qr.imageUrl,
              ),
            };
          }

          return bank;
        }),
      );
    }

    // ==== EWALLET QR ====
    if (r.paymentConfig?.eWallets?.length) {
      r.paymentConfig = { ...(r.paymentConfig ?? {}) };
      r.paymentConfig.eWallets = await Promise.all(
        r.paymentConfig.eWallets.map(async (w: any) => {
          const wallet = { ...w };

          if (wallet.qr?.imageUrl) {
            wallet.qr = {
              ...wallet.qr,
              imageUrl: await this.uploadService.getSignedUrl(
                wallet.qr.imageUrl,
              ),
            };
          }

          return wallet;
        }),
      );
    }

    return r;
  }


  private normalizePaymentConfigRaw(raw: any) {
    if (!raw) return {};

    let cfg = raw;
    if (typeof raw === 'string') {
      try {
        cfg = JSON.parse(raw);
      } catch {
        cfg = {};
      }
    }

    const result: any = {
      allowCash:
        typeof cfg.allowCash === 'boolean' ? cfg.allowCash : !!cfg.allowCash,
      allowCard:
        typeof cfg.allowCard === 'boolean' ? cfg.allowCard : !!cfg.allowCard,
      bankTransfers: Array.isArray(cfg.bankTransfers)
        ? cfg.bankTransfers.map((b: any) => ({
          bankName: b?.bankName?.toString().trim() || undefined,
          accountName: b?.accountName?.toString().trim() || undefined,
          accountNumber: b?.accountNumber?.toString().trim() || undefined,
          branch: b?.branch?.toString().trim() || undefined,
          qrImagePath: b?.qrImagePath?.toString().trim() || undefined,
        }))
        : [],
      ewallets: Array.isArray(cfg.ewallets)
        ? cfg.ewallets.map((w: any) => ({
          provider: w?.provider?.toString().trim() || undefined,
          accountName: w?.accountName?.toString().trim() || undefined,
          phone: w?.phone?.toString().trim() || undefined,
          qrImagePath: w?.qrImagePath?.toString().trim() || undefined,
        }))
        : [],
    };

    return result;
  }

  /**
   * Gán QR upload cho bankTransfers / ewallets theo index.
   * - Nếu đã có phần tử -> override qrImagePath
   * - Nếu chưa có -> push object mới chỉ có qrImagePath
   */
  private async attachPaymentQrUploads(
    slug: string,
    paymentConfig: any | undefined,
    files?: UploadFiles,
  ): Promise<any | undefined> {
    if (!files) return paymentConfig;

    // Chuẩn hoá paymentConfig về đúng shape
    const config: any = {
      ...(paymentConfig ?? {}),
      bankTransfers: paymentConfig?.bankTransfers?.map((b) => ({
        ...b,
        qr: b.qr ?? {},
      })) ?? [],
      eWallets: paymentConfig?.eWallets?.map((w) => ({
        ...w,
        qr: w.qr ?? {},
      })) ?? [],
    };

    // ===== BANK QRs =====
    if (files.bankQrs?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.bankQrs,
        `restaurants/${slug}/payment/bank`,
      );

      const paths = up.paths ?? [];

      paths.forEach((path, idx) => {
        // nếu đã có bankTransfers[idx] thì gắn qr.imageUrl vào
        if (config.bankTransfers[idx]) {
          config.bankTransfers[idx].qr = {
            ...(config.bankTransfers[idx].qr ?? {}),
            imageUrl: path,
          };
        } else {
          // nếu FE chỉ upload QR mà chưa gửi thông tin bank, vẫn lưu được
          config.bankTransfers.push({
            bankCode: undefined,
            bankName: undefined,
            accountName: undefined,
            accountNumber: undefined,
            branch: undefined,
            qr: { imageUrl: path },
          });
        }
      });
    }

    // ===== EWALLET QRs =====
    if (files.ewalletQrs?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.ewalletQrs,
        `restaurants/${slug}/payment/ewallet`,
      );

      const paths = up.paths ?? [];

      paths.forEach((path, idx) => {
        if (config.eWallets[idx]) {
          config.eWallets[idx].qr = {
            ...(config.eWallets[idx].qr ?? {}),
            imageUrl: path,
          };
        } else {
          config.eWallets.push({
            provider: 'MOMO',
            displayName: undefined,
            phoneNumber: undefined,
            accountId: undefined,
            note: undefined,
            qr: { imageUrl: path },
          });
        }
      });
    }

    return config;
  }


  // ===== CREATE =====
  // async createWithUploads(
  //   dto: CreateRestaurantDto,
  //   ownerId: string,
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  // ) {
  //   if (!ownerId) throw new BadRequestException('ownerId is required');

  //   const ownerObjectId =
  //     typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

  //   const data = this.normalizeCreateDto(dto);

  //   let slug = (data.slug ?? this.slugify(data.name)).toLowerCase().trim();
  //   slug = await this.ensureUniqueSlug(slug);

  //   // sync location từ address.coordinates nếu cần
  //   if (data.address?.coordinates && !data.location?.coordinates) {
  //     data.location = {
  //       ...(data.location ?? {}),
  //       type: 'Point',
  //       coordinates: data.address.coordinates,
  //     };
  //   }

  //   if (data.location?.type && data.location.type !== 'Point') {
  //     throw new BadRequestException('location.type must be "Point"');
  //   }
  //   if (data.address?.locationType && data.address.locationType !== 'Point') {
  //     throw new BadRequestException('address.locationType must be "Point"');
  //   }

  //   const uploads = await this.handleUploadsForRestaurant(slug, files);

  //   const searchTerms = this.buildSearchTerms(data);

  //   try {
  //     const created = await this.restaurantModel.create({
  //       ownerId: ownerObjectId,
  //       categoryId: data.categoryId
  //         ? new Types.ObjectId(data.categoryId)
  //         : undefined,

  //       name: data.name,
  //       shortName: data.shortName?.trim(),
  //       slug,

  //       registrationNumber: data.registrationNumber?.trim(),
  //       taxCode: data.taxCode?.trim(),

  //       phone: data.phone?.trim(),
  //       website: data.website?.trim(),
  //       email: data.email?.trim(),

  //       logoUrl: uploads.logoPath ?? data.logoUrl?.trim() ?? '',
  //       coverImageUrl: uploads.coverPath ?? data.coverImageUrl?.trim() ?? '',
  //       gallery: data.gallery,

  //       address: data.address,
  //       location: data.location ?? { type: 'Point', coordinates: undefined },

  //       cuisine: data.cuisine,
  //       priceRange: data.priceRange ?? '',
  //       rating: data.rating ?? null,
  //       amenities: data.amenities,

  //       openingHours: data.openingHours,

  //       metaTitle: data.metaTitle ?? '',
  //       metaDescription: data.metaDescription ?? '',
  //       keywords: data.keywords,
  //       tags: data.tags,
  //       searchTerms,

  //       extra: data.extra ?? {},
  //       isActive: data.isActive ?? true,
  //     });

  //     const lean = (await created.populate([])).toObject();
  //     return await this.expandSignedUrls(lean);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists');
  //     }
  //     throw err;
  //   }
  // }

  async createWithUploads(
    dto: CreateRestaurantDto,
    ownerId: string,
    files?: UploadFiles,
  ) {
    if (!ownerId) throw new BadRequestException('ownerId is required');

    const ownerObjectId =
      typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const existed = await this.restaurantModel.exists({
      ownerId: ownerObjectId,

    });
    if (existed) {
      throw new ConflictException('Owner already has a restaurant');
    }

    const data = this.normalizeCreateDto(dto);

    // parse + chuẩn hoá paymentConfig
    data.paymentConfig = this.normalizePaymentConfigRaw(data.paymentConfig);

    let slug = (data.slug ?? this.slugify(data.name)).toLowerCase().trim();
    slug = await this.ensureUniqueSlug(slug);

    // sync location từ address.coordinates nếu cần
    if (data.address?.coordinates && !data.location?.coordinates) {
      data.location = {
        ...(data.location ?? {}),
        type: 'Point',
        coordinates: data.address.coordinates,
      };
    }

    if (data.location?.type && data.location.type !== 'Point') {
      throw new BadRequestException('location.type must be "Point"');
    }
    if (data.address?.locationType && data.address.locationType !== 'Point') {
      throw new BadRequestException('address.locationType must be "Point"');
    }

    // upload logo / cover / gallery
    const uploads = await this.handleUploadsForRestaurant(slug, files);

    // upload & gắn QR payment vào paymentConfig.*
    data.paymentConfig = await this.attachPaymentQrUploads(
      slug,
      data.paymentConfig,
      files,
    );

    const searchTerms = this.buildSearchTerms(data);

    try {
      const created = await this.restaurantModel.create({
        ownerId: ownerObjectId,
        categoryId: data.categoryId
          ? new Types.ObjectId(data.categoryId)
          : undefined,

        name: data.name,
        shortName: data.shortName?.trim(),
        slug,

        registrationNumber: data.registrationNumber?.trim(),
        taxCode: data.taxCode?.trim(),

        phone: data.phone?.trim(),
        website: data.website?.trim(),
        email: data.email?.trim(),

        logoUrl: uploads.logoPath ?? data.logoUrl?.trim() ?? '',
        coverImageUrl: uploads.coverPath ?? data.coverImageUrl?.trim() ?? '',
        gallery: data.gallery,

        address: data.address,
        location: data.location ?? { type: 'Point', coordinates: undefined },

        cuisine: data.cuisine,
        priceRange: data.priceRange ?? '',
        rating: data.rating ?? null,
        amenities: data.amenities,

        openingHours: data.openingHours,

        metaTitle: data.metaTitle ?? '',
        metaDescription: data.metaDescription ?? '',
        keywords: data.keywords,
        tags: data.tags,
        searchTerms,

        paymentConfig: data.paymentConfig ?? {},
        extra: data.extra ?? {},
        isActive: data.isActive ?? true,
      });

      const lean = (await created.populate([])).toObject();
      return await this.expandSignedUrls(lean);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists');
      }
      throw err;
    }
  }

  private normalizeUpdateDto(dto: UpdateRestaurantDto & Record<string, any>) {
    const data: any = dto ? { ...dto } : {};

    // parse các field có thể là JSON string
    data.address = this.tryParse(data.address);
    data.location = this.tryParse(data.location);
    data.openingHours = this.tryParse(data.openingHours);
    data.cuisine = this.tryParse(data.cuisine);
    data.amenities = this.tryParse(data.amenities);
    data.gallery = this.tryParse(data.gallery);
    data.keywords = this.tryParse(data.keywords);
    data.tags = this.tryParse(data.tags);
    data.searchTerms = this.tryParse(data.searchTerms);
    data.extra = this.tryParse(data.extra);

    // country upper-case nếu có
    if (data.address?.country) {
      data.address.country = String(data.address.country).toUpperCase();
    }

    // coordinates -> number[]
    if (Array.isArray(data.address?.coordinates)) {
      data.address.coordinates = data.address.coordinates
        .map((x: any) => (typeof x === 'string' ? Number(x) : x))
        .filter((x: any) => Number.isFinite(x));
    }
    if (Array.isArray(data.location?.coordinates)) {
      data.location.coordinates = data.location.coordinates
        .map((x: any) => (typeof x === 'string' ? Number(x) : x))
        .filter((x: any) => Number.isFinite(x));
    }

    // openingHours: chuẩn hoá
    if (Array.isArray(data.openingHours)) {
      data.openingHours = data.openingHours.map((raw: any) => {
        const day =
          typeof raw?.day === 'string' && raw.day.trim().length
            ? raw.day.trim()
            : undefined;

        const rawPeriods = Array.isArray(raw?.periods) ? raw.periods : [];

        const periods = rawPeriods
          .map((p: any) => ({
            opens: p.opens ?? p.open ?? '',
            closes: p.closes ?? p.close ?? '',
          }))
          .filter((p) => p.opens && p.closes);

        return {
          day,
          periods,
          closed: !!raw.closed,
          is24h: !!raw.is24h,
        };
      });
    }

    // list string: cuisine, amenities, gallery, keywords, tags, searchTerms
    const normalizeStrArray = (v: any): string[] | undefined => {
      if (v === undefined) return undefined; // không đụng tới field này
      if (Array.isArray(v)) {
        return this.uniqStrings(v.map(String));
      }
      return [];
    };

    const normalizeOpt = (value: any) =>
      value === undefined ? undefined : value;

    data.cuisine = normalizeOpt(normalizeStrArray(data.cuisine));
    data.amenities = normalizeOpt(normalizeStrArray(data.amenities));
    data.gallery = normalizeOpt(normalizeStrArray(data.gallery));
    data.keywords = normalizeOpt(normalizeStrArray(data.keywords));
    data.tags = normalizeOpt(normalizeStrArray(data.tags));
    data.searchTerms = normalizeOpt(normalizeStrArray(data.searchTerms));

    return data;
  }

  private async ensureUniqueSlugOnUpdate(id: string, nextSlug: string) {
    const existed = await this.restaurantModel.findOne(
      { slug: nextSlug },
      { _id: 1 },
    );
    if (existed && String(existed._id) !== String(id)) {
      // thêm hậu tố
      let i = 1;
      let candidate = nextSlug;
      while (
        await this.restaurantModel.exists({
          slug: candidate,
          _id: { $ne: new Types.ObjectId(id) },
        })
      ) {
        candidate = `${nextSlug}-${i++}`;
      }
      return candidate;
    }
    return nextSlug;
  }

  // private async updateOneWithUploads(
  //   filter: FilterQuery<RestaurantDocument>,
  //   dto: UpdateRestaurantDto & Record<string, any>,
  //   requesterId?: string,
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  //   flags?: UploadFlags,
  // ) {
  //   const current = await this.restaurantModel.findOne(filter).lean();
  //   if (!current) throw new NotFoundException('Restaurant not found');

  //   // parse JSON, chuẩn hoá arrays, openingHours,...
  //   const data = this.normalizeUpdateDto(dto);

  //   const update: UpdateQuery<RestaurantDocument> = { $set: {} as any };
  //   const $unset: Record<string, ''> = {};

  //   // ===== slug =====
  //   if (data.slug) {
  //     const baseSlug = this.slugify(String(data.slug));
  //     const nextSlug = await this.ensureUniqueSlugOnUpdate(
  //       String(current._id),
  //       baseSlug,
  //     );
  //     (update.$set as any).slug = nextSlug;
  //   }

  //   // ===== simple fields (set trực tiếp nếu client truyền) =====
  //   const simpleFields: Array<keyof UpdateRestaurantDto> = [
  //     'name',
  //     'shortName',
  //     'registrationNumber',
  //     'taxCode',
  //     'phone',
  //     'website',
  //     'email',
  //     'cuisine',
  //     'priceRange',
  //     'rating',
  //     'amenities',
  //     'openingHours',
  //     'metaTitle',
  //     'metaDescription',
  //     'keywords',
  //     'tags',
  //     'searchTerms',
  //     'extra',
  //     'isActive',
  //   ];

  //   for (const f of simpleFields) {
  //     if (Object.prototype.hasOwnProperty.call(data, f)) {
  //       (update.$set as any)[f] = (data as any)[f];
  //     }
  //   }

  //   // ===== address & location =====
  //   if (data.location?.type && data.location.type !== 'Point') {
  //     throw new BadRequestException('location.type must be "Point"');
  //   }
  //   if (data.address?.locationType && data.address.locationType !== 'Point') {
  //     throw new BadRequestException('address.locationType must be "Point"');
  //   }

  //   // Tính nextAddress / nextLocation từ current + data
  //   const hasAddressInDto = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'address',
  //   );
  //   const hasLocationInDto = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'location',
  //   );

  //   const nextAddress = hasAddressInDto ? data.address : current.address;
  //   let nextLocation = hasLocationInDto ? data.location : current.location;

  //   const addrCoords = nextAddress?.coordinates;
  //   const locCoords = nextLocation?.coordinates;

  //   if (Array.isArray(addrCoords) && addrCoords.length >= 2) {
  //     if (!locCoords || !locCoords.length) {
  //       nextLocation = {
  //         ...(nextLocation ?? {}),
  //         type: 'Point',
  //         coordinates: addrCoords,
  //       };
  //     }
  //   }

  //   if (hasAddressInDto) {
  //     (update.$set as any).address = nextAddress;
  //   }
  //   if (hasLocationInDto || nextLocation !== current.location) {
  //     (update.$set as any).location = nextLocation;
  //   }

  //   // ===== flags gallery/logo/cover =====
  //   const flagsSafe: UploadFlags = {
  //     removeLogo: !!flags?.removeLogo,
  //     removeCover: !!flags?.removeCover,
  //     galleryMode: flags?.galleryMode ?? 'append',
  //     galleryRemovePaths: Array.isArray(flags?.galleryRemovePaths)
  //       ? flags.galleryRemovePaths
  //       : [],
  //     removeAllGallery: !!flags?.removeAllGallery,
  //   };

  //   // --- logo ---
  //   if (files?.logo?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.logo,
  //       `restaurants/${current.slug}/logo`,
  //     );
  //     (update.$set as any).logoUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeLogo) {
  //     $unset['logoUrl'] = '';
  //   } else if (Object.prototype.hasOwnProperty.call(data, 'logoUrl')) {
  //     (update.$set as any).logoUrl = data.logoUrl ?? '';
  //   }

  //   // --- cover ---
  //   if (files?.cover?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.cover,
  //       `restaurants/${current.slug}/cover`,
  //     );
  //     (update.$set as any).coverImageUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeCover) {
  //     $unset['coverImageUrl'] = '';
  //   } else if (Object.prototype.hasOwnProperty.call(data, 'coverImageUrl')) {
  //     (update.$set as any).coverImageUrl = data.coverImageUrl ?? '';
  //   }

  //   // --- gallery ---
  //   const currentGallery: string[] = Array.isArray(current.gallery)
  //     ? current.gallery
  //     : [];
  //   let nextGallery = [...currentGallery];

  //   // remove / removeAll
  //   if (flagsSafe.galleryMode === 'remove' || flagsSafe.removeAllGallery) {
  //     if (flagsSafe.removeAllGallery) nextGallery = [];
  //     else if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   // replace
  //   if (flagsSafe.galleryMode === 'replace') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${current.slug}/gallery`,
  //       );
  //       nextGallery = up.paths ?? [];
  //     } else if (Array.isArray(data.gallery)) {
  //       nextGallery = this.uniqStrings(data.gallery);
  //     }
  //   }

  //   // append
  //   if (flagsSafe.galleryMode === 'append') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${current.slug}/gallery`,
  //       );
  //       nextGallery = this.uniqStrings([...nextGallery, ...(up.paths ?? [])]);
  //     }
  //     if (Array.isArray(data.gallery)) {
  //       nextGallery = this.uniqStrings([...nextGallery, ...data.gallery]);
  //     }
  //     if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   const galleryChanged =
  //     nextGallery.length !== currentGallery.length ||
  //     nextGallery.some((p, i) => p !== currentGallery[i]);

  //   if (galleryChanged) {
  //     (update.$set as any).gallery = nextGallery;
  //   }

  //   // ===== searchTerms auto nếu client không truyền =====
  //   const searchTermsProvided = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'searchTerms',
  //   );

  //   if (!searchTermsProvided) {
  //     const temp = {
  //       name:
  //         (update.$set as any).name !== undefined
  //           ? (update.$set as any).name
  //           : current.name,
  //       shortName:
  //         (update.$set as any).shortName !== undefined
  //           ? (update.$set as any).shortName
  //           : current.shortName,
  //       keywords:
  //         (update.$set as any).keywords !== undefined
  //           ? (update.$set as any).keywords
  //           : current.keywords,
  //       tags:
  //         (update.$set as any).tags !== undefined
  //           ? (update.$set as any).tags
  //           : current.tags,
  //       address: hasAddressInDto ? nextAddress : current.address,
  //     };
  //     (update.$set as any).searchTerms = this.buildSearchTerms(temp);
  //   }

  //   // ===== meta =====
  //   (update.$set as any).updatedAt = new Date();
  //   if (requesterId) {
  //     (update.$set as any)['extra.updatedBy'] = requesterId;
  //     (update.$set as any)['extra.updatedReason'] = 'owner_update';
  //   }
  //   if (Object.keys($unset).length > 0) (update as any).$unset = $unset;

  //   try {
  //     const updated = await this.restaurantModel
  //       .findOneAndUpdate(filter, update, { new: true, lean: true })
  //       .exec();
  //     if (!updated) throw new NotFoundException('Restaurant not found');

  //     return await this.expandSignedUrls(updated);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists');
  //     }
  //     throw err;
  //   }
  // }

  // private async updateOneWithUploads(
  //   filter: FilterQuery<RestaurantDocument>,
  //   dto: UpdateRestaurantDto,
  //   requesterId?: string,
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  //   flags?: UploadFlags,
  // ) {
  //   const current = await this.restaurantModel.findOne(filter).lean();
  //   if (!current) throw new NotFoundException('Restaurant not found');

  //   const update: UpdateQuery<RestaurantDocument> = { $set: {} as any };
  //   const $unset: Record<string, ''> = {};

  //   // ===== Normalize & validations =====
  //   if (dto.slug) dto.slug = dto.slug.trim().toLowerCase();
  //   if (dto.address?.country)
  //     dto.address.country = dto.address.country.trim().toUpperCase();
  //   if (dto.location?.type && dto.location.type !== 'Point') {
  //     throw new BadRequestException('location.type must be "Point"');
  //   }
  //   if (dto.address?.locationType && dto.address.locationType !== 'Point') {
  //     throw new BadRequestException('address.locationType must be "Point"');
  //   }

  //   // Nếu sửa slug → bảo đảm unique (so với doc khác)
  //   let nextSlug = current.slug;
  //   if (dto.slug && dto.slug !== current.slug) {
  //     const base = this.slugify(dto.slug);
  //     nextSlug = await this.ensureUniqueSlugOnUpdate(String(current._id), base);
  //     (update.$set as any).slug = nextSlug;
  //   } else {
  //     nextSlug = current.slug;
  //   }

  //   // ===== Simple fields copy =====
  //   const simpleFields: (keyof UpdateRestaurantDto)[] = [
  //     'name',
  //     'shortName',
  //     'registrationNumber',
  //     'taxCode',
  //     'phone',
  //     'website',
  //     'email',
  //     'cuisine',
  //     'priceRange',
  //     'rating',
  //     'amenities',
  //     'openingHours',
  //     'metaTitle',
  //     'metaDescription',
  //     'keywords',
  //     'tags',
  //     'searchTerms',
  //     'extra',
  //     'isActive',
  //     // CHÚ Ý: logoUrl/coverImageUrl/gallery sẽ set theo logic file/flags ở dưới
  //   ];
  //   for (const f of simpleFields) {
  //     if (f in dto) (update.$set as any)[f] = (dto as any)[f];
  //   }

  //   // ===== Address & Location patch =====
  //   if (dto.address) {
  //     for (const k of Object.keys(dto.address)) {
  //       const v = (dto.address as any)[k];
  //       if (v === null) $unset[`address.${k}`] = '';
  //       else if (v !== undefined) (update.$set as any)[`address.${k}`] = v;
  //     }
  //   }
  //   if (dto.location) {
  //     for (const k of Object.keys(dto.location)) {
  //       const v = (dto.location as any)[k];
  //       if (v === null) $unset[`location.${k}`] = '';
  //       else if (v !== undefined) (update.$set as any)[`location.${k}`] = v;
  //     }
  //   }

  //   // Sync location from address.coordinates if location.coordinates not provided
  //   const addressCoord = dto.address?.coordinates;
  //   const locationCoord = dto.location?.coordinates;
  //   if (addressCoord && !locationCoord) {
  //     (update.$set as any)['location.type'] = 'Point';
  //     (update.$set as any)['location.coordinates'] = addressCoord;
  //   }

  //   // ===== Files upload & field decisions =====
  //   const flagsSafe: UploadFlags = {
  //     removeLogo: !!flags?.removeLogo,
  //     removeCover: !!flags?.removeCover,
  //     galleryMode: flags?.galleryMode ?? 'append',
  //     galleryRemovePaths: Array.isArray(flags?.galleryRemovePaths)
  //       ? flags!.galleryRemovePaths!
  //       : [],
  //     removeAllGallery: !!flags?.removeAllGallery,
  //   };

  //   // Upload logo
  //   if (files?.logo?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.logo,
  //       `restaurants/${nextSlug}/logo`,
  //     );
  //     (update.$set as any).logoUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeLogo) {
  //     $unset['logoUrl'] = '';
  //   } else if ('logoUrl' in dto) {
  //     // nếu client cố tình set tay (đường dẫn object name có sẵn)
  //     (update.$set as any).logoUrl = (dto as any).logoUrl ?? '';
  //   }

  //   // Upload cover
  //   if (files?.cover?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.cover,
  //       `restaurants/${nextSlug}/cover`,
  //     );
  //     (update.$set as any).coverImageUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeCover) {
  //     $unset['coverImageUrl'] = '';
  //   } else if ('coverImageUrl' in dto) {
  //     (update.$set as any).coverImageUrl = (dto as any).coverImageUrl ?? '';
  //   }

  //   // Gallery
  //   const currentGallery: string[] = Array.isArray(current.gallery)
  //     ? current.gallery
  //     : [];

  //   let nextGallery = [...currentGallery];

  //   // Xoá một phần / toàn bộ
  //   if (flagsSafe.galleryMode === 'remove' || flagsSafe.removeAllGallery) {
  //     if (flagsSafe.removeAllGallery) nextGallery = [];
  //     else if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   // Thay thế toàn bộ bằng files.gallery
  //   if (flagsSafe.galleryMode === 'replace') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${nextSlug}/gallery`,
  //       );
  //       nextGallery = up.paths ?? [];
  //     } else if ('gallery' in dto && Array.isArray((dto as any).gallery)) {
  //       nextGallery = (dto as any).gallery;
  //     } else {
  //       // replace nhưng không đưa gì mới → giữ nguyên hoặc rỗng tuỳ ý, ở đây giữ nguyên
  //     }
  //   }

  //   // Append files.gallery
  //   if (flagsSafe.galleryMode === 'append') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${nextSlug}/gallery`,
  //       );
  //       nextGallery = this.uniqStrings([...nextGallery, ...(up.paths ?? [])]);
  //     }
  //     // nếu client muốn append danh sách có sẵn
  //     if (Array.isArray((dto as any).gallery)) {
  //       nextGallery = this.uniqStrings([
  //         ...nextGallery,
  //         ...((dto as any).gallery as string[]),
  //       ]);
  //     }
  //     // nếu có danh sách cần remove kèm theo khi append
  //     if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   // Nếu gallery thay đổi so với hiện tại → set
  //   const galleryChanged =
  //     nextGallery.length !== currentGallery.length ||
  //     nextGallery.some((p, i) => p !== currentGallery[i]);

  //   if (galleryChanged) {
  //     (update.$set as any).gallery = nextGallery;
  //   }

  //   // ===== searchTerms auto nếu client không truyền nhưng có name/keywords/tags đổi =====
  //   const wantAutoSearchTerms =
  //     !('searchTerms' in dto) &&
  //     (('name' in dto && dto.name) ||
  //       ('shortName' in dto && dto.shortName) ||
  //       ('keywords' in dto && dto.keywords) ||
  //       ('tags' in dto && dto.tags) ||
  //       ('address' in dto && dto.address));

  //   if (wantAutoSearchTerms) {
  //     const temp = {
  //       name: (update.$set as any).name ?? current.name,
  //       shortName: (update.$set as any).shortName ?? current.shortName,
  //       keywords: (update.$set as any).keywords ?? current.keywords,
  //       tags: (update.$set as any).tags ?? current.tags,
  //       address: {
  //         ...(current.address ?? {}),
  //         ...((update.$set as any).address ?? {}),
  //       },
  //     };
  //     (update.$set as any).searchTerms = this.buildSearchTerms(temp);
  //   }

  //   // ===== Metadata update =====
  //   (update.$set as any).updatedAt = new Date();
  //   if (requesterId) {
  //     (update.$set as any)['extra.updatedBy'] = requesterId;
  //     (update.$set as any)['extra.updatedReason'] = 'owner_update';
  //   }
  //   if (Object.keys($unset).length > 0) (update as any).$unset = $unset;

  //   // ===== Persist =====
  //   try {
  //     const updated = await this.restaurantModel
  //       .findOneAndUpdate(filter, update, { new: true, lean: true })
  //       .exec();
  //     if (!updated) throw new NotFoundException('Restaurant not found');

  //     // Trả kèm signed URLs
  //     return await this.expandSignedUrls(updated);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists');
  //     }
  //     throw err;
  //   }
  // }

  // async updateByIdWithUploads(
  //   id: string,
  //   dto: UpdateRestaurantDto & Record<string, any>,
  //   requesterId?: string,
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  //   flags?: UploadFlags,
  // ) {
  //   return this.updateOneWithUploads(
  //     { _id: new Types.ObjectId(id) },
  //     dto,
  //     requesterId,
  //     files,
  //     flags,
  //   );
  // }

  // private async updateOneWithUploads(
  //   filter: FilterQuery<RestaurantDocument>,
  //   dto: UpdateRestaurantDto & Record<string, any>,
  //   requesterId?: string,
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  //   flags?: UploadFlags,
  // ) {
  //   const current = await this.restaurantModel.findOne(filter).lean();
  //   if (!current) throw new NotFoundException('Restaurant not found');

  //   // parse JSON, chuẩn hoá arrays, openingHours,...
  //   const data = this.normalizeUpdateDto(dto);

  //   const update: UpdateQuery<RestaurantDocument> = { $set: {} as any };
  //   const $unset: Record<string, ''> = {};

  //   // ===== slug =====
  //   if (data.slug) {
  //     const baseSlug = this.slugify(String(data.slug));
  //     const nextSlug = await this.ensureUniqueSlugOnUpdate(
  //       String(current._id),
  //       baseSlug,
  //     );
  //     (update.$set as any).slug = nextSlug;
  //   }

  //   // ===== simple fields (set trực tiếp nếu client truyền) =====
  //   const simpleFields: Array<keyof UpdateRestaurantDto> = [
  //     'name',
  //     'shortName',
  //     'registrationNumber',
  //     'taxCode',
  //     'phone',
  //     'website',
  //     'email',
  //     'cuisine',
  //     'priceRange',
  //     'rating',
  //     'amenities',
  //     'openingHours',
  //     'metaTitle',
  //     'metaDescription',
  //     'keywords',
  //     'tags',
  //     'searchTerms',
  //     'extra',
  //     'isActive',
  //   ];

  //   for (const f of simpleFields) {
  //     if (Object.prototype.hasOwnProperty.call(data, f)) {
  //       (update.$set as any)[f] = (data as any)[f];
  //     }
  //   }

  //   // ===== address & location =====
  //   if (data.location?.type && data.location.type !== 'Point') {
  //     throw new BadRequestException('location.type must be "Point"');
  //   }
  //   if (data.address?.locationType && data.address.locationType !== 'Point') {
  //     throw new BadRequestException('address.locationType must be "Point"');
  //   }

  //   // Tính nextAddress / nextLocation từ current + data
  //   const hasAddressInDto = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'address',
  //   );
  //   const hasLocationInDto = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'location',
  //   );

  //   const nextAddress = hasAddressInDto ? data.address : current.address;
  //   let nextLocation = hasLocationInDto ? data.location : current.location;

  //   const addrCoords = nextAddress?.coordinates;
  //   const locCoords = nextLocation?.coordinates;

  //   if (Array.isArray(addrCoords) && addrCoords.length >= 2) {
  //     if (!locCoords || !locCoords.length) {
  //       nextLocation = {
  //         ...(nextLocation ?? {}),
  //         type: 'Point',
  //         coordinates: addrCoords,
  //       };
  //     }
  //   }

  //   if (hasAddressInDto) {
  //     (update.$set as any).address = nextAddress;
  //   }
  //   if (hasLocationInDto || nextLocation !== current.location) {
  //     (update.$set as any).location = nextLocation;
  //   }

  //   // ===== flags gallery/logo/cover =====
  //   const flagsSafe: UploadFlags = {
  //     removeLogo: !!flags?.removeLogo,
  //     removeCover: !!flags?.removeCover,
  //     galleryMode: flags?.galleryMode ?? 'append',
  //     galleryRemovePaths: Array.isArray(flags?.galleryRemovePaths)
  //       ? flags.galleryRemovePaths
  //       : [],
  //     removeAllGallery: !!flags?.removeAllGallery,
  //   };

  //   // --- logo ---
  //   if (files?.logo?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.logo,
  //       `restaurants/${current.slug}/logo`,
  //     );
  //     (update.$set as any).logoUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeLogo) {
  //     $unset['logoUrl'] = '';
  //   } else if (Object.prototype.hasOwnProperty.call(data, 'logoUrl')) {
  //     (update.$set as any).logoUrl = data.logoUrl ?? '';
  //   }

  //   // --- cover ---
  //   if (files?.cover?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       files.cover,
  //       `restaurants/${current.slug}/cover`,
  //     );
  //     (update.$set as any).coverImageUrl = up.paths?.[0] ?? '';
  //   } else if (flagsSafe.removeCover) {
  //     $unset['coverImageUrl'] = '';
  //   } else if (Object.prototype.hasOwnProperty.call(data, 'coverImageUrl')) {
  //     (update.$set as any).coverImageUrl = data.coverImageUrl ?? '';
  //   }

  //   // --- gallery ---
  //   const currentGallery: string[] = Array.isArray(current.gallery)
  //     ? current.gallery
  //     : [];
  //   let nextGallery = [...currentGallery];

  //   // remove / removeAll
  //   if (flagsSafe.galleryMode === 'remove' || flagsSafe.removeAllGallery) {
  //     if (flagsSafe.removeAllGallery) nextGallery = [];
  //     else if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   // replace
  //   if (flagsSafe.galleryMode === 'replace') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${current.slug}/gallery`,
  //       );
  //       nextGallery = up.paths ?? [];
  //     } else if (Array.isArray(data.gallery)) {
  //       nextGallery = this.uniqStrings(data.gallery);
  //     }
  //   }

  //   // append
  //   if (flagsSafe.galleryMode === 'append') {
  //     if (files?.gallery?.length) {
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         files.gallery,
  //         `restaurants/${current.slug}/gallery`,
  //       );
  //       nextGallery = this.uniqStrings([...nextGallery, ...(up.paths ?? [])]);
  //     }
  //     if (Array.isArray(data.gallery)) {
  //       nextGallery = this.uniqStrings([...nextGallery, ...data.gallery]);
  //     }
  //     if (flagsSafe.galleryRemovePaths?.length) {
  //       const removeSet = new Set(flagsSafe.galleryRemovePaths);
  //       nextGallery = nextGallery.filter((p) => !removeSet.has(p));
  //     }
  //   }

  //   const galleryChanged =
  //     nextGallery.length !== currentGallery.length ||
  //     nextGallery.some((p, i) => p !== currentGallery[i]);

  //   if (galleryChanged) {
  //     (update.$set as any).gallery = nextGallery;
  //   }

  //   // ===== searchTerms auto nếu client không truyền =====
  //   const searchTermsProvided = Object.prototype.hasOwnProperty.call(
  //     data,
  //     'searchTerms',
  //   );

  //   if (!searchTermsProvided) {
  //     const temp = {
  //       name:
  //         (update.$set as any).name !== undefined
  //           ? (update.$set as any).name
  //           : current.name,
  //       shortName:
  //         (update.$set as any).shortName !== undefined
  //           ? (update.$set as any).shortName
  //           : current.shortName,
  //       keywords:
  //         (update.$set as any).keywords !== undefined
  //           ? (update.$set as any).keywords
  //           : current.keywords,
  //       tags:
  //         (update.$set as any).tags !== undefined
  //           ? (update.$set as any).tags
  //           : current.tags,
  //       address: hasAddressInDto ? nextAddress : current.address,
  //     };
  //     (update.$set as any).searchTerms = this.buildSearchTerms(temp);
  //   }

  //   // ===== meta =====
  //   (update.$set as any).updatedAt = new Date();
  //   if (requesterId) {
  //     (update.$set as any)['extra.updatedBy'] = requesterId;
  //     (update.$set as any)['extra.updatedReason'] = 'owner_update';
  //   }
  //   if (Object.keys($unset).length > 0) (update as any).$unset = $unset;

  //   try {
  //     const updated = await this.restaurantModel
  //       .findOneAndUpdate(filter, update, { new: true, lean: true })
  //       .exec();
  //     if (!updated) throw new NotFoundException('Restaurant not found');

  //     return await this.expandSignedUrls(updated);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists');
  //     }
  //     throw err;
  //   }
  // }

  async updateOneWithUploads(
    id: string,
    dto: UpdateRestaurantDto & Record<string, any>,
    requesterId?: string,
    files?: UploadFiles,
    flags?: UploadFlags,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid restaurant id');
    }

    const filter = { _id: new Types.ObjectId(id) };

    const current = await this.restaurantModel.findOne(filter).lean();
    if (!current) throw new NotFoundException('Restaurant not found');

    // chuẩn hoá dto (parse JSON fields, arrays, openingHours, ...)
    const data = this.normalizeUpdateDto(dto);

    const update: UpdateQuery<RestaurantDocument> = { $set: {} as any };
    const $unset: Record<string, ''> = {};

    // ===== slug + effectiveSlug cho path upload =====
    let effectiveSlug: string =
      (current.slug ?? '').toString().trim() ||
      `restaurant-${current._id.toString()}`;

    if (data.slug) {
      const baseSlug = this.slugify(String(data.slug));
      const nextSlug = await this.ensureUniqueSlugOnUpdate(
        String(current._id),
        baseSlug,
      );
      (update.$set as any).slug = nextSlug;
      effectiveSlug = nextSlug;
    }

    // ===== simple fields =====
    const simpleFields: Array<keyof UpdateRestaurantDto> = [
      'name',
      'shortName',
      'registrationNumber',
      'taxCode',
      'phone',
      'website',
      'email',
      'cuisine',
      'priceRange',
      'rating',
      'amenities',
      'openingHours',
      'metaTitle',
      'metaDescription',
      'keywords',
      'tags',
      'searchTerms',
      'extra',
      'isActive',
    ];

    for (const f of simpleFields) {
      if (Object.prototype.hasOwnProperty.call(data, f)) {
        (update.$set as any)[f] = (data as any)[f];
      }
    }

    // ===== address & location =====
    if (data.location?.type && data.location.type !== 'Point') {
      throw new BadRequestException('location.type must be "Point"');
    }
    if (data.address?.locationType && data.address.locationType !== 'Point') {
      throw new BadRequestException('address.locationType must be "Point"');
    }

    const hasAddressInDto = Object.prototype.hasOwnProperty.call(data, 'address');
    const hasLocationInDto = Object.prototype.hasOwnProperty.call(
      data,
      'location',
    );

    const nextAddress = hasAddressInDto ? data.address : current.address;
    let nextLocation = hasLocationInDto ? data.location : current.location;

    const addrCoords = nextAddress?.coordinates;
    const locCoords = nextLocation?.coordinates;

    if (Array.isArray(addrCoords) && addrCoords.length >= 2) {
      if (!locCoords || !locCoords.length) {
        nextLocation = {
          ...(nextLocation ?? {}),
          type: 'Point',
          coordinates: addrCoords,
        };
      }
    }

    if (hasAddressInDto) {
      (update.$set as any).address = nextAddress;
    }
    if (hasLocationInDto || nextLocation !== current.location) {
      (update.$set as any).location = nextLocation;
    }

    // ===== flags upload =====
    const flagsSafe: UploadFlags = {
      removeLogo: !!flags?.removeLogo,
      removeCover: !!flags?.removeCover,
      galleryMode: flags?.galleryMode ?? 'append',
      galleryRemovePaths: Array.isArray(flags?.galleryRemovePaths)
        ? flags.galleryRemovePaths
        : [],
      removeAllGallery: !!flags?.removeAllGallery,
    };

    // --- logo ---
    if (files?.logo?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.logo,
        `restaurants/${effectiveSlug}/logo`,
      );
      (update.$set as any).logoUrl = up.paths?.[0] ?? '';
    } else if (flagsSafe.removeLogo) {
      $unset['logoUrl'] = '';
    } else if (Object.prototype.hasOwnProperty.call(data, 'logoUrl')) {
      (update.$set as any).logoUrl = data.logoUrl ?? '';
    }

    // --- cover ---
    if (files?.cover?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.cover,
        `restaurants/${effectiveSlug}/cover`,
      );
      (update.$set as any).coverImageUrl = up.paths?.[0] ?? '';
    } else if (flagsSafe.removeCover) {
      $unset['coverImageUrl'] = '';
    } else if (Object.prototype.hasOwnProperty.call(data, 'coverImageUrl')) {
      (update.$set as any).coverImageUrl = data.coverImageUrl ?? '';
    }

    // --- gallery ---
    const currentGallery: string[] = Array.isArray(current.gallery)
      ? current.gallery
      : [];
    let nextGallery = [...currentGallery];

    if (flagsSafe.galleryMode === 'remove' || flagsSafe.removeAllGallery) {
      if (flagsSafe.removeAllGallery) nextGallery = [];
      else if (flagsSafe.galleryRemovePaths?.length) {
        const removeSet = new Set(flagsSafe.galleryRemovePaths);
        nextGallery = nextGallery.filter((p) => !removeSet.has(p));
      }
    }

    if (flagsSafe.galleryMode === 'replace') {
      if (files?.gallery?.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          files.gallery,
          `restaurants/${effectiveSlug}/gallery`,
        );
        nextGallery = up.paths ?? [];
      } else if (Array.isArray(data.gallery)) {
        nextGallery = this.uniqStrings(data.gallery);
      }
    }

    if (flagsSafe.galleryMode === 'append') {
      if (files?.gallery?.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          files.gallery,
          `restaurants/${effectiveSlug}/gallery`,
        );
        nextGallery = this.uniqStrings([...nextGallery, ...(up.paths ?? [])]);
      }
      if (Array.isArray(data.gallery)) {
        nextGallery = this.uniqStrings([...nextGallery, ...data.gallery]);
      }
      if (flagsSafe.galleryRemovePaths?.length) {
        const removeSet = new Set(flagsSafe.galleryRemovePaths);
        nextGallery = nextGallery.filter((p) => !removeSet.has(p));
      }
    }

    const galleryChanged =
      nextGallery.length !== currentGallery.length ||
      nextGallery.some((p, i) => p !== currentGallery[i]);

    if (galleryChanged) {
      (update.$set as any).gallery = nextGallery;
    }

    // ===== paymentConfig + QR =====
    if ('paymentConfig' in dto) {
      if (dto.paymentConfig === null) {
        $unset['paymentConfig'] = '';
      } else {
        const normalized = this.normalizePaymentConfigRaw(dto.paymentConfig);
        const withQr = await this.attachPaymentQrUploads(
          effectiveSlug,
          normalized,
          files,
        );
        (update.$set as any).paymentConfig = withQr;
      }
    }

    // ===== searchTerms auto nếu client không truyền =====
    const searchTermsProvided = Object.prototype.hasOwnProperty.call(
      data,
      'searchTerms',
    );

    if (!searchTermsProvided) {
      const temp = {
        name:
          (update.$set as any).name !== undefined
            ? (update.$set as any).name
            : current.name,
        shortName:
          (update.$set as any).shortName !== undefined
            ? (update.$set as any).shortName
            : current.shortName,
        keywords:
          (update.$set as any).keywords !== undefined
            ? (update.$set as any).keywords
            : current.keywords,
        tags:
          (update.$set as any).tags !== undefined
            ? (update.$set as any).tags
            : current.tags,
        address: hasAddressInDto ? nextAddress : current.address,
      };
      (update.$set as any).searchTerms = this.buildSearchTerms(temp);
    }

    // ===== meta =====
    (update.$set as any).updatedAt = new Date();
    if (requesterId) {
      (update.$set as any)['extra.updatedBy'] = requesterId;
      (update.$set as any)['extra.updatedReason'] = 'owner_update';
    }
    if (Object.keys($unset).length > 0) (update as any).$unset = $unset;

    try {
      const updated = await this.restaurantModel
        .findOneAndUpdate(filter, update, { new: true, lean: true })
        .exec();
      if (!updated) throw new NotFoundException('Restaurant not found');

      return await this.expandSignedUrls(updated);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists');
      }
      throw err;
    }
  }




  private sortMap(sort?: string) {
    switch (sort) {
      case 'createdAt':
        return { createdAt: 1 };
      case '-createdAt':
        return { createdAt: -1 };
      case 'rating':
        return { rating: 1 };
      case '-rating':
        return { rating: -1 };
      case 'name':
        return { name: 1 };
      case '-name':
        return { name: -1 };
      // distance sorting handled in $geoNear
      default:
        return { createdAt: -1 };
    }
  }

  private parseCsv(v?: string) {
    if (!v) return [];
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // ===== LIST =====
  // ===== LIST =====
  async findMany(q: QueryRestaurantsDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    const tagList = this.parseCsv(q.tags);
    const cuisineList = this.parseCsv(q.cuisine);

    const baseFilter: FilterQuery<RestaurantDocument> = {};

    // ===== isActive =====
    if (q.isActive === 'true') baseFilter.isActive = true;
    if (q.isActive === 'false') baseFilter.isActive = false;

    // ===== owner / category =====
    if (q.ownerId) baseFilter.ownerId = new Types.ObjectId(q.ownerId);
    if (q.categoryId) baseFilter.categoryId = new Types.ObjectId(q.categoryId);

    // ===== address filters =====
    if (q.country) baseFilter['address.country'] = q.country.toUpperCase();
    if (q.city) baseFilter['address.city'] = q.city;
    if (q.district) baseFilter['address.district'] = q.district;
    if (q.ward) baseFilter['address.ward'] = q.ward;

    // ===== tags / cuisine =====
    if (tagList.length) baseFilter.tags = { $all: tagList };
    if (cuisineList.length) baseFilter.cuisine = { $all: cuisineList };

    // ===== coordinates =====
    const lat =
      q.lat !== undefined && q.lat !== null ? Number(q.lat) : undefined;
    const lng =
      q.lng !== undefined && q.lng !== null ? Number(q.lng) : undefined;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    const wantDistanceSort = q.sort === 'distance' && hasCoords;

    const textSearch = q.q && q.q.trim() ? q.q.trim() : undefined;

    // ===== Pipeline build =====
    const pipeline: any[] = [];

    // 1) GeoNear nếu có tọa độ
    if (hasCoords) {
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          distanceField: 'distance', // mét
          spherical: true,
          ...(q.radius ? { maxDistance: Number(q.radius) } : {}),
          query: baseFilter,
        },
      });
    } else {
      // 2) Không geoNear → match thường
      if (Object.keys(baseFilter).length) {
        pipeline.push({ $match: baseFilter });
      }
    }

    // 3) Text search (nếu có q)
    if (textSearch) {
      pipeline.push({
        $match: { $text: { $search: textSearch } },
      });

      pipeline.push({
        $addFields: { textScore: { $meta: 'textScore' } },
      });
    }

    // 4) Sort
    const sortObj = this.sortMap(q.sort) || {};
    if (wantDistanceSort) {
      pipeline.push({ $sort: { distance: 1 } });
    } else if (textSearch) {
      const textSort: Record<string, 1 | -1> = { textScore: -1 };
      for (const [k, v] of Object.entries(sortObj)) {
        textSort[k] = v as 1 | -1;
      }
      pipeline.push({ $sort: textSort });
    } else if (Object.keys(sortObj).length) {
      pipeline.push({ $sort: sortObj });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    // 👉 Lưu pipeline cho total (không có paging, không có lookup)
    const countPipeline = [...pipeline, { isHidden: false }];

    // 5) Paging
    pipeline.push({ $skip: skip }, { $limit: limit });

    // 6) Lookup category
    pipeline.push(
      {
        $lookup: {
          from: 'categories',             // collection Category
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [
            { $match: { isActive: true } },
            {
              $project: {
                _id: 1,
                name: 1,
                slug: 1,
                description: 1,
                image: 1,
                parentId: 1,
                depth: 1,
                path: 1,
                sortIndex: 1,
                extra: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },
    );

    const [items, totalAgg] = await Promise.all([
      this.restaurantModel.aggregate(pipeline).exec(),
      this.restaurantModel.aggregate([...countPipeline, { $count: 'total' }]).exec(),
    ]);

    const total = totalAgg[0]?.total ?? 0;

    const withSigned = await Promise.all(
      items.map((it) => this.expandSignedUrls(it)),
    );

    const formatted = withSigned.map((r: any) => {
      // toạ độ cho FE
      const coordinates = {
        lat: r.location?.coordinates?.[1] ?? null,
        lng: r.location?.coordinates?.[0] ?? null,
      };

      let distanceKm: number | null = null;
      let distanceText: string | null = null;

      if (typeof r.distance === 'number') {
        const km = Number((r.distance / 1000).toFixed(2));
        distanceKm = km;
        distanceText = `${km.toFixed(2)} km`;
      }

      return {
        ...r,
        coordinates,
        distanceKm,
        distanceText,
        categoryName: r.category?.name ?? null,
        categorySlug: r.category?.slug ?? null,
      };
    });

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items: formatted,
    };
  }



  async findDetail(
    idOrSlug: string,
    opts?: { userLat?: number; userLng?: number },
  ) {
    const { userLat, userLng } = opts ?? {};

    const isObjectId = Types.ObjectId.isValid(idOrSlug);
    const filter: FilterQuery<RestaurantDocument> = isObjectId
      ? { _id: new Types.ObjectId(idOrSlug) }
      : { slug: idOrSlug.toLowerCase() };

    const [doc] = await this.restaurantModel
      .aggregate([
        { $match: filter },
        { $limit: 1 },
        {
          $lookup: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category',
            pipeline: [
              { $match: { isActive: true } },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  slug: 1,
                  description: 1,
                  image: 1,
                  parentId: 1,
                  depth: 1,
                  path: 1,
                  sortIndex: 1,
                  extra: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$category',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .exec();

    if (!doc) throw new NotFoundException('Restaurant not found');

    const signed = await this.expandSignedUrls(doc);

    // toạ độ quán
    const locCoords = signed.location?.coordinates;
    const shopLng =
      Array.isArray(locCoords) && locCoords.length >= 2
        ? Number(locCoords[0])
        : undefined;
    const shopLat =
      Array.isArray(locCoords) && locCoords.length >= 2
        ? Number(locCoords[1])
        : undefined;

    let distanceKm: number | null = null;
    let distanceText: string | null = null;

    // nếu có userLat/userLng + toạ độ quán thì tính khoảng cách
    if (
      typeof userLat === 'number' &&
      typeof userLng === 'number' &&
      !Number.isNaN(userLat) &&
      !Number.isNaN(userLng) &&
      typeof shopLat === 'number' &&
      typeof shopLng === 'number' &&
      !Number.isNaN(shopLat) &&
      !Number.isNaN(shopLng)
    ) {
      distanceKm = this.haversineDistanceKm(userLat, userLng, shopLat, shopLng);
      distanceText = this.formatDistance(distanceKm);
    }

    return {
      ...signed,
      coordinates: {
        lat: shopLat ?? null,
        lng: shopLng ?? null,
      },
      categoryName: signed.category?.name ?? null,
      categorySlug: signed.category?.slug ?? null,
      distanceKm,
      distanceText,
    };
  }

  // ===== helpers =====

  /** Haversine distance (km) giữa 2 toạ độ */
  private haversineDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // bán kính Trái Đất (km)

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    return d;
  }

  /** Format khoảng cách thành text (m / km) */
  private formatDistance(km: number | null): string | null {
    if (km == null || !Number.isFinite(km)) return null;

    if (km < 1) {
      // < 1km thì hiển thị mét
      const meters = Math.round(km * 1000);
      return `${meters} m`;
    }

    return `${km.toFixed(2)} km`;
  }



  async findByOwnerId(ownerId: string, q: OwnerRestaurantsQueryDto) {
    const ownerObjId = new Types.ObjectId(ownerId);
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    // ===== pipeline lấy list =====
    const pipeline: any[] = [
      {
        $match: {
          ownerId: ownerObjId,
        },
      },
      {
        $sort: {
          createdAt: -1, // hoặc updatedAt tuỳ ông
        },
      },
      { $skip: skip },
      { $limit: limit },

      // Lookup category
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [
            { $match: { isActive: true } },
            {
              $project: {
                _id: 1,
                name: 1,
                slug: 1,
                description: 1,
                image: 1,
                parentId: 1,
                depth: 1,
                path: 1,
                sortIndex: 1,
                extra: 1, // 👈 lấy luôn extra (icon, màu, v.v.)
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const [itemsAgg, total] = await Promise.all([
      this.restaurantModel.aggregate(pipeline).exec(),
      this.restaurantModel.countDocuments({ ownerId: ownerObjId }).exec(),
    ]);

    const withSigned = await Promise.all(
      itemsAgg.map((it) => this.expandSignedUrls(it)),
    );

    const items = withSigned.map((r: any) => ({
      ...r,
      // toạ độ cho FE
      coordinates: {
        lat: r.location?.coordinates?.[1] ?? null,
        lng: r.location?.coordinates?.[0] ?? null,
      },
      // flatten vài field category cho FE dễ dùng
      categoryName: r.category?.name ?? null,
      categorySlug: r.category?.slug ?? null,
      categoryIcon: r.category?.extra?.icon ?? null,
    }));

    return {
      ownerId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    };
  }


  // async expandSignedUrls(doc: any) {
  //   if (!doc) return doc;
  //   const signed = async (p?: string | null) =>
  //     p ? (await this.uploadService.getSignedUrl(p)).url : null;

  //   const out: any = { ...doc };

  //   out.logoUrlSigned = doc.logoUrl ? await signed(doc.logoUrl) : null;
  //   out.coverImageUrlSigned = doc.coverImageUrl
  //     ? await signed(doc.coverImageUrl)
  //     : null;

  //   if (Array.isArray(doc.gallery) && doc.gallery.length) {
  //     out.gallerySigned = await Promise.all(
  //       doc.gallery.map(async (p: string) => ({
  //         path: p,
  //         url: await signed(p),
  //       })),
  //     );
  //   } else {
  //     out.gallerySigned = [];
  //   }

  //   return out;
  // }

  // private async expandSignedUrls(doc: any) {
  //   if (!doc) return doc;
  //   const signed = async (p?: string | null) =>
  //     p ? (await this.uploadService.getSignedUrl(p)).url : null;

  //   const out: any = { ...doc };

  //   out.logoUrlSigned = doc.logoUrl ? await signed(doc.logoUrl) : null;
  //   out.coverImageUrlSigned = doc.coverImageUrl
  //     ? await signed(doc.coverImageUrl)
  //     : null;

  //   if (Array.isArray(doc.gallery) && doc.gallery.length) {
  //     out.gallerySigned = await Promise.all(
  //       doc.gallery.map(async (p: string) => ({
  //         path: p,
  //         url: await signed(p),
  //       })),
  //     );
  //   } else {
  //     out.gallerySigned = [];
  //   }

  //   return out;
  // }

  // private async expandSignedUrls(doc: any) {
  //   if (!doc) return doc;
  //   const signed = async (p?: string | null) =>
  //     p ? (await this.uploadService.getSignedUrl(p)).url : null;

  //   const out: any = { ...doc };

  //   out.logoUrlSigned = doc.logoUrl ? await signed(doc.logoUrl) : null;
  //   out.coverImageUrlSigned = doc.coverImageUrl
  //     ? await signed(doc.coverImageUrl)
  //     : null;

  //   if (Array.isArray(doc.gallery) && doc.gallery.length) {
  //     out.gallerySigned = await Promise.all(
  //       doc.gallery.map(async (p: string) => ({
  //         path: p,
  //         url: await signed(p),
  //       })),
  //     );
  //   } else {
  //     out.gallerySigned = [];
  //   }

  //   return out;
  // }

  // ====== TÌM GẦN NHẤT + TÍNH KHOẢNG CÁCH ======
  async findNearby(q: NearbyRestaurantsQueryDto) {
    const lat = q.lat;
    const lng = q.lng;
    const maxDistance = q.maxDistanceMeters ?? 5000; // 5km default
    const limit = q.limit ?? 20;

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] }, // [lng, lat]
          key: 'location',
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance,
          query: { isActive: true },
        },
      },

      {
        $addFields: {
          distanceKm: {
            $round: [{ $divide: ['$distanceMeters', 1000] }, 2],
          },
        },
      },

      // 🔗 JOIN category theo categoryId
      {
        $lookup: {
          from: 'categories',            // tên collection (Category -> 'categories')
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [
            { $match: { isActive: true } },
            {
              $project: {
                _id: 1,
                name: 1,
                slug: 1,
                description: 1,
                image: 1,
                parentId: 1,
                depth: 1,
                path: 1,
                sortIndex: 1,
                extra: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $limit: limit,
      },

      {
        $project: {
          ownerId: 1,
          categoryId: 1,
          // 👇 thêm luôn thông tin category cho FE xài
          category: 1,

          name: 1,
          slug: 1,
          logoUrl: 1,
          coverImageUrl: 1,
          gallery: 1,
          address: 1,
          location: 1,
          cuisine: 1,
          priceRange: 1,
          rating: 1,
          amenities: 1,
          openingHours: 1,
          tags: 1,
          searchTerms: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          distanceMeters: 1,
          distanceKm: 1,
        },
      },
    ];

    const docs = await this.restaurantModel.aggregate(pipeline).exec();

    const withSigned = await Promise.all(
      docs.map((d) => this.expandSignedUrls(d)),
    );

    const items = withSigned.map((r) => ({
      ...r,
      coordinates: {
        lat: r.location?.coordinates?.[1] ?? null,
        lng: r.location?.coordinates?.[0] ?? null,
      },
      distanceText:
        r.distanceKm != null ? `${r.distanceKm.toFixed(2)} km` : null,

      // tiện: thêm vài field phẳng cho FE filter/sort
      categoryName: r.category?.name ?? null,
      categorySlug: r.category?.slug ?? null,
    }));

    return {
      center: { lat, lng },
      maxDistanceMeters: maxDistance,
      limit,
      count: items.length,
      items,
    };
  }

  async findNearbyFromFar(q: NearbyRestaurantsQueryDto) {
    const lat = q.lat;
    const lng = q.lng;
    const maxDistance = q.maxDistanceMeters ?? 10000; // 5km default
    const limit = q.limit ?? 20;

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] }, // [lng, lat]
          key: 'location',
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance,
          query: { isActive: true },
        },
      },

      {
        $addFields: {
          distanceKm: {
            $round: [{ $divide: ['$distanceMeters', 1000] }, 2],
          },
        },
      },

      // 🔗 JOIN category theo categoryId
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
          pipeline: [
            { $match: { isActive: true } },
            {
              $project: {
                _id: 1,
                name: 1,
                slug: 1,
                description: 1,
                image: 1,
                parentId: 1,
                depth: 1,
                path: 1,
                sortIndex: 1,
                extra: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔽 khác với findNearby: sort theo distanceMeters giảm dần (xa -> gần)
      {
        $sort: {
          distanceMeters: -1,
        },
      },

      {
        $limit: limit,
      },

      {
        $project: {
          ownerId: 1,
          categoryId: 1,
          category: 1,

          name: 1,
          slug: 1,
          logoUrl: 1,
          coverImageUrl: 1,
          gallery: 1,
          address: 1,
          location: 1,
          cuisine: 1,
          priceRange: 1,
          rating: 1,
          amenities: 1,
          openingHours: 1,
          tags: 1,
          searchTerms: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          distanceMeters: 1,
          distanceKm: 1,
        },
      },
    ];

    const docs = await this.restaurantModel.aggregate(pipeline).exec();

    const withSigned = await Promise.all(
      docs.map((d) => this.expandSignedUrls(d)),
    );

    const items = withSigned.map((r) => ({
      ...r,
      coordinates: {
        lat: r.location?.coordinates?.[1] ?? null,
        lng: r.location?.coordinates?.[0] ?? null,
      },
      distanceText:
        r.distanceKm != null ? `${r.distanceKm.toFixed(2)} km` : null,
      categoryName: r.category?.name ?? null,
      categorySlug: r.category?.slug ?? null,
    }));

    return {
      center: { lat, lng },
      maxDistanceMeters: maxDistance,
      limit,
      count: items.length,
      items,
    };
  }
  async findManyForListing(query: QueryRestaurantsHomeDto) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.max(
      1,
      Math.min(50, parseInt(query.limit ?? '12', 10) || 12),
    );

    const filter: FilterQuery<RestaurantDocument> = {
      isActive: true,
      // nếu bạn có flag quán nổi bật thì thêm:
      // tags: { $in: ['featured'] },
    };

    // ----- lọc theo khoảng giá (khoảng giá) -----
    if (query.priceRange) {
      filter.priceRange = query.priceRange.trim();
    }

    // ----- lọc theo quận/huyện -----
    if (query.district) {
      const district = query.district.trim();
      // so sánh không phân biệt hoa thường
      filter['address.district'] = {
        $regex: new RegExp(`^${escapeRegExp(district)}$`, 'i'),
      };
    }

    // ----- search theo món ăn / keyword -----
    if (query.q) {
      const q = query.q.trim();

      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { cuisine: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
        { 'address.formatted': { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.restaurantModel
        .find(filter)
        // ưu tiên quán rating cao + mới
        .sort({ rating: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // chỉ select những field cần cho card list
        .select({
          name: 1,
          shortName: 1,
          slug: 1,
          logoUrl: 1,
          coverImageUrl: 1,
          priceRange: 1,
          rating: 1,
          cuisine: 1,
          tags: 1,
          'address.district': 1,
          'address.city': 1,
        })
        .lean()
        .exec(),
      this.restaurantModel.countDocuments(filter),
    ]);

    // 🔥 thêm prefix / signed URL cho hình ảnh
    const items = await Promise.all(
      docs.map((d) => this.expandSignedUrls(d)),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
  async findManyWithPaging(query: QueryRestaurantsDetailDto) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.max(
      1,
      Math.min(50, parseInt(query.limit ?? '20', 10) || 20),
    );
    const skip = (page - 1) * limit;

    const filter: FilterQuery<RestaurantDocument> = {};

    // ----- owner / category -----
    if (query.ownerId) {
      filter.ownerId = new Types.ObjectId(query.ownerId);
    }
    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    // ----- city / district -----
    if (query.city) {
      filter['address.city'] = {
        $regex: new RegExp(`^${escapeRegExp(query.city.trim())}$`, 'i'),
      };
    }
    if (query.district) {
      filter['address.district'] = {
        $regex: new RegExp(`^${escapeRegExp(query.district.trim())}$`, 'i'),
      };
    }

    // ----- priceRange -----
    if (query.priceRange) {
      filter.priceRange = query.priceRange.trim();
    }

    // ----- isActive -----
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    // ----- full-text / keyword search -----
    if (query.q) {
      const q = query.q.trim();
      const regex = new RegExp(escapeRegExp(q), 'i');

      filter.$or = [
        { name: regex },
        { shortName: regex },
        { slug: regex },
        { 'address.formatted': regex },
        { tags: regex },
        { cuisine: regex },
        { searchTerms: regex },
      ];
    }

    // ----- sort chuẩn -----
    let sortField: string;
    switch (query.sortBy) {
      case 'name':
        sortField = 'name';
        break;
      case 'rating':
        sortField = 'rating';
        break;
      case 'createdAt':
      default:
        sortField = 'createdAt';
        break;
    }

    const sortDir = query.sortDir === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

    const [docs, total] = await Promise.all([
      this.restaurantModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select({
          name: 1,
          shortName: 1,
          slug: 1,
          logoUrl: 1,
          coverImageUrl: 1,
          priceRange: 1,
          rating: 1,
          cuisine: 1,
          tags: 1,
          'address.district': 1,
          'address.city': 1,
          isActive: 1,
          createdAt: 1,
        })
        .lean()
        .exec(),
      this.restaurantModel.countDocuments(filter),
    ]);

    // 🔥 thêm prefix / signed URL cho hình ảnh
    const items = await Promise.all(
      docs.map((d) => this.expandSignedUrls(d)),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
  async updateVisibility(
    id: string,
    params: { isHidden: boolean; actorId: string; roles?: string[] },
  ) {
    const { isHidden, actorId, roles = [] } = params;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid restaurant id');
    }

    const isAdmin = Array.isArray(roles) && roles.includes('admin');

    const filter: FilterQuery<RestaurantDocument> = {
      _id: new Types.ObjectId(id),
    };

    if (!isAdmin) {
      filter.ownerId = new Types.ObjectId(actorId);
    }

    const updated = await this.restaurantModel.findOneAndUpdate(
      filter,
      {
        $set: { isHidden },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Restaurant not found or not allowed');
    }

    return updated;
  }
}
