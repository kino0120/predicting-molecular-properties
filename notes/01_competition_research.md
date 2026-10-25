# CHAMPS Scalar Coupling（Predicting Molecular Properties）調査メモ

調査日: 2026-10-24
対象: https://www.kaggle.com/competitions/champs-scalar-coupling

---

## 1. コンペ概要

| 項目 | 内容 |
|---|---|
| 期間 | 2019/05/29 〜 2019/08/28（約13週）、参加 2,749 チーム |
| 主催 | CHAMPS（Bristol大など）。賞金 $12.5k / 7.5k / 5k / 3k / 2k |
| タスク | 分子内の原子ペア（必ず片方はH）の **スカラーカップリング定数 J（NMRの値, Hz）** を回帰 |
| 元データ | QM9（C, H, N, O, F のみ、重原子 ≤ 9、全原子 ≤ 29）。J は DFT（B3LYP/6-31g(2df,p)）で計算 |
| 入力（test で使えるもの） | `structures.csv`（原子種 + xyz 座標）、`test.csv`（molecule, atom_index_0, atom_index_1, type） |
| train 限定の追加データ | `scalar_coupling_contributions.csv`（J = fc + sd + pso + dso の4成分）、`mulliken_charges`、`magnetic_shielding_tensors`、`dipole_moments`、`potential_energy` |
| 分割 | 分子単位で分割。train 85,003 分子 / 4,658,147 ペア、test 45,772 分子 / 2,505,542 ペア。Public 29% / Private 71% |
| 外部データ | 途中のルール改定で **QM7/QM9 の公開データは使用可**。ただし量子化学計算で値を求めるのは禁止 |
| 評価指標 | **coupling type ごとの log(MAE) の平均** = (1/8) Σ_t log( mean |y − ŷ| ) |
| LBの特徴 | リークなし、CV・Public・Private が非常に安定（上位37提出は Public と Private で順位が同じ） |

### coupling type 別の統計（手元の train.csv から集計）

| type | train件数 | test件数 | 平均 | 標準偏差 | 中央値予測のMAE | log(MAE) |
|---|---:|---:|---:|---:|---:|---:|
| 1JHC | 709,416 | 380,609 | 94.98 | 18.28 | 11.286 | 2.424 |
| 1JHN | 43,363 | 24,195 | 47.48 | 10.92 | 9.730 | 2.275 |
| 2JHC | 1,140,674 | 613,138 | -0.27 | 4.52 | 2.630 | 0.967 |
| 2JHH | 378,036 | 203,126 | -10.29 | 3.98 | 2.426 | 0.886 |
| 2JHN | 119,253 | 64,424 | 3.12 | 3.67 | 2.862 | 1.052 |
| 3JHC | 1,510,379 | 811,999 | 3.69 | 3.07 | 2.421 | 0.884 |
| 3JHH | 590,611 | 317,435 | 4.77 | 3.70 | 2.947 | 1.081 |
| 3JHN | 166,415 | 90,616 | 0.99 | 1.32 | 0.911 | -0.093 |

- type 別に中央値を返すだけの予測でスコアは **+1.18**。優勝スコアは **-3.24**（平均 MAE が約 1/80）
- **指標から分かること**: log を取ってから平均するので、どの type でも MAE が **同じ割合**だけ下がればスコアへの効き方は同じ。件数の少ない 1JHN（4.3万件）も 3JHC（151万件）と同じ重み → 少数 type のケアが重要
- 1JHC / 1JHN は値のスケールが大きいので、絶対誤差では最も難しい（2位チームも 1JHC/1JHN 専用の fine-tune をしている）

---

## 2. 上位解法の一覧

スコアは Private LB。「単体」は writeup に書かれている最良のシングルモデルのスコア。

| 順位 | チーム | Private | モデルの系統 | 単位（何を1トークン/ノードにするか） | 主な入力特徴 | 補助データの利用 | アンサンブル | 単体スコア |
|---:|---|---:|---|---|---|---|---|---|
| 1 | hybrid（Bosch / CMU, Zico Kolter ら） | **-3.23968** | Soft Graph Transformer | 原子・原子ペア・三つ組（・四つ組）を**すべてノード**化、1分子 ~500ノード | 階層的な型埋め込み（原子種・結合数・結合次数）、OpenBabel の部分電荷、距離・角度を Fourier エンコード | 使わない（structures/train/test のみ） | 13モデル、median ベースのブレンド | 約 -3.08（Public） |
| 2 | 🤖 Quantum Uncertainty 🤖（Torrubia, Hanchar） | -3.22349 | 位置エンコーディングなしの Transformer Encoder（"Atomic Transformer"） | 原子（source 原子ごとに分子をコピーし、原点を source 原子に置く） | **xyz・原子種・coupling type だけ**（グラフ情報も手作り特徴もなし） | 使わない | 14モデル（d=512〜2048、6〜24層、12M〜100M パラメータ） | **-3.16234（Private）** |
| 3 | [ka.kr] Solve chem. together | -3.19498 | BERT Encoder（8層・8ヘッド） | **原子ペア（coupling）** | 2原子の xyz・原子番号・電荷の埋め込み、距離、type（合計832次元） | **fc/sd/pso/dso を補助ターゲット**に使用 | 14モデル → 疑似ラベルで8モデル | 約 -3.11（LB） |
| 4 | Hyperspatial Engineers | -3.18085 | Graph Attention / Graph Transformer（三つ組でエッジ更新） | 原子ノード + 結合エッジ + 2J/3J の人工エッジ（有向） | 電気陰性度・イオン化エネルギー・電子親和力・Mulliken電荷（QM9）、距離、結合種、角度、二面角。**xyz は使わない** | QM9 の Mulliken 電荷 | 2つの split の平均 + SWA | - |
| 5 | DL guys | -3.14969 | MEGNet 系 GNN（ノード・エッジ・グローバル） | 原子ノード + エッジ | エッジ間の角度を畳み込む edge-to-edge conv | - | 50個の予測を LGBM + HuberRegressor でスタッキング | 約 -2.9 |
| 6 | Robin N | -3.04456 | MPNN + Transformer Encoder のハイブリッド | 原子ノード | 角度・二面角などの特徴、3種類の attention（ユークリッド距離のガウシアン / グラフ距離 / 内積） | 4成分を予測してから合計 | 8-fold + MPNN 8-fold | 8-fold 単体で -3.039 |
| 7 | Pinkman Chemistry Lab（CPMP, Ahmet, outrunner） | -3.03280 | 行単位の NN + LightGBM | 原子ペア（1行=1サンプル） | 2原子からの相対位置、中間原子までの距離 | - | **NN の残差を LGBM で学習**（+0.15）してブレンド | 約 -2.99（NN bag） |
| 8 | 4 GM and the brain（Dieter, artgor, Bojan ら） | -3.00189 | SchNet を大幅改造した dense GNN | 原子ノード + エッジ | 結合種、角度、分子レベル特徴 | - | type 別に MAE 最小化でブレンド | 約 -2.95 |
| 9 | Jaechang Lim | -2.97389 | MPNN（全結合グラフ） | 原子ノード | **原子種と距離だけ** | - | seed 違い10モデル | 約 -2.8 |
| 10 | KhaVo Zidmie Josh Kyle Akira | -2.95233 | SchNet × 2段 | 原子ノード | xyz、原子種、Mulliken電荷、結合・角度・二面角 | 4成分を予測。2段目は OOF の成分予測をエッジ特徴に追加 | 分位点回帰（q=0.5）でブレンド、fold は median で平均 | 約 -2.85 |
| 12 | Team Bird Brain | -2.93335 | **Cormorant（SO(3) 同変 NN）** | 原子 | 座標（回転同変） | Mulliken電荷で事前学習してから除去 | ほぼなし（4提出のみ） | - |
| 13 | KM（DeNA 藤川・望月） | -2.92387 | SchNet + GIN | 原子 | グラフ距離の one-hot、二面角などのペア特徴 | - | type 別 fine-tune + 疑似ラベル + seed 平均 | - |
| 14 | Squid | -2.90753 | Keras の GCN（Kaggle Kernel だけで学習） | 原子 + 29×29 のペアテンソル | 逆距離のべき乗、結合ベクトル、角度、二面角 | Mulliken・遮蔽テンソル固有値を中間層で予測、4成分の合計 | 約10回の実行を平均 | 約 -2.6 |
| 15 | Bra & Ket | -2.87509 | MEGNet（PyTorch Geometric） | 原子 + 化学結合エッジ / coupling エッジ | - | - | NN / LGB と stacking | - |
| 19 | toshi_k | -2.80799 | エッジ更新型 MPNN + 高次 GNN（chainer-chemistry 系） | 原子 | xyz2mol / RDKit の原子特徴、OpenBabel の電荷 | - | - | - |

（11位 jacobkie は writeup なし）

---

## 3. 上位解法の詳細

### 1位 hybrid — "Soft" Graph Transformer
- **メタグラフ**: 原子・原子ペア（化学結合でないペアも含む）・三つ組・四つ組をすべてノードにする。1分子あたり ~500ノード、埋め込み次元 d ≈ 600〜750、深さ 14〜16層
- **attention に距離バイアス**: `softmax(QK^T − γ·D)`。D はノード間距離の2乗（原子-ペア間は2原子への最小距離など）、γ は学習パラメータ。γ→0 で普通の Transformer、γ→∞ でハードなグラフ Transformer になる
- **入力埋め込み**: 原子種 → 原子種 + 結合数 → 結合次数… と階層的に型を埋め込む。スカラー（原子は部分電荷、ペアは距離、三つ組は角度、四つ組は二面角）は位置エンコーディング風の **Fourier 特徴**にする
- **出力ヘッド**: 8 type ではなく **33個のサブタイプ**ごとに 2層 MLP（例: 1JHC を C の結合数で分ける）。これが少し効いた
- **正則化**: dropout はごく少量。終盤に **cutout（原子を2つ、関係するペア・三つ組ごとランダムに落とす）** が非常によく効いた
- 効かなかったもの: 四つ組（二面角）は汎化を悪化させたので多くのモデルで除外。結合レベルのクーロン力
- **アンサンブル**: 13モデル。単純な median で ~-3.22。median で良い9モデルを選び、複数 median の平均を取って -3.24
- 計算資源: 4×RTX2080Ti のマシン5台 + V100 を数台、約1か月
- コード: https://github.com/boschresearch/BCAI_kaggle_CHAMPS （README によるとデフォルト設定の単体で -3.06〜-3.07）

### 2位 Quantum Uncertainty — Atomic Transformer（ドメイン知識なし）
- **入力表現が鍵**: 分子を source 原子（atom_index_0）ごとにコピーし、source 原子が原点に来るよう平行移動する。入力は長さ29の配列3つ: (1) xyz、(2) 原子種 index、(3) その原子に対する coupling type index。パディングは -1
- **出力**: 長さ29の配列。target 原子の位置に J が入る（1回の forward で source 原子からの全カップリングを予測）
- **モデル**: 位置エンコーディングを外した Transformer Encoder（集合なので順序不変）。xyz（正規化のみ）と原子種・type の埋め込みを concat して入力する。デコーダは d→1 の線形射影だけ
- 最初は PointNet 系（-2.28）だったが、pooling がボトルネックで頭打ちになり Transformer に移行
- データ拡張: J の対称性（i↔j の入れ替え）は効いた。回転拡張は PointNet では効いたが Transformer では効果なし
- **効かなかったもの**: 4成分などを使ったマルチタスク、dropout、原子の knock-out、回転 TTA、深いデコーダ、FP16（NaN）
- 1JHC / 1JHN 用に fine-tune（CV で 1JHC -2.12、1JHN -2.19）
- 14モデルのアンサンブル、最良単体 Private -3.162（**単体最強**）
- 計算資源: 2080Ti ×3 + 1080Ti ×2 + 2080Ti ×8 以上をレンタル。FastAI、RAdam/Ralamb
- コード: https://github.com/antorsae/champs-scalar-coupling

### 3位 [ka.kr] — BERT（ペアをトークンにする）
- 1トークン = 1 coupling（原子ペア）。8層・8ヘッド・dropout 0.1、type ごとに readout
- 埋め込み: 電荷 32、位置（xyz）256、原子番号 64（ここまで2原子分）、距離 64、type 64 → 832次元
- 拡張: 平行移動ノイズ（std 2）と、ランダムな軸まわりの回転（角度 ~N(0, π/2)）で擬似的に不変性を持たせる
- **fc/sd/pso/dso を補助損失**にすると大きく伸びた（loss = J の loss + 成分の loss、AdamW）
- 学習率は線形減衰。スケジュールが非常に重要（約75M パラメータ、1モデル 2〜4×V100 で1〜2日）
- **疑似ラベル**: test の予測をラベルにして学習（CV は -3.4 まで出る＝過学習）→ その後 train だけで追加学習して ~-3.11
- 14モデルを type 別 CV で重み付け平均して -3.16、疑似ラベル版8モデルの単純平均で -3.19
- 教訓: GNN 担当（化学の専門家）より、NLP 出身メンバーが xyz をそのまま入れた BERT のほうが強かった

### 4位 Hyperspatial Engineers — 三つ組更新の Graph Attention（2080Ti 1枚）
- OpenBabel で結合を推定し、独自コードで誤りを修正。グラフは原子ノード + 結合エッジ + **距離2/3の人工エッジ（2J/3J）**、すべて双方向の有向エッジ
- 特徴: 原子は原子種・電気陰性度・第一イオン化エネルギー・電子親和力・Mulliken電荷（QM9 の値。提供 Mulliken で学習した同じモデルで予測したものも使用）。エッジは距離と種類、2J は角度、3J は二面角。**xyz は使わず回転・並進不変**
- モデル: マルチヘッド Graph Attention（emb 48 × 24ヘッド、7ブロック）。まずエッジ埋め込みを (src, edge, dst) の三つ組から更新し、その後エッジを集約して原子を更新。ヘッドは前層の同じヘッドの出力だけを参照する。ゲート付き残差
- **予測はエッジの両方向で別々に出して平均**（ミニアンサンブル）
- 損失: type 別 MAE の平均（log-MAE は悪化した）。type によってターゲットを標準化するかどうかを使い分け
- 最適化: **LAMBW**（LAMB の weight decay を更新の外に出したもの）。one-cycle 30 epoch（強い weight decay）→ weight decay を外して ~70 epoch → type 別 fine-tune 100 epoch（*JHN は除く）→ **最後25 epoch の SWA**
- 2つの 90/10 split で学習して平均。**RTX 2080Ti 1枚**（計算資源あたりの効率が最も高い）
- 効かなかったもの: RAdam、log-MAE / MSE 損失、GradNorm などのマルチタスク手法

### 5位 DL guys — MEGNet 系 GNN + 2段スタッキング
- ベース: MEGNet（arXiv:1812.05055）系の GNN（ノード・エッジ・グローバル表現）を PyTorch Geometric で実装
- 効いたもの: BatchNorm より LayerNorm、ReLU より Softplus（~0.1）、エッジ→ノード集約前のゲート、**edge-to-edge convolution**（隣接エッジとの角度を入れる。5倍遅くなるが +0.15）、type ごとの MLP ヘッド、atom_0–atom_1 の結合表現とグローバル表現をヘッドに入れること
- 20モデル（最良 -2.9、他は ~-2.7）+ チェックポイント = 50個の予測を、5000分子の holdout 上で LGBM（全 type）+ HuberRegressor（type 別）でスタッキング → -3.15

### 6位 Robin N — MPNN × Transformer
- まず MPNN を改造して -2.87: coupling ペア専用の message passing、角度系特徴、cos 角度による attention、set2set をガウシアン attention に置換、4成分を予測して合計（成分も loss に入れる）
- 最終モデル: Transformer Encoder の各ブロックを「結合の MP + coupling エッジの MP → 3種類の MHA（ユークリッド距離のガウシアン / グラフ距離の埋め込み / 通常の scaled dot-product）→ FFN」で構成。d=650、10ブロック、10ヘッド
- fastai、one-cycle 100 epoch、max lr 5e-4、wd 1e-2。8-fold で -3.039。MPNN とブレンドして +0.05。1 fold あたり 2×V100 で約1.5日
- コード: https://github.com/robinniesert/kaggle-champs

### 7位 Pinkman Chemistry Lab — 行単位 NN + LGBM で残差補正
- LightGBM: type 別モデル、特徴量 500〜2000（2結合パスの角度、3結合パスの二面角、パス上の原子の近傍統計など）、num_leaves=1023。2JHH/3JHH は原子を入れ替えた行で、3J は複数ある3結合パスごとに行を複製し、予測を平均（+0.002）。単体で LB -2.1
- NN（Ahmet / outrunner）: 1行=1サンプル。全原子の「2原子からの距離・角度」などの相対位置特徴。**中間原子（2J の am、3J の am0/am1）からの距離**を足して円対称性の曖昧さを解消 → 大きく改善。logcosh 損失
- **LGBM で NN の残差を予測**（huber 損失、学習率を減衰）して +0.15

### 8位 4 GM and the brain — SchNet を大改造
- MPNN、GAT、CGCNN、SchNet、MEGNet、3DGNN を試し、SchNet をベースにした
- 改造: 結合種・角度のエッジ特徴、MEGNet 式のエッジ更新、DenseNet 風の接続、SE ブロック、分子レベル特徴、12 interaction block
- 学習: bs 64、Adam、**type 頻度の逆数で重み付けした LMAE**、周期200 epoch のコサイン、計1200 epoch（それでも学習不足）、10-fold GroupKFold
- 単体 ~-2.95、type 別に MAE 最小化でブレンドして -3.00

### 9位 Jaechang Lim — 原子種と距離だけ
- 全結合グラフの MPNN。ノード = 原子種、エッジ = 距離のみ
- 段階的な改善: 距離 one-hot → **SchNet の RBF**（-2.1）→ **エッジ更新ネットワーク**（-2.4）→ GRU 更新（-2.6）→ ハイパラ調整（-2.8）→ seed 10個（-2.98）
- 「最小限の入力でもアーキテクチャ次第で -3 近くまで届く」ことを示している

### 10位 — SchNet 2段 + median
- SchNet1: ノード（xyz、原子種、Mulliken）、エッジ（結合、角度、二面角）。4成分と J を予測（~-2.7）
- SchNet2: OOF で予測した4成分と J を他のエッジの特徴として追加（予測対象のエッジは除く）（-2.85）
- MAE なので中央値が重要。**分位点回帰（q=0.5）でブレンド**し、fold 平均にも median を使って効果があった

### 12位 Team Bird Brain — Cormorant（回転同変）
- arXiv:1906.04015 の Cormorant を、ペアに出力するよう改造。J1/J2/J3 で別ネットにし、その後 type 別に分けた
- Mulliken 電荷を特徴にして事前学習 → 途中で除去
- パラメータ ~250K（上位の約1/100）なのに -2.93。**他の解法との相関が低く**、メタアンサンブルで大きく寄与した

### 13位 KM（DeNA）— SchNet 改良の記録（スライドより）
- v1 SchNet ベースライン（CV -1.49）→ skip 接続（-1.85）→ GIN + グラフ距離 one-hot（-1.98）→ type 別 MLP（-2.08）→ 二面角などのペア特徴（-2.38）→ type 別 fine-tune + 2 seed（LB -2.73）→ 疑似ラベル（最終 -2.92）
- **注意点**: SchNetPerGraphDist は CV が良くなったのに LB が大きく悪化した → CV を過信しない

### 主催者の論文で分かったこと（Bratholm et al., PLoS ONE 2021）
- 賞金圏の5チームはすべて DNN。「座標・原子種・距離からペアの特徴ベクトルを作る encoder + type 別の feed-forward decoder」という形が共通
- 上位提出の正係数の線形結合（メタアンサンブル）は、最良単体を log スコアで **約0.2〜0.4 上回った**。上位6チームを除いた k=7 のメタアンサンブルでも1位を超えた → **多様性の価値が非常に大きい**
- 1位〜5位は互いに似た予測。12位の Cormorant だけ相関が低い

---

## 4. 上位に共通するポイント

1. **Transformer / self-attention が勝ち筋**。上位4チームはすべて attention 系。GNN（SchNet / MPNN / MEGNet）は改造しても単体で -2.9〜-3.0 程度
2. **attention に幾何情報を入れる方法が大事**: 距離バイアス（1位）、xyz を直接入れる（2位・3位）、角度・二面角のエッジ特徴（4位）
3. **type 別ヘッド + type 別 fine-tune**: ほぼ全チームが採用。1位はさらに 33サブタイプに分けた
4. **補助ターゲット（fc/sd/pso/dso、Mulliken）**: 3・6・10・14位では効いたが、2位では効かなかった。アーキテクチャ次第なので要検証
5. **対称性の扱い**: (i,j) 入れ替え拡張（2位・7位）、両方向の予測を平均（4位）
6. **長時間の学習とスケジュール**: 100〜1200 epoch、one-cycle / 線形減衰 / コサイン、SWA。8位は「1200 epoch でも学習不足」
7. **アンサンブルは median 系・type 別ブレンド**: 指標が MAE なので median が効く（1位・10位）。type 別の重み、Huber や LGBM でのスタッキング（5位）、残差 LGBM（7位）
8. **疑似ラベル**（3位・13位）は効くが、その後 train だけで追加学習しないと過学習する
9. **CV**: 分子単位の GroupKFold、もしくは大きめの holdout。CV と LB はよく一致する（例外は13位の事例）

---

## 5. 推奨する戦略

### 前提（手元の環境）
- 手元は Intel i5 MacBook、メモリ 8GB、**GPU なし** → 学習は Kaggle Notebook（GPU 週30時間程度）、Google Colab、クラウド GPU が前提
- 上位はチームで GPU 数十台を約1か月使っている。**現実的な目標**は、強い単体モデル1〜2系統 + 小規模アンサンブルで **-2.8〜-3.1**（金メダル圏 ≈ -2.9 前後）。Late Submission で Private スコアを確認できる

### フェーズ0: 土台（CPU で可）
- 評価関数（type 別 log-MAE）と、分子単位の GroupKFold（または 5,000〜10,000 分子の holdout）を最初に固定する
- 前処理: xyz2mol / RDKit（または OpenBabel）で結合・結合次数・環・混成を推定し、2J の角度と 3J の二面角を計算。メモリ 8GB なので float32 と parquet 保存で節約する
- 任意: type 別 LightGBM のベースライン（距離・角度・二面角・近傍統計）で -1.5〜-2.0 を確認。パイプラインの確認と type 別の誤差把握が目的。最終アンサンブルでは残差補正（7位方式）に再利用できる

### フェーズ1: メインモデル = 距離バイアス付き原子 Transformer（1位と2位のいいとこ取り）
- **トークン = 原子**（最大29、パディング + マスク）。1回の forward で分子内の全ペアを予測（2位のように source 原子ごとにコピーするより計算量が小さい）
- **入力**:
  - 原子: 原子種、結合数・混成・芳香族・環、（任意）OpenBabel / RDKit の部分電荷
  - ペア: 距離の RBF / Fourier 埋め込み、グラフ距離、結合種 → **attention のバイアス（またはペア表現）**として加える（1位の `−γD`、Graphormer 式）
- **ペアの readout**: [h_i, h_j, h_i⊙h_j, ペア埋め込み, 角度/二面角特徴] → type（またはサブタイプ）別の MLP
- **損失**: type 別 MAE（またはその log）の平均。少数 type の重みに注意。補助損失として fc/sd/pso/dso と Mulliken を ON/OFF で比較する
- **拡張**: (i,j) の入れ替え、xyz を使う場合はランダム回転、原子の cutout（1位で有効）
- **学習**: AdamW（または LAMB）、warmup + one-cycle / コサイン、100 epoch 以上、終盤 SWA、最後に type 別 fine-tune（特に 1JHC / 1JHN）
- 目標: 単体で CV -2.7〜-3.0

### フェーズ2: 多様性を足す
- 2系統目: 4位方式の **エッジ（2J/3J）中心 Graph Attention**（2080Ti 1枚で4位なので計算効率が良い）か、MEGNet / SchNet 改良版
- 余力があれば、**回転同変モデル**（12位の Cormorant の後継である PaiNN / NequIP / MACE / Equiformer 系）。2019年当時は未成熟だったが、12位の結果とメタアンサンブル分析から「相関の低さ」が大きな価値になる。※このコンペでの実績は自分たちで検証する必要がある
- seed / fold / チェックポイントの多様化

### フェーズ3: 仕上げ
- type 別ブレンド（median、正係数の線形結合、HuberRegressor）、LGBM での残差補正
- 疑似ラベル: 疑似ラベル付き test を足して学習 → train だけで追加学習（3位方式）

### 優先順位（費用対効果）
1. 評価・CV・前処理の土台
2. 距離バイアス付き Transformer の単体性能を上げ切る（効果は最大）
3. type 別 fine-tune + SWA
4. 2系統目のモデルと type 別ブレンド
5. 疑似ラベル、残差 LGBM

---

## 参考リンク
- 1位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/hybrid-1-solution-hybrid ／ code: https://github.com/boschresearch/BCAI_kaggle_CHAMPS
- 2位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/quantum-uncertainty-2-solution-quantum-uncertainty ／ code: https://github.com/antorsae/champs-scalar-coupling
- 3位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/ka-kr-solve-chem-together-3rd-solution-bert-in-che
- 4位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/hyperspatial-engineers-4-solution-hyperspatial-eng
- 5位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/dl-guys-5th-place-solution-dl-guys
- 6位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/robin-n-6th-place-solution ／ code: https://github.com/robinniesert/kaggle-champs
- 7位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/pinkman-chemistry-lab-solution-7th-cpmp-view
- 8位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/4-gm-and-the-brain-8th-place-solution-a-densely-co
- 9位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/jaechang-lim-9-solution-model-with-only-atom-type-
- 10位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/khavo-zidmie-josh-kyle-akira-10th-place-solution
- 12位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/team-bird-brain-12-place-solution
- 13位（スライド）: https://www.slideshare.net/KazukiFujikawa/kaggle-champs-predicting-molecular-properties
- 14位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/squid-14th-place-solution-gcn-from-scratch-in-kagg
- 15位: https://www.kaggle.com/competitions/champs-scalar-coupling/writeups/bra-ket-15th-place-solution
- 19位: https://github.com/toshi-k/kaggle-champs-scalar-coupling
- 上位解法のコードの集約: https://github.com/larsbratholm/champs_kaggle
- 主催者論文: https://pmc.ncbi.nlm.nih.gov/articles/PMC8291653/ （arXiv:2008.05994）
- ルール改定（QM9 使用可）: https://www.kaggle.com/competitions/champs-scalar-coupling/discussion/95496
