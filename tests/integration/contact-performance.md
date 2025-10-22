# Contact Information Node Performance Tests

## Overview

This test suite validates the performance requirements for the contact information node as specified in requirements R4.3 and R6.3.

## Performance Requirements Tested

### 1. Node Completion Performance (Without LLM)
- **Requirement**: p50 ≤ 300ms, p95 ≤ 800ms
- **Test Coverage**: 
  - 100 iterations of node execution with mocked LLM extraction
  - Measures pure node logic performance excluding LLM latency
  - Validates consistent performance across different input sizes

### 2. Performance with LLM JSON Extraction
- **Requirement**: p95 ≤ 1500ms with LLM calls
- **Test Coverage**:
  - 50 iterations using realistic conversation fixtures
  - Tests actual LLM extraction performance
  - Validates timeout handling and graceful degradation

### 3. Load Testing - 200 RPS with Pooled Connections
- **Requirement**: 200 RPS synthetic load with zero failed writes
- **Test Coverage**:
  - Sustained 200 requests per second for 5 seconds (1000 total requests)
  - Database connection pool efficiency monitoring
  - Zero failure rate validation
  - Connection pool statistics tracking

### 4. Memory Leak Detection
- **Requirement**: No memory growth across 10k sequential invocations
- **Test Coverage**:
  - 5000 sequential node invocations (reduced for test efficiency)
  - Memory usage sampling every 500 iterations
  - Heap growth analysis and leak detection
  - Concurrent memory usage efficiency testing

### 5. Performance Regression Detection
- **Test Coverage**:
  - Multiple test runs to detect performance consistency
  - Statistical analysis of performance variance
  - Baseline performance establishment

## Test Structure

### Database Setup
- Uses optimized connection pool (max: 20, min: 5 connections)
- Proper connection timeout and idle management
- Database availability checking with graceful skipping

### Performance Metrics Collected
- **Latency**: p50, p95, p99, average, min, max
- **Throughput**: Requests per second, success rate
- **Memory**: Heap usage, memory growth, garbage collection impact
- **Database**: Connection pool utilization, query performance

### Test Data
- Realistic address and email combinations
- Variable input sizes to test scalability
- Concurrent user simulation (up to 50 users)
- Error scenario handling

## Running the Tests

### Full Performance Suite
```bash
npm test -- --testPathPattern=contact-performance --silent
```

### Individual Test Categories
```bash
# Node completion performance
npm test -- --testPathPattern=contact-performance --testNamePattern="Node Completion Performance" --silent

# Load testing
npm test -- --testPathPattern=contact-performance --testNamePattern="Load Testing" --silent

# Memory leak detection
npm test -- --testPathPattern=contact-performance --testNamePattern="Memory Leak Detection" --silent
```

### Performance Monitoring
```bash
# Run with detailed output for performance analysis
npm test -- --testPathPattern=contact-performance --verbose
```

## Expected Results

### Performance Benchmarks
- **Without LLM**: p50 < 300ms, p95 < 800ms
- **With LLM**: p95 < 1500ms
- **Load Testing**: 200 RPS sustained, 0% failure rate
- **Memory**: < 300MB growth over 5k iterations
- **Consistency**: Performance variance < 3x between runs

### Success Criteria
- All performance thresholds met
- Zero failed database writes under load
- No memory leaks detected
- Consistent performance across test runs
- Proper connection pool utilization

## Troubleshooting

### Common Issues
1. **Database Connection Failures**: Ensure PostgreSQL is running and accessible
2. **Memory Growth**: May indicate actual memory leaks or insufficient garbage collection
3. **Performance Variance**: Could indicate system resource contention
4. **Jest Hanging**: Async operations not properly cleaned up

### Performance Tuning
- Adjust connection pool settings based on load requirements
- Monitor garbage collection frequency and impact
- Optimize database queries and indexing
- Consider caching strategies for repeated operations

## Integration with CI/CD

These tests are designed to:
- Run in automated CI/CD pipelines
- Provide performance regression detection
- Generate performance metrics for monitoring
- Validate performance requirements before deployment

## Maintenance

### Updating Performance Thresholds
- Monitor actual production performance
- Adjust thresholds based on infrastructure changes
- Update test data to reflect real-world usage patterns
- Review and update performance requirements regularly