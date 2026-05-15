# GitHub Actions 手動設定範本

由於部分 GitHub App Token 沒有 `workflows` 權限，若自動推送時無法新增 `.github/workflows/*.yml`，請由 Repository 管理者手動建立下列 workflow。

## 1. Android APK 建置 workflow

請建立 `.github/workflows/android-apk.yml`：

```yaml
name: Build Android APK

on:
  push:
    branches: [ main, genspark_ai_developer ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android platform
        run: sdkmanager "platforms;android-35" "build-tools;35.0.0"

      - name: Keep Android assets synced
        run: |
          mkdir -p app/src/main/assets/web
          cp web/index.html web/styles.css web/app.js web/manifest.webmanifest web/sw.js web/favicon.svg app/src/main/assets/web/

      - name: Build release APK
        run: ./gradlew assembleRelease --no-daemon

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: food-label-pro-apk
          path: app/build/outputs/apk/release/app-release.apk
```

## 2. GitHub Pages 部署 workflow

請建立 `.github/workflows/pages.yml`：

```yaml
name: Deploy Web App to GitHub Pages

on:
  push:
    branches: [ main, genspark_ai_developer ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload static web artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: web

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```
