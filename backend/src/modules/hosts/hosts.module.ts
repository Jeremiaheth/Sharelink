import { Module } from '@nestjs/common';
import { HostsController } from './hosts.controller';
import { HostsService } from './hosts.service';
import { AuthModule } from '../auth/auth.module';
import { RoutersModule } from '../routers/routers.module';

@Module({
  imports: [AuthModule, RoutersModule],
  controllers: [HostsController],
  providers: [HostsService],
  exports: [HostsService],
})
export class HostsModule {}
