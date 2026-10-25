# 上位チームの公開ノートブックと LightGBM の到達点

作成日: 2026-10-25
関連: [01_competition_research.md](01_competition_research.md)、[02_data_overview.md](02_data_overview.md)、EDA は [../notebooks/01_eda.ipynb](../notebooks/01_eda.ipynb)

---

## 1. 上位チームの公開物の全体像

### 最終解法のコード（解法を再現するためのもの。EDA は含まない）

| 順位 | 公開先 | 中身 |
|---|---|---|
| 1位 | GitHub boschresearch/BCAI_kaggle_CHAMPS | 前処理・学習・予測のコード |
| 2位 | GitHub antorsae/champs-scalar-coupling | 学習用ノートブック（transformer-experiments.ipynb など） |
| 3〜5位 | 主催者のリポジトリ larsbratholm/champs_kaggle/solutions | 学習スクリプト・ノートブック |
| 6位 | GitHub robinniesert/kaggle-champs + Kaggle Notebook | Kaggle 版は小モデル15エポックで -2.37 |
| 10位 | Kaggle Notebook ×2 | GCN 版、SchNet の軽量版 |
| 14位 | Kaggle Notebook | Kaggle 上で学習した GCN |
| 19位 | GitHub toshi-k | GNN のコード |

### コンペ期間中に上位メンバーが公開したノートブック（Code タブで票の多い順）

| 作者（最終順位） | ノートブック |
|---|---|
| artgor（8位チーム） | Molecular Properties EDA and models（1,291票、このコンペで最多） |
| artgor（8位チーム） | Using meta-features to improve model |
| artgor（8位チーム） | Brute force feature engineering |
| borisdee（8位チーム） | How to: easy visualization of molecules |
| borisdee（8位チーム） | Predicting Mulliken charges with ACSF descriptors |
| CPMP（7位） | Ultra fast distance matrix computation |
| toshik（19位） | SchNet starter kit |
| fnands（20位） | 1-MPNN |

このうち3本をダウンロードして読んだ（`references/kaggle_notebooks/`。他人のコードなので実行はしていない）。

---

## 2. 読んだ3本の内容

### 2-1. artgor「Molecular Properties EDA and models」（2019年7月ごろ）

| 節 | 内容 | 結論・結果 |
|---|---|---|
| 概観 | 行数・分子数・原子の種類・type の数 | train 465万行・8.5万分子、test 250万行・4.6万分子 |
| 分布 | atom_index の出現回数、type の件数、J のヒストグラム、type 別の J のバイオリン図 | 「J は type ごとに大きく違うので、type 別にモデルを作るとよさそう」 |
| ネットワーク図 | type ごとに atom_index_0 と atom_index_1 の組を全分子分まとめてグラフにする（化学結合ではない） | 「type ごとに形が違う」 |
| 特徴量 | 距離、x/y/z 方向の差の2乗、type を「結合数」と「原子ペア」に分解、type 平均に対する距離の比、分子内の type 別平均距離 | 距離の分布も type ごとに違う |
| モデル | 全 type をまとめた LightGBM 1本（行単位の 5-fold） | **CV 0.365、LB 0.292** |
| 確認 | type 別に、予測値と正解の散布図 | type によって予測の良し悪しが違う |

### 2-2. artgor「Using meta-features to improve model」（2019年6月）
- **EDA**: fc と J の散布図（本人も「驚くほどの相関」）、距離と J の散布図、LightGBM で重要だった特徴量（H から見た距離の最大・平均・標準偏差など）の散布図
- **特徴量**: 分子・原子ごとに距離を集計した約50個（最大・最小・平均・標準偏差と、その差や比）
- **メタ特徴量**: まず fc を LightGBM で予測し、その OOF 予測を J のモデルの特徴量に足す。train にしかない情報を test で使うための工夫で、10位の SchNet 2段階方式と同じ発想
- type 別モデルも試している
- CV は行単位の 3-fold

### 2-3. borisdee「Predicting Mulliken charges with ACSF descriptors」
- 発想: Mulliken 電荷などは train にしかないので、構造から予測して test でも特徴量として使う
- 原子の周りの環境を、**回転・並進・原子の並び順で変わらない数値（ACSF）**で表す。距離の関数（G1, G2）と角度の関数（G4）を合わせて、1原子あたり245個（カットオフ 10Å）
- ExtraTrees で Mulliken 電荷を予測し、**MAE 約0.01**。予測した test の電荷を公開
- 分割は原子単位（分子単位ではない）なので、検証の MAE は少し甘い可能性あり

---

## 3. 今回の EDA との比較

| 観点 | artgor の EDA | 今回の EDA（01_eda.ipynb） |
|---|---|---|
| type 別の分布・スケール | ◎ バイオリン図 | ◎ ヒストグラム + 統計表 + 基準スコア |
| 距離 | ◎ 分布を見る | ◎ 距離と J の関係 + 効果を数値化 |
| 結合のグラフ | △ 原子番号の組を全分子まとめた図（化学結合ではない） | ◎ 分子ごとに実際の結合を判定（RDKit と99.96%一致） |
| サブタイプ（結合数・混成） | ✕ | ◎ |
| 2J の角度・3J の二面角 | ✕ | ◎ Karplus 曲線まで確認 |
| 経路上の原子 | ✕ | ◎ |
| 結合次数 | ✕ | ○ RDKit で一部の分子 |
| 電荷・遮蔽・4成分 | ✕（4成分は meta-features のノートブックで扱っている） | ◎ |
| 対称性 | ✕ | ◎ |
| CV の分け方 | 行単位の KFold（同じ分子が学習側と検証側の両方に入る） | 分子単位 |
| 効き具合の確認方法 | LightGBM の結果と特徴量重要度 | 中央値予測で数値化（モデルなし） |

**分かったこと**
1. 共通の結論: 「type ごとに J がまったく違う」「距離が大事」
2. 後に上位解法で効いた要素（角度・二面角・経路上の原子・混成）は、このノートブックには入っていない
3. artgor の LightGBM（LB 0.292）と、今回のモデルなしの中央値予測（経路サブタイプ + 角度・二面角 + 距離で 0.277）が同程度。評価方法が違うので厳密な比較ではないが、上位解法の要素は距離の集計特徴量より情報が多いと言えそう
4. 注意点:
   - x/y/z 方向の差の2乗は、分子を回転させると値が変わる。上位は回転で変わらない量（距離・角度）を使うか、座標をそのまま入れて回転のデータ拡張で学ばせていた（2位・3位）
   - 行単位の KFold はスコアが甘く出る。分子単位で分けるのが正解

---

## 4. LightGBM（勾配ブースティング木）の到達点

| 出典 | 内容 | スコア |
|---|---|---|
| 7位 CPMP の解法記事 | type 別の LightGBM、特徴量は type ごとに500〜2000個（2結合経路の角度、3結合経路の二面角、経路上の原子からの1〜3結合経路の数・角度・距離の集計など）、num_leaves=1023、対称な行と複数経路の行を複製して平均 | **LB -2.1**（全 fold） |
| 8位の解法記事 | GNN 担当が合流する前のチームの LightGBM（特徴量づくり済み） | **約 -2.0** |
| 37位 chimps の解法記事 | LightGBM のアンサンブル（ACSF、Sergii の距離特徴量、fc の OOF 予測など） | **-2.1 弱** |
| 39位 Shuhao Cao の議論（106328） | LightGBM + ACSF 特徴量（1JHN で特徴量を選別） | **Private -2.0** |
| 公開カーネル | 距離の特徴量だけ（Sergii） | -1.48 |
| 公開カーネル | artgor の EDA | +0.29 |

**まとめ**
- LightGBM の上限は、特徴量を数百〜数千作り込んで **-2.0〜-2.1 程度**。最終 LB では49位が -2.28 なので、それより下の順位
- 同じチームの NN / GNN は -2.6〜-3.0 以上に達していた（7位: NN で -2.64 → -2.99、8位: GNN 単体で約 -2.95）
- 39位の Shuhao Cao の分析（議論 103902）: GNN は「局所的な結合の形が同じなら同じ予測」になるが、木モデルにはこの性質がない。トポロジーの特徴量を足して補うしかない
- ただし LightGBM は**最終アンサンブルの部品としては有効**だった
  - 7位: NN の**残差を LightGBM で学習**して +0.15
  - 5位: 2段目のスタッキングに LGBM を使用
  - 37位: fc の OOF 予測を特徴量に足すと約 -0.4 改善

---

## 5. 決定: LightGBM は使わない（2026-10-25）

「難しいモデルの前に、LightGBM で行けるところまで」という案を検討したうえで、**LightGBM はやめて Transformer（2位方式）に集中する**ことにした。

**理由**
- 上限が -2.0〜-2.1 で、同じチームの NN（-2.6〜-3.0）と約0.9の差がある
- その上限に届くには特徴量を数百〜数千作り込む必要があり、上位チームでも数週間かかっている
- 作り込んだ特徴量の大半は、座標から自分で学ぶ Transformer（2位方式）では使わない
- 手元の Mac（メモリ 8GB）では、3JHC（151万行）に数百個の特徴量を付けるとメモリが足りない可能性がある

**捨てずに残しておく選択肢**
- 余裕があれば、最後に NN の残差を LightGBM で補正する（7位方式、+0.15）
- CV・評価・提出の土台は、LightGBM なしで Transformer のパイプラインの中で作る
