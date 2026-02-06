/**
 * HawkSoft API Connection Test
 *
 * This script tests the HawkSoft API connection using the credentials
 * stored in .env.local file.
 *
 * Run: node test-hawksoft-api.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]+)"?$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const HAWKSOFT_CLIENT_ID = envVars.HAWKSOFT_CLIENT_ID;
const HAWKSOFT_CLIENT_SECRET = envVars.HAWKSOFT_CLIENT_SECRET;
const HAWKSOFT_AGENCY_ID = envVars.HAWKSOFT_AGENCY_ID;

console.log('🔐 HawkSoft API Configuration:');
console.log('   Client ID:', HAWKSOFT_CLIENT_ID ? '✓ Configured' : '✗ Missing');
console.log('   Client Secret:', HAWKSOFT_CLIENT_SECRET ? '✓ Configured' : '✗ Missing');
console.log('   Agency ID:', HAWKSOFT_AGENCY_ID || '✗ Missing');
console.log('');

if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Test API Connection
async function testHawkSoftAPI() {
  const BASE_URL = 'https://integration.hawksoft.app';
  const API_VERSION = '3.0';

  // Create Basic Auth header
  const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
  const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

  console.log('🔌 Testing HawkSoft API Connection...\n');

  try {
    // Test 1: Get Agencies
    console.log('Test 1: Fetching subscribed agencies...');
    const response = await fetch(`${BASE_URL}/vendor/agencies?version=${API_VERSION}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    console.log('   Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('   ❌ Failed:', errorText);
      return;
    }

    const agencies = await response.json();
    console.log('   ✅ Success! Agencies:', agencies);
    console.log('   📌 Your configured agency ID:', HAWKSOFT_AGENCY_ID);

    // Check if configured agency is in the list
    if (Array.isArray(agencies) && agencies.includes(parseInt(HAWKSOFT_AGENCY_ID))) {
      console.log('   ✅ Configured agency ID is valid and subscribed!');
    } else {
      console.log('   ⚠️  Warning: Configured agency ID not found in subscribed agencies list');
    }

    console.log('');

    // Test 2: Get Offices
    console.log('Test 2: Fetching agency offices...');
    const officesResponse = await fetch(
      `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/offices?version=${API_VERSION}`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   Status:', officesResponse.status, officesResponse.statusText);

    if (officesResponse.ok) {
      const offices = await officesResponse.json();
      console.log('   ✅ Success! Found', offices.length, 'office(s)');
      offices.forEach((office, i) => {
        console.log(`   📍 Office ${i + 1}:`, office.OfficeDescription || 'Unnamed');
        if (office.PrimaryOffice) {
          console.log('      (Primary Office)');
        }
      });
    } else {
      const errorText = await officesResponse.text();
      console.log('   ❌ Failed:', errorText);
    }

    console.log('');
    console.log('✨ HawkSoft API is configured and working!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Deploy to Vercel: vercel --prod');
    console.log('2. Add HawkSoft environment variables to Vercel project settings');
    console.log('3. Test the /api/hawksoft endpoint');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error testing HawkSoft API:', error.message);
    console.error('');

    if (error.code === 'ENOTFOUND') {
      console.error('Unable to reach HawkSoft API server. Check your internet connection.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused by HawkSoft API server.');
    }
  }
}

// Run the test
testHawkSoftAPI();
