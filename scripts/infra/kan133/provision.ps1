$ErrorActionPreference = 'Stop'
$folder = 'D:/ProjetoIA/credentials/kan133'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
& icacls.exe $folder /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Credential ACL failed' }
function Protect([string]$value,[string]$path) {
  $secure = ConvertTo-SecureString $value -AsPlainText -Force
  [IO.File]::WriteAllText($path,(ConvertFrom-SecureString $secure))
}
function Unprotect([string]$path) {
  $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($path))
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
$ssh = @('-i','D:/ProjetoIA/credentials/hostinger/brunoops-ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','UserKnownHostsFile=D:/ProjetoIA/credentials/hostinger/known_hosts','brunoops@177.7.60.14')
$identityPath = "$folder/age-identity.dpapi"
if (!(Test-Path $identityPath)) {
  $identity = (& ssh @ssh 'age-keygen' | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $identity -notmatch 'AGE-SECRET-KEY-1') { throw 'Age key generation failed' }
  Protect $identity $identityPath
}
$identity = Unprotect $identityPath
$recipient = ($identity | & ssh @ssh 'age-keygen -y' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $recipient -notmatch '^age1[a-z0-9]+$') { throw 'Age recipient invalid' }
$configPath = "$folder/config.dpapi"
if (Test-Path $configPath) { $config = Unprotect $configPath | ConvertFrom-Json }
else {
  $raw = & node scripts/infra/kan133/provision.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Local bootstrap failed; audit partial state' }
  $config = $raw | ConvertFrom-Json
  $config | Add-Member recipient $recipient
  $config | Add-Member telegram_token (Unprotect 'D:/ProjetoIA/credentials/telegram/clicaepede-infra-alertas-token.dpapi')
  $config | Add-Member telegram_chat_id (Unprotect 'D:/ProjetoIA/credentials/telegram/clicaepede-infra-alertas-chat-id.dpapi')
  Protect ($config | ConvertTo-Json -Compress) $configPath
}
$config | ConvertTo-Json -Compress | & ssh @ssh 'sudo install -d -m 700 /etc/clicaepede/kan133 /var/lib/clicaepede/kan133; sudo sh -c "umask 077; cat > /etc/clicaepede/kan133/config.json"'
if ($LASTEXITCODE -ne 0) { throw 'Private configuration transfer failed' }
Write-Output "Private configuration provisioned; uploader_id=$($config.uploader_id); recipient=$recipient"
