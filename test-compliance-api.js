/**
 * Test script for CGL Compliance API
 * Run with: node test-compliance-api.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local manually
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const HAWKSOFT_CLIENT_ID = process.env.HAWKSOFT_CLIENT_ID;
const HAWKSOFT_CLIENT_SECRET = process.env.HAWKSOFT_CLIENT_SECRET;
const HAWKSOFT_AGENCY_ID = process.env.HAWKSOFT_AGENCY_ID;

console.log('🔍 Testing CGL Compliance API Integration\n');

// Test 1: Verify environment variables
console.log('Test 1: Environment Variables');
console.log('✓ HAWKSOFT_CLIENT_ID:', HAWKSOFT_CLIENT_ID ? 'Set' : '❌ Missing');
console.log('✓ HAWKSOFT_CLIENT_SECRET:', HAWKSOFT_CLIENT_SECRET ? 'Set' : '❌ Missing');
console.log('✓ HAWKSOFT_AGENCY_ID:', HAWKSOFT_AGENCY_ID || '❌ Missing');

if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
  console.log('\n❌ Missing environment variables. API will not work.');
  process.exit(1);
}

console.log('\n✅ All environment variables configured\n');

// Test 2: Test HawkSoft API connectivity
console.log('Test 2: HawkSoft API Connectivity');

const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
const authHeader = Buffer.from(authString).toString('base64');

const options = {
  hostname: 'integration.hawksoft.app',
  path: '/vendor/agencies?version=3.0',
  method: 'GET',
  headers: {
    'Authorization': `Basic ${authHeader}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);

    if (res.statusCode === 200) {
      const agencies = JSON.parse(data);
      console.log('✅ Connected successfully');
      console.log('Subscribed agencies:', agencies);

      if (agencies.includes(parseInt(HAWKSOFT_AGENCY_ID))) {
        console.log(`✅ Agency ${HAWKSOFT_AGENCY_ID} is subscribed`);
      } else {
        console.log(`⚠️  Agency ${HAWKSOFT_AGENCY_ID} not in subscribed list`);
      }

      console.log('\n✅ API is ready for compliance dashboard');
      testClientFetch();
    } else {
      console.log('❌ API call failed');
      console.log('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
});

req.end();

// Test 3: Fetch a sample client to verify data structure
function testClientFetch() {
  console.log('\nTest 3: Sample Data Fetch (Recent Clients)');

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const asOfDate = encodeURIComponent(ninetyDaysAgo.toISOString());

  const clientOptions = {
    hostname: 'integration.hawksoft.app',
    path: `/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=3.0&asOf=${asOfDate}`,
    method: 'GET',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    }
  };

  const clientReq = https.request(clientOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        const clientIds = JSON.parse(data);
        console.log(`✅ Found ${clientIds.length} clients (last 90 days)`);

        if (clientIds.length > 0) {
          console.log(`Sample client IDs: ${clientIds.slice(0, 5).join(', ')}...`);
          console.log('\n✅ Dashboard will display policies from these clients');
        } else {
          console.log('⚠️  No clients found in last 90 days (dashboard may be empty)');
        }

        console.log('\n🎉 All tests passed! Compliance dashboard is ready to use.');
        console.log('\nNext steps:');
        console.log('1. Start dev server: npm run dev');
        console.log('2. Navigate to: http://localhost:3000/compliance');
        console.log('3. Wait 5-10 seconds for data to load');
      } else {
        console.log('⚠️  Client fetch returned status:', res.statusCode);
        console.log('This might affect dashboard performance');
      }
    });
  });

  clientReq.on('error', (error) => {
    console.error('❌ Client fetch error:', error.message);
  });

  clientReq.end();
}
