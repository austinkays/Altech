$file = ".\plugins\commercial-quoter.html"
$content = Get-Content $file -Raw -Encoding UTF8
$lf = "`n"

# 1. autocomplete fix (may already be done)
$old1 = '<input id="cq_bizStreet" type="text" class="form-input" placeholder="123 Main St" autocomplete="street-address">'
$new1 = '<input id="cq_bizStreet" type="text" class="form-input" placeholder="123 Main St" autocomplete="off">'
if ($content.Contains($old1)) { $content = $content.Replace($old1, $new1); Write-Host "autocomplete: fixed" } else { Write-Host "autocomplete: already fixed" }

# 2. Wrap card in prop-layout (LF endings, 12-space indent matches file)
$old2 = '<div id="cq-step-1" class="cq-step hidden">' + $lf + '            <div class="card">'
$new2 = '<div id="cq-step-1" class="cq-step hidden">' + $lf + '            <div class="prop-layout">' + $lf + '            <div class="card">'
if ($content.Contains($old2)) { $content = $content.Replace($old2, $new2); Write-Host "prop-layout open: done" } else { Write-Host "prop-layout open: MISS" }

# 3. Close card and add map sidebar, then close prop-layout
# The end of the card + closing step-1 div:
$old3 = '                </div>' + $lf + '            </div>' + $lf + '        </div>' + $lf + $lf + '        <!-- ═══ STEP 2'
$sb   = '' 
$sb  += '                </div>' + $lf   # close .form-row(marketingAgent)
$sb  += '            </div>' + $lf       # close .card
$sb  += '            <div class="prop-sidebar">' + $lf
$sb  += '                <div class="card map-preview-card">' + $lf
$sb  += '                    <h2>Business Views</h2>' + $lf
$sb  += '                    <p class="section-subtitle">Street &amp; satellite preview</p>' + $lf
$sb  += '                    <div class="map-previews">' + $lf
$sb  += '                        <div class="map-preview-item">' + $lf
$sb  += '                            <div class="map-preview-label">Street View</div>' + $lf
$sb  += '                            <img id="cq-biz-streetViewImg" class="map-preview-img" alt="Street View preview" />' + $lf
$sb  += '                            <div class="map-preview-actions">' + $lf
$sb  += '                                <button class="btn-utility" onclick="CommercialQuoter.openBizStreetView()">&#x1F6B6; Street View</button>' + $lf
$sb  += '                            </div>' + $lf
$sb  += '                        </div>' + $lf
$sb  += '                        <div class="map-preview-item">' + $lf
$sb  += '                            <div class="map-preview-label">Satellite View</div>' + $lf
$sb  += '                            <img id="cq-biz-satelliteViewImg" class="map-preview-img" alt="Satellite preview" />' + $lf
$sb  += '                            <div class="map-preview-actions">' + $lf
$sb  += '                                <button class="btn-utility" onclick="CommercialQuoter.openBizMaps()">&#x1F5FA;&#xFE0F; Maps</button>' + $lf
$sb  += '                            </div>' + $lf
$sb  += '                        </div>' + $lf
$sb  += '                    </div>' + $lf
$sb  += '                    <div id="cq-biz-mapHint" class="hint">Enter an address to load previews.</div>' + $lf
$sb  += '                </div>' + $lf
$sb  += '            </div>' + $lf
$sb  += '            </div>' + $lf       # close .prop-layout
$sb  += '        </div>' + $lf           # close #cq-step-1
$sb  += $lf
$sb  += '        <!-- ═══ STEP 2'
if ($content.Contains($old3)) { $content = $content.Replace($old3, $sb); Write-Host "sidebar: done" } else { Write-Host "sidebar: MISS" }

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "File saved."

# Verify
$c = Get-Content $file -Raw -Encoding UTF8
Write-Host "prop-layout:", ($c -match 'prop-layout')
Write-Host "cq-biz-streetViewImg:", ($c -match 'cq-biz-streetViewImg')
