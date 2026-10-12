#!/usr/bin/env python3
"""App-side build output publication; no infrastructure/deployment credentials."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path


def api(path, method='GET', payload=None, token=None):
    args = ['gh', 'api', path, '--method', method]
    if payload is not None:
        args += ['--input', '-']
    result = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True,
                            env=dict(os.environ, GH_TOKEN=token or os.environ['GH_TOKEN']))
    if result.returncode:
        raise RuntimeError('GitHub release publication/request failed; check token permissions and release identity')
    return json.loads(result.stdout)


def publish(app, environment, variant, directory):
    repo = os.environ['GITHUB_REPOSITORY']
    expected = {'zoomigo': ('dafepro/fc-workout-pwa', 'main'),
                'opengym': ('dafepro/openGym', 'codex/focused-workout-overlay')}
    if variant not in expected or expected[variant][0] != repo or environment not in ('production', 'development') or (
        app == 'uplift' and environment != 'production') or os.environ['GITHUB_REF'] != 'refs/heads/' + expected[variant][1]:
        raise ValueError('Publication requires the allowlisted application and source branch')
    metadata = json.loads((directory / 'release-manifest.json').read_text())
    sha = metadata['sha']
    producer_sha = os.environ['GITHUB_SHA']
    if metadata.get('controllerSha') != producer_sha:
        raise ValueError('Build output must bind its publishing controller')
    run = int(os.environ['GITHUB_RUN_ID'])
    attempt = int(os.environ['GITHUB_RUN_ATTEMPT'])
    tag = f'deploy-{environment}-{sha}-{run}-{attempt}'
    paths = [directory / 'worker.tgz', directory / 'release-manifest.json']
    subprocess.run(['gh', 'release', 'create', tag, *map(str, paths), '--repo', repo,
                    '--target', sha, '--title', f'{environment} build {sha[:12]} ({run}/{attempt})',
                    '--notes', 'Immutable deployment build outputs. Retain for rollbacks; never overwrite assets.',
                    '--latest=false'], check=True, env=os.environ)
    release = api(f'repos/{repo}/releases/tags/{tag}')
    assets = {asset['name']: asset['id'] for asset in release['assets']}
    pointer = dict(schema=1, app=app, environment=environment, variant=variant, sha=sha, producer_sha=producer_sha, run_id=run, run_attempt=attempt,
                   release_id=release['id'], bundle_asset_id=assets['worker.tgz'],
                   manifest_asset_id=assets['release-manifest.json'],
                   bundle_sha256=hashlib.sha256(paths[0].read_bytes()).hexdigest(),
                   manifest_sha256=hashlib.sha256(paths[1].read_bytes()).hexdigest())
    (directory / 'deploy-request.json').write_text(json.dumps(pointer, indent=2) + '\n')
    request_token = os.environ.get('DEPLOY_REQUEST_TOKEN')
    if not request_token:
        raise ValueError('Release published, but DEPLOY_REQUEST_TOKEN is missing; submit deploy-request.json after setup')
    result = api('repos/dafepro/deploy/issues', 'POST', {
        'title': f'Release request: {app}/{environment} {sha[:12]}',
        'body': 'dafepro-release-request-v1\n' + json.dumps(pointer, indent=2),
    }, token=request_token)
    print(result['html_url'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('app')
    parser.add_argument('environment')
    parser.add_argument('variant')
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    publish(args.app, args.environment, args.variant, args.directory)
