// src/ai-dataset/ai-dataset.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AiDatasetService } from './ai-dataset.service';

@Controller('ai')
export class AiDatasetController {
  constructor(private readonly aiDatasetService: AiDatasetService) {}

  @Get('dataset')
  async getDataset() {
    // return JSON trực tiếp cho n8n/AI
    const data = await this.aiDatasetService.getCurrentDataset();
    return data;
  }

  // Optional: endpoint rebuild thủ công nếu muốn
  @Get('dataset/rebuild')
  async rebuild() {
    const data = await this.aiDatasetService.rebuildDataset();
    return {
      message: 'Rebuilt dataset',
      generatedAt: data.generatedAt,
      counts: {
        restaurants: data.restaurants?.length ?? 0,
        categories: data.categories?.length ?? 0,
        blogs: data.blogs?.length ?? 0,
      },
    };
  }
}
