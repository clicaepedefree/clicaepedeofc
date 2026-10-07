#!/usr/bin/env python3
import json
import urllib.error
import urllib.request
from pathlib import Path

base = 'https://evolution-staging.clicaepede.com.br'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect())
key = Path('/etc/clicaepede/evolution-qa/secrets/api').read_text().strip()
for token, expected in [(None, 401), ('kan132-invalid-key', 401), (key, 200)]:
    request = urllib.request.Request(base + '/instance/fetchInstances',
                                     headers={'apikey': token} if token else {})
    try:
        with opener.open(request, timeout=15) as response:
            status = response.status
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        status = error.code
        payload = None
    assert status == expected, 'Public API authentication/TLS failed'
    if token == key:
        assert isinstance(payload, list)
    print(f'PASS: public trusted HTTPS API returns {status} for ' +
          ('valid key' if token == key else 'missing/invalid key'))
