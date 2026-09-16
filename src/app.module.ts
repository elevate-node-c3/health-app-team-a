import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModules } from './common/services/common.module';
import { AppConfigModule } from './config/config.module';
import { DoctorModule } from './doctor/doctor.module';
import { AppCacheModule } from './infrastructure/cache/cache.module';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AppCacheModule,
    AuthModule,
    DoctorModule,
    CommonModules,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
