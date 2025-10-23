/**
 * LangGraph Conversation Flow Integration
 * 
 * This module demonstrates the integration of the contact information node
 * within a complete conversation flow, showing how it connects to other nodes
 * and manages state transitions.
 * 
 * Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R2.3, R2.4, R4.1, R4.2, R4.3, R4.4
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';

// Import the contact information node
import { contactNode, ContactNodeInput, ContactNodeOutput } from '../nodes/contact-information';

// Import state management types
import { ContactState, ContactData, ContactProgress } from '../utils/contact-state-management';

/**
 * Complete conversation state for the voice verification system
 * 
 * This represents the full state that would be used in a complete
 * voice verification system, with the contact node as one component.
 */
export const ConversationState = Annotation.Root({
  // Identity verification (prerequisite for contact node)
  identityVerified: Annotation<boolean>({ default: false }),
  
  // Collected data from all nodes
  collected: Annotation<{
    identity?: any;
    contact?: ContactData;
    financial?: any;
  }>({
    default: {},
    reducer: (prev, next) => ({
      identity: { ...prev.identity, ...next.identity },
      contact: { ...prev.contact, ...next.contact },
      financial: { ...prev.financial, ...next.financial }
    })
  }),
  
  // Flow control flags
  needs: Annotation<{
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  }>({
    default: { identity: true, contact: false, financial: false, confirm: false }
  }),
  
  // Progress tracking for each node
  contactProgress: Annotation<ContactProgress>({
    default: {
      addressComplete: false,
      emailComplete: false,
      unitNumberAsked: false
    }
  }),
  
  // Error handling
  lastError: Annotation<{
    code: string;
    recoverable: boolean;
    message?: string;
    field?: string;
  } | null>({ default: null }),
  
  // Session metadata
  sessionId: Annotation<string>({ default: '' }),
  userId: Annotation<string>({ default: '' }),
  
  // Conversation history for context
  messages: Annotation<Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>>({
    default: [],
    reducer: (prev, next) => [...prev, ...next]
  })
});

export type ConversationStateType = typeof ConversationState.State;

/**
 * Mock identity verification node for demonstration
 * In a real system, this would implement actual identity verification
 */
const identityNode = async (state: ConversationStateType): Promise<Partial<ConversationStateType>> => {
  // Mock successful identity verification
  return {
    identityVerified: true,
    needs: {
      identity: false,
      contact: true,
      financial: false,
      confirm: false
    },
    messages: [{
      role: 'assistant',
      content: 'Identity verified successfully. Now I need to collect your contact information.',
      timestamp: new Date()
    }]
  };
};

/**
 * Mock financial verification node for demonstration
 * In a real system, this would implement financial data collection
 */
const financialNode = async (state: ConversationStateType): Promise<Partial<ConversationStateType>> => {
  // Mock successful financial data collection
  return {
    collected: {
      ...state.collected,
      financial: {
        monthlyIncome: 6500,
        jobTenureMonths: 36
      }
    },
    needs: {
      identity: false,
      contact: false,
      financial: false,
      confirm: true
    },
    messages: [{
      role: 'assistant',
      content: 'Financial information collected successfully. Let me confirm all your details.',
      timestamp: new Date()
    }]
  };
};

/**
 * Mock confirmation node for demonstration
 * In a real system, this would provide a complete summary for user confirmation
 */
const confirmationNode = async (state: ConversationStateType): Promise<Partial<ConversationStateType>> => {
  const contact = state.collected?.contact;
  const financial = state.collected?.financial;
  
  let summary = 'Let me confirm your information:\n\n';
  
  if (contact?.address) {
    summary += `Address: ${contact.address.street}`;
    if (contact.address.unitNumber) {
      summary += `, ${contact.address.unitNumber}`;
    }
    summary += `, ${contact.address.city}, ${contact.address.state} ${contact.address.zipCode}\n`;
  }
  
  if (contact?.email) {
    summary += `Email: ${contact.email}\n`;
  }
  
  if (financial) {
    summary += `Monthly Income: $${financial.monthlyIncome}\n`;
    summary += `Job Tenure: ${financial.jobTenureMonths} months\n`;
  }
  
  summary += '\nIs all this information correct?';
  
  return {
    needs: {
      identity: false,
      contact: false,
      financial: false,
      confirm: false
    },
    messages: [{
      role: 'assistant',
      content: summary,
      timestamp: new Date()
    }]
  };
};

/**
 * Wrapper for the contact node to integrate with the conversation state
 */
const contactNodeWrapper = async (state: ConversationStateType): Promise<Partial<ConversationStateType>> => {
  // Convert conversation state to contact node input format
  const contactInput: ContactNodeInput = {
    state: {
      identityVerified: state.identityVerified,
      collected: {
        contact: state.collected?.contact
      },
      needs: state.needs,
      contactProgress: state.contactProgress,
      lastError: state.lastError
    },
    config: {
      inputText: state.messages?.[state.messages.length - 1]?.content || '',
      metadata: {
        sessionId: state.sessionId,
        userId: state.userId
      },
      callbacks: {
        onEvent: (event) => {
          // Event logging handled by telemetry system
        },
        onPrompt: async (prompt: string) => {
          // Prompt handling for demo purposes
          return true; // Mock user confirmation
        }
      }
    }
  };
  
  // Execute the contact node
  const result = await contactNode.invoke(contactInput);
  
  // Convert contact node output back to conversation state format
  const stateUpdate: Partial<ConversationStateType> = {
    collected: {
      ...state.collected,
      contact: result.collected?.contact
    },
    needs: result.needs || state.needs,
    contactProgress: result.contactProgress || state.contactProgress,
    lastError: result.lastError
  };
  
  // Add appropriate message based on result
  if (result.lastError) {
    stateUpdate.messages = [{
      role: 'assistant',
      content: `I need to collect your contact information. ${result.lastError.message || 'Please provide your complete mailing address.'}`,
      timestamp: new Date()
    }];
  } else if (result.needs?.financial) {
    stateUpdate.messages = [{
      role: 'assistant',
      content: 'Thank you for providing your contact information. Now I need some financial details.',
      timestamp: new Date()
    }];
  }
  
  return stateUpdate;
};

/**
 * Create the conversation graph with proper routing
 */
export function createConversationGraph() {
  const graph = new StateGraph(ConversationState)
    .addNode('identity', identityNode)
    .addNode('contact', contactNodeWrapper)
    .addNode('financial', financialNode)
    .addNode('confirmation', confirmationNode)
    .addEdge(START, 'identity')
    .addConditionalEdges('identity', (state) => {
      if (state.needs.contact) return 'contact';
      if (state.needs.financial) return 'financial';
      if (state.needs.confirm) return 'confirmation';
      return END;
    })
    .addConditionalEdges('contact', (state) => {
      if (state.needs.contact) return 'contact'; // Retry contact collection
      if (state.needs.financial) return 'financial';
      if (state.needs.confirm) return 'confirmation';
      return END;
    })
    .addConditionalEdges('financial', (state) => {
      if (state.needs.financial) return 'financial'; // Retry financial collection
      if (state.needs.confirm) return 'confirmation';
      return END;
    })
    .addEdge('confirmation', END);
  
  return graph.compile();
}

/**
 * Utility function to simulate a conversation turn
 */
export async function simulateConversationTurn(
  graph: any,
  currentState: ConversationStateType,
  userMessage: string
): Promise<ConversationStateType> {
  // Add user message to conversation
  const stateWithUserMessage = {
    ...currentState,
    messages: [
      ...currentState.messages,
      {
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date()
      }
    ]
  };
  
  // Execute the graph with the updated state
  const result = await graph.invoke(stateWithUserMessage);
  
  return result;
}

/**
 * Example usage and testing function
 */
export async function demonstrateContactNodeIntegration(): Promise<void> {
  console.log('=== Contact Node Integration Demonstration ===\n');
  
  const graph = createConversationGraph();
  
  // Initialize conversation state
  let state: ConversationStateType = {
    identityVerified: false,
    collected: {},
    needs: { identity: true, contact: false, financial: false, confirm: false },
    contactProgress: {
      addressComplete: false,
      emailComplete: false,
      unitNumberAsked: false
    },
    lastError: null,
    sessionId: `demo-${Date.now()}`,
    userId: 'demo-user',
    messages: []
  };
  
  console.log('1. Starting conversation...');
  
  // Step 1: Identity verification (mocked)
  state = await graph.invoke(state);
  console.log('Assistant:', state.messages[state.messages.length - 1]?.content);
  
  // Step 2: Contact information collection
  console.log('\n2. User provides contact information...');
  state = await simulateConversationTurn(
    graph,
    state,
    'My address is 1247 Oak Street, Unit 3B, Denver, Colorado, 80202. My email is demo@example.com.'
  );
  console.log('Assistant:', state.messages[state.messages.length - 1]?.content);
  
  // Step 3: Financial information (mocked)
  console.log('\n3. Financial information collection...');
  state = await graph.invoke(state);
  console.log('Assistant:', state.messages[state.messages.length - 1]?.content);
  
  // Step 4: Final confirmation
  console.log('\n4. Final confirmation...');
  state = await graph.invoke(state);
  console.log('Assistant:', state.messages[state.messages.length - 1]?.content);
  
  console.log('\n=== Final State ===');
  console.log('Identity Verified:', state.identityVerified);
  console.log('Contact Data:', JSON.stringify(state.collected?.contact, null, 2));
  console.log('Contact Progress:', JSON.stringify(state.contactProgress, null, 2));
  console.log('Needs:', JSON.stringify(state.needs, null, 2));
  
  console.log('\n=== Integration Complete ===');
}