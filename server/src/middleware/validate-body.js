import { ApiError } from '../utils/api-error.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(
        new ApiError(
          422,
          'VALIDATION_FAILED',
          'Request validation failed',
          details,
        ),
      );
    }

    req.body = result.data;
    return next();
  };
}
