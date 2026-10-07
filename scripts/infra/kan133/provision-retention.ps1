$ErrorActionPreference='Stop'
$folder='D:/ProjetoIA/credentials/kan133'
$path="$folder/retention.dpapi"
function Unprotect([string]$path) {
  $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($path))
  $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
if (Test-Path $path) { $raw=Unprotect $path }
else {
  $raw=Unprotect "$folder/config.dpapi" | & node scripts/infra/kan133/provision-retention.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Retention provisioning failed; audit before retry' }
  [IO.File]::WriteAllText($path,(ConvertFrom-SecureString (ConvertTo-SecureString $raw -AsPlainText -Force)))
}
$raw | & ssh -i D:/ProjetoIA/credentials/hostinger/brunoops-ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 -o UserKnownHostsFile=D:/ProjetoIA/credentials/hostinger/known_hosts brunoops@177.7.60.14 'sudo sh -c "umask 077; cat > /etc/clicaepede/kan133/retention.json"'
if ($LASTEXITCODE -ne 0) { throw 'Retention private transfer failed' }
Write-Output 'Retention identity provisioned separately; no service_role on VPS.'
