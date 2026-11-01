---
name: haitun-downloader
description: 下载海豚知道(htknow/learn.htknow.com)已购课程的 mp4 视频。当用户想保存、备份或离线下载海豚知道系列课视频时使用。
---

# 海豚知道课程视频下载

把用户在「海豚知道」平台**已购买**的系列课视频，批量保存为本地 mp4 文件，供个人离线学习。

## 前置条件

1. 用户已登录海豚知道，且已购买目标课程（有访问权限）
2. 电脑装有 Python 3（无需第三方库，纯标准库）
3. 浏览器已装 Tampermonkey 插件

## 工作流程

### 第一步：抓取视频地址（浏览器 + Tampermonkey）

1. 让用户把本目录的 `海豚知道mp4抓取.user.js` 安装到 Tampermonkey（新建脚本粘贴保存）
2. 打开课程播放页 `learn.htknow.com/seriesPlayPage?id=...&series_id=...`
3. 页面上会出现一个悬浮面板，点「开始抓取全部地址」
4. 抓完后点「导出下载列表(txt)」，得到 `海豚知道_mp4列表.txt`（每行：序号<TAB>标题<TAB>mp4地址）

### 第二步：批量下载（Python）

```bash
python haitun_download.py 列表.txt [输出目录] [-j 并发数]
```

- 不填输出目录则存到 txt 旁的「下载」文件夹
- `-j 8` 表示同时下 8 个（默认 4），据网速在 4~12 之间调
- 支持断点续传：中断后重跑同命令，`.part` 文件自动续传，不会重下

## 关键技术细节（排错用）

- **鉴权**：请求头 `HtAuthToken` = localStorage['htAuthToken']，`Authorization: "Bearer "+localStorage['token']`，`credentials:include`
- **全局注入字段**：所有请求必须带 `app_name:"pc_view"`、`version:"v1"`、`custom_id`、`user_id`、`product_version:"v1"`、`pc:false`。缺失会报 `422 版本号不能为空`
- **列表接口**：`POST https://saas.clientapi.htknow.com/pc_view/course/column_course_list`，body `{product_id:series_id, order_id:bind_order_id, order_sort:1}` → `result.list[]`（含 id/title/new_sort）
- **播放接口**：`POST /pc_view/course/column_play_details`，body `{column_id:series_id, product_type:4, product_id:item.id, big_series_id:0, order_id:bind_order_id, main_product_id:mainId}` → `result.article_detail`
- **mp4 地址是加密的**：`article_detail.product_token` 是 Laravel 加密（AES-256-CBC），需用硬编码密钥 `base_KEY = "UkzX1D33BS6ap92t0+in7clE2f7ScWypTPr4HPHeCwk="` 解密。当 `product_token_status==1` 时解密；否则直接用 `article_detail.v_vedio_url`
- **防盗链**：下载 mp4 必须带 `Referer: https://learn.htknow.com/`，否则 403；支持 Range 断点续传
- **字段拼写坑**：播放地址字段名是 `v_vedio_url`（"vedio" 拼写错误），不是 `video_url`
- **个别讲次无视频**：如「非必看」「图文/音频」类讲次，`v_vedio_url` 为空属正常

## 排错速查

| 现象 | 原因 | 解决 |
|---|---|---|
| `422 版本号不能为空` | 缺全局字段 `version` | 补全全局注入字段 |
| mp4 下载 403 | 缺 Referer | 加 `Referer: https://learn.htknow.com/` |
| 抓到 0 个地址 | 接口用错（用了 column_course_detail） | 改用 column_play_details + 解密 product_token |
| 某讲显示「无视频」 | 该讲是图文/音频 | 正常，跳过 |

## 重要提醒

- 本工具**仅用于下载用户自己已购买、有访问权限的课程**，供个人离线学习
- 不要把用户的 token / cookie 写入代码或提交到公开仓库
- 下载内容请勿传播、勿商用，遵守平台服务条款与版权规定
