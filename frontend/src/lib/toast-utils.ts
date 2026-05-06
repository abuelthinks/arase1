import { toast } from 'sonner';

/**
 * Extracts a user-friendly error message from an Axios error response.
 * Falls back to a generic message if no structured error is found.
 */
export function extractApiError(err: any, fallback = 'Something went wrong. Please try again.'): string {
    const data = err?.response?.data;
    if (!data) return fallback;

    // Direct error / detail fields (DRF standard)
    if (typeof data.error === 'string') return data.error;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.message === 'string') return data.message;

    // Field-level validation errors — pick the first one
    if (typeof data === 'object') {
        for (const key of Object.keys(data)) {
            const value = data[key];
            if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
                return value[0];
            }
            if (typeof value === 'string') return value;
        }
    }

    return fallback;
}

/**
 * Wraps a promise with `toast.promise` for automatic loading → success → error toasts.
 *
 * @example
 * ```ts
 * const result = await toastPromise(
 *   api.post('/api/students/1/enroll/'),
 *   { loading: 'Enrolling…', success: 'Student enrolled!', error: 'Failed to enroll.' }
 * );
 * ```
 */
export function toastPromise<T>(
    promise: Promise<T>,
    messages: {
        loading: string;
        success: string | ((data: T) => string);
        error?: string | ((err: any) => string);
    },
): Promise<T> {
    toast.promise(promise, {
        loading: messages.loading,
        success: typeof messages.success === 'function'
            ? (data: T) => (messages.success as (data: T) => string)(data)
            : messages.success,
        error: typeof messages.error === 'function'
            ? (err: any) => (messages.error as (err: any) => string)(err)
            : (err: any) => messages.error as string || extractApiError(err),
    });
    return promise;
}
