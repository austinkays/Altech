$file = ".\plugins\commercial-quoter.html"
$content = Get-Content $file -Raw -Encoding UTF8
$lf = "`n"

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
$sb  += '            </div>' + $lf  # end .prop-sidebar
$sb  += '            </div>' + $lf  # end .prop-layout
$sb  += '        </div>'            # end #cq-step-1 (no trailing newline — original file adds its own)

# Use marketingAgent field as unique anchor
$old3 = 'placeholder="Agent name">' + $lf + '                </div>' + $lf + '            </div>' + $lf + '        </div>'

$new3 = 'placeholder="Agent name">' + $lf + $sb

if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "sidebar: done"
} else {
    Write-Host "sidebar: MISS — dumping anchor:"
    $idx = $content.IndexOf('placeholder="Agent name">')
    Write-Host $content.Substring($idx, 120)
}

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "File saved."

# Verify
$c = Get-Content $file -Raw -Encoding UTF8
Write-Host "cq-biz-streetViewImg:", ($c -match 'cq-biz-streetViewImg')
