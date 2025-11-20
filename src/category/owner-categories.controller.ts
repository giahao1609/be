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
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  MoveCategoryDto,
  ReorderDto,
  UpdateCategoryDto,
} from './dto/category.dto';

// === Guard/Role của bạn ===
// Nếu bạn đã có sẵn, bỏ comment và sửa path cho đúng dự án
// import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
// import { RolesGuard } from '@/auth/roles.guard';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
// @UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly service: AdminCategoriesService) {}

  @Post()
  // @SetMetadata('roles', ['admin'])
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() query: ListCategoriesQueryDto) {
    return this.service.list(query);
  }

  // TREE (từ parentId; root: parentId=null hoặc không truyền)
  @Get('tree')
  tree(@Query('parentId') parentId?: string | null) {
    const pid =
      parentId === undefined ? undefined : parentId === 'null' ? null : parentId;
    return this.service.getTree(pid);
  }

  // GET by id
  @Get('id/:id')
  getById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  // GET by slug
  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  // UPDATE by id
  @Put('id/:id')
  updateById(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateById(id, dto);
  }

  // UPDATE by slug
  @Put('slug/:slug')
  updateBySlug(@Param('slug') slug: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateBySlug(slug, dto);
  }

  // MOVE (đổi parent)
  @Patch('id/:id/move')
  move(@Param('id') id: string, @Body() dto: MoveCategoryDto) {
    return this.service.move(id, dto);
  }

  // REORDER (set sortIndex hàng loạt)
  @Patch('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.service.reorder(dto);
  }

  // DELETE by id
  @Delete('id/:id')
  deleteById(@Param('id') id: string) {
    return this.service.deleteById(id);
  }

  // DELETE by slug
  @Delete('slug/:slug')
  deleteBySlug(@Param('slug') slug: string) {
    return this.service.deleteBySlug(slug);
  }
}
