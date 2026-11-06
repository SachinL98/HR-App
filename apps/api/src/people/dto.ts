import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChecklistItemDto {
  @IsString() @Length(1, 160) title!: string;
  /** Who does it: the new person, their line manager, or whoever manages checklists (HR). */
  @IsIn(['employee', 'manager', 'hr']) who!: 'employee' | 'manager' | 'hr';
  /** Days after the checklist starts (negative is not allowed). Leave out for no due date. */
  @IsOptional() @IsInt() @Min(0) @Max(365) dueDays?: number;
}

export class ChecklistTemplateDto {
  @IsString() @Length(1, 80) name!: string;
  @IsIn(['onboarding', 'offboarding']) kind!: 'onboarding' | 'offboarding';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}

export class StartChecklistDto {
  @IsUUID() templateId!: string;
}

export class TaskDoneDto {
  @IsBoolean() done!: boolean;
}

export class MemberDocumentDto {
  @IsString() @Length(1, 120) title!: string;
  @IsIn(['contract', 'id', 'certificate', 'other']) kind!:
    'contract' | 'id' | 'certificate' | 'other';
  @IsString() @Length(1, 120) fileName!: string;
  /** PDF, PNG or JPEG, base64, at most about 1.4 MB before encoding. */
  @IsString() @MaxLength(1_900_000) fileBase64!: string;
  @IsOptional() @IsBoolean() visibleToMember?: boolean;
}
