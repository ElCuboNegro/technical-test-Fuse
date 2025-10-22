/**
 * Contact Test Harness Unit Tests
 * 
 * Tests the test harness utilities for contact information node testing
 */

import { 
  replayConversation, 
  captureEvents, 
  ttsFormat, 
  maskPII, 
  loadFixture,
  verifyPIIRedaction,
  ContactTestFixture 
} from '../utils/contact-test-harness';

describe('Contact Test Harness', () => {
  describe('TTS Formatting', () => {
    it('should format ZIP codes correctly for TTS', () => {
      expect(ttsFormat.zipCode('12345')).toBe('1-2-3-4-5');
      expect(ttsFormat.zipCode('12345-6789')).toBe('1-2-3-4-5, dash, 6-7-8-9');
    });

    it('should format emails correctly for TTS', () => {
      expect(ttsFormat.email('user@example.com')).toBe('u-s-e-r- -a-t- -e-x-a-m-p-l-e- -d-o-t- -c-o-m');
    });

    it('should format addresses correctly for TTS', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };
      
      expect(ttsFormat.address(address)).toBe('123 Main St, Anytown, CA, 1-2-3-4-5');
    });

    it('should format addresses with unit numbers correctly for TTS', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      };
      
      expect(ttsFormat.address(address)).toBe('123 Main St, Apt 4B, Anytown, CA, 1-2-3-4-5');
    });
  });

  describe('PII Masking', () => {
    it('should mask email addresses', () => {
      expect(maskPII('user@example.com')).toBe('****@****.***');
    });

    it('should mask address objects', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };
      
      const masked = maskPII(address);
      expect(masked.street).toBe('****@****.***');
      expect(masked.city).toBe('****@****.***');
      expect(masked.zipCode).toBe('*****');
      expect(masked.state).toBe('CA'); // State codes are not masked
    });

    it('should handle null and undefined values', () => {
      expect(maskPII(null)).toBe(null);
      expect(maskPII(undefined)).toBe(undefined);
    });
  });

  describe('PII Redaction Verification', () => {
    it('should pass verification for properly redacted events', () => {
      const events = [
        {
          session_id: 'test-session',
          user_id: 'test-user',
          node: 'contact',
          event_type: 'contact_collected',
          success: true,
          attempt_number: 1,
          timestamp: new Date().toISOString(),
          redacted_fields: {
            address: '****@****.***',
            email: '****@****.***'
          }
        }
      ];
      
      const result = verifyPIIRedaction(events);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect unredacted email addresses', () => {
      const events = [
        {
          session_id: 'test-session',
          user_id: 'test-user',
          node: 'contact',
          event_type: 'contact_collected',
          success: true,
          attempt_number: 1,
          timestamp: new Date().toISOString(),
          redacted_fields: {
            address: '****@****.***',
            email: 'user@example.com' // Unredacted email
          }
        }
      ];
      
      const result = verifyPIIRedaction(events);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('Unredacted email found');
    });
  });

  describe('Event Capture', () => {
    it('should capture events for a session', async () => {
      const sessionId = 'test-session-123';
      const events = await captureEvents(sessionId);
      
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('session_id');
      expect(events[0]).toHaveProperty('node');
      expect(events[0]).toHaveProperty('success');
    });
  });

  describe('Conversation Replay', () => {
    it('should replay a simple conversation fixture', async () => {
      const mockFixture: ContactTestFixture = {
        description: 'Test fixture',
        scenario: 'test',
        requirements: ['R1'],
        conversation: [
          {
            turn: 1,
            speaker: 'agent',
            message: 'Please provide your address.',
            context: { identityVerified: true }
          },
          {
            turn: 2,
            speaker: 'user',
            message: '123 Main St, Anytown, CA, 12345',
            extracted_data: {
              street: '123 Main St',
              city: 'Anytown',
              state: 'CA',
              zipCode: '12345'
            }
          }
        ],
        expected_state: {
          collected: {
            contact: {
              address: {
                street: '123 Main St',
                city: 'Anytown',
                state: 'CA',
                zipCode: '12345'
              }
            }
          },
          needs: {
            identity: false,
            contact: false,
            financial: true,
            confirm: false
          },
          contactProgress: {
            addressComplete: true,
            emailComplete: false,
            unitNumberAsked: false
          }
        },
        expected_events: [
          {
            node: 'contact',
            success: true,
            attempt_number: 1
          }
        ]
      };

      const result = await replayConversation(mockFixture);
      
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.address).toBeDefined();
      expect(result.finalState.collected.contact.address.street).toBe('123 Main St');
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should handle validation errors in conversation replay', async () => {
      const mockFixture: ContactTestFixture = {
        description: 'Test fixture with invalid ZIP',
        scenario: 'test_invalid_zip',
        requirements: ['R1', 'R5'],
        conversation: [
          {
            turn: 1,
            speaker: 'agent',
            message: 'Please provide your address.',
            context: { identityVerified: true }
          },
          {
            turn: 2,
            speaker: 'user',
            message: '123 Main St, Anytown, CA, 123', // Invalid ZIP
            extracted_data: {
              street: '123 Main St',
              city: 'Anytown',
              state: 'CA',
              zipCode: '123'
            }
          }
        ],
        expected_state: {
          collected: {
            contact: {
              address: {
                street: '123 Main St',
                city: 'Anytown',
                state: 'CA',
                zipCode: '123'
              }
            }
          },
          needs: {
            identity: false,
            contact: true, // Should remain true due to validation error
            financial: false,
            confirm: false
          },
          contactProgress: {
            addressComplete: false,
            emailComplete: false,
            unitNumberAsked: false
          }
        },
        expected_events: [
          {
            node: 'contact',
            success: false,
            reason: 'INVALID_ZIP_FORMAT',
            attempt_number: 1
          }
        ]
      };

      const result = await replayConversation(mockFixture);
      
      expect(result.success).toBe(false);
      expect(result.finalState.needs.contact).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events[0].success).toBe(false);
      expect(result.events[0].reason).toBe('INVALID_ZIP_FORMAT');
    });
  });
});