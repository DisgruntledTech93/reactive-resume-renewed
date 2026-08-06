# Deploy to CoreForge

The repository includes a GitHub Actions workflow that builds an AMD64 image and publishes it to:

```text
ghcr.io/disgruntledtech93/reactive-resume-renewed:latest
```

## Publish the image

1. Replace the files in the GitHub fork with this completed source and push to `main`.
2. Open the repository's **Actions** tab and confirm **Build Renewed Docker Image** completes successfully. A push to `main` starts it automatically.
3. In the repository package settings, make the container package public, or authenticate CoreForge to GHCR once with a GitHub personal access token that has `read:packages`:

```bash
echo 'YOUR_GITHUB_TOKEN' | docker login ghcr.io -u DisgruntledTech93 --password-stdin
```

## Deploy safely

Copy `deployment/coreforge/deploy.sh` to CoreForge, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script:

- creates a compressed PostgreSQL backup under `/srv/reactive-resume/backups`;
- backs up the current Compose file;
- replaces only the Reactive Resume image reference;
- pulls the Renewed image;
- recreates only the application container;
- waits for the health check and prints logs if startup fails.

PostgreSQL and Redis are not recreated. The new Vault migration runs automatically when the application starts.

## Verify

```bash
cd /opt/coreforge/reactive-resume
docker compose ps
docker compose logs --since=5m reactive-resume
curl -fsS http://127.0.0.1:3010/api/health | python3 -m json.tool
```

After login, **Career Vault** appears in the dashboard sidebar. Import an existing resume first, then open any resume section and choose **Add from Vault**.

## Roll back the application image

The deployment backup name is printed in the Compose directory. To restore the prior Compose file:

```bash
cd /opt/coreforge/reactive-resume
cp compose.yml.pre-vault-YYYYMMDDTHHMMSSZ compose.yml
docker compose up -d --force-recreate reactive-resume
```

A database backup is also created before deployment. Keep it until the new version has been verified.
