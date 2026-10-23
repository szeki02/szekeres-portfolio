# Minimal multi-threaded static file server for the portfolio site (no Python/Node needed).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [-Port 8767]
param([int]$Port = 8767, [string]$Root = $PSScriptRoot, [int]$Workers = 8)

$Root = [IO.Path]::GetFullPath($Root)
$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
    '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Portfolio serving $Root at http://localhost:$Port/ ($Workers workers)"

# each worker blocks on GetContext(); HttpListener hands requests out across threads
$worker = {
    param($listener, $Root, $mime)
    while ($listener.IsListening) {
        try { $ctx = $listener.GetContext() } catch { break }
        $res = $ctx.Response
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if ($rel -eq '') { $rel = 'index.html' }
            $full = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $rel))
            if ($full.StartsWith($Root) -and [IO.File]::Exists($full)) {
                $bytes = [IO.File]::ReadAllBytes($full)
                $ext = [IO.Path]::GetExtension($full).ToLower()
                $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                # images are immutable exports; code changes while iterating
                if ($ext -eq '.jpg' -or $ext -eq '.png' -or $ext -eq '.webp') { $res.Headers.Add('Cache-Control', 'max-age=3600') }
                else { $res.Headers.Add('Cache-Control', 'no-store') }
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
        } catch {
            try { $res.StatusCode = 500 } catch {}
        } finally {
            try { $res.Close() } catch {}
        }
    }
}

$pool = [runspacefactory]::CreateRunspacePool(1, $Workers)
$pool.Open()
$jobs = foreach ($i in 1..$Workers) {
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($worker).AddArgument($listener).AddArgument($Root).AddArgument($mime)
    [pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() }
}

try {
    while ($listener.IsListening) { Start-Sleep -Milliseconds 500 }
} finally {
    $listener.Stop()
    foreach ($j in $jobs) { $j.PS.Dispose() }
    $pool.Close()
}
