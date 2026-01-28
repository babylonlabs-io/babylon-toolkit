export enum ErrorCode {
  API_ERROR = "API_ERROR",
  API_TIMEOUT = "API_TIMEOUT",
  API_UNAUTHORIZED = "API_UNAUTHORIZED",
  API_NOT_FOUND = "API_NOT_FOUND",
  API_SERVER_ERROR = "API_SERVER_ERROR",
  API_CLIENT_ERROR = "API_CLIENT_ERROR",

  GEO_BLOCK = "GEO_BLOCK",

  CONTRACT_ERROR = "CONTRACT_ERROR",
  CONTRACT_REVERT = "CONTRACT_REVERT",
  CONTRACT_EXECUTION_FAILED = "CONTRACT_EXECUTION_FAILED",
  CONTRACT_INSUFFICIENT_GAS = "CONTRACT_INSUFFICIENT_GAS",
  CONTRACT_NONCE_ERROR = "CONTRACT_NONCE_ERROR",

  NETWORK_ERROR = "NETWORK_ERROR",
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  NETWORK_CONNECTION_FAILED = "NETWORK_CONNECTION_FAILED",
  NETWORK_OFFLINE = "NETWORK_OFFLINE",

  WALLET_ERROR = "WALLET_ERROR",
  WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
  WALLET_REJECTED = "WALLET_REJECTED",
  WALLET_INSUFFICIENT_BALANCE = "WALLET_INSUFFICIENT_BALANCE",
  WALLET_TRANSACTION_FAILED = "WALLET_TRANSACTION_FAILED",
  WALLET_NETWORK_MISMATCH = "WALLET_NETWORK_MISMATCH",

  VALIDATION_ERROR = "VALIDATION_ERROR",
  VALIDATION_INVALID_INPUT = "VALIDATION_INVALID_INPUT",
  VALIDATION_MISSING_REQUIRED_FIELD = "VALIDATION_MISSING_REQUIRED_FIELD",
  VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",
  VALIDATION_OUT_OF_RANGE = "VALIDATION_OUT_OF_RANGE",
}

export interface BaseErrorOptions {
  code: ErrorCode;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly response?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: ErrorCode = ErrorCode.API_ERROR,
    response?: string,
    options?: Omit<BaseErrorOptions, "code">,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.response = response;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class ContractError extends Error {
  public readonly code: ErrorCode;
  public readonly transactionHash?: string;
  public readonly reason?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONTRACT_ERROR,
    transactionHash?: string,
    reason?: string,
    options?: Omit<BaseErrorOptions, "code">,
  ) {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.transactionHash = transactionHash;
    this.reason = reason;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class WalletError extends Error {
  public readonly code: ErrorCode;
  public readonly walletType?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.WALLET_ERROR,
    walletType?: string,
    options?: Omit<BaseErrorOptions, "code">,
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.walletType = walletType;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class ValidationError extends Error {
  public readonly code: ErrorCode;
  public readonly field?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_ERROR,
    field?: string,
    options?: Omit<BaseErrorOptions, "code">,
  ) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.field = field;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
