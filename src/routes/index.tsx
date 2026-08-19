import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import App from "@/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "epicure — Grade 10 Study Hub & AI Assistant" },
      {
        name: "description",
        content:
          "Track grades, tasks, focus sessions and habits, and get AI help for studying, coding, writing, math and flashcards.",
      },
      { property: "og:title", content: "epicure — Grade 10 Study Hub & AI Assistant" },
      {
        property: "og:description",
        content:
          "Grades, deadlines, notes, focus timer and a multi-mode AI study assistant in one glassy workspace.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen bg-zinc-100" />;
  return <App />;
}
