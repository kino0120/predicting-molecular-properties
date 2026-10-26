# %% [markdown]
# # 02 Uni-Mol の fine-tune で J を予測する
#
# Colab（VS Code の Colab 拡張でつなぐ）で実行する。データ・重み・キャッシュ・結果は Google Drive の `MyDrive/champs/` に置く。
#
# 流れ: 設定 → 準備（Drive・unimol_tools・重み）→ 前処理（キャッシュ）→ モデル → 重みの読み込み確認 → 学習 → 予測・提出ファイル
#
# Uni-Mol の本体は `unimol_tools`（DP Technology 公式、MIT ライセンス）から import して使う。
# ただし公式の学習・予測の仕組み（`MolTrain` など）は「1分子に1つの値」しか扱えず、J は原子ペアごとの値なので、
# 本体の部品だけを借りて、J を出す部分と学習ループは自分で書く。
#
# 学習は1エポックごとに `last.pt` を保存するので、切断されても同じセルを実行し直せば続きから再開できる。

# %% [markdown]
# ## 1. 設定

# %%
import gc
import math
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

CFG = {
    'run_name': 'unimol_v4',   # v4 = v3 と同じ設定を unimol_tools 版で。v2: dropout 0・補助損失なし（Private -2.372）、v3: 下の設定（v2 と 7:3 で平均して -2.424）
    'init': 'pretrained',      # 'pretrained'（Uni-Mol の重み）か 'scratch'（ランダム初期化。比較用）
    'epochs': 60,
    'batch_mols': 64,          # 1バッチの分子数
    'lr': 1e-4,                # 本体（Uni-Mol）の学習率
    'head_lr': 1e-3,           # J を出す部分の学習率
    'weight_decay': 0.01,
    'warmup_frac': 0.03,
    'dropout': 0.1,            # v2 で学習と検証の差が開いた（覚え込み）ので、事前学習時の値に戻す
    'contrib_w': 1.0,          # 4成分（fc/sd/pso/dso）の補助損失の重み。0 なら J だけで学習（3位の方式）
    'val_frac': 0.05,          # 検証に回す train 分子の割合
    'seed': 42,
    'resume': True,            # last.pt があれば続きから
    'log_every': 200,          # 何ステップごとに進み具合を表示するか
    'smoke': False,            # True にすると少数の分子・2エポックで最後まで通す（コードを変えたときの確認用。CPU でも動く）
    'smoke_mols': 240,
}
if CFG['smoke']:
    CFG.update(epochs=2, batch_mols=8, log_every=5, run_name=CFG['run_name'] + '_smoke')

BASE = Path(os.environ.get('CHAMPS_BASE', '/content/drive/MyDrive/champs'))
DATA = BASE / 'archive'      # コンペのデータ（必ず archive/ の版。下の「前処理」を参照）
WEIGHTS = BASE / 'weights' / 'unimol'
CACHE = BASE / 'cache'
OUT = BASE / 'runs' / CFG['run_name']

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
if DEVICE.type == 'cuda':
    # T4 など（compute capability 7.x）は bf16 が遅いので fp16、A100/L4 は bf16
    AMP_DTYPE = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
else:
    AMP_DTYPE = None
print('device:', DEVICE, torch.cuda.get_device_name(0) if DEVICE.type == 'cuda' else '',
      '| amp:', AMP_DTYPE, '| torch', torch.__version__)
print('out:', OUT)

# %% [markdown]
# ## 2. 準備: Drive・unimol_tools・Uni-Mol の重み
# - `unimol_tools` は `--no-deps` で入れる。依存のとおりに入れると numpy が古い版に入れ替わり、ランタイムの再起動が必要になるため。
#   Colab に入っていない依存（rdkit・addict・hydra-core・lmdb）だけを別に入れる
# - 版は 0.1.6 に固定する（このあと本体の内部の出力を直接使うので、版が変わると動かなくなる可能性がある）
# - 重みは `UNIMOL_WEIGHT_DIR` を Drive にしておくと、`unimol_tools` が初回だけ Hugging Face（dptech/Uni-Mol-Models）から Drive に保存し、次からはそれを使う

# %%
if str(BASE).startswith('/content/drive') and not Path('/content/drive/MyDrive').exists():
    from google.colab import drive
    drive.mount('/content/drive')
for p in (WEIGHTS, CACHE, OUT):
    p.mkdir(parents=True, exist_ok=True)
os.environ['UNIMOL_WEIGHT_DIR'] = str(WEIGHTS)

# %%
%pip install -q --no-deps unimol_tools==0.1.6
%pip install -q rdkit addict hydra-core lmdb

# %%
from unimol_tools.models import UniMolModel

print(sorted(p.name for p in WEIGHTS.iterdir()))

# %% [markdown]
# ## 3. 前処理
# 分子ごとに「原子のトークン（Uni-Mol の語彙）」と座標を、ペアごとに「原子番号・type・J・4成分・id」を配列にする。
# 1回作れば `cache/data_v1.npz` を読むだけになる。

# %%
TYPES = ['1JHC', '1JHN', '2JHC', '2JHH', '2JHN', '3JHC', '3JHH', '3JHN']
N_TYPES = len(TYPES)
MAXA = 29

# 語彙はファイルの行順（[PAD]=0, [CLS]=1, [SEP]=2, [UNK]=3, C=4, ...）。最後に [MASK] が足されて 31 語。
# 重みはこの番号で事前学習されている（元の Uni-Core と unimol_tools 0.1.4 までの読み方）。
# unimol_tools 0.1.5 以降の Dictionary は特殊トークンを先に [CLS]=0, [UNK]=1, [PAD]=2, [SEP]=3 で登録するので番号がずれる。
# そのため um.dictionary は使わず、ここで自分で番号を振る（C や H など原子の番号はどちらでも同じ）
from unimol_tools.weights.weighthub import weight_download

if not (WEIGHTS / 'mol.dict.txt').exists():
    weight_download('mol.dict.txt', str(WEIGHTS))
VOCAB = [line.split()[0] for line in open(WEIGHTS / 'mol.dict.txt') if line.strip()] + ['[MASK]']
TOK = {s: i for i, s in enumerate(VOCAB)}
PAD, CLS, SEP = TOK['[PAD]'], TOK['[CLS]'], TOK['[SEP]']
print('vocab', len(VOCAB), {s: TOK[s] for s in ['[PAD]', '[CLS]', '[SEP]', 'H', 'C', 'N', 'O', 'F']})

# データは必ず archive/ の版を使う。Kaggle API で今ダウンロードできるファイルは版が違う
# （分子が14個多く、test が352行少ない）ので、提出に必要な 2,505,542 行にならない
cache_file = CACHE / 'data_v1.npz'
if cache_file.exists():
    D = dict(np.load(cache_file))
    if not CFG['smoke']:
        # archive/ の版であることの確認（train 4,658,147 行・test 2,505,542 行）
        n_test_pairs = int(D['mol_is_test'][D['p_mol']].sum())
        assert len(D['p_mol']) - n_test_pairs == 4658147 and n_test_pairs == 2505542, 'archive/ の版のデータではない'
else:
    need = ['structures.csv', 'train.csv', 'test.csv', 'scalar_coupling_contributions.csv']
    assert all((DATA / f).exists() for f in need), f'キャッシュがないので {DATA} に archive/ の CSV（{", ".join(need)}）を置く'
    t0 = time.time()
    st = pd.read_csv(DATA / 'structures.csv',
                     dtype={'atom_index': np.int8, 'x': np.float32, 'y': np.float32, 'z': np.float32})
    mol_index = pd.Index(st.molecule_name.unique())
    sm = mol_index.get_indexer(st.molecule_name)
    M = len(mol_index)
    mol_tok = np.full((M, MAXA), PAD, np.int8)
    mol_xyz = np.zeros((M, MAXA, 3), np.float32)
    mol_tok[sm, st.atom_index] = st.atom.map(TOK).values
    mol_xyz[sm, st.atom_index] = st[['x', 'y', 'z']].values
    del st

    tr = pd.read_csv(DATA / 'train.csv', dtype={'atom_index_0': np.int8, 'atom_index_1': np.int8,
                                                'scalar_coupling_constant': np.float32})
    ct = pd.read_csv(DATA / 'scalar_coupling_contributions.csv', usecols=['fc', 'sd', 'pso', 'dso'], dtype=np.float32)
    assert np.abs(ct.sum(axis=1).values - tr.scalar_coupling_constant.values).max() < 0.01  # 行順が train と同じ
    te = pd.read_csv(DATA / 'test.csv', dtype={'atom_index_0': np.int8, 'atom_index_1': np.int8})
    n_tr = len(tr)
    pairs = pd.concat([tr.drop(columns='scalar_coupling_constant'), te], ignore_index=True)
    p_mol = mol_index.get_indexer(pairs.molecule_name).astype(np.int32)
    order = np.argsort(p_mol, kind='stable')
    p_J = np.full(len(pairs), np.nan, np.float32)
    p_J[:n_tr] = tr.scalar_coupling_constant.values
    p_c = np.full((len(pairs), 4), np.nan, np.float32)
    p_c[:n_tr] = ct.values
    mol_is_test = np.zeros(M, bool)
    mol_is_test[p_mol[n_tr:]] = True
    D = {
        'mol_tok': mol_tok, 'mol_xyz': mol_xyz, 'mol_n': (mol_tok != PAD).sum(1).astype(np.int8),
        'mol_is_test': mol_is_test,
        'p_mol': p_mol[order],
        'p_a0': pairs.atom_index_0.values[order],
        'p_a1': pairs.atom_index_1.values[order],
        'p_type': pd.Categorical(pairs['type'], categories=TYPES).codes.astype(np.int8)[order],
        'p_J': p_J[order], 'p_c': p_c[order],
        'p_id': pairs['id'].values.astype(np.int32)[order],
    }
    np.savez(cache_file, **D)
    del tr, te, ct, pairs
    gc.collect()
    print(f'cache built in {time.time() - t0:.0f}s')

M = len(D['mol_n'])
p_count = np.bincount(D['p_mol'], minlength=M)
p_start = np.cumsum(p_count) - p_count
print('molecules', M, 'pairs', len(D['p_mol']), 'test molecules', int(D['mol_is_test'].sum()))

# %% [markdown]
# ### 学習・検証・テストの分子を決める（分子単位で分ける）

# %%
rng = np.random.default_rng(CFG['seed'])
train_all = np.where(~D['mol_is_test'])[0]
test_mols = np.where(D['mol_is_test'])[0]
perm = rng.permutation(train_all)
n_val = int(len(train_all) * CFG['val_frac'])
val_mols, trn_mols = np.sort(perm[:n_val]), np.sort(perm[n_val:])
if CFG['smoke']:
    k = CFG['smoke_mols']
    trn_mols, val_mols, test_mols = trn_mols[:k], val_mols[:k // 4], test_mols[:k // 4]
print('train', len(trn_mols), 'val', len(val_mols), 'test', len(test_mols))


def pair_index(mols):
    """分子の配列 → その分子たちのペアの通し番号と、各ペアがバッチ内の何番目の分子か"""
    counts = p_count[mols]
    starts = p_start[mols]
    excl = np.cumsum(counts) - counts
    pidx = np.repeat(starts - excl, counts) + np.arange(counts.sum())
    bidx = np.repeat(np.arange(len(mols)), counts)
    return pidx, bidx


# type ごとの平均・標準偏差（出力のスケール合わせ用。学習分子だけで計算）
tp, _ = pair_index(trn_mols)
C_MEAN = np.zeros((N_TYPES, 4), np.float32)
C_STD = np.ones((N_TYPES, 4), np.float32)
for t in range(N_TYPES):
    c = D['p_c'][tp][D['p_type'][tp] == t]
    if len(c):
        C_MEAN[t], C_STD[t] = c.mean(0), c.std(0) + 1e-3
pd.DataFrame(np.c_[C_MEAN, C_STD], index=TYPES,
             columns=[f'mean_{c}' for c in ['fc', 'sd', 'pso', 'dso']] + [f'std_{c}' for c in ['fc', 'sd', 'pso', 'dso']]).round(3)

# %% [markdown]
# ### 配列を GPU に載せる（バッチはここから切り出す）

# %%
G = {
    'mol_tok': torch.as_tensor(D['mol_tok'].astype(np.int64), device=DEVICE),
    'mol_xyz': torch.as_tensor(D['mol_xyz'], device=DEVICE),
    'mol_n': torch.as_tensor(D['mol_n'].astype(np.int64), device=DEVICE),
    'p_a0': torch.as_tensor(D['p_a0'].astype(np.int64), device=DEVICE),
    'p_a1': torch.as_tensor(D['p_a1'].astype(np.int64), device=DEVICE),
    'p_type': torch.as_tensor(D['p_type'].astype(np.int64), device=DEVICE),
    'p_J': torch.as_tensor(np.nan_to_num(D['p_J']), device=DEVICE),
    'p_c': torch.as_tensor(np.nan_to_num(D['p_c']), device=DEVICE),
}


def make_batches(mols, batch_size, shuffle, seed=0):
    """原子数が近い分子どうしをまとめる（0埋めを減らす）。学習時はバッチの順番をシャッフル"""
    n = D['mol_n'][mols]
    if shuffle:
        r = np.random.default_rng(seed)
        order = r.permutation(len(mols))
        order = order[np.argsort(n[order], kind='stable')]
    else:
        order = np.argsort(n, kind='stable')
    batches = [mols[order[i:i + batch_size]] for i in range(0, len(mols), batch_size)]
    if shuffle:
        r.shuffle(batches)
    return batches


def build_batch(mols):
    """Uni-Mol の入力（[CLS] 原子… [SEP]、重心を原点にした座標）と、予測するペアを作る"""
    mt = torch.as_tensor(mols, device=DEVICE)
    n = G['mol_n'][mt]
    B, L = len(mols), int(n.max()) + 2
    ar = torch.arange(B, device=DEVICE)
    tok = torch.full((B, L), PAD, dtype=torch.long, device=DEVICE)
    tok[:, 0] = CLS
    tok[:, 1:L - 1] = G['mol_tok'][mt, :L - 2]
    tok[ar, n + 1] = SEP
    real = (tok[:, 1:L - 1] != PAD).unsqueeze(-1)
    x = G['mol_xyz'][mt, :L - 2]
    centroid = (x * real).sum(1) / n.unsqueeze(-1)
    xyz = torch.zeros((B, L, 3), device=DEVICE)
    xyz[:, 1:L - 1] = (x - centroid.unsqueeze(1)) * real
    pidx, bidx = pair_index(mols)
    pi = torch.as_tensor(pidx, device=DEVICE)
    return {
        'tok': tok, 'xyz': xyz, 'pidx': pidx,
        'pb': torch.as_tensor(bidx, device=DEVICE),
        'i': G['p_a0'][pi] + 1, 'j': G['p_a1'][pi] + 1,  # +1 は先頭の [CLS] の分
        't': G['p_type'][pi], 'J': G['p_J'][pi], 'c': G['p_c'][pi],
    }

# %% [markdown]
# ## 4. モデル
# 本体は `unimol_tools` の `UniMolModel` から、J の予測に要る部品（原子の埋め込み・距離の展開・Transformer）だけを使う。
# `UniMolModel` の forward は分子全体の表現（[CLS]）しか返さず、原子ペアの表現は捨ててしまうので、
# 部品を自分でつないで、エンコーダーが返す「最終のペア表現」を受け取る（事前学習で原子間距離の予測に使われていた表現）。
#
# J の出力部分: ペア (i, j) について [x_i, x_j, x_i*x_j, ペア表現 ij, ペア表現 ji, type の埋め込み] を MLP に入れ、
# type ごとに4成分（fc/sd/pso/dso）を出して合計を J とする。(i, j) と (j, i) の平均を取るので、入れ替えに対して対称。

# %%
class UniMolBackbone(nn.Module):
    """unimol_tools の UniMolModel の部品を使い、原子の表現（512次元）と最終のペア表現（64次元 = ヘッド数）を返す"""

    def __init__(self, dropout):
        super().__init__()
        um = UniMolModel(output_dim=1, data_type='molecule', remove_hs=False)  # 水素込みの重み（mol_pre_all_h_220816.pt）を読み込む
        self.embed_tokens, self.gbf, self.gbf_proj, self.encoder = um.embed_tokens, um.gbf, um.gbf_proj, um.encoder
        self.heads = um.args.encoder_attention_heads
        self.n_vocab = len(um.dictionary)
        assert self.n_vocab == len(VOCAB)
        # 0 埋めの位置は勾配を流さない。unimol_tools は [PAD]=2 のつもりなので、ファイルの行順の [PAD]=0 に直す
        self.embed_tokens.padding_idx = PAD
        # unimol_tools の dropout は 0.1 で固定なので、設定の値に揃える（activation_dropout は元から 0）
        for m in self.encoder.modules():
            for a in ('dropout', 'emb_dropout', 'attention_dropout'):
                if isinstance(getattr(m, a, None), float):
                    setattr(m, a, dropout)

    def forward(self, tok, xyz):
        B, L = tok.shape
        pad = tok.eq(PAD)
        dist = torch.cdist(xyz.float(), xyz.float())
        edge_type = tok.unsqueeze(-1) * self.n_vocab + tok.unsqueeze(-2)
        bias = self.gbf_proj(self.gbf(dist, edge_type))                      # (B, L, L, H)：距離をガウス関数で展開
        bias = bias.permute(0, 3, 1, 2).reshape(B * self.heads, L, L)
        # 戻り値: 原子の表現, 最終のペア表現, 変化分のペア表現（delta）, 正則化用の値 ×2
        x, pair, _, _, _ = self.encoder(self.embed_tokens(tok), attn_mask=bias, padding_mask=pad)
        return x, pair.masked_fill(pad[:, None, :, None], 0)                # 0 埋めの位置（-inf が入っている）は 0 に


def init_bert_params(module):
    """Uni-Mol をランダム初期化するとき（init='scratch'）の初期化"""
    if isinstance(module, nn.Linear):
        nn.init.normal_(module.weight, mean=0.0, std=0.02)
        if module.bias is not None:
            nn.init.zeros_(module.bias)
    elif isinstance(module, nn.Embedding) and module.weight.shape[0] > 1 and module.weight.shape[1] > 1:
        nn.init.normal_(module.weight, mean=0.0, std=0.02)
        if module.padding_idx is not None:
            nn.init.zeros_(module.weight[module.padding_idx])


class JModel(nn.Module):
    def __init__(self, backbone, c_mean, c_std, hidden=512):
        super().__init__()
        self.backbone = backbone
        self.type_emb = nn.Embedding(N_TYPES, 64)
        in_dim = 3 * 512 + 2 * 64 + 64
        self.head = nn.Sequential(nn.LayerNorm(in_dim), nn.Linear(in_dim, hidden), nn.GELU(),
                                  nn.Linear(hidden, hidden), nn.GELU(), nn.Linear(hidden, N_TYPES * 4))
        self.register_buffer('c_mean', torch.as_tensor(c_mean))
        self.register_buffer('c_std', torch.as_tensor(c_std))

    def forward(self, tok, xyz, pb, i, j, t):
        x, pair = self.backbone(tok, xyz)
        xi, xj = x[pb, i], x[pb, j]
        pij, pji = pair[pb, i, j], pair[pb, j, i]
        te = self.type_emb(t)
        out = 0.5 * (self.head(torch.cat([xi, xj, xi * xj, pij, pji, te], -1))
                     + self.head(torch.cat([xj, xi, xi * xj, pji, pij, te], -1)))
        out = out.view(-1, N_TYPES, 4)[torch.arange(len(t), device=t.device), t].float()
        return self.c_mean[t] + self.c_std[t] * out   # (N, 4) = fc, sd, pso, dso。J は合計

# %% [markdown]
# ## 5. Uni-Mol の重みの読み込みと確認
# `UniMolModel` は重みを `strict=False` で読み込むので、名前がずれていてもエラーにならない。読み込めなかった重みがないかをここで確かめる。
#
# さらに、事前学習で使われた「最終のペア表現から原子間距離を当てる部分」（dist_head）で距離を予測させ、本物の距離と比べる。
# dist_head は `UniMolModel` に含まれないので、重みファイルから自分で読み込む。
# 出力は標準化した距離（平均 6.3126・標準偏差 3.3899 で換算）なので、元の単位に戻して比べる。
# 語彙の番号と入力の形が正しければ、誤差は 0.05Å 程度になる（自前で移植した版で 0.0501Å を確認済み）。

# %%
class DistanceHead(nn.Module):
    def __init__(self, heads=64):
        super().__init__()
        self.dense = nn.Linear(heads, heads)
        self.layer_norm = nn.LayerNorm(heads)
        self.out_proj = nn.Linear(heads, 1)

    def forward(self, x):
        x = self.out_proj(self.layer_norm(F.gelu(self.dense(x)))).squeeze(-1)
        return (x + x.transpose(-1, -2)) * 0.5


backbone = UniMolBackbone(dropout=CFG['dropout'])
state = torch.load(WEIGHTS / 'mol_pre_all_h_220816.pt', map_location='cpu', weights_only=True)['model']
missing, unexpected = backbone.load_state_dict(state, strict=False)
print('読み込めなかった本体の重み:', missing)
# encoder.final_head_layer_norm は変化分のペア表現（delta）用。unimol_tools では使わない設定になっている
print('使わない事前学習用の部分:', sorted({k.rsplit('.', 1)[0] if k.startswith('encoder.') else k.split('.')[0] for k in unexpected}))
assert not missing

dist_head = DistanceHead()
dist_head.load_state_dict({k[len('dist_head.'):]: v for k, v in state.items() if k.startswith('dist_head.')})
backbone.to(DEVICE).eval()
dist_head.to(DEVICE).eval()
with torch.no_grad():
    b = build_batch(val_mols[:16])
    _, pair = backbone(b['tok'], b['xyz'])
    pred = dist_head(pair.float()) * 3.3899264663911888 + 6.312581655060595
    true = torch.cdist(b['xyz'], b['xyz'])
    atom = (b['tok'] != PAD) & (b['tok'] != CLS) & (b['tok'] != SEP)
    mask = atom.unsqueeze(-1) & atom.unsqueeze(-2) & ~torch.eye(b['tok'].shape[1], dtype=torch.bool, device=DEVICE)
    err = (pred - true)[mask].abs()
    print(f'距離の予測誤差: 平均 {err.mean():.4f} Å, 中央値 {err.median():.4f} Å（本物の距離の平均 {true[mask].mean():.3f} Å）')
del dist_head, pair, pred, true, b

if CFG['init'] == 'scratch':
    backbone.apply(init_bert_params)
    print('本体はランダム初期化（比較用）')
del state
gc.collect()

# %% [markdown]
# ## 6. 学習
# 損失は type 別の log(MAE) の平均（コンペの指標そのもの）。毎エポック、検証分子でスコアを出し、`last.pt` と（最良なら）`best.pt` を保存する。

# %%
def group_lmae(pred, target, t):
    err = (pred - target).abs()
    s = torch.zeros(N_TYPES, device=err.device, dtype=err.dtype).index_add_(0, t, err)
    c = torch.bincount(t, minlength=N_TYPES)
    m = c > 0
    return torch.log(s[m] / c[m] + 1e-9).mean()


def score_np(pidx, J_pred):
    t, err = D['p_type'][pidx], np.abs(J_pred - D['p_J'][pidx])
    per = {TYPES[k]: float(np.log(err[t == k].mean())) for k in range(N_TYPES) if (t == k).any()}
    return float(np.mean(list(per.values()))), per


def autocast():
    if AMP_DTYPE is None:
        return torch.autocast('cpu', enabled=False)
    return torch.autocast('cuda', dtype=AMP_DTYPE)


@torch.no_grad()
def predict(mols, batch_size):
    model.eval()
    pidx_all, c_all = [], []
    for mb in make_batches(mols, batch_size, shuffle=False):
        b = build_batch(mb)
        with autocast():
            c = model(b['tok'], b['xyz'], b['pb'], b['i'], b['j'], b['t'])
        pidx_all.append(b['pidx'])
        c_all.append(c.float().cpu().numpy())
    return np.concatenate(pidx_all), np.concatenate(c_all)


model = JModel(backbone, C_MEAN, C_STD).to(DEVICE)
n_params = sum(p.numel() for p in model.parameters())
print(f'parameters: {n_params / 1e6:.1f}M')

head_params = [p for n, p in model.named_parameters() if not n.startswith('backbone.')]
body_params = [p for n, p in model.named_parameters() if n.startswith('backbone.')]


def decay_split(params, lr):
    return [{'params': [p for p in params if p.ndim >= 2], 'lr': lr, 'weight_decay': CFG['weight_decay']},
            {'params': [p for p in params if p.ndim < 2], 'lr': lr, 'weight_decay': 0.0}]


opt = torch.optim.AdamW(decay_split(body_params, CFG['lr']) + decay_split(head_params, CFG['head_lr']),
                        betas=(0.9, 0.99), eps=1e-6)
steps_per_epoch = len(make_batches(trn_mols, CFG['batch_mols'], shuffle=True))
total_steps = CFG['epochs'] * steps_per_epoch
warmup = max(1, int(CFG['warmup_frac'] * total_steps))


def lr_lambda(step):
    if step < warmup:
        return (step + 1) / warmup
    return 0.5 * (1 + math.cos(math.pi * min(1.0, (step - warmup) / max(1, total_steps - warmup))))


sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)
use_scaler = AMP_DTYPE == torch.float16
try:
    scaler = torch.amp.GradScaler('cuda', enabled=use_scaler)
except (AttributeError, TypeError):
    scaler = torch.cuda.amp.GradScaler(enabled=use_scaler)

start_epoch, best, history = 0, float('inf'), []
if CFG['resume'] and (OUT / 'last.pt').exists():
    ck = torch.load(OUT / 'last.pt', map_location=DEVICE, weights_only=True)
    model.load_state_dict(ck['model'])
    opt.load_state_dict(ck['opt'])
    sched.load_state_dict(ck['sched'])
    scaler.load_state_dict(ck['scaler'])
    start_epoch, best, history = ck['epoch'] + 1, ck['best'], list(ck['history'])
    print(f'resumed from epoch {start_epoch}, best {best:.4f}')
print(f'steps/epoch {steps_per_epoch}, total {total_steps}, warmup {warmup}')

# %%
for epoch in range(start_epoch, CFG['epochs']):
    model.train()
    t0 = time.time()
    run_loss, run_n = 0.0, 0
    epoch_loss, epoch_n = 0.0, 0
    batches = make_batches(trn_mols, CFG['batch_mols'], shuffle=True, seed=CFG['seed'] + epoch)
    for step, mb in enumerate(batches):
        b = build_batch(mb)
        with autocast():
            c = model(b['tok'], b['xyz'], b['pb'], b['i'], b['j'], b['t'])
        loss = group_lmae(c.sum(-1), b['J'], b['t'])
        if CFG['contrib_w'] > 0:
            loss = loss + CFG['contrib_w'] * sum(group_lmae(c[:, k], b['c'][:, k], b['t']) for k in range(4)) / 4
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()
        sched.step()
        loss_value = loss.item()
        run_loss += loss_value
        run_n += 1
        epoch_loss += loss_value
        epoch_n += 1
        if (step + 1) % CFG['log_every'] == 0 or step + 1 == len(batches):
            el = time.time() - t0
            print(f'epoch {epoch} step {step + 1}/{len(batches)} loss {run_loss / run_n:.4f} '
                  f'| {el / (step + 1):.3f}s/step, epoch ETA {el / (step + 1) * len(batches) / 60:.1f} min', flush=True)
            run_loss, run_n = 0.0, 0
    train_min = (time.time() - t0) / 60

    pidx, c = predict(val_mols, CFG['batch_mols'] * 2)
    val, per = score_np(pidx, c.sum(1))
    train_loss = epoch_loss / max(1, epoch_n)
    history.append({'epoch': epoch, 'train_loss': train_loss, 'val': val, 'train_min': train_min, **per})
    print(f'== epoch {epoch}: train {train_loss:.4f} val {val:.4f} ({train_min:.1f} min) | '
          + ' '.join(f'{k} {v:.2f}' for k, v in per.items()))
    pd.DataFrame(history).to_csv(OUT / 'history.csv', index=False)
    if val < best:
        best = val
        torch.save({'model': model.state_dict(), 'epoch': epoch, 'val': val}, OUT / 'best.pt')
    torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'sched': sched.state_dict(),
                'scaler': scaler.state_dict(), 'epoch': epoch, 'best': best, 'history': history}, OUT / 'last.pt')

# ここから予測と提出ファイル（接続が切れても Colab 側で最後まで進むように、学習と同じセルで続けて実行する）
# best.pt で検証分子とテスト分子を予測する。提出ファイルは submission.csv（Kaggle に Late Submission で出す）
ck = torch.load(OUT / 'best.pt', map_location=DEVICE, weights_only=True)
model.load_state_dict(ck['model'])
print('best epoch', ck['epoch'], 'val', round(ck['val'], 4))

pidx, c = predict(val_mols, CFG['batch_mols'] * 2)
val, per = score_np(pidx, c.sum(1))
print(f'val score {val:.4f}')
print(pd.Series(per).round(3).to_string())
np.save(OUT / 'val_pred.npy', np.c_[D['p_id'][pidx], c.sum(1)])

pidx, c = predict(test_mols, CFG['batch_mols'] * 2)
sub = pd.DataFrame({'id': D['p_id'][pidx], 'scalar_coupling_constant': c.sum(1)}).sort_values('id')
sub.to_csv(OUT / 'submission.csv', index=False)
assert len(sub) == 2505542 or CFG['smoke'], f'submission rows {len(sub)}'
print(sub.shape, '→', OUT / 'submission.csv')
