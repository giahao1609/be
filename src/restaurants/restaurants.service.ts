import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { Restaurant, RestaurantDocument } from './schema/restaurant.schema';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UploadService } from 'src/upload/upload.service';
import {
  OwnerRestaurantsQueryDto,
  QueryRestaurantsDto,
} from './dto/query-restaurants.dto';
import { NearbyRestaurantsQueryDto } from './dto/nearby-restaurants.dto';

type UploadFlags = {
  removeLogo?: boolean;
  removeCover?: boolean;
  galleryMode?: 'append' | 'replace' | 'remove';
  galleryRemovePaths?: string[];
  removeAllGallery?: boolean;
};

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly uploadService: UploadService,
  ) {}

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

  private async expandSignedUrls(restaurant: any) {
    const out = { ...restaurant };

    const signed = async (p?: string | null) =>
      p ? (await this.uploadService.getSignedUrl(p)).url : null;

    out.logoUrlSigned = await signed(restaurant.logoUrl);
    out.coverImageUrlSigned = await signed(restaurant.coverImageUrl);

    if (Array.isArray(restaurant.gallery) && restaurant.gallery.length) {
      out.gallerySigned = await Promise.all(
        restaurant.gallery.map(async (p: string) => ({
          path: p,
          url: await signed(p),
        })),
      );
    } else {
      out.gallerySigned = [];
    }

    return out;
  }

  // ===== CREATE =====
  async createWithUploads(
    dto: CreateRestaurantDto,
    ownerId: string,
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    if (!ownerId) throw new BadRequestException('ownerId is required');

    const ownerObjectId =
      typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const data = this.normalizeCreateDto(dto);

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

    const uploads = await this.handleUploadsForRestaurant(slug, files);

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

  async updateByIdWithUploads(
    id: string,
    dto: UpdateRestaurantDto & Record<string, any>,
    requesterId?: string,
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
    flags?: UploadFlags,
  ) {
    return this.updateOneWithUploads(
      { _id: new Types.ObjectId(id) },
      dto,
      requesterId,
      files,
      flags,
    );
  }

  private async updateOneWithUploads(
    filter: FilterQuery<RestaurantDocument>,
    dto: UpdateRestaurantDto & Record<string, any>,
    requesterId?: string,
    files?: {
      logo?: Express.Multer.File[];
      cover?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
    flags?: UploadFlags,
  ) {
    const current = await this.restaurantModel.findOne(filter).lean();
    if (!current) throw new NotFoundException('Restaurant not found');

    // parse JSON, chuẩn hoá arrays, openingHours,...
    const data = this.normalizeUpdateDto(dto);

    const update: UpdateQuery<RestaurantDocument> = { $set: {} as any };
    const $unset: Record<string, ''> = {};

    // ===== slug =====
    if (data.slug) {
      const baseSlug = this.slugify(String(data.slug));
      const nextSlug = await this.ensureUniqueSlugOnUpdate(
        String(current._id),
        baseSlug,
      );
      (update.$set as any).slug = nextSlug;
    }

    // ===== simple fields (set trực tiếp nếu client truyền) =====
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

    // Tính nextAddress / nextLocation từ current + data
    const hasAddressInDto = Object.prototype.hasOwnProperty.call(
      data,
      'address',
    );
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

    // ===== flags gallery/logo/cover =====
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
        `restaurants/${current.slug}/logo`,
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
        `restaurants/${current.slug}/cover`,
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

    // remove / removeAll
    if (flagsSafe.galleryMode === 'remove' || flagsSafe.removeAllGallery) {
      if (flagsSafe.removeAllGallery) nextGallery = [];
      else if (flagsSafe.galleryRemovePaths?.length) {
        const removeSet = new Set(flagsSafe.galleryRemovePaths);
        nextGallery = nextGallery.filter((p) => !removeSet.has(p));
      }
    }

    // replace
    if (flagsSafe.galleryMode === 'replace') {
      if (files?.gallery?.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          files.gallery,
          `restaurants/${current.slug}/gallery`,
        );
        nextGallery = up.paths ?? [];
      } else if (Array.isArray(data.gallery)) {
        nextGallery = this.uniqStrings(data.gallery);
      }
    }

    // append
    if (flagsSafe.galleryMode === 'append') {
      if (files?.gallery?.length) {
        const up = await this.uploadService.uploadMultipleToGCS(
          files.gallery,
          `restaurants/${current.slug}/gallery`,
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

  // isActive filter
  if (q.isActive === 'true') baseFilter.isActive = true;
  if (q.isActive === 'false') baseFilter.isActive = false;

  // owner / category
  if (q.ownerId) baseFilter.ownerId = new Types.ObjectId(q.ownerId);
  if (q.categoryId) baseFilter.categoryId = new Types.ObjectId(q.categoryId);

  // address filters
  if (q.country) baseFilter['address.country'] = q.country.toUpperCase();
  if (q.city) baseFilter['address.city'] = q.city;
  if (q.district) baseFilter['address.district'] = q.district;
  if (q.ward) baseFilter['address.ward'] = q.ward;

  // tags / cuisine
  if (tagList.length) baseFilter.tags = { $all: tagList };
  if (cuisineList.length) baseFilter.cuisine = { $all: cuisineList };

  // toạ độ (ép Number cho chắc)
  const lat =
    q.lat !== undefined && q.lat !== null ? Number(q.lat) : undefined;
  const lng =
    q.lng !== undefined && q.lng !== null ? Number(q.lng) : undefined;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const wantDistanceSort = q.sort === 'distance' && hasCoords;

  const textSearch = q.q && q.q.trim() ? q.q.trim() : undefined;

  // ===== Pipeline =====
  const pipeline: any[] = [];

  // 1) GeoNear (nếu có toạ độ)
  if (hasCoords) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        distanceField: 'distance',
        spherical: true,
        ...(q.radius ? { maxDistance: Number(q.radius) } : {}),
        query: baseFilter,
      },
    });
  } else {
    // 2) Không có geoNear → dùng $match bình thường
    if (Object.keys(baseFilter).length) {
      pipeline.push({ $match: baseFilter });
    }
  }

  // 3) Text search
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
    // sort theo textScore + custom sort nếu có
    const textSort: any = { textScore: -1 };
    for (const [k, v] of Object.entries(sortObj)) {
      textSort[k] = v;
    }
    pipeline.push({ $sort: textSort });
  } else if (Object.keys(sortObj).length) {
    pipeline.push({ $sort: sortObj });
  } else {
    // fallback sort nếu sortMap không trả ra gì
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  // 5) Paging
  pipeline.push({ $skip: skip }, { $limit: limit });

  // 6) KHÔNG $project → trả full document (cộng thêm distance/textScore nếu có)
  // Nếu sau này cần loại bỏ field nội bộ thì add $project/$unset riêng.

  // ===== Count total =====
  const countFilter: any = { ...baseFilter };
  if (textSearch) {
    countFilter.$text = { $search: textSearch };
  }

  const [items, total] = await Promise.all([
    this.restaurantModel.aggregate(pipeline).exec(),
    this.restaurantModel.countDocuments(countFilter).exec(),
  ]);

  // expand signed URLs (vẫn giữ nguyên shape field, chỉ thay value)
  const withSigned = await Promise.all(
    items.map((it) => this.expandSignedUrls(it)),
  );

  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: withSigned,
  };
}


  // ===== DETAIL =====
  async findDetail(idOrSlug: string) {
    const isObjectId = Types.ObjectId.isValid(idOrSlug);
    const filter: FilterQuery<RestaurantDocument> = isObjectId
      ? { _id: new Types.ObjectId(idOrSlug) }
      : { slug: idOrSlug.toLowerCase() };

    const doc = await this.restaurantModel.findOne(filter).lean();
    if (!doc) throw new NotFoundException('Restaurant not found');

    return this.expandSignedUrls(doc);
  }

  async findByOwnerId(ownerId: string, q: OwnerRestaurantsQueryDto) {
    const ownerObjId = new Types.ObjectId(ownerId);
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.restaurantModel
        .find({ ownerId: ownerObjId })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.restaurantModel.countDocuments({ ownerId: ownerObjId }).exec(),
    ]);

    const withSigned = await Promise.all(
      items.map((it) => this.expandSignedUrls(it)),
    );

    return {
      ownerId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items: withSigned,
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

    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] }, // [lng, lat]
          key: 'location', // ✅ trỏ đúng field có index 2dsphere
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance,
          query: { isActive: true },
        },
      },

      // thêm field distanceKm, làm tròn 2 số lẻ
      {
        $addFields: {
          distanceKm: {
            $round: [{ $divide: ['$distanceMeters', 1000] }, 2],
          },
        },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          ownerId: 1,
          categoryId: 1,
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

    // chuẩn hoá thêm field cho FE xài map/list cho tiện
    const items = withSigned.map((r) => ({
      ...r,
      coordinates: {
        lat: r.location?.coordinates?.[1] ?? null,
        lng: r.location?.coordinates?.[0] ?? null,
      },
      distanceText:
        r.distanceKm != null ? `${r.distanceKm.toFixed(2)} km` : null,
    }));

    return {
      center: { lat, lng },
      maxDistanceMeters: maxDistance,
      limit,
      count: items.length,
      items,
    };
  }
}
