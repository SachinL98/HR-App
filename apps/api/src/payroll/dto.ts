import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PayGroupDto {
  @IsString() @Length(1, 60) name!: string;
  @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsInt() @Min(1) @Max(31) payDay!: number;
  @IsOptional() @IsIn(['uk', 'lk']) taxRegime?: 'uk' | 'lk' | null;
}

export class ComponentDto {
  @Matches(/^[A-Z0-9_]{2,20}$/) code!: string;
  @IsString() @Length(1, 60) label!: string;
  @IsIn(['fixed', 'percent']) type!: 'fixed' | 'percent';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) value!: number;
  @IsBoolean() taxable!: boolean;
}

export class TaxProfileDto {
  @IsOptional() @Matches(/^([0-9]{1,5}[LMNTY]|BR|D0|D1|0T)$/i) taxCode?: string;
  @IsOptional() @IsIn(['A', 'C', 'X']) niCategory?: 'A' | 'C' | 'X';
  @IsOptional() @IsBoolean() pensionOptOut?: boolean;
  @IsOptional() @IsBoolean() claimRelief?: boolean;
}

export class SalaryDto {
  @IsUUID() payGroupId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) basic!: number;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components!: ComponentDto[];
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TaxProfileDto)
  taxProfile?: TaxProfileDto;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
}

export class CreateRunDto {
  @IsUUID() payGroupId!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
}
