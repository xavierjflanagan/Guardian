/**
 * AI Model Registry for Pass 0.5 Encounter Discovery
 *
 * @deprecated This file re-exports from shared/ai for backward compatibility.
 * New code should import directly from '../shared/ai'.
 */

// Re-export everything from shared
export {
  ModelDefinition,
  MODEL_REGISTRY,
  getModelById
} from '../../shared/ai';

// Legacy compatibility: getModelByEnvVar no longer exists, but wasn't used
// If needed, can be reconstructed using getModelsForPass('PASS_05')
