import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix matching the project API spec (Base URL: /api/v1/)
  app.setGlobalPrefix('api/v1');

  // Global validation pipe - enforces DTO validation across the app
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error on unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter for consistent, logged error responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // Basic request logging middleware (foundation for error context)
  const loggerMiddleware = new RequestLoggerMiddleware();
  app.use(loggerMiddleware.use.bind(loggerMiddleware));

  // CORS enabled for mobile clients (React Native)
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 ShareLink NG Backend running on: http://localhost:${port}/api/v1`);
}
bootstrap();
