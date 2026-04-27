import { redirect } from "next/navigation";

// 根路径直接跳转到"页面性能"，本期默认落地页
export default function RootPage(): never {
  redirect("/performance");
}
