# Encrypted production deployment secrets

ZoomiGo keeps one versioned, age-encrypted deployment bundle in this directory.
The matching private identities never enter Git. This identity is dedicated to
deployment and must not be the private key used to decrypt database backups.

The bundle contains exactly five files:

- `backup-s3.env`: private S3-compatible backup credentials installed on the VM;
- `cloudflare.env`: the narrowly scoped Workers deployment token and account ID;
- `deploy.env`: deployment host/user plus the public API origin;
- `deploy_ssh_key`: a dedicated, passphrase-free key limited to the ZoomiGo deploy user;
- `known_hosts`: a host-key line whose fingerprint was verified out of band.

Bundle creation and extraction use a versioned gzip-compressed JSON envelope
implemented with Node's built-in modules. They do not invoke `tar`, so the same
commands work with the macOS and Linux operator environments. The existing
`production.tar.gz.age` filename is retained even though its decrypted payload
is now the portable ZoomiGo envelope.

Prerequisites are Node 22 or newer, `age`, and OpenSSH's `ssh-keygen`. Use the
Unix shell wrappers on macOS or Linux:

```sh
node deploy/secrets/manage-production-secrets.mjs seal
node deploy/secrets/manage-production-secrets.mjs open \
  /secure/path/zoomigo-operator-age-identity
```

## Initial setup

1. Create two new age identities on trusted machines: one for the operator and
   one for CI. Record only their `age1...` public recipients in
   `production-recipients.txt`; keep both private identities outside the repo.
2. Copy `plaintext.example/` to ignored `plaintext/`, replace every placeholder,
   and keep the directory mode private.
3. Run `./seal-production-secrets.sh`. Review that the only new tracked secret
   artifact is `production.tar.gz.age`, then commit that encrypted file and the
   public recipient list.
4. Store the CI private identity as the protected GitHub production-environment
   secret `ZOOMIGO_DEPLOY_AGE_IDENTITY`. This is the only secret the release
   workflow needs directly from GitHub.
5. Delete the local `plaintext/` directory after testing an operator decrypt.

If an earlier script already created `production.tar.gz.age`, move it to a
private archival location before resealing. The portable opener deliberately
rejects the previous tar payload instead of guessing its format.

## Rotate `known_hosts` safely

`known_hosts` contains the Droplet's public SSH host key. It lets automated
releases confirm that `DEPLOY_HOST` is still the server you approved before
sending credentials or running commands. It is not a login key and is not
secret.

SSH uses the assigned DigitalOcean Reserved IP directly. From DigitalOcean's
authenticated web console on the new Droplet, print the server's Ed25519 host
key fingerprint:

```sh
sudo ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Use the separately observed fingerprint with the automated adoption command:

```sh
./infra/digitalocean/adopt-host.sh /secure/path/operator-age-identity \
  --expected-fingerprint SHA256:...
```

The script reads the Reserved IP from encrypted OpenTofu state, collects the
public key with `ssh-keyscan`, refuses a fingerprint mismatch, and reseals both
`DEPLOY_HOST` and `known_hosts`. `ssh-keyscan` never establishes trust by itself.

The sealing script verifies that `known_hosts` contains `DEPLOY_HOST` and that
`deploy_ssh_key` is a valid passphrase-free private key. Rebuilding the Droplet
changes its host key, so releases intentionally stop until adoption succeeds.

To test locally without deploying:

```sh
./open-production-secrets.sh /secure/path/zoomigo-operator-age-identity
rm -rf -- opened
```

If GitHub Actions cannot publish the immutable API image, authenticate Docker
without printing or storing the token, then let the local release publish only
the SHA tag before it decrypts deployment secrets:

```sh
gh auth token | docker login ghcr.io -u dafepro --password-stdin
PUBLISH_API_IMAGE=true ./deploy/release/release.sh \
  /secure/path/zoomigo-operator-age-identity RELEASE_SHA
docker logout ghcr.io
```

Never paste a private identity into a command argument, commit it, reuse the
backup recovery identity, or rely on an unverified `ssh-keyscan` result. Rotate
the deployment bundle by creating a new CI identity/SSH key/token, resealing,
deploying successfully, and only then revoking the prior credentials.
