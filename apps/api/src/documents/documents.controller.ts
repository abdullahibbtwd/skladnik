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
  CreateProductFromLineDto,
  ListDocumentsQueryDto,
  PostDocumentDto,
  ReverseDocumentDto,
  ScanDocumentDto,
  StocktakeCountsDto,
  UpdateDocumentDto,
  UpdateDocumentLineDto,
} from './dto/document.dto';
import { DocumentsService } from './documents.service';
import { isImageUpload, isPdfUpload } from './pdf-to-images';

/** Draft create/edit/submit — Staff included; ACC-01 Accountant excluded (read-only). */
const DRAFT_WRITE_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF'] as const;
/** Post (Staff: write-offs only), cancel, reverse, stocktake, create-product — managers. */
const MANAGER_ROLES = ['OWNER', 'SITE_MANAGER'] as const;
/** Post allowed for Staff write-offs (recommended default: no approval threshold). */
const POST_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF'] as const;

const captureUpload = () =>
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
  });

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsQueryDto) {
    return this.documents.list(user, query);
  }

  @Post()
  @Roles(...DRAFT_WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user, dto);
  }

  @Post('scan')
  @Roles(...DRAFT_WRITE_ROLES)
  @UseInterceptors(captureUpload())
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDocumentDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('multipart field "file" is required');
    }
    return this.documents.createFromScan(user, dto, file);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(user, id);
  }

  @Patch(':id')
  @Roles(...DRAFT_WRITE_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(user, id, dto);
  }

  @Post(':id/lines')
  @Roles(...DRAFT_WRITE_ROLES)
  addLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentLineDto,
  ) {
    return this.documents.addLine(user, id, dto);
  }

  @Patch(':id/lines/:lineId')
  @Roles(...DRAFT_WRITE_ROLES)
  updateLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateDocumentLineDto,
  ) {
    return this.documents.updateLine(user, id, lineId, dto);
  }

  /** CAF-02: Staff included — the service forces PENDING_REVIEW for that role. */
  @Post(':id/lines/:lineId/create-product')
  @Roles('OWNER', 'SITE_MANAGER', 'STAFF')
  createProductFromLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: CreateProductFromLineDto,
  ) {
    return this.documents.createProductFromLine(user, id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  @Roles(...DRAFT_WRITE_ROLES)
  removeLine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.documents.removeLine(user, id, lineId);
  }

  @Post(':id/submit-for-review')
  @Roles(...DRAFT_WRITE_ROLES)
  submitForReview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.submitForReview(user, id);
  }

  @Post(':id/post')
  @Roles(...POST_ROLES)
  post(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PostDocumentDto) {
    return this.documents.post(user, id, { confirmExpired: dto.confirmExpired, confirmDate: dto.confirmDate });
  }

  @Post(':id/stocktake/fill')
  @Roles(...MANAGER_ROLES)
  fillStocktake(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.fillStocktake(user, id);
  }

  @Patch(':id/stocktake/counts')
  @Roles(...MANAGER_ROLES)
  setCounts(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StocktakeCountsDto,
  ) {
    return this.documents.setCounts(user, id, dto.counts);
  }

  @Post(':id/cancel')
  @Roles(...DRAFT_WRITE_ROLES)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.cancel(user, id);
  }

  @Post(':id/suggest-auto-batch')
  @Roles(...DRAFT_WRITE_ROLES)
  suggestAutoBatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { productId: string; expiryDate: string },
  ) {
    return this.documents.suggestAutoBatch(user, id, body);
  }

  @Post(':id/reverse')
  @Roles(...MANAGER_ROLES)
  reverse(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDocumentDto) {
    return this.documents.reverse(user, id, dto);
  }

  @Post(':id/captures')
  @Roles(...DRAFT_WRITE_ROLES)
  @UseInterceptors(captureUpload())
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
  @Roles(...DRAFT_WRITE_ROLES)
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
