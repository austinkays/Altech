// ALTECH API DIAGNOSTIC - Run this in browser console at https://altech-rust.vercel.app

console.clear();
console.log("🔍 ALTECH API DIAGNOSTIC\n");

// Test 1: Check if Places API endpoint is working
console.log("1️⃣  Testing Places API Endpoint...");
fetch('/api/places-config.js')
    .then(r => r.json())
    .then(data => {
        if (data.apiKey) {
            console.log("✅ Places API Key Found:", data.apiKey.substring(0, 20) + "...");
        } else if (data.error) {
            console.log("❌ Places API Error:", data.error);
        }
    })
    .catch(e => console.log("❌ Places API Fetch Error:", e.message));

// Test 2: Check if Google Maps API loaded
setTimeout(() => {
    console.log("\n2️⃣  Checking Google Maps API...");
    if (window.google?.maps?.places) {
        console.log("✅ Google Maps Places API loaded");
    } else {
        console.log("❌ Google Maps Places API NOT loaded");
        console.log("   - Check browser console for script errors");
        console.log("   - Check Network tab for failed script loads");
    }
}, 1000);

// Test 3: Check App object
setTimeout(() => {
    console.log("\n3️⃣  Checking App object...");
    if (typeof App !== 'undefined') {
        console.log("✅ App object exists");
        console.log("   - App.data:", Object.keys(App.data).length, "fields stored");
        console.log("   - App.initPlaces:", typeof App.initPlaces);
    } else {
        console.log("❌ App object not found");
    }
}, 1500);

// Test 4: Check if address field exists
setTimeout(() => {
    console.log("\n4️⃣  Checking Form Fields...");
    const addrField = document.getElementById('addrStreet');
    if (addrField) {
        console.log("✅ Address field found");
        console.log("   - Try typing in it - should show suggestions");
    } else {
        console.log("❌ Address field not found");
    }
}, 2000);

// Test 5: Check for console errors
setTimeout(() => {
    console.log("\n5️⃣  NEXT STEPS:");
    console.log("   1. Go to Step 3 (Property Details)");
    console.log("   2. Click in the 'Street Address' field");
    console.log("   3. Start typing a city name like 'seattle' or 'vancouver'");
    console.log("   4. Should see address suggestions appear");
    console.log("\n   If nothing appears:");
    console.log("   - Check DevTools Network tab for failed requests");
    console.log("   - Check DevTools Console for JavaScript errors");
}, 2500);
