
$ErrorActionPreference = "Stop"

$mysqlExe = "C:\Users\kp\tools\mysql8\bin\mysqld.exe"
$myIni = "D:\ImLab\infra\mysql\my.ini"
$hostAddress = "127.0.0.1"
$port = 3307

if (-not (Test-Path $mysqlExe)) {
    throw "MySQL executable not found: $mysqlExe"
}

if (-not (Test-Path $myIni)) {
    throw "MySQL configuration file not found: $myIni"
}

# Check whether MySQL is already accepting connections.
$client = New-Object System.Net.Sockets.TcpClient

try {
    $client.Connect($hostAddress, $port)
    Write-Host "MySQL is already running on port $port."
    return
}
catch {
    Write-Host "MySQL is not running on port $port. Starting it..."
}
finally {
    $client.Close()
}

# Start MySQL using the existing configuration.
Start-Process `
    -FilePath $mysqlExe `
    -ArgumentList "--defaults-file=$myIni" `
    -WindowStyle Hidden

# Wait up to 15 seconds for MySQL to accept connections.
$deadline = (Get-Date).AddSeconds(15)

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $client = New-Object System.Net.Sockets.TcpClient

    try {
        $client.Connect($hostAddress, $port)
        Write-Host "MySQL is accepting connections on port $port."
        return
    }
    catch {
        # MySQL may still be starting.
    }
    finally {
        $client.Close()
    }
}

throw "MySQL did not start within 15 seconds. Check the MySQL error log."
