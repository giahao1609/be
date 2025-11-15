import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import dayjs from 'dayjs';
import { isISO8601 } from 'class-validator';

@Injectable()
export class DateRangePipe implements PipeTransform {
  transform(
    payload: { fromDate: string; toDate: string },
    metadata: ArgumentMetadata,
  ) {
    if (!payload) {
      throw new BadRequestException('DATE_RANGE_REQUIRED');
    }

    const isValidatedFromDate = isISO8601(payload.fromDate);
    if (isValidatedFromDate === false) {
      throw new BadRequestException('FROM_DATE_NOT_VALIDATED');
    }
    const isValidatedToDate = isISO8601(payload.toDate);
    if (isValidatedToDate === false) {
      throw new BadRequestException('TO_DATE_NOT_VALIDATED');
    }

    return {
      fromDate: dayjs(payload.fromDate).startOf('month').toISOString(),
      toDate: dayjs(payload.toDate).endOf('month').toISOString(),
    };
  }
}
