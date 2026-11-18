[CmdletBinding()]
param([switch]$Browser)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose up -d --wait postgres
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL is unavailable. Run Start.ps1 first.' }
    docker compose --profile tests build tests
    if ($LASTEXITCODE -ne 0) { throw 'Test image build failed.' }
    docker compose --profile tests run --rm tests
    if ($LASTEXITCODE -ne 0) { throw 'Python/dbt tests failed.' }
    if ($Browser) {
        docker compose build api web
        if ($LASTEXITCODE -ne 0) { throw 'Browser test image build failed.' }
        docker compose --profile tests run --rm tests python -m tests.seed_browser
        if ($LASTEXITCODE -ne 0) { throw 'Browser fixture preparation failed.' }
        docker compose --profile tests up -d --wait test-api test-web
        if ($LASTEXITCODE -ne 0) { throw 'Browser test services failed to start.' }
        Push-Location web
        try {
            $npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }
            $npx = if ($IsWindows) { 'npx.cmd' } else { 'npx' }
            & $npm ci
            if ($LASTEXITCODE -ne 0) { throw 'Frontend test dependency install failed.' }
            $playwrightArgs = @('playwright', 'install', 'chromium')
            if ($IsLinux -and $env:CI -eq 'true') { $playwrightArgs += '--with-deps' }
            & $npx @playwrightArgs
            if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed.' }
            & $npm test
            if ($LASTEXITCODE -ne 0) { throw 'Component tests failed.' }
            & $npm run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
            $env:BROWSER_TEST_URL = 'http://127.0.0.1:15181'
            & $npm run e2e
            if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed.' }
        } finally { Pop-Location }
    }
} finally {
    if ($Browser) { docker compose --profile tests stop test-web test-api }
    Pop-Location
}
