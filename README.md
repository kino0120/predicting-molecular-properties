# Predicting Molecular Properties（CHAMPS Scalar Coupling）

Kaggle「[Predicting Molecular Properties](https://www.kaggle.com/competitions/champs-scalar-coupling)」（2019）を、事前学習済みの 3D 分子モデル [Uni-Mol](https://github.com/deepmodeling/Uni-Mol) の fine-tune で解いた振り返りです。

| モデル | 検証 | Public | Private |
|---|---|---|---|
| Uni-Mol fine-tune（基本の設定） | -2.385 | -2.382 | -2.372 |
| 上記 ＋ 覚え込み対策ありのモデルを 7:3 で平均 | -2.438 | -2.436 | -2.424 |
| 上記 ＋ 原子の補助ターゲットありのモデル、3 本を 0.5 / 0.1 / 0.4 で平均 | -2.511 | -2.507 | **-2.497** |

（Late Submission。当時の最終 LB なら 33 位前後）

## 中身
- `notes/` … 調査と方針のメモ
  - `01_competition_research.md` コンペ概要・上位解法の調査
  - `02_data_overview.md` データの解説（J、1JHC の読み方など）
  - `03_reference_notebooks_and_lgb.md` 公開ノートブックの比較、LightGBM の到達点
  - `04_unimol_plan.md` Uni-Mol を選んだ理由・実装のポイント・実験記録
- `notebooks/`
  - `01_eda` … 上位解法で効いていた要素（距離・混成・角度・二面角など）の検証
  - `00_colab_check` … Colab（VS Code の Colab 拡張）の接続確認
  - `02_unimol_train` … Uni-Mol の fine-tune（前処理・学習・予測・提出ファイル作成）
  - `03_unimol_atom_aux` … 上記の基本の設定に、原子の補助ターゲット（Mulliken 電荷・等方遮蔽）を足したもの
  - `.py` が編集用の元ファイル、`.ipynb` はそこから生成したもの
- `slides/` … 勉強会用スライド（`champs_unimol.pptx`）と生成スクリプト `build.js`

## 含めていないもの
- コンペのデータ（Kaggle のルールで再配布禁止）。コンペのページから取得してください。
  - 注意: 今 Kaggle API でダウンロードできるファイルは、提出の採点に使われる版と違います（test が 352 行少ない）。提出に必要な行数は 2,505,542 行です。
- Uni-Mol の重み（[dptech/Uni-Mol-Models](https://huggingface.co/dptech/Uni-Mol-Models) の `mol_pre_all_h_220816.pt` と `mol.dict.txt`）
- 前処理のキャッシュ、学習済みモデル

## 実行環境
- 学習: Google Colab（A100）を VS Code の Colab 拡張から使用。データ・重み・結果は Google Drive に置く
- Uni-Mol の本体は [unimol_tools](https://github.com/deepmodeling/Uni-Mol/tree/main/unimol_tools) 0.1.6 から import（J を出す部分と学習ループは自前）。v1〜v3 は本体を自前で移植した版で学習した
- 動作確認・EDA: ローカル（Python 3.10、PyTorch 2.2 CPU、numpy / pandas / matplotlib / rdkit）
