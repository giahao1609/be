import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { AdminCategoriesService } from './owner-categories.service';
import { CreateCategoryDto, ListCategoriesQueryDto, MoveCategoryDto, ReorderDto, UpdateCategoryDto } from './dto/category.dto';



// === Guard/Role của bạn ===
// Nếu bạn đã có sẵn, bỏ comment và sửa path cho đúng dự án
// import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
// import { RolesGuard } from '@/auth/roles.guard';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
// @UseGuards(JwtAuthGuard, RolesGuard)
@Controller('owner/restaurants/:restaurantId/categories')
export class AdminCategoriesController {
  constructor(private readonly service: AdminCategoriesService) {}

  // CREATE — chỉ ADMIN
  @Post()
  @SetMetadata('roles', ['admin'])
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.service.create(restaurantId, dto);
  }

  @Get()
  list(
    @Param('restaurantId') restaurantId: string,
    @Query()
    query: Omit<ListCategoriesQueryDto, 'restaurantId'> &
      Partial<ListCategoriesQueryDto>,
  ) {
    return this.service.list({ ...(query as any), restaurantId });
  }

  // TREE (từ parentId; root: parentId=null hoặc không truyền)
  @Get('tree')
  tree(
    @Param('restaurantId') restaurantId: string,
    @Query('parentId') parentId?: string | null,
  ) {
    const pid =
      parentId === undefined ? undefined : parentId === 'null' ? null : parentId;
    return this.service.getTree(restaurantId, pid);
  }

  // GET by id
  @Get('id/:id')
  getById(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.service.findById(restaurantId, id);
  }

  // GET by slug
  @Get('slug/:slug')
  getBySlug(
    @Param('restaurantId') restaurantId: string,
    @Param('slug') slug: string,
  ) {
    return this.service.findBySlug(restaurantId, slug);
  }

  // UPDATE by id
  @Put('id/:id')
  updateById(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.updateById(restaurantId, id, dto);
  }

  // UPDATE by slug
  @Put('slug/:slug')
  updateBySlug(
    @Param('restaurantId') restaurantId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.updateBySlug(restaurantId, slug, dto);
  }

  // MOVE (đổi parent)
  @Patch('id/:id/move')
  move(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: MoveCategoryDto,
  ) {
    return this.service.move(restaurantId, id, dto);
  }

  // REORDER (set sortIndex hàng loạt)
  @Patch('reorder')
  reorder(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(restaurantId, dto);
  }

  // DELETE by id
  @Delete('id/:id')
  deleteById(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteById(restaurantId, id);
  }

  // DELETE by slug
  @Delete('slug/:slug')
  deleteBySlug(
    @Param('restaurantId') restaurantId: string,
    @Param('slug') slug: string,
  ) {
    return this.service.deleteBySlug(restaurantId, slug);
  }
}
