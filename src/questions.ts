export interface PracticeOption {
  label: string;
  text: string;
}

export interface PracticeQuestion {
  id: string;
  qid: string;
  module: string;
  type: string;
  source: string;
  paperTitle?: string;
  paperKey?: string;
  hasImage?: boolean;
  stemHtml: string;
  options: PracticeOption[];
  answer: string[];
  explanationHtml: string;
  multi?: boolean;
  review?: {
    explanationAnswer?: string;
    missing?: boolean;
  };
  material?: {
    title: string;
    html: string;
  };
}

export const practiceQuestions: PracticeQuestion[] = [
  {
    id: 'demo-1',
    qid: '2263114',
    module: '资料分析',
    type: '综合',
    source: '2016 四川 · 选调',
    paperTitle: '2016年3月四川省选调优秀大学生到基层工作考试《行测》（精选）',
    material: {
      title: '材料 1',
      html: `
        <p>2013年，全国林产品出口644.55亿美元，同比增长 <span class="formula">7.2%</span>，增幅比上年增加3.18个百分点，占全国商品出口额的 <span class="formula">2.92%</span>。林产品进口640.88亿美元，同比增加 <span class="formula">6.1%</span>，增幅比上年增加8.58个百分点，占全国商品进口额的 <span class="formula">3.4%</span>。其中，非木质林产品出口162.3亿美元，同比增加 <span class="formula">4.8%</span>，进口288.80亿美元，同比下降 <span class="formula">2.1%</span>。</p>
        <p>2013年林产品主要进出口情况如下表：</p>
        <div class="mt-3"><img src="/assets/table-material.png" alt="2013年林产品进出口表" style="width:100%;border-radius:8px;border:1px solid var(--line)"></div>
      `,
    },
    stemHtml: '2013年全国商品进出口总额约为多少亿美元？',
    options: [
      { label: 'A', text: '1285' },
      { label: 'B', text: '10891' },
      { label: 'C', text: '25140' },
      { label: 'D', text: '41553' },
    ],
    answer: ['D'],
    explanationHtml:
      '根据题干“2013年全国商品进出口总额”，结合材料“占全国商品出口额的2.92%、占全国商品进口额的3.4%”，可判定此题为现期比重问题。全国商品出口额约为644.55÷2.92%≈22074亿美元，进口额约为640.88÷3.4%≈18849亿美元，进出口总额约为40923亿美元，与D项最接近。故正确答案为D。',
  },
  {
    id: 'demo-2',
    qid: '2401001',
    module: '常识判断',
    type: '多选',
    source: '2024 国考',
    stemHtml: '下列属于我国基本政治制度的有：',
    options: [
      { label: 'A', text: '人民代表大会制度' },
      { label: 'B', text: '中国共产党领导的多党合作和政治协商制度' },
      { label: 'C', text: '民族区域自治制度' },
      { label: 'D', text: '基层群众自治制度' },
    ],
    answer: ['B', 'C', 'D'],
    multi: true,
    explanationHtml:
      '人民代表大会制度是我国的根本政治制度；中国共产党领导的多党合作和政治协商制度、民族区域自治制度、基层群众自治制度是我国的基本政治制度。故正确答案为B,C,D。',
  },
  {
    id: 'demo-3',
    qid: '2502007',
    module: '政治理论',
    type: '判断',
    source: '2025 江苏',
    stemHtml: '行政处罚决定书应当载明作出决定的行政机关名称和作出决定的日期。（ ）',
    options: [
      { label: 'A', text: '正确' },
      { label: 'B', text: '错误' },
    ],
    answer: ['A'],
    explanationHtml:
      '《行政处罚法》第五十九条规定，行政处罚决定书应当载明作出决定的行政机关名称和作出决定的日期。故表述正确。',
  },
  {
    id: 'demo-4',
    qid: '2303008',
    module: '言语理解与表达',
    type: '逻辑填空',
    source: '2023 山东',
    stemHtml:
      '科学研究需要________的精神，既不能________，也不能________。只有反复验证，才能接近真相。依次填入横线处的词语，最恰当的一组是：',
    options: [
      { label: 'A', text: '脚踏实地　急于求成　半途而废' },
      { label: 'B', text: '实事求是　好高骛远　浅尝辄止' },
      { label: 'C', text: '精益求精　急功近利　畏首畏尾' },
      { label: 'D', text: '一丝不苟　朝令夕改　优柔寡断' },
      { label: 'E', text: '持之以恒　见异思迁　敷衍了事' },
      { label: 'F', text: '严谨求实　急于求成　浅尝辄止' },
      { label: 'G', text: '脚踏实地　好高骛远　半途而废' },
      { label: 'H', text: '严谨求实　急功近利　畏首畏尾' },
    ],
    answer: ['F'],
    explanationHtml:
      '第一空强调严谨求实，第二空与“反复验证”相对，强调急于求成，第三空强调不深入、浅尝辄止。故正确答案为F。',
  },
  {
    id: 'demo-5',
    qid: '2502019',
    module: '常识判断',
    type: '单选',
    source: '2025 江苏 B',
    stemHtml: '根据《民法典》，下列关于居住权的说法正确的是：',
    options: [
      { label: 'A', text: '居住权可以口头设立' },
      { label: 'B', text: '居住权无偿设立，但当事人另有约定的除外' },
      { label: 'C', text: '居住权可以转让、继承' },
      { label: 'D', text: '居住权自合同成立时设立' },
    ],
    answer: ['D'],
    review: { explanationAnswer: 'B' },
    explanationHtml:
      '《民法典》第三百六十六条规定，居住权人有权按照合同约定，对他人的住宅享有占有、使用的用益物权。第三百六十八条规定，居住权无偿设立，但是当事人另有约定的除外。故正确答案为B。',
  },
  {
    id: 'demo-6',
    qid: '2502020',
    module: '政治理论',
    type: '判断',
    source: '2025 江苏 B',
    stemHtml: '中国式现代化是全体人民共同富裕的现代化。（ ）',
    options: [
      { label: 'A', text: '正确' },
      { label: 'B', text: '错误' },
    ],
    answer: [],
    review: { missing: true },
    explanationHtml: '源文件答案缺失，暂无法判分。',
  },
];
