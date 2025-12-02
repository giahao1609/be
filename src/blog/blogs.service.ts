// src/blog/blogs.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { BlogPost, BlogDocument } from './schema/blog.schema';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { QueryBlogsDto } from './dto/query-blog.dto';
import { UploadService } from 'src/upload/upload.service';

export type UploadFiles = {
  hero?: Express.Multer.File[];
  gallery?: Express.Multer.File[];
};



@Injectable()
export class BlogsService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly blogModel: Model<BlogDocument>,
    private readonly uploadService: UploadService,
  ) { }

  private async expandSignedUrls(doc: any) {
    if (!doc) return doc;

    const out: any = { ...doc };

    const signed = async (p?: string | null) =>
      p ? (await this.uploadService.getSignedUrl(p)) : null;

    // hero
    out.heroImageUrlSigned = doc.heroImageUrl
      ? await signed(doc.heroImageUrl)
      : null;

    // gallery
    if (Array.isArray(doc.gallery) && doc.gallery.length) {
      out.gallerySigned = await Promise.all(
        doc.gallery.map(async (p: string) => ({
          path: p,
          url: await signed(p),
        })),
      );
    } else {
      out.gallerySigned = [];
    }

    return out;
  }


  private toObjectId(id: string) {
    return new Types.ObjectId(id);
  }

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

  private parseCsv(v?: string) {
    if (!v) return [];
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private buildSearchTerms(data: {
    title?: string;
    subtitle?: string;
    tags?: string[];
    categories?: string[];
  }) {
    const list = [
      data.title,
      data.subtitle,
      ...(data.tags ?? []),
      ...(data.categories ?? []),
    ]
      .filter(Boolean)
      .map((s) => s!.toLowerCase());
    return this.uniqStrings(list);
  }

  private async handleUploadsForBlog(
    slug: string,
    files?: UploadFiles,
  ): Promise<{ heroPath?: string; galleryPaths: string[] }> {
    const result: { heroPath?: string; galleryPaths: string[] } = {
      galleryPaths: [],
    };

    if (!files) return result;

    if (files.hero?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.hero,
        `blogs/${slug}/hero`,
      );
      result.heroPath = up.paths?.[0];
    }

    if (files.gallery?.length) {
      const up = await this.uploadService.uploadMultipleToGCS(
        files.gallery,
        `blogs/${slug}/gallery`,
      );
      result.galleryPaths = up.paths ?? [];
    }

    return result;
  }

  private estimateReadingMinutes(contentHtml?: string): number {
    if (!contentHtml) return 3;
    const text = contentHtml.replace(/<[^>]+>/g, ' ');
    const words = text.split(/\s+/).filter(Boolean);
    const wpm = 250;
    const minutes = Math.max(1, Math.round(words.length / wpm));
    return minutes;
  }


  // ========= CREATE =========
  async createForAuthor(
    authorId: string,
    dto: CreateBlogDto,
    files?: UploadFiles,
  ) {
    if (!authorId) throw new BadRequestException('authorId is required');

    const authorObjectId = this.toObjectId(authorId);

    // slug
    let baseSlug = dto.slug
      ? this.slugify(dto.slug)
      : this.slugify(dto.title ?? '');
    if (!baseSlug) throw new BadRequestException('Invalid slug/title');

    let slug = baseSlug;
    let i = 1;
    while (await this.blogModel.exists({ slug })) {
      slug = `${baseSlug}-${i++}`;
    }

    const tags = this.uniqStrings(dto.tags);
    const categories = this.uniqStrings(dto.categories);
    const keywords = this.uniqStrings(dto.keywords);

    const uploads = await this.handleUploadsForBlog(slug, files);

    const readingMinutes =
      dto.readingMinutes ?? this.estimateReadingMinutes(dto.contentHtml);

    const searchTerms = this.buildSearchTerms({
      title: dto.title,
      subtitle: dto.subtitle,
      tags,
      categories,
    });

    const doc = new this.blogModel({
      authorId: authorObjectId,
      title: dto.title,
      subtitle: dto.subtitle,
      slug,
      excerpt: dto.excerpt,
      contentHtml: dto.contentHtml,
      contentJson: dto.contentJson ?? undefined,
      tags,
      categories,
      heroImageUrl: uploads.heroPath ?? undefined,
      gallery: uploads.galleryPaths,
      readingMinutes,
      status: dto.status ?? 'DRAFT',
      publishedAt: dto.status === 'PUBLISHED' ? new Date() : undefined,
      metaTitle: dto.metaTitle ?? dto.title ?? '',
      metaDescription: dto.metaDescription ?? dto.excerpt ?? '',
      keywords,
      searchTerms,
      viewCount: 0,
      likeCount: 0,
      isFeatured: false,
    });

    try {
      const saved = await doc.save();
      const lean = saved.toObject();
      return this.expandSignedUrls(lean);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists');
      }
      throw err;
    }
  }

  // ========= UPDATE =========
  async updateOneForAuthor(
    id: string,
    authorId: string,
    dto: UpdateBlogDto & Record<string, any>,
    files?: UploadFiles,
  ) {
    const _id = this.toObjectId(id);
    const authorObjectId = this.toObjectId(authorId);

    const current = await this.blogModel
      .findOne({ _id, authorId: authorObjectId })
      .lean()
      .exec();
    if (!current) throw new NotFoundException('BLOG_NOT_FOUND');

    const update: UpdateQuery<BlogDocument> = { $set: {} as any };
    const $unset: Record<string, ''> = {};

    // slug
    let nextSlug: string = current.slug;
    if (dto.slug && dto.slug.trim()) {
      const baseSlug = this.slugify(dto.slug);
      if (!baseSlug) throw new BadRequestException('Invalid slug');
      let candidate = baseSlug;
      let i = 1;
      while (
        await this.blogModel.exists({
          slug: candidate,
          _id: { $ne: _id },
        })
      ) {
        candidate = `${baseSlug}-${i++}`;
      }
      nextSlug = candidate;
      (update.$set as any).slug = nextSlug;
    }

    const simpleFields: (keyof UpdateBlogDto)[] = [
      'title',
      'subtitle',
      'excerpt',
      'contentHtml',
      'contentJson',
      'readingMinutes',
      'status',
      'metaTitle',
      'metaDescription',
    ];

    for (const f of simpleFields) {
      if (Object.prototype.hasOwnProperty.call(dto, f)) {
        (update.$set as any)[f] = (dto as any)[f];
      }
    }

    // tags / categories / keywords
    const normArr = (v: any) =>
      Array.isArray(v) ? this.uniqStrings(v.map(String)) : undefined;
    if (Object.prototype.hasOwnProperty.call(dto, 'tags')) {
      (update.$set as any).tags = normArr(dto.tags) ?? [];
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'categories')) {
      (update.$set as any).categories = normArr(dto.categories) ?? [];
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'keywords')) {
      (update.$set as any).keywords = normArr(dto.keywords) ?? [];
    }

    // status -> publishedAt
    if (dto.status && dto.status !== current.status) {
      if (dto.status === 'PUBLISHED' && !current.publishedAt) {
        (update.$set as any).publishedAt = new Date();
      }
      if (dto.status !== 'PUBLISHED') {
        // cho phép giữ publishedAt nếu ông muốn, ở đây tạm thời giữ nguyên
      }
    }

    // upload hero / gallery
    const uploads = await this.handleUploadsForBlog(nextSlug, files);

    if (uploads.heroPath) {
      (update.$set as any).heroImageUrl = uploads.heroPath;
    } else if ('heroImageUrl' in dto) {
      const v = dto.heroImageUrl;
      if (!v) $unset['heroImageUrl'] = '';
      else (update.$set as any).heroImageUrl = v;
    }

    const currentGallery: string[] = Array.isArray(current.gallery)
      ? current.gallery
      : [];
    let nextGallery = [...currentGallery];

    if (uploads.galleryPaths.length) {
      nextGallery = this.uniqStrings([
        ...nextGallery,
        ...uploads.galleryPaths,
      ]);
    }
    if (Array.isArray(dto.gallery)) {
      // nếu FE gửi gallery mới -> replace luôn
      nextGallery = this.uniqStrings(dto.gallery);
    }
    if (
      nextGallery.length !== currentGallery.length ||
      nextGallery.some((p, i) => p !== currentGallery[i])
    ) {
      (update.$set as any).gallery = nextGallery;
    }

    // auto update readingMinutes nếu contentHtml thay đổi mà client không set
    const contentHtmlChanged =
      (update.$set as any).contentHtml &&
      (update.$set as any).contentHtml !== current.contentHtml;
    if (contentHtmlChanged && !('readingMinutes' in dto)) {
      (update.$set as any).readingMinutes = this.estimateReadingMinutes(
        (update.$set as any).contentHtml,
      );
    }

    // auto searchTerms nếu title/tags/categories đổi mà client không gửi searchTerms
    const searchTermsProvided = Object.prototype.hasOwnProperty.call(
      dto,
      'searchTerms',
    );
    if (!searchTermsProvided) {
      const temp = {
        title:
          (update.$set as any).title !== undefined
            ? (update.$set as any).title
            : current.title,
        subtitle:
          (update.$set as any).subtitle !== undefined
            ? (update.$set as any).subtitle
            : current.subtitle,
        tags:
          (update.$set as any).tags !== undefined
            ? (update.$set as any).tags
            : current.tags,
        categories:
          (update.$set as any).categories !== undefined
            ? (update.$set as any).categories
            : current.categories,
      };
      (update.$set as any).searchTerms = this.buildSearchTerms(temp);
    } else {
      (update.$set as any).searchTerms = this.uniqStrings(
        dto.searchTerms as any,
      );
    }

    (update.$set as any).updatedAt = new Date();
    if (Object.keys($unset).length) (update as any).$unset = $unset;

    try {
      const updated = await this.blogModel
        .findOneAndUpdate({ _id, authorId: authorObjectId }, update, {
          new: true,
          lean: true,
        })
        .exec();
      if (!updated) throw new NotFoundException('BLOG_NOT_FOUND');

      return this.expandSignedUrls(updated);
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.slug) {
        throw new ConflictException('Slug already exists');
      }
      throw err;
    }
  }

  // ========= PUBLIC LIST / DETAIL =========
  private sortMap(sort?: string) {
    switch (sort) {
      case 'createdAt':
        return { createdAt: 1 };
      case '-createdAt':
        return { createdAt: -1 };
      case 'publishedAt':
        return { publishedAt: 1 };
      case '-publishedAt':
        return { publishedAt: -1 };
      case 'views':
        return { viewCount: -1 };
      case 'likes':
        return { likeCount: -1 };
      default:
        return { publishedAt: -1, createdAt: -1 };
    }
  }

  async listPublic(q: QueryBlogsDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 12)));
    const skip = (page - 1) * limit;

    const tagList = this.parseCsv(q.tags);
    const catList = this.parseCsv(q.categories);

    const baseFilter: FilterQuery<BlogDocument> = {
      status: (q.status as any) ?? 'PUBLISHED',
    };

    if (q.authorId) baseFilter.authorId = this.toObjectId(q.authorId);
    if (tagList.length) baseFilter.tags = { $all: tagList };
    if (catList.length) baseFilter.categories = { $all: catList };

    const textSearch = q.q?.trim();
    const sortObj = this.sortMap(undefined) as any;

    const filterForCount: any = { ...baseFilter };
    if (textSearch) {
      filterForCount.$text = { $search: textSearch };
    }

    const findQuery = this.blogModel
      .find(baseFilter)
      .lean()
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    if (textSearch) {
      findQuery.where({ $text: { $search: textSearch } });
      findQuery.sort({ score: { $meta: 'textScore' }, ...sortObj } as any);
      (findQuery as any).select({ score: { $meta: 'textScore' } });
    }

    const [itemsRaw, total] = await Promise.all([
      findQuery.exec(),
      this.blogModel.countDocuments(filterForCount).exec(),
    ]);

    const items = await Promise.all(
      itemsRaw.map((it) => this.expandSignedUrls(it)),
    );

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    };
  }

  async detailPublic(idOrSlug: string) {
    const isObjectId = Types.ObjectId.isValid(idOrSlug);
    const filter: FilterQuery<BlogDocument> = isObjectId
      ? { _id: this.toObjectId(idOrSlug) }
      : { slug: idOrSlug.toLowerCase() };

    const doc = await this.blogModel
      .findOne({ ...filter, status: 'PUBLISHED' })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('BLOG_NOT_FOUND');

    await this.blogModel.updateOne(
      { _id: doc._id },
      { $inc: { viewCount: 1 } },
    );

    return this.expandSignedUrls(doc);
  }

  // ========= OWNER LIST =========
  async listForAuthor(authorId: string, q: QueryBlogsDto) {
    const authorObjectId = this.toObjectId(authorId);
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;

    const baseFilter: FilterQuery<BlogDocument> = {
      authorId: authorObjectId,
    };
    if (q.status) baseFilter.status = q.status as any;

    const [itemsRaw, total] = await Promise.all([
      this.blogModel
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .lean()
        .skip(skip)
        .limit(limit)
        .exec(),
      this.blogModel.countDocuments(baseFilter).exec(),
    ]);

    const items = await Promise.all(
      itemsRaw.map((it) => this.expandSignedUrls(it)),
    );

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    };
  }

  async deleteForAuthor(id: string, authorId: string) {
    const _id = this.toObjectId(id);
    const authorObjectId = this.toObjectId(authorId);

    const res = await this.blogModel
      .deleteOne({ _id, authorId: authorObjectId })
      .exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException('BLOG_NOT_FOUND');
    }
    return { success: true };
  }

  async listAllWithPagination(
    params: QueryBlogsDto & { page: number; limit: number },
  ) {
    const { page, limit } = params;

    const filter: FilterQuery<BlogDocument> = {};
    // if (search) {
    //   filter.$or = [
    //     { title: { $regex: search, $options: 'i' } },
    //     { slug: { $regex: search, $options: 'i' } },
    //   ];
    // }

    const skip = (page - 1) * limit;

    const [itemsRaw, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.blogModel.countDocuments(filter),
    ]);

    const items = await Promise.all(
      itemsRaw.map((it) => this.expandSignedUrls(it)),
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getOneDetail(id: string) {
    const blogId = this.toObjectId(id);

    const doc = await this.blogModel
      .findOne({ _id: blogId })
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException('Blog not found');
    }

    const withSigned = await this.expandSignedUrls(doc);
    return withSigned;
  }

}
