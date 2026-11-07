import { ApiError } from '../utils/api-error.js';
import { can } from '../utils/permissions.js';

export function authorize(permission) {
  return (req, _res, next) => {
    if (!req.ctx || !can(req.ctx.role, permission)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'));
    }

    return next();
  };
}
