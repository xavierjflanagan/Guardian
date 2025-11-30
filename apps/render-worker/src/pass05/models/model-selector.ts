/**
 * Model Selector for Pass 0.5
 *
 * @deprecated This file re-exports from shared/ai for backward compatibility.
 * New code should import directly from '../shared/ai'.
 */

// Re-export from shared
export {
  ModelSelectionError,
  getSelectedModel,
  validateModelSelection
} from '../../shared/ai';

/**
 * Validate model selection on module load (fail-fast in production)
 *
 * This runs when the module is imported, ensuring the worker fails to start
 * if misconfigured. This prevents bad deployments from processing jobs.
 */
import { getSelectedModel } from '../../shared/ai';

if (process.env.NODE_ENV === 'production') {
  try {
    getSelectedModel();
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('WORKER STARTUP FAILED - MODEL CONFIGURATION ERROR');
    console.error('='.repeat(80));
    console.error((error as Error).message);
    console.error('='.repeat(80) + '\n');
    process.exit(1);  // Fail-fast in production
  }
}
