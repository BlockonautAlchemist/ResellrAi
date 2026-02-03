/**
 * eBay Publish Pipeline Logger
 *
 * Provides centralized logging with traceId for the 6-step publish pipeline.
 * All logs are prefixed with [eBay Publish][traceId=xxx] for easy filtering.
 *
 * Safe values to log: sku, offerId, listingId, merchantLocationKey, marketplaceId
 * Never log: tokens, full payloads, user PII
 */

import { randomUUID } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export type PublishStepName = 'location' | 'inventory' | 'policies' | 'offer' | 'fees' | 'publish';

export interface ApiCallLogParams {
  step: PublishStepName;
  method: string;
  path: string;
  statusCode: number;
  requestId?: string;
  payloadKeys?: string[];
  safeValues?: Record<string, string>;
}

export interface PublishLogger {
  traceId: string;
  logApiCall(params: ApiCallLogParams): void;
  logStepStart(stepName: PublishStepName): void;
  logStepComplete(stepName: PublishStepName, details?: Record<string, string>): void;
  logStepFailed(stepName: PublishStepName, error: string): void;
  logStepSkipped(stepName: PublishStepName, reason: string): void;
  logValidationError(field: string, message: string): void;
  logInfo(message: string, details?: Record<string, string>): void;
}

// =============================================================================
// TRACE ID GENERATION
// =============================================================================

/**
 * Generate a unique traceId for the publish pipeline
 * Uses crypto.randomUUID() for cryptographically secure IDs
 */
export function generateTraceId(): string {
  return randomUUID();
}

// =============================================================================
// LOGGER FACTORY
// =============================================================================

/**
 * Create a PublishLogger instance with the given traceId
 * All log methods will include the traceId in the prefix
 */
export function createPublishLogger(traceId: string): PublishLogger {
  const prefix = `[eBay Publish][traceId=${traceId}]`;

  return {
    traceId,

    logApiCall(params: ApiCallLogParams): void {
      const safeValuesStr = params.safeValues
        ? Object.entries(params.safeValues)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : '';
      const payloadKeysStr = params.payloadKeys
        ? `payloadKeys=[${params.payloadKeys.join(',')}]`
        : '';

      const parts = [
        `${prefix} API ${params.method} ${params.path}`,
        `status=${params.statusCode}`,
        params.requestId ? `requestId=${params.requestId}` : '',
        payloadKeysStr,
        safeValuesStr,
      ].filter(Boolean);

      console.log(parts.join(' '));
    },

    logStepStart(stepName: PublishStepName): void {
      console.log(`${prefix} Step ${stepName} started`);
    },

    logStepComplete(stepName: PublishStepName, details?: Record<string, string>): void {
      const detailsStr = details
        ? `{ ${Object.entries(details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')} }`
        : '';
      console.log(`${prefix} Step ${stepName} complete${detailsStr ? ' ' + detailsStr : ''}`);
    },

    logStepFailed(stepName: PublishStepName, error: string): void {
      console.error(`${prefix} Step ${stepName} FAILED: ${error}`);
    },

    logStepSkipped(stepName: PublishStepName, reason: string): void {
      console.log(`${prefix} Step ${stepName} skipped: ${reason}`);
    },

    logValidationError(field: string, message: string): void {
      console.error(`${prefix} Validation failed - ${field}: ${message}`);
    },

    logInfo(message: string, details?: Record<string, string>): void {
      const detailsStr = details
        ? `{ ${Object.entries(details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')} }`
        : '';
      console.log(`${prefix} ${message}${detailsStr ? ' ' + detailsStr : ''}`);
    },
  };
}
