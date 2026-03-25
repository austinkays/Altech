$f = 'C:\Users\austinkays\Documents\App Development\Altech\plugins\commercial-quoter.html'
$c = Get-Content $f -Raw -Encoding UTF8

$datalists = @"

            <!-- Limit suggestion lists -->
            <datalist id="cq-gl-occ-list">
                <option value="`$300,000">
                <option value="`$500,000">
                <option value="`$1,000,000">
                <option value="`$2,000,000">
                <option value="`$3,000,000">
            </datalist>
            <datalist id="cq-gl-agg-list">
                <option value="`$600,000">
                <option value="`$1,000,000">
                <option value="`$2,000,000">
                <option value="`$3,000,000">
                <option value="`$4,000,000">
                <option value="`$6,000,000">
            </datalist>
            <datalist id="cq-pl-limit-list">
                <option value="`$250,000">
                <option value="`$500,000">
                <option value="`$1,000,000">
                <option value="`$2,000,000">
                <option value="`$3,000,000">
            </datalist>
            <datalist id="cq-ba-bi-list">
                <option value="`$300,000 CSL">
                <option value="`$500,000 CSL">
                <option value="`$1,000,000 CSL">
                <option value="`$2,000,000 CSL">
            </datalist>
            <datalist id="cq-ba-pd-list">
                <option value="`$100,000">
                <option value="`$300,000">
                <option value="`$500,000">
                <option value="`$1,000,000">
            </datalist>

"@

# Find the closing of the step 2 card — look for the unique comment anchor
$anchor = '<!-- ═══ STEP 3: LOCATIONS'
$idx = $c.IndexOf($anchor)
if ($idx -lt 0) {
    Write-Host "Anchor not found"
    exit 1
}

# Insert datalists just before the anchor
$c = $c.Substring(0, $idx) + $datalists + $c.Substring($idx)
Set-Content $f -Value $c -Encoding UTF8 -NoNewline
Write-Host "Done - datalists inserted at index $idx"
