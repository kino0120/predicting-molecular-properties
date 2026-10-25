// 勉強会スライド「CHAMPS Scalar Coupling に Uni-Mol で挑んでみた」を作る
//   cd slides && node build.js   → champs_unimol.pptx
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(path.join(process.env.HOME,
  ".claude/skills/synced/680910f4-8469-44f7-b14e-ecb4996ea3bd_df5a3606-0b3b-435e-a2a6-d7c4331e1d7f/pptx/scripts/apply_theme.js"));

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "champs_unimol.pptx");
const FONT = "Yu Gothic";

const THEME = {
  name: "CHAMPS Uni-Mol",
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: {
    dk1: "1B2A2F", lt1: "FFFFFF", dk2: "17424A", lt2: "EAF2F1",
    accent1: "1F7A78", accent2: "E8833A", accent3: "5B7DA8", accent4: "B5446E",
    accent5: "9DB9B0", accent6: "F2C14E", hlink: "1F7A78", folHlink: "5B7DA8",
  },
};
const HEX = THEME.colors;

// ---------- データ ----------
function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], Number(v)])));
}
const hist = readCsv(path.join(ROOT, "drive/runs/unimol_v2/history.csv"));
const hist3 = readCsv(path.join(ROOT, "drive/runs/unimol_v3/history.csv"));

// ---------- プレゼンテーション ----------
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
pres.title = "CHAMPS Scalar Coupling に Uni-Mol で挑んでみた";
pres.subject = "Kaggle Predicting Molecular Properties の振り返り（勉強会）";
const C = pres.SchemeColor;
const W = 13.333;
const MX = 0.6; // 左右の余白

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.2, w: 8.4, h: 1.9, fontSize: 40, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 4.35, w: 8.4, h: 1.0, fontSize: 18, color: HEX.accent5, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.35, w: W - 2 * MX, h: 0.85, fontSize: 32, bold: true, color: C.text2, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "CHAMPS × Uni-Mol", options: { x: MX, y: 7.0, w: 4, h: 0.3, fontSize: 10, color: HEX.accent5, margin: 0 } } },
  ],
  slideNumber: { x: W - MX - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.accent5, align: "right" },
});
pres.defineSlideMaster({
  title: "CLOSING_DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.35, w: W - 2 * MX, h: 0.85, fontSize: 32, bold: true, color: C.background1, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: W - MX - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.accent5, align: "right" },
});

// ---------- 部品 ----------
let objId = 0;
const nm = (s) => `${s}_${++objId}`;

function text(slide, t, o) {
  slide.addText(t, { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, valign: "top", objectName: nm("text"), ...o });
}
// モチーフ: 原子に見立てた丸（番号や記号入り）
function atom(slide, x, y, d, label, fill, o = {}) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0.75 }, objectName: nm("atom") });
  if (label) slide.addText(label, { x, y, w: d, h: d, isTextBox: true, margin: 0, align: "center", valign: "middle", fontSize: o.fontSize || 16, bold: true, color: o.color || C.background1, objectName: nm("atomLabel") });
}
function card(slide, x, y, w, h, fill = C.background2) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill, width: 0.75 }, objectName: nm("card") });
}
function bullets(items, size = 16, color = C.text1) {
  return items.map((s, i) => ({ text: s, options: { bullet: true, breakLine: i < items.length - 1, fontSize: size, color, paraSpaceAfter: 6 } }));
}
function bond(slide, x1, y, x2, color = HEX.accent5) {
  slide.addShape(pres.ShapeType.line, { x: x1, y, w: x2 - x1, h: 0, line: { color, width: 2.5 }, objectName: nm("bond") });
}
function arrow(slide, x, y, w, h = 0, color = HEX.accent5) {
  const up = h < 0;
  slide.addShape(pres.ShapeType.line, { x, y: up ? y + h : y, w, h: Math.abs(h), flipV: up, line: { color, width: 2, endArrowType: "triangle" }, objectName: nm("arrow") });
}
function box(slide, x, y, w, h, label, o = {}) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.1, fill: { color: o.fill || C.background2 }, line: { color: o.line || o.fill || HEX.lt2, width: 1 }, objectName: nm("box") });
  slide.addText(label, { x: x + 0.12, y, w: w - 0.24, h, isTextBox: true, margin: 0, align: o.align || "center", valign: "middle", fontSize: o.fontSize || 14, bold: !!o.bold, color: o.color || C.text1, objectName: nm("boxText") });
}
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt", legendFontFace: "+mn-lt",
  catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, titleFontSize: 14, titleColor: HEX.dk2 };

// =====================================================================
pres.addSection({ title: "導入" });

// 1. 表紙
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "導入" });
  s.addText("CHAMPS Scalar Coupling に\nUni-Mol で挑んでみた", { placeholder: "title" });
  s.addText("Kaggle「Predicting Molecular Properties」（2019）の振り返り", { placeholder: "body" });
  // 分子の飾り（H─C─C─H と枝の H）
  // 結合（線）を先に描き、原子（丸）を上に重ねる。上の 2 つの H は H─C─C─H（3JHH）
  const cy = 3.3;
  bond(s, 9.55, cy, 12.3, HEX.accent5);
  [10.3, 11.5].forEach((x) => s.addShape(pres.ShapeType.line, { x, y: 2.35, w: 0, h: 2.1, line: { color: HEX.accent5, width: 2.5 }, objectName: nm("bond") }));
  atom(s, 9.3, cy - 0.25, 0.5, "H", HEX.lt1, { color: C.text2 });
  atom(s, 9.95, cy - 0.35, 0.7, "C", HEX.accent1);
  atom(s, 11.15, cy - 0.35, 0.7, "C", HEX.accent1);
  atom(s, 12.05, cy - 0.25, 0.5, "H", HEX.lt1, { color: C.text2 });
  atom(s, 10.05, 2.1, 0.5, "H", HEX.accent2);
  atom(s, 11.25, 2.1, 0.5, "H", HEX.accent2);
  atom(s, 10.05, 4.2, 0.5, "H", HEX.lt1, { color: C.text2 });
  atom(s, 11.25, 4.2, 0.5, "H", HEX.lt1, { color: C.text2 });
  text(s, "3JHH", { x: 10.15, y: 1.55, w: 1.25, h: 0.4, fontSize: 14, color: HEX.accent6, align: "center", bold: true });
  s.addNotes("勉強会用の振り返りです。2019年の Kaggle コンペ「Predicting Molecular Properties」（CHAMPS）を、事前学習済みの 3D 分子モデル Uni-Mol で解いてみた話をします。");
}

// 2. 今日の話
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "導入" });
  s.addText("今日の話", { placeholder: "title" });
  const steps = [
    ["上位解法を調べる", "上位は何で勝ったか"],
    ["方針を立てる", "シンプル・Transformer・Colab Pro 1か月"],
    ["EDA で裏を取る", "上位が効くと言った要素は本当に効くか"],
    ["Uni-Mol を選んで作る", "なぜ Uni-Mol か、中身、特徴量"],
    ["結果と次の一手", "LB のスコアと課題"],
  ];
  steps.forEach(([h, sub], i) => {
    const y = 1.55 + i * 1.0;
    atom(s, MX, y, 0.62, String(i + 1), i === 3 ? HEX.accent2 : HEX.accent1, { fontSize: 18 });
    if (i < steps.length - 1) s.addShape(pres.ShapeType.line, { x: MX + 0.31, y: y + 0.62, w: 0, h: 0.38, line: { color: HEX.accent5, width: 2 }, objectName: nm("bond") });
    text(s, h, { x: MX + 0.85, y: y + 0.02, w: 5.6, h: 0.34, fontSize: 18, bold: true, color: C.text2 });
    text(s, sub, { x: MX + 0.85, y: y + 0.36, w: 5.6, h: 0.3, fontSize: 14, color: HEX.accent3 });
  });
  card(s, 7.4, 1.55, 5.33, 4.65, C.text2);
  text(s, "結果（Late Submission）", { x: 7.8, y: 1.85, w: 4.6, h: 0.4, fontSize: 16, color: HEX.accent5 });
  text(s, "-2.424", { x: 7.8, y: 2.3, w: 4.6, h: 1.2, fontSize: 66, bold: true, color: HEX.accent6 });
  text(s, "Private LB", { x: 7.8, y: 3.5, w: 4.6, h: 0.35, fontSize: 16, color: HEX.lt1 });
  text(s, bullets(["最終 LB なら 38 位前後（2,749 チーム中、銀メダル圏）", "Public -2.436", "Uni-Mol の fine-tune 2 本を 7:3 で平均（1 本 A100 で約 1 時間強）"], 14, HEX.lt1),
    { x: 7.8, y: 4.1, w: 4.6, h: 1.9 });
  s.addNotes("流れは5つです。結論を先に言うと、Uni-Mol を fine-tune したモデル2本の平均で Private -2.424、当時の最終順位なら38位前後でした。1本だけだと -2.372（42位前後）です。");
}

// 3. 何を予測するコンペ？
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "導入" });
  s.addText("何を予測するコンペ？", { placeholder: "title" });
  text(s, [
    { text: "分子の中の 2 つの原子核が、結合の電子を介して及ぼし合う磁気的な相互作用の強さ", options: { breakLine: true } },
    { text: "＝ スカラーカップリング定数 J（Hz）", options: { bold: true, color: C.accent1, breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "NMR で観測される値。DFT で計算すると重いので、3D 構造から ML で一瞬で予測したい", options: {} },
  ], { x: MX, y: 1.5, w: 5.9, h: 2.2, fontSize: 18 });
  // 読み方の図
  text(s, "「1JHC」の読み方：数字 = 間にある結合の本数", { x: 7.1, y: 1.5, w: 5.6, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  const rows = [["1JHC", ["H", "C"]], ["2JHC", ["H", "C", "C"]], ["3JHC", ["H", "C", "C", "C"]]];
  rows.forEach(([lab, chain], r) => {
    const y = 2.15 + r * 0.72;
    text(s, lab, { x: 7.1, y: y + 0.08, w: 1.0, h: 0.4, fontSize: 16, bold: true, color: C.accent2 });
    const x0 = 8.3;
    bond(s, x0 + 0.25, y + 0.25, x0 + 0.25 + (chain.length - 1) * 0.9);
    chain.forEach((a, k) => {
      const end = k === 0 || k === chain.length - 1;
      atom(s, x0 + k * 0.9, y, 0.5, a, end ? HEX.accent2 : (a === "H" ? HEX.lt2 : HEX.accent1), { color: end ? HEX.lt1 : (a === "H" ? C.text2 : HEX.lt1), fontSize: 14 });
    });
  });
  text(s, "二重結合でも経路の中では「1 本」と数える", { x: 7.1, y: 4.35, w: 5.6, h: 0.35, fontSize: 14, color: HEX.accent3 });
  card(s, MX, 5.0, W - 2 * MX, 1.6);
  text(s, "評価指標", { x: MX + 0.3, y: 5.2, w: 2.0, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  text(s, "type 別の log(MAE) の平均（type は 8 種類：1JHC 1JHN 2JHC 2JHH 2JHN 3JHC 3JHH 3JHN）", { x: MX + 0.3, y: 5.65, w: 11.5, h: 0.4, fontSize: 16 });
  text(s, "→ 件数の少ない 1JHN（4 万件）も、多い 3JHC（151 万件）と同じ重み。値の大きさが違う type も公平に評価される", { x: MX + 0.3, y: 6.05, w: 11.5, h: 0.4, fontSize: 14, color: HEX.accent3 });
  s.addNotes("J は NMR で測れる量で、DFT で計算すると重い。8種類の type があり、指標は type 別の log(MAE) の平均。件数が少ない type も同じ重みで効くのがポイントです。");
}

// 4. データ
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "導入" });
  s.addText("使えるのは原子と座標だけ", { placeholder: "title" });
  const colW = (W - 2 * MX - 0.4) / 2;
  card(s, MX, 1.5, colW, 3.6, C.background2);
  card(s, MX + colW + 0.4, 1.5, colW, 3.6, "F6EDE5");
  text(s, "train / test 共通（入力に使える）", { x: MX + 0.3, y: 1.75, w: colW - 0.6, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
  text(s, bullets(["structures.csv：原子の種類と xyz 座標（13 万分子、1 分子は最大 29 原子）", "train.csv / test.csv：原子ペアと type（train 466 万ペア / test 251 万ペア）", "train と test は分子単位で分かれている → CV も分子単位で"], 16),
    { x: MX + 0.3, y: 2.3, w: colW - 0.6, h: 2.6 });
  const x2 = MX + colW + 0.7;
  text(s, "train だけ（入力には使えない）", { x: x2, y: 1.75, w: colW - 0.6, h: 0.4, fontSize: 18, bold: true, color: C.accent2 });
  text(s, bullets(["J の 4 成分 fc / sd / pso / dso（合計 = J、ほぼ fc）", "Mulliken 電荷、磁気遮蔽テンソル", "双極子モーメント、ポテンシャルエネルギー", "→ 補助ターゲットや中間予測としてなら使える"], 16),
    { x: x2, y: 2.3, w: colW - 0.6, h: 2.6 });
  atom(s, MX, 5.55, 0.62, "!", HEX.accent2, { fontSize: 22 });
  text(s, "結合・二重結合・角度・二面角はデータに書かれていない", { x: MX + 0.85, y: 5.5, w: 11, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
  text(s, "座標から自分で計算するか、モデルに学ばせるしかない", { x: MX + 0.85, y: 5.92, w: 11, h: 0.4, fontSize: 16, color: HEX.accent3 });
  s.addNotes("入力に使えるのは原子の種類と座標、どのペアか、type だけ。4成分や電荷は train にしかないので、使うなら補助ターゲット。結合や角度は自分で計算するか、モデルに学ばせる必要があります。");
}

// =====================================================================
pres.addSection({ title: "調査と方針" });

// 5. 上位解法
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "調査と方針" });
  s.addText("上位解法を調べた", { placeholder: "title" });
  const head = ["順位", "Private", "モデル", "ポイント"].map((t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 } } }));
  const data = [
    ["1", "-3.240", "Soft Graph Transformer", "原子・ペア・3 原子組をノードに。距離で attention を補正"],
    ["2", "-3.223", "Transformer", "入力は座標・原子種・type だけ。単体 -3.16 で最強"],
    ["3", "-3.195", "BERT（ペアが 1 トークン）", "4 成分を補助ターゲットに。疑似ラベル"],
    ["4", "-3.181", "グラフ attention", "2J/3J の辺に角度・二面角。GPU 1 枚"],
    ["5", "-3.150", "MEGNet 系 GNN", "辺どうしの角度を畳み込む。スタッキング"],
    ["6", "-3.045", "MPNN + Transformer", "距離・グラフ距離など 3 種の attention"],
    ["7", "-3.033", "NN + LightGBM", "NN の残差を LightGBM で補正"],
    ["8", "-3.002", "SchNet 改造", "1200 エポックでも学習不足"],
    ["9", "-2.974", "MPNN", "原子種と距離だけ"],
    ["12", "-2.933", "Cormorant（回転同変）", "他と似ておらず、アンサンブルで効く"],
  ];
  const rows = [head, ...data.map((r, i) => r.map((t, k) => ({ text: t, options: { fill: { color: i % 2 ? HEX.lt1 : HEX.lt2 }, bold: k === 2, color: k === 1 ? HEX.accent1 : HEX.dk1 } })))];
  s.addTable(rows, { x: MX, y: 1.45, w: W - 2 * MX, colW: [0.75, 1.15, 3.6, W - 2 * MX - 5.5], fontSize: 13, rowH: 0.43, valign: "middle",
    border: { type: "solid", color: HEX.lt1, pt: 1 }, margin: [0.04, 0.1, 0.04, 0.1], objectName: nm("table") });
  text(s, "出典：各チームの解法記事（Kaggle Writeups）、主催者の論文 Bratholm et al., PLoS ONE 2021", { x: MX, y: 6.4, w: 11, h: 0.3, fontSize: 11, color: HEX.accent3 });
  s.addNotes("上位10チームの解法です。上位4チームはすべて attention 系。2位は座標と原子種と type だけを Transformer に入れて、単体モデルで -3.16 を出しています。");
}

// 6. 共通点
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "調査と方針" });
  s.addText("上位の共通点は 3 つ", { placeholder: "title" });
  const items = [
    ["Transformer / attention が勝ち筋", ["上位 4 チームはすべて attention 系", "GNN（SchNet / MPNN）は改造しても単体 -2.9〜-3.0", "LightGBM は作り込んでも -2.0〜-2.1"]],
    ["幾何の入れ方が鍵", ["距離で attention を補正（1 位）", "座標をそのまま入れる（2・3 位）", "角度・二面角を辺の特徴に（4 位）"]],
    ["type 別の出力と長い学習", ["type 別の出力層、type 別の fine-tune", "1 位は 8 type を 33 のサブタイプに", "100〜1200 エポック回すのが普通"]],
  ];
  const cw = (W - 2 * MX - 2 * 0.4) / 3;
  items.forEach(([h, bs], i) => {
    const x = MX + i * (cw + 0.4);
    card(s, x, 1.55, cw, 4.75);
    atom(s, x + 0.35, 1.85, 0.7, String(i + 1), i === 1 ? HEX.accent2 : HEX.accent1, { fontSize: 20 });
    text(s, h, { x: x + 0.35, y: 2.75, w: cw - 0.7, h: 0.9, fontSize: 20, bold: true, color: C.text2 });
    text(s, bullets(bs, 15), { x: x + 0.35, y: 3.75, w: cw - 0.7, h: 2.4 });
  });
  s.addNotes("共通点は3つ。attention 系が強い、距離や角度などの幾何情報をどう入れるかが鍵、type 別の出力と長い学習。特に2つ目が、あとの EDA と Uni-Mol の話につながります。");
}

// 7. 最初の方針
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "調査と方針" });
  s.addText("最初の方針：2 位方式をベースに", { placeholder: "title" });
  text(s, "条件", { x: MX, y: 1.55, w: 3, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
  ["シンプルなモデル", "Transformer を使いたい", "Colab Pro 1 か月（A100 で約 8〜18 時間）"].forEach((t, i) => {
    box(s, MX, 2.1 + i * 0.75, 4.3, 0.58, t, { fontSize: 15, bold: true, color: C.text2 });
  });
  arrow(s, MX + 4.55, 3.0, 0.8, 0, HEX.accent1);
  card(s, 6.2, 1.55, 6.53, 2.5, C.background2);
  text(s, "2 位（Quantum Uncertainty）の方式", { x: 6.5, y: 1.8, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
  text(s, bullets(["入力は座標・原子種・type だけ。結合の推定も特徴量づくりもいらない", "化学の知識なしで、単体モデルとして全チーム最強（-3.16）"], 16), { x: 6.5, y: 2.35, w: 6, h: 1.6 });
  card(s, 6.2, 4.35, 6.53, 1.95, "F6EDE5");
  text(s, "ただし…", { x: 6.5, y: 4.55, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.accent2 });
  text(s, bullets(["2 位は GPU 十数台で数週間。同じ予算はない", "→ まず EDA で「何が効くか」を自分で確かめる"], 16), { x: 6.5, y: 5.05, w: 6, h: 1.2 });
  s.addNotes("条件はシンプル・Transformer・Colab Pro 1か月。最初は2位方式をベースに考えましたが、2位は計算資源が桁違い。そこで、まず EDA で何が効くのかを確かめることにしました。");
}

// =====================================================================
pres.addSection({ title: "EDA" });

// 8. EDA: 本当に効く？
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "EDA" });
  s.addText("EDA：上位の言うことは本当か", { placeholder: "title" });
  text(s, "1JHC は C の結合の仕方で大きく変わる", { x: MX, y: 1.45, w: 5.6, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  s.addChart(pres.ChartType.bar, [{ name: "1JHC の中央値 [Hz]", labels: ["単結合だけ (sp3)", "二重結合 (sp2)", "三重結合 (sp)"], values: [87.4, 128.9, 196.6] }], {
    x: MX, y: 1.9, w: 5.6, h: 3.9, barDir: "col", chartColors: [HEX.accent1], showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.dk1, dataLabelFontSize: 13,
    dataLabelFormatCode: "0.0", valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 230, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 60, ...chartText,
    showTitle: true, title: "1JHC の中央値 [Hz]（train 先頭 15 万件）", objectName: nm("chart"),
  });
  text(s, "3JHH は二面角で Karplus 曲線。中間の原子で曲線の形も変わる", { x: 6.6, y: 1.45, w: 6.1, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  s.addImage({ path: path.join(ROOT, "notebooks/figs/06_karplus_by_path.png"), x: 6.6, y: 1.95, w: 6.1, h: 6.1 * 392 / 712, objectName: nm("karplus") });
  atom(s, MX, 6.0, 0.55, "◎", HEX.accent1, { fontSize: 18 });
  text(s, "距離・混成（結合の数）・角度・二面角・経路上の原子は、どれもデータで裏付けあり", { x: MX + 0.75, y: 6.06, w: 11.5, h: 0.45, fontSize: 17, bold: true, color: C.text2 });
  s.addNotes("上位が効いたと言っていた要素をデータで確認。1JHC は C の混成で 87→129→197Hz と大きく変わる。3JHH は二面角でいわゆる Karplus 曲線が出て、中間の原子によって形も変わります。結合は距離から判定しましたが、RDKit と 99.96% の分子で一致しました。");
}

// 9. EDA: どれくらい効く？
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "EDA" });
  s.addText("EDA：どれくらい効く？", { placeholder: "title" });
  const labels = ["type のみ", "経路サブタイプ", "距離", "角度・二面角", "経路サブタイプ＋角度・二面角", "＋距離"];
  const values = [1.186, 0.962, 0.788, 0.714, 0.416, 0.277];
  s.addChart(pres.ChartType.bar, [{ name: "score", labels: labels.slice().reverse(), values: values.slice().reverse() }], {
    x: MX, y: 1.45, w: 7.4, h: 4.9, barDir: "bar", chartColors: [HEX.accent2, HEX.accent1, HEX.accent5, HEX.accent5, HEX.accent5, HEX.accent5],  // 並びは下から：＋距離, 経路＋角度, …
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.dk1, dataLabelFontSize: 13, dataLabelFormatCode: "0.00",
    valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 1.4, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 45, ...chartText,
    showTitle: true, title: "モデルなし（グループごとの中央値で予測）の score　※低いほど良い", objectName: nm("chart"),
  });
  card(s, 8.4, 1.45, 4.33, 4.9, C.text2);
  text(s, "1.19 → 0.28", { x: 8.75, y: 1.8, w: 3.8, h: 0.9, fontSize: 40, bold: true, color: HEX.accent6 });
  text(s, "要素を組み合わせると、モデルなしでもここまで下がる", { x: 8.75, y: 2.75, w: 3.7, h: 0.8, fontSize: 15, color: HEX.lt1 });
  text(s, "でも上位は -3.2", { x: 8.75, y: 3.85, w: 3.7, h: 0.5, fontSize: 22, bold: true, color: HEX.lt1 });
  text(s, "残りの差は、分子全体の文脈や要素どうしの複雑な組み合わせ → モデルに学ばせる部分", { x: 8.75, y: 4.45, w: 3.7, h: 1.6, fontSize: 15, color: HEX.accent5 });
  text(s, "分子単位で 8:2 に分け、8 割で「type × 特徴量のビン」ごとの中央値を作って 2 割を予測。score = type 別 log(MAE) の平均", { x: MX, y: 6.45, w: 12, h: 0.35, fontSize: 11, color: HEX.accent3 });
  s.addNotes("どれくらい効くかを、モデルを使わずに数値化しました。経路サブタイプ＋角度・二面角＋距離で 1.19 から 0.28 まで下がる。ただ上位は -3.2 なので、残りはモデルが学ぶ部分です。");
}

// =====================================================================
pres.addSection({ title: "Uni-Mol" });

// 10. なぜ Uni-Mol？
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Uni-Mol" });
  s.addText("なぜ Uni-Mol？", { placeholder: "title" });
  text(s, "2 位の真似では、予算的に再現が精一杯 → 2019 年以降に出てきた「3D 分子の事前学習モデル」を使う", { x: MX, y: 1.35, w: 12, h: 0.45, fontSize: 17, color: HEX.accent3 });
  const items = [
    ["原子ペアの表現を持つ", "J はペアの値。1 位の「ペアもノードにする」発想に近いことを、事前学習付きでできる"],
    ["2.09 億個の 3D 構造で事前学習済み", "分子の形をすでに知っている → 少ない学習で早く精度が上がる"],
    ["2 位方式より軽い", "1 分子を 1 回処理すれば全ペアを予測できる（1 エポック約 8 万本。2 位方式は約 79〜140 万本）"],
    ["水素込みの重みがある", "J には必ず H が関わる。公開重み mol_pre_all_h（約 4,700 万パラメータ）"],
  ];
  const cw = (W - 2 * MX - 0.4) / 2, ch = 2.15;
  items.forEach(([h, d], i) => {
    const x = MX + (i % 2) * (cw + 0.4), y = 2.0 + Math.floor(i / 2) * (ch + 0.3);
    card(s, x, y, cw, ch);
    atom(s, x + 0.3, y + 0.3, 0.6, String(i + 1), HEX.accent1, { fontSize: 18 });
    text(s, h, { x: x + 1.15, y: y + 0.33, w: cw - 1.45, h: 0.55, fontSize: 19, bold: true, color: C.text2 });
    text(s, d, { x: x + 1.15, y: y + 0.95, w: cw - 1.45, h: 1.1, fontSize: 15 });
  });
  s.addNotes("2位の真似では予算的に再現が精一杯なので、2019年以降に出てきた 3D 分子の事前学習モデル Uni-Mol を使いました。理由は4つ。ペアの表現を持つ、事前学習済み、軽い、水素込みの重みがある。");
}

// 11. Uni-Mol の中身
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Uni-Mol" });
  s.addText("Uni-Mol の中身", { placeholder: "title" });
  // 入力
  box(s, MX, 1.6, 2.7, 1.0, "原子の種類\n[CLS] C C O H … [SEP]", { fontSize: 14, bold: true, color: C.text2 });
  box(s, MX, 3.4, 2.7, 1.0, "3D 座標\n（重心を原点に）", { fontSize: 14, bold: true, color: C.text2 });
  arrow(s, MX + 2.75, 2.1, 0.55, 0, HEX.accent1);
  arrow(s, MX + 2.75, 3.9, 0.55, 0, HEX.accent1);
  box(s, 3.95, 1.6, 2.9, 1.0, "原子の埋め込み\n（512 次元）", { fontSize: 14, fill: HEX.accent1, color: HEX.lt1, bold: true });
  box(s, 3.95, 3.4, 2.9, 1.0, "原子間距離をガウス関数\n128 個で展開 → ペアのバイアス", { fontSize: 13, fill: HEX.accent1, color: HEX.lt1, bold: true });
  arrow(s, 6.9, 2.1, 0.55, 0.6, HEX.accent1);
  arrow(s, 6.9, 3.9, 0.55, -0.6, HEX.accent1);
  // Transformer
  card(s, 7.5, 1.6, 2.75, 2.8, C.text2);
  text(s, "Transformer\n15 層", { x: 7.65, y: 1.75, w: 2.45, h: 0.85, fontSize: 18, bold: true, color: HEX.lt1, align: "center" });
  text(s, "attention に距離のバイアスを足す。各層の attention スコアが、次の層のペア表現になる", { x: 7.7, y: 2.65, w: 2.35, h: 1.65, fontSize: 13, color: HEX.accent5 });
  arrow(s, 10.3, 2.1, 0.5, 0, HEX.accent1);
  arrow(s, 10.3, 3.9, 0.5, 0, HEX.accent1);
  box(s, 10.85, 1.6, 1.88, 1.0, "原子の表現\n512 次元", { fontSize: 14, fill: HEX.accent2, color: HEX.lt1, bold: true });
  box(s, 10.85, 3.4, 1.88, 1.0, "ペアの表現\n64 次元", { fontSize: 14, fill: HEX.accent2, color: HEX.lt1, bold: true });
  // 事前学習
  card(s, MX, 4.95, W - 2 * MX, 1.55);
  text(s, "事前学習（論文の設定）", { x: MX + 0.3, y: 5.15, w: 4, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  text(s, bullets(["2.09 億個の分子の 3D 構造（RDKit で生成した配座）", "① 隠した原子の種類を当てる　② ずらした座標・原子間距離を元に戻す"], 15), { x: MX + 0.3, y: 5.6, w: 8.2, h: 0.9 });
  text(s, "15 層・512 次元・64 ヘッド\n約 4,700 万パラメータ", { x: 9.3, y: 5.3, w: 3.2, h: 0.9, fontSize: 15, bold: true, color: C.accent1 });
  s.addNotes("入力は原子の種類と座標。距離をガウス関数で展開して attention のバイアスに足し、各層の attention スコアを次の層のペア表現として引き継ぎます。出力は原子の表現とペアの表現。事前学習は原子を隠して当てる、ずらした座標を戻す、の2つです。");
}

// 12. 使った特徴量
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Uni-Mol" });
  s.addText("使った特徴量", { placeholder: "title" });
  atom(s, MX, 1.45, 0.62, "0", HEX.accent2, { fontSize: 20 });
  text(s, "入力は原子の種類と座標だけ。手作りの特徴量はゼロ", { x: MX + 0.85, y: 1.5, w: 11, h: 0.5, fontSize: 20, bold: true, color: C.text2 });
  const head = ["EDA で効いた要素", "Uni-Mol の中でどう表されるか"].map((t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 } } }));
  const data = [
    ["距離", "ガウス関数で展開して、attention に直接入る"],
    ["混成（結合の数）", "周りの原子との距離のパターンから分かる"],
    ["2J の角度・3J の二面角", "3〜4 原子の距離の組で決まる → 層を重ねてペア表現が学ぶ"],
    ["経路上の原子", "attention で、周りの原子の情報を集める"],
    ["type", "J を出す部分で、type の埋め込みとして入れる"],
  ];
  const rows = [head, ...data.map((r, i) => r.map((t, k) => ({ text: t, options: { fill: { color: i % 2 ? HEX.lt1 : HEX.lt2 }, bold: k === 0, color: k === 0 ? HEX.accent1 : HEX.dk1 } })))];
  s.addTable(rows, { x: MX, y: 2.3, w: W - 2 * MX, colW: [3.6, W - 2 * MX - 3.6], fontSize: 16, rowH: 0.55, valign: "middle",
    border: { type: "solid", color: HEX.lt1, pt: 1 }, margin: [0.05, 0.15, 0.05, 0.15], objectName: nm("table") });
  card(s, MX, 5.85, W - 2 * MX, 0.85, "F6EDE5");
  text(s, "確認：事前学習の距離予測部分にペア表現を入れると、原子間距離を誤差 0.05Å で再現できた → ペア表現は分子の形を知っている",
    { x: MX + 0.3, y: 5.85, w: 11.6, h: 0.85, fontSize: 15, color: C.text1, valign: "middle" });
  s.addNotes("EDA で効くと分かった要素は、Uni-Mol の中ではすべて距離から表現できます。角度や二面角も、3〜4原子の距離の組で決まる。実際、ペア表現から原子間距離を 0.05Å の誤差で再現できたので、形の情報はちゃんと入っています。");
}

// 13. J の出し方
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Uni-Mol" });
  s.addText("J の出し方", { placeholder: "title" });
  const chips = ["原子 i の表現", "原子 j の表現", "i × j（要素ごとの積）", "ペアの表現 ij", "ペアの表現 ji", "type の埋め込み"];
  chips.forEach((t, i) => box(s, MX, 1.5 + i * 0.62, 3.2, 0.5, t, { fontSize: 14, bold: true, color: C.text2 }));
  arrow(s, MX + 3.3, 3.05, 0.6, 0, HEX.accent1);
  box(s, 4.6, 2.55, 2.0, 1.0, "MLP\n（2 層）", { fontSize: 16, bold: true, fill: HEX.accent1, color: HEX.lt1 });
  arrow(s, 6.7, 3.05, 0.6, 0, HEX.accent1);
  box(s, 7.4, 2.35, 2.5, 1.4, "type 別に 4 成分\nfc / sd / pso / dso", { fontSize: 15, bold: true, fill: HEX.dk2, color: HEX.lt1 });
  arrow(s, 10.0, 3.05, 0.6, 0, HEX.accent1);
  atom(s, 10.75, 2.3, 1.5, "J", HEX.accent2, { fontSize: 40 });
  text(s, "4 成分の合計", { x: 10.55, y: 3.9, w: 1.9, h: 0.35, fontSize: 13, align: "center", color: HEX.accent3 });
  card(s, 4.6, 5.0, W - MX - 4.6, 1.7);
  text(s, bullets(["(i, j) と (j, i) の平均 → 入れ替えに対して対称", "出力は type ごとの平均・標準偏差でスケールを合わせる", "損失は type 別 log(MAE) の平均（指標そのもの）", "AdamW、学習率は本体 1e-4 / 出力部分 1e-3、cosine、bf16"], 14),
    { x: 4.85, y: 5.15, w: W - MX - 5.1, h: 1.5 });
  s.addNotes("出力部分はシンプルです。原子 i と j の表現、ペアの表現、type の埋め込みを MLP に入れて、type ごとに4成分を出し、その合計を J にします。損失は評価指標そのもの。");
}

// 14. Uni-Mol の動かし方
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Uni-Mol" });
  s.addText("Uni-Mol の動かし方", { placeholder: "title" });
  const steps = [
    ["重みを取ってくる", "Hugging Face の dptech/Uni-Mol-Models から mol_pre_all_h_220816.pt（水素込み）と mol.dict.txt"],
    ["入力を作る", "[CLS] 原子… [SEP] の並び、座標は重心を原点に。語彙はファイルの行順（[PAD]=0, [CLS]=1, [SEP]=2, C=4, H=8 …）"],
    ["読み込めたか確かめる", "事前学習の距離予測部分で原子間距離を再現 → 誤差 0.05Å（最初は 0.98Å：使う表現と単位を取り違えていた）"],
    ["J を出す部分を付けて fine-tune", "手元の Mac で数百分子だけ動作確認 → VS Code の Colab 拡張で A100（1 エポック約 1.1 分）"],
  ];
  steps.forEach(([h, d], i) => {
    const y = 1.5 + i * 1.32;
    atom(s, MX, y, 0.58, String(i + 1), i === 2 ? HEX.accent2 : HEX.accent1, { fontSize: 16 });
    if (i < steps.length - 1) s.addShape(pres.ShapeType.line, { x: MX + 0.29, y: y + 0.58, w: 0, h: 0.74, line: { color: HEX.accent5, width: 2 }, objectName: nm("bond") });
    text(s, h, { x: MX + 0.8, y: y - 0.02, w: 6.6, h: 0.36, fontSize: 17, bold: true, color: C.text2 });
    text(s, d, { x: MX + 0.8, y: y + 0.36, w: 6.6, h: 0.62, fontSize: 13, color: C.text1 });
  });
  card(s, 8.2, 1.45, 4.53, 5.25, C.text2);
  text(s, "重みの読み込み（要点）", { x: 8.5, y: 1.65, w: 4.0, h: 0.4, fontSize: 15, bold: true, color: HEX.accent6 });
  text(s, [
    { text: "state = torch.load(", options: { breakLine: true } },
    { text: "  'mol_pre_all_h_220816.pt',", options: { breakLine: true } },
    { text: "  weights_only=True)['model']", options: { breakLine: true } },
    { text: "backbone = UniMolBackbone()", options: { breakLine: true } },
    { text: "backbone.load_state_dict(", options: { breakLine: true } },
    { text: "  state, strict=False)", options: { breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "# 読み込めない重み: なし", options: { breakLine: true, color: HEX.accent5 } },
    { text: "# 使わない部分: lm_head,", options: { breakLine: true, color: HEX.accent5 } },
    { text: "#   dist_head, pair2coord_proj", options: { color: HEX.accent5 } },
  ], { x: 8.5, y: 2.15, w: 4.0, h: 3.6, fontSize: 13, fontFace: "Courier New", color: HEX.lt1 });
  text(s, "約 4,700 万パラメータ、学習率は本体 1e-4", { x: 8.5, y: 6.05, w: 4.0, h: 0.4, fontSize: 13, color: HEX.accent5 });
  s.addNotes("Uni-Mol の動かし方です。重みは Hugging Face から。入力の形と語彙の順番を公式に合わせました。読み込めたかは、事前学習の距離予測部分で原子間距離が 0.05Å の誤差で再現できるかで確認。そのあと J を出す部分を付けて Colab の A100 で fine-tune しました。");
}

// =====================================================================
pres.addSection({ title: "結果" });

// 15. 学習した 2 つのモデル
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "結果" });
  s.addText("学習した 2 つのモデル", { placeholder: "title" });
  const H = (t, fill) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: fill } } });
  const head = [H("", HEX.dk2), H("基本の設定", HEX.accent2), H("覚え込み対策あり", HEX.accent3)];
  const data = [
    ["ねらい", "まずは素直に fine-tune", "覚え込み（学習と検証の差）を抑える"],
    ["dropout", "なし", "0.1（事前学習のときと同じ）"],
    ["何を当てるか（損失）", "J だけ", "J ＋ 4 成分（fc / sd / pso / dso）"],
    ["学習（A100）", "60 エポック・約 1 時間 10 分", "60 エポック・約 1 時間 20 分"],
    ["検証 score", "-2.385", "-2.159"],
  ];
  const rows = [head, ...data.map((r, i) => r.map((t, k) => ({ text: t, options: { fill: { color: i % 2 ? HEX.lt1 : HEX.lt2 }, bold: k === 0 || i === data.length - 1, color: k === 0 ? HEX.dk2 : HEX.dk1 } })))];
  s.addTable(rows, { x: MX, y: 1.45, w: W - 2 * MX, colW: [2.6, 3.8, W - 2 * MX - 6.4], fontSize: 15, rowH: 0.52, valign: "middle",
    border: { type: "solid", color: HEX.lt1, pt: 1 }, margin: [0.05, 0.15, 0.05, 0.15], objectName: nm("table") });
  const cw = (W - 2 * MX - 0.4) / 2;
  [["dropout とは", "学習中に、ランダムに一部のつながりを切る。特定のデータを丸暗記しにくくなる"],
   ["4 成分の補助損失とは", "J だけでなく、J の内訳 fc / sd / pso / dso も一緒に当てさせる。3 位チームで効いた方法"]].forEach(([h, d], i) => {
    const x = MX + i * (cw + 0.4);
    card(s, x, 4.85, cw, 1.6);
    atom(s, x + 0.3, 5.1, 0.55, i === 0 ? "D" : "+", HEX.accent3, { fontSize: 16 });
    text(s, h, { x: x + 1.05, y: 5.1, w: cw - 1.3, h: 0.4, fontSize: 17, bold: true, color: C.text2 });
    text(s, d, { x: x + 1.05, y: 5.55, w: cw - 1.3, h: 0.8, fontSize: 14 });
  });
  s.addNotes("Uni-Mol の fine-tune を、設定を変えて2回学習しました。1つ目は基本の設定。学習と検証の差が開いて覚え込みが目立ったので、2つ目は dropout と、J の4成分も一緒に当てさせる補助損失を入れた「覚え込み対策あり」です。");
}

// 16. 結果
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "結果" });
  s.addText("結果：2 本の平均で -2.42", { placeholder: "title" });
  const ep = hist.map((r) => String(r.epoch));
  s.addChart(pres.ChartType.line, [
    { name: "基本の設定", labels: ep, values: hist.map((r) => r.val) },
    { name: "覚え込み対策あり", labels: ep, values: hist3.map((r) => r.val) },
  ], {
    x: MX, y: 1.45, w: 7.6, h: 5.0, chartColors: [HEX.accent2, HEX.accent3], lineSize: 2.5, lineDataSymbol: "none",
    valAxisMinVal: -2.6, valAxisMaxVal: 0.0, valAxisMajorUnit: 0.5, valAxisLabelFormatCode: "0.0", valGridLine: { color: HEX.lt2, size: 0.75 }, catGridLine: { style: "none" },
    catAxisLabelFrequency: 10, showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.dk1, ...chartText,
    showTitle: true, title: "検証 score の推移（エポックごと、低いほど良い）", objectName: nm("chart"),
  });
  const stats = [["-2.372", "基本の設定（Private）"], ["-2.159", "覚え込み対策あり（検証）"], ["-2.424", "2 つを 7:3 で平均（Private）"]];
  stats.forEach(([v, l], i) => {
    const y = 1.45 + i * 1.12;
    card(s, 8.6, y, 4.13, 0.95, i === 2 ? C.text2 : C.background2);
    text(s, v, { x: 8.85, y, w: 1.65, h: 0.95, fontSize: 26, bold: true, valign: "middle", color: i === 2 ? HEX.accent6 : C.accent1 });
    text(s, l, { x: 10.5, y, w: 2.15, h: 0.95, fontSize: 13, valign: "middle", color: i === 2 ? HEX.lt1 : C.text1 });
  });
  text(s, bullets(["検証と LB がほぼ一致（基本の設定：検証 -2.385 / Private -2.372）", "覚え込み対策ありは単体では全 type で悪化。でも混ぜると +0.05", "平均の重みは検証で決めた（7:3 が最良）"], 14), { x: 8.6, y: 4.95, w: 4.13, h: 1.5 });
  s.addNotes("基本の設定は検証 -2.385、Private -2.372。覚え込み対策ありは、単体では全 type で悪化しました。それでも 7:3 で混ぜると Private -2.424 まで伸びて、当時の順位なら38位前後です。検証と LB はほぼ一致していました。");
}

// 17. 振り返りと次の一手
{
  const s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "結果" });
  s.addText("振り返りと次の一手", { placeholder: "title" });
  const cw = (W - 2 * MX - 0.4) / 2;
  text(s, "分かったこと", { x: MX, y: 1.5, w: cw, h: 0.45, fontSize: 20, bold: true, color: HEX.accent6 });
  text(s, bullets(["事前学習モデルの fine-tune で、LightGBM の上限（-2.0〜-2.1）を超えて銀メダル圏", "基本の設定は学習と検証の差が拡大（学習 -3.42 / 検証 -2.39）＝ 覚え込み", "覚え込み対策は 60 エポックでは逆効果。ただし混ぜると効く", "1JHC・1JHN・3JHC が弱い（値の幅が大きい type）"], 16, HEX.lt1), { x: MX, y: 2.1, w: cw, h: 3.5 });
  const x2 = MX + cw + 0.4;
  text(s, "次の一手", { x: x2, y: 1.5, w: cw, h: 0.45, fontSize: 20, bold: true, color: HEX.accent6 });
  const next = [["覚え込み対策ありで、エポックを増やす", "dropout と補助損失は学習が遅くなる。どちらが効くかも切り分ける"], ["シード違いのモデルを増やして平均", "2 本の平均で +0.05。本数を増やす"], ["弱い type だけ追加で fine-tune", "2・3・4 位の方式"]];
  next.forEach(([h, d], i) => {
    const y = 2.1 + i * 1.15;
    atom(s, x2, y, 0.55, String(i + 1), HEX.accent2, { fontSize: 16 });
    text(s, h, { x: x2 + 0.75, y: y - 0.02, w: cw - 0.8, h: 0.4, fontSize: 17, bold: true, color: HEX.lt1 });
    text(s, d, { x: x2 + 0.75, y: y + 0.4, w: cw - 0.8, h: 0.35, fontSize: 14, color: HEX.accent5 });
  });
  s.addNotes("事前学習モデルの fine-tune で銀メダル圏まで来ました。課題は覚え込みと、1JHC などの弱い type。覚え込み対策ありは60エポックでは学習不足だったようなので、エポックを増やして試したい。あとはモデルを増やして平均、弱い type の fine-tune です。");
}

// ---------- 書き出し ----------
(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  // 日本語の字形も同じフォントにする（テーマの東アジア用フォント）
  const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
  const part = "ppt/theme/theme1.xml";
  let xml = await zip.file(part).async("string");
  xml = xml.replace(/<a:ea typeface="[^"]*"\s*\/>/g, `<a:ea typeface="${FONT}"/>`);
  zip.file(part, xml);
  fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("wrote", OUT);
})();
