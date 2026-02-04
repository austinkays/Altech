# Quick Diagnostic - Run This Now

## Step-by-Step to Find What's Broken

1. **Open the app**: http://localhost:8000
2. **Press F12** to open DevTools
3. **Click Console tab**
4. **Copy-paste this script** and press Enter:

```javascript
// QUICK APP DIAGNOSTIC
const results = [];

// 1. Check App object
results.push({test: "App object exists", pass: typeof App !== 'undefined'});

// 2. Check methods
['save', 'load', 'next', 'prev', 'updateUI', 'exportXML', 'exportCMSMTF', 'exportPDF'].forEach(m => {
  results.push({test: `App.${m}()`, pass: typeof App[m] === 'function'});
});

// 3. Check form fields
['firstName', 'lastName', 'email', 'phone', 'dob'].forEach(id => {
  results.push({test: `Form field: ${id}`, pass: document.getElementById(id) !== null});
});

// 4. Check storage
const testData = {test: true};
try {
  localStorage.setItem('test', JSON.stringify(testData));
  const retrieved = JSON.parse(localStorage.getItem('test'));
  localStorage.removeItem('test');
  results.push({test: "localStorage works", pass: retrieved.test === true});
} catch(e) {
  results.push({test: "localStorage works", pass: false, error: e.message});
}

// 5. Check external libraries
results.push({test: "JSZip loaded", pass: typeof JSZip !== 'undefined'});
results.push({test: "jsPDF loaded", pass: typeof jsPDF !== 'undefined'});

// Print results
console.clear();
console.log("=== ALTECH DIAGNOSTIC REPORT ===\n");
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}\n`);

results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.test}`);
  if (r.error) console.log(`   Error: ${r.error}`);
});

console.log("\n=== NEXT STEPS ===");
if (failed === 0) {
  console.log("All checks passed! Please describe what feature isn't working:");
  console.log("- Try filling in a form field and refreshing - does data persist?");
  console.log("- Try clicking Next/Back - do buttons work?");
  console.log("- Try clicking Export XML - does it download?");
  console.log("- What SPECIFIC error do you see?");
} else {
  console.log(`Found ${failed} issue(s). See above for details.`);
}
```

5. **Tell me what you see** - specifically which tests fail (if any)
6. **Tell me what feature doesn't work** - example: "clicking Next button does nothing" or "XML export fails with error X"

## This will help me know exactly what to fix instead of guessing!
