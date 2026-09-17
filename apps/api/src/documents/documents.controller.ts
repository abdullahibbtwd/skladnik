import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateDocumentDto,
  CreateDocumentLineDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
  UpdateDocumentLineDto,
} from './dto/document.dto';
import { DocumentsService } from './documents.service';
import { isImageUpload, isPdfUpload } from './pdf-to-images';

const WRITE_ROLES = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER'] as const;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsQueryDto) {
    return this.documents.list(user, query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(user, id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(user, id, dto);
  }

  @Post(':id/lines')
  @Roles(...WRITE_ROLES)
  addLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentLineDto,
  ) {
    return this.documents.addLine(user, id, dto);
  }

  @Patch(':id/lines/:lineId')
  @Roles(...WRITE_ROLES)
  updateLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateDocumentLineDto,
  ) {
    return this.documents.updateLine(user, id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  @Roles(...WRITE_ROLES)
  removeLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.documents.removeLine(user, id, lineId);
  }

  @Post(':id/submit-for-review')
  @Roles(...WRITE_ROLES)
  submitForReview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.submitForReview(user, id);
  }

  @Post(':id/post')
  @Roles(...WRITE_ROLES)
  post(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.post(user, id);
  }

  @Post(':id/cancel')
  @Roles(...WRITE_ROLES)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.cancel(user, id);
  }

  @Post(':id/captures')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, done) => {
        if (isPdfUpload(file) || isImageUpload(file)) {
          done(null, true);
          return;
        }
        done(new BadRequestException('Only photos and PDF files can be attached.'), false);
      },
    }),
  )
  addCapture(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('multipart field "file" is required');
    }
    return this.documents.addCapture(user, id, file);
  }

  @Post(':id/captures/:captureId/retry-extraction')
  @Roles(...WRITE_ROLES)
  retryExtraction(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('captureId', ParseUUIDPipe) captureId: string,
  ) {
    return this.documents.retryExtraction(user, id, captureId);
  }

  @Get(':id/captures/:captureId/file')
  @Header('Cache-Control', 'private, max-age=60')
  async captureFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('captureId', ParseUUIDPipe) captureId: string,
  ) {
    const file = await this.documents.captureFile(user, id, captureId);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `inline; filename="page-${file.pageNumber}.jpg"`,
    });
  }

  @Get(':id/captures/:captureId/url')
  captureUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('captureId', ParseUUIDPipe) captureId: string,
  ) {
    return this.documents.captureUrl(user, id, captureId);
  }
}
