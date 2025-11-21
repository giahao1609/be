import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OwnerMenuItemsController } from './owner-menu-items.controller';
import { OwnerMenuItemsService } from './owner-menu-items.service';
import { MenuItem, MenuItemSchema } from './schema/menu.schema';
import { UploadService } from 'src/upload/upload.service';
import { UploadModule } from 'src/upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MenuItem.name, schema: MenuItemSchema },
    ]),
    forwardRef(() => UploadModule),
  ],
  controllers: [OwnerMenuItemsController],
  providers: [OwnerMenuItemsService, UploadService],
  exports: [OwnerMenuItemsService],
})
export class OwnerMenuItemsModule {}
