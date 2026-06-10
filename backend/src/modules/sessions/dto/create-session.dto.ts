import { IsString, IsOptional, IsNumber, IsEnum, Min, IsPhoneNumber } from 'class-validator';

export enum PassTypeDto {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
}

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  hostId?: string;

  @IsOptional()
  @IsString()
  hubSpotId?: string;

  @IsEnum(PassTypeDto)
  passType!: PassTypeDto;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid!: number;

  @IsOptional()
  @IsPhoneNumber('NG', { message: 'guestPhone must be a valid Nigerian phone number' })
  guestPhone?: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
