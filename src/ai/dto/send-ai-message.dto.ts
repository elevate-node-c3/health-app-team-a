import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class SendAiMessageDto {
  @IsUUID() requestId!: string;
  @IsString() @Length(1, 4000) @Matches(/\S/) content!: string;
}
