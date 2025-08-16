/**
 * Schema alignment tests
 * Ensures API schemas match Edge Function expectations
 */

import { 
  CriticalEventTypes, 
  PrivacyLevels, 
  ComplianceCategories,
  requiresServerSideLogging,
  type CriticalAuditEvent 
} from '../constants/audit-events';

import { 
  QualityActionTypes, 
  QualityFlagStatuses, 
  QualityFlagSeverities 
} from '../constants/quality-flags';

import { AuditEventSchema } from '../validation/schemas/audit-events';
import { QualityFlagActionSchema } from '../validation/schemas/quality-flags';

describe('Schema Alignment', () => {
  describe('Audit Events', () => {
    it('audit event schema accepts all critical event types', () => {
      CriticalEventTypes.forEach(eventType => {
        const testEvent = {
          event_type: eventType,
          action: 'test_action',
          profile_id: '550e8400-e29b-41d4-a716-446655440000',
          session_id: '550e8400-e29b-41d4-a716-446655440001',
          metadata: {},
          privacy_level: 'internal' as const
        };
        
        expect(() => AuditEventSchema.parse(testEvent)).not.toThrow();
      });
    });

    it('audit event schema accepts all privacy levels', () => {
      PrivacyLevels.forEach(privacyLevel => {
        const testEvent = {
          event_type: 'document_access' as const,
          action: 'view',
          profile_id: '550e8400-e29b-41d4-a716-446655440000',
          session_id: '550e8400-e29b-41d4-a716-446655440001',
          metadata: {},
          privacy_level
        };
        
        expect(() => AuditEventSchema.parse(testEvent)).not.toThrow();
      });
    });

    it('audit event schema accepts all compliance categories', () => {
      ComplianceCategories.forEach(category => {
        const testEvent = {
          event_type: 'document_access' as const,
          action: 'view',
          profile_id: '550e8400-e29b-41d4-a716-446655440000',
          session_id: '550e8400-e29b-41d4-a716-446655440001',
          metadata: {},
          privacy_level: 'internal' as const,
          compliance_category: category
        };
        
        expect(() => AuditEventSchema.parse(testEvent)).not.toThrow();
      });
    });

    it('requiresServerSideLogging function works correctly', () => {
      // Test critical events that require server-side logging
      expect(requiresServerSideLogging('data_access', 'document_view')).toBe(true);
      expect(requiresServerSideLogging('profile', 'switch')).toBe(true);
      expect(requiresServerSideLogging('document_access', 'test')).toBe(true); // event type is critical
      
      // Test non-critical events
      expect(requiresServerSideLogging('ui_interaction', 'button_click')).toBe(false);
    });
  });

  describe('Quality Flags', () => {
    it('quality flag schema accepts all action types', () => {
      QualityActionTypes.forEach(action => {
        const testAction = {
          action,
          // Add minimal required fields based on action
          ...(action === 'create' ? {
            flag_data: {
              severity: 'medium' as const,
              category: 'data_quality',
              description: 'Test flag',
              profile_id: '550e8400-e29b-41d4-a716-446655440000',
              metadata: {}
            }
          } : {}),
          ...(action === 'resolve' ? {
            flag_id: '550e8400-e29b-41d4-a716-446655440000',
            resolution_data: {
              resolution_notes: 'Resolved',
              metadata: {}
            }
          } : {}),
          ...(action === 'update' || action === 'delete' ? {
            flag_id: '550e8400-e29b-41d4-a716-446655440000'
          } : {})
        };
        
        expect(() => QualityFlagActionSchema.parse(testAction)).not.toThrow();
      });
    });

    it('quality flag schema accepts all severity levels', () => {
      QualityFlagSeverities.forEach(severity => {
        const testAction = {
          action: 'create' as const,
          flag_data: {
            severity,
            category: 'data_quality',
            description: 'Test flag',
            profile_id: '550e8400-e29b-41d4-a716-446655440000',
            metadata: {}
          }
        };
        
        expect(() => QualityFlagActionSchema.parse(testAction)).not.toThrow();
      });
    });

    it('quality flag schema accepts all status values', () => {
      QualityFlagStatuses.forEach(status => {
        const testAction = {
          action: 'resolve' as const,
          flag_id: '550e8400-e29b-41d4-a716-446655440000',
          resolution_data: {
            status,
            resolution_notes: 'Test resolution',
            metadata: {}
          }
        };
        
        expect(() => QualityFlagActionSchema.parse(testAction)).not.toThrow();
      });
    });
  });
});