/**
 * Throttle Utility Function
 * Prevents a function from being called more frequently than specified
 * Useful for: scroll events, resize events, input changes
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
 */
export const throttle = (func, delay) => {
  let lastCall = 0;
  let timeoutId = null;

  return function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    const callFunction = () => {
      lastCall = Date.now();
      func.apply(this, args);
    };

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, call immediately
      callFunction();
      clearTimeout(timeoutId);
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
export const debounce = (func, delay) => {
  let timeoutId = null;

  return function debounced(...args) {
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
export const rafThrottle = (func) => {
  let rafId = null;
  let lastArgs = null;

  const wrappedFunc = (...args) => {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, lastArgs);
        rafId = null;
      });
    }
  };

  wrappedFunc.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return wrappedFunc;
};
