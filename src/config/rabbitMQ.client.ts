import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { AppModule } from '@/app.module';
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'Notifications_Health_App',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'notifications_health_app',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
    AppModule,
  ],
})
export class RabbitMQClientModule {}
