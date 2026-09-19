import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentModule } from './appointment/appointment.module';
import { ArticleModule } from './article/article.module';
import { AuthModule } from './auth/auth.module';
import { CommonModules } from './common/services/common.module';
import { AppConfigModule } from './config/config.module';
import { DoctorModule } from './doctor/doctor.module';
import { FavouriteModule } from './favourite/favourite.module';
import { HomeModule } from './home/home.module';
import { AppCacheModule } from './infrastructure/cache/cache.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    AppConfigModule,
    DatabaseModule,
    AppCacheModule,
    AuthModule,
    DoctorModule,
    SearchModule,
    AppointmentModule,
    ArticleModule,
    FavouriteModule,
    HomeModule,
    CommonModules,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
