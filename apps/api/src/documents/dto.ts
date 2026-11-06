import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Where the text sits on the letterhead (points; A4 is 595 x 842). Every field is optional. */
export class LayoutDto {
  @IsOptional() @IsNumber() @Min(20) @Max(400) top?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(400) bottom?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(250) left?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(250) right?: number;
  @IsOptional() @IsNumber() @Min(8) @Max(18) size?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() justify?: boolean;
  @IsOptional() @IsNumber() @Min(10) @Max(120) footer?: number;
}

export class TemplateDto {
  @IsString() @Length(1, 80) name!: string;
  @IsIn([
    'confirmation',
    'contract',
    'offer',
    'experience',
    'salary_cert',
    'payslip',
    'custom',
  ])
  kind!: string;
  /** Plain text with {{merge.fields}}; blank line between paragraphs. */
  @IsString() @Length(1, 20000) body!: string;
  @IsOptional() requestable?: boolean;
  /** Page background (a PNG or PDF exported from Canva), base64, at most about 1.4 MB. */
  @IsOptional() @IsString() @MaxLength(1_900_000) letterheadBase64?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutDto)
  layout?: LayoutDto;
}

export class TemplateUpdateDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(1, 20000) body?: string;
  @IsOptional() requestable?: boolean;
  @IsOptional() @IsString() @MaxLength(1_900_000) letterheadBase64?: string;
  @IsOptional() @IsBoolean() removeLetterhead?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutDto)
  layout?: LayoutDto;
}

export class SealDto {
  @IsIn(['stamp', 'signature']) kind!: 'stamp' | 'signature';
  @IsString() @Length(1, 60) label!: string;
  @IsOptional() @IsUUID() signatoryId?: string;
  /** PNG, base64 encoded, at most about 1 MB. */
  @IsString() @MaxLength(1_400_000) imageBase64!: string;
}

export class PreviewDto {
  @IsUUID() templateId!: string;
  @IsUUID() memberId!: string;
}

export class IssueDto extends PreviewDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  sealIds?: string[];
  @IsOptional() @IsUUID() requestId?: string;
}

export class DocRequestDto {
  @IsUUID() templateId!: string;
  @IsOptional() @IsString() @Length(0, 300) purpose?: string;
}

export class DocDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @Length(0, 500) comment?: string;
}
