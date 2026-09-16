# Windows 资源管理器风格文件夹自定义右键上下文菜单方案

## 1. 需求背景与目标
用户要求在分类管理页面的文件夹展示区域中：
1. **屏蔽浏览器默认右键菜单**：在文件夹卡片、列表行以及文件夹区域空白处，阻止浏览器默认的 Context Menu 弹出。
2. **提供自定义右键菜单 (Context Menu)**：
   - **针对文件夹节点右键**：
     - **进入/打开 (Open)**：进入该文件夹下级目录。
     - **重命名 (Rename)**：弹出重命名对话框，调用 `api.updateLibraryNode(token, folderId, { title })`。
     - **剪切 (Cut)**：标记该文件夹为剪切状态，卡片/行显示半透明/剪切指示效果。
     - **删除 (Delete)**：危险操作二次确认，调用 `api.deleteLibraryNode(token, folderId)` 移入回收站。
     - **新建子文件夹 (New Subfolder)**：快速在该文件夹下创建子文件夹。
   - **针对空白区域右键**：
     - **新建文件夹 (New Folder)**：在当前目录下新建子文件夹。
     - **粘贴 (Paste)**：当存在已剪切的文件夹且目标非自身/子代时，调用 `api.moveLibraryNode(token, cutFolderId, currentExplorerFolderId)` 移动到当前目录。
     - **返回上一级 (Back)**：若处于子目录，提供返回上级操作。
     - **刷新 (Refresh)**：刷新当前数据。
3. **交互与视觉标准**：
   - 采用类 Windows 11 / Fluent Design 现代毛玻璃卡片菜单。
   - 具备全局边界防溢出定位（视口底部/右侧反弹翻转）。
   - 点击空白处、按 `Escape` 键或滚动时自动关闭菜单。

## 2. 技术设计与实施步骤
1. **状态管理**：
   - `contextMenu`: `{ visible: boolean, x: number, y: number, targetFolder: api.BookmarkFolder | null }`
   - `cutFolder`: `{ id: string, title: string, sourceParentId: string | null } | null`
   - `folderActionModal`: `{ type: 'rename' | 'create', folderId?: string, currentTitle?: string, parentId?: string | null } | null`
2. **事件拦截与定位**：
   - 容器与卡片/列表绑定 `onContextMenu` 事件，执行 `event.preventDefault()` 和 `event.stopPropagation()`。
   - 计算鼠标 `clientX` / `clientY`，结合菜单固定宽高进行边界安全偏移。
3. **API 交互集成**：
   - 重命名：`api.updateLibraryNode(token, id, { title })`
   - 删除：`confirmDangerousAction` + `api.deleteLibraryNode(token, id)`
   - 新建：`api.createLibraryFolder(token, { title, parentId })`
   - 移动/粘贴：`api.moveLibraryNode(token, cutFolder.id, targetParentId)`
4. **测试与构建验证**：
   - 运行 `pnpm test` 与 `pnpm build:admin && pnpm build:sidebar`。
5. **版本记录与本地提交**。
