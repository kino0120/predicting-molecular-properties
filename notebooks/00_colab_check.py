# %% [markdown]
# # 00 Colab 接続確認
#
# VS Code の Colab 拡張機能で、このノートブックを Colab のランタイムにつないで上から順に実行する。
# 最初は安い GPU（T4 か L4）で十分。全部で数十秒で終わる。
#
# 実行が終わったら**ノートブックを保存**する（結果がファイルに残り、Claude が読めるようになる）。
# 使い終わったら**ランタイムを切断**する（つないでいる間は CU が減る）。

# %% [markdown]
# ## 1. GPU

# %%
!nvidia-smi

# %% [markdown]
# ## 2. Python・PyTorch・メモリ・ディスク

# %%
import os
import platform
import shutil
import sys

import torch

print('python  :', sys.version.split()[0], platform.platform())
print('torch   :', torch.__version__, '/ cuda', torch.version.cuda)
print('cuda ok :', torch.cuda.is_available())
if torch.cuda.is_available():
    p = torch.cuda.get_device_properties(0)
    print('gpu     :', p.name, f'{p.total_memory / 2**30:.1f} GiB')
    print('bf16 ok :', torch.cuda.is_bf16_supported())
print('cpu     :', os.cpu_count(), 'cores')
print('ram     :', f'{os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30:.1f} GiB')
total, used, free = shutil.disk_usage('/content' if os.path.exists('/content') else '/')
print('disk    :', f'free {free / 2**30:.0f} GiB / total {total / 2**30:.0f} GiB')
print('cwd     :', os.getcwd())

# %% [markdown]
# ## 3. ライブラリの有無（このあと使うもの）

# %%
# import すると認証を求めるライブラリ（kaggle）があるので、読み込まずにバージョンだけ見る
from importlib.metadata import PackageNotFoundError, version

for name in ['numpy', 'pandas', 'rdkit', 'kaggle', 'huggingface_hub']:
    try:
        print(f'{name:16s}', version(name))
    except PackageNotFoundError:
        print(f'{name:16s}', 'NOT installed')

# %% [markdown]
# ## 4. GPU の実際の速さ（学習時間の見積もり用）
# 行列積を繰り返して、1秒あたりの計算量（TFLOPS）を測る。

# %%
import time

if torch.cuda.is_available():
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    n = 8192
    a = torch.randn(n, n, device='cuda', dtype=dtype)
    b = torch.randn(n, n, device='cuda', dtype=dtype)
    for _ in range(3):
        a @ b
    torch.cuda.synchronize()
    reps = 20
    t0 = time.time()
    for _ in range(reps):
        a @ b
    torch.cuda.synchronize()
    dt = time.time() - t0
    print(f'{dtype}: {2 * n**3 * reps / dt / 1e12:.0f} TFLOPS')
    del a, b
    torch.cuda.empty_cache()

# %% [markdown]
# ## 5. Google Drive（任意）
# 学習したモデルや提出ファイルを残す場所として使えるかを確認する。
# 認証の画面が出たら、自分の Google アカウントで許可する。失敗しても先には進める（別の保存方法を考える）。

# %%
try:
    from google.colab import drive
    drive.mount('/content/drive')
    print('Drive OK:', os.listdir('/content/drive')[:5])
except Exception as e:
    print('Drive をマウントできなかった:', type(e).__name__, e)

# %% [markdown]
# ## 6. Kaggle の認証（データのダウンロード用）
# 実行すると入力欄が出るので、Kaggle の Settings → API で作った **API トークン**を貼り付けて Enter を押す。
# 入力した文字は画面にもノートブックにも残らない（このランタイムの中だけで使う）。
# ランタイムを切断すると消えるので、新しくつなぐたびにこのセルを実行し直す。

# %%
import getpass

os.environ['KAGGLE_API_TOKEN'] = getpass.getpass('Kaggle API token: ')
!kaggle competitions files champs-scalar-coupling
