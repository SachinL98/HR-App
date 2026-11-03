import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const PART = ['FULL', 'AM', 'PM'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRequestDto {
  @IsIn(['LEAVE', 'WFH']) type!: 'LEAVE' | 'WFH';
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @Matches(DAY) startDate!: string;
  @Matches(DAY) endDate!: string;
  @IsOptional() @IsIn(PART) startPart?: 'FULL' | 'AM' | 'PM';
  @IsOptional() @IsIn(PART) endPart?: 'FULL' | 'AM' | 'PM';
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

export class DecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']) decision!:
    'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  @IsOptional() @IsString() @Length(0, 500) comment?: string;
}

export class LeaveTypeDto {
  @IsString() @Length(1, 60) name!: string;
  @IsString() @Matches(/^[A-Z_]{2,20}$/) code!: string;
  @IsOptional() paid?: boolean;
  @IsOptional() allowHalfDay?: boolean;
  @IsOptional() countWeekends?: boolean;
  @IsOptional() @IsIn(['block', 'flag']) overQuota?: 'block' | 'flag';
}

export class QuotaDto {
  @IsIn(['LEAVE', 'WFH']) subject!: 'LEAVE' | 'WFH';
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsIn(['MONTH', 'YEAR']) period!: 'MONTH' | 'YEAR';
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(366) amountDays!: number;
  @IsIn(['COMPANY', 'DEPARTMENT', 'MEMBER']) scopeType!:
    'COMPANY' | 'DEPARTMENT' | 'MEMBER';
  @IsOptional() @IsUUID() scopeId?: string;
}

export class HolidayDto {
  @IsString() @Length(1, 80) name!: string;
  @Matches(DAY) date!: string;
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  departmentIds?: string[];
}
export class HolidaysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayDto)
  holidays!: HolidayDto[];
}

export class OutOfOfficeDto {
  @Matches(DAY) date!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) from!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) to!: string;
  @IsOptional()
  @IsIn(['client_visit', 'errand', 'medical', 'other'])
  reason?: string;
}

export class RangeQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() memberId?: string;
}
