import { Module } from '@nestjs/common';
import { AppointmentModule } from 'src/appointment/appointment.module';
import { ArticleModule } from 'src/article/article.module';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorModule } from 'src/doctor/doctor.module';
import { FavouriteModule } from 'src/favourite/favourite.module';

import { HomeController } from './home.controller';
import { HomeAnalyticsListener } from './home.events';
import { HomeService } from './home.service';

@Module({
  imports: [
    AuthModule,
    DoctorModule,
    AppointmentModule,
    ArticleModule,
    FavouriteModule,
  ],
  controllers: [HomeController],
  providers: [HomeService, HomeAnalyticsListener],
})
export class HomeModule {}
