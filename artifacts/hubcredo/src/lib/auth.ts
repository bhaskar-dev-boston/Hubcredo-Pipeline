const TOKEN_KEY = 'hubcredo_token';
const REFRESH_TOKEN_KEY = 'hubcredo_refresh_token';

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string, refreshToken?: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
};

export const removeToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setRefreshToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const removeRefreshToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      removeToken();
      removeRefreshToken();
      return null;
    }

    const data = await response.json();
    if (data.token) {
      setToken(data.token);
      if (data.refresh_token) {
        setRefreshToken(data.refresh_token);
      }
      return data.token;
    }

    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    removeToken();
    removeRefreshToken();
    return null;
  }
};