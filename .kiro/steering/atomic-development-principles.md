# Atomic Development Principles - MANDATORY ENFORCEMENT

## Core Principle: One Item at a Time

**ABSOLUTE RULE: Never work on multiple items simultaneously**

### Definition of "One Item"
- A single component (e.g., Button, FormField)
- A single API endpoint (e.g., GET /users/{id})
- A single database migration step
- A single utility function
- A single test file for one component

### What is NOT One Item
❌ **Multiple components in one task**
❌ **An entire module or feature**
❌ **Frontend + backend + database in one go**
❌ **Multiple API endpoints**
❌ **Refactoring multiple files simultaneously**

## Enforcement Mechanism 1: Task Granularity Validation

### Pre-Task Checklist
Before starting any task, validate:

1. **Single Responsibility Check**
   - Can this task be described in one sentence?
   - Does it modify only one logical unit?
   - Can it be tested independently?

2. **Atomic Completion Check**
   - Can this be completed and committed as one unit?
   - Will the build still compile after this change?
   - Is there a clear definition of "done"?

3. **Dependency Isolation Check**
   - Does this task depend on other incomplete work?
   - Can it be built and tested without waiting for other tasks?

### Validation Questions
- **Question 1**: "What single thing am I building?"
- **Question 2**: "How will I test this one thing?"
- **Question 3**: "What will break if I only do this one thing?"

If you can't answer these clearly, the task is too large.

## Enforcement Mechanism 2: Test-First Validation

### Required Test Pattern
Every atomic item MUST have:

1. **One Test File** per atomic item
2. **Test Written First** before implementation
3. **Test Passes** before task completion
4. **Build Compiles** after implementation

### Test Validation Rules
```typescript
// Example: Button component test structure
describe('Button Component (Atomic Item)', () => {
  it('should render with required props', () => {
    // Test the single responsibility
  })
  
  it('should handle click events', () => {
    // Test the single behavior
  })
  
  // NO MORE THAN 3-4 TESTS PER ATOMIC ITEM
})
```

### Test Failure Protocol
If test fails:
1. **STOP** - Do not continue with other items
2. **FIX** - Address the failing test
3. **VERIFY** - Ensure build compiles
4. **COMMIT** - Only then move to next item

## Enforcement Mechanism 3: Compilation Success Validation

### Build Validation Protocol
After each atomic item:

1. **Run Build Command**
   ```bash
   npm run build
   ```

2. **Verify No Errors**
   - TypeScript compilation succeeds
   - No import/export errors
   - No missing dependencies

3. **Run Tests**
   ```bash
   npm test -- --run
   ```

4. **Commit Atomic Change**
   ```bash
   git add .
   git commit -m "feat: add [atomic item description]"
   ```

### Build Failure Recovery
If build fails:
1. **IMMEDIATE STOP** - Do not add more code
2. **IDENTIFY** - What broke the build?
3. **REVERT** - If necessary, revert to last working state
4. **FIX** - Address the specific build issue
5. **VERIFY** - Build must pass before continuing

## Serial Development Protocol

### Vertical Slice Priority
Always prioritize end-to-end communication:

1. **Database Schema** (if needed)
2. **API Endpoint** (backend)
3. **Frontend Component** (UI)
4. **Integration Test** (full flow)

### No Parallel Work Rule
- **Never** work on frontend while backend is incomplete
- **Never** work on multiple components simultaneously
- **Never** assume integration will work - validate it

## Examples and Anti-Patterns

### ✅ CORRECT: Atomic Development
```
Task: "Create login button component"
- Write Button.test.tsx
- Create Button.tsx with basic structure
- Implement click handler
- Style the button
- Verify test passes
- Verify build compiles
- Commit: "feat: add login button component"
```

### ❌ INCORRECT: Non-Atomic Development
```
Task: "Build user authentication system"
- This includes: login form, validation, API calls, database, routing
- Too many items in one task
- Cannot be tested atomically
- High chance of integration failures
```

### ✅ CORRECT: API Endpoint
```
Task: "Add GET /users/{id} endpoint"
- Write endpoint test
- Create route handler
- Add database query
- Test with real database
- Verify response format
- Commit: "feat: add get user by id endpoint"
```

### ❌ INCORRECT: Multiple Endpoints
```
Task: "Add user CRUD endpoints"
- Includes GET, POST, PUT, DELETE
- Multiple responsibilities
- Cannot isolate failures
- Integration complexity
```

## Validation System Implementation

### Automated Checks
Create validation scripts that check:

1. **Task Description Length**
   - Max 10 words for task title
   - Single sentence description

2. **File Change Scope**
   - Max 3 files modified per commit
   - Single logical unit changed

3. **Test Coverage**
   - Each new component has test file
   - Test file created before implementation

### Manual Validation Checkpoints

#### Before Starting Task
- [ ] Task is atomic (single responsibility)
- [ ] Dependencies are clear and available
- [ ] Success criteria defined
- [ ] Test approach planned

#### During Implementation
- [ ] Only working on one item
- [ ] Test written first
- [ ] Build compiles after each change
- [ ] No shortcuts or assumptions

#### Before Completion
- [ ] Test passes
- [ ] Build compiles successfully
- [ ] Single atomic commit ready
- [ ] Next task identified and scoped

## Conflict Resolution Hierarchy

### When Principles Conflict

1. **Compilation Success** > Feature Completeness
   - If adding a feature breaks the build, revert
   - Working build is always priority

2. **Atomic Completion** > Speed
   - Never rush by combining items
   - Better to do one thing well than many things poorly

3. **Test Coverage** > Implementation Speed
   - Test must be written first
   - No implementation without test validation

4. **Serial Development** > Parallel Efficiency
   - Complete vertical slice before expanding
   - End-to-end validation before new features

## Fallback Procedures

### When Atomic Development Fails

1. **Task Too Large Signal**
   - If task takes more than 2 hours, it's not atomic
   - Break down immediately
   - Re-scope to smaller units

2. **Integration Failure Signal**
   - If tests pass but integration fails
   - Missing dependency or assumption
   - Return to vertical slice validation

3. **Build Failure Signal**
   - Immediate stop and revert
   - Identify root cause
   - Fix before any new development

### Recovery Protocol
1. **STOP** all development
2. **ASSESS** what broke
3. **REVERT** to last working state
4. **RE-SCOPE** the task atomically
5. **RESTART** with proper validation

This atomic development approach ensures consistent, reliable progress while working with AI assistance, preventing the common pitfalls of over-ambitious parallel development.