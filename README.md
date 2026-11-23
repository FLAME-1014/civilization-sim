# 栖年 · 动态文明与城市模拟

在线演示：https://flame-1014.github.io/civilization-sim/

十二座城市共同生活在一个会变化的世界中。粮食、淡水、能源和建材由产业生产；城市消费生产出的资源，也可以通过有运力上限的交通网络向其他城市买卖。每过一年，市场价格、城市决策、生活质量、GDP、生态和人口都会根据上一年的状态重新计算。

这是一套可以真正运行的系统模型，不依赖实时时钟、服务器端或随机演示数据。统一的世界种子和情景会得到完全相同的模拟、事件和价格历史。

## 启动

只需要 Node.js 20 或更新版本。项目没有运行时依赖，不需要安装第三方包。

```sh
npm run dev
```

然后打开命令行显示的地址（默认为 `http://127.0.0.1:4280`）。PowerShell 如需指定端口，可运行 `$env:PORT = "4281"; npm run dev`。

```sh
npm test            # 资源与经济模型、可复现性、长期稳定性和场景测试
npm run simulate    # 六种情景各运行 100 年，自动生成结果与审计报告
npm run build       # 生成无依赖的静态站点 dist/
```

Chrome 或 Edge 可以额外运行完整的地图、干预和移动版端到端测试。它作为 `npm test` 的一部分运行；找不到 Playwright 和本地浏览器时，端到端测试会安全跳过，仍可运行全部 Node.js 内置模拟测试。

## 使用界面

左侧选择情景和世界种子，点击「创建新世界」开始新一轮模拟。世界地图呈现每座城市和由最短成本连接组成的陆上交通网络；点击城市切换右侧档案。经济、人口、环境和资源储备图层会依据实时模拟值改变颜色、存量标签和节点亮度，贸易线也根据实际成交的货物流量改变明暗和粗细。历史图表跟踪总 GDP、人口、幸福指数和生态评分；资源卡片呈现所选城市的储备和当前市场价格。

按“开始演进”启用实时逐年更新。你可以暂停、向前或向后推演；1×、5×和20×改变推进速度。向后推演会从种子和所选情景重新计算历史，保证没有隐藏的存档状态。按空格可以开始或暂停，按 `Alt + →` 向前推演一年。点击协调发展方案会对全体城市下达持续八年的政策指令，城市仍会优先处理本地紧急的能源与资源短缺。

资源危机、迁徙潮、极端灾害和技术突破按钮会**直接改变城市状态**，之后的贸易与城市决策随之调整。数据下载按钮可将城市、连接、价格、事件和历史导出为 JSON。

## 模拟架构

`src/core/model.js` 负责可复现随机数、城市蓝图、参数化城市差异和交通网络生成。`src/core/systems.js` 实现 `WorldManager`、`SimulationEngine`、`CitySystem`、`PopulationSystem`、`EconomySystem`、`ResourceSystem`、`IndustrySystem`、`TransportSystem`、`EnergySystem`、`EnvironmentSystem`、`EventSystem` 和 `PolicySystem`。`src/ui/app.js` 订阅每年结算后的状态，并绘制地图、城市档案、图表与事件记录。`docs/MODEL.md` 逐条说明反馈关系、尺度定义和边界条件。

世界是一片虚构大陆，坐标和地貌用于表现交通距离、河流、山区、港口和城市分区；它不是实际测绘数据。经济、人口、资源和运输量均为内置模型的合成指标，适合比较**同一模型内**的长期反馈，不代表任何现实城市或现实货币统计。

## 自动验证和长期结果

`npm test` 会验证种子可复现、城市确实不同、交易受通道运力限制、市场价格会响应供需、人口迁移与城市决策、事件影响、政策持续时间、资源和价格边界，以及最长 225 年的模拟。

`npm run simulate` 会记录 100 年的基准、能源紧缺、迁徙潮、生态治理、资源短缺和极端环境六种情景；越界时以非零代码退出。每次运行覆盖生成新的 `docs/simulation-results.json` 并打印摘要。已验证结果、城市分布和边界情况见 [`docs/SIMULATION-RESULTS.md`](docs/SIMULATION-RESULTS.md)。

## 项目结构

```text
civilization-sim/
├── index.html
├── styles.css
├── dev-server.mjs
├── src/
│   ├── core/model.js
│   └── core/systems.js
├── src/ui/app.js
├── tests/
│   ├── simulation.test.js
│   └── browser.test.js
├── scripts/
│   ├── build.js
│   └── long-run.js
└── docs/
    ├── MODEL.md
    ├── SIMULATION-RESULTS.md
    └── simulation-results.json
```
