import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schema/category.schema';
import { CreateCategoryDto, ListCategoriesQueryDto, MoveCategoryDto, ReorderDto, UpdateCategoryDto } from './dto/category.dto';


@Injectable()
export class AdminCategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  private slugify(input: string) {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private async ensureUniqueSlug(
    restaurantId: Types.ObjectId,
    base: string,
    excludeId?: Types.ObjectId,
  ) {
    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const cond: any = { restaurantId, slug };
      if (excludeId) cond._id = { $ne: excludeId };
      const exists = await this.categoryModel.exists(cond);
      if (!exists) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }

  private async buildTreeInfo(
    restaurantId: Types.ObjectId,
    parentId?: Types.ObjectId | null,
  ) {
    if (!parentId) {
      return { parentId: null, ancestors: [], depth: 0, pathPrefix: '' };
    }
    const parent = await this.categoryModel
      .findOne({ _id: parentId, restaurantId })
      .lean();
    if (!parent) throw new BadRequestException('Parent category not found');
    const ancestors = [...(parent.ancestors ?? []), parent._id];
    const depth = (parent.depth ?? 0) + 1;
    const pathPrefix = parent.path ? `${parent.path}/` : '';
    return { parentId, ancestors, depth, pathPrefix };
  }

  private async assertNoCycle(
    restaurantId: Types.ObjectId,
    categoryId: Types.ObjectId,
    newParentId?: Types.ObjectId | null,
  ) {
    if (!newParentId) return;
    if (categoryId.equals(newParentId))
      throw new BadRequestException('Cannot move a category under itself');

    const descendant = await this.categoryModel.exists({
      _id: newParentId,
      restaurantId,
      ancestors: categoryId,
    });
    if (descendant)
      throw new BadRequestException('Cannot move category into its descendant');
  }

  // ---------- CRUD ----------
  async create(restaurantId: string, dto: CreateCategoryDto) {
    const restId = new Types.ObjectId(restaurantId);

    const { parentId: parentIdStr, name } = dto;
    const parentId = parentIdStr ? new Types.ObjectId(parentIdStr) : null;

    const slugBase = dto.slug?.trim() || this.slugify(name);
    const uniqueSlug = await this.ensureUniqueSlug(restId, slugBase);

    const { ancestors, depth, pathPrefix } = await this.buildTreeInfo(
      restId,
      parentId,
    );

    try {
      const doc = await this.categoryModel.create({
        restaurantId: restId,
        name: name.trim(),
        slug: uniqueSlug,
        description: dto.description,
        image: dto.image,
        parentId,
        ancestors,
        depth,
        path: `${pathPrefix}${uniqueSlug}`,
        isActive: dto.isActive ?? true,
        sortIndex: dto.sortIndex ?? 0,
        extra: dto.extra ?? {},
      });
      return doc.toObject();
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new ConflictException('Slug already exists for this restaurant');
      }
      throw e;
    }
  }

  async findById(restaurantId: string, id: string) {
    const doc = await this.categoryModel
      .findOne({ _id: id, restaurantId })
      .lean();
    if (!doc) throw new NotFoundException('Category not found');
    return doc;
  }

  async findBySlug(restaurantId: string, slug: string) {
    const doc = await this.categoryModel
      .findOne({ slug: slug.toLowerCase(), restaurantId })
      .lean();
    if (!doc) throw new NotFoundException('Category not found');
    return doc;
  }

  async list(qs: ListCategoriesQueryDto) {
    const {
      restaurantId,
      q,
      isActive,
      parentId,
      page = 1,
      limit = 50,
      sort = 'sortIndex:asc,createdAt:desc',
    } = qs;

    const filter: FilterQuery<Category> = {
      restaurantId: new Types.ObjectId(restaurantId),
    };

    if (typeof isActive === 'boolean') filter.isActive = isActive;

    if (parentId === (null as any) || parentId === 'null') {
      filter.parentId = null;
    } else if (typeof parentId === 'string') {
      filter.parentId = new Types.ObjectId(parentId);
    }

    if (q) filter.$text = { $search: q };

    const sortSpec: Record<string, 1 | -1> = {};
    for (const part of sort.split(',')) {
      const [k, dir] = part.split(':');
      if (!k) continue;
      sortSpec[k] = (dir?.toLowerCase() === 'desc' ? -1 : 1) as 1 | -1;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.categoryModel.countDocuments(filter),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateById(
    restaurantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ) {
    const restId = new Types.ObjectId(restaurantId);
    const catId = new Types.ObjectId(id);

    let nextSlug: string | undefined;
    if (dto.name && !dto.slug) {
      nextSlug = await this.ensureUniqueSlug(
        restId,
        this.slugify(dto.name),
        catId,
      );
    } else if (dto.slug) {
      nextSlug = await this.ensureUniqueSlug(
        restId,
        dto.slug.trim().toLowerCase(),
        catId,
      );
    }

    let parentChanged = false;
    let nextParentId: Types.ObjectId | null | undefined;
    if (dto.parentId !== undefined) {
      nextParentId = dto.parentId ? new Types.ObjectId(dto.parentId) : null;
      parentChanged = true;
      await this.assertNoCycle(restId, catId, nextParentId ?? null);
    }

    const current = await this.categoryModel
      .findOne({ _id: catId, restaurantId: restId })
      .lean();
    if (!current) throw new NotFoundException('Category not found');

    let ancestors = current.ancestors ?? [];
    let depth = current.depth ?? 0;
    let path = current.path ?? current.slug;

    if (parentChanged) {
      const info = await this.buildTreeInfo(restId, nextParentId ?? null);
      ancestors = info.ancestors;
      depth = info.depth;
      const newSlug = nextSlug ?? current.slug;
      path = `${info.pathPrefix}${newSlug}`;
    } else if (nextSlug) {
      const prefix =
        current.path?.endsWith(current.slug) && current.path
          ? current.path.slice(0, -current.slug.length)
          : '';
      path = `${prefix}${nextSlug}`;
    }

    try {
      const updated = await this.categoryModel
        .findOneAndUpdate(
          { _id: catId, restaurantId: restId },
          {
            $set: {
              name: dto.name ?? current.name,
              slug: nextSlug ?? current.slug,
              description: dto.description ?? current.description,
              image: dto.image ?? current.image,
              parentId:
                dto.parentId !== undefined
                  ? nextParentId ?? null
                  : current.parentId,
              ancestors,
              depth,
              path,
              isActive: dto.isActive ?? current.isActive,
              sortIndex: dto.sortIndex ?? current.sortIndex,
              extra: dto.extra ?? current.extra,
            },
          },
          { new: true, runValidators: true },
        )
        .lean();

      if (!updated) throw new NotFoundException('Category not found');

      if (parentChanged || nextSlug) {
        const oldPathPrefix = current.path ? `${current.path}/` : '';
        const newPathPrefix = updated.path ? `${updated.path}/` : '';
        const oldAncestors = current.ancestors ?? [];
        const newAncestors = updated.ancestors ?? [];
        const oldDepth = current.depth ?? 0;
        const newDepth = updated.depth ?? 0;

        const descendants = await this.categoryModel
          .find(
            { restaurantId: restId, ancestors: catId },
            { _id: 1, path: 1, depth: 1, ancestors: 1 },
          )
          .lean();

        if (descendants.length) {
          const bulkOps = descendants.map((d) => {
            let nextPath = d.path ?? '';
            if (oldPathPrefix && nextPath.startsWith(oldPathPrefix)) {
              nextPath = newPathPrefix + nextPath.slice(oldPathPrefix.length);
            }
            const deltaDepth = newDepth - oldDepth;
            const nextDepth = (d.depth ?? 0) + deltaDepth;

            const idx = (d.ancestors ?? []).findIndex((x: any) =>
              new Types.ObjectId(x).equals(catId),
            );
            const tail = idx >= 0 ? (d.ancestors ?? []).slice(idx + 1) : [];
            const nextAncestors = [...newAncestors, catId, ...tail];

            return {
              updateOne: {
                filter: { _id: d._id },
                update: {
                  $set: {
                    path: nextPath,
                    depth: nextDepth,
                    ancestors: nextAncestors,
                  },
                },
              },
            };
          });

          await this.categoryModel.bulkWrite(bulkOps, { ordered: false });
        }
      }

      return updated;
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new ConflictException('Slug already exists for this restaurant');
      }
      throw e;
    }
  }

  async updateBySlug(
    restaurantId: string,
    slug: string,
    dto: UpdateCategoryDto,
  ) {
    const doc = await this.categoryModel
      .findOne({ restaurantId, slug: slug.toLowerCase() })
      .lean();
    if (!doc) throw new NotFoundException('Category not found');
    return this.updateById(restaurantId, String(doc._id), dto);
  }

  async deleteById(restaurantId: string, id: string) {
    const restId = new Types.ObjectId(restaurantId);
    const catId = new Types.ObjectId(id);

    const hasChild = await this.categoryModel.exists({
      restaurantId: restId,
      parentId: catId,
    });
    if (hasChild) {
      throw new BadRequestException(
        'Cannot delete category that has child categories',
      );
    }

    const res = await this.categoryModel.deleteOne({
      _id: catId,
      restaurantId: restId,
    });
    if (res.deletedCount !== 1) throw new NotFoundException('Category not found');
    return { deleted: true };
  }

  async deleteBySlug(restaurantId: string, slug: string) {
    const doc = await this.categoryModel
      .findOne({ restaurantId, slug: slug.toLowerCase() }, { _id: 1 })
      .lean();
    if (!doc) throw new NotFoundException('Category not found');
    return this.deleteById(restaurantId, String(doc._id));
  }

  async reorder(restaurantId: string, body: ReorderDto) {
    const restId = new Types.ObjectId(restaurantId);

    const ops = body.items.map((it) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(it.id), restaurantId: restId },
        update: { $set: { sortIndex: it.sortIndex } },
      },
    }));

    const r: any = await this.categoryModel.bulkWrite(ops as any, {
      ordered: false,
    });

    return {
      matched: r.matchedCount ?? r.nMatched ?? r.result?.nMatched ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? r.result?.nModified ?? 0,
    };
  }

  async move(restaurantId: string, id: string, dto: MoveCategoryDto) {
    // UpdateCategoryDto đã là PartialType(CreateCategoryDto) → truyền mỗi parentId OK
    return this.updateById(restaurantId, id, {
      parentId: dto.newParentId ?? null,
    } as UpdateCategoryDto);
  }

  async getTree(restaurantId: string, parentId?: string | null) {
    const restId = new Types.ObjectId(restaurantId);

    let rootFilter: FilterQuery<Category> = { restaurantId: restId };
    if (parentId === null || parentId === 'null' || parentId === undefined) {
      rootFilter.parentId = null;
    } else if (parentId) {
      rootFilter.parentId = new Types.ObjectId(parentId);
    }

    const nodes = await this.categoryModel
      .find(
        { restaurantId: restId },
        { _id: 1, name: 1, slug: 1, parentId: 1, sortIndex: 1, isActive: 1 },
      )
      .sort({ sortIndex: 1, name: 1 })
      .lean();

    const byParent = new Map<string, any[]>();
    for (const n of nodes) {
      const key = n.parentId ? String(n.parentId) : 'ROOT';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(n);
    }

    const build = (pidKey: string) => {
      const arr = byParent.get(pidKey) ?? [];
      return arr.map((n) => ({
        ...n,
        children: build(String(n._id)),
      }));
    };

    const startKey =
      rootFilter.parentId === null || rootFilter.parentId === undefined
        ? 'ROOT'
        : String(rootFilter.parentId);

    return build(startKey);
  }
}
