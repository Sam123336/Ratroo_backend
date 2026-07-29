import { Logger } from '@nestjs/common';

export class TransitLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.log(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(
      meta ? `${message} ${JSON.stringify(meta)}` : message,
      error?.stack,
    );
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }
}
