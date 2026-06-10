import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in international format, e.g. +2348012345678',
  })
  phone!: string;

  @IsString()
  @Length(4, 8)
  otp!: string;
}
