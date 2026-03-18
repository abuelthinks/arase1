import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

// Response interceptor — handle 401 by attempting a cookie-based token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Refresh token is in HttpOnly cookie — no body needed
                await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {}, {
                    withCredentials: true,
                });

                // Retry the original request (new access cookie is now set)
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed — redirect to login
                if (typeof window !== 'undefined') {
                    window.location.href = '/login';
                }
            }
        }

        return Promise.reject(error);
    }
);

export default api;
