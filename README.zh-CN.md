# AgentCo

[English](README.md) | **简体中文**

**让智能采购物有所值。** 一套可交互的 AI 服务采购演示：选择服务、控制支出、核查证据。

AgentCo 是面向 OKX Dev Day 的 AI 服务采购工作台：给出代币、预算和采购策略，比较服务，预留费用，检查结果，再交付带证据的代币风险快照。本仓库已实现可运行的 React + TypeScript + Vite 本地演示。

**全部数据均为模拟。** Scout、Sentinel、Atlas、Lens 是四个虚构供应商；价格、评分、历史、分析结果和支付记录均为合成数据。遵循用户明确要求，应用不会连接钱包、签名、调用收费 API 或转移真实资金，也不需要任何凭证。真实 OKX AI 集成属于未来工作，不是本次演示的交付内容。

## 本地运行

需要 **Node.js 22.18 或更高版本**。

```bash
npm install
npm run dev
```

打开 [localhost:5173](http://localhost:5173)。如果 5173 端口被占用，可运行 `npm run dev -- --port 5174`。

构建并预览生产版本：

```bash
npm run build
npm run preview
```

构建输出为 `dist/`，生产预览地址为 [localhost:4173](http://localhost:4173)。

运行检查：

```bash
npm test
npm run typecheck
```

测试覆盖整数预算账本、策略选择、预算与时限边界、单次备用调用、重复验证、超时对账和历史反馈。

## 可以演示什么

- **三种策略**：`Lowest cost`、`Balanced`、`High assurance`，实时比较入选服务、预计费用与最高费用。
- **三种情景**：`Successful delivery`、`Verification mismatch`、`Response timeout`，支持暂停、逐步推进和重置。
- **预算与证据**：`Execution journal` 展示预留、支出、释放及验证过程；报告可通过 `Export evidence` 导出为 JSON，单个事件也可复制为 JSON。
- **服务与记录**：`Agent directory` 支持搜索和筛选；`Run history` 与 `Treasury` 展示完成的模拟运行和支出。

浏览器本地最多保存 **30 条运行记录**，与种子样本一起影响后续服务选择。`New task` 和 `Reset run` 不清除历史；使用新的浏览器配置或隐私窗口可重现初始示例。默认 0.50 USDT / 45 秒 / 初始历史下，Balanced 成功支出 0.22，含备用和再次验证的最高支出为 0.38。所有金额都是模拟记账单位。

## 文档

每份文档均提供完整的英文与简体中文版本，可通过文件顶部的链接切换。

- [三分钟演示脚本](docs/demo-walkthrough.zh-CN.md)
- [产品说明：初始提案与当前实现](docs/product-brief.zh-CN.md)
- [界面设计：初始提案与当前实现](docs/demo-design.zh-CN.md)

## 参考资料

- [活动页面](https://luma.com/l4aq8vii)
- [OKX Builder Kit](https://www.okx.com/en-sg/learn/okx-dev-day-builder-kit)
- [用户提供的 AgentCo MVP 讨论](https://chatgpt.com/share/6aae7f96-13bc-83ec-b2a3-2a317c76cae7)

原始资料整理日期：2026-09-20。文档中的参赛与平台资料是背景信息，不代表本演示已完成平台集成或参赛提交。
