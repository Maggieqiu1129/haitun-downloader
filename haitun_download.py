# -*- coding: utf-8 -*-
"""
海豚知道 mp4 批量下载器（支持并行）
用法: python haitun_download.py <列表txt> [输出目录] [-j 并发数]
列表txt 每行格式: 序号<TAB>标题<TAB>mp4地址
"""
import os
import re
import sys
import time
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
REFERER = "https://learn.htknow.com/"
print_lock = threading.Lock()


def log(*args):
    with print_lock:
        print(*args)


def sanitize(name):
    name = re.sub(r'[\\/:*?"<>|]', '_', name)
    name = name.strip().strip('.')
    return name[:120] or 'video'


def parse_list(path):
    items = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) >= 3:
                n, title, url = parts[0], parts[1], parts[2]
            elif len(parts) == 1 and parts[0].startswith('http'):
                n, title, url = '', '', parts[0]
            else:
                continue
            if url.strip().startswith('http'):
                items.append((n.strip(), title.strip(), url.strip()))
    return items


def download(url, dest):
    """下载单个文件，支持断点续传。返回 True/False"""
    tmp = dest + '.part'
    downloaded = 0
    if os.path.exists(tmp):
        downloaded = os.path.getsize(tmp)
    elif os.path.exists(dest):
        return True

    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Referer': REFERER,
            })
            if downloaded > 0:
                req.add_header('Range', 'bytes=%d-' % downloaded)
            with urllib.request.urlopen(req, timeout=60) as resp:
                status = resp.status
                if status == 200 and downloaded > 0:
                    downloaded = 0
                    mode = 'wb'
                else:
                    mode = 'ab'
                with open(tmp, mode) as f:
                    while True:
                        chunk = resp.read(1024 * 256)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
            os.replace(tmp, dest)
            return True
        except Exception as e:
            if attempt < 3:
                time.sleep(3 * (attempt + 1))
    return False


def run_one(item, out_dir, idx, total):
    n, title, url = item
    name = "%s_%s.mp4" % (n.zfill(2) if n else str(idx).zfill(2), sanitize(title))
    dest = os.path.join(out_dir, name)
    log("[%d/%d] 开始: %s" % (idx, total, title))
    if os.path.exists(dest):
        log("[%d/%d] 已存在,跳过: %s" % (idx, total, title))
        return (idx, title, True)
    ok = download(url, dest)
    if ok:
        log("[%d/%d] 完成: %s" % (idx, total, title))
    else:
        log("[%d/%d] 失败: %s" % (idx, total, title))
    return (idx, title, ok)


def main():
    args = [a for a in sys.argv[1:]]
    jobs = 4
    if '-j' in args:
        i = args.index('-j')
        if i + 1 < len(args):
            jobs = int(args[i + 1])
            del args[i:i + 2]
    if '--jobs' in args:
        i = args.index('--jobs')
        if i + 1 < len(args):
            jobs = int(args[i + 1])
            del args[i:i + 2]

    if not args:
        print("用法: python haitun_download.py <列表txt> [输出目录] [-j 并发数]")
        sys.exit(1)
    list_path = args[0]
    out_dir = args[1] if len(args) > 1 else os.path.join(os.path.dirname(list_path), '下载')
    os.makedirs(out_dir, exist_ok=True)

    items = parse_list(list_path)
    if not items:
        print("列表为空或格式不对，应为: 序号<TAB>标题<TAB>url")
        sys.exit(1)

    total = len(items)
    print("共 %d 个视频，并发 %d，输出到: %s" % (total, jobs, out_dir))

    ok = 0
    fail = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(run_one, item, out_dir, idx, total): idx
                   for idx, item in enumerate(items, 1)}
        for fut in as_completed(futures):
            idx, title, success = fut.result()
            if success:
                ok += 1
            else:
                fail.append((idx, title))

    print("\n完成: 成功 %d / 失败 %d" % (ok, len(fail)))
    if fail:
        print("失败列表:")
        for idx, title in fail:
            print("  %d\t%s" % (idx, title))


if __name__ == '__main__':
    main()
