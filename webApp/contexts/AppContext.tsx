import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Tag } from '../types';
import { nanoBananaService } from '../services/nanoBananaService';

interface AppContextType {
  globalTags: Tag[];
  isLoadingTags: boolean;
  refreshTags: () => Promise<void>;
  systemSettings: any;
  isLoadingSettings: boolean;
  refreshSettings: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [globalTags, setGlobalTags] = useState<Tag[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [systemSettings, setSystemSettings] = useState<any>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  const loadSettings = async () => {
    try {
      setIsLoadingSettings(true);
      const settings = await nanoBananaService.getPublicSettings();
      setSystemSettings(settings);
    } catch (error) {
      console.error('加载系统设置失败:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const loadTags = async () => {
    try {
      setIsLoadingTags(true);
      // 获取所有标签，按使用次数排序
      const tags = await nanoBananaService.getTags();
      setGlobalTags(tags);
      console.log('✅ 全局标签加载成功:', tags.length);
    } catch (error) {
      console.error('❌ 加载全局标签失败:', error);
      setGlobalTags([]);
    } finally {
      setIsLoadingTags(false);
    }
  };

  const refreshTags = async () => {
    await loadTags();
  };

  // App 初始化时加载标签和设置
  useEffect(() => {
    loadTags();
    loadSettings();
  }, []);

  return (
    <AppContext.Provider value={{
      globalTags,
      isLoadingTags,
      refreshTags,
      systemSettings,
      isLoadingSettings,
      refreshSettings: loadSettings
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
