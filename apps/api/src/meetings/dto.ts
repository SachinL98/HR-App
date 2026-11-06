import {
  IsTimeZone,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsTimeZone() timeZone?: string;
  @IsOptional() @IsString() @Length(0, 200) location?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  meetUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  memberIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  departmentIds?: string[];
}

export class RsvpDto {
  @IsIn(['YES', 'NO', 'MAYBE']) rsvp!: 'YES' | 'NO' | 'MAYBE';
}

export class AvailabilityDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  memberIds!: string[];
}
