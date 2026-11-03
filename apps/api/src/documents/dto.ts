import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class TemplateDto {
  @IsString() @Length(1, 80) name!: string;
  @IsIn([
    'confirmation',
    'contract',
    'offer',
    'experience',
    'salary_cert',
    'custom',
  ])
  kind!: string;
  /** Plain text with {{merge.fields}}; blank line between paragraphs. */
  @IsString() @Length(1, 20000) body!: string;
  @IsOptional() requestable?: boolean;
}

export class TemplateUpdateDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(1, 20000) body?: string;
  @IsOptional() requestable?: boolean;
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
