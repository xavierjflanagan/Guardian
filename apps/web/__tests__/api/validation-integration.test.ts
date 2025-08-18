/**
 * Validation Logic Tests
 * Tests the validation utilities directly without needing API route imports
 */

import { 
  validateInputWithSize, 
  AuditEventSchema, 
  CriticalEventTypes,
  requiresServerSideLogging,
  isValidationFailure,
  type ValidationResult
} from '@guardian/utils';

describe('Validation Logic Tests', () => {
  describe('Size Validation', () => {
    it('rejects payloads exceeding size limit', () => {
      const oversizedData = { data: 'x'.repeat(60000) };
      
      // Mock request with large Content-Length
      const mockRequest = {
        headers: {
          get: (header: string) => header === 'content-length' ? '60000' : null
        }
      } as any;

      const result = validateInputWithSize(
        AuditEventSchema, 
        oversizedData, 
        mockRequest, 
        { maxSize: 50000 }
      );

      expect(result.success).toBe(false);
      if (isValidationFailure(result)) {
        expect(result.error).toContain('too large');
        expect(result.status).toBe(413);
      }
    });

    it('accepts payloads within size limit', () => {
      const validData = {
        event_type: 'document_access',
        action: 'view',
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
        privacy_level: 'internal'
      };

      // Mock request with small Content-Length
      const mockRequest = {
        headers: {
          get: (header: string) => header === 'content-length' ? '200' : null
        }
      } as any;

      const result = validateInputWithSize(
        AuditEventSchema, 
        validData, 
        mockRequest, 
        { maxSize: 50000 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event_type).toBe('document_access');
      }
    });

    it('handles invalid Content-Length header', () => {
      const validData = {
        event_type: 'document_access',
        action: 'view',
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
        privacy_level: 'internal'
      };

      // Mock request with invalid Content-Length
      const mockRequest = {
        headers: {
          get: (header: string) => header === 'content-length' ? 'invalid-size' : null
        }
      } as any;

      const result = validateInputWithSize(
        AuditEventSchema, 
        validData, 
        mockRequest, 
        { maxSize: 50000 }
      );

      expect(result.success).toBe(false);
      if (isValidationFailure(result)) {
        expect(result.error).toBe('Invalid Content-Length header');
        expect(result.status).toBe(400);
      }
    });

    it('works without Content-Length header', () => {
      const validData = {
        event_type: 'document_access',
        action: 'view',
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
        privacy_level: 'internal'
      };

      // Mock request without Content-Length header
      const mockRequest = {
        headers: {
          get: () => null
        }
      } as any;

      const result = validateInputWithSize(
        AuditEventSchema, 
        validData, 
        mockRequest, 
        { maxSize: 50000 }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Schema Validation', () => {
    it('rejects invalid audit event data', () => {
      const invalidData = {
        invalid_field: 'invalid_data',
        // Missing required fields
      };

      const result = validateInputWithSize(AuditEventSchema, invalidData);

      expect(result.success).toBe(false);
      if (isValidationFailure(result)) {
        expect(result.error).toBe('Validation failed');
        expect(result.details).toBeDefined();
        expect(Array.isArray(result.details)).toBe(true);
        expect(result.status).toBe(400);
      }
    });

    it('accepts valid audit event data', () => {
      const validData = {
        event_type: 'document_access',
        action: 'view',
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
        privacy_level: 'internal'
      };

      const result = validateInputWithSize(AuditEventSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event_type).toBe('document_access');
        expect(result.data.action).toBe('view');
        expect(result.data.privacy_level).toBe('internal');
      }
    });

    it('validates all critical event types', () => {
      CriticalEventTypes.forEach(eventType => {
        const testData = {
          event_type: eventType,
          action: 'test_action',
          profile_id: '550e8400-e29b-41d4-a716-446655440000',
          session_id: '550e8400-e29b-41d4-a716-446655440001',
          metadata: {},
          privacy_level: 'internal'
        };

        const result = validateInputWithSize(AuditEventSchema, testData);
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid event types', () => {
      const testData = {
        event_type: 'invalid_event_type',
        action: 'test_action',
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
        privacy_level: 'internal'
      };

      const result = validateInputWithSize(AuditEventSchema, testData);
      expect(result.success).toBe(false);
    });
  });

  describe('Server-side Logging Logic', () => {
    it('correctly identifies events requiring server-side logging', () => {
      // Test critical events that require server-side logging
      expect(requiresServerSideLogging('data_access', 'document_view')).toBe(true);
      expect(requiresServerSideLogging('profile', 'switch')).toBe(true);
      expect(requiresServerSideLogging('document_access', 'test')).toBe(true); // event type is critical
      
      // Test non-critical events
      expect(requiresServerSideLogging('ui_interaction', 'button_click')).toBe(false);
      expect(requiresServerSideLogging('page_view', 'navigation')).toBe(false);
    });
  });
});