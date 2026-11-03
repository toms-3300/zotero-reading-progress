# GitHub 发布说明

目标公开仓库：`toms-3300/zotero-reading-progress`。

## 首次上传

1. 在 GitHub 新建公开仓库 `zotero-reading-progress`，默认分支为 `main`。
2. 将本仓库包解压后的文件上传到仓库根目录，包含隐藏目录 `.github/workflows/`。
3. 不上传 `.test-run`、`reference` 或 `dist`；它们不属于仓库源码。
4. 推送标签 `v1.1.0` 以触发自动发布；不要预先创建同名 Release。

推荐在本地使用 Git：

```sh
git remote add origin https://github.com/toms-3300/zotero-reading-progress.git
git push -u origin main
git tag v1.1.0
git push origin v1.1.0
```

工作流在标签推送时运行测试，再自动建立 Release，附上 XPI 和 `updates.json`。不要先在网页发布同名 Release，否则自动发布会因为重名停止；只需推送标签即可。

## 从旧版接入自动更新

原 1.0.0 使用占位更新地址，不能自行找到新版。首次成功发布后，从 Releases 下载并手动安装一次 1.1.0。插件 ID 和阅读标签均保持原样，进度会继续保留。

之后 Zotero 可按其自动更新设置从以下固定地址读取清单：

`https://github.com/toms-3300/zotero-reading-progress/releases/latest/download/updates.json`

## 后续发布

1. 修改功能并更新 `src/manifest.json` 的版本号。
2. 更新测试中的发布版本断言，再执行测试。
3. 提交并推送代码，推送对应的 `v版本号` 标签。
4. 等待 Actions 成功，确认新 Release 含 XPI 和 `updates.json`。

当前发布流程只面向稳定版，不要用它发布测试标签或较旧版本作为 latest。保留旧 Release 资产，以便已有清单中的版本下载链接仍可使用。

## 验证范围

本地可验证构建、清单、SHA-256 及原有状态逻辑。GitHub Actions 和自动下载安装链路须在仓库成功上传及首次发布后再进行在线验证，不能以本地测试代替。
