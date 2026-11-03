import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class DepartmentDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsUUID() headId?: string | null;
}

export class JobRoleDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultPermissions?: string[];
}
export class UpdateJobRoleDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultPermissions?: string[];
}

export class InviteDto {
  @IsEmail() email!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() jobRoleId?: string;
  @IsOptional() @IsUUID() managerId?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsUUID() jobRoleId?: string | null;
  @IsOptional() @IsUUID() managerId?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'LEFT']) status?:
    'ACTIVE' | 'SUSPENDED' | 'LEFT';
}

export class GrantDto {
  @IsString() action!: string;
  @IsIn(['COMPANY', 'DEPARTMENT', 'MEMBER']) scopeType!:
    'COMPANY' | 'DEPARTMENT' | 'MEMBER';
  @IsArray() @IsUUID('all', { each: true }) scopeIds!: string[];
}
export class SetGrantsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  grants!: GrantDto[];
}

export class ProfileDto {
  @IsOptional() @IsString() @Length(2, 120) displayName?: string;
  @IsOptional() @IsString() @Length(2, 160) legalName?: string;
  @IsOptional() @IsString() @Length(0, 40) phone?: string;
  @IsOptional() @IsString() @Length(0, 200) website?: string;
  @IsOptional() @IsString() @Length(2, 60) timeZone?: string;
}
