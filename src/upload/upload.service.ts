

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
    public toPublicUrl(pathOrUrl?: string | null): string {
    if (!pathOrUrl) return '';

    // Nếu đã là full URL thì trả luôn
    if (pathOrUrl.startsWith('https://storage.googleapis.com/')) {
      return pathOrUrl;
    }

    // Còn lại xem như object name trong bucket
    return this.buildPublicUrl(pathOrUrl);
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
      return publicUrl;
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

  async uploadSingleToGCS(file: Express.Multer.File, folderPath: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const result = await this.uploadMultipleToGCS([file], folderPath);

    if (!result.items || result.items.length === 0) {
      throw new InternalServerErrorException('Upload failed');
    }

    return result.items[0]; // { path, url }
  }
}
