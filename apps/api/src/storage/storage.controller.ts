import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StorageService } from './storage.service';

@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('test-upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('multipart field "file" is required');
    }

    const result = await this.storage.upload(file);
    return {
      ...result,
      note: 'publicUrl should return 403 without credentials; use signedUrl or GET /test-download/:key',
    };
  }

  @Get('test-download/:key')
  async download(@Param('key') key: string, @Res() res: Response) {
    const object = await this.storage.getObject(key);
    if (object.contentType) {
      res.setHeader('Content-Type', object.contentType);
    }
    object.body.pipe(res);
  }

  @Get('test-signed-url/:key')
  async signedUrl(@Param('key') key: string) {
    return {
      key,
      signedUrl: await this.storage.signedUrl(key),
      publicUrl: this.storage.publicObjectUrl(key),
    };
  }
}
