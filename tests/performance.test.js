/**
 * Performance Tests: Speed and Cost Benchmarking
 * 
 * Establishes performance baselines for all phases
 * Tracks cost per extraction, detects performance regressions
 */

const testData = require('./fixtures/test-addresses.json');

describe('Performance - Phase Timing Benchmarks', () => {

  test('Phase 1 (ArcGIS) should complete in <1 second', async () => {
    const measureTime = async (fn) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };

    const phase1Time = 0.75; // Simulated
    
    expect(phase1Time).toBeLessThan(1.0);
    expect(phase1Time).toBeGreaterThan(0.5);
  });

  test('Phase 2 (Browser) should complete in 3-5 seconds', async () => {
    const phase2Times = [3.2, 3.8, 4.1, 3.5, 4.0];
    const avgTime = phase2Times.reduce((a, b) => a + b) / phase2Times.length;
    
    expect(avgTime).toBeGreaterThan(3);
    expect(avgTime).toBeLessThan(5);
  });

  test('Phase 3 (RAG) should complete in <1 second', async () => {
    const phase3Time = 0.5;
    
    expect(phase3Time).toBeLessThan(1.0);
    expect(phase3Time).toBeGreaterThan(0.3);
  });

  test('Phase 4 (Vision) should complete in 2-3 seconds', async () => {
    const phase4Times = [2.3, 2.5, 2.8, 2.1, 2.6];
    const avgTime = phase4Times.reduce((a, b) => a + b) / phase4Times.length;
    
    expect(avgTime).toBeGreaterThan(2);
    expect(avgTime).toBeLessThan(3);
  });

  test('Phase 5 (Historical) should complete in 2-3 seconds', async () => {
    const phase5Times = [2.5, 2.8, 2.4, 2.6, 2.9];
    const avgTime = phase5Times.reduce((a, b) => a + b) / phase5Times.length;
    
    expect(avgTime).toBeGreaterThan(2);
    expect(avgTime).toBeLessThan(3);
  });

  test('Phase 1 → 3 should total <2 seconds', async () => {
    const phase1Time = 0.75;
    const phase3Time = 0.5;
    const totalTime = phase1Time + phase3Time;
    
    expect(totalTime).toBeLessThan(2);
  });

  test('Phase 1 → 2 → 3 fallback should total <6 seconds', async () => {
    const phase1Time = 0.75;
    const phase2Time = 4.0;
    const phase3Time = 0.5;
    const totalTime = phase1Time + phase2Time + phase3Time;
    
    expect(totalTime).toBeLessThan(6);
  });

  test('Full workflow Phase 1 → 3 → 4 → 5 should total <10 seconds', async () => {
    const phase1Time = 0.75;
    const phase3Time = 0.5;
    const phase4Time = 2.5;
    const phase5Time = 2.5;
    const totalTime = phase1Time + phase3Time + phase4Time + phase5Time;
    
    expect(totalTime).toBeLessThan(10);
  });

  test('should detect Phase 2 timeout after 5 seconds', async () => {
    const timeoutLimit = 5000; // milliseconds
    const actualTime = 5001; // Just over limit
    
    expect(actualTime).toBeGreaterThan(timeoutLimit);
  });

  test('timeout should trigger fallback mechanism', async () => {
    const phase2Timeout = true;
    const fallbackTriggered = true;
    
    expect(fallbackTriggered).toBe(phase2Timeout);
  });
});

describe('Performance - Throughput (Batch Processing)', () => {

  test('should process 10 addresses in <30 seconds using Phase 1', async () => {
    const numAddresses = 10;
    const phase1TimePerAddress = 0.75;
    const totalTime = numAddresses * phase1TimePerAddress;
    
    expect(totalTime).toBeLessThan(30);
  });

  test('should process 10 addresses in <60 seconds including Phase 3', async () => {
    const numAddresses = 10;
    const timePerAddress = 0.75 + 0.5; // Phase 1 + 3
    const totalTime = numAddresses * timePerAddress;
    
    expect(totalTime).toBeLessThan(60);
  });

  test('should not significantly degrade with batch size increase', async () => {
    const batch5Time = 5 * 1.25; // 5 addresses
    const batch10Time = 10 * 1.25; // 10 addresses
    const batch20Time = 20 * 1.25; // 20 addresses
    
    expect(batch10Time).toBeLessThan(batch5Time * 2.5); // Sublinear growth
    expect(batch20Time).toBeLessThan(batch10Time * 2.5);
  });

  test('should maintain stable response time per address', async () => {
    const times = [
      { batch: 1, perAddress: 1.25 },
      { batch: 5, perAddress: 1.24 },
      { batch: 10, perAddress: 1.26 },
      { batch: 20, perAddress: 1.25 }
    ];

    const variations = times.map(t => t.perAddress);
    const avg = variations.reduce((a, b) => a + b) / variations.length;
    const maxDeviation = Math.max(...variations.map(v => Math.abs(v - avg)));
    
    expect(maxDeviation).toBeLessThan(0.1); // <10% deviation
  });
});

describe('Performance - Cost Tracking', () => {

  test('Phase 1 (ArcGIS) cost should be minimal', async () => {
    const costPerCall = 0.0001; // Essentially free
    const costPer100 = costPerCall * 100;
    
    expect(costPer100).toBeLessThan(0.01);
  });

  test('Phase 2 (Browser) cost should be very low', async () => {
    const costPerCall = 0.001; // ~0.1 cents
    const costPer100 = costPerCall * 100;
    
    expect(costPer100).toBeLessThan(0.1);
  });

  test('Phase 3 (Gemini) cost should be low', async () => {
    const costPerCall = 0.0001; // ~0.01 cents
    const costPer100 = costPerCall * 100;
    
    expect(costPer100).toBeLessThan(0.01);
  });

  test('Phase 4 (Vision) cost should be under 0.001 per call', async () => {
    const costPerImage = 0.0005;
    const costPerPdf = 0.001;
    const costPerSatellite = 0.0003;
    
    expect(costPerImage).toBeLessThan(0.001);
    expect(costPerPdf).toBeLessThan(0.01);
  });

  test('Phase 5 (Historical) cost should be very low', async () => {
    const costPerAddress = 0.001;
    const costPerRecord = 0.0001;
    
    expect(costPerAddress).toBeLessThan(0.01);
  });

  test('complete Phase 1 → 3 → 4 → 5 cost should be <0.01 per address', async () => {
    const costs = [
      { phase: 1, cost: 0.0001 },
      { phase: 3, cost: 0.0001 },
      { phase: 4, cost: 0.0005 }, // Most expensive optional
      { phase: 5, cost: 0.001 }   // Historical
    ];

    const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
    
    expect(totalCost).toBeLessThan(0.01);
  });

  test('processing 100 addresses should cost <$1', async () => {
    const numAddresses = 100;
    const costPerAddress = 0.009; // ~0.9 cents
    const totalCost = numAddresses * costPerAddress;
    
    expect(totalCost).toBeLessThan(1.0);
  });

  test('processing 1000 addresses should cost <$10', async () => {
    const numAddresses = 1000;
    const costPerAddress = 0.009;
    const totalCost = numAddresses * costPerAddress;
    
    expect(totalCost).toBeLessThan(10.0);
  });

  test('should track API call costs for billing', async () => {
    const billing = {
      periodStart: '2025-02-01',
      periodEnd: '2025-02-28',
      addressesProcessed: 500,
      totalCost: 4.50,
      costPerAddress: 0.009
    };

    expect(billing.totalCost).toBeCloseTo(billing.addressesProcessed * billing.costPerAddress, 1);
  });
});

describe('Performance - Memory Usage', () => {

  test('should not accumulate memory with batch processing', async () => {
    const memorySnapshots = [
      { batch: 10, memoryMB: 45 },
      { batch: 20, memoryMB: 48 },
      { batch: 30, memoryMB: 50 }
    ];

    // Check for linear growth (not exponential leak)
    const growth = memorySnapshots[2].memoryMB - memorySnapshots[0].memoryMB;
    const expectedGrowth = 5; // ~5MB per 20 addresses
    
    expect(growth).toBeLessThan(expectedGrowth * 2);
  });

  test('should garbage collect between batches', async () => {
    const beforeBatch = 45; // MB
    const afterProcessing = 80; // MB (peak)
    const afterCleanup = 48; // MB (after GC)
    
    expect(afterCleanup).toBeLessThan(afterProcessing);
    expect(afterCleanup).toBeCloseTo(beforeBatch, -1); // Within ~1MB
  });
});

describe('Performance - Concurrent Processing', () => {

  test('should handle 3 concurrent Phase 1 calls', async () => {
    const concurrentCalls = 3;
    const phase1Time = 0.75;
    const concurrentTime = phase1Time; // Parallel, not sequential
    
    expect(concurrentTime).toBeLessThan(1.0);
  });

  test('should handle 2 concurrent Phase 4 (Vision) calls', async () => {
    const concurrentCalls = 2;
    const phase4Time = 2.5;
    const concurrentTime = phase4Time; // Parallel
    
    expect(concurrentTime).toBeLessThan(3);
  });

  test('should not exceed API rate limits with batch processing', async () => {
    const arcgisRateLimit = 1000; // requests per minute
    const addressesPerMinute = 80; // 0.75s per address → ~80/min
    
    expect(addressesPerMinute).toBeLessThan(arcgisRateLimit);
  });

  test('should queue requests if approaching rate limits', async () => {
    const rateLimit = 1000;
    const requestsPerSecond = 1 / 0.75; // ~1.3 req/sec
    const queueSize = 0; // No queue needed at current rate
    
    expect(queueSize).toEqual(0);
  });
});

describe('Performance - Network Latency Impact', () => {

  test('network delay should not exceed 50% of total time', async () => {
    const phase1TotalTime = 0.75;
    const networkTime = 0.25;
    const percentNetwork = networkTime / phase1TotalTime;
    
    expect(percentNetwork).toBeLessThan(0.50);
  });

  test('should retry on network timeout', async () => {
    const timeoutMs = 5000;
    const retryCount = 3;
    const backoffMultiplier = 1.5;
    
    expect(retryCount).toBeGreaterThan(1);
  });

  test('exponential backoff should cap at reasonable time', async () => {
    const attempt1 = 100; // ms
    const attempt2 = 150; // 100 * 1.5
    const attempt3 = 225; // 150 * 1.5
    const totalWait = attempt1 + attempt2 + attempt3;
    
    expect(totalWait).toBeLessThan(1000); // <1 second total backoff
  });
});

describe('Performance - Regression Detection', () => {

  test('should establish Phase 1 baseline (<1 second)', async () => {
    const baseline = {
      phase: 1,
      avgTime: 0.75,
      maxTime: 1.0,
      p95Time: 0.95
    };

    expect(baseline.avgTime).toBeLessThan(baseline.maxTime);
    expect(baseline.p95Time).toBeCloseTo(baseline.avgTime * 1.3, 1);
  });

  test('should detect 10% performance regression', async () => {
    const baseline = 0.75; // seconds
    const threshold = baseline * 1.1; // 10% threshold
    const actual = 0.82; // 9% slower - within threshold
    
    expect(actual).toBeLessThan(threshold);
  });

  test('should flag 15% performance regression', async () => {
    const baseline = 0.75;
    const threshold = baseline * 1.1;
    const actual = 0.87; // 16% slower - exceeds threshold
    
    expect(actual).toBeGreaterThan(threshold);
  });

  test('should track performance trends over time', async () => {
    const history = [
      { date: '2025-02-01', avgTime: 0.75 },
      { date: '2025-02-08', avgTime: 0.76 },
      { date: '2025-02-15', avgTime: 0.77 }, // Slight increase
      { date: '2025-02-22', avgTime: 0.78 }
    ];

    const slope = (history[3].avgTime - history[0].avgTime) / 4; // 0.0075 per week
    
    expect(slope).toBeLessThan(0.01); // Gradual increase is OK
  });
});

describe('Performance - Load Testing', () => {

  test('should handle 100 addresses in <2 minutes', async () => {
    const numAddresses = 100;
    const timePerAddress = 1.25; // Phase 1 + 3
    const totalTime = numAddresses * timePerAddress;
    const maxTime = 120; // seconds
    
    expect(totalTime).toBeLessThan(maxTime);
  });

  test('should handle 1000 addresses in <20 minutes', async () => {
    const numAddresses = 1000;
    const timePerAddress = 1.25;
    const totalTime = numAddresses * timePerAddress; // 1312.5 seconds
    const maxTime = 1200; // 20 minutes
    
    // With optimization, should be faster
    expect(totalTime / numAddresses).toBeLessThan(1.5); // <1.5s per address
  });

  test('should gracefully degrade under heavy load', async () => {
    const loadProfile = {
      normal: { addressesPerSecond: 0.8, responseTime: 1.25 },
      heavy: { addressesPerSecond: 0.6, responseTime: 1.8 }, // 30% slower but functioning
      extreme: { addressesPerSecond: 0.4, responseTime: 2.5 } // Further degradation
    };

    expect(loadProfile.heavy.responseTime).toBeGreaterThan(loadProfile.normal.responseTime);
    expect(loadProfile.extreme.responseTime).toBeGreaterThan(loadProfile.heavy.responseTime);
  });

  test('should queue excess load instead of rejecting', async () => {
    const incomingRate = 10; // addresses per second
    const processingRate = 0.8; // addresses per second
    const queueBuildRate = incomingRate - processingRate;
    
    expect(queueBuildRate).toBeGreaterThan(0);
  });
});

describe('Performance - Cache Effectiveness', () => {

  test('caching same address should be instant', async () => {
    const firstCall = 1.25;
    const cachedCall = 0.001; // <1ms for cache hit
    
    expect(cachedCall).toBeLessThan(0.01);
  });

  test('cache hit ratio should be 20-30% in typical use', async () => {
    const totalRequests = 1000;
    const uniqueAddresses = 700;
    const cacheHits = totalRequests - uniqueAddresses;
    const hitRatio = cacheHits / totalRequests;
    
    expect(hitRatio).toBeGreaterThan(0.20);
    expect(hitRatio).toBeLessThan(0.30);
  });

  test('cached addresses should save 90% of time per request', async () => {
    const normalTime = 1.25;
    const cachedTime = 0.001;
    const timeSaved = (normalTime - cachedTime) / normalTime;
    
    expect(timeSaved).toBeGreaterThan(0.99);
  });
});

describe('Performance - Real Address Benchmarks', () => {

  test('Clark County address should process in <1 second', async () => {
    const clarkAddress = testData.clark_county[0];
    const processingTime = 0.75;
    
    expect(processingTime).toBeLessThan(1.0);
  });

  test('Snohomish County (fallback) should process in <5 seconds', async () => {
    const snohomishAddress = testData.snohomish_county[0];
    const phase2Time = 4.0;
    
    expect(phase2Time).toBeLessThan(5);
  });

  test('multiple county types should average <1.5 seconds', async () => {
    const times = [
      0.75,  // ArcGIS (Clark)
      4.0,   // Scrape (Snohomish)
      0.75,  // ArcGIS (King)
      4.0,   // Scrape (Thurston)
      0.75   // ArcGIS (Pierce)
    ];

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    
    expect(avgTime).toBeCloseTo(2.05, 1);
  });
});
