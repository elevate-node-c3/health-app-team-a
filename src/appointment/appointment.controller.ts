import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Request, type Response } from 'express';
import { InternalAdmin, Verified } from 'src/common/decorators/auth.decorator';

import { AppointmentBookingService } from './appointment-booking.service';
import {
  AppointmentHistoryService,
  PRESCRIPTION_MAX_FILE_SIZE_BYTES,
} from './appointment-history.service';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';
import { CreateBookingHoldDto } from './dto/create-booking-hold.dto';
import { CreateReplacementHoldDto } from './dto/create-replacement-hold.dto';

@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentBookingService: AppointmentBookingService,
    private readonly appointmentHistoryService: AppointmentHistoryService,
  ) {}

  @Verified()
  @Get()
  list(@Query() query: AppointmentHistoryQueryDto, @Req() req: Request) {
    return this.appointmentHistoryService.list(req.credentials.user.id, query);
  }

  @Verified()
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.appointmentHistoryService.cancel(req.credentials.user.id, id);
  }

  @Verified()
  @Post(':id/reschedule/holds')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplacementHoldDto,
    @Req() req: Request,
  ) {
    return this.appointmentBookingService.createReplacementHold(
      req.credentials.user.id,
      id,
      dto.scheduledAt,
      'reschedule',
    );
  }

  @Verified()
  @Post(':id/rebook/holds')
  rebook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplacementHoldDto,
    @Req() req: Request,
  ) {
    return this.appointmentBookingService.createReplacementHold(
      req.credentials.user.id,
      id,
      dto.scheduledAt,
      'rebook',
    );
  }

  @Verified()
  @Get(':id/prescription')
  prescriptionLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.appointmentHistoryService.prescriptionLink(
      req.credentials.user.id,
      id,
    );
  }

  @Post(':id/prescription')
  @InternalAdmin()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRESCRIPTION_MAX_FILE_SIZE_BYTES },
    }),
  )
  async attachPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-internal-actor-id') actorId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.appointmentHistoryService.attachPrescription(actorId, id, file);
  }

  @Verified()
  @Get(':id/prescription/download')
  async downloadPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expiresAt') expiresAt: string,
    @Query('signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.appointmentHistoryService.prescriptionFile(
      req.credentials.user.id,
      id,
      Number(expiresAt),
      signature,
    );
    res.type(file.contentType).download(file.path);
  }

  @Verified()
  @Post('holds')
  createHold(@Body() dto: CreateBookingHoldDto, @Req() req: Request) {
    return this.appointmentBookingService.createHold(
      req.credentials.user.id,
      dto,
    );
  }
}
