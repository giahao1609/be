import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BlogPost, BlogSchema } from './schema/blog.schema';
import { BlogsService } from './blogs.service';
import { OwnerBlogsController } from './owner-blogs.controller';


import { UploadModule } from 'src/upload/upload.module'; // module đang export UploadService
import { AuthModule } from 'src/auth/auth.module';       // nếu CurrentUser/JWT nằm trong đây
import { User, UserSchema } from 'src/users/schema/user.schema';
import { UsersService } from 'src/users/users.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: BlogPost.name, schema: BlogSchema },
            { name: User.name, schema: UserSchema },
        ]),
        UploadModule,
        AuthModule,
    ],
    controllers: [
        OwnerBlogsController,
        // PublicBlogsController,
    ],
    providers: [BlogsService, UsersService],
    exports: [BlogsService], // nếu chỗ khác cũng cần dùng blog service
})
export class BlogsModule { }
