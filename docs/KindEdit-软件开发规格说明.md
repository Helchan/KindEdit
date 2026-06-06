# KindEdit 软件开发规格说明

本文档描述 KindEdit 当前源码实现对应的产品行为、技术架构、模块边界、数据流、配置、文件处理、文档类型支持、跨平台要求和构建交付规范。后续每次功能变更、用户可见行为变更、构建打包流程变更、配置变更或文档类型支持变更，都必须同步更新本文档。

## 1. 项目概述

KindEdit 是一款基于 Tauri 2、React 18、TypeScript 和 Rust 的跨平台桌面编辑器应用，当前主要面向 Windows 和 macOS。应用提供多标签文本编辑、结构化文档树视图、Markdown 所见即所得编辑、格式化与压缩、主题与字体配置、会话恢复等能力。

当前版本号为 `0.1.19`，版本声明至少存在于以下位置：

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

版本号递增时必须同步检查并更新所有实际参与构建、打包、显示或发布的版本声明位置。

## 2. 技术栈与运行形态

当前技术版本基线：

| 类型 | 声明位置 | 声明版本 | 当前锁定/确认版本 | 说明 |
| --- | --- | --- | --- | --- |
| Tauri Rust crate | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | `tauri = "2"` | `2.11.2` | Rust 后端与桌面运行时核心版本。 |
| Tauri CLI | `package.json`, `package-lock.json` | `@tauri-apps/cli = ^2.0.0` | `2.11.2` | 官方构建和打包命令入口依赖。 |
| Tauri JavaScript API | `package.json`, `package-lock.json` | `@tauri-apps/api = ^2.0.0` | `2.11.0` | 前端访问 Tauri 能力的 API 版本。 |
| React | `package.json`, `package-lock.json` | `react = ^18.3.1` | `18.3.1` | 前端 UI 框架版本。 |
| React DOM | `package.json`, `package-lock.json` | `react-dom = ^18.3.1` | `18.3.1` | React DOM 渲染版本。 |
| Monaco Editor | `package.json`, `package-lock.json` | `monaco-editor = ^0.50.0` | `0.50.0` | 非 Markdown 文档的核心编辑器。 |
| Monaco React Adapter | `package.json`, `package-lock.json` | `@monaco-editor/react = ^4.6.0` | `4.7.0` | Monaco 与 React 的适配层。 |
| Milkdown | `package.json`, `package-lock.json` | `@milkdown/kit = ^7.21.1` | `7.21.1` | Markdown 所见即所得编辑器核心能力。 |
| Milkdown React Adapter | `package.json`, `package-lock.json` | `@milkdown/react = ^7.21.1` | `7.21.1` | Milkdown 与 React 的适配层。 |
| Rust edition | `src-tauri/Cargo.toml` | `edition = "2021"` | Rust 2021 | 当前仓库未固定 `rust-toolchain`，不能假设使用高于当前构建环境的 Rust 语言特性。 |

开发和修改代码时，必须优先以 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中的声明和锁定版本为准。若依赖升级、降级或新增会影响上述基线，必须同步更新本文档、锁文件和对应验证说明。

前端技术栈：

- React 18
- TypeScript
- Vite
- Zustand
- Monaco Editor
- Milkdown
- Tauri JavaScript API
- Tauri Dialog 插件

后端技术栈：

- Rust
- Tauri 2
- serde / serde_json / serde_yaml
- quick-xml
- sqlformat
- dirs
- ropey

运行形态：

- 开发入口由 Tauri 配置中的 `beforeDevCommand` 启动 `npm run dev`。
- 前端开发地址为 `http://localhost:1420`。
- 生产构建由 Tauri 读取 `../dist` 作为前端产物。
- 主窗口标题为 `KindEdit`，默认尺寸为 `1200x800`，允许调整窗口大小，默认不全屏。

## 3. 架构边界

KindEdit 采用前端交互编排、Rust 后端能力承载的结构。

前端职责：

- 应用壳、工具栏、标签栏、状态栏、设置弹窗、右键菜单、编辑区布局。
- 标签页状态、活动标签、脏状态、当前内容、文档类型和大文件标记。
- Monaco/Milkdown 编辑器挂载、内容同步、光标同步、右键菜单触发和编辑器快捷键。
- 打开/保存文件对话框调用。
- 配置加载后的 UI 应用，例如主题、字体大小、同步显示。
- 会话恢复流程编排，以及会话变更后的防抖保存触发。

Rust 后端职责：

- 文件读取与写入。
- 文档类型注册、路径和内容检测。
- JSON、XML、YAML 等结构化文档解析与树构建。
- 支持类型的格式化与压缩。
- 配置加载和持久化。
- 会话加载和持久化。
- 系统主题检测与窗口主题设置。
- 平台相关目录解析。

模块边界：

- `src/App.tsx` 负责应用级流程编排，不应堆入文档解析、文件 IO 或复杂平台逻辑。
- `src/stores/*` 保存前端 UI 状态和配置状态。
- `src/components/Editor/*` 负责编辑器适配、语言映射、主题和编辑器相关交互。
- `src/components/Tabs/*` 负责标签 UI。
- `src/components/TreeView/*` 负责树形结构展示、节点点击和分栏辅助交互。
- `src/components/Settings/*` 负责设置 UI。
- `src-tauri/src/commands/*` 是前端调用 Rust 能力的命令边界。
- `src-tauri/src/documents/*` 是文档类型扩展点。
- `src-tauri/src/syntax/*` 是 Rust 侧语法高亮扩展点。
- `src-tauri/src/core/*` 承载配置、会话、平台和大文本缓冲等基础能力。

新增功能必须放在职责最匹配的位置。不得因为实现方便把文档解析、平台能力或文件系统能力塞入前端组件，也不得把纯 UI 状态强行下沉到 Rust。

## 4. 应用界面

当前主界面由以下区域组成：

- 顶部工具栏：打开文件、保存、回退、重做、设置、关于；打开/保存/回退/重做属于同一组，右侧使用竖线与设置/关于分隔。
- 标签栏：显示已打开标签、脏状态、文档类型，支持选择、关闭和新建标签。
- 主编辑区域：根据文档类型显示单编辑器、树视图+编辑器，或 Markdown 编辑器。
- 底部状态栏：显示状态消息、错误信息、文档类型和 Monaco 光标位置。
- 设置弹窗：配置主题、编辑器字体、树视图字体、同步显示和 SQL 格式化关键字大写开关。
- 编辑器右键菜单：提供格式化、压缩、类型切换、同步、复制、粘贴、清空等操作。

关于弹窗为应用内轻量浮层，按从上到下的顺序显示应用图标、软件名 `KindEdit`、`版本 {version}` 和 `Copyright 2026 Helchan. All rights reserved.`，不显示确认按钮，不显示技术栈信息；视觉尺寸、字号、字重、边框、圆角和阴影应与设置弹窗保持同一套克制的应用内弹窗风格；点击弹窗之外的应用区域时自动关闭，点击弹窗内容区域不会关闭。

应用图标：

- KindEdit 使用无底座的双文档层图标：后层蓝色文档页、前层白色竖向文档页、旧版质感的自然折角、文本线条和绿色插入光标共同表达文本编辑、代码编辑和文档处理能力。
- 图标不显示外层直角底图、圆角矩形底座或主题色底座；双文档图形之外的区域必须保持透明，双文档组合应保持偏竖向的文档比例，并按高可见度主体边界进行视觉居中，避免在桌面、Dock、启动器或安装包视图中出现背景块、贴边压迫感、视觉偏移或多余留白。
- 后层蓝色文档不得在前层白色文档右上折角区域外露；右上折角应采用接近旧版图标的较小卷页形态、弧形下沿和轻量柔和投影。
- 桌面打包图标由 `src-tauri/icons/icon.png` 派生，macOS 使用 `src-tauri/icons/icon.icns`，Windows 使用 `src-tauri/icons/icon.ico`，并保留 `32x32.png`、`64x64.png`、`128x128.png`、`128x128@2x.png` 等 PNG 尺寸资源。
- Tauri 打包配置在 `src-tauri/tauri.conf.json` 的 `bundle.icon` 中显式引用桌面图标资源，确保 macOS 和 Windows 安装产物使用一致的应用图标。

## 5. 标签页行为

启动时默认存在一个未命名标签：

- 标题：`Untitled`
- 文件路径：无
- 文档类型：`text`
- 内容：空
- 脏状态：否
- 用户手动指定类型：否

新建标签会追加到标签列表末尾并自动激活。新建的空白标签必须使用不与当前标签列表重复的未命名标题：`Untitled` 视为第 1 个未命名标题，后续同类空白标签使用 `Untitled 2`、`Untitled 3` 等序号。恢复会话后再次新建空白标签时，必须基于已恢复标签标题重新计算可用序号，避免与当前仍存在的未命名标签重名。关闭最后一个标签时，不会让应用进入无标签状态，而是替换为新的空白 `Untitled` 标签。

关闭脏标签时，应用通过应用内确认保存弹窗提示。弹窗视觉尺寸、按钮尺寸、按钮样式、间距、边框、圆角和阴影必须与设置弹窗保持同一套应用内弹窗风格。

- 标题：`确认保存`
- 消息：`「{subject}」有未保存的修改，确认是否保存？`
- `{subject}`：已打开文件使用完整文件路径；未命名文档使用标签名称。
- 按钮顺序：`是`、`否`、`取消`

按钮逻辑：

- `是`：保存当前标签。保存成功后关闭标签；无文件路径时进入另存为流程，用户取消另存为或保存失败时保持标签打开。
- `否`：不保存当前标签，丢弃当前未保存修改并关闭标签。
- `取消`：取消本次关闭操作，不保存、不丢弃、不关闭标签。

关闭窗口时，如果存在未保存标签，应用通过同一应用内确认保存弹窗处理：

- 只有一个未保存标签时，按钮顺序为：`是`、`否`、`取消`。
- 存在多个未保存标签时，按标签逐个提示当前处理的标签，按钮顺序为：`是`、`否`、`全否`、`取消`。
- `是`：保存当前提示的标签。保存成功后继续处理下一个未保存标签；全部处理完成后应用尝试保存会话，最多等待约 1.5 秒，然后销毁窗口。无文件路径时进入另存为流程，用户取消另存为或保存失败时中止关闭窗口。
- `否`：不保存当前提示的标签，丢弃当前标签未保存修改，并继续处理下一个未保存标签。已打开文件会重新读取磁盘内容回到已保存状态；未命名文档会清空内容。
- `全否`：不保存当前提示的标签以及后续所有未保存标签，统一丢弃这些修改，然后继续关闭窗口。已打开文件会重新读取磁盘内容回到已保存状态；未命名文档会清空内容，避免下次启动恢复用户已选择丢弃的内容。
- `取消`：取消整个关闭窗口操作；已经成功保存的标签保持已保存状态，尚未处理的标签保持原状态，窗口不关闭。

## 6. 文件打开与保存

打开文件流程：

1. 前端调用系统打开文件对话框。
2. 对话框支持单选。
3. 文件过滤器包括 All Files、JSON、XML、Markdown、SQL、Code。
4. 选中文件后调用 Rust `open_file` 命令读取内容。
5. Rust 检查文件是否存在，不存在时返回 `File not found: {path}`。
6. Rust 使用 `TextBuffer` 读取文件内容并判断是否为大文件。
7. Rust 根据路径和内容检测文档类型。
8. Rust 尝试构建文档树。
9. 前端创建新标签并激活，标题取文件名。

保存文件流程：

1. 若当前标签已有路径，则直接保存到原路径。
2. 若当前标签没有路径，则调用系统保存文件对话框。
3. 用户取消保存对话框时不修改标签状态。
4. 保存内容优先取当前编辑器实时值，其次取标签缓存内容。
5. Rust `save_file` 会确保父目录存在。
6. 大内容使用 `TextBuffer` 写入，普通内容使用 `fs::write` 写入。
7. 保存成功后标签更新为非脏状态，标题更新为文件名，状态栏显示 `File saved`。
8. 保存成功后立即触发一次会话保存。

文件错误显示：

- 打开、保存、解析、格式化或压缩失败时，前端将错误字符串显示到状态栏并标记为错误状态。
- 失败时不得静默丢弃用户编辑内容。

## 7. 编辑器行为

非 Markdown 文档使用 Monaco Editor。当前默认配置：

- 字体：`JetBrains Mono`、`Fira Code`、`Cascadia Code`、Menlo、Monaco、Courier New、monospace。
- 行号开启。
- 小地图开启。
- 默认不自动换行。
- Tab 宽度为 2，插入空格。
- 自动布局开启。
- 选区内渲染空白字符。
- 括号配对着色和引导线开启。
- 平滑滚动开启。
- 鼠标滚轮缩放开启。
- 列选择开启。
- 多光标修饰键使用 Monaco 的 `ctrlCmd` 策略。
- Monaco 原生右键菜单关闭，使用应用自定义右键菜单。
- 当前应用关闭 Monaco occurrencesHighlight，由自定义追加选择高亮接管相关场景。

大文件模式：

- 当 Rust 读取结果标记为大文件时，编辑器使用大文件保护配置。
- 大文件保护配置关闭小地图、关闭折叠、关闭空白字符渲染，并启用 Monaco largeFileOptimizations。

追加选择高亮：

- macOS 使用 Command 作为追加选择修饰键。
- Windows 使用 Ctrl 作为追加选择修饰键。
- 使用追加选择修饰键进行鼠标选择或双击选择时，会把当前选区文本加入高亮查询。
- 非追加选择鼠标操作会清空追加高亮。
- macOS 下 Ctrl+Click 触发的 contextmenu 会被拦截，避免误触发应用右键菜单。

Markdown 文档使用 Milkdown：

- 启用 commonmark、GFM、listener、history、prism 和 nord 主题。
- Markdown 编辑器以所见即所得方式呈现。
- 切换标签时通过 `tabId` 重新挂载 MilkdownProvider，确保加载当前标签内容。
- Markdown 查找支持大小写匹配、全词匹配和正则。
- Markdown 替换支持替换当前匹配和替换全部。
- 顶部工具栏“回退”和“重做”只作用于当前活动标签页；非 Markdown 文档调用当前 Monaco 实例的 undo/redo，Markdown 文档调用当前 Milkdown/ProseMirror 实例的 undo/redo。

## 8. 快捷键

全局快捷键：

- `Mod+S`：保存当前文件。
- `Mod+O`：打开文件。
- `Mod+T`：新建标签。
- `Mod+W`：关闭当前标签。

其中 `Mod` 在 macOS 上对应 Command，在 Windows 上对应 Ctrl。

Markdown 编辑器快捷键：

- `Mod+F`：打开查找。
- macOS `Command+Option+F`：打开替换。
- Windows `Ctrl+H`：打开替换。
- 查找框中 `Enter`：跳到下一个匹配。
- 查找框中 `Shift+Enter`：跳到上一个匹配。
- 查找打开时 `Escape`：关闭查找/替换。
- `Mod+1` 到 `Mod+6`：标题 1 到标题 6。
- `Mod+0`：转为普通段落。
- `Mod+Shift+\``：行内代码。
- `Mod+Shift+X`：删除线。
- `Mod+Shift+K`：代码块。
- `Mod+Shift+O`：有序列表。
- `Mod+Shift+U`：无序列表。
- `Mod+Shift+.`：引用块。
- `Mod+Shift+]`：列表项增加缩进。
- `Mod+Shift+[`：列表项减少缩进。
- `Mod+K`：链接。
- `Mod+-`：水平分割线。

新增快捷键必须检查 Monaco、Milkdown、浏览器默认行为、Tauri 窗口行为和平台习惯，避免破坏编辑器基础交互。

## 9. 文档类型支持

文档类型由 Rust `DocumentRegistry` 注册，检测顺序为 JSON、XML、Markdown、YAML、Properties、SQL、Java、Python、JavaScript、Log、Text。路径匹配优先于内容检测；未匹配时回退到 Text。

当前支持矩阵：

| 类型 | 扩展名 | 视图 | 解析 | 树视图 | 格式化 | 压缩 |
| --- | --- | --- | --- | --- | --- | --- |
| JSON | `.json`, `.jsonc` | 树+编辑器 | serde_json | 支持 | 支持 | 支持 |
| XML | `.xml`, `.xsl`, `.xslt`, `.svg`, `.xhtml`, `.plist` | 树+编辑器 | quick-xml | 支持 | 支持 | 支持 |
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` | Milkdown | 始终有效 | 不支持 | 不支持 | 不支持 |
| YAML | `.yml`, `.yaml` | 树+编辑器 | serde_yaml | 支持 | 支持 | 不支持 |
| Properties | `.properties`, `.env`, `.ini`, `.cfg` | 单编辑器 | 行格式检查 | 不支持 | 支持 | 不支持 |
| SQL | `.sql`, `.ddl`, `.dml` | 单编辑器 | 括号检查 | 不支持 | 支持 | 不支持 |
| Java | `.java` | 单编辑器 | 括号检查 | 不支持 | 不支持 | 不支持 |
| Python | `.py`, `.pyw`, `.pyi` | 单编辑器 | 始终有效 | 不支持 | 不支持 | 不支持 |
| JavaScript | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx` | 单编辑器 | 括号检查 | 不支持 | 不支持 | 不支持 |
| Log | `.log` | 单编辑器 | 始终有效 | 不支持 | 不支持 | 不支持 |
| Text | `.txt`, `.text` | 单编辑器 | 始终有效 | 不支持 | 不支持 | 不支持 |

前端当前视图映射：

- `json`、`xml`、`yaml` 显示为树视图 + Monaco 编辑器。
- `markdown` 显示为 Milkdown 编辑器。
- 其他类型显示为单 Monaco 编辑器。

Monaco 语言映射：

- `json` -> `json`
- `xml` -> `xml`
- `markdown` -> `markdown`
- `yaml` -> `yaml`
- `properties` -> `ini`
- `sql` -> `sql`
- `java` -> `java`
- `python` -> `python`
- `javascript` -> `javascript`
- `text` -> `plaintext`
- `log` -> `log`

注意：当前 Rust 文档类型支持 TypeScript 扩展名，但前端文档类型仍映射为 `javascript` 语言 ID，而不是 Monaco 的 `typescript`。

## 10. 解析、树视图与同步

编辑内容变化后，前端进行约 140ms 防抖，再调用 Rust 解析命令。

新建无路径标签在满足以下条件时会自动检测类型：

- 标签没有文件路径。
- 用户尚未手动切换过类型。
- 当前文档类型为 `text`。
- 内容去除空白后长度大于等于 5。

如果检测到非 `text` 类型，前端更新标签类型并同步 Monaco 语言。若新类型需要树视图，则立即构建树。

树视图行为：

- JSON、XML、YAML 当前显示结构树。
- 点击树节点时，如果同步显示开启，Monaco 光标移动到节点起始 offset，并滚动到视图中心。
- Monaco 光标变化时，如果同步显示开启，前端以约 100ms 防抖查找包含当前 offset 的最内层树节点，并高亮对应路径。
- 树视图分栏宽度通过拖拽调整，范围约为窗口宽度的 15% 到 60%。

## 11. 格式化、压缩与右键菜单

编辑器右键菜单当前包含：

- 格式化
- 压缩
- 类型
- 同步
- 复制
- 粘贴
- 清空

格式化按钮启用类型：

- `json`
- `xml`
- `sql`
- `yaml`
- `properties`

压缩按钮启用类型：

- `json`
- `xml`

类型子菜单当前按扩展名展示：

- `.json` -> `json`
- `.xml` -> `xml`
- `.yaml` -> `yaml`
- `.md` -> `markdown`
- `.sql` -> `sql`
- `.java` -> `java`
- `.py` -> `python`
- `.js` -> `javascript`
- `.txt` -> `text`
- `.log` -> `log`
- `.properties` -> `properties`

用户手动切换文档类型后，标签会标记为 `userSetType: true`，后续自动类型检测不应覆盖该选择。

复制行为：

- 有选区时复制选区文本。
- 无选区时复制整个编辑器内容。

粘贴行为：

- 从系统剪贴板读取文本。
- 有编辑器实例且剪贴板文本非空时，向编辑器触发输入。

清空行为：

- 当前标签内容被设为空字符串。
- 标签标记为脏。

## 12. 设置与主题

设置项：

- 主题：`system`、`light`、`dark`
- 编辑器字体大小：8 到 28
- 树视图字体大小：8 到 28
- 同步显示：开关
- SQL 格式化大写关键字：开关

设置弹窗重置按钮使用的默认值：

- 主题：`system`
- 编辑器字体大小：14
- 树视图字体大小：13
- 同步显示：true
- SQL 格式化大写关键字：true

Rust 配置结构在配置文件缺失字段时的反序列化默认值：

- 主题：`system`
- 编辑器字体大小：10
- 树视图字体大小：10
- 同步显示：true
- SQL 格式化大写关键字：true

因此，当前首次启动、配置文件缺失字段和设置弹窗重置后的字体默认值并不完全一致。后续如调整该行为，必须同步修改前端默认值、Rust 默认值和本文档。

主题行为：

- 启动时加载配置并同步到主题 store。
- `system` 会读取系统主题。
- macOS 通过 `defaults read -g AppleInterfaceStyle` 检测系统深色模式。
- Windows 通过注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize` 的 `AppsUseLightTheme` 检测系统主题。
- 主题应用后会设置 `document.documentElement` 的 `data-theme`。
- 前端调用 Rust `set_window_theme` 同步原生窗口主题。
- 系统主题变化事件会更新当前 resolved theme。

配置持久化：

- 配置目录通过 `dirs::config_dir()` 获取后追加 `KindEdit`。
- macOS 预期目录为 `~/Library/Application Support/KindEdit/`。
- Windows 预期目录为 `%APPDATA%\KindEdit\`。
- Linux 预期目录为 `$XDG_CONFIG_HOME/KindEdit/` 或 `~/.config/KindEdit/`。
- 配置文件为 `settings.json`。

## 13. 会话恢复

会话数据存储在配置目录下的 `tabs/session.json`，大内容可存储为独立 `.txt` 自动保存文件。

保存策略：

- 标签列表或活动标签变化后，前端以约 3 秒防抖保存会话。
- 保存文件成功后立即保存会话。
- 窗口关闭前尝试保存会话，最多等待约 1.5 秒。
- 会话保存内容包括标签 id、标题、文件路径、文档类型、脏状态、内容和 autosave 信息。

恢复策略：

- 启动时先加载配置，再加载会话。
- 如果会话中存在文件路径，前端优先重新读取磁盘文件内容，并重新检测文档类型。
- 如果重新读取失败，则使用会话保存的内容。
- 无文件路径但内容非空时，前端尝试按内容检测文档类型。
- 恢复后的标签当前会被标记为非脏状态。
- 如果没有可恢复标签，则保留默认空白标签。

大内容会话：

- Rust 会话保存对长度大于等于 5MB 的内容使用独立自动保存文件。
- 会话加载时如存在 autosave 文件，会尝试读取并恢复内容。
- 读取 autosave 文件失败时，保留当前 session 中的内容字段状态。

## 14. 数据安全要求

KindEdit 是编辑器应用，任何文件打开、保存、关闭、会话恢复、格式化、压缩、类型切换或清空行为都必须优先保护用户数据。

必须保持的安全行为：

- 未保存标签关闭前必须确认。
- 窗口关闭且存在未保存内容时必须确认。
- 保存失败必须显示错误，不得将标签误标为非脏。
- 格式化或压缩失败不得覆盖原内容。
- 用户取消打开或保存对话框时不得改变当前文档。
- 自动类型检测不得覆盖用户手动指定的文档类型。
- 会话恢复读取原文件失败时应保留会话内容作为降级方案。

当前已知需要谨慎维护的行为：

- 保存文件会创建缺失父目录。后续如改变该行为，必须评估误创建目录和路径输入错误的风险。

## 15. 性能要求

核心交互必须保持流畅，包括输入、光标移动、滚动、选择、拖拽、标签切换、树视图展开折叠、文件打开保存和 Markdown 编辑。

当前性能策略：

- 编辑内容变化后解析使用 140ms 防抖。
- 光标到树节点反向同步使用 100ms 防抖。
- 会话保存使用 3000ms 防抖。
- 大文件使用 `TextBuffer` 读取和写入。
- 大文件模式关闭小地图、折叠和空白字符渲染。
- Monaco 自动布局开启，避免窗口变化时手动全量重排。

新增解析、高亮、格式化、预览同步或树构建能力时，不得在输入主路径中加入不必要的同步重计算、阻塞式 IO、全量渲染或高频全局状态更新。

## 16. 跨平台要求

KindEdit 必须同时支持 Windows 和 macOS。平台相关行为必须显式处理。

当前跨平台实现：

- 快捷键统一使用 `Mod` 概念，macOS 为 Command，Windows 为 Ctrl。
- 追加选择修饰键 macOS 使用 Command，Windows 使用 Ctrl。
- 系统主题检测分别处理 macOS 和 Windows。
- 配置目录通过 `dirs` 获取平台目录。
- 文件名解析同时考虑 `/` 和 `\` 路径分隔符。
- 文件对话框通过 Tauri Dialog 插件调用系统能力。
- 窗口主题通过 Tauri window API 设置。

当前环境如只能验证 macOS，则 Windows 行为必须在交付说明中明确未真实验证，并建议在 Windows 上至少验证：

- 文件路径含空格、中文和反斜杠。
- Ctrl 快捷键与编辑器默认快捷键冲突。
- 系统主题检测。
- 打开、保存和关闭确认对话框。
- 打包或安装产物。

## 17. 构建、打包与产物

官方构建打包入口为项目根目录：

```bash
./build_package.command
```

清理构建入口为：

```bash
./build_package.command --clean
```

脚本当前行为：

1. 进入项目根目录。
2. `--clean` 时执行 `cargo clean`。
3. 执行 `npm run tauri -- build --bundles app "$@"`。
4. 从 `package.json` 读取版本号。
5. 根据 `uname -m` 生成架构名，`arm64` 映射为 `aarch64`。
6. 检查 `.app` 是否存在。
7. 在 bundle/dmg 目录中创建临时 staging 目录。
8. 复制 `KindEdit.app` 并创建 `/Applications` 软链接。
9. 使用 `hdiutil create` 生成 dmg。

macOS 当前预期产物：

- `.app`：`src-tauri/target/release/bundle/macos/KindEdit.app`
- `.dmg`：`src-tauri/target/release/bundle/dmg/KindEdit_{version}_{arch}.dmg`

当前脚本依赖 macOS `hdiutil`，因此 Windows dmg 产物不适用。若未来需要 Windows 安装包，应优先扩展或修复 `build_package.command`，再通过该脚本实施构建打包。

## 18. 默认验证要求

前端、TypeScript、UI 或通用代码改动后，默认执行：

```bash
npm run build
```

Rust、Tauri command、文件 IO、文档处理、配置、会话或后端逻辑改动后，默认执行：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

修复、优化或新功能开发完成后，必须执行：

```bash
./build_package.command
```

如果构建打包需要清理构建产物或排查缓存问题，优先执行：

```bash
./build_package.command --clean
```

纯文档修改至少应执行文本层面的检查，例如 `git diff --check`。如果纯文档修改未影响代码、构建配置、版本或用户可执行行为，可以不执行完整构建打包，但交付说明必须明确原因。

## 19. Git 交付规则

默认交付分支为 `main`。

只有用户明确要求提交或 `commit` 时，才允许执行：

- `git add`
- `git commit`

只有用户明确要求推送或 `push` 时，才允许执行：

- `git push`

提交前必须检查 `git status` 和相关 diff，只能暂存与当前任务相关的文件。不得把无关改动、临时文件、缓存文件、构建中间产物或未确认的大型产物加入提交。

推送必须使用 SSH 方式。如果当前远程不是 SSH URL，必须先向用户说明并等待确认，不得自行改用 HTTPS 推送。

## 20. 后续维护规则

本文档必须描述当前真实行为，不得保留已经失效的旧设计、旧限制或旧流程。

必须同步更新本文档的情况包括：

- 功能新增、删除或行为调整。
- UI 文案、按钮顺序、菜单层级、默认状态或视觉效果变化。
- 快捷键变化。
- 文件打开、保存、关闭、会话恢复或配置持久化变化。
- 文档类型、解析、格式化、压缩、高亮或树视图行为变化。
- 前后端职责边界变化。
- 构建、打包、版本、产物路径或发布流程变化。
- 跨平台行为变化。

如果发现实现与本文档不一致，必须先确认当前真实产品行为，再选择修正文档或修正实现。涉及用户可见行为和数据安全的差异，应优先记录到 `docs/问题记录与解决方案.md`。
