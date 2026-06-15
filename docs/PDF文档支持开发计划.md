# PDF 文档支持开发计划

本文档用于跟踪 KindEdit PDF 文档支持的开发任务。实施过程中如实际方案与本计划不同，必须同步更新本文档和 `docs/KindEdit-软件开发规格说明.md`。

## 1. 需求理解

本轮 PDF 支持需要覆盖以下能力：

- 打开普通 PDF 文件。
- 打开加密 PDF 文件，打开时输入密码，密码错误时可重新输入，取消时不改变当前标签。
- 在左侧视图显示 PDF 目录结构，也就是大纲或书签。
- 支持编辑目录结构，包括重命名、新增、删除和调整目标页。
- 支持对 PDF 内容进行标注，并能保存 KindEdit 生成的标注。
- 继续保持现有多标签、脏状态、关闭确认、会话恢复、跨平台路径和构建打包规则。

## 2. 默认技术方案

默认实施路线采用用户指定的组合：

- PDF.js：前端 PDF 加载、页面渲染、密码加载流程、大纲读取和页面跳转。
- Fabric.js：PDF 页面覆盖层标注交互、对象选择、绘制、编辑和标注序列化。
- lopdf：Rust 侧 PDF 文件校验、密码处理、大纲写入、KindEdit 标注写入和保存。

需要新增的辅助依赖：

- `base64`：Rust 向前端传递 PDF 二进制内容时使用，职责仅限二进制编码。

暂不采用的备选路线：

- PDFium / `pdfium-render`：能力完整，但需要打包 Pdfium 原生库或处理静态链接，增加 macOS/Windows 本地打包和 GitHub Actions 复杂度。
- PDF.js 官方完整 viewer：功能多，但 UI、工具栏和状态管理体系与 KindEdit 不一致，本轮只使用核心 API。
- 纯 JS PDF 写入库：可以减少 Rust 侧代码，但大纲、加密和标准注释写入的可控性不足。

## 3. 开发任务

### 阶段 1：文档类型与依赖接入

- [x] 在 `package.json` / `package-lock.json` 增加 PDF.js 和 Fabric.js。
- [x] 在 `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` 增加 `lopdf` 和 `base64`。
- [x] 在 Rust `DocumentRegistry` 注册 `pdf` 文档类型。
- [x] 在前端打开文件过滤器、类型映射和标签状态中加入 PDF 类型。
- [x] 按新功能规则将版本从 `0.4.37` 递增为 `0.5.37`，并同步所有版本声明位置。
- [x] 修正 macOS 打开面板中过滤器导致 PDF 置灰不可选的问题，并支持将 PDF 文件拖入主窗口打开。

### 阶段 2：PDF 打开与密码流程

- [x] 新增 Rust PDF 打开命令，读取 PDF 二进制，校验普通 PDF，识别加密 PDF。
- [x] 密码缺失或错误时返回结构化错误，前端显示应用内密码弹窗。
- [x] 前端 PDF 打开流程创建 `pdf` 标签，保存 PDF 大纲和标注草稿状态。
- [x] 确保取消密码输入或打开失败时不创建新标签、不影响当前标签。
- [x] 将工具栏打开和主窗口拖入文件统一到同一条按路径打开流程，确保普通 PDF 和加密 PDF 行为一致。

### 阶段 3：PDF 阅读视图

- [x] 新增 PDF 视图组件，使用 PDF.js 渲染页面。
- [x] 支持滚动、多页显示、当前页识别、缩放和页面渲染任务取消。
- [x] 页面渲染按可见区域或邻近页惰性执行，避免大型 PDF 一次性全量渲染。
- [x] 状态栏显示 PDF 类型、页码或错误状态。

### 阶段 4：PDF 大纲显示与编辑

- [x] 使用 PDF.js / Rust 结果生成左侧大纲树。
- [x] 左侧大纲树沿用 KindEdit 树视图密度、字体大小和右键菜单风格。
- [x] 点击大纲节点跳转到目标页。
- [x] 支持重命名、新增同级、新增子级、删除和修改目标页。
- [x] 大纲变化后更新 PDF 标签内容并标记为脏。

### 阶段 5：PDF 标注

- [x] 在 PDF 页面上叠加 Fabric.js 标注层。
- [x] 支持选择、手写、高亮、矩形和文字备注。
- [x] 标注坐标以 PDF 页面坐标保存，缩放后保持对齐。
- [x] 标注变化后更新 PDF 标签内容并标记为脏。
- [x] 再次打开带有 KindEdit 标注的 PDF 时恢复可编辑标注。

### 阶段 6：保存与数据安全

- [x] 新增 Rust PDF 保存命令，写入当前大纲和 KindEdit 标注。
- [x] 保存时移除旧的 KindEdit 标注对象，避免重复写入。
- [x] 普通 PDF 保存后清除脏状态。
- [x] 加密 PDF 保存时使用内存中的密码；缺少密码时重新请求密码或中止保存。
- [x] 保存失败时保留前端未保存状态并显示错误。
- [x] 关闭标签、关闭窗口和会话恢复继续符合现有数据安全规则。

### 阶段 7：验证

- [x] 执行 `npm run build`。
- [x] 执行 `cargo check --manifest-path src-tauri/Cargo.toml`。
- [x] 执行 `./build_package.command`。
- [x] 在 macOS 打包产物中通过工具栏“打开”按钮选择 PDF，确认 PDF 文件可选、Open 按钮可用，并能创建 PDF 标签进入阅读视图。
- [x] 修复 PDF 左侧书签跳转和右侧滚轮滚动后回弹到第 1 页的问题，当前页改由 PDF 滚动容器计算，且 PDF 加载流程不再依赖不稳定状态栏回调。
- [x] 补齐 PDF.js `wasm`、`cmaps` 和 `standard_fonts` 资源，避免扫描版 PDF 或 JBIG2 图像页在 KindEdit 中因资源缺失显示为空白。
- [x] 针对 Tauri WebView 调整 PDF.js 图像解码路径，改用 PDF.js legacy runtime/worker，禁用不稳定的 worker OffscreenCanvas / ImageDecoder 默认路径，并在渲染失败时显示错误。
- [x] PDF 页面只保留当前页附近的 canvas/Fabric 实例，离开范围后释放渲染层，降低大型扫描 PDF 滚动卡顿。
- [x] 修复大型扫描 PDF 连续滚动翻页后整个 WebView 变成白屏的问题，页面渲染完成或离开渲染窗口后清理 PDF.js page 资源、canvas backing store 和 Fabric 异步销毁异常。
- [x] 修复 PDF 滚动卸载页面时 Fabric.js 移动 React 管理的标注 canvas 导致 `NotFoundError: removeChild` 并触发整窗白屏的问题，标注层改为 React 宿主容器 + Fabric 内部命令式 canvas。
- [ ] 在 macOS 实际运行验证普通 PDF 打开、加密 PDF 密码打开、大纲跳转、大纲编辑、标注新增/保存/恢复。
- [ ] 在交付说明中明确 Windows 未验证项和建议验证方式。

验证说明：已启动 `0.5.38` 打包产物并打开系统文件对话框；在 macOS 原生 Open 面板中选中 PDF 后，Open 按钮从禁用变为可用，点击后应用创建新的 PDF 标签并进入 PDF 阅读视图。主窗口拖入 PDF 的路径由 `onDragDropEvent` 接入并通过前端构建验证，但本环境未完成真实拖放自动化操作。加密 PDF 未在本环境生成和实机验证。`0.5.40` 已完成重新打包，产物为 `src-tauri/target/release/bundle/macos/KindEdit.app` 和 `src-tauri/target/release/bundle/dmg/KindEdit_0.5.40_aarch64.dmg`。`0.5.41` 使用 PDF.js legacy build 和 `@napi-rs/canvas` 对问题 PDF 第 18 页完成渲染对照，确认保守解码路径可输出非白图像内容；`0.5.42` 修正前端实际入口为 PDF.js legacy runtime/worker，避免 Tauri WebView 使用 PDF.js modern bundle 依赖的较新运行时 API 后出现空白页；仍需用新打包产物补充 macOS 实机书签跳转、滚轮滚动、扫描页显示和连续滚动性能验证。

## 4. 验收标准

- 普通 PDF 可以打开并显示页面。
- 普通 PDF 可以通过工具栏“打开”按钮选择，也可以直接拖入 KindEdit 主窗口打开。
- 加密 PDF 会弹出密码输入；正确密码打开，错误密码提示并可重试，取消不改变当前工作区。
- PDF 左侧大纲可以展开、折叠、跳转，并支持新增、重命名、删除。
- 新增标注显示在对应页面，缩放和滚动后仍与页面内容对齐。
- PDF 大纲或标注修改后标签显示脏状态，保存成功后脏状态消失。
- 保存后的 PDF 再次打开时，KindEdit 写入的大纲和标注仍可见且可继续编辑。
- 现有 JSON/XML/YAML/Markdown/文本文件打开、保存、树视图、右键菜单和会话恢复不回退。
