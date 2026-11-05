import { ApiError } from '../utils/api-error.js';

export function errorHandler(error, req, res, _next) {
  const malformedJson = error?.type === 'entity.parse.failed';
  const knownError = error instanceof ApiError;

  if (!knownError && !malformedJson) {
    req.log.error({ err: error }, 'Unhandled request error');
  }

  const status = knownError ? error.status : malformedJson ? 400 : 500;
  const code = knownError
    ? error.code
    : malformedJson
      ? 'BAD_REQUEST'
      : 'INTERNAL';
  const message = knownError
    ? error.message
    : malformedJson
      ? 'Malformed JSON request'
      : 'Something went wrong';

  const responseError = {
    code,
    message,
    requestId: req.id,
  };
  if (knownError && error.details) {
    responseError.details = error.details;
  }

  res.status(status).json({ error: responseError });
}
