$ErrorActionPreference='Stop'
$secure=ConvertTo-SecureString ([IO.File]::ReadAllText('D:/ProjetoIA/credentials/kan133/age-identity.dpapi'))
$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $identity=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)
  $identity | & ssh -i D:/ProjetoIA/credentials/hostinger/brunoops-ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 -o UserKnownHostsFile=D:/ProjetoIA/credentials/hostinger/known_hosts brunoops@177.7.60.14 'sudo python3 /opt/clicaepede/kan133/restore-offsite.py'
  if ($LASTEXITCODE -ne 0) { throw 'Isolated offsite restore failed; see sanitized gate' }
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
