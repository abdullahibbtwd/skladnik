import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EXPORT_DATE_FORMATS,
  EXPORT_DECIMAL_SEPARATORS,
  EXPORT_DELIMITERS,
  EXPORT_ENCODINGS,
  REPORT_KINDS,
  type ExportDateFormat,
  type ExportDecimalSeparator,
  type ExportDelimiter,
  type ExportEncoding,
  type ReportKind,
} from '@skladnik/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ExportProfileColumnDto {
  @IsString()
  @Matches(/^[a-zA-Z][\w.]*$/)
  @MaxLength(40)
  key!: string;

  /** Column title in the file, e.g. the name the accounting software expects. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  header!: string;
}

export class ExportProfileDto {
  @IsIn(REPORT_KINDS)
  reportKind!: ReportKind;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ExportProfileColumnDto)
  columns!: ExportProfileColumnDto[];

  @IsIn(EXPORT_DELIMITERS)
  delimiter!: ExportDelimiter;

  @IsIn(EXPORT_DECIMAL_SEPARATORS)
  decimalSeparator!: ExportDecimalSeparator;

  @IsIn(EXPORT_DATE_FORMATS)
  dateFormat!: ExportDateFormat;

  @IsIn(EXPORT_ENCODINGS)
  encoding!: ExportEncoding;

  @IsBoolean()
  includeHeader!: boolean;
}

export class ExportProfileListQueryDto {
  @IsOptional()
  @IsIn(REPORT_KINDS)
  reportKind?: ReportKind;
}
