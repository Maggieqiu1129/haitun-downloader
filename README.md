# 海豚知道课程下载 skill

一个 [Claude Code](https://claude.com/claude-code) skill，用于把「海豚知道」平台上**自己已购买**的系列课视频批量保存为本地 mp4 文件，供个人离线学习。

> ⚠️ **免责声明**：本工具仅用于下载**用户本人已购买、拥有访问权限**的课程内容，供个人离线学习备份。请勿用于下载未授权内容，请勿传播、商用，请遵守平台服务条款与相关版权法律法规。使用本工具产生的后果由使用者自行承担。

## 功能

- Tampermonkey 脚本抓取课程全部 mp4 直链（含 AES 解密）
- Python 下载器：防盗链 Referer、断点续传、多线程并行

## 目录结构

```
haitun-downloader/
├── SKILL.md                  # skill 说明书（给 Claude 的指令）
├── README.md                 # 本文件
├── haitun_download.py        # 下载器（Python 3，纯标准库）
└── 海豚知道mp4抓取.user.js     # Tampermonkey 抓取脚本
```

## 安装

### 方式一：作为 Claude Code skill

```bash
# 克隆仓库
git clone https://github.com/<你的用户名>/haitun-downloader.git

# 复制到 Claude Code 的 skills 目录
mkdir -p ~/.claude/skills
cp -r haitun-downloader ~/.claude/skills/haitun-downloader
```

重启 Claude Code，之后输入 `/haitun-downloader` 即可触发。

### 方式二：不用 Claude Code，直接手动用

也可以完全不依赖 Claude Code，只用两个脚本：

1. 浏览器装 Tampermonkey → 新建脚本，粘贴 `海豚知道mp4抓取.user.js` 内容
2. 命令行跑 `python haitun_download.py`

## 使用步骤

1. 安装 Tampermonkey 脚本后，打开课程播放页 `learn.htknow.com/seriesPlayPage?id=...`
2. 点悬浮面板「开始抓取全部地址」→「导出下载列表(txt)」
3. 运行下载器：

```bash
python haitun_download.py 海豚知道_mp4列表.txt ./下载 -j 8
```

## 依赖

- Python 3（无第三方依赖）
- 浏览器 Tampermonkey 插件

## 隐私与安全

- 脚本读取的是**你自己浏览器 localStorage 里的登录凭证**，不会上传到任何第三方
- 请勿把 token、cookie 写入代码或提交到仓库
- `.gitignore` 已忽略 `.part` 下载临时文件和视频文件

## License

仅供学习交流，使用者需自行确保合规。
