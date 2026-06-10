import { Module } from '@nestjs/common';
import { RoutersService } from './routers.service';
import { MikroTikService } from './mikrotik.service';

@Module({
  providers: [RoutersService, MikroTikService],
  exports: [MikroTikService, RoutersService],
})
export class RoutersModule {}
