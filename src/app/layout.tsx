import "./globals.css";
import Link from "next/link";
export const metadata = { title: "Settle — pay when it's done", description: "Conditional escrow plugin for PayBox agents" };
export default function L({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>
    <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold">◆ Settle <span className="text-sm font-normal text-slate-400">pay when it&apos;s done</span></Link>
      <nav className="text-sm text-slate-400 flex gap-4"><a href="/plugin.json">Plugin contract</a><a href="https://github.com/Benito3262/settle-paybox">GitHub</a></nav>
    </header>
    <main className="max-w-5xl mx-auto px-5 pb-16">{children}</main></body></html>);
}
