import React from 'react';
import { AspectRatio, Template, User, Artwork, GenerationStatus, ImageModel } from './types';

/** 漫画大师（自动漫画 / 重绘）允许的定价策略 ID，不含基础 Banana */
export const COMIC_MASTER_PRICING_STRATEGY_IDS = ['Banana2', 'BananaPro'] as const;

export function filterComicMasterImageModels(models: ImageModel[]): ImageModel[] {
  const allow = new Set<string>(COMIC_MASTER_PRICING_STRATEGY_IDS);
  return models.filter(m => allow.has(m.pricing_strategy_id));
}

// --- Icons (Inline SVGs for portability) ---
export const Icons = {
  Home: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  ),
  Grid: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
  ),
  PlusSquare: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>
  ),
  User: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  ),
  Image: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
  ),
  Sparkles: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M9 3v4" /><path d="M3 5h4" /><path d="M3 9h4" /></svg>
  ),
  Heart: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" /></svg>
  ),
  Zap: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
  ),
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
  ),
  Globe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
  ),
  ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
  ),
  Plus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  ),
  X: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  ),
  Send: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
  ),
  List: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>
  ),
  Ticket: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
  ),
  Tool: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
  ),
  ChevronLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m15 18-6-6 6-6" /></svg>
  ),
  ChevronRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m9 18 6-6-6-6" /></svg>
  ),
  Upload: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
  ),
  Settings: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12" /></svg>
  ),
};

// --- Config ---
export const DEFAULT_GENERATION_COST = 10;

// --- Mock Data ---

export const INITIAL_USER: User = {
  id: 'u_001',
  username: 'NeoArtist',
  avatar: 'https://picsum.photos/id/64/200/200',
  balance_beans: 50,
  is_new_user: false,
};

export const MOCK_TEMPLATES: Template[] = [
  {
    id: 't_001',
    name: '赛博朋克 2077',
    cover_image: 'https://picsum.photos/id/20/400/400',
    description: '未来主义的霓虹城市和高科技角色风格。',
    system_instruction: 'You are a concept artist for a Cyberpunk movie. Use neon colors, high contrast, rainy streets, and futuristic technology.',
    preset_prompt: 'cyberpunk style, neon lights, highly detailed, 8k resolution, cinematic lighting',
    tags: ['tag_001', 'tag_013', 'tag_023', 'tag_024'],
    use_count: 150,
    is_featured: true,
    pricing_strategy_id: 'BananaPro',
    reference_images: [],
    created_at: '2023-11-01T00:00:00Z',
    updated_at: '2023-11-01T00:00:00Z',
  },
  {
    id: 't_002',
    name: '吉卜力动漫',
    cover_image: 'https://picsum.photos/id/111/400/400',
    description: '受吉卜力工作室启发的治愈系动漫风格。',
    system_instruction: 'You are an anime background artist. Create lush landscapes, fluffy clouds, vibrant greens and blues, hand-painted texture.',
    preset_prompt: 'studio ghibli style, anime art, peaceful atmosphere, vibrant colors, masterpiece',
    tags: ['tag_002', 'tag_009', 'tag_017', 'tag_024'],
    use_count: 230,
    is_featured: true,
    pricing_strategy_id: 'BananaPro',
    reference_images: [],
    created_at: '2023-11-01T00:00:00Z',
    updated_at: '2023-11-01T00:00:00Z',
  },
  {
    id: 't_003',
    name: '古典油画',
    cover_image: 'https://picsum.photos/id/102/400/400',
    description: '经典的印象派油画质感。',
    system_instruction: 'You are a master oil painter like Van Gogh. Use thick brush strokes, impasto technique, rich colors.',
    preset_prompt: 'oil painting, thick brushstrokes, impressionist style, canvas texture, fine art',
    tags: ['tag_003', 'tag_010', 'tag_023', 'tag_024'],
    use_count: 85,
    is_featured: true,
    pricing_strategy_id: 'BananaPro',
    reference_images: [],
    created_at: '2023-11-01T00:00:00Z',
    updated_at: '2023-11-01T00:00:00Z',
  },
  {
    id: 't_004',
    name: '3D 渲染',
    cover_image: 'https://picsum.photos/id/250/400/400',
    description: '皮克斯风格的可爱 3D 角色设计。',
    system_instruction: 'You are a 3D modeler. Create cute, rounded characters with subsurface scattering, soft studio lighting, clay material.',
    preset_prompt: '3d render, c4d, blender, cute, chibi, soft lighting, 4k',
    tags: ['tag_005', 'tag_022', 'tag_023'],
    use_count: 120,
    is_featured: false,
    pricing_strategy_id: 'BananaPro',
    reference_images: [],
    created_at: '2023-11-01T00:00:00Z',
    updated_at: '2023-11-01T00:00:00Z',
  },
];

export const MOCK_ARTWORKS: Artwork[] = [
  {
    id: 'a_001',
    user_id: 'u_999',
    user_avatar: 'https://picsum.photos/id/1/100/100',
    user_name: 'Alice',
    template_id: 't_001',
    image_url: 'https://picsum.photos/id/26/600/600',
    artwork_name: '屋顶上的机器猫',
    user_input_prompt: 'A robot cat sitting on a roof',
    aspect_ratio: AspectRatio.SQUARE,
    resolution: '2K',
    is_release: true,
    likes_count: 124,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-26T10:00:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_002',
    user_id: 'u_888',
    user_avatar: 'https://picsum.photos/id/2/100/100',
    user_name: 'Bob',
    template_id: 't_002',
    image_url: 'https://picsum.photos/id/28/400/700',
    artwork_name: '天空之城',
    user_input_prompt: 'A flying castle in the sky',
    aspect_ratio: AspectRatio.PORTRAIT,
    resolution: '2K',
    is_release: true,
    likes_count: 89,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-25T14:30:00Z',
    is_liked: true,
    tags: []
  },
  {
    id: 'a_003',
    user_id: 'u_999',
    user_avatar: 'https://picsum.photos/id/1/100/100',
    user_name: 'Alice',
    template_id: 't_003',
    image_url: 'https://picsum.photos/id/29/800/600',
    artwork_name: '麦田日落',
    user_input_prompt: 'Sunset over a wheat field',
    aspect_ratio: AspectRatio.LANDSCAPE,
    resolution: '1K',
    is_release: false,
    likes_count: 45,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-24T09:15:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_004',
    user_id: 'u_777',
    user_avatar: 'https://picsum.photos/id/3/100/100',
    user_name: 'Charlie',
    template_id: 't_004',
    image_url: 'https://picsum.photos/id/30/400/400',
    artwork_name: '太空仓鼠',
    user_input_prompt: 'Cute hamster in a space suit',
    aspect_ratio: AspectRatio.SQUARE,
    resolution: '4K',
    is_release: true,
    likes_count: 232,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-24T08:00:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_005',
    user_id: 'u_666',
    user_avatar: 'https://picsum.photos/id/4/100/100',
    user_name: 'David',
    template_id: 't_001',
    image_url: 'https://picsum.photos/id/40/400/700',
    artwork_name: '赛博夜市小贩',
    user_input_prompt: 'Cyberpunk street food vendor at night',
    aspect_ratio: AspectRatio.PORTRAIT,
    resolution: '2K',
    is_release: true,
    likes_count: 56,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-23T20:20:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_006',
    user_id: 'u_888',
    user_avatar: 'https://picsum.photos/id/2/100/100',
    user_name: 'Bob',
    template_id: 't_002',
    image_url: 'https://picsum.photos/id/48/800/500',
    artwork_name: '图书馆巨树',
    user_input_prompt: 'Giant tree with a library inside',
    aspect_ratio: AspectRatio.LANDSCAPE,
    resolution: '2K',
    is_release: true,
    likes_count: 120,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-23T15:10:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_007',
    user_id: 'u_999',
    user_avatar: 'https://picsum.photos/id/1/100/100',
    user_name: 'Alice',
    template_id: 't_003',
    image_url: 'https://picsum.photos/id/54/400/600',
    artwork_name: '维多利亚女士',
    user_input_prompt: 'Portrait of a Victorian lady',
    aspect_ratio: AspectRatio.PORTRAIT,
    resolution: '1K',
    is_release: false,
    likes_count: 14,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-22T12:00:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_008',
    user_id: 'u_777',
    user_avatar: 'https://picsum.photos/id/3/100/100',
    user_name: 'Charlie',
    template_id: 't_004',
    image_url: 'https://picsum.photos/id/64/400/400',
    artwork_name: '吃饼干的毛茸怪',
    user_input_prompt: 'A fluffy blue monster eating cookies',
    aspect_ratio: AspectRatio.SQUARE,
    resolution: '4K',
    is_release: true,
    likes_count: 345,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-22T09:30:00Z',
    is_liked: false,
    tags: []
  },
  {
    id: 'a_009',
    user_id: 'u_555',
    user_avatar: 'https://picsum.photos/id/5/100/100',
    user_name: 'Eve',
    template_id: 't_001',
    image_url: 'https://picsum.photos/id/76/800/450',
    artwork_name: '火市殖民地着陆',
    user_input_prompt: 'Spaceship landing on Mars colony',
    aspect_ratio: AspectRatio.LANDSCAPE,
    resolution: '2K',
    is_release: true,
    likes_count: 78,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-21T18:45:00Z',
    is_liked: true,
    tags: []
  },
  {
    id: 'a_010',
    user_id: 'u_666',
    user_avatar: 'https://picsum.photos/id/4/100/100',
    user_name: 'David',
    template_id: 't_002',
    image_url: 'https://picsum.photos/id/88/400/650',
    artwork_name: '魔法少女变身',
    user_input_prompt: 'Magical girl transformation sequence',
    aspect_ratio: AspectRatio.PORTRAIT,
    resolution: '4K',
    is_release: true,
    likes_count: 199,
    status: GenerationStatus.COMPLETED,
    created_at: '2023-10-21T10:00:00Z',
    is_liked: false,
    tags: []
  }
];