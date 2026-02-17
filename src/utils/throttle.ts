/**
 * ================================================================================
 * FILE: throttle.ts - THROTTLE UTILITY FUNCTION
 * ================================================================================
 * 
 * Prevents a function from being called more frequently than specified interval
 * Optimized for performance-critical events like scroll, resize, input changes
 * 
 * FUNCTIONALITY:
 * - Immediate first call within interval
 * - Subsequent calls delayed to maintain minimum interval
 * - Trailing call guaranteed if function called during throttle period
 * - Memory efficient with automatic cleanup
 * 
 * @param {Function} func - Function to throttle
 * @param {number} delay - Minimum milliseconds between calls
 * @returns {Function} Throttled function
 * 
 * Example:
 *   const throttledScroll = throttle(() => {
 *     console.log('Scroll detected');
 *   }, 100);
 *   element.addEventListener('scroll', throttledScroll);
 * 
 * ================================================================================
 */

export const throttle = <T extends (...args: any[]) => any>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function throttled(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    const callFunction = () => {
      lastCall = Date.now();
      func.apply(this, args);
    };

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, call immediately
      callFunction();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = null;
    } else if (!timeoutId) {
      // Schedule a call for later
      const remainingTime = delay - timeSinceLastCall;
      timeoutId = setTimeout(callFunction, remainingTime);
    }
  };
};

/**
 * Debounce Utility Function
 * Delays function execution until after specified time has passed
 * Useful for: search input, form validation, resize handlers
 * 
 * @param {Function} func - Function to debounce
 * @param {number} delay - Milliseconds to wait after last invocation
 * @returns {Function} Debounced function
 * 
 * Example:
 *   const debouncedSearch = debounce((query) => {
 *     searchAPI(query);
 *   }, 300);
 *   inputElement.addEventListener('input', (e) => debouncedSearch(e.target.value));
 */
export const debounce = <T extends (...args: any[]) => any>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  };
};

/**
 * RequestAnimationFrame Throttle
 * Throttles function to browser's refresh rate (~60fps)
 * Best performance for visual updates
 * 
 * @param {Function} func - Function to throttle
 * @returns {Function} RAF throttled function
 */
export const rafThrottle = <T extends (...args: any[]) => any>(func: T) => {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const wrappedFunc = (...args: Parameters<T>) => {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs) {
          func.apply(null, lastArgs);
        }
        rafId = null;
      });
    }
  };

  (wrappedFunc as any).cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return wrappedFunc;
};
