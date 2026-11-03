import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString() @Length(2, 120) orgName!: string;
  @IsString() @Length(2, 2) country!: string;
  @IsString() timeZone!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() tenantSlug?: string;
}

export class AcceptInviteDto {
  @IsString() token!: string;
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;
export class ThemeDto {
  @IsOptional() @Matches(HEX) themePrimary?: string;
  @IsOptional() @Matches(HEX) themeAccent?: string;
  @IsOptional() @IsIn(['light', 'dark', 'system']) themeMode?: string;
  @IsOptional() @IsIn(['sm', 'md', 'lg']) themeRadius?: string;
}
