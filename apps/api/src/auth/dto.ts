import {
  IsTimeZone,
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
  @IsTimeZone() timeZone!: string;
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

export class ForgotDto {
  @IsEmail() email!: string;
}
export class ResetDto {
  @IsString() @Length(10, 200) token!: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
}
export class TokenDto {
  @IsString() @Length(10, 200) token!: string;
}
export class MfaLoginDto {
  @IsString() @Length(10, 2000) challenge!: string;
  @IsString() @Length(6, 20) code!: string;
}
export class ChangePasswordDto {
  @IsString() @MaxLength(128) current!: string;
  @IsString() @MinLength(10) @MaxLength(128) next!: string;
}
export class MfaEnableDto {
  @IsString() @Length(6, 8) code!: string;
}
export class MfaDisableDto {
  @IsString() @MaxLength(128) password!: string;
  @IsString() @Length(6, 20) code!: string;
}

export class LocaleDto {
  @IsIn(['en', 'si', 'ta']) locale!: 'en' | 'si' | 'ta';
}
