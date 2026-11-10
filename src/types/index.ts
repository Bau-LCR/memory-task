export type Mode = 'personal' | 'service'
export interface Session { name: string; email: string; mode: Mode | null; demo: true }
export interface Folder { id: string; name: string; parentId: string | null }
export interface FileItem { id: string; name: string; size: number; type: string; folderId: string | null; addedAt: string }
export interface MemoryVersion { title: string; body: string; at: string }
export interface Memory {
  id: string; title: string; body: string; category: string; tags: string[]
  createdAt: string; updatedAt: string; versions: MemoryVersion[]
}
export interface MemoryInput { id?: string; title: string; body: string; category: string; tags: string[] }
export interface Activity { id: string; text: string; at: string }
