# 数字听写练习网站 — 设计文档

> 工作名称：Number Dictation（暂定）
> 一个纯前端的网站：浏览器 TTS 朗读随机生成的数字 / 年份 / 电话 / 时间，用户输入听到的内容，系统判分。主要面向魁北克法语（fr-CA）学习者，同时支持英语。

---

## 1. 范围

### MVP 包含
- 练习语言：**fr-CA**（默认）、**en**
- 题型：**基础数字、年份、电话、时间**（只做这四种）
- 每个题型分若干难度档（见第 5 节）
- 语速调节、语音选择
- 时间题型支持 **12 / 24 小时制切换**
- **重听按钮**、**显示答案按钮**
- 判分与逐位对比
- 本地统计（localStorage）
- 界面语言切换：**fr / en / zh**

### MVP 不包含（以后再说）
- 其他题型（价格、日期、邮编、温度、地址、混合语境句子）
- 弱项模式（按错误率加权出题）
- 每个题型独立的 SEO 内容页、广告、Anki 导出
- 云端 TTS（OpenAI / ElevenLabs）
- fr-FR 练习语言

代码结构要为以上扩展留出位置，但不要提前实现。

---

## 2. 技术栈与部署

- **Vite + TypeScript**，不使用 UI 框架（原生 DOM 即可；若觉得需要，可后续再引入）
- **Vitest** 做单元测试
- 无后端、无外部 API、无运行时依赖
- 部署：**Cloudflare Pages**（推荐），构建命令 `npm run build`，输出目录 `dist`
  - 备选 GitHub Pages：需 GitHub Actions 构建；若无自定义域名，`vite.config.ts` 中设置 `base: '/<repo>/'`

---

## 3. 项目结构

```
src/
  main.ts              # 入口：初始化设置、i18n、UI
  types.ts             # 共享类型
  speech/
    tts.ts             # 封装 speechSynthesis：加载语音、选择、语速、播放、取消
  numbers/
    fr-CA.ts           # 整数 → 法语文字
    en.ts              # 整数 → 英语文字
  generators/
    cardinal.ts
    year.ts
    phone.ts
    time.ts
    index.ts           # 根据 (lang, type, tier, settings) 分派
  checker.ts           # 输入归一化 + 判分 + 逐位对比
  stats.ts             # localStorage 统计读写
  settings.ts          # 设置读写（localStorage）
  i18n/
    index.ts           # t(key) 函数 + 当前界面语言
    fr.json  en.json  zh.json
  ui/
    practice.ts        # 练习主界面逻辑
    settings-panel.ts
    stats-panel.ts
  style.css
tests/
  fr-CA.test.ts  en.test.ts  time.test.ts  phone.test.ts  checker.test.ts
```

`numbers/` 和 `generators/` 必须是**纯函数**（随机数源可注入，便于测试）。

---

## 4. 核心数据模型

```ts
type PracticeLang = 'fr-CA' | 'en';
type UiLang = 'fr' | 'en' | 'zh';
type QuestionType = 'cardinal' | 'year' | 'phone' | 'time';
type TimeFormat = '12h' | '24h';

interface Question {
  id: string;
  lang: PracticeLang;
  type: QuestionType;
  tier: number;
  answer: string;   // 规范答案：cardinal/year/phone 为纯数字串；time 为 "HH:MM"（24h）
  display: string;  // 给人看的书面读法，点"显示答案"时展示，如 "mille neuf cent quatre-vingt-quatre"
  tts: string;      // 实际送给 TTS 的文本
}
```

**关键原则：朗读文本由我们自己生成，绝不把 `1984`、`21:30`、`514-555-0172` 这类原始字符串直接交给 TTS。** TTS 无法判断语境，读法在不同系统上也不一致。

`tts` 由 `display` 派生：
- 连字符替换为空格（已知某些法语语音读带连字符的数字会出错）
- 电话等需要停顿的地方用逗号分组
- 派生规则集中在一个函数里，便于以后按语音调整

---

## 5. 题型与难度分档

### 5.1 基础数字（cardinal）

| 档 | 范围 | 重点 |
|---|---|---|
| 1 | 0–20 | 基本词 |
| 2 | 21–69 | et un、vingt-deux |
| 3 | 70–99 | soixante-dix、quatre-vingts |
| 4 | 100–999 | cent / cents |
| 5 | 1 000–999 999 | mille |
| 6 | 1 000 000–999 999 999 | 只出"取整"的数：保留 2–3 位有效数字，如 3 450 000 |

难度为**复选**：用户可勾选 1–6 档的任意组合（至少一档），每题从已勾选的档中等概率随机选一档。原"第 7 档 混合"由"全选"代替（见第 17 节）。

### 5.2 年份（year）

| 档 | 范围 | fr-CA 读法 |
|---|---|---|
| 1 | 2000–2030 | deux mille vingt-quatre |
| 2 | 1900–1999 | mille neuf cent quatre-vingt-quatre |
| 3 | 1000–1899 | mille sept cent quatre-vingt-neuf |
| 4 | 1100–2030 混合 | 1100–1999 随机使用口语读法 **dix-neuf cent quatre-vingt-quatre**（约 50%） |

英语读法：
- 1100–1999：两位两位读，1984 → nineteen eighty-four；整百 1900 → nineteen hundred；01–09 → 1905 nineteen oh five
- 1000–1099 及 2000–2009：two thousand five、one thousand forty-two
- 2010–2030：随机使用 twenty twenty-four 或 two thousand twenty-four

### 5.3 电话（phone）

魁北克区号池：514, 438, 450, 579, 418, 581, 819, 873。
号码生成规则（北美格式）：交换码（中间 3 位）第一位不能是 0 或 1。

| 档 | 形式 | fr-CA 读法 |
|---|---|---|
| 1 | 7 位：555-0172 | 逐位读，tts 默认语速 ×0.9 |
| 2 | 10 位：514 555-0172 | 逐位读，分组停顿：cinq un quatre, cinq cinq cinq, zéro un sept deux |
| 3 | 10 位 | 后四位两位一组：…, zéro un, soixante-douze ⚠️ |
| 4 | 1 800 号码 / 带分机 | un huit cents, … ；分机：poste + 逐位 ⚠️ |

⚠️ 第 3、4 档的读法需要用魁北克实际听到的说法核实后再定稿，实现时把读法规则写成易于调整的形式。

英语：逐位读，0 随机读作 "zero" 或 "oh"；1-800 读作 one eight hundred。

答案：纯数字串（不含区号前的 1，除第 4 档的 1 800 号码外，规则在实现时统一）。

### 5.4 时间（time）

设置项 `timeFormat: '12h' | '24h'`，决定可用的档位和读法。

**24 小时制**

| 档 | 例子 | 读法 |
|---|---|---|
| 1 | 14:00 | quatorze heures |
| 2 | 09:05 | neuf heures cinq |

**12 小时制**（必须带时段后缀）

| 档 | 例子 | 读法 |
|---|---|---|
| 1 | 14:00 | deux heures de l'après-midi |
| 2 | 09:05 | neuf heures cinq du matin |
| 3 | 14:45 | trois heures moins le quart de l'après-midi |

后缀规则（按**读出来的那个钟点**决定，不是按原始时间；例如 11:45 读作 midi moins le quart）：

| 读出的钟点 | 后缀 |
|---|---|
| 1–11 点（0:00–11:59 中除午夜） | du matin |
| 12 点（正午） | 读作 **midi**，无后缀 |
| 13–17 点 | de l'après-midi |
| 18–23 点 | du soir |
| 0 点 | 读作 **minuit**，无后缀 |

第 3 档口语表达（仅 12 小时制）：
- :15 → et quart
- :30 → et demie（midi / minuit 后为 **et demi**）
- :45 → moins le quart（钟点 +1）
- :35–:55（5 分钟步长，除 :45）→ moins vingt-cinq … moins cinq（钟点 +1）
- 其他 5 分钟步长直接读分钟：deux heures dix

法语语法要点：
- 1 点、21 点用阴性：**une heure**、**vingt et une heures**
- 分钟不加 "minutes"：neuf heures cinq
- 整点不读分钟
- 24 小时制的 0 点：zéro heure quinze

英语：
- 24h：fourteen hundred、oh nine oh five 不自然 → 英语**只提供 12 小时制**，选择 24h 时界面提示并自动使用 12h
- 12h 第 1 档：two o'clock p.m. / two p.m.
- 第 2 档：nine oh five a.m.、two thirty-seven p.m.
- 第 3 档：quarter past two、half past two、twenty to three，后缀 in the morning / in the afternoon / in the evening；noon / midnight

---

## 6. 法语数字转换规则（numbers/fr-CA.ts）

使用**传统拼写**（只在十位与个位之间加连字符），魁北克 OQLF 两种拼写都接受。

- 21, 31, 41, 51, 61：**vingt et un** … **soixante et un**
- 71：**soixante et onze**；72–79：soixante-douze … soixante-dix-neuf
- 80：**quatre-vingts**；81：**quatre-vingt-un**（无 et）；91：**quatre-vingt-onze**
- 魁北克用 soixante-dix / quatre-vingt-dix，**不用** septante / huitante / nonante
- vingt（在 quatre-vingts 中）和 cent：被乘且位于末尾时加 s
  - 200 deux cents，201 deux cent un
  - 在 **mille** 前不加 s：quatre-vingt mille，deux cent mille
  - 在 **million / milliard** 前加 s：quatre-vingts millions，deux cents millions
- mille 不变：deux mille；1000 是 **mille**，不是 un mille
- million 是名词：un million，deux millions

英语（numbers/en.ts）：默认不加 "and"（one hundred twenty-three）；连字符用于 21–99。

---

## 7. 判分（checker.ts）

### 输入归一化
- cardinal / year：去掉空格、不换行空格（U+00A0、U+202F）、逗号、句点 → 纯数字
- phone：只保留数字
- time：解析以下形式，转为 24h 的 "HH:MM"
  - `14:15`、`14h15`、`14 h 15`、`1415`、`9:05`、`9h`
  - 带 am/pm（`am`、`a.m.`、`pm`、`p.m.`，大小写不限）时按 12h 换算
  - 12 小时制题目中，`2:15 pm` 与 `14:15` 都算对；没写 am/pm 的 `2:15` 仅等于 02:15

### 判定
- 每题只提交一次：对 / 错
- 错误时显示逐位对比：长度相同时按位置高亮不同的字符；长度不同时并列显示两个答案
- 无论对错，提交后都显示书面读法（display）

---

## 8. 练习流程与交互

```
[开始] → 自动朗读 → 用户输入 → Enter 提交 → 显示对错 + 书面读法 → Enter 下一题 → 自动朗读 …
```

- 浏览器在用户首次交互前不允许发声，所以进入页面后需点一次**开始**按钮
- 输入框：`inputmode="numeric"`（时间题型用 `inputmode="text"`，因为可能输入 h / pm）

### 按钮
| 按钮 | 行为 |
|---|---|
| 重听 | 重新朗读当前题；默认不限次数；记录次数 |
| 显示答案 | 显示数字答案 + 书面读法；之后仍可重听；**此题不进入统计**；Enter 进入下一题 |
| 提交 / 下一题 | 同一个按钮，随状态切换 |

### 快捷键
| 键 | 动作 |
|---|---|
| `Enter` | 提交 / 下一题 |
| `↑` | 重听 |
| `Esc` | 显示答案 |

### 挑战模式（设置项 `replayLimit`）
- `unlimited`（默认）/ `1` / `0`
- 达到上限后重听按钮禁用

---

## 9. TTS（speech/tts.ts）

- `speechSynthesis.getVoices()` 是异步加载的，要监听 `voiceschanged`
- 按练习语言过滤语音：fr-CA 优先选 `lang === 'fr-CA'`；没有则退回任意 `fr-*`，并在界面提示"未找到加拿大法语语音"
- en 优先 `en-CA`，其次任意 `en-*`
- 用户选择的语音按 `voiceURI` 存入设置
- 每次朗读前先 `speechSynthesis.cancel()`，避免排队
- 语速：0.7–1.3，步长 0.1，默认 1.0
- 设置面板提供"试听"按钮
- 记录"首次朗读结束"的时间点（`onend`），用于计算反应时间

---

## 10. 设置（settings.ts）

localStorage key：`nd.settings.v1`

```ts
interface Settings {
  practiceLang: PracticeLang;   // 默认 'fr-CA'
  uiLang: UiLang;               // 默认根据 navigator.language，回退 'en'
  type: QuestionType;           // 默认 'cardinal'
  tier: number;                 // 默认 1；年份 / 电话 / 时间用
  cardinalTiers: number[];      // 默认 [1]；基础数字用，复选，升序、去重、非空
  rate: number;                 // 默认 1.0
  voiceURI: string | null;
  timeFormat: TimeFormat;       // 默认 '24h'
  replayLimit: 'unlimited' | 1 | 0;
}
```

切换练习语言或题型时，tier 若超出新题型的档数则重置为 1。

---

## 11. 统计（stats.ts）

localStorage key：`nd.stats.v1`

- 只统计**提交过的题**；点了显示答案的题完全不记录
- 按 `${lang}:${type}:${tier}` 聚合：

```ts
interface Bucket {
  answered: number;
  correct: number;
  correctNoReplay: number;  // 没重听就答对
  totalReplays: number;
  totalResponseMs: number;  // 首次朗读结束 → 提交
}
```

- 另存最近 200 条错题：`{ lang, type, tier, answer, input, ts }`（为以后的弱项模式和 Anki 导出准备）
- 统计面板：每个题型 / 档位的正确率、一次听懂率、平均重听次数、平均反应时间；提供"清空统计"

---

## 12. 界面语言（i18n）

- 自己写一个简单的 `t(key, params?)`，字典在 `fr.json` / `en.json` / `zh.json`
- **界面语言**与**练习语言**相互独立
- 所有界面文字都走 `t()`，不要硬编码
- 书面读法（display）始终是练习语言，不翻译

---

## 13. 界面布局（MVP）

单页面，自上而下：
1. 顶栏：网站名、界面语言切换、设置按钮、统计按钮
2. 选择区：练习语言、题型、难度档（时间题型多一个 12h / 24h 切换）
3. 练习卡片：大号输入框、反馈区（对错 + 逐位对比 + 书面读法）、按钮（重听 / 显示答案 / 提交）
4. 底部：本次练习的正确数 / 总数

移动端优先：单列布局，按钮足够大，输入框获得焦点时调出数字键盘。支持深色模式（`prefers-color-scheme`）。

---

## 14. 测试用例（Vitest，必须通过）

### fr-CA 基础数字
| 输入 | 期望 display |
|---|---|
| 0 | zéro |
| 16 | seize |
| 17 | dix-sept |
| 21 | vingt et un |
| 22 | vingt-deux |
| 61 | soixante et un |
| 70 | soixante-dix |
| 71 | soixante et onze |
| 77 | soixante-dix-sept |
| 80 | quatre-vingts |
| 81 | quatre-vingt-un |
| 91 | quatre-vingt-onze |
| 99 | quatre-vingt-dix-neuf |
| 100 | cent |
| 101 | cent un |
| 200 | deux cents |
| 201 | deux cent un |
| 280 | deux cent quatre-vingts |
| 1000 | mille |
| 2000 | deux mille |
| 80000 | quatre-vingt mille |
| 200000 | deux cent mille |
| 1000000 | un million |
| 3450000 | trois millions quatre cent cinquante mille |
| 80000000 | quatre-vingts millions |
| 200000000 | deux cents millions |

### fr-CA 年份
| 输入 | 标准读法 | 口语读法（第 4 档） |
|---|---|---|
| 1984 | mille neuf cent quatre-vingt-quatre | dix-neuf cent quatre-vingt-quatre |
| 1789 | mille sept cent quatre-vingt-neuf | dix-sept cent quatre-vingt-neuf |
| 1900 | mille neuf cents | dix-neuf cents |
| 1100 | mille cent | onze cents |
| 2000 | deux mille | — |
| 2024 | deux mille vingt-quatre | — |

### fr-CA 时间（24h）
| 输入 | 期望 |
|---|---|
| 14:00 | quatorze heures |
| 09:05 | neuf heures cinq |
| 21:00 | vingt et une heures |
| 01:30 | une heure trente |
| 00:15 | zéro heure quinze |

### fr-CA 时间（12h）
| 输入 | 档 | 期望 |
|---|---|---|
| 14:00 | 1 | deux heures de l'après-midi |
| 12:00 | 1 | midi |
| 00:00 | 1 | minuit |
| 19:05 | 2 | sept heures cinq du soir |
| 14:37 | 2 | deux heures trente-sept de l'après-midi |
| 12:37 | 2 | midi trente-sept |
| 01:15 | 3 | une heure et quart du matin |
| 02:30 | 3 | deux heures et demie du matin |
| 12:30 | 3 | midi et demi |
| 14:45 | 3 | trois heures moins le quart de l'après-midi |
| 11:45 | 3 | midi moins le quart |
| 17:50 | 3 | six heures moins dix du soir |
| 23:40 | 3 | minuit moins vingt |

### 英语
| 输入 | 期望 |
|---|---|
| 21 | twenty-one |
| 101 | one hundred one |
| 1984（年份） | nineteen eighty-four |
| 1900（年份） | nineteen hundred |
| 1905（年份） | nineteen oh five |
| 2005（年份） | two thousand five |
| 14:15（12h 第 3 档） | quarter past two in the afternoon |
| 14:40（12h 第 3 档） | twenty to three in the afternoon |
| 12:00 | noon |

### checker
- `"1 984"`、`"1984"` → 年份 1984 正确
- `"(514) 555-0172"` → 5145550172
- `"14h15"`、`"14 h 15"`、`"1415"`、`"2:15 pm"`、`"2:15 P.M."` → 14:15
- `"2:15"` → 02:15（12 小时制题目答案为 14:15 时判错）

---

## 15. 开发顺序建议

1. 项目脚手架（Vite + TS + Vitest），部署一个空页面到 Cloudflare Pages
2. `numbers/fr-CA.ts` + `numbers/en.ts` + 测试
3. 四个 generators + 测试
4. `checker.ts` + 测试
5. `speech/tts.ts`
6. 练习主界面（流程、按钮、快捷键）
7. 设置面板、i18n
8. 统计
9. 移动端与深色模式打磨

---

## 16. 待确认

- 电话第 3、4 档在魁北克的实际读法
- 网站正式名称和域名

---

## 17. 实现补充约定（2026-10-25 确认）

以下补充前文未覆盖的细节，与前文冲突时以本节为准。

- **电话第 4 档**：MVP 只出 1 800 号码，带分机的推迟实现（答案格式待定）
- **英语电话第 3 档**：与第 2 档相同，逐位读
- **英语时间 12 点**：只有 12:00 / 00:00 读 noon / midnight；带分钟时读 twelve fifteen、twelve thirty-seven p.m. 等
- **12h / 24h 切换**：与切换语言、题型相同，tier 超出新档数时重置为 1
- **统计聚合键**：时间题型加入时间制，如 `fr-CA:time:12h:1`；其他题型仍为 `${lang}:${type}:${tier}`
- **时间输入补充**：纯 `14` / `9` 视为整点；三位数 `915` 视为 09:15；`24:00` 视为 00:00
- **反应时间**：朗读结束前提交，或 `onend` 未触发时，该题不记录反应时间（其他统计照常）
- **空输入**：按 Enter 时忽略，不算提交
- **TTS 去连字符**：需实测 `l'après-midi` 去连字符后的读音

生成器实现时的约定：

- **时间分钟取值**：第 1 档整点；第 2 档 1–59 分；第 3 档 5–55 分的 5 分钟步长（不含整点）
- **法语分钟用阴性**：neuf heures une、dix heures vingt et une（minute 为阴性）
- **英语时间第 1 档**：读作 two p.m.（不加 o'clock）
- **英语时间第 3 档的 12 点 / 0 点**：to 形式用 noon / midnight（quarter to noon、ten to midnight，无后缀）；past 形式中 0 点用 midnight（half past midnight），12 点用 twelve + in the afternoon（quarter past twelve in the afternoon）
- **英语电话的 0**：每题随机选一次 zero 或 oh，整题统一
- **电话答案**：第 1 档 7 位；第 2、3 档 10 位；第 4 档 11 位，含开头的 1（`18005550172`）
- **电话判分**：输入开头的 1 可有可无。第 4 档写 `800 555-0172` 算对；10 位答案写 `1 514 555-0172` 也算对；7 位答案不做此处理
- **数字判分**：忽略前导零（`020` = 20）
- **时间判分**：分隔符还接受 `.`（`14.15`）；`12 am` = 00:00，`12 pm` = 12:00；带 am/pm 时钟点必须为 1–12
- **语音按练习语言分别保存**：设置中的 `voiceURI: string | null` 改为 `voiceURIs: { 'fr-CA'?: string; en?: string }`，缺省即自动选择；切换练习语言不会丢失另一种语言的选择
- **设置面板**：用原生 `<dialog>`；改语音后自动试听；面板打开时练习快捷键不生效；关闭后焦点回到答题框
- **统计 Bucket 增加 `timedCount`**：有反应时间的题数。平均反应时间 = `totalResponseMs / timedCount`，避免没记录反应时间的题把平均值拉低
- **错题记录**：时间题额外存 `timeFormat`
- **清空统计**：不用浏览器确认框，改为按钮点两次（4 秒内再点一次才清空）
- **英语语音优先级**：en-CA → en-US → 其他 en-*
- **onend 看门狗**：朗读超过 3 秒 + 每字 150 ms（除以语速）仍未收到 `onend`，视为"未触发"，该题不记反应时间
- **基础数字难度复选**（2026-10-28）：
  - 设置新增 `cardinalTiers: number[]`，基础数字题型只看它；`tier` 仍用于其他题型
  - 每题先从 `cardinalTiers` 中等概率选出一档，题目的 `tier` 记为这一档，统计按实际档位聚合（不存在"组合"桶）
  - 删除第 7 档（混合），基础数字共 6 档；界面提供"全选"按钮
  - 界面：难度改为一行可换行的复选标签；最后一个已勾选的档不能取消
  - 旧设置迁移：没有 `cardinalTiers` 时，按旧的 `type: 'cardinal'` + `tier` 推出（第 7 档 → 全部 6 档）
  - 旧统计中的 `…:cardinal:7` 桶保留，显示为"混合（旧设置）"
- **基础数字第 6 档**：先随机有效位数（2–3）和数量级（10⁶–10⁸），再随机有效数字，所以各数量级出现概率相同
