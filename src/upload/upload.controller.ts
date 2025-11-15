// import {
//   Controller,
//   Post,
//   Get,
//   Delete,
//   Param,
//   UploadedFiles,
//   UseInterceptors,
//   BadRequestException,
// } from "@nestjs/common";
// import { FilesInterceptor } from "@nestjs/platform-express";
// import { UploadService } from "./upload.service";
// import { RestaurantsService } from "../restaurants/restaurants.service";

// @Controller("upload")
// export class UploadController {
//   constructor(
//     private readonly uploadService: UploadService,
//     private readonly restaurantsService: RestaurantsService
//   ) {}

//   // ======================== 👤 USER UPLOAD ========================

//   /** 📸 Upload avatar người dùng */
//   @Post("user/:id/avatar")
//   @UseInterceptors(FilesInterceptor("files", 5))
//   async uploadUserAvatar(
//     @Param("id") id: string,
//     @UploadedFiles() files: Express.Multer.File[]
//   ) {
//     if (!files?.length) throw new BadRequestException("No files provided");
//     return this.uploadService.uploadMultipleToGCS(files, `user/${id}/avatar`);
//   }

//   /** 🖼️ Upload ảnh review */
//   @Post("user/:id/review")
//   @UseInterceptors(FilesInterceptor("files", 10))
//   async uploadUserReviewImages(
//     @Param("id") id: string,
//     @UploadedFiles() files: Express.Multer.File[]
//   ) {
//     if (!files?.length) throw new BadRequestException("No files provided");
//     return this.uploadService.uploadMultipleToGCS(files, `user/${id}/review`);
//   }

//   // ======================== 🏠 RESTAURANT UPLOAD ========================

//   /** 🏞️ Upload banner (chỉ lưu path trong DB) */
//   @Post("restaurant/:id/banner")
//   @UseInterceptors(FilesInterceptor("files", 5))
//   async uploadRestaurantBanner(
//     @Param("id") id: string,
//     @UploadedFiles() files: Express.Multer.File[]
//   ) {
//     if (!files?.length) throw new BadRequestException("No files provided");

//     const result = await this.uploadService.uploadMultipleToGCS(
//       files,
//       `restaurant/${id}/banner`
//     );

//     const restaurant = await this.restaurantsService.findOne(id);
//     restaurant.banner = [...(restaurant.banner || []), ...result.paths];
//     await restaurant.save();

//     return {
//       message: "✅ Banner uploaded (private) & saved to DB",
//       paths: result.paths,
//     };
//   }

//   /** 🖼️ Upload gallery (chỉ lưu path trong DB) */
//   @Post("restaurant/:id/gallery")
//   @UseInterceptors(FilesInterceptor("files", 15))
//   async uploadRestaurantGallery(
//     @Param("id") id: string,
//     @UploadedFiles() files: Express.Multer.File[]
//   ) {
//     if (!files?.length) throw new BadRequestException("No files provided");

//     const result = await this.uploadService.uploadMultipleToGCS(
//       files,
//       `restaurant/${id}/gallery`
//     );

//     const restaurant = await this.restaurantsService.findOne(id);
//     restaurant.gallery = [...(restaurant.gallery || []), ...result.paths];
//     await restaurant.save();

//     return {
//       message: "✅ Gallery uploaded (private) & saved to DB",
//       paths: result.paths,
//     };
//   }

//   /** 📋 Upload menu (chỉ lưu path trong DB) */
//   @Post("restaurant/:id/menu")
//   @UseInterceptors(FilesInterceptor("files", 10))
//   async uploadRestaurantMenu(
//     @Param("id") id: string,
//     @UploadedFiles() files: Express.Multer.File[]
//   ) {
//     if (!files?.length) throw new BadRequestException("No files provided");

//     const result = await this.uploadService.uploadMultipleToGCS(
//       files,
//       `restaurant/${id}/menu`
//     );

//     const restaurant = await this.restaurantsService.findOne(id);
//     restaurant.menuImages = [
//       ...(restaurant.menuImages || []),
//       ...result.paths,
//     ];
//     await restaurant.save();

//     return {
//       message: "✅ Menu uploaded (private) & saved to DB",
//       paths: result.paths,
//     };
//   }

//   // ===================== 🧠 AI DATA HANDLERS =====================

//   /** 📤 Upload tri thức AI (vẫn giữ nguyên flow cũ) */
//   @Post("ai/data")
//   @UseInterceptors(FilesInterceptor("files", 10))
//   async uploadAIData(@UploadedFiles() files: Express.Multer.File[]) {
//     if (!files?.length) throw new BadRequestException("No files provided");
//     return this.uploadService.uploadMultipleAIData(files);
//   }

//   /** 📥 Lấy danh sách file AI hiện có */
//   @Get("ai/data")
//   async listAIFiles() {
//     return this.uploadService.listAIFiles();
//   }

//   /** 🗑️ Xóa file AI khỏi GCS + ChromaDB */
//   @Delete("ai/data/:filename")
//   async deleteAIData(@Param("filename") filename: string) {
//     if (!filename) throw new BadRequestException("No filename provided");
//     return this.uploadService.deleteAIData(filename);
//   }

//   // ===================== 🔁 REFRESH SIGNED URL =====================

//   /**
//    * Cấp lại signed URL mới từ file path (ví dụ: restaurant/abc/banner/xyz.jpg)
//    * → frontend dùng khi ảnh cũ hết hạn
//    */
//   @Get("refresh-link/:path")
//   async refreshLink(@Param("path") path: string) {
//     if (!path) throw new BadRequestException("No file path provided");
//     const decodedPath = decodeURIComponent(path); // để support URL encode
//     return this.uploadService.getSignedUrl(decodedPath);
//   }

//   // ===================== 🗑️ DELETE FILE =====================

//   /** Xóa ảnh (banner / menu / gallery) khỏi GCS và DB */
//   @Delete("restaurant/:id/file/:encodedPath")
//   async deleteRestaurantFile(
//     @Param("id") id: string,
//     @Param("encodedPath") encodedPath: string
//   ) {
//     const path = decodeURIComponent(encodedPath);
//     await this.uploadService.deleteFile(path);

//     // Đồng bộ xóa khỏi DB
//     const restaurant = await this.restaurantsService.findOne(id);
//     restaurant.banner = (restaurant.banner || []).filter((p) => p !== path);
//     restaurant.gallery = (restaurant.gallery || []).filter((p) => p !== path);
//     restaurant.menuImages = (restaurant.menuImages || []).filter((p) => p !== path);
//     await restaurant.save();

//     return { message: "🗑️ File deleted from GCS & DB", path };
//   }
//    // 🧾 Route upload ảnh web/banner (dành cho admin)
//   @Post("website")
//   @UseInterceptors(FilesInterceptor("files", 10))
//   async uploadWebsiteImages(@UploadedFiles() files: Express.Multer.File[]) {
//     // ✅ dùng service chung, folderPath là "image"
//     return this.uploadService.uploadMultipleToGCS(files, "image");
//   }
//  @Get("list/image")
// async listWebsiteImageNames() {
//   return this.uploadService.listWebsiteImageNames();
// }


// }
