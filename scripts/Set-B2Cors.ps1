Param(
  [Parameter(Mandatory=$false)][string]$Origin = "https://corabooks.pages.dev",
  [Parameter(Mandatory=$false)][string]$BucketName = "corabooks-files",
  [Parameter(Mandatory=$false)][string]$BucketId,
  # Optional: pass credentials non-interactively
  [Parameter(Mandatory=$false)][string]$KeyId,
  [Parameter(Mandatory=$false)][string]$AppKey
)

Write-Host "=== Backblaze B2 - Apply Custom CORS Rules ===" -ForegroundColor Cyan

# Prompt for credentials if not provided
if (-not $KeyId) {
  $KeyId = Read-Host -Prompt "Enter your B2 Application Key ID (keyID)"
}

if (-not $AppKey) {
  $secure = Read-Host -Prompt "Enter your B2 Application Key (will not echo)" -AsSecureString
  $AppKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if ([string]::IsNullOrWhiteSpace($KeyId) -or [string]::IsNullOrWhiteSpace($AppKey)) {
  throw "keyID and applicationKey are required"
}

# Step 1: Authorize account
$pair = "${KeyId}:${AppKey}"
$authHeader = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))

$authResp = Invoke-RestMethod -Method GET -Uri "https://api.backblazeb2.com/b2api/v2/b2_authorize_account" -Headers @{ Authorization = $authHeader }

$apiUrl = $authResp.apiUrl
$downloadUrl = $authResp.downloadUrl
$accountId = $authResp.accountId
$authToken = $authResp.authorizationToken

Write-Host "Authorized. AccountId=$accountId" -ForegroundColor Green

# Step 2: Resolve bucketId from name unless provided
if (-not $BucketId) {
  $listBucketsBody = @{ accountId = $accountId } | ConvertTo-Json -Depth 5
  try {
    $bucketsResp = Invoke-RestMethod -Method POST -Uri "$apiUrl/b2api/v2/b2_list_buckets" -Headers @{ Authorization = $authToken } -Body $listBucketsBody -ContentType 'application/json'
    $bucket = $bucketsResp.buckets | Where-Object { $_.bucketName -eq $BucketName }
    if (-not $bucket) { throw "Bucket '$BucketName' not found in account $accountId" }
    $BucketId = $bucket.bucketId
  } catch {
    throw "Failed to list buckets. Provide -BucketId to skip listing. Error: $($_.Exception.Message)"
  }
}
Write-Host "Bucket resolved: $BucketName ($BucketId)" -ForegroundColor Green

# Step 3: Define corsRules (API expects 'corsRules', not 'CORSRules')
$corsRules = @(
  @{ 
    corsRuleName      = 'CoraBooksUploads'
    allowedOrigins    = @($Origin)
    allowedHeaders    = @('Authorization','X-Bz-File-Name','X-Bz-Content-Sha1','Content-Type')
    exposeHeaders     = @('x-bz-file-id','x-bz-content-sha1','x-bz-upload-timestamp')
  allowedOperations = @('b2_upload_file','b2_download_file_by_name','b2_download_file_by_id')
    maxAgeSeconds     = 86400
  }
)

$updateBody = @{ 
  accountId = $accountId
  bucketId  = $BucketId
  corsRules = $corsRules
} | ConvertTo-Json -Depth 6

# Step 4: Apply
try {
  $updateResp = Invoke-RestMethod -Method POST -Uri "$apiUrl/b2api/v2/b2_update_bucket" -Headers @{ Authorization = $authToken } -Body $updateBody -ContentType 'application/json'
  Write-Host "CORS updated for bucket '$BucketName'" -ForegroundColor Green
} catch {
  Write-Error "Failed to update CORS: $($_.ErrorDetails.Message)"
  throw
}
Write-Host "allowedOrigins: $($corsRules[0].allowedOrigins -join ', ')" -ForegroundColor Yellow
Write-Host "allowedHeaders: $($corsRules[0].allowedHeaders -join ', ')" -ForegroundColor Yellow
Write-Host "allowedOperations: $($corsRules[0].allowedOperations -join ', ')" -ForegroundColor Yellow

Write-Host "Changes take effect in ~1 minute. Hard-refresh your site and retry the upload." -ForegroundColor Cyan
