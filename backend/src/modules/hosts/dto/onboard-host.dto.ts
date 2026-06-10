import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  ValidateNested,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RouterDetailsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  ipAddress!: string;

  @IsOptional()
  @IsInt()
  apiPort?: number;

  @IsString()
  username!: string;

  @IsString()
  password!: string;
}

export class OnboardHostDto {
  @IsOptional()
  @IsUUID()
  ispId?: string;

  @IsOptional()
  @IsString()
  ispName?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ValidateNested()
  @Type(() => RouterDetailsDto)
  router!: RouterDetailsDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePercentage?: number;
}
