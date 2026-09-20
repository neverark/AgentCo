# AgentCo：约三分钟演示脚本

[English](demo-walkthrough.md) | **简体中文**

这份脚本演示已经实现的本地产品。所有服务、行情、评分、费用与支付记录均为合成数据，没有钱包连接、收费 API 或真实转账。

## 演示前

运行 `npm install`、`npm run dev`，打开 [localhost:5173](http://localhost:5173)。使用新的浏览器配置或隐私窗口开始，以便从初始种子历史出发。普通刷新、`New task` 和 `Reset run` 都会保留当前浏览器的运行历史；最近 30 条模拟验收记录会影响后续供应商选择。

默认任务是 Base 上的 AERO 示例地址，`Spend limit` 为 **0.50 USDT**，`Delivery window` 为 **45 sec**。真实地址只是任务标识，输入后不会查询真实行情。下列固定费用均以该预算、时限和初始历史为前提。

| 界面策略 | 正常结果 | 含一次备用的最高支出 |
| --- | ---: | ---: |
| Lowest cost | 0.06 | 0.06，无备用 |
| Balanced | 0.22 | 0.38 |
| High assurance | 0.36 | 0.44 |

## 0:00–0:25 · 一句话讲清产品

停留在 `Workspace`。

> “AgentCo 是一个替用户采购 AI 服务的工作台。我给它任务、预算和质量要求，它负责选服务、控制花费、检查结果，并留下每个决策的记录。右上角的 Demo environment 表示这次全部运行在模拟环境，不会动用真实资金。”

指向 `Token contract`、`Network`、`Spend limit` 和三张策略卡，说明同一个任务可以有不同采购方式。

## 0:25–0:50 · 比较策略与选择原因

点击 `Compare policies`，展示三个方案。

> “Lowest cost 用 Scout，费用 0.06，只检查返回内容的结构和身份。Balanced 用 Sentinel 加 Lens 验证，正常费用 0.22，并为 Atlas 备用和再次验证预留空间。High assurance 买两份分析，再进行核对，正常费用 0.36，最高 0.44。预算和时限不足时，计划会调整或被阻止。”

关闭对话框，保持 `Balanced`。指向服务表格中的 `DEMO HISTORY`：这些是带样本量的模拟验收历史，和市场星级是不同信号。

## 0:50–1:30 · 跑通采购、预算与证据

在 `Explore an outcome` 保持 `Successful delivery`，点击 `Run procurement`。自动演示每 1.25 秒推进一步；需要停下来讲解时使用 `Pause execution` 或右侧单步按钮，也可事先勾选 `Start in step-by-step mode`。

> “AgentCo 先按最坏允许路径预留 0.38，其中包括主服务、验证、备用及再次验证。主流程成功只花 0.22，剩下的 0.16 预留被释放，预算最终还有 0.28。这是账本预留的释放，不是链上退款。”

跟随预算分配带和 `Execution journal`，结束后点击 `View risk snapshot`。指出 `Matched` 与 `Not verified`：流动性等字段与模拟参考值匹配，但 `Contract security audit` 未验证。点击 `Export evidence` 可下载包含任务、计划、逐步账本和证据的 JSON。

## 1:30–2:10 · 让失败可解释

关闭报告，在 `Explore an outcome` 选择 `Verification mismatch`，保持 Balanced 和 0.50 预算，再点击 `Run procurement`。

> “付费拿到结果并不等于验收通过。这里流动性与参考值不一致，AgentCo 拒收第一份分析，使用已预留的 Atlas 备用，并再次调用 Lens。备用最多一次，全部完成支出 0.38，仍有 0.12 未花。”

展示 `Evidence disagreement detected`、`Fallback 1 of 1 · Atlas` 与最后通过的证据。可点击任意事件查看当时的累计支出、剩余预留和可用预算。

## 2:10–2:40 · 超时不会自动重复付款

选择 `Response timeout` 并运行。

> “这个情景模拟记账成功后响应丢失。系统先保留原调用记录，再通过 Original invocation reconciled 恢复同一次调用的结果；不会因为没收到响应就再付一次钱。Balanced 的正常总费用仍为 0.22。”

如果时间紧张，可用单步按钮快速推进到该事件。

## 2:40–3:10 · 留下可追溯记录

打开 `Run history`，查看三次情景的结果和支出，再切到 `Treasury` 展示费用与预算的对照。必要时打开 `Agent directory` 查看服务资料和任务验收样本。

> “每次结果都进入本地模拟历史，并影响后续选择。用户可以追溯为什么选这家服务、花了多少、哪些证据通过、哪些没有覆盖。这次交付展示完整采购体验；真实 OKX 服务与支付接入留待后续单独开展。”

## 可选加演：预算不足

回到 `Workspace`，选择 `High assurance`，把 `Spend limit` 改为 **0.21**。此时预算不足以支付两份分析和验证，显示 `Before you run`，`Run procurement` 不可执行。恢复 0.50 后可继续。

演示多次以后，历史反馈可能改变服务组合和报价；这是设计中的行为。若需要严格重复表格中的初始价格，重新使用一个没有历史的新浏览器会话。
