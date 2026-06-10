import { IsString, IsOptional, IsNumber, Min, Max, IsUUID } from 'class-validator';

export class CreateHostDto {
  @IsUUID()
  userId!: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePercentage?: number;
}
