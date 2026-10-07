param([Parameter(Mandatory=$true)][string]$Script,[ValidateSet('backup','retention')][string]$Profile='backup')
$ErrorActionPreference='Stop'
$allowed=@('storage-test.cjs','configure-watchdog.cjs','watchdog-test.cjs','retention-test.cjs')
if ($Script -notin $allowed) { throw 'Unapproved local helper' }
$filename=if($Profile -eq 'retention'){'retention.dpapi'}else{'config.dpapi'}
$secure=ConvertTo-SecureString ([IO.File]::ReadAllText("D:/ProjetoIA/credentials/kan133/$filename"))
$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $config=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)
  $config | & node "scripts/infra/kan133/$Script"
  if ($LASTEXITCODE -ne 0) { throw 'Private helper failed' }
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
