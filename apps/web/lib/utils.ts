import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn canonical helper: clsx 合并 + tailwind-merge 消解类名冲突
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
