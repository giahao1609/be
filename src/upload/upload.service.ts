// import {
//   Injectable,
//   BadRequestException,
//   InternalServerErrorException,
// } from "@nestjs/common";
// import { Storage } from "@google-cloud/storage";
// import * as path from "path";
// import axios from "axios";

// @Injectable()
// export class UploadService {
//   private storage: Storage;
//   private bucketName = "khoaluaniuh";

//   constructor() {
//     try {
//       const keyPath = path.join(process.cwd(), "src/config/gcs-key.json");
//       const keyFile = require(keyPath);

//       this.storage = new Storage({
//         keyFilename: keyPath,
//         projectId: keyFile.project_id,
//       });

//       console.log("🟢 GCS initialized for project:", keyFile.project_id);
//     } catch (err) {
//       console.error("❌ GCS init failed:", err);
//       throw new InternalServerErrorException("Failed to initialize GCS");
//     }
//   }

//   async uploadMultipleToGCS(files: Express.Multer.File[], folderPath: string) {
//     try {
//       if (!files || files.length === 0)
//         throw new BadRequestException("No files uploaded");

//       const bucket = this.storage.bucket(this.bucketName);
//       const uploadedPaths: string[] = [];

//       for (const file of files) {
//         const filename = `${folderPath}/${Date.now()}_${file.originalname}`;
//         const blob = bucket.file(filename);

//         await blob.save(file.buffer, {
//           contentType: file.mimetype,
//         });

//         uploadedPaths.push(filename);
//         console.log("✅ Uploaded:", filename);
//       }

//       return { message: "Files uploaded successfully", paths: uploadedPaths };
//     } catch (error) {
//       console.error("🔥 GCS Upload Error:", error);
//       throw new InternalServerErrorException("Failed to upload files to GCS");
//     }
//   }

//   async getSignedUrl(filePath: string) {
//     try {
//       if (!filePath) throw new BadRequestException("Missing file path");

//       if (filePath.startsWith("https://storage.googleapis.com/")) {
//         const match = filePath.match(/foodmap-secure\/(.+?)(?:\?|$)/);
//         if (match && match[1]) {
//           filePath = match[1];
//         } else {
//           throw new BadRequestException("Invalid GCS file URL format");
//         }
//       }

//       const bucket = this.storage.bucket(this.bucketName);
//       const file = bucket.file(filePath);

//       const [exists] = await file.exists();
//       if (!exists) {
//         throw new BadRequestException(`File ${filePath} not found in GCS`);
//       }

//       const [url] = await file.getSignedUrl({
//         action: "read",
//         expires: Date.now() + 6 * 60 * 60 * 1000,
//       });

//       return { url };
//     } catch (error) {
//       console.error("🔥 getSignedUrl Error:", error);
//       throw new InternalServerErrorException("Failed to refresh signed URL");
//     }
//   }

//   async deleteFile(filePath: string) {
//     try {
//       if (!filePath) throw new BadRequestException("Missing file path");
//       const bucket = this.storage.bucket(this.bucketName);
//       const file = bucket.file(filePath);

//       const [exists] = await file.exists();
//       if (!exists) return { message: "File not found in GCS" };

//       await file.delete();
//       console.log("🗑️ Deleted:", filePath);
//       return { message: `Deleted ${filePath}` };
//     } catch (error) {
//       console.error("🔥 Delete Error:", error);
//       throw new InternalServerErrorException("Failed to delete file from GCS");
//     }
//   }

//   // ======================== 🤖 AI DATA HANDLERS ========================

//   async uploadMultipleAIData(files: Express.Multer.File[]) {
//     try {
//       if (!files || files.length === 0)
//         throw new BadRequestException("No AI files uploaded");

//       const bucket = this.storage.bucket(this.bucketName);
//       const results: Array<{
//         message: string;
//         filePath: string;
//         fileUrl: string;
//       }> = [];

//       for (const file of files) {
//         const filename = `uploads/ai/${Date.now()}_${file.originalname}`;
//         const blob = bucket.file(filename);

//         await blob.save(file.buffer, { contentType: file.mimetype });

//         const [fileUrl] = await blob.getSignedUrl({
//           action: "read",
//           expires: Date.now() + 6 * 60 * 60 * 1000, // 6h
//         });

//         console.log("🧠 Uploaded AI file:", filename);
//         results.push({
//           message: `AI data ${file.originalname} uploaded successfully`,
//           filePath: filename,
//           fileUrl,
//         });
//       }

//       return { message: "AI data uploaded successfully", results };
//     } catch (error) {
//       console.error("🔥 AI Upload Error:", error);
//       throw new InternalServerErrorException("Failed to upload AI data files");
//     }
//   }

//   async listAIFiles() {
//     try {
//       const bucket = this.storage.bucket(this.bucketName);
//       const [files] = await bucket.getFiles({ prefix: "uploads/ai/" });

//       const result = await Promise.all(
//         files.map(async (f) => {
//           const [url] = await f.getSignedUrl({
//             action: "read",
//             expires: Date.now() + 3600 * 1000, // 1h
//           });
//           return { name: f.name, url };
//         })
//       );

//       return result;
//     } catch (error) {
//       console.error("🔥 listAIFiles Error:", error);
//       throw new InternalServerErrorException("Failed to list AI files");
//     }
//   }

//   async deleteAIData(filename: string) {
//     try {
//       const bucket = this.storage.bucket(this.bucketName);
//       const file = bucket.file(filename);

//       const [exists] = await file.exists();
//       if (exists) {
//         await file.delete();
//         console.log("🗑️ Deleted AI file:", filename);
//       }

//       return { message: `AI file deleted: ${filename}` };
//     } catch (error) {
//       console.error("🔥 Delete AI Data Error:", error);
//       throw new InternalServerErrorException("Failed to delete AI data");
//     }
//   }

//   // ======================== 🖼️ WEBSITE IMAGE HANDLER ========================

//   /**
//    * 📜 Lấy danh sách ảnh trong folder "image/"
//    */
//   async listWebsiteImageNames() {
//     try {
//       const bucket = this.storage.bucket(this.bucketName);
//       const [files] = await bucket.getFiles({ prefix: "image/" });

//       const names = files.map((f) => f.name);

//       console.log(`📂 Found ${names.length} image names in "image/"`);
//       return names;
//     } catch (error) {
//       console.error("🔥 listWebsiteImageNames Error:", error);
//       throw new InternalServerErrorException("Failed to list image names");
//     }
//   }
// }

import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import * as path from 'path';

@Injectable()
export class UploadService {
  private storage: Storage;
  private readonly bucketName = 'khoaluaniuh';

  constructor() {
    try {
      const keyPath = path.join(process.cwd(), 'src/config/gcs-key.json');
      const keyFile = require(keyPath);

      this.storage = new Storage({
        keyFilename: keyPath,
        projectId: keyFile.project_id,
      });

      console.log('🟢 GCS initialized for project:', keyFile.project_id);
    } catch (err) {
      console.error('❌ GCS init failed:', err);
      throw new InternalServerErrorException('Failed to initialize GCS');
    }
  }

  /** Build public URL cho object trong bucket */
  private buildPublicUrl(filePath: string): string {
    const encoded = filePath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `https://storage.googleapis.com/${this.bucketName}/${encoded}`;
  }

  // ======================== CORE MULTI UPLOAD ========================

  /**
   * Upload nhiều file vào folder trong bucket
   * - Trả về:
   *   - paths: string[]  (object name trong bucket)  -> RestaurantsService đang dùng
   *   - urls: string[]   (public URL)
   *   - items: { path, url }[]
   */
  async uploadMultipleToGCS(files: Express.Multer.File[], folderPath: string) {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('No files uploaded');
      }

      const bucket = this.storage.bucket(this.bucketName);
      const uploadedPaths: string[] = [];
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const filename = `${folderPath}/${Date.now()}_${file.originalname}`;
        const blob = bucket.file(filename);

        await blob.save(file.buffer, {
          contentType: file.mimetype,
        });

        // Cho object public
        await blob.makePublic();

        const publicUrl = this.buildPublicUrl(filename);

        uploadedPaths.push(filename);
        uploadedUrls.push(publicUrl);

        console.log('✅ Uploaded & public:', filename, '->', publicUrl);
      }

      return {
        message: 'Files uploaded successfully',
        paths: uploadedPaths,
        urls: uploadedUrls,
        items: uploadedPaths.map((p, index) => ({
          path: p,
          url: uploadedUrls[index],
        })),
      };
    } catch (error) {
      console.error('🔥 GCS Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload files to GCS');
    }
  }

  // ======================== "SIGNED" URL -> GIỜ LÀ PUBLIC URL ========================

  /**
   * Hàm cũ tên getSignedUrl, nhưng giờ:
   * - Nếu truyền path -> đảm bảo file tồn tại + public, rồi trả public URL
   * - Nếu truyền sẵn full https://storage.googleapis.com/... -> trả luôn
   */
  async getSignedUrl(filePath: string) {
    try {
      if (!filePath) {
        throw new BadRequestException('Missing file path');
      }

      // Nếu đã là public URL thì trả lại luôn
      if (filePath.startsWith('https://storage.googleapis.com/')) {
        return { url: filePath };
      }

      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        throw new BadRequestException(`File ${filePath} not found in GCS`);
      }

      // Đảm bảo object public (nếu trước đó chưa)
      await file.makePublic();

      const publicUrl = this.buildPublicUrl(filePath);
      return  publicUrl ;
    } catch (error) {
      console.error('🔥 getSignedUrl Error:', error);
      throw new InternalServerErrorException('Failed to refresh public URL');
    }
  }

  // ======================== DELETE FILE ========================

  async deleteFile(filePath: string) {
    try {
      if (!filePath) {
        throw new BadRequestException('Missing file path');
      }

      // Nếu truyền full URL -> cắt lấy object name
      if (filePath.startsWith('https://storage.googleapis.com/')) {
        const marker = `${this.bucketName}/`;
        const idx = filePath.indexOf(marker);
        if (idx >= 0) {
          const raw = filePath.substring(idx + marker.length);
          filePath = decodeURIComponent(raw);
        }
      }

      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return { message: 'File not found in GCS' };
      }

      await file.delete();
      console.log('🗑️ Deleted:', filePath);
      return { message: `Deleted ${filePath}` };
    } catch (error) {
      console.error('🔥 Delete Error:', error);
      throw new InternalServerErrorException('Failed to delete file from GCS');
    }
  }

  // ======================== 🤖 AI DATA HANDLERS ========================

  async uploadMultipleAIData(files: Express.Multer.File[]) {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('No AI files uploaded');
      }

      // Tận dụng core upload
      const result = await this.uploadMultipleToGCS(files, 'uploads/ai');

      const results = result.paths.map((p, index) => ({
        message: `AI data ${files[index]?.originalname ?? p} uploaded successfully`,
        filePath: p,
        fileUrl: result.urls[index],
      }));

      return {
        message: 'AI data uploaded successfully',
        results,
      };
    } catch (error) {
      console.error('🔥 AI Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload AI data files');
    }
  }

  async listAIFiles() {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: 'uploads/ai/' });

      const result = files.map((f) => ({
        name: f.name,
        url: this.buildPublicUrl(f.name),
      }));

      return result;
    } catch (error) {
      console.error('🔥 listAIFiles Error:', error);
      throw new InternalServerErrorException('Failed to list AI files');
    }
  }

  async deleteAIData(filename: string) {
    try {
      if (!filename) {
        throw new BadRequestException('Missing filename');
      }

      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filename);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log('🗑️ Deleted AI file:', filename);
      }

      return { message: `AI file deleted: ${filename}` };
    } catch (error) {
      console.error('🔥 Delete AI Data Error:', error);
      throw new InternalServerErrorException('Failed to delete AI data');
    }
  }

  // ======================== 🖼️ WEBSITE IMAGE HANDLER ========================

  /**
   * Lấy danh sách ảnh trong folder "image/"
   * - Trả name + public url cho FE tiện dùng
   */
  async listWebsiteImageNames() {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: 'image/' });

      console.log(`📂 Found ${files.length} images in "image/"`);

      const result = files.map((f) => ({
        name: f.name,
        url: this.buildPublicUrl(f.name),
      }));

      return result;
    } catch (error) {
      console.error('🔥 listWebsiteImageNames Error:', error);
      throw new InternalServerErrorException('Failed to list image names');
    }
  }
}

// import {
//   Injectable,
//   BadRequestException,
//   InternalServerErrorException,
// } from '@nestjs/common';
// import { v2 as cloudinary } from 'cloudinary';

// @Injectable()
// export class UploadService {
//   constructor() {
//     try {
//       // const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
//       // const apiKey = process.env.CLOUDINARY_API_KEY;
//       // const apiSecret = process.env.CLOUDINARY_API_SECRET;

//       const cloudName = "dvszygblk";
//       const apiKey = "592647333998664";
//       const apiSecret = "53_zePZorhREM96j-TA-MBBsIAs";

//       if (!cloudName || !apiKey || !apiSecret) {
//         throw new Error('Missing Cloudinary env vars');
//       }

//       cloudinary.config({
//         cloud_name: cloudName,
//         api_key: apiKey,
//         api_secret: apiSecret,
//       });

//       console.log('🟢 Cloudinary initialized for cloud:', cloudName);
//     } catch (err) {
//       console.error('❌ Cloudinary init failed:', err);
//       throw new InternalServerErrorException('Failed to initialize Cloudinary');
//     }
//   }

//   /** Upload buffer lên Cloudinary, trả publicId + url */
//   private uploadBuffer(
//     file: Express.Multer.File,
//     folder: string,
//   ): Promise<{ publicId: string; url: string }> {
//     return new Promise((resolve, reject) => {
//       const stream = cloudinary.uploader.upload_stream(
//         {
//           folder,
//           resource_type: 'image',
//         },
//         (error, result) => {
//           if (error || !result) {
//             return reject(error ?? new Error('Upload failed'));
//           }
//           resolve({
//             publicId: result.public_id,
//             url: result.secure_url ?? result.url,
//           });
//         },
//       );
//       stream.end(file.buffer);
//     });
//   }

//   // ======================== CORE MULTI UPLOAD (GIỮ TÊN CŨ) ========================

//   /**
//    * Upload nhiều file (Cloudinary)
//    * - return:
//    *   - paths: string[]  (public_id) -> RestaurantsService đang dùng
//    *   - urls: string[]   (secure_url)
//    *   - items: { path, url }[]
//    */
//   async uploadMultipleToGCS(files: Express.Multer.File[], folderPath: string) {
//     try {
//       if (!files || files.length === 0) {
//         throw new BadRequestException('No files uploaded');
//       }

//       const uploadedPaths: string[] = [];
//       const uploadedUrls: string[] = [];

//       for (const file of files) {
//         const { publicId, url } = await this.uploadBuffer(file, folderPath);

//         uploadedPaths.push(publicId);
//         uploadedUrls.push(url);

//         console.log('✅ Uploaded to Cloudinary:', publicId, '->', url);
//       }

//       return {
//         message: 'Files uploaded successfully',
//         paths: uploadedPaths,
//         urls: uploadedUrls,
//         items: uploadedPaths.map((p, index) => ({
//           path: p, // public_id
//           url: uploadedUrls[index],
//         })),
//       };
//     } catch (error) {
//       console.error('🔥 Cloudinary Upload Error:', error);
//       throw new InternalServerErrorException('Failed to upload files');
//     }
//   }

//   // ======================== GET "SIGNED" URL (THỰC RA LÀ PUBLIC URL) ========================

//   /**
//    * Nếu:
//    *  - truyền public_id -> build URL Cloudinary (secure)
//    *  - truyền full URL Cloudinary -> trả lại luôn
//    */
//   async getSignedUrl(filePath: string) {
//     try {
//       if (!filePath) {
//         throw new BadRequestException('Missing file path');
//       }

//       // Nếu đã là URL Cloudinary thì trả luôn
//       if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
//         return { url: filePath };
//       }

//       // filePath bây giờ được coi là public_id
//       const url = cloudinary.url(filePath, {
//         secure: true,
//       });

//       return { url };
//     } catch (error) {
//       console.error('🔥 getSignedUrl (Cloudinary) Error:', error);
//       throw new InternalServerErrorException('Failed to get image URL');
//     }
//   }

//   // ======================== DELETE FILE ========================

//   /**
//    * deleteFile:
//    *  - Nếu truyền public_id -> xoá trực tiếp
//    *  - Nếu truyền URL Cloudinary -> parse public_id rồi xoá
//    */
//   async deleteFile(filePath: string) {
//     try {
//       if (!filePath) {
//         throw new BadRequestException('Missing file path');
//       }

//       let publicId = filePath;

//       // Nếu là URL Cloudinary, parse public_id
//       if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
//         // Ví dụ URL:
//         // https://res.cloudinary.com/<cloud_name>/image/upload/v123456789/folder/name_xyz.jpg
//         const match =
//           filePath.match(/\/upload\/(?:v\d+\/)?([^\.]+)(?:\.[a-zA-Z0-9]+)?$/) ??
//           undefined;
//         if (match && match[1]) {
//           publicId = match[1]; // folder/name_xyz
//         } else {
//           throw new BadRequestException('Cannot extract Cloudinary public_id');
//         }
//       }

//       const res = await cloudinary.uploader.destroy(publicId, {
//         resource_type: 'image',
//       });

//       console.log('🗑️ Cloudinary destroy:', publicId, '->', res);

//       return { message: `Deleted ${publicId}`, result: res };
//     } catch (error) {
//       console.error('🔥 Delete Error (Cloudinary):', error);
//       throw new InternalServerErrorException('Failed to delete file');
//     }
//   }

//   // ======================== 🤖 AI DATA HANDLERS ========================

//   async uploadMultipleAIData(files: Express.Multer.File[]) {
//     try {
//       if (!files || files.length === 0) {
//         throw new BadRequestException('No AI files uploaded');
//       }

//       const folder = 'uploads/ai';
//       const result = await this.uploadMultipleToGCS(files, folder);

//       const results = result.paths.map((p, index) => ({
//         message: `AI data ${files[index]?.originalname ?? p} uploaded successfully`,
//         filePath: p, // public_id
//         fileUrl: result.urls[index],
//       }));

//       return {
//         message: 'AI data uploaded successfully',
//         results,
//       };
//     } catch (error) {
//       console.error('🔥 AI Upload Error (Cloudinary):', error);
//       throw new InternalServerErrorException('Failed to upload AI data files');
//     }
//   }

//   async listAIFiles() {
//     try {
//       // Dùng search API: folder:uploads/ai/*
//       const res = await cloudinary.search
//         .expression('folder:uploads/ai/*')
//         .max_results(500)
//         .execute();

//       const result =
//         res.resources?.map((r: any) => ({
//           name: r.public_id,
//           url: r.secure_url ?? r.url,
//         })) ?? [];

//       return result;
//     } catch (error) {
//       console.error('🔥 listAIFiles Error (Cloudinary):', error);
//       throw new InternalServerErrorException('Failed to list AI files');
//     }
//   }

//   async deleteAIData(filename: string) {
//     try {
//       if (!filename) {
//         throw new BadRequestException('Missing filename');
//       }

//       // filename ở đây coi là public_id
//       const res = await cloudinary.uploader.destroy(filename, {
//         resource_type: 'image',
//       });

//       console.log('🗑️ Deleted AI file (Cloudinary):', filename, '->', res);

//       return { message: `AI file deleted: ${filename}`, result: res };
//     } catch (error) {
//       console.error('🔥 Delete AI Data Error (Cloudinary):', error);
//       throw new InternalServerErrorException('Failed to delete AI data');
//     }
//   }

//   // ======================== 🖼️ WEBSITE IMAGE HANDLER ========================

//   /**
//    * Lấy danh sách ảnh trong folder "image/" (Cloudinary folder "image")
//    */
//   async listWebsiteImageNames() {
//     try {
//       const res = await cloudinary.search
//         .expression('folder:image/*')
//         .max_results(500)
//         .execute();

//       const result =
//         res.resources?.map((r: any) => ({
//           name: r.public_id,
//           url: r.secure_url ?? r.url,
//         })) ?? [];

//       console.log(`📂 Found ${result.length} images in "image/" (Cloudinary)`);

//       return result;
//     } catch (error) {
//       console.error('🔥 listWebsiteImageNames Error (Cloudinary):', error);
//       throw new InternalServerErrorException('Failed to list image names');
//     }
//   }
// }
