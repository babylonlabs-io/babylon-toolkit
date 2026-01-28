export class ApiError extends Error {
  public readonly status: number;
  public readonly response?: string;

  constructor(message: string, status: number, response?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = response;
  }
}
