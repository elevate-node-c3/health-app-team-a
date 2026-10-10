import { Module } from '@nestjs/common';

import { AiModule } from './ai/ai.module';
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
import { MedicalQuestionModule } from './medical-question/medical-question.module';
import { NotificationModule } from './notification/notification.module';
import { PaymentMethodModule } from './payment-method/payment-method.module';
import { SearchModule } from './search/search.module';
import { SlotHoldModule } from './slot-hold/slot-hold.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AppCacheModule,
    AuthModule,
    DoctorModule,
    SearchModule,
    AiModule,
    AppointmentModule,
    ArticleModule,
    FavouriteModule,
    HomeModule,
    MedicalQuestionModule,
    PaymentMethodModule,
    SlotHoldModule,
    NotificationModule,
    CommonModules,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
