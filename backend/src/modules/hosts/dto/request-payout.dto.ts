import { IsNumber, Min } from 'class-validator';

export class RequestPayoutDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(5000, { message: 'Minimum payout amount is ₦5,000' })
  amount!: number;
}
