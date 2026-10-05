import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';
import { Verified } from 'src/common/decorators/auth.decorator';

import { AskMedicalQuestionDto } from './dto/ask-medical-question.dto';
import { ListMedicalQuestionsQueryDto } from './dto/list-medical-questions-query.dto';
import { MedicalQuestionService } from './medical-question.service';

@Verified()
@Controller('medical-questions')
export class MedicalQuestionController {
  constructor(
    private readonly medicalQuestionService: MedicalQuestionService,
  ) {}

  @Post()
  ask(@Body() dto: AskMedicalQuestionDto, @Req() req: Request) {
    return this.medicalQuestionService.ask(req.credentials.user.id, dto);
  }

  @Get()
  list(@Query() query: ListMedicalQuestionsQueryDto, @Req() req: Request) {
    return this.medicalQuestionService.list(
      req.credentials.user.id,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.medicalQuestionService.get(req.credentials.user.id, id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.medicalQuestionService.delete(req.credentials.user.id, id);
  }
}
