import { IsBoolean } from 'class-validator';

/** FR-103 : coche ou décoche une opération optionnelle de la prestation. */
export class SelectOperationDto {
  @IsBoolean()
  selected: boolean;
}
