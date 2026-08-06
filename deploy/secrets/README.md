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
