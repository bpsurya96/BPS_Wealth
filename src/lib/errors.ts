import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logging";

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status = 400,
    code = "BAD_REQUEST",
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleApiError(err: unknown, context: string) {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
      { status: err.status }
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const msg = err instanceof Error ? err.message : "Internal server error";
  logger.error("api_error", { context, message: msg });
  return NextResponse.json(
    {
      error:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : msg,
      code: "INTERNAL_ERROR",
    },
    { status: 500 }
  );
}
