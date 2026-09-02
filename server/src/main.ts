import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module";
import { readServerEnvironment, validateEnvironment } from "./common/env";
import { StructuredLogger } from "./common/structured-logger.service";

async function bootstrap() {
  const env = validateEnvironment();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(app.get(StructuredLogger));
  app.setGlobalPrefix("api");
  app.use(express.json({ limit: env.requestBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));
  app.use(cookieParser());
  app.use(securityHeaders);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.enableCors({
    origin(origin, callback) {
      if (!origin && !env.isProduction) return callback(null, true);
      if (origin && env.frontendOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      return callback(new Error("Origin is not allowed by RufsunCAD CORS policy"));
    },
    credentials: true
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  app.get(StructuredLogger).log(`RufsunCAD API listening on http://localhost:${port}/api`, "Bootstrap");
}

void bootstrap();

function securityHeaders(_request: express.Request, response: express.Response, next: express.NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (readServerEnvironment().isProduction) {
    response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}
