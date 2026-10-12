# Central environment deployment

**Status:** Maintained

The migration to private `dafepro/deploy` separates tested build outputs from environment deployment. Production remains manually promoted. This repository publishes immutable API/relay digests, matched prebuilt Worker bundles/migrations and retained GitHub releases; its only cross-repository credential is a deploy-scoped Issues-write-only `DEPLOY_REQUEST_TOKEN` used to request a deployment PR.

The new `development-image.yml` builds the distinct development API, Team World relay and development Worker profile. `backend-image.yml` continues to verify/publish production. Neither central-build path has cloud or host credentials.

The existing workflows remain the active fallback until cutover. Repository variable `DEPLOY_AUTHORITY=central` disables legacy production release/infrastructure/operations and transfers only deployment authority. Set `DEPLOY_REQUESTS_ENABLED=true` independently to publish/request retained production releases while the legacy authority still works. `DEV_DEPLOY_AUTHORITY=central` disables the old dev controller and transfers only development deployment authority. Set `DEV_RELEASE_BUILDS_ENABLED=true` independently to test development publication/requests before cutover. Do not enable central deployment until target secrets, state backends, pinned host keys and retained rollback inputs are verified. The central controller shares a mutation lock for release/infra/host operations and stages trusted controller files over pinned SSH without moving existing data or checking its SHA out of this app origin.

Follow [central cutover](https://github.com/dafepro/deploy/blob/main/docs/cutover.md). The original production/dev runbooks and local deployment/controller contracts remain valid for the gated legacy path until successful cutover. Remove those files and obsolete cloud secrets only in a later reviewed cleanup after that evidence exists. Preserve real-data, analytics and backup-custody approvals; changing deployment ownership grants none of those approvals.
