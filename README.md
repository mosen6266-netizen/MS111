# MS111 网址收藏

一个通过 GitHub Pages 公开分享、仅仓库所有者可编辑的网址收藏工具。

## 功能

- 搜索、分类、标签、置顶、排序、卡片/列表视图
- 管理员添加、编辑、删除网址
- JSON 和浏览器书签 HTML 导入、JSON 备份导出
- 深色模式、响应式手机布局、公开链接复制
- 数据集中保存在 `data/bookmarks.json`，每次修改自动提交到仓库

## 管理员首次登录

1. 打开网站，点击“管理收藏”。
2. 创建 GitHub Fine-grained personal access token。
3. Repository access 仅选择 `MS111`。
4. Repository permissions → Contents 设为 Read and write。
5. 把令牌粘贴到管理登录框。令牌只保存在本机浏览器中。

公开访客没有仓库写入凭证，因此只能查看收藏，不能修改。
