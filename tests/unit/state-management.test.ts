/**
 * State Management & Routing Flags Unit Tests
 * 
 * Tests for state management utilities and routing flag logic used by the contact information node.
 * 
 * Requirements: R4.1, R4.2, R4.3, R4.4
 */

import {
  updateContactState,
  setRoutingFlags,
  validateStateTransition,
  isContactComplete,
  getNextStep,
  resetContactProgress,
  mergeContactProgress
} from '../../src/utils/state-management';

describe('State Management & Routing Flags', () => {
  describe('updateContactState', () => {
    it('should update contact state with complete payload', () => {
      const initialState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const contactData = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        },
        email: 'user@example.com'
      };

      const result = updateContactState(initialState, contactData);

      expect(result.collected.contact).toEqual(contactData);
      expect(result.needs).toEqual({
        identity: false,
        contact: false,
        financial: true,
        confirm: false
      });
      expect(result.contactProgress).toEqual({
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: true
      });
    });

    it('should handle contact data without email', () => {
      const initialState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const contactData = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        }
      };

      const result = updateContactState(initialState, contactData);

      expect(result.collected.contact.address).toEqual(contactData.address);
      expect(result.collected.contact.email).toBeUndefined();
      expect(result.needs.contact).toBe(false);
      expect(result.needs.financial).toBe(true);
      expect(result.contactProgress.emailComplete).toBe(true); // No email is considered complete
    });

    it('should handle contact data with unit number', () => {
      const initialState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const contactData = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          unitNumber: 'Apt 4B'
        },
        email: 'user@example.com'
      };

      const result = updateContactState(initialState, contactData);

      expect(result.collected.contact.address.unitNumber).toBe('Apt 4B');
      expect(result.contactProgress.unitNumberAsked).toBe(true);
    });
  });

  describe('setRoutingFlags', () => {
    it('should set routing flags for financial step', () => {
      const flags = setRoutingFlags('financial');

      expect(flags).toEqual({
        identity: false,
        contact: false,
        financial: true,
        confirm: false
      });
    });

    it('should set routing flags for confirmation step', () => {
      const flags = setRoutingFlags('confirm');

      expect(flags).toEqual({
        identity: false,
        contact: false,
        financial: false,
        confirm: true
      });
    });

    it('should set routing flags for contact retry', () => {
      const flags = setRoutingFlags('contact');

      expect(flags).toEqual({
        identity: false,
        contact: true,
        financial: false,
        confirm: false
      });
    });

    it('should handle invalid step gracefully', () => {
      const flags = setRoutingFlags('invalid' as any);

      expect(flags).toEqual({
        identity: false,
        contact: true,
        financial: false,
        confirm: false
      });
    });
  });

  describe('validateStateTransition', () => {
    it('should validate valid transition from contact to financial', () => {
      const currentState = {
        needs: { identity: false, contact: false, financial: true, confirm: false },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      const result = validateStateTransition(currentState, 'financial');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject transition when contact is incomplete', () => {
      const currentState = {
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const result = validateStateTransition(currentState, 'financial');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('CONTACT_INCOMPLETE');
    });

    it('should reject transition when identity is not verified', () => {
      const currentState = {
        needs: { identity: true, contact: false, financial: false, confirm: false },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      const result = validateStateTransition(currentState, 'contact');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('IDENTITY_NOT_VERIFIED');
    });

    it('should validate transition to confirmation', () => {
      const currentState = {
        needs: { identity: false, contact: false, financial: false, confirm: true },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      const result = validateStateTransition(currentState, 'confirm');

      expect(result.valid).toBe(true);
    });
  });

  describe('isContactComplete', () => {
    it('should return true when all contact data is complete', () => {
      const contactProgress = {
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: true
      };

      expect(isContactComplete(contactProgress)).toBe(true);
    });

    it('should return false when address is incomplete', () => {
      const contactProgress = {
        addressComplete: false,
        emailComplete: true,
        unitNumberAsked: true
      };

      expect(isContactComplete(contactProgress)).toBe(false);
    });

    it('should return false when email is incomplete', () => {
      const contactProgress = {
        addressComplete: true,
        emailComplete: false,
        unitNumberAsked: true
      };

      expect(isContactComplete(contactProgress)).toBe(false);
    });

    it('should return false when unit number not asked', () => {
      const contactProgress = {
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: false
      };

      expect(isContactComplete(contactProgress)).toBe(false);
    });

    it('should handle undefined progress', () => {
      expect(isContactComplete(undefined)).toBe(false);
      expect(isContactComplete(null as any)).toBe(false);
    });
  });

  describe('getNextStep', () => {
    it('should return financial when contact is complete', () => {
      const state = {
        needs: { identity: false, contact: false, financial: true, confirm: false },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      expect(getNextStep(state)).toBe('financial');
    });

    it('should return contact when contact is incomplete', () => {
      const state = {
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      expect(getNextStep(state)).toBe('contact');
    });

    it('should return confirm when ready for confirmation', () => {
      const state = {
        needs: { identity: false, contact: false, financial: false, confirm: true },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      expect(getNextStep(state)).toBe('confirm');
    });

    it('should return identity when identity not verified', () => {
      const state = {
        needs: { identity: true, contact: false, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      expect(getNextStep(state)).toBe('identity');
    });
  });

  describe('resetContactProgress', () => {
    it('should reset all contact progress flags', () => {
      const progress = {
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: true,
        emailConfirmationAttempts: 2
      };

      const result = resetContactProgress(progress);

      expect(result).toEqual({
        addressComplete: false,
        emailComplete: false,
        unitNumberAsked: false,
        emailConfirmationAttempts: 0
      });
    });

    it('should handle undefined progress', () => {
      const result = resetContactProgress(undefined);

      expect(result).toEqual({
        addressComplete: false,
        emailComplete: false,
        unitNumberAsked: false
      });
    });
  });

  describe('mergeContactProgress', () => {
    it('should merge contact progress updates', () => {
      const currentProgress = {
        addressComplete: false,
        emailComplete: false,
        unitNumberAsked: false
      };

      const updates = {
        addressComplete: true,
        unitNumberAsked: true
      };

      const result = mergeContactProgress(currentProgress, updates);

      expect(result).toEqual({
        addressComplete: true,
        emailComplete: false,
        unitNumberAsked: true
      });
    });

    it('should handle partial updates', () => {
      const currentProgress = {
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: false
      };

      const updates = {
        emailComplete: false
      };

      const result = mergeContactProgress(currentProgress, updates);

      expect(result).toEqual({
        addressComplete: true,
        emailComplete: false,
        unitNumberAsked: false
      });
    });

    it('should handle undefined current progress', () => {
      const updates = {
        addressComplete: true,
        emailComplete: true
      };

      const result = mergeContactProgress(undefined, updates);

      expect(result).toEqual({
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: false
      });
    });
  });

  describe('idempotency', () => {
    it('should not duplicate or regress progress on re-invocation', () => {
      const initialState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const contactData = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        },
        email: 'user@example.com'
      };

      // First invocation
      const firstResult = updateContactState(initialState, contactData);
      
      // Second invocation with same data
      const secondResult = updateContactState(firstResult, contactData);

      // Results should be identical
      expect(secondResult).toEqual(firstResult);
      expect(secondResult.contactProgress.addressComplete).toBe(true);
      expect(secondResult.contactProgress.emailComplete).toBe(true);
      expect(secondResult.contactProgress.unitNumberAsked).toBe(true);
    });

    it('should maintain state consistency across multiple updates', () => {
      let currentState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      // Update address only
      const addressData = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        }
      };

      currentState = updateContactState(currentState, addressData);
      expect(currentState.contactProgress.addressComplete).toBe(true);
      expect(currentState.contactProgress.emailComplete).toBe(true); // No email = complete
      expect(currentState.needs.contact).toBe(false);
      expect(currentState.needs.financial).toBe(true);

      // Re-update with same data should not change anything
      const duplicateUpdate = updateContactState(currentState, addressData);
      expect(duplicateUpdate).toEqual(currentState);
    });
  });

  describe('routing flag management', () => {
    it('should properly manage routing flags for financial node transition', () => {
      const state = {
        collected: { 
          contact: {
            address: {
              street: '123 Main St',
              city: 'Anytown',
              state: 'CA',
              zipCode: '12345'
            },
            email: 'user@example.com'
          }
        },
        needs: { identity: false, contact: false, financial: true, confirm: false },
        contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
      };

      const nextStep = getNextStep(state);
      expect(nextStep).toBe('financial');

      const validation = validateStateTransition(state, 'financial');
      expect(validation.valid).toBe(true);
    });

    it('should prevent invalid transitions', () => {
      const incompleteState = {
        collected: { contact: {} },
        needs: { identity: false, contact: true, financial: false, confirm: false },
        contactProgress: { addressComplete: false, emailComplete: false, unitNumberAsked: false }
      };

      const validation = validateStateTransition(incompleteState, 'financial');
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('CONTACT_INCOMPLETE');
    });
  });
});