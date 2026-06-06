import { type Request, type Response, type NextFunction } from 'express';
import { supabase } from './supabase';

const TOKEN_KEY = 'hubcredo_token';
const REFRESH_KEY = 'hubcredo_refresh_token';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    res.status(401).json({ error: 'No authorization token' });
    return;
  }

  try {
    // Verify the token by getting the user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
};

export const setToken = (token: string, refreshToken?: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
};

export const removeToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      removeToken();
      return null;
    }

    const data = await res.json();
    setToken(data.token, data.refresh_token);
    return data.token;
  } catch {
    return null;
  }
}
