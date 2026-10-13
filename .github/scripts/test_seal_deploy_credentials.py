import base64
import unittest

from nacl.exceptions import CryptoError
from nacl.public import PrivateKey, SealedBox
from seal_deploy_credentials import build_envelope, validate_context


class CredentialSealing(unittest.TestCase):
    def setUp(self):
        self.private = {repo: PrivateKey.generate() for repo in ('dafepro/deploy', 'dafepro/tcg-scan')}
        self.keys = {repo: {'key_id': 'fixture', 'key': base64.b64encode(key.public_key.encode()).decode()}
                     for repo, key in self.private.items()}

    def test_multiline_values_are_sealed_for_only_the_named_destination(self):
        value = 'fixture private key\nsecond line with "$`\\"\n'
        envelope = build_envelope('production', {'ZOOMIGO_DEPLOY_SSH_KEY': value}, self.keys)
        records = envelope['records']
        self.assertEqual({row['name'] for row in records}, {
            'ZOOMIGO_PRODUCTION_ZOOMIGO_DEPLOY_SSH_KEY', 'ZOOMIGO_INFRASTRUCTURE_ZOOMIGO_DEPLOY_SSH_KEY'})
        for row in records:
            self.assertEqual(row['repository'], 'dafepro/deploy')
            encrypted = base64.b64decode(row['encrypted_value'])
            self.assertNotIn(value.encode(), encrypted)
            self.assertEqual(SealedBox(self.private['dafepro/deploy']).decrypt(encrypted).decode(), value)
            with self.assertRaises(CryptoError):
                SealedBox(self.private['dafepro/tcg-scan']).decrypt(encrypted)

    def test_shared_request_token_is_copied_without_minting_or_rotating_it(self):
        envelope = build_envelope('request', {'DEPLOY_REQUEST_TOKEN': 'fixture-issues-only-token'}, self.keys)
        self.assertEqual({(row['repository'], row['name']) for row in envelope['records']}, {
            ('dafepro/deploy', 'DEPLOY_REQUEST_TOKEN'), ('dafepro/tcg-scan', 'DEPLOY_REQUEST_TOKEN')})
        for row in envelope['records']:
            self.assertEqual(SealedBox(self.private[row['repository']]).decrypt(
                base64.b64decode(row['encrypted_value'])), b'fixture-issues-only-token')

    def test_development_qualification_gets_only_its_two_existing_values(self):
        values = {'DEV_API_GATEWAY_TOKEN': 'fixture-gateway', 'DEV_ACCESS_PASSWORD': 'fixture-password',
                  'DEV_RESET_KEY': 'fixture-reset', 'UNKNOWN_TOKEN': 'do-not-copy'}
        records = build_envelope('development', values, self.keys)['records']
        qualified = [row['name'] for row in records if '_QUALIFICATION_' in row['name']]
        self.assertEqual(set(qualified), {'ZOOMIGO_DEVELOPMENT_QUALIFICATION_DEV_API_GATEWAY_TOKEN',
                                         'ZOOMIGO_DEVELOPMENT_QUALIFICATION_DEV_ACCESS_PASSWORD'})
        self.assertFalse(any('UNKNOWN' in row['name'] for row in records))

    def test_unknown_profiles_and_non_owner_or_non_main_context_fail_closed(self):
        with self.assertRaises(ValueError):
            build_envelope('arbitrary', {}, self.keys)
        context = {'GITHUB_REPOSITORY': 'dafepro/fc-workout-pwa', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                   'GITHUB_REF': 'refs/heads/main', 'GITHUB_ACTOR_ID': '313492551'}
        validate_context(context)
        for field, value in [('GITHUB_REPOSITORY', 'someone/fork'), ('GITHUB_EVENT_NAME', 'pull_request'),
                             ('GITHUB_REF', 'refs/heads/feature'), ('GITHUB_ACTOR_ID', '1')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_context(dict(context, **{field: value}))


if __name__ == '__main__':
    unittest.main()
