import axios from 'axios';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const envApiUrl = rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '';

const getBrowserApiBaseUrl = () => {
    if (envApiUrl) {
        return envApiUrl;
    }

    if (process.env.NODE_ENV !== 'production') {
        return 'http://localhost:8000';
    }

    return '';
};

export const API_BASE_URL =
    typeof window !== 'undefined'
        ? getBrowserApiBaseUrl()
        : (envApiUrl || 'http://localhost:8000');

/**
 * Axios instance configured for cookie-based HttpOnly JWT auth.
 * - `withCredentials: true` ensures cookies are sent/received automatically.
 * - No manual Authorization header injection needed.
 */
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Send HttpOnly cookies with every request
});

// Public paths that should never trigger a redirect to /login
const PUBLIC_PATHS = ['/api/auth/token/', '/api/auth/token/refresh/', '/api/auth/me/', '/api/invitations/accept/'];

// Response interceptor — handle 401 by attempting a cookie-based token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Don't retry/redirect for auth endpoints themselves — avoids infinite loops
        const requestUrl: string = originalRequest?.url || '';
        const isPublicRequest = PUBLIC_PATHS.some(p => requestUrl.includes(p));

        if (error.response?.status === 401 && !originalRequest._retry && !isPublicRequest) {
            originalRequest._retry = true;

            try {
                // Refresh token is in HttpOnly cookie — no body needed
                await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {}, {
                    withCredentials: true,
                });

                // Retry the original request (new access cookie is now set)
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed — redirect to login only if not already there
                if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
                }
            }
        }

        return Promise.reject(error);
    }
);

export default api;
