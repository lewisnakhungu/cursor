export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InsufficientStockError extends AppError {
  constructor(message: string) {
    super(message, "INSUFFICIENT_STOCK");
    this.name = "InsufficientStockError";
  }
}

function prismaUserMessage(error: {
  code?: string;
  message?: string;
}): string | null {
  switch (error.code) {
    case "P2034":
      return "Busy — another sale is in progress. Try again.";
    case "P2028":
      return "Database timed out. Try again with a smaller cart.";
    case "ETIMEDOUT":
      return "Could not reach the database. Check your connection and retry.";
    default:
      return null;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error && typeof error === "object" && "code" in error) {
    const mapped = prismaUserMessage(
      error as { code?: string; message?: string },
    );
    if (mapped) return mapped;
  }
  if (error instanceof Error) {
    if (error.message.includes("Sale record missing after dispense")) {
      return "Dispense could not be saved for this facility. Sign out and back in, then retry.";
    }
    return error.message;
  }
  return "An unexpected error occurred";
}
