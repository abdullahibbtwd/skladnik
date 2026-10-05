import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

export type ApiErrorParams = Record<string, string | number | boolean | null | undefined>;

export type ApiErrorBody = {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  params?: ApiErrorParams;
  warnings?: string[];
  errors?: { code: string; message: string; params?: ApiErrorParams }[];
  existingDocument?: unknown;
  similarProducts?: { id: string; name: string; code: string }[];
};

function body(statusCode: number, error: string, code: string, message: string, params?: ApiErrorParams, extra?: Partial<ApiErrorBody>): ApiErrorBody {
  return {
    statusCode,
    error,
    code,
    message,
    ...(params && Object.keys(params).length ? { params } : {}),
    ...extra,
  };
}

export function apiBadRequest(code: string, message: string, params?: ApiErrorParams, extra?: Partial<ApiErrorBody>) {
  return new BadRequestException(body(400, 'Bad Request', code, message, params, extra));
}

export function apiConflict(code: string, message: string, params?: ApiErrorParams, extra?: Partial<ApiErrorBody>) {
  return new ConflictException(body(409, 'Conflict', code, message, params, extra));
}

export function apiForbidden(code: string, message: string, params?: ApiErrorParams) {
  return new ForbiddenException(body(403, 'Forbidden', code, message, params));
}

export function apiNotFound(code: string, message: string, params?: ApiErrorParams) {
  return new NotFoundException(body(404, 'Not Found', code, message, params));
}

/** Prefer structured bodies so the client can localise by `code`. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(value && typeof value === 'object' && typeof (value as ApiErrorBody).code === 'string');
}

export function httpExceptionCode(error: HttpException): string | null {
  const response = error.getResponse();
  if (isApiErrorBody(response)) return response.code;
  return null;
}
