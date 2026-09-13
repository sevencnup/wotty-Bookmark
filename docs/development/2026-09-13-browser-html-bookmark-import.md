# 浏览器 HTML 书签导入

## 目标

支持 Chrome、Edge、Firefox 导出的 Netscape Bookmark HTML 文件，并把它们导入独立的服务器书签库；XBEL/JSON 继续保留为 Floccus 同步文件的导入格式。

## 实施步骤

1. 在前端解析浏览器书签 HTML，保留文件夹层级、标题和 HTTP/HTTPS URL。
2. 将解析结果转换为 XBEL，复用服务器书签库导入接口。
3. 在导入/导出页识别 .html/.htm，导入到“我的书签库”，不覆盖 Floccus 同步文件。
4. 保留 .xbel/.json 的原有同步文件导入行为，并更新页面提示。
5. 添加解析器测试，执行测试、类型检查和生产构建。

## 验收标准

- 浏览器 HTML 的嵌套文件夹、书签标题和 URL 可正确导入。
- 非 HTTP/HTTPS 地址不会写入书签库。
- HTML 导入不会创建或覆盖同步文件历史版本。
- XBEL/JSON 导入行为保持不变。
