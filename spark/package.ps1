$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot 'dist'
$packageRoot = Join-Path $outputRoot 'mixponto-spark-email-senha-2026-10-19'
if (Test-Path -LiteralPath $packageRoot) { throw 'A pasta do pacote já existe; use outro nome para preservar a entrega anterior.' }
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
foreach ($name in @('app', 'spark', 'apk', 'firmware\PontoESP32', 'backend')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot $name) | Out-Null
}
foreach ($name in @('README.md', 'INSTALACAO-SPARK.md', 'VALIDACAO.md', 'TERCEIROS.md', '.editorconfig', '.gitignore', 'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties', 'gradlew', 'gradlew.bat')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $packageRoot
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'gradle') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'app\src') -Destination (Join-Path $packageRoot 'app') -Recurse
foreach ($name in @('build.gradle.kts', 'google-services.json', 'CONFIGURAR-FIREBASE.txt')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "app\$name") -Destination (Join-Path $packageRoot 'app')
}
foreach ($name in @('package.json', 'package-lock.json', 'firebase.json', 'database.rules.json', 'generate-rules.mjs', 'serve-site.mjs', 'package.ps1', 'test-results-1.1.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $packageRoot 'spark')
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'test') -Destination (Join-Path $packageRoot 'spark') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'site-integration') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'backend\firebase.json') -Destination (Join-Path $packageRoot 'backend')
foreach ($name in @('PontoESP32.ino', 'config.example.h')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "firmware\PontoESP32\$name") -Destination (Join-Path $packageRoot 'firmware\PontoESP32')
}
$apk = Join-Path $outputRoot 'MixPonto-spark-1.1-debug.apk'
Copy-Item -LiteralPath (Join-Path $projectRoot 'app\build\outputs\apk\debug\app-debug.apk') -Destination $apk
Copy-Item -LiteralPath $apk -Destination (Join-Path $packageRoot 'apk\MixPonto-spark-1.1-debug.apk')
$archive = Join-Path $outputRoot 'mixponto-spark-email-senha-2026-10-19.zip'
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archive -CompressionLevel Optimal
$lines = foreach ($file in @($apk, $archive)) {
    $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
    "$($hash.Hash)  $([System.IO.Path]::GetFileName($file))"
}
$lines | Set-Content -LiteralPath (Join-Path $outputRoot 'SHA256SUMS-1.1.txt') -Encoding utf8
Get-Item -LiteralPath $apk, $archive | Select-Object Name, Length
