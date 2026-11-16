# ZoomiGo credential custody

Production credentials live in the trusted `dafepro/deploy` controllers. Use
the [central configuration guide](https://github.com/dafepro/deploy/blob/main/docs/configuration.md)
for secret and variable names, and the
[recovery guide](https://github.com/dafepro/deploy/blob/main/docs/shared-hosts.md)
for the backup and restore process.

Keep an offline recovery copy of the age identity in approved custody. The age
recipient is public and can be derived from the identity. Keep private keys,
temporary env files, and backups out of Git.
