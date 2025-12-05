import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types, UpdateQuery } from 'mongoose';
import { MenuItem, MenuItemDocument } from './schema/menu.schema';
import { UploadService } from 'src/upload/upload.service';
import { QueryMenuItemsDto } from './dto/query-menu-items.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
type ImageFlags = {
  imagesMode?: 'append' | 'replace' | 'remove';
  removeAllImages?: boolean;
  imagesRemovePaths?: string[];
};
@Injectable()
export class OwnerMenuItemsService {
  constructor(
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    private readonly uploadService: UploadService,
  ) { }

  private slugify(s?: string) {
    if (!s) return '';
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private uniq(arr?: string[]) {
    return Array.from(
      new Set((arr ?? []).map((x) => x.trim()).filter(Boolean)),
    );
  }

  private async ensureUniqueSlugWithinRestaurant(
    restaurantId: string,
    base: string,
    ignoreId?: string,
  ) {
    let candidate = base;
    let i = 1;
    // index: { restaurantId:1, slug:1 } unique
    // nhưng trước khi đụng DB, loop local để tránh lỗi 11000
    // (dù vẫn catch 11000 ở dưới)
    while (
      await this.menuItemModel.exists({
        restaurantId: new Types.ObjectId(restaurantId),
        slug: candidate,
        ...(ignoreId ? { _id: { $ne: new Types.ObjectId(ignoreId) } } : {}),
      })
    ) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }

  private async expandSignedUrls(doc: any) {
    if (!doc) return doc;
    const signed = async (p?: string | null) =>
      p ? (await this.uploadService.getSignedUrl(p)) : null;

    const out: any = { ...doc };
    if (Array.isArray(doc.images) && doc.images.length) {
      out.imagesSigned = await Promise.all(
        doc.images.map(async (p: string) => ({
          path: p,
          url: await signed(p),
        })),
      );
    } else {
      out.imagesSigned = [];
    }
    return out;
  }

  // // ---------- CREATE ----------
  // async create(dto: CreateMenuItemDto, images?: Express.Multer.File[]) {
  //   const restaurantId = dto.restaurantId;
  //   const restObj = new Types.ObjectId(restaurantId);

  //   // slug
  //   let slug = (dto.slug ?? this.slugify(dto.name)).trim().toLowerCase();
  //   slug = await this.ensureUniqueSlugWithinRestaurant(restaurantId, slug);

  //   // upload images (if provided)
  //   let imagePaths: string[] = Array.isArray(dto.images) ? dto.images : [];
  //   if (images?.length) {
  //     const up = await this.uploadService.uploadMultipleToGCS(
  //       images,
  //       `restaurants/${restaurantId}/menu-items/${slug}/images`,
  //     );
  //     imagePaths = [...imagePaths, ...(up.paths ?? [])];
  //     imagePaths = this.uniq(imagePaths);
  //   }

  //   try {
  //     const created = await this.menuItemModel.create({
  //       restaurantId: restObj,
  //       categoryId: dto.categoryId
  //         ? new Types.ObjectId(dto.categoryId)
  //         : undefined,
  //       name: dto.name,
  //       slug,
  //       description: dto.description?.trim(),

  //       images: imagePaths,
  //       tags: this.uniq(dto.tags),
  //       cuisines: this.uniq(dto.cuisines),
  //       itemType: dto.itemType ?? 'food',

  //       basePrice: dto.basePrice,
  //       compareAtPrice: dto.compareAtPrice,

  //       variants: dto.variants ?? [],
  //       optionGroups: dto.optionGroups ?? [],
  //       promotions: dto.promotions ?? [],

  //       vegetarian: !!dto.vegetarian,
  //       vegan: !!dto.vegan,
  //       halal: !!dto.halal,
  //       glutenFree: !!dto.glutenFree,
  //       allergens: this.uniq(dto.allergens),
  //       spicyLevel: dto.spicyLevel ?? 0,

  //       isAvailable: dto.isAvailable ?? true,
  //       sortIndex: dto.sortIndex ?? 0,

  //       extra: (dto as any).extra ?? {},
  //     });

  //     const lean = created.toObject();
  //     return this.expandSignedUrls(lean);
  //   } catch (err: any) {
  //     // bắt lỗi unique slug theo index compound
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists for this restaurant');
  //     }
  //     throw err;
  //   }
  // }

  async createWithUploads(
    dto: CreateMenuItemDto,
    restaurantId: string,
    images: Express.Multer.File[] = [],
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }

    const restObj = new Types.ObjectId(restaurantId);

    // slug
    const baseSlug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    let slug = await this.ensureUniqueSlugWithinRestaurant(
      restaurantId,
      baseSlug,
    );

    // upload images (if provided)
    let imagePaths: string[] = Array.isArray(dto.images) ? dto.images : [];
    if (images.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        images,
        `restaurants/${restaurantId}/menu-items/${slug}/images`,
      );
      imagePaths = [...imagePaths, ...(up.paths ?? [])];
      imagePaths = this.uniq(imagePaths);
    }

    // 🔥 TÍNH DISCOUNT PERCENT (nếu cần)
    let discountPercent: number | undefined =
      typeof dto.discountPercent === 'number'
        ? dto.discountPercent
        : undefined;

    if (
      (discountPercent === undefined || Number.isNaN(discountPercent)) &&
      dto.compareAtPrice?.amount != null &&
      dto.basePrice?.amount != null &&
      dto.compareAtPrice.amount > 0 &&
      dto.compareAtPrice.amount >= dto.basePrice.amount
    ) {
      const raw =
        ((dto.compareAtPrice.amount - dto.basePrice.amount) /
          dto.compareAtPrice.amount) *
        100;
      discountPercent = Math.round(raw);
    }

    // clamp 0–100 nếu có
    if (typeof discountPercent === 'number') {
      if (discountPercent < 0) discountPercent = 0;
      if (discountPercent > 100) discountPercent = 100;
    }

    try {
      const created = await this.menuItemModel.create({
        restaurantId: restObj,
        categoryId: dto.categoryId
          ? new Types.ObjectId(dto.categoryId)
          : undefined,
        name: dto.name,
        slug,
        description: dto.description?.trim(),

        images: imagePaths,
        tags: this.uniq(dto.tags),
        cuisines: this.uniq(dto.cuisines),
        itemType: dto.itemType ?? 'food',

        basePrice: dto.basePrice,
        compareAtPrice: dto.compareAtPrice,
        discountPercent: discountPercent ?? 0,     // 👈 thêm ở đây

        variants: dto.variants ?? [],
        optionGroups: dto.optionGroups ?? [],
        promotions: dto.promotions ?? [],

        vegetarian: !!dto.vegetarian,
        vegan: !!dto.vegan,
        halal: !!dto.halal,
        glutenFree: !!dto.glutenFree,
        allergens: this.uniq(dto.allergens),
        spicyLevel: dto.spicyLevel ?? 0,

        isAvailable: dto.isAvailable ?? true,
        sortIndex: dto.sortIndex ?? 0,

        extra: (dto as any).extra ?? {},
      });

      const lean = created.toObject();
      return this.expandSignedUrls(lean);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists for this restaurant');
      }
      throw err;
    }
  }


  // ===== UPDATE WITH UPLOADS =====
  // async updateWithUploads(
  //   restaurantId: string,
  //   id: string,
  //   dto: UpdateMenuItemDto,
  //   images: Express.Multer.File[] = [],
  //   flags?: ImageFlags,
  // ) {
  //   const restObj = new Types.ObjectId(restaurantId);
  //   const filter: FilterQuery<MenuItemDocument> = {
  //     _id: new Types.ObjectId(id),
  //     restaurantId: restObj,
  //   };

  //   const current = await this.menuItemModel.findOne(filter).lean();
  //   if (!current) throw new NotFoundException('Menu item not found');

  //   const update: UpdateQuery<MenuItemDocument> = { $set: {} as any };

  //   // slug uniqueness (per restaurant)
  //   if (dto.slug && dto.slug.trim()) {
  //     const base = this.slugify(dto.slug);
  //     const ensured = await this.ensureUniqueSlugWithinRestaurant(
  //       restaurantId,
  //       base,
  //       String(current._id),
  //     );
  //     (update.$set as any).slug = ensured;
  //   }

  //   // simple fields
  //   const simple: (keyof any)[] = [
  //     'name',
  //     'description',
  //     'tags',
  //     'cuisines',
  //     'itemType',
  //     'basePrice',
  //     'compareAtPrice',
  //     'variants',
  //     'optionGroups',
  //     'promotions',
  //     'vegetarian',
  //     'vegan',
  //     'halal',
  //     'glutenFree',
  //     'allergens',
  //     'spicyLevel',
  //     'isAvailable',
  //     'sortIndex',
  //     'extra',
  //     'categoryId',
  //   ];
  //   for (const f of simple) {
  //     if (f in dto) (update.$set as any)[f] = (dto as any)[f];
  //   }
  //   if (dto.categoryId) {
  //     (update.$set as any).categoryId = new Types.ObjectId(dto.categoryId);
  //   }

  //   // images decision
  //   const flagsSafe: ImageFlags = {
  //     imagesMode: flags?.imagesMode ?? 'append',
  //     removeAllImages: !!flags?.removeAllImages,
  //     imagesRemovePaths: Array.isArray(flags?.imagesRemovePaths)
  //       ? flags!.imagesRemovePaths!
  //       : [],
  //   };

  //   let nextImages = Array.isArray(current.images) ? [...current.images] : [];

  //   // remove
  //   if (flagsSafe.imagesMode === 'remove' || flagsSafe.removeAllImages) {
  //     nextImages = flagsSafe.removeAllImages
  //       ? []
  //       : nextImages.filter(
  //           (p) => !new Set(flagsSafe.imagesRemovePaths).has(p),
  //         );
  //   }

  //   // replace
  //   if (flagsSafe.imagesMode === 'replace') {
  //     if (images.length) {
  //       const slug =
  //         (update.$set as any).slug ??
  //         current.slug ??
  //         this.slugify(current.name);
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         images,
  //         `restaurants/${restaurantId}/menu-items/${slug}/images`,
  //       );
  //       nextImages = up.paths ?? [];
  //     } else if (Array.isArray((dto as any).images)) {
  //       nextImages = (dto as any).images!;
  //     }
  //   }

  //   // append
  //   if (flagsSafe.imagesMode === 'append') {
  //     if (images.length) {
  //       const slug =
  //         (update.$set as any).slug ??
  //         current.slug ??
  //         this.slugify(current.name);
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         images,
  //         `restaurants/${restaurantId}/menu-items/${slug}/images`,
  //       );
  //       nextImages = this.uniq([...nextImages, ...(up.paths ?? [])]);
  //     }
  //     if (Array.isArray((dto as any).images)) {
  //       nextImages = this.uniq([
  //         ...nextImages,
  //         ...((dto as any).images as string[]),
  //       ]);
  //     }
  //     if (flagsSafe.imagesRemovePaths?.length) {
  //       const rm = new Set(flagsSafe.imagesRemovePaths);
  //       nextImages = nextImages.filter((p) => !rm.has(p));
  //     }
  //   }

  //   // set if changed
  //   const changed =
  //     nextImages.length !== (current.images?.length ?? 0) ||
  //     nextImages.some((p, i) => p !== current.images?.[i]);
  //   if (changed) (update.$set as any).images = nextImages;

  //   (update.$set as any).updatedAt = new Date();

  //   try {
  //     const updated = await this.menuItemModel
  //       .findOneAndUpdate(filter, update, { new: true, lean: true })
  //       .exec();
  //     if (!updated) throw new NotFoundException('Menu item not found');

  //     return this.expandSignedUrls(updated);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists for this restaurant');
  //     }
  //     throw err;
  //   }
  // }
  async updateWithUploads(
    restaurantId: string,
    id: string,
    dto: UpdateMenuItemDto,
    images: Express.Multer.File[] = [],
    flags?: ImageFlags,
  ) {
    const restObj = new Types.ObjectId(restaurantId);
    const filter: FilterQuery<MenuItemDocument> = {
      _id: new Types.ObjectId(id),
      restaurantId: restObj,
    };

    const current = await this.menuItemModel.findOne(filter).lean();
    if (!current) throw new NotFoundException('Menu item not found');

    // ===== normalize theo schema mới (Money, variants, optionGroups) =====
    const normalizeMoney = (input: any, defaultCurrency = 'VND') => {
      if (input == null) return undefined;

      if (typeof input === 'number' || typeof input === 'bigint') {
        return {
          currency: defaultCurrency.toUpperCase(),
          amount: Number(input) || 0,
        };
      }

      if (typeof input === 'string') {
        const n = Number(input);
        if (!Number.isNaN(n)) {
          return {
            currency: defaultCurrency.toUpperCase(),
            amount: n,
          };
        }
        return undefined;
      }

      if (typeof input === 'object') {
        const amount = Number(input.amount ?? 0) || 0;
        const currency =
          (input.currency?.toString()?.toUpperCase() as string) ||
          defaultCurrency.toUpperCase();
        return { currency, amount };
      }

      return undefined;
    };

    const dtoNorm: any = { ...dto };

    // basePrice & compareAtPrice -> Money
    if ('basePrice' in dtoNorm) {
      dtoNorm.basePrice = normalizeMoney(dtoNorm.basePrice, 'VND');
    }
    if ('compareAtPrice' in dtoNorm) {
      dtoNorm.compareAtPrice = normalizeMoney(
        dtoNorm.compareAtPrice,
        dtoNorm.basePrice?.currency || 'VND',
      );
    }

    // variants[].price / variants[].compareAtPrice -> Money
    if (Array.isArray(dtoNorm.variants)) {
      const baseCurrency = dtoNorm.basePrice?.currency || 'VND';
      dtoNorm.variants = dtoNorm.variants.map((v: any) => {
        const vv = { ...v };

        if ('price' in vv) {
          vv.price = normalizeMoney(vv.price, baseCurrency);
        } else if (dtoNorm.basePrice) {
          vv.price = dtoNorm.basePrice;
        }

        if ('compareAtPrice' in vv) {
          vv.compareAtPrice = normalizeMoney(
            vv.compareAtPrice,
            vv.price?.currency || baseCurrency,
          );
        }

        return vv;
      });
    }

    // optionGroups[].options[].priceDelta -> Money
    if (Array.isArray(dtoNorm.optionGroups)) {
      const baseCurrency =
        dtoNorm.basePrice?.currency ||
        dtoNorm.compareAtPrice?.currency ||
        'VND';

      dtoNorm.optionGroups = dtoNorm.optionGroups.map((og: any) => {
        const ogg = { ...og };
        if (Array.isArray(ogg.options)) {
          ogg.options = ogg.options.map((opt: any) => {
            const oo = { ...opt };
            if ('priceDelta' in oo) {
              oo.priceDelta = normalizeMoney(oo.priceDelta, baseCurrency);
            } else {
              oo.priceDelta = normalizeMoney(0, baseCurrency);
            }
            return oo;
          });
        }
        return ogg;
      });
    }
    // ===== hết phần normalize =====

    const update: UpdateQuery<MenuItemDocument> = { $set: {} as any };

    // slug uniqueness (per restaurant)
    if (dtoNorm.slug && dtoNorm.slug.trim()) {
      const base = this.slugify(dtoNorm.slug);
      const ensured = await this.ensureUniqueSlugWithinRestaurant(
        restaurantId,
        base,
        String(current._id),
      );
      (update.$set as any).slug = ensured;
    }

    // simple fields (giữ nguyên list cũ, nhưng dùng dtoNorm)
    const simple: (keyof any)[] = [
      'name',
      'description',
      'tags',
      'cuisines',
      'itemType',
      'basePrice',
      'compareAtPrice',
      'variants',
      'optionGroups',
      'promotions',
      'vegetarian',
      'vegan',
      'halal',
      'glutenFree',
      'allergens',
      'spicyLevel',
      'isAvailable',
      'sortIndex',
      'extra',
      'categoryId',
      'discountPercent',
    ];
    for (const f of simple) {
      if (f in dtoNorm) (update.$set as any)[f] = dtoNorm[f];
    }
    if (dtoNorm.categoryId) {
      (update.$set as any).categoryId = new Types.ObjectId(dtoNorm.categoryId);
    }

    // images decision
    const flagsSafe: ImageFlags = {
      imagesMode: flags?.imagesMode ?? 'append',
      removeAllImages: !!flags?.removeAllImages,
      imagesRemovePaths: Array.isArray(flags?.imagesRemovePaths)
        ? flags!.imagesRemovePaths!
        : [],
    };

    let nextImages = Array.isArray(current.images) ? [...current.images] : [];

    // remove
    if (flagsSafe.imagesMode === 'remove' || flagsSafe.removeAllImages) {
      nextImages = flagsSafe.removeAllImages
        ? []
        : nextImages.filter(
          (p) => !new Set(flagsSafe.imagesRemovePaths).has(p),
        );
    }

    // replace
    if (flagsSafe.imagesMode === 'replace') {
      if (images.length) {
        const slug =
          (update.$set as any).slug ??
          current.slug ??
          this.slugify(current.name);
        const up = await this.uploadService.uploadMultipleToGCS(
          images,
          `restaurants/${restaurantId}/menu-items/${slug}/images`,
        );
        nextImages = up.paths ?? [];
      } else if (Array.isArray((dtoNorm as any).images)) {
        nextImages = (dtoNorm as any).images!;
      }
    }

    // append
    if (flagsSafe.imagesMode === 'append') {
      if (images.length) {
        const slug =
          (update.$set as any).slug ??
          current.slug ??
          this.slugify(current.name);
        const up = await this.uploadService.uploadMultipleToGCS(
          images,
          `restaurants/${restaurantId}/menu-items/${slug}/images`,
        );
        nextImages = this.uniq([...nextImages, ...(up.paths ?? [])]);
      }
      if (Array.isArray((dtoNorm as any).images)) {
        nextImages = this.uniq([
          ...nextImages,
          ...((dtoNorm as any).images as string[]),
        ]);
      }
      if (flagsSafe.imagesRemovePaths?.length) {
        const rm = new Set(flagsSafe.imagesRemovePaths);
        nextImages = nextImages.filter((p) => !rm.has(p));
      }
    }

    // set if changed
    const changed =
      nextImages.length !== (current.images?.length ?? 0) ||
      nextImages.some((p, i) => p !== current.images?.[i]);
    if (changed) (update.$set as any).images = nextImages;

    (update.$set as any).updatedAt = new Date();

    try {
      const updated = await this.menuItemModel
        .findOneAndUpdate(filter, update, { new: true, lean: true })
        .exec();
      if (!updated) throw new NotFoundException('Menu item not found');

      return this.expandSignedUrls(updated);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists for this restaurant');
      }
      throw err;
    }
  }


  // ---------- LIST ----------
  async findMany(restaurantId: string, q: QueryMenuItemsDto) {
    const restObj = new Types.ObjectId(restaurantId);

    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<MenuItemDocument> = { restaurantId: restObj };

    if (q.categoryId) filter.categoryId = new Types.ObjectId(q.categoryId);
    if (q.itemType) filter.itemType = q.itemType;
    if (q.isAvailable === 'true') filter.isAvailable = true;
    if (q.isAvailable === 'false') filter.isAvailable = false;

    const csv = (v?: string) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const tags = csv(q.tags);
    if (tags.length) filter.tags = { $all: tags };

    const cuisines = csv(q.cuisines);
    if (cuisines.length) filter.cuisines = { $all: cuisines };

    const sortMap = (s?: string) => {
      switch (s) {
        case 'createdAt':
          return { createdAt: 1 };
        case '-createdAt':
          return { createdAt: -1 };
        case 'name':
          return { name: 1 };
        case '-name':
          return { name: -1 };
        case 'rating':
          return { rating: 1 }; // nếu bạn có rating ở extra
        case '-rating':
          return { rating: -1 };
        case 'price':
          return { 'basePrice.amount': 1 };
        case '-price':
          return { 'basePrice.amount': -1 };
        case 'sortIndex':
          return { sortIndex: 1 };
        case '-sortIndex':
          return { sortIndex: -1 };
        default:
          return { createdAt: -1 };
      }
    };

    const pipeline: any[] = [{ $match: filter }];

    if (q.q && q.q.trim()) {
      pipeline.push({ $match: { $text: { $search: q.q.trim() } } });
      pipeline.push({ $addFields: { textScore: { $meta: 'textScore' } } });
    }

    if (q.q && q.q.trim()) {
      pipeline.push({ $sort: { textScore: -1, ...sortMap(q.sort) } });
    } else {
      pipeline.push({ $sort: sortMap(q.sort) });
    }

    pipeline.push({ $skip: skip }, { $limit: limit });

    const countFilter: FilterQuery<MenuItemDocument> = { ...filter };
    if (q.q && q.q.trim()) countFilter.$text = { $search: q.q.trim() };

    const [items, total] = await Promise.all([
      this.menuItemModel.aggregate(pipeline).exec(),
      this.menuItemModel.countDocuments(countFilter),
    ]);

    const withSigned = await Promise.all(
      items.map((it) => this.expandSignedUrls(it)),
    );

    return {
      restaurantId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items: withSigned,
    };
  }

  // ---------- DETAIL ----------
  async findDetail(restaurantId: string, idOrSlug: string) {
    const restObj = new Types.ObjectId(restaurantId);
    const isId = Types.ObjectId.isValid(idOrSlug);

    const doc = await this.menuItemModel
      .findOne(
        isId
          ? { _id: idOrSlug, restaurantId: restObj }
          : { slug: idOrSlug.toLowerCase(), restaurantId: restObj },
      )
      .lean();

    if (!doc) throw new NotFoundException('Menu item not found');
    return this.expandSignedUrls(doc);
  }

  // // ---------- UPDATE ----------
  // async updateById(
  //   restaurantId: string,
  //   id: string,
  //   dto: UpdateMenuItemDto,
  //   images?: Express.Multer.File[],
  //   flags?: ImageFlags,
  // ) {
  //   const restObj = new Types.ObjectId(restaurantId);
  //   const filter: FilterQuery<MenuItemDocument> = {
  //     _id: new Types.ObjectId(id),
  //     restaurantId: restObj,
  //   };

  //   const current = await this.menuItemModel.findOne(filter).lean();
  //   if (!current) throw new NotFoundException('Menu item not found');

  //   const update: UpdateQuery<MenuItemDocument> = { $set: {} as any };
  //   const $unset: Record<string, ''> = {};

  //   // slug uniqueness (per restaurant)
  //   if (dto.slug && dto.slug.trim()) {
  //     const base = this.slugify(dto.slug);
  //     const ensured = await this.ensureUniqueSlugWithinRestaurant(
  //       restaurantId,
  //       base,
  //       String(current._id),
  //     );
  //     (update.$set as any).slug = ensured;
  //   }

  //   // simple fields
  //   const simple: (keyof any)[] = [
  //     'name',
  //     'description',
  //     'tags',
  //     'cuisines',
  //     'itemType',
  //     'basePrice',
  //     'compareAtPrice',
  //     'variants',
  //     'optionGroups',
  //     'promotions',
  //     'vegetarian',
  //     'vegan',
  //     'halal',
  //     'glutenFree',
  //     'allergens',
  //     'spicyLevel',
  //     'isAvailable',
  //     'sortIndex',
  //     'extra',
  //     'categoryId',
  //   ];
  //   for (const f of simple) {
  //     if (f in dto) (update.$set as any)[f] = (dto as any)[f];
  //   }
  //   if (dto.categoryId) {
  //     (update.$set as any).categoryId = new Types.ObjectId(dto.categoryId);
  //   }

  //   // images decision
  //   const flagsSafe: ImageFlags = {
  //     imagesMode: flags?.imagesMode ?? 'append',
  //     removeAllImages: !!flags?.removeAllImages,
  //     imagesRemovePaths: Array.isArray(flags?.imagesRemovePaths)
  //       ? flags!.imagesRemovePaths!
  //       : [],
  //   };

  //   let nextImages = Array.isArray(current.images) ? [...current.images] : [];

  //   // remove
  //   if (flagsSafe.imagesMode === 'remove' || flagsSafe.removeAllImages) {
  //     nextImages = flagsSafe.removeAllImages
  //       ? []
  //       : nextImages.filter(
  //           (p) => !new Set(flagsSafe.imagesRemovePaths).has(p),
  //         );
  //   }

  //   // replace
  //   if (flagsSafe.imagesMode === 'replace') {
  //     if (images?.length) {
  //       const slug =
  //         (update.$set as any).slug ??
  //         current.slug ??
  //         this.slugify(current.name);
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         images,
  //         `restaurants/${restaurantId}/menu-items/${slug}/images`,
  //       );
  //       nextImages = up.paths ?? [];
  //     } else if (Array.isArray((dto as any).images)) {
  //       nextImages = (dto as any).images!;
  //     }
  //   }

  //   // append
  //   if (flagsSafe.imagesMode === 'append') {
  //     if (images?.length) {
  //       const slug =
  //         (update.$set as any).slug ??
  //         current.slug ??
  //         this.slugify(current.name);
  //       const up = await this.uploadService.uploadMultipleToGCS(
  //         images,
  //         `restaurants/${restaurantId}/menu-items/${slug}/images`,
  //       );
  //       nextImages = this.uniq([...nextImages, ...(up.paths ?? [])]);
  //     }
  //     if (Array.isArray((dto as any).images)) {
  //       nextImages = this.uniq([
  //         ...nextImages,
  //         ...((dto as any).images as string[]),
  //       ]);
  //     }
  //     if (flagsSafe.imagesRemovePaths?.length) {
  //       const rm = new Set(flagsSafe.imagesRemovePaths);
  //       nextImages = nextImages.filter((p) => !rm.has(p));
  //     }
  //   }

  //   // set if changed
  //   const changed =
  //     nextImages.length !== (current.images?.length ?? 0) ||
  //     nextImages.some((p, i) => p !== current.images?.[i]);
  //   if (changed) (update.$set as any).images = nextImages;

  //   (update.$set as any).updatedAt = new Date();

  //   try {
  //     const updated = await this.menuItemModel
  //       .findOneAndUpdate(filter, update, { new: true, lean: true })
  //       .exec();
  //     if (!updated) throw new NotFoundException('Menu item not found');

  //     return this.expandSignedUrls(updated);
  //   } catch (err: any) {
  //     if (err?.code === 11000 && err?.keyPattern?.slug) {
  //       throw new ConflictException('Slug already exists for this restaurant');
  //     }
  //     throw err;
  //   }
  // }

  // ---------- DELETE ----------
  async removeById(restaurantId: string, id: string) {
    const restObj = new Types.ObjectId(restaurantId);
    const deleted = await this.menuItemModel
      .findOneAndDelete({ _id: id, restaurantId: restObj })
      .lean();
    if (!deleted) throw new NotFoundException('Menu item not found');
    // (tuỳ bạn) có thể xoá file trong GCS theo images ở đây, nhưng cẩn trọng vì có thể reuse
    return { ok: true, id, restaurantId };
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Menu item not found');
    }

    const doc = await this.menuItemModel.findById(id).lean();
    if (!doc) {
      throw new NotFoundException('Menu item not found');
    }

    return this.expandSignedUrls(doc);
  }
}
