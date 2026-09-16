import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService } from '../services/nanoBananaService';
import { Task, TaskStatus, AspectRatio } from '../types';
import { Icons } from '../constants';
import ImagePreview from '../components/ImagePreview';
import Toast from '../components/Toast';

/** 「待保存」Tab（completed 且未保存为作品）分页大小 */
const COMPLETED_TASKS_PAGE_SIZE = 20;

const TASKS_SCROLL_KEY = 'tasks_scroll';
/** v2：与「仅未保存作品」筛选对齐，避免旧 session 分页/列表不一致 */
const TASKS_CACHE_KEY = 'tasks_cache_v2';
const TASKS_COMPLETED_PAGE_KEY = 'tasks_completed_page_v2';
const TASKS_COMPLETED_HAS_MORE_KEY = 'tasks_completed_has_more_v2';

/** 「待保存」Tab 下列表项：已完成且尚未保存为作品 */
function isPendingSaveTask(task: Task): boolean {
  return task.status === TaskStatus.COMPLETED && !task.saved_as_artwork;
}

/** 从旧版 user_input_prompt 解析页数，如「【自动漫画生成】标题 (6页)」 */
function parseComicPagesFromUserPrompt(prompt: string | undefined): number | undefined {
  if (!prompt) return undefined;
  const m = prompt.match(/\((\d+)页\)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (n >= 1 && n <= 10) return n;
  return undefined;
}

const Tasks: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // State
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const cached = sessionStorage.getItem(TASKS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<TaskStatus>(() => {
    return (sessionStorage.getItem('tasks_activeTab') as TaskStatus) || TaskStatus.GENERATING;
  });
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem(TASKS_CACHE_KEY);
  });
  const [error, setError] = useState<string | null>(null);

  // 保存对话框状态
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false); // 删除确认框
  const [showFailDialog, setShowFailDialog] = useState(false); // 失败提示框
  /** 弹窗「重新生成」时对应的失败任务 */
  const [failDialogTask, setFailDialogTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null); // 待删除的任务ID
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // 用于检测状态变化的 Ref
  const prevTasksRef = useRef<Task[]>([]);
  /** 已弹过失败框的任务 ID，避免同一任务重复弹框 */
  const failedTaskIdsShownRef = useRef<Set<string>>(new Set());
  /** 已弹过成功提示的任务 ID */
  const completedTaskIdsShownRef = useRef<Set<string>>(new Set());
  const [artworkName, setArtworkName] = useState('');
  const [isRelease, setIsRelease] = useState(false);
  const [showReleaseDropdown, setShowReleaseDropdown] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const releaseDropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** 从详情页返回等场景：每挂载只恢复一次滚动，避免轮询刷新时跳位 */
  const scrollRestoredForMountRef = useRef(false);
  /** 「待保存」Tab 滚动加载：防止连续触底重复请求 */
  const completedLoadMoreLockRef = useRef(false);
  const completedHasMoreRef = useRef(false);
  const completedListPageRef = useRef(1);
  const activeTabRef = useRef<TaskStatus>(activeTab);

  const [completedHasMore, setCompletedHasMore] = useState(true);
  const [loadingMoreCompleted, setLoadingMoreCompleted] = useState(false);

  // 保存结果轻提示（成功/失败）
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState('');
  const [saveToastType, setSaveToastType] = useState<'success' | 'error'>('success');

  // 保存为模板对话框状态
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateTask, setTemplateTask] = useState<Task | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  const [templateDialogError, setTemplateDialogError] = useState<string | null>(null);

  // 图片预览状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // 成功提示状态
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // 是否保存为模板的额外状态
  const [isSaveAsTemplate, setIsSaveAsTemplate] = useState(false);
  const [showSaveAsTemplateDropdown, setShowSaveAsTemplateDropdown] = useState(false);
  const saveAsTemplateDropdownRef = useRef<HTMLDivElement>(null);

  /** 与 tasks 同步，供静默轮询闭包读取最新列表 */
  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    completedHasMoreRef.current = completedHasMore;
  }, [completedHasMore]);

  const sortTasksByCreatedDesc = (list: Task[]) =>
    [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  // 加载任务列表（「待保存」仅首屏分页 + saved_as_artwork=false；其余 Tab 仍拉全部分页；静默轮询只刷新「生成中」并合并已结束任务）
  const loadTasks = async (status?: TaskStatus, silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      if (silent && !status) {
        // 后台静默轮询模式：主要同步生成中的任务
        const prev = tasksRef.current;
        const newGen = await nanoBananaService.getTasksAllPages(TaskStatus.GENERATING);
        const prevGen = prev.filter(t => t.status === TaskStatus.GENERATING);
        const newGenIds = new Set(newGen.map(t => t.id));
        const disappeared = prevGen.filter(t => !newGenIds.has(t.id));

        let resolved: Task[] = [];
        if (disappeared.length > 0) {
          const results = await Promise.all(
            disappeared.map(t => nanoBananaService.getTaskById(t.id).catch(() => null))
          );
          resolved = results.filter((x): x is Task => x != null);
        }

        const nonGen = prev.filter(t => t.status !== TaskStatus.GENERATING);
        const byId = new Map<string, Task>();
        // 注意：合并顺序影响覆盖。newGen 和 resolved 应该覆盖 nonGen 中可能存在的旧记录
        [...nonGen, ...newGen, ...resolved].forEach(t => byId.set(t.id, t));
        const taskList = sortTasksByCreatedDesc(Array.from(byId.values()));
        setTasks(taskList);
      } else if (status === TaskStatus.COMPLETED) {
        // 拉取待保存列表（分页）
        const pageToLoad = 1; // 仅拉取第一页以进行静默更新或初始加载
        const taskList = await nanoBananaService.getTasks(
          TaskStatus.COMPLETED,
          pageToLoad,
          COMPLETED_TASKS_PAGE_SIZE,
          { savedAsArtwork: false }
        );

        if (!silent) {
          completedListPageRef.current = 1;
          sessionStorage.setItem(TASKS_COMPLETED_PAGE_KEY, '1');
          const hasMore = taskList.length >= COMPLETED_TASKS_PAGE_SIZE;
          sessionStorage.setItem(TASKS_COMPLETED_HAS_MORE_KEY, hasMore ? '1' : '0');
          setCompletedHasMore(hasMore);
          setTasks(sortTasksByCreatedDesc(taskList));
        } else {
          // 静默模式下合并第一页数据
          setTasks(prev => {
            const byId = new Map<string, Task>(prev.map(t => [t.id, t]));
            taskList.forEach(t => byId.set(t.id, t));
            return sortTasksByCreatedDesc(Array.from(byId.values()));
          });
        }
      } else if (status) {
        // 拉取指定状态的所有任务（针对 FAILED 或 GENERATING）
        if (!silent) setCompletedHasMore(false);
        const taskList = await nanoBananaService.getTasksAllPages(status);
        if (silent) {
          setTasks(prev => {
            const byId = new Map<string, Task>(prev.map(t => [t.id, t]));
            taskList.forEach(t => byId.set(t.id, t));
            return sortTasksByCreatedDesc(Array.from(byId.values()));
          });
        } else {
          setTasks(sortTasksByCreatedDesc(taskList));
        }
      } else {
        // 兜底：只拉取生成中的任务
        const taskList = await nanoBananaService.getTasksAllPages(TaskStatus.GENERATING);
        setTasks(sortTasksByCreatedDesc(taskList));
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.message || '加载任务列表失败');
      }
      console.error('Failed to load tasks:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  /** 初始化同步全量数据（针对新会话） */
  const bootstrapTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      // 并行请求：生成中、失败的所有任务，以及待保存的第一页
      const [genTasks, failedTasks, completedTasks] = await Promise.all([
        nanoBananaService.getTasksAllPages(TaskStatus.GENERATING),
        nanoBananaService.getTasksAllPages(TaskStatus.FAILED),
        nanoBananaService.getTasks(
          TaskStatus.COMPLETED,
          1,
          COMPLETED_TASKS_PAGE_SIZE,
          { savedAsArtwork: false }
        )
      ]);

      const all = [...genTasks, ...failedTasks, ...completedTasks];
      const byId = new Map<string, Task>();
      all.forEach(t => byId.set(t.id, t));
      const taskList = sortTasksByCreatedDesc(Array.from(byId.values()));

      // 设置 COMPLETED 状态的分页信息
      const hasMore = completedTasks.length >= COMPLETED_TASKS_PAGE_SIZE;
      completedListPageRef.current = 1;
      setCompletedHasMore(hasMore);
      sessionStorage.setItem(TASKS_COMPLETED_PAGE_KEY, '1');
      sessionStorage.setItem(TASKS_COMPLETED_HAS_MORE_KEY, hasMore ? '1' : '0');

      setTasks(taskList);
    } catch (err: any) {
      setError(err.message || '初始化任务列表失败');
      console.error('Bootstrap tasks failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // 监听 tasks 变化并缓存
  useEffect(() => {
    sessionStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  /** 挂载后待列表就绪再恢复滚动（从漫画详情返回时 loadTasks 会覆盖列表，需在拉取逻辑中跳过缓存场景） */
  useEffect(() => {
    if (scrollRestoredForMountRef.current) return;
    if (loading) return;
    const saved = sessionStorage.getItem(TASKS_SCROLL_KEY);
    if (saved === null || saved === '') {
      scrollRestoredForMountRef.current = true;
      return;
    }
    const y = parseInt(saved, 10);
    if (!Number.isFinite(y)) {
      scrollRestoredForMountRef.current = true;
      return;
    }
    const count = tasks.filter(t =>
      activeTab === TaskStatus.COMPLETED ? isPendingSaveTask(t) : t.status === activeTab
    ).length;
    if (count === 0) return;

    if (!scrollContainerRef.current) return;

    let cancelled = false;
    const apply = (markDone: boolean) => {
      if (cancelled) return;
      const node = scrollContainerRef.current;
      if (!node) return;
      node.scrollTop = y;
      if (markDone) scrollRestoredForMountRef.current = true;
    };

    apply(false);
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => apply(false));
    });
    const t1 = window.setTimeout(() => apply(false), 50);
    const t2 = window.setTimeout(() => apply(true), 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading, tasks, activeTab]);

  /** 「待保存」触底加载下一页 */
  const appendCompletedTasksPage = async () => {
    if (
      completedLoadMoreLockRef.current ||
      !completedHasMoreRef.current ||
      activeTabRef.current !== TaskStatus.COMPLETED
    ) {
      return;
    }
    completedLoadMoreLockRef.current = true;
    setLoadingMoreCompleted(true);
    const nextPage = completedListPageRef.current + 1;
    try {
      const batch = await nanoBananaService.getTasks(
        TaskStatus.COMPLETED,
        nextPage,
        COMPLETED_TASKS_PAGE_SIZE,
        { savedAsArtwork: false }
      );
      completedListPageRef.current = nextPage;
      sessionStorage.setItem(TASKS_COMPLETED_PAGE_KEY, String(nextPage));
      const more = batch.length >= COMPLETED_TASKS_PAGE_SIZE;
      sessionStorage.setItem(TASKS_COMPLETED_HAS_MORE_KEY, more ? '1' : '0');
      setCompletedHasMore(more);
      setTasks(prev => {
        const byId = new Map<string, Task>(prev.map(t => [t.id, t]));
        batch.forEach(t => byId.set(t.id, t));
        return sortTasksByCreatedDesc([...byId.values()]);
      });
    } catch (err: any) {
      console.error('Failed to load more completed tasks:', err);
    } finally {
      completedLoadMoreLockRef.current = false;
      setLoadingMoreCompleted(false);
    }
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    sessionStorage.setItem(TASKS_SCROLL_KEY, el.scrollTop.toString());

    if (
      activeTabRef.current !== TaskStatus.COMPLETED ||
      !completedHasMoreRef.current ||
      completedLoadMoreLockRef.current
    ) {
      return;
    }
    const threshold = 160;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      void appendCompletedTasksPage();
    }
  };

  // 初始加载和 tab 切换（从详情返回时「待保存」若 session 已有未保存作品列表则不再用第一页覆盖，以保留滚动与分页）
  useEffect(() => {
    const hasCache = !!sessionStorage.getItem(TASKS_CACHE_KEY);

    // 1. 如果完全没有缓存，执行全量初始化（Bootstrap）
    if (!hasCache) {
      void bootstrapTasks();
      return;
    }

    // 2. 如果有缓存，根据当前 Tab 决定加载策略
    if (activeTab === TaskStatus.COMPLETED) {
      const hasPendingSaveInList = tasksRef.current.some(isPendingSaveTask);
      if (hasPendingSaveInList) {
        // 复用分页信息
        const p = parseInt(sessionStorage.getItem(TASKS_COMPLETED_PAGE_KEY) || '1', 10);
        completedListPageRef.current = Number.isFinite(p) && p >= 1 ? p : 1;
        setCompletedHasMore(sessionStorage.getItem(TASKS_COMPLETED_HAS_MORE_KEY) !== '0');
        // 后台静默刷新第一页
        void loadTasks(TaskStatus.COMPLETED, true);
        return;
      }
    }

    // 对于其他 Tab 或 COMPLETED 缓存失效的情况，执行加载
    // 如果 tasks 已经有数据（来自 bootstrap 或缓存），则静默加载
    const useSilentInitial = tasks.length > 0;
    void loadTasks(activeTab, useSilentInitial);
  }, [activeTab]);

  // 轮询更新任务列表：只要有生成中的任务就持续轮询，以便在任意 Tab 下都能收到失败/完成状态并弹框
  useEffect(() => {
    const hasGenerating = tasks.some(t => t.status === TaskStatus.GENERATING);
    if (!hasGenerating) return;

    const interval = setInterval(() => {
      // 1. 始终静默同步生成中的任务状态流转
      void loadTasks(undefined, true);
      
      // 2. 如果当前在 COMPLETED 或 FAILED Tab，也顺便静默刷新该 Tab 的第一页/全量数据
      if (activeTabRef.current === TaskStatus.COMPLETED) {
        void loadTasks(TaskStatus.COMPLETED, true);
      } else if (activeTabRef.current === TaskStatus.FAILED) {
        void loadTasks(TaskStatus.FAILED, true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [tasks]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (releaseDropdownRef.current && !releaseDropdownRef.current.contains(event.target as Node)) {
        setShowReleaseDropdown(false);
      }
      if (saveAsTemplateDropdownRef.current && !saveAsTemplateDropdownRef.current.contains(event.target as Node)) {
        setShowSaveAsTemplateDropdown(false);
      }
    };

    if (showReleaseDropdown || showSaveAsTemplateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showReleaseDropdown]);

  // Tab切换
  const handleTabChange = (status: TaskStatus) => {
    setActiveTab(status);
    sessionStorage.setItem('tasks_activeTab', status);
  };

  /** 失败任务：跳转对应生图页并还原输入 */
  const handleRegenerateFromTask = async (task: Task) => {
    setError(null);
    try {
      if (task.task_type === 'comic') {
        const ci = task.comic_input;
        const pagesGuess = parseComicPagesFromUserPrompt(task.user_input_prompt);
        const resUp = (task.resolution || '2K').toString().trim().toUpperCase();
        navigate('/tools/comic-generation', {
          state: {
            regenerateFromTask: true,
            comicTitle: ci?.comic_title ?? task.task_name ?? '',
            characters: ci?.characters ?? '',
            plot: ci?.plot ?? '',
            pages: ci?.pages ?? pagesGuess ?? 6,
            generateCover: ci?.generate_cover ?? true,
            coverTitleMode: ci?.cover_title_mode,
            customCoverTitle: ci?.custom_cover_title,
            aspectRatio: task.aspect_ratio as AspectRatio,
            modelId: task.model_id,
            resolution: resUp === '4K' ? '4K' : '2K',
          },
        });
        return;
      }

      if (task.is_advanced) {
        navigate('/tools/advanced-creation', {
          state: {
            model_id: task.model_id,
            system_instruction: task.system_instruction ?? '',
            preFilledPrompt: task.user_input_prompt ?? '',
            aspectRatio: task.aspect_ratio,
            resolution: task.resolution,
            referenceImages:
              task.reference_images && task.reference_images.length > 0
                ? task.reference_images
                : undefined,
          },
        });
        return;
      }

      if (!task.template_id) {
        setError('该任务缺少模板信息，无法重新生成');
        return;
      }

      const tpl = await nanoBananaService.getTemplateById(task.template_id);
      navigate('/create', {
        state: {
          preSelectedTemplate: tpl,
          preFilledPrompt: task.user_input_prompt ?? '',
          aspectRatio: task.aspect_ratio,
          resolution: task.resolution,
          referenceImages:
            task.reference_images && task.reference_images.length > 0
              ? task.reference_images
              : undefined,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '无法重新生成，请稍后重试';
      setError(msg);
    }
  };

  // 预览图片
  const previewImage = (imageUrl: string) => {
    setPreviewImageUrl(imageUrl);
  };

  // 打开保存对话框
  const handleSaveClick = (task: Task) => {
    if (task.status !== TaskStatus.COMPLETED) {
      setError('只有已完成的任务才能保存');
      return;
    }
    if (task.saved_as_artwork) {
      setError('该任务已保存为作品');
      return;
    }
    setSelectedTask(task);
    setArtworkName('');
    setIsRelease(false);
    setShowReleaseDropdown(false);
    setIsSaveAsTemplate(false);
    setShowSaveAsTemplateDropdown(false);
    setTemplateName('');
    setTemplateDesc('');
    setDialogError(null);
    setShowSaveDialog(true);
  };

  // 保存作品
  const handleSave = async () => {
    if (!selectedTask || !artworkName.trim()) {
      setDialogError('作品名称不能为空');
      return;
    }

    if (isSaveAsTemplate && !templateName.trim()) {
      setDialogError('模板名称不能为空');
      return;
    }

    setDialogError(null);

    try {
      // 保存作品
      const artwork = await nanoBananaService.taskToArtwork(selectedTask.id);
      await nanoBananaService.saveArtwork(artwork.id, artworkName, isRelease);

      // 如果勾选了保存为模板
      if (isSaveAsTemplate) {
        await nanoBananaService.submitTaskAsTemplate(selectedTask.id, templateName.trim(), templateDesc.trim());
      }

      setShowSaveDialog(false);
      setSelectedTask(null);
      setArtworkName('');
      setIsRelease(false);
      setShowReleaseDropdown(false);
      setIsSaveAsTemplate(false);
      setTemplateName('');
      setTemplateDesc('');
      setDialogError(null);

      loadTasks(activeTab);
      window.dispatchEvent(new CustomEvent('artwork-generated'));

      let successMsg = isRelease ? '保存成功，已添加至我的作品并发布至广场' : '保存成功，已添加至我的作品';
      if (isSaveAsTemplate) {
        successMsg += '。模板已提交审核';
      }

      setSaveToastMessage(successMsg);
      setSaveToastType('success');
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2000);
    } catch (err: any) {
      const message = err.message || '操作失败';
      setDialogError(message);
      setSaveToastMessage(message);
      setSaveToastType('error');
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2000);
    }
  };

  // 打开「保存为模板」对话框（仅高阶生图完成任务）
  const handleSaveAsTemplateClick = (task: Task) => {
    setTemplateTask(task);
    setTemplateName('');
    setTemplateDesc('');
    setTemplateDialogError(null);
    setShowTemplateDialog(true);
  };

  // 提交模板
  const handleSubmitTemplate = async () => {
    if (!templateTask || !templateName.trim()) {
      setTemplateDialogError('模板名称不能为空');
      return;
    }
    setIsSubmittingTemplate(true);
    setTemplateDialogError(null);
    try {
      await nanoBananaService.submitTaskAsTemplate(templateTask.id, templateName.trim(), templateDesc.trim());
      setShowTemplateDialog(false);
      loadTasks(activeTab);
      setSaveToastMessage('模板已提交审核，审核通过后将对所有人可用');
      setSaveToastType('success');
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 3000);
    } catch (err: any) {
      setTemplateDialogError(err.message || '提交失败，请稍后重试');
    } finally {
      setIsSubmittingTemplate(false);
    }
  };

  // 点击删除按钮
  const handleDelete = (taskId: string) => {
    setTaskToDelete(taskId);
    setShowDeleteDialog(true);
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete;

    try {
      await nanoBananaService.deleteTask(id);
      // 本地移除即可：避免 loadTasks(COMPLETED) 只拉第一页导致已加载分页丢失、列表高度骤变从而滚动乱跳
      setTasks(prev => sortTasksByCreatedDesc(prev.filter(t => t.id !== id)));
      setShowDeleteDialog(false);
      setTaskToDelete(null);
    } catch (err: any) {
      setError(err.message || '删除任务失败');
      setShowDeleteDialog(false); // 出错也关闭框，或者保留看需求，这里先关闭
    }
  };

  // 仅当任务从「生成中」变为「失败」时弹框（进入页面时已有失败任务不弹）
  useEffect(() => {
    const currentTasks = tasks;
    const prevTasks = prevTasksRef.current;
    const shownSet = failedTaskIdsShownRef.current;

    // 仅当任务从「生成中」变为「失败」时弹框
    const newFailureFromGenerating = currentTasks.find(curr => {
      const prev = prevTasks.find(p => p.id === curr.id);
      return prev && prev.status === TaskStatus.GENERATING && curr.status === TaskStatus.FAILED;
    });

    if (newFailureFromGenerating && !shownSet.has(newFailureFromGenerating.id)) {
      shownSet.add(newFailureFromGenerating.id);
      setFailDialogTask(newFailureFromGenerating);
      setShowFailDialog(true);
    }

    // 仅当任务从「生成中」变为「完成」时提示成功
    const newSuccessFromGenerating = currentTasks.find(curr => {
      const prev = prevTasks.find(p => p.id === curr.id);
      return prev && prev.status === TaskStatus.GENERATING && curr.status === TaskStatus.COMPLETED;
    });

    if (newSuccessFromGenerating && !completedTaskIdsShownRef.current.has(newSuccessFromGenerating.id)) {
      completedTaskIdsShownRef.current.add(newSuccessFromGenerating.id);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 2000);
    }

    prevTasksRef.current = currentTasks;
  }, [tasks]);

  const tabs = useMemo(
    () => [
      { id: TaskStatus.GENERATING, label: t('tasks.tab_generating') },
      { id: TaskStatus.COMPLETED, label: t('tasks.tab_pending_save') },
      { id: TaskStatus.FAILED, label: t('tasks.tab_failed') }
    ],
    [t]
  );

  // 根据当前 Tab 过滤显示；待保存 Tab 仅显示 completed 且未保存为作品（与接口筛选一致，并防轮询合并进已保存任务）
  const displayTasks = tasks.filter(t =>
    activeTab === TaskStatus.COMPLETED ? isPendingSaveTask(t) : t.status === activeTab
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* 第一层：功能描述 */}
      <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-3 border-b border-slate-200 z-20 flex items-center">
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t('tasks.title')}</h1>
        </div>
      </div>

      {/* 第二层：Tab切换 */}
      <div className="flex-none bg-white border-b border-slate-200 z-10">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                ? 'text-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{tab.label}</span>
              </div>
              {/* 选中指示器 */}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 第三层：任务列表 */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {loading && displayTasks.length === 0 && !error ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : displayTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Icons.Image className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500">{t('tasks.empty')}</p>
          </div>
        ) : (
          <>
            {activeTab === TaskStatus.COMPLETED && (
              <div className="text-xs text-slate-500 text-center mb-2">
                {t('tasks.pending_save_hint')}
              </div>
            )}
            {displayTasks.map(task => {
              return (
              <div
                key={task.id}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden"
              >
                {/* 第一层：模板名称 / 高阶生图标识 */}
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {task.task_type === 'comic' ? (
                      <>
                        <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium">漫画任务</span>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {task.task_name || '漫画大师'}
                        </h3>
                      </>
                    ) : task.is_advanced ? (
                      <>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">高阶生图</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">模板生图</span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(task.created_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {/* 第二层：参考图片和生成图片 */}
                <div className="px-4 pb-3 space-y-2">
                  {/* 参考图片（如果有） */}
                  {task.user_input_prompt && (
                    <div>
                      <div className="text-xs text-slate-500 mt-1 mb-1">提示词</div>
                      <div className="text-sm text-slate-700 line-clamp-2">
                        {task.user_input_prompt}
                      </div>
                    </div>
                  )}

                  {/* 生成图片 */}
                  {task.status === TaskStatus.FAILED ? (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex flex-col items-center justify-center">
                      <div className="text-red-600 font-medium text-sm text-center">生成失败，豆子已退还</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-slate-500 mb-2">生成结果</div>
                      {task.status === TaskStatus.GENERATING && (
                        <div className="mt-3 mb-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                              {task.progress_phase || t('tasks.generating') || '正在生图...'}
                            </span>
                            <span className="text-xs font-bold text-indigo-600">{task.progress || 0}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(79,70,229,0.3)]"
                              style={{ width: `${task.progress || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      <div
                        className="relative w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
                        style={{ minHeight: '160px' }}
                        onClick={() => {
                          if (task.image_url) {
                            previewImage(task.image_url);
                          }
                        }}
                      >
                        {task.status === TaskStatus.GENERATING ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                            <div className="text-slate-500 text-sm">{task.progress_phase || '生成中...'}</div>
                          </div>
                        ) : task.status === TaskStatus.COMPLETED && task.image_url ? (
                          <img
                            src={task.thumbnail_url || task.image_url || ''}
                            alt="生成结果"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                            暂无图片
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 第三层：按钮区域 - 生成中的任务不显示按钮 */}
                {
                  task.status !== TaskStatus.GENERATING && (
                    <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-wrap">
                      {/* 漫画任务：查看详情按钮 */}
                      {task.status === TaskStatus.COMPLETED && task.task_type === 'comic' && (
                        <button
                          onClick={() => navigate(`/tasks/comic/${task.id}`)}
                          className="flex-1 py-2 rounded-lg font-medium text-xs bg-pink-500 hover:bg-pink-400 text-white transition-all active:scale-[0.98]"
                          style={{
                            boxShadow: '4px 4px 8px rgba(236, 72, 153, 0.3), -2px -2px 4px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          查看
                        </button>
                      )}

                      {/* 保存按钮（已完成且未保存为作品的任务仅可保存一次） */}
                      {task.status === TaskStatus.COMPLETED && !task.saved_as_artwork && (
                        <button
                          onClick={() => handleSaveClick(task)}
                          className="flex-1 py-2 rounded-lg font-medium text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98]"
                          style={{
                            boxShadow: '4px 4px 8px rgba(67, 56, 202, 0.3), -2px -2px 4px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          保存
                        </button>
                      )}

                      {task.status === TaskStatus.FAILED && (
                        <button
                          type="button"
                          onClick={() => void handleRegenerateFromTask(task)}
                          className="flex-1 py-2 rounded-lg font-medium text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98]"
                          style={{
                            boxShadow: '4px 4px 8px rgba(67, 56, 202, 0.3), -2px -2px 4px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          重新生成
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(task.id)}
                        className="flex-1 py-2 rounded-lg font-medium text-xs bg-red-500 hover:bg-red-600 text-white transition-all active:scale-[0.98]"
                        style={{
                          boxShadow: '4px 4px 8px rgba(239, 68, 68, 0.3), -2px -2px 4px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        }}
                      >
                        删除
                      </button>
                    </div>
                  )
                }
              </div>
            );
          })}
            {activeTab === TaskStatus.COMPLETED && loadingMoreCompleted && (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
              </div>
            )}
            {activeTab === TaskStatus.COMPLETED &&
              !completedHasMore &&
              displayTasks.length > 0 &&
              !loadingMoreCompleted && (
                <p className="text-center text-xs text-slate-400 py-3">没有更多了</p>
              )}
          </>
        )}
      </div>

      {/* 保存作品对话框 */}
      {
        showSaveDialog && selectedTask && (
          <>
            {/* 背景遮罩 */}
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => {
                setShowSaveDialog(false);
                setShowReleaseDropdown(false);
                setDialogError(null);
              }}
            />

            {/* 对话框 */}
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto">
              <div className="p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">保存作品</h3>

                {/* 作品名称输入框 */}
                <div className="space-y-2">
                  <label className="text-slate-600 text-sm font-medium">作品名称 *</label>
                  <input
                    type="text"
                    value={artworkName}
                    onChange={(e) => {
                      setArtworkName(e.target.value);
                      if (dialogError) {
                        setDialogError(null);
                      }
                    }}
                    placeholder="请输入作品名称"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-1 ${dialogError
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500'
                      }`}
                  />
                  {dialogError && (
                    <p className="text-red-600 text-sm mt-1">{dialogError}</p>
                  )}
                </div>

                {/* 是否发布下拉框 */}
                <div className="space-y-2">
                  <label className="text-slate-600 text-sm font-medium">是否发布</label>
                  <div className="relative" ref={releaseDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowReleaseDropdown(!showReleaseDropdown)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-left flex items-center justify-between text-slate-900"
                    >
                      <span className="text-sm">{isRelease ? '发布到广场' : '不发布'}</span>
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${showReleaseDropdown ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showReleaseDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setIsRelease(false);
                            setShowReleaseDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${!isRelease
                            ? 'bg-indigo-50 text-indigo-600 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          不发布
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRelease(true);
                            setShowReleaseDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${isRelease
                            ? 'bg-indigo-50 text-indigo-600 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          发布到广场
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 是否保存为模板下拉框（仅高阶生图任务且尚未保存为模板时显示） */}
                {selectedTask.is_advanced && !selectedTask.saved_as_template && selectedTask.task_type !== 'comic' && (
                  <div className="space-y-2">
                    <label className="text-slate-600 text-sm font-medium">是否保存为模板</label>
                    <div className="relative" ref={saveAsTemplateDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowSaveAsTemplateDropdown(!showSaveAsTemplateDropdown)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-left flex items-center justify-between text-slate-900"
                      >
                        <span className="text-sm">{isSaveAsTemplate ? '是' : '否'}</span>
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform ${showSaveAsTemplateDropdown ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showSaveAsTemplateDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSaveAsTemplate(false);
                              setShowSaveAsTemplateDropdown(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${!isSaveAsTemplate
                              ? 'bg-indigo-50 text-indigo-600 font-medium'
                              : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            否
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsSaveAsTemplate(true);
                              setShowSaveAsTemplateDropdown(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${isSaveAsTemplate
                              ? 'bg-indigo-50 text-indigo-600 font-medium'
                              : 'text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            是
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 模板相关表单项（仅在选择保存为模板时显示） */}
                {isSaveAsTemplate && (
                  <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                      <label className="text-slate-600 text-sm font-medium">模板名称 *</label>
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => {
                          setTemplateName(e.target.value);
                          if (dialogError) setDialogError(null);
                        }}
                        placeholder="给你的模板起个名字"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-1 ${dialogError === '模板名称不能为空' ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500'}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-slate-600 text-sm font-medium">模板描述（可选）</label>
                      <textarea
                        value={templateDesc}
                        onChange={(e) => setTemplateDesc(e.target.value)}
                        placeholder="简要描述这个模板的风格或用途"
                        rows={2}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:border-indigo-500 focus:ring-indigo-500 resize-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* 按钮组 */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setShowReleaseDropdown(false);
                      setDialogError(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      }

      {/* 删除确认对话框 */}
      {
        showDeleteDialog && (
          <>
            {/* 背景遮罩 */}
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => {
                setShowDeleteDialog(false);
                setTaskToDelete(null);
              }}
            />
            {/* 对话框 */}
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6">
              <h3 className="text-base font-bold text-slate-900 mb-2">确认删除</h3>
              <p className="text-slate-600 mb-6">确定要删除这个任务吗？此操作无法撤销。</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setTaskToDelete(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          </>
        )
      }


      {/* 保存结果轻提示 */}
      {showSaveToast && (
        <div
          className={`fixed top-12 left-1/2 -translate-x-1/2 px-8 py-3 rounded-md shadow-lg z-[70] animate-in fade-in slide-in-from-top-4 duration-200 min-w-[min(90vw,420px)] max-w-[calc(100vw-1rem)] flex items-center justify-center gap-2 bg-black/70 text-white`}
        >
          {saveToastType === 'success' ? (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <Icons.X className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{saveToastMessage}</span>
        </div>
      )}

      {/* 失败提示对话框 */}
      {
        showFailDialog && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => {
                setShowFailDialog(false);
                setFailDialogTask(null);
              }}
            />
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <Icons.X className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">生成失败</h3>
                <p className="text-slate-600 mb-4">生图失败，豆子已退还，可前往对应生图页修改后重试</p>
                <div className="flex flex-col gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      if (failDialogTask) void handleRegenerateFromTask(failDialogTask);
                      setShowFailDialog(false);
                      setFailDialogTask(null);
                    }}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
                  >
                    重新生成
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFailDialog(false);
                      setFailDialogTask(null);
                    }}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                  >
                    我知道了
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      }

      {/* 图片预览组件 */}
      {
        previewImageUrl && (
          <ImagePreview
            imageUrl={previewImageUrl}
            onClose={() => setPreviewImageUrl(null)}
          />
        )
      }

      {/* 生图成功提示 */}
      {showSuccessToast && (
        <Toast
          message={t('tasks.success')}
          type="success"
          onClose={() => setShowSuccessToast(false)}
        />
      )}
    </div>
  );
};

export default Tasks;
