$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mumbin-test-fixture-' + [guid]::NewGuid())
$previous = $env:MUMBIN_JUNCTION_FIXTURE
try {
    New-Item -ItemType Directory -Path (Join-Path $fixture 'notebook'), (Join-Path $fixture 'outside') -Force | Out-Null
    New-Item -ItemType Junction -Path (Join-Path $fixture 'notebook/Linked') -Target (Join-Path $fixture 'outside') | Out-Null
    $env:MUMBIN_JUNCTION_FIXTURE = $fixture
    Push-Location (Join-Path $PSScriptRoot '..')
    try { & cargo test --offline --workspace; $result = $LASTEXITCODE }
    finally { Pop-Location }
} finally {
    $env:MUMBIN_JUNCTION_FIXTURE = $previous
    # Only this invocation's GUID-named temporary fixture may be removed.
    $resolved = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if ([IO.Path]::GetDirectoryName($resolved) -eq $tempRoot -and [IO.Path]::GetFileName($resolved) -match '^mumbin-test-fixture-[0-9a-f-]{36}$') {
        $link = Join-Path $resolved 'notebook/Linked'
        if (Test-Path -LiteralPath $link) { (Get-Item -LiteralPath $link).Delete() }
        if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    }
}
exit $result
