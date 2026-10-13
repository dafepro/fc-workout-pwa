"""One-time handoff using GitHub's LibSodium sealed-box secret format."""
import base64
import json
import os
import re
from pathlib import Path

from nacl.encoding import Base64Encoder
from nacl.public import PublicKey, SealedBox


KEYS = {
    'dafepro/deploy': {'key_id': '3380204578043523366', 'key': 'oCAPMM/AYzK7a0EoTIVBTf+ysHv/StcKPWOD4zsRImA='},
    'dafepro/tcg-scan': {'key_id': '3380204578043523366', 'key': 'vbYXWpBcfDtTfbJ4Ja6Cpl4npdtNCGdnmNFYnBnZdB4='},
}
PRODUCTION = ('ALERT_EMAIL_ADDRESSES', 'ANALYTICS_SUBJECT_KEY', 'BACKUP_AGE_IDENTITY',
              'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'CLOUDFLARE_ACCOUNT_ID',
              'CLOUDFLARE_API_TOKEN', 'DIGITALOCEAN_TOKEN', 'GRAFANA_PRODUCTION_LOGS_TOKEN',
              'GRAFANA_PRODUCTION_METRICS_TOKEN', 'GRAFANA_READ_TOKEN', 'STAFF_SECRET_KEY',
              'TF_PLAN_ENCRYPTION_KEY', 'TF_STATE_ACCESS_KEY_ID', 'TF_STATE_SECRET_ACCESS_KEY',
              'ZOOMIGO_DEPLOY_SSH_KEY')
INFRASTRUCTURE = ('ALERT_EMAIL_ADDRESSES', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
                  'DIGITALOCEAN_TOKEN', 'TF_PLAN_ENCRYPTION_KEY', 'TF_STATE_ACCESS_KEY_ID',
                  'TF_STATE_SECRET_ACCESS_KEY', 'ZOOMIGO_DEPLOY_SSH_KEY')
DEVELOPMENT = ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'DEV_ACCESS_PASSWORD',
               'DEV_ACCESS_SESSION_KEY', 'DEV_ADMIN_PASSWORD', 'DEV_API_GATEWAY_TOKEN',
               'DEV_DEPLOY_SSH_KEY', 'DEV_FIXTURE_SEED', 'DEV_RESET_KEY', 'DEV_STAFF_SECRET_KEY',
               'DIGITALOCEAN_TOKEN', 'GRAFANA_DEV_LOGS_TOKEN', 'GRAFANA_DEV_METRICS_TOKEN',
               'TF_STATE_ACCESS_KEY_ID', 'TF_STATE_SECRET_ACCESS_KEY')


def validate_context(context):
    expected = {'GITHUB_REPOSITORY': 'dafepro/fc-workout-pwa', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                'GITHUB_REF': 'refs/heads/main', 'GITHUB_ACTOR_ID': '313492551'}
    if any(context.get(name) != value for name, value in expected.items()):
        raise ValueError('Credential handoff requires dafepro manual dispatch on trusted main')


def build_envelope(profile, values, keys=KEYS):
    mappings = []
    if profile == 'production':
        mappings += [(name, 'dafepro/deploy', 'ZOOMIGO_PRODUCTION_' + name) for name in PRODUCTION]
        mappings += [(name, 'dafepro/deploy', 'ZOOMIGO_INFRASTRUCTURE_' + name) for name in INFRASTRUCTURE]
        mappings += [(name, 'dafepro/deploy', 'CLOUDFLARE_PLATFORM_' + name.removeprefix('CLOUDFLARE_'))
                     for name in ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN')]
    elif profile == 'development':
        mappings += [(name, 'dafepro/deploy', 'ZOOMIGO_DEVELOPMENT_' + name) for name in DEVELOPMENT]
        mappings += [(name, 'dafepro/deploy', 'ZOOMIGO_DEVELOPMENT_QUALIFICATION_' + name)
                     for name in ('DEV_API_GATEWAY_TOKEN', 'DEV_ACCESS_PASSWORD')]
    elif profile == 'request':
        mappings += [('DEPLOY_REQUEST_TOKEN', repo, 'DEPLOY_REQUEST_TOKEN') for repo in KEYS]
    else:
        raise ValueError('Unknown credential handoff profile')
    records, missing = [], set()
    for source, repository, name in mappings:
        value = values.get(source, '')
        if not isinstance(value, str) or len(value.encode()) > 48 * 1024:
            raise ValueError('Invalid value format for source secret ' + source)
        if not value:
            missing.add(source)
            continue
        key = keys[repository]
        box = SealedBox(PublicKey(key['key'], Base64Encoder))
        records.append({'repository': repository, 'name': name, 'key_id': key['key_id'],
                        'public_key': key['key'],
                        'encrypted_value': base64.b64encode(box.encrypt(value.encode())).decode()})
    return {'schema': 1, 'profile': profile, 'records': records, 'missing': sorted(missing)}


def main():
    validate_context(os.environ)
    if not re.fullmatch('[0-9a-f]{40}', os.environ.get('GITHUB_SHA', '')):
        raise ValueError('A trusted full source commit is required')
    profile = os.environ['TRANSFER_PROFILE']
    names = set(PRODUCTION + DEVELOPMENT + ('DEPLOY_REQUEST_TOKEN',))
    envelope = build_envelope(profile, {name: os.environ.get('SOURCE_' + name, '') for name in names})
    envelope.update(source_repository='dafepro/fc-workout-pwa', source_sha=os.environ['GITHUB_SHA'],
                    run_id=int(os.environ['GITHUB_RUN_ID']), run_attempt=int(os.environ['GITHUB_RUN_ATTEMPT']))
    directory = Path(os.environ['RUNNER_TEMP']) / 'sealed-deploy-credentials'
    directory.mkdir(mode=0o700, exist_ok=True)
    output = directory / (profile + '.json')
    with output.open('x') as target:
        output.chmod(0o600)
        json.dump(envelope, target, indent=2)
        target.write('\n')
    print('Sealed', len(envelope['records']), 'credential records for fixed GitHub destinations.')
    if envelope['missing']:
        print('Missing source secret names:', ', '.join(envelope['missing']))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError):
        raise SystemExit('Credential sealing failed; check trusted context and named source inputs.') from None
