import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import {
  login,
  logout,
  logoutAll,
  publicUser,
  refresh,
  register,
} from './auth.service.js';

export const refreshCookieName = 'resolvehq_refresh';
export const refreshCookieOptions = {
  httpOnly: true,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
  sameSite: 'strict',
  secure: true,
};

function requireClientOrigin(req) {
  if (req.get('origin') !== env.CLIENT_ORIGIN) {
    throw new ApiError(403, 'FORBIDDEN', 'Request origin is not allowed');
  }
}

function setRefreshCookie(res, token) {
  res.cookie(refreshCookieName, token, refreshCookieOptions);
}

function sendSession(res, status, session) {
  setRefreshCookie(res, session.refreshToken);
  return res.status(status).json({
    data: {
      user: session.user,
      accessToken: session.accessToken,
    },
  });
}

export async function registerController(req, res) {
  return sendSession(res, 201, await register(req.body));
}

export async function loginController(req, res) {
  return sendSession(res, 200, await login(req.body, req.id));
}

export async function refreshController(req, res) {
  requireClientOrigin(req);
  const session = await refresh(req.cookies?.[refreshCookieName], req.id);
  return sendSession(res, 200, session);
}

export async function logoutController(req, res) {
  requireClientOrigin(req);
  await logout(req.cookies?.[refreshCookieName]);
  res.clearCookie(refreshCookieName, {
    httpOnly: refreshCookieOptions.httpOnly,
    path: refreshCookieOptions.path,
    sameSite: refreshCookieOptions.sameSite,
    secure: refreshCookieOptions.secure,
  });
  return res.status(204).end();
}

export function meController(req, res) {
  return res.status(200).json({ data: { user: publicUser(req.user) } });
}

export async function logoutAllController(req, res) {
  requireClientOrigin(req);
  try {
    await logoutAll(req.user._id);
  } finally {
    res.clearCookie(refreshCookieName, {
      httpOnly: refreshCookieOptions.httpOnly,
      path: refreshCookieOptions.path,
      sameSite: refreshCookieOptions.sameSite,
      secure: refreshCookieOptions.secure,
    });
  }
  return res.status(204).end();
}
