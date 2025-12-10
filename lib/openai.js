/**
 * @deprecated This file is deprecated. Use lib/translator.js instead.
 * All translation functions have been moved to lib/translator.js with:
 * - Retry logic (3 attempts)
 * - Response validation
 * - Better error handling
 * 
 * This file is kept for backward compatibility but will be removed in future versions.
 */

import { translateNewsItem, translateText } from './translator';

export { translateNewsItem, translateText };
