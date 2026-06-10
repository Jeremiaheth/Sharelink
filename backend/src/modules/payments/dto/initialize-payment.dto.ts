import { IsEmail, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PassTypeDto } from '../../sessions/dto/create-session.dto';

export class InitializePaymentDto {
  @IsEmail()
  email!: string; // Paystack requires customer email

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number; // in NGN (will convert to kobo)

  @IsOptional()
  @IsUUID()
  hostId?: string;

  @IsOptional()
  @IsUUID()
  hubSpotId?: string;

  @IsString()
  passType!: PassTypeDto; // 'HOURLY' or 'DAILY'

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
