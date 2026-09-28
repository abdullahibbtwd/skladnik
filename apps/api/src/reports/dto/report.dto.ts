import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import {
  STOCK_VALUE_GROUPINGS,
  TOP_PRODUCT_METRICS,
  TURNOVER_GROUPINGS,
  WRITE_OFF_REASONS,
  WRITE_OFF_VIEWS,
  type ReportLang,
  type StockValueGrouping,
  type TopProductMetric,
  type TurnoverGrouping,
  type WriteOffReason,
  type WriteOffView,
} from '@skladnik/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class ReportQueryDto {
  @IsOptional()
  @IsIn(['en', 'bg'])
  lang?: ReportLang;

  /** Omit for every site the user can see. */
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;

  /** "As of" date for stock value. */
  @IsOptional()
  @Matches(DATE)
  date?: string;

  @IsOptional()
  @IsIn([...TURNOVER_GROUPINGS, ...STOCK_VALUE_GROUPINGS])
  groupBy?: TurnoverGrouping | StockValueGrouping;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** Movements: one product switches the report to a journal with a running balance. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn(TOP_PRODUCT_METRICS)
  metric?: TopProductMetric;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  /** Batches: only those expiring within this many days (expired included). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  expiringWithin?: number;

  @IsOptional()
  @IsIn(WRITE_OFF_VIEWS)
  view?: WriteOffView;

  @IsOptional()
  @IsIn(WRITE_OFF_REASONS)
  reason?: WriteOffReason;

  /** Stocktake variances: include counted lines that matched the book. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeMatches?: boolean;
}

export class ReportExportQueryDto extends ReportQueryDto {
  @IsIn(['csv', 'xlsx'])
  format!: 'csv' | 'xlsx';

  /** Saved CSV layout (columns, delimiter, decimal mark, date format, encoding). */
  @IsOptional()
  @IsUUID()
  profileId?: string;
}

export class ArchiveQueryDto {
  /** Language of index.csv and of names for documents without a partner. */
  @IsOptional()
  @IsIn(['en', 'bg'])
  lang?: ReportLang;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @Matches(DATE)
  from!: string;

  @Matches(DATE)
  to!: string;

  /** Drafts and documents under review too; by default only posted ones. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeUnposted?: boolean;
}
