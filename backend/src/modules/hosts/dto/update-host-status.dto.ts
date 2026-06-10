import { IsEnum, IsString } from 'class-validator';

export enum HostStatusDto {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateHostStatusDto {
  @IsEnum(HostStatusDto)
  @IsString()
  status!: HostStatusDto;
}
