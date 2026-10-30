# MonkeyCode Android

MonkeyCode 移动端（Expo / React Native）的 Android 构建仓库。

本仓库仅包含移动端源码与 CI 构建配置，用于在 GitHub Actions 上构建可安装的 APK。

## 构建

在 Actions 页面选择 **Android Release** 工作流，点击 `Run workflow`：

- `version`：可选，整数版本号（如 `26103101`）。留空则按日期与运行序号自动生成。
- `arch`：可选，打包 ABI，默认 `arm64-v8a`。

构建完成后，APK 在本次运行页面的 **Artifacts** 区域下载。

打 tag 可自动创建 Release 并附带 APK：

```bash
git tag android-v26103101
git push origin android-v26103101
```

## 签名

未配置签名密钥时，产出 debug 签名包（产物名含 `debug`），适合内部测试。

要产出正式签名包，在仓库 `Settings → Secrets and variables → Actions` 添加：

| Secret | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64 编码（PKCS12） |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_STORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

生成 keystore：

```bash
keytool -genkeypair -v \
  -keystore release.jks \
  -alias monkeycode \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12 \
  -storepass <你的密码> -keypass <你的密码>

base64 -w 0 release.jks
```

把输出填入 `ANDROID_KEYSTORE_BASE64`。密钥文件不要提交到仓库。

## 本地开发

```bash
npm ci
npx expo start
```

构建原生工程：

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

产物路径：`android/app/build/outputs/apk/release/app-release.apk`。

## 许可证

AGPL-3.0，见 [LICENSE](./LICENSE)。
